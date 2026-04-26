// Unified AG Grid Enterprise view for review mode — handles tables, queries, dashboards, workflows

import { useState, useCallback, useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  ColDef,
  ColumnState,
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
import { AlertTriangle } from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { useClassificationStore } from "../../stores/classificationStore";

import type { ReviewResourceType, ReviewRow } from "./reviewTypes";
import { groupRowStyles, themeStyles } from "./reviewGridStyles";
import { buildReviewColumnDefs } from "./reviewColumns";
import { loadReviewData } from "./reviewLoader";
import { ReviewGridToolbar } from "./ReviewGridToolbar";
import { DetailLoading } from "../../components/ui/DetailStates";

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule]);

if (typeof window !== "undefined" && import.meta.env.VITE_AG_GRID_LICENSE_KEY) {
  LicenseManager.setLicenseKey(import.meta.env.VITE_AG_GRID_LICENSE_KEY);
}

export interface ReviewGridHandle {
  /** Returns item names currently visible after all grid filters are applied */
  getFilteredNames: () => string[];
  /** Returns all row data (unfiltered) */
  getAllRows: () => ReviewRow[];
  /** Force reload data from filesystem (and Supabase for dashboards) */
  reload: () => void;
}

export interface ReviewGridProps {
  resourceType: ReviewResourceType;
  folderPath: string;
  domainName: string;
  domainSlug?: string | null;
  onItemSelect?: (itemPath: string) => void;
  reviewMode?: boolean;
  onRowSelected?: (folderPath: string | null, folderName: string | null, rowData: ReviewRow | null) => void;
  onCellEdited?: (folderName: string, field: string, newValue: unknown) => void;
  modifiedRows?: Map<string, Partial<ReviewRow>>;
  onAddToDataModel?: (row: ReviewRow) => void;
  /** Pre-loaded rows — when provided, skip internal loadReviewData and use these instead */
  externalRows?: ReviewRow[];
  /** Enable cross-domain mode (adds Domain column) */
  crossDomain?: boolean;
  /** External sidebar filter — narrows rows by view + category/sub-category + (cross-domain) selected domains */
  sidebarFilter?: {
    view: "all" | "active" | "deleted" | "custom" | "configured" | "unconfigured";
    category: string | null;
    subCategory: string | null;
    domains?: string[];
  };
  /** Callback that hands the parent the full row list once loaded (for sidebar counts/categories) */
  onRowsLoaded?: (rows: ReviewRow[]) => void;
  /** Surfaced as a toolbar button — opens the dedicated full-screen review route */
  onOpenFullScreen?: () => void;
}

