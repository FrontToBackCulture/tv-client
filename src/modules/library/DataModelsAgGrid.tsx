// src/modules/library/DataModelsAgGrid.tsx
// AG Grid Enterprise view for data models - full-featured table browser

import { useState, useCallback, useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  ColDef,
  GetRowIdParams,
  ModuleRegistry,
  AllCommunityModule,
  CellValueChangedEvent,
  RowClickedEvent,
  PasteEndEvent,
  MenuItemDef,
} from "ag-grid-community";
import { AllEnterpriseModule, LicenseManager } from "ag-grid-enterprise";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import { Loader2, AlertTriangle } from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { useClassificationStore } from "../../stores/classificationStore";

import type { TableInfo, DataModelsAgGridHandle, DataModelsAgGridProps } from "./dataModelsGridTypes";
export type { TableInfo, DataModelsAgGridHandle, DataModelsAgGridProps } from "./dataModelsGridTypes";
export { DROPDOWN_VALUES } from "../../lib/classificationValues";

import { groupRowStyles, themeStyles } from "./dataModelsGridStyles";
import { buildColumnDefs } from "./dataModelsGridColumns";
import { loadTablesData } from "./dataModelsGridLoader";
import { DataModelsGridToolbar } from "./DataModelsGridToolbar";

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule]);

if (typeof window !== "undefined" && import.meta.env.VITE_AG_GRID_LICENSE_KEY) {
  LicenseManager.setLicenseKey(import.meta.env.VITE_AG_GRID_LICENSE_KEY);
}