export const ReviewGrid = forwardRef<ReviewGridHandle, ReviewGridProps>(function ReviewGrid({
  resourceType,
  folderPath,
  domainName,
  domainSlug,
  onItemSelect,
  reviewMode = true,
  onRowSelected,
  onCellEdited,
  modifiedRows,
  onAddToDataModel,
  externalRows,
  crossDomain = false,
  sidebarFilter,
  onRowsLoaded,
  onOpenFullScreen,
}, ref) {
  const gridRef = useRef<AgGridReact>(null);
  const theme = useAppStore((s) => s.theme);
  const classificationValues = useClassificationStore((s) => s.values);

  const isTable = resourceType === "table";

  const [reloadKey, setReloadKey] = useState(0);

  useImperativeHandle(ref, () => ({
    getFilteredNames: () => {
      if (!gridRef.current?.api) return [];
      const names: string[] = [];
      gridRef.current.api.forEachNodeAfterFilterAndSort((node) => {
        if (node.data?.name) names.push(node.data.name);
      });
      return names;
    },
    getAllRows: () => rows,
    reload: () => setReloadKey((k) => k + 1),
  }));

  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quickFilterText, setQuickFilterText] = useState("");
  const [wrapSummary, setWrapSummary] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<"all" | "needs-review" | "modified" | "deleted">("all");

  // Update grid when modifiedRows changes (for detail panel edits)
  const modifiedRowsJson = useMemo(() => {
    if (!modifiedRows || modifiedRows.size === 0) return "";
    const obj: Record<string, unknown> = {};
    modifiedRows.forEach((v, k) => { obj[k] = v; });
    return JSON.stringify(obj);
  }, [modifiedRows]);

  useEffect(() => {
    if (!gridRef.current?.api || !modifiedRows || modifiedRows.size === 0 || rows.length === 0) return;

    const rowKey = isTable ? "name" : "folderName";
    let needsUpdate = false;
    modifiedRows.forEach((mods, key) => {
      const row = rows.find(r => r[rowKey] === key);
      if (row) {
        for (const [k, value] of Object.entries(mods)) {
          if (row[k as keyof ReviewRow] !== value) {
            needsUpdate = true;
            break;
          }
        }
      }
    });

    if (!needsUpdate) return;

    const updatedRows: ReviewRow[] = [];
    modifiedRows.forEach((mods, key) => {
      const original = rows.find(r => r[rowKey] === key);
      if (original) updatedRows.push({ ...original, ...mods });
    });

    if (updatedRows.length > 0) {
      gridRef.current.api.applyTransaction({ update: updatedRows });
      setRows(prevRows => prevRows.map(row => {
        const mods = modifiedRows.get(row[rowKey] as string);
        return mods ? { ...row, ...mods } : row;
      }));
    }
  }, [modifiedRowsJson, rows, isTable]);

  // Load data (skip if externalRows provided)
  useEffect(() => {
    if (externalRows) {
      setRows(externalRows);
      setLoading(false);
      return;
    }
    if (!folderPath) return;
    setLoading(true);
    setError(null);
    loadReviewData(folderPath, resourceType, domainSlug)
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load data"))
      .finally(() => setLoading(false));
  }, [folderPath, resourceType, domainSlug, reloadKey, externalRows]);

  // Notify parent of rows for sidebar counts
  useEffect(() => {
    if (onRowsLoaded) onRowsLoaded(rows);
  }, [rows, onRowsLoaded]);

  // Handle ESC key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) setIsFullscreen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  // Column definitions
  const columnDefs = useMemo<ColDef<ReviewRow>[]>(
    () => buildReviewColumnDefs(resourceType, { wrapSummary, reviewMode, classificationValues, crossDomain }),
    [resourceType, wrapSummary, reviewMode, classificationValues, crossDomain]
  );

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    filter: true,
    floatingFilter: true,
    tooltipShowDelay: 500,
    enableRowGroup: isTable,
    cellClass: "text-xs",
  }), [isTable]);

  const autoGroupColumnDef = useMemo<ColDef<ReviewRow>>(() => ({
    headerName: "Category",
    minWidth: 280,
    flex: 1,
    cellRendererParams: { suppressCount: false },
  }), []);

  const handleRowDoubleClicked = useCallback((event: { data: ReviewRow | undefined }) => {
    if (!event.data) return;
    if (reviewMode && onRowSelected) {
      onRowSelected(event.data.folderPath, isTable ? event.data.name : event.data.folderName, event.data);
    } else {
      onItemSelect?.(event.data.folderPath);
    }
  }, [reviewMode, onRowSelected, onItemSelect, isTable]);

  const handleRowClicked = useCallback((_event: RowClickedEvent<ReviewRow>) => {
    // Single click — no action (detail panel opens on double-click)
  }, []);

  const handleCellValueChanged = useCallback((event: CellValueChangedEvent<ReviewRow>) => {
    if (reviewMode && event.data && event.colDef.field && onCellEdited) {
      const base = isTable ? event.data.name : event.data.folderName;
      const key = crossDomain && event.data.domain ? `${event.data.domain}::${base}` : base;
      onCellEdited(key, event.colDef.field, event.newValue);
    }
  }, [reviewMode, onCellEdited, isTable, crossDomain]);

  const handlePasteEnd = useCallback((_event: PasteEndEvent<ReviewRow>) => {
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
          const value = rowNode.data?.[field as keyof ReviewRow];
          if (field && rowNode.data) {
            const base = isTable ? rowNode.data.name : rowNode.data.folderName;
            const key = crossDomain && rowNode.data.domain ? `${rowNode.data.domain}::${base}` : base;
            onCellEdited(key, field, value);
          }
        });
      }
    });
  }, [reviewMode, onCellEdited, isTable, crossDomain]);

  const mergedRows = useMemo(() => {
    if (!modifiedRows || modifiedRows.size === 0) return rows;
    return rows.map(row => {
      const base = isTable ? row.name : row.folderName;
      const key = crossDomain && row.domain ? `${row.domain}::${base}` : base;
      const mods = modifiedRows.get(key);
      return mods ? { ...row, ...mods } : row;
    });
  }, [rows, modifiedRows, isTable, crossDomain]);

  const getRowId = useCallback((params: GetRowIdParams<ReviewRow>) => {
    const base = isTable ? params.data.name : params.data.folderName;
    return crossDomain && params.data.domain ? `${params.data.domain}::${base}` : base;
  }, [isTable, crossDomain]);

  const getRowClass = useCallback((params: { node: { group?: boolean }; data?: ReviewRow }) => {
    const classes: string[] = [];
    if (params.node.group) classes.push("ag-group-row-custom");
    if (reviewMode && params.data) {
      const base = isTable ? params.data.name : params.data.folderName;
      const key = crossDomain && params.data.domain ? `${params.data.domain}::${base}` : base;
      if (modifiedRows?.has(key)) classes.push("ag-row-modified");
    }
    return classes.join(" ");
  }, [reviewMode, modifiedRows, isTable, crossDomain]);

  const rowClassRules = useMemo(() => ({
    "opacity-50": (params: { data?: ReviewRow }) => !!params.data?.isStale,
  }), []);

  // External filter — combines toolbar review filter + sidebar filter
  const sidebarActive = !!sidebarFilter && (
    sidebarFilter.view !== "all" ||
    !!sidebarFilter.category ||
    !!sidebarFilter.subCategory ||
    (sidebarFilter.domains?.length ?? 0) > 0
  );
  const isExternalFilterPresent = useCallback(() => {
    return reviewFilter !== "all" || sidebarActive;
  }, [reviewFilter, sidebarActive]);

  const doesExternalFilterPass = useCallback((node: { data?: ReviewRow }) => {
    if (!node.data) return true;
    // Toolbar review filter
    if (reviewFilter === "deleted" && !node.data.isStale) return false;
    if (reviewFilter === "needs-review" && node.data.action !== "To Review") return false;
    if (reviewFilter === "modified") {
      const key = isTable ? node.data.name : node.data.folderName;
      if (!modifiedRows?.has(key)) return false;
    }
    // Sidebar filter
    if (sidebarFilter) {
      const r = node.data;
      const isCustom = (r.name?.startsWith("custom_tbl_") ?? false);
      // Query rows use `category`; tables/dashboards/workflows use `dataCategory`
      const effectiveCategory = resourceType === "query"
        ? (r.category || r.dataCategory)
        : r.dataCategory;
      switch (sidebarFilter.view) {
        case "active":       if (r.isStale) return false; break;
        case "deleted":      if (!r.isStale) return false; break;
        case "custom":       if (!isCustom) return false; break;
        case "configured":   if (!effectiveCategory) return false; break;
        case "unconfigured": if (effectiveCategory) return false; break;
      }
      if (sidebarFilter.category && (effectiveCategory ?? "Uncategorized") !== sidebarFilter.category) return false;
      if (sidebarFilter.subCategory && (r.dataSubCategory ?? "—") !== sidebarFilter.subCategory) return false;
      if (sidebarFilter.domains && sidebarFilter.domains.length > 0) {
        if (!r.domain || !sidebarFilter.domains.includes(r.domain)) return false;
      }
    }
    return true;
  }, [reviewFilter, isTable, modifiedRows, sidebarFilter, resourceType]);

  // Re-run external filter when reviewFilter or sidebar changes
  useEffect(() => {
    gridRef.current?.api?.onFilterChanged();
  }, [reviewFilter, modifiedRows, sidebarFilter]);

  // Auto-apply default saved layout
  const lastAppliedPath = useRef<string | null>(null);

  const applyDefaultLayout = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;

    const defaultName = localStorage.getItem("tv-desktop-ag-grid-default-layout");
    if (!defaultName) return;

    try {
      const stored = localStorage.getItem("tv-desktop-ag-grid-layouts");
      if (!stored) return;
      const layouts = JSON.parse(stored);
      const layout = layouts[defaultName] as {
        columnState?: ColumnState[];
        filterModel?: Record<string, unknown>;
        rowGroupColumns?: string[];
      } | undefined;
      if (!layout?.columnState) return;

      api.applyColumnState({ state: layout.columnState, applyOrder: true });
      if (isTable && layout.rowGroupColumns?.length) {
        api.setRowGroupColumns(layout.rowGroupColumns);
      }
      if (layout.filterModel) {
        api.setFilterModel(layout.filterModel);
      }
    } catch { /* ignore */ }
  }, [isTable]);

  // Reset tracking when folderPath changes so layout re-applies
  useEffect(() => {
    lastAppliedPath.current = null;
  }, [folderPath]);

  // Apply after data loads
  useEffect(() => {
    if (loading || rows.length === 0) return;
    if (lastAppliedPath.current === folderPath) return;
    lastAppliedPath.current = folderPath;

    const timer = setTimeout(applyDefaultLayout, 50);
    return () => clearTimeout(timer);
  }, [loading, rows.length, folderPath, applyDefaultLayout]);

  // Also apply on first data rendered (catches fresh mount where useEffect timing may miss)
  const handleFirstDataRendered = useCallback(() => {
    if (lastAppliedPath.current === folderPath) return;
    lastAppliedPath.current = folderPath;
    applyDefaultLayout();
  }, [folderPath, applyDefaultLayout]);

  const getRowHeight = useCallback((params: { node: { group?: boolean } }) => {
    return params.node.group ? 44 : 36;
  }, []);

  if (loading) {
    return <DetailLoading />;
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
      {!reviewMode && isTable && (
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Data Models Index</h2>
          <p className="text-sm text-zinc-500">
            {domainName} • {rows.length} tables • {rows.length > 0 ? Math.round((rows.filter(t => t.hasOverview).length / rows.length) * 100) : 0}% documented
          </p>
        </div>
      )}

      {/* Toolbar */}
      <ReviewGridToolbar
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
        isTable={isTable}
        onOpenFullScreen={onOpenFullScreen}
      />

      {/* AG Grid */}
      <div
        className={`${theme === "dark" ? "ag-theme-alpine-dark" : "ag-theme-alpine"} flex-1 min-h-0 overflow-hidden`}
        style={{ width: "100%" }}
      >
        <style>{themeStyles}</style>
        <AgGridReact<ReviewRow>
          ref={gridRef}
          theme="legacy"
          rowData={mergedRows}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          autoGroupColumnDef={isTable ? autoGroupColumnDef : undefined}
          groupDisplayType={isTable ? (reviewMode ? "singleColumn" : "groupRows") : undefined}
          groupDefaultExpanded={isTable ? (reviewMode ? 0 : -1) : undefined}
          getRowHeight={isTable ? getRowHeight : undefined}
          animateRows={isTable}
          rowSelection={reviewMode ? "single" : "multiple"}
          onFirstDataRendered={handleFirstDataRendered}
          onRowDoubleClicked={handleRowDoubleClicked}
          onRowClicked={handleRowClicked}
          onCellValueChanged={handleCellValueChanged}
          getRowId={getRowId}
          getRowClass={isTable ? getRowClass : undefined}
          rowClassRules={rowClassRules}
          quickFilterText={quickFilterText}
          isExternalFilterPresent={isExternalFilterPresent}
          doesExternalFilterPass={doesExternalFilterPass}
          enableRangeSelection={true}
          suppressRowClickSelection={!reviewMode}
          onPasteEnd={isTable ? handlePasteEnd : undefined}
          enableBrowserTooltips={true}
          rowGroupPanelShow={isTable ? (reviewMode ? "never" : "always") : "never"}
          singleClickEdit={reviewMode}
          stopEditingWhenCellsLoseFocus={true}
          headerHeight={32}
          floatingFiltersHeight={28}
          autoSizeStrategy={{ type: "fitCellContents", skipHeader: false }}
          rowHeight={isTable ? undefined : 32}
          enableCellTextSelection={!isTable}
          suppressCellFocus={!isTable ? false : undefined}
          getContextMenuItems={(params) => {
            const custom: (MenuItemDef<ReviewRow> | "separator")[] = [];
            if (isTable && params.node?.data && onAddToDataModel) {
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
              ...(isTable ? ["separator" as const, "expandAll" as const, "contractAll" as const] : []),
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