export const DataModelsAgGrid = forwardRef<DataModelsAgGridHandle, DataModelsAgGridProps>(function DataModelsAgGrid({
  dataModelsPath,
  domainName,
  onTableSelect,
  reviewMode = false,
  onRowSelected,
  onCellEdited,
  modifiedRows,
  onAddToDataModel,
}, ref) {
  const gridRef = useRef<AgGridReact>(null);
  const theme = useAppStore((s) => s.theme);
  const classificationValues = useClassificationStore((s) => s.values);

  useImperativeHandle(ref, () => ({
    getFilteredTableNames: () => {
      if (!gridRef.current?.api) return [];
      const names: string[] = [];
      gridRef.current.api.forEachNodeAfterFilterAndSort((node) => {
        if (node.data?.name) names.push(node.data.name);
      });
      return names;
    },
    getAllRows: () => tables,
  }));

  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quickFilterText, setQuickFilterText] = useState("");
  const [wrapSummary, setWrapSummary] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<"all" | "needs-review" | "modified">("all");

  // Update grid when modifiedRows changes (for detail panel edits)
  const modifiedRowsJson = useMemo(() => {
    if (!modifiedRows || modifiedRows.size === 0) return "";
    const obj: Record<string, unknown> = {};
    modifiedRows.forEach((v, k) => { obj[k] = v; });
    return JSON.stringify(obj);
  }, [modifiedRows]);

  useEffect(() => {
    if (!gridRef.current?.api || !modifiedRows || modifiedRows.size === 0 || tables.length === 0) return;

    let needsUpdate = false;
    modifiedRows.forEach((mods, tableName) => {
      const table = tables.find(t => t.name === tableName);
      if (table) {
        for (const [key, value] of Object.entries(mods)) {
          if (table[key as keyof TableInfo] !== value) {
            needsUpdate = true;
            break;
          }
        }
      }
    });

    if (!needsUpdate) return;

    const updatedRows: TableInfo[] = [];
    modifiedRows.forEach((mods, tableName) => {
      const original = tables.find(t => t.name === tableName);
      if (original) updatedRows.push({ ...original, ...mods });
    });

    if (updatedRows.length > 0) {
      gridRef.current.api.applyTransaction({ update: updatedRows });
      setTables(prevTables => prevTables.map(table => {
        const mods = modifiedRows.get(table.name);
        return mods ? { ...table, ...mods } : table;
      }));
    }
  }, [modifiedRowsJson, tables]);

  // Load tables data
  useEffect(() => {
    if (!dataModelsPath) return;
    setLoading(true);
    setError(null);
    loadTablesData(dataModelsPath)
      .then(setTables)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load tables"))
      .finally(() => setLoading(false));
  }, [dataModelsPath]);

  // Handle ESC key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) setIsFullscreen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  // Column definitions
  const columnDefs = useMemo<ColDef<TableInfo>[]>(
    () => buildColumnDefs({ wrapSummary, reviewMode, classificationValues }),
    [wrapSummary, reviewMode, classificationValues]
  );

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    filter: true,
    tooltipShowDelay: 500,
    enableRowGroup: true,
  }), []);

  const autoGroupColumnDef = useMemo<ColDef<TableInfo>>(() => ({
    headerName: "Category",
    minWidth: 280,
    flex: 1,
    cellRendererParams: { suppressCount: false },
  }), []);

  const handleRowDoubleClicked = useCallback((event: { data: TableInfo | undefined }) => {
    if (event.data) onTableSelect?.(event.data.path);
  }, [onTableSelect]);

  const handleRowClicked = useCallback((event: RowClickedEvent<TableInfo>) => {
    if (reviewMode && event.data && onRowSelected) {
      onRowSelected(event.data.path, event.data.name, event.data);
    }
  }, [reviewMode, onRowSelected]);

  const handleCellValueChanged = useCallback((event: CellValueChangedEvent<TableInfo>) => {
    if (reviewMode && event.data && event.colDef.field && onCellEdited) {
      onCellEdited(event.data.name, event.colDef.field, event.newValue);
    }
  }, [reviewMode, onCellEdited]);

  const handlePasteEnd = useCallback((_event: PasteEndEvent<TableInfo>) => {
    if (!reviewMode || !onCellEdited || !gridRef.current?.api) return;
    const cellRanges = gridRef.current.api.getCellRanges();
    if (!cellRanges || cellRanges.length === 0) return;
    cellRanges.forEach(range => {
      const startRow = Math.min(range.startRow?.rowIndex ?? 0, range.endRow?.rowIndex ?? 0);
      const endRow = Math.max(range.startRow?.rowIndex ?? 0, range.endRow?.rowIndex ?? 0);
      const columns = range.columns;
      for (let rowIdx = startRow; rowIdx <= endRow; rowIdx++) {
        const rowNode = gridRef.current?.api.getDisplayedRowAtIndex(rowIdx);
        if (!rowNode?.data) continue;
        columns.forEach(col => {
          const field = col.getColId();
          const value = rowNode.data?.[field as keyof TableInfo];
          if (field && rowNode.data) onCellEdited(rowNode.data.name, field, value);
        });
      }
    });
  }, [reviewMode, onCellEdited]);

  const mergedTables = useMemo(() => {
    if (!modifiedRows || modifiedRows.size === 0) return tables;
    return tables.map(table => {
      const mods = modifiedRows.get(table.name);
      return mods ? { ...table, ...mods } : table;
    });
  }, [tables, modifiedRows]);

  const getRowId = useCallback((params: GetRowIdParams<TableInfo>) => params.data.name, []);

  const getRowClass = useCallback((params: { node: { group?: boolean }; data?: TableInfo }) => {
    const classes: string[] = [];
    if (params.node.group) classes.push("ag-group-row-custom");
    if (reviewMode && params.data && modifiedRows?.has(params.data.name)) classes.push("ag-row-modified");
    return classes.join(" ");
  }, [reviewMode, modifiedRows]);

  const getRowHeight = useCallback((params: { node: { group?: boolean } }) => {
    return params.node.group ? 44 : 36;
  }, []);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={32} className="mx-auto mb-3 text-zinc-400 animate-spin" />
          <p className="text-sm text-zinc-500">Loading tables...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle size={32} className="mx-auto mb-3 text-red-500" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${isFullscreen ? "fixed inset-0 z-50 bg-zinc-50 dark:bg-zinc-950 p-4 flex flex-col" : "h-full flex flex-col"}`}>
      <style>{groupRowStyles}</style>

      {/* Header - hide in review mode since parent provides header */}
      {!reviewMode && (
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Data Models Index</h2>
          <p className="text-sm text-zinc-500">
            {domainName} • {tables.length} tables • {tables.length > 0 ? Math.round((tables.filter(t => t.hasOverview).length / tables.length) * 100) : 0}% documented
          </p>
        </div>
      )}

      {/* Toolbar */}
      <DataModelsGridToolbar
        gridRef={gridRef}
        domainName={domainName}
        reviewMode={reviewMode}
        quickFilterText={quickFilterText}
        setQuickFilterText={setQuickFilterText}
        wrapSummary={wrapSummary}
        setWrapSummary={setWrapSummary}
        isFullscreen={isFullscreen}
        setIsFullscreen={setIsFullscreen}
        reviewFilter={reviewFilter}
        setReviewFilter={setReviewFilter}
        modifiedRows={modifiedRows}
      />

      {/* AG Grid */}
      <div
        className={`${theme === "dark" ? "ag-theme-alpine-dark" : "ag-theme-alpine"} flex-1 min-h-0 overflow-hidden`}
        style={{ width: "100%", height: isFullscreen ? "100%" : "calc(100vh - 200px)" }}
      >
        <style>{themeStyles}</style>
        <AgGridReact<TableInfo>
          ref={gridRef}
          theme="legacy"
          rowData={mergedTables}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          autoGroupColumnDef={autoGroupColumnDef}
          groupDisplayType={reviewMode ? "singleColumn" : "groupRows"}
          groupDefaultExpanded={reviewMode ? 0 : -1}
          getRowHeight={getRowHeight}
          animateRows={true}
          rowSelection={reviewMode ? "single" : "multiple"}
          onRowDoubleClicked={handleRowDoubleClicked}
          onRowClicked={handleRowClicked}
          onCellValueChanged={handleCellValueChanged}
          getRowId={getRowId}
          getRowClass={getRowClass}
          quickFilterText={quickFilterText}
          enableRangeSelection={true}
          suppressRowClickSelection={!reviewMode}
          onPasteEnd={handlePasteEnd}
          enableBrowserTooltips={true}
          rowGroupPanelShow={reviewMode ? "never" : "always"}
          singleClickEdit={reviewMode}
          stopEditingWhenCellsLoseFocus={true}
          getContextMenuItems={(params) => {
            const custom: (MenuItemDef<TableInfo> | "separator")[] = [];
            if (params.node?.data && onAddToDataModel) {
              custom.push({
                name: "Add to Data Model...",
                action: () => onAddToDataModel(params.node!.data!),
              });
              custom.push("separator");
            }
            return [
              ...custom,
              "copy" as const,
              "copyWithHeaders" as const,
              "paste" as const,
              "separator" as const,
              "export" as const,
              "separator" as const,
              "autoSizeAll" as const,
              "resetColumns" as const,
              "separator" as const,
              "expandAll" as const,
              "contractAll" as const,
            ];
          }}
          sideBar={{
            toolPanels: [
              { id: "columns", labelDefault: "Columns", labelKey: "columns", iconKey: "columns", toolPanel: "agColumnsToolPanel" },
              { id: "filters", labelDefault: "Filters", labelKey: "filters", iconKey: "filter", toolPanel: "agFiltersToolPanel" },
            ],
            defaultToolPanel: "",
          }}
          statusBar={{
            statusPanels: [
              { statusPanel: "agTotalAndFilteredRowCountComponent", align: "left" },
              { statusPanel: "agSelectedRowCountComponent", align: "left" },
              { statusPanel: "agAggregationComponent", align: "right" },
            ],
          }}
          pagination={true}
          paginationPageSize={100}
          paginationPageSizeSelector={[50, 100, 200, 500]}
        />
      </div>
    </div>
  );
});
