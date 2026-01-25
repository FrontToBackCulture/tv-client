// src/modules/library/DataModelsAgGrid.tsx
// AG Grid Enterprise view for data models - full-featured table browser

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AgGridReact } from "ag-grid-react";
import {
  ColDef,
  ValueFormatterParams,
  ICellRendererParams,
  GetRowIdParams,
  ModuleRegistry,
  AllCommunityModule,
  ColumnState,
} from "ag-grid-community";
import { AllEnterpriseModule, LicenseManager } from "ag-grid-enterprise";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import {
  Search,
  Download,
  Maximize2,
  X,
  RotateCcw,
  Columns,
  WrapText,
  Loader2,
  AlertTriangle,
  FileSpreadsheet,
  Bookmark,
  ChevronsLeftRight,
} from "lucide-react";

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule]);

// Set license key from environment variable
if (typeof window !== "undefined" && import.meta.env.VITE_AG_GRID_LICENSE_KEY) {
  LicenseManager.setLicenseKey(import.meta.env.VITE_AG_GRID_LICENSE_KEY);
}

interface TableInfo {
  name: string;
  path: string;
  hasOverview: boolean;
  displayName: string | null;
  columnCount: number | null;
  dataType: string | null;
  dataCategory: string | null;
  dataSubCategory: string | null;
  rowCount: number | null;
  daysSinceCreated: number | null;
  daysSinceUpdate: number | null;
  usageStatus: string | null;
  suggestedName: string | null;
  dataSource: string | null;
  summaryShort: string | null;
  summaryFull: string | null;
  space: string | null;
  action: string | null;
}

interface DataModelsAgGridProps {
  dataModelsPath: string;
  domainName: string;
  onTableSelect?: (tablePath: string) => void;
}

// Name cell renderer with documentation indicator
const NameCellRenderer = (params: ICellRendererParams<TableInfo>) => {
  const data = params.data;
  if (!data) return null;

  return (
    <div className="flex items-center gap-2">
      {data.hasOverview ? (
        <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" title="Has overview" />
      ) : (
        <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="No overview" />
      )}
      <span className="font-medium">{data.displayName || data.name}</span>
    </div>
  );
};

// Status badge cell renderer
const StatusCellRenderer = (params: ICellRendererParams) => {
  const value = params.value;
  if (!value || value === "-") {
    return <span className="text-zinc-500">-</span>;
  }

  let className = "px-2 py-0.5 rounded text-xs font-medium ";
  switch (value) {
    case "In Use":
      className += "bg-green-900/30 text-green-400";
      break;
    case "Not Used":
      className += "bg-red-900/30 text-red-400";
      break;
    case "Historically Used":
      className += "bg-amber-900/30 text-amber-400";
      break;
    default:
      className += "bg-zinc-700 text-zinc-400";
  }

  return <span className={className}>{value}</span>;
};

// Action badge cell renderer
const ActionCellRenderer = (params: ICellRendererParams) => {
  const value = params.value;
  if (!value || value === "-" || value === "None") {
    return <span className="text-zinc-500">-</span>;
  }

  let className = "px-2 py-0.5 rounded text-xs font-medium ";
  switch (value) {
    case "To Review":
      className += "bg-blue-900/30 text-blue-400";
      break;
    case "To Delete":
      className += "bg-red-900/30 text-red-400";
      break;
    default:
      className += "bg-zinc-700 text-zinc-400";
  }

  return <span className={className}>{value}</span>;
};

// Days cell renderer with color coding
const DaysCellRenderer = (params: ICellRendererParams) => {
  const value = params.value;
  if (value === null || value === undefined) {
    return <span className="text-zinc-500">-</span>;
  }

  let className = "tabular-nums ";
  if (value <= 1) {
    className += "text-green-400";
  } else if (value <= 7) {
    className += "text-blue-400";
  } else if (value <= 30) {
    className += "text-amber-400";
  } else {
    className += "text-red-400";
  }

  return <span className={className}>{value}</span>;
};

// Tag style helper
const getTagStyle = (tag: string, type: string) => {
  if (type === "status") {
    switch (tag) {
      case "In Use": return "bg-green-900/40 text-green-400";
      case "Not Used": return "bg-red-900/40 text-red-400";
      case "Historically Used": return "bg-amber-900/40 text-amber-400";
      default: return "bg-zinc-700 text-zinc-400";
    }
  }
  if (type === "action") {
    switch (tag) {
      case "To Review": return "bg-blue-900/40 text-blue-400";
      case "To Delete": return "bg-red-900/40 text-red-400";
      default: return "bg-zinc-700 text-zinc-400";
    }
  }
  if (type === "category") return "bg-violet-900/40 text-violet-400";
  if (type === "subCategory") return "bg-indigo-900/40 text-indigo-400";
  if (type === "dataSource") return "bg-cyan-900/40 text-cyan-400";
  if (type === "dataType") return "bg-teal-900/40 text-teal-400";
  return "bg-zinc-700 text-zinc-400";
};

// Tags cell renderer
const TagsCellRenderer = (params: ICellRendererParams<TableInfo>) => {
  const data = params.data;
  if (!data) return null;

  const tags: { value: string; type: string }[] = [];
  const seenValues = new Set<string>();

  const addTag = (value: string | null, type: string) => {
    if (value && value !== "-" && !seenValues.has(value)) {
      if (type === "status" && value === "I Dunno") return;
      if (type === "action" && value === "None") return;
      seenValues.add(value);
      tags.push({ value, type });
    }
  };

  addTag(data.dataCategory, "category");
  addTag(data.dataSubCategory, "subCategory");
  addTag(data.dataSource, "dataSource");
  addTag(data.dataType, "dataType");
  addTag(data.usageStatus, "status");
  addTag(data.action, "action");

  if (tags.length === 0) {
    return <span className="text-zinc-500">-</span>;
  }

  return (
    <div className="flex flex-wrap gap-1 py-1">
      {tags.map((tag, index) => (
        <span
          key={index}
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${getTagStyle(tag.value, tag.type)}`}
        >
          {tag.value}
        </span>
      ))}
    </div>
  );
};

export function DataModelsAgGrid({ dataModelsPath, domainName, onTableSelect }: DataModelsAgGridProps) {
  const gridRef = useRef<AgGridReact>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quickFilterText, setQuickFilterText] = useState("");
  const [wrapSummary, setWrapSummary] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [savedLayouts, setSavedLayouts] = useState<Record<string, object>>({});
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newLayoutName, setNewLayoutName] = useState("");

  // Load saved layouts from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("tv-desktop-ag-grid-layouts");
    if (stored) {
      try {
        setSavedLayouts(JSON.parse(stored));
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  // Load tables data
  useEffect(() => {
    async function loadTables() {
      setLoading(true);
      setError(null);

      try {
        // Try to load from data-models-index.json first
        const indexPath = `${dataModelsPath}/data-models-index.json`;
        let loadedFromIndex = false;

        try {
          const content = await invoke<string>("read_file", { path: indexPath });
          const indexData = JSON.parse(content);

          // Only use index if it has tables array with data
          if (indexData.tables && Array.isArray(indexData.tables) && indexData.tables.length > 0) {
            // Map index data to TableInfo format
            const tableList: TableInfo[] = indexData.tables.map((t: Record<string, unknown>) => ({
              name: t.name as string,
              path: `${dataModelsPath}/table_${t.name}`,
              hasOverview: t.hasOverview as boolean || false,
              displayName: t.displayName as string | null,
              columnCount: t.columnCount as number | null,
              dataType: t.dataType as string | null,
              dataCategory: t.dataCategory as string | null,
              dataSubCategory: t.dataSubCategory as string | null,
              rowCount: t.rowCount as number | null,
              daysSinceCreated: t.daysSinceCreated as number | null,
              daysSinceUpdate: t.daysSinceUpdate as number | null,
              usageStatus: t.usageStatus as string | null,
              suggestedName: t.suggestedName as string | null,
              dataSource: t.dataSource as string | null,
              summaryShort: t.summaryShort as string | null,
              summaryFull: t.summaryFull as string | null,
              space: t.space as string | null,
              action: t.action as string | null,
            }));

            setTables(tableList);
            loadedFromIndex = true;
          }
        } catch {
          // Index file not found or invalid, will fall back to scanning
        }

        if (!loadedFromIndex) {
          // Fall back to scanning directories (replicates tv-app API logic)
          const entries = await invoke<Array<{ name: string; path: string; is_directory: boolean }>>(
            "list_directory",
            { path: dataModelsPath }
          );

          const tableDirs = entries.filter(
            (e) => e.is_directory && e.name.startsWith("table_")
          );

          const tableList: TableInfo[] = await Promise.all(
            tableDirs.map(async (dir) => {
              const tableName = dir.name.replace(/^table_/, "");
              let displayName: string | null = null;
              let hasOverview = false;
              let columnCount: number | null = null;
              let dataType: string | null = null;
              let dataCategory: string | null = null;
              let dataSubCategory: string | null = null;
              let rowCount: number | null = null;
              let daysSinceCreated: number | null = null;
              let daysSinceUpdate: number | null = null;
              let usageStatus: string | null = null;
              let action: string | null = null;
              let suggestedName: string | null = null;
              let dataSource: string | null = null;
              let summaryShort: string | null = null;
              let summaryFull: string | null = null;

              // Read definition_details.json
              try {
                const detailsContent = await invoke<string>("read_file", {
                  path: `${dir.path}/definition_details.json`,
                });
                const details = JSON.parse(detailsContent);
                // displayName is nested under meta
                displayName = details.meta?.displayName || null;
                // Health section
                if (details.health) {
                  if (details.health.rowCount !== undefined) {
                    rowCount = typeof details.health.rowCount === "number"
                      ? details.health.rowCount
                      : parseInt(details.health.rowCount, 10) || null;
                  }
                  if (details.health.daysSinceCreated !== undefined) {
                    daysSinceCreated = details.health.daysSinceCreated;
                  }
                  if (details.health.daysSinceUpdate !== undefined) {
                    daysSinceUpdate = details.health.daysSinceUpdate;
                  }
                }
                // Columns count
                if (details.columns) {
                  if (Array.isArray(details.columns)) {
                    columnCount = details.columns.length;
                  } else {
                    const systemCols = details.columns.system?.length || 0;
                    const customCols = details.columns.custom?.length || 0;
                    columnCount = systemCols + customCols;
                  }
                }
              } catch {
                // No details file
              }

              // Read overview.md for metadata
              try {
                const overviewContent = await invoke<string>("read_file", {
                  path: `${dir.path}/overview.md`,
                });
                hasOverview = true;

                // Parse markdown table for metadata
                const categoryMatch = overviewContent.match(/\| \*\*Data Category\*\* \| ([^|]+) \|/);
                if (categoryMatch) dataCategory = categoryMatch[1].trim();

                const subCategoryMatch = overviewContent.match(/\| \*\*Data Sub Category\*\* \| ([^|]+) \|/);
                if (subCategoryMatch) {
                  const val = subCategoryMatch[1].trim();
                  dataSubCategory = val === "-" ? null : val;
                }

                const sourceMatch = overviewContent.match(/\| \*\*Data Source\*\* \| ([^|]+) \|/);
                if (sourceMatch) {
                  const val = sourceMatch[1].trim();
                  dataSource = val === "-" ? null : val;
                }

                const statusMatch = overviewContent.match(/\| \*\*Usage Status\*\* \| ([^|]+) \|/);
                if (statusMatch) usageStatus = statusMatch[1].trim();

                const actionMatch = overviewContent.match(/\| \*\*Action\*\* \| ([^|]+) \|/);
                if (actionMatch) action = actionMatch[1].trim();
              } catch {
                // No overview file
              }

              // Read definition_analysis.json
              try {
                const analysisContent = await invoke<string>("read_file", {
                  path: `${dir.path}/definition_analysis.json`,
                });
                const analysis = JSON.parse(analysisContent);
                suggestedName = analysis.suggestedName || null;
                dataType = analysis.dataType || analysis.classification?.dataType || null;
                summaryShort = analysis.summary?.short || null;
                summaryFull = analysis.summary?.full || null;
                // Category from analysis can override if not found in overview
                if (!dataCategory && analysis.dataCategory) {
                  dataCategory = analysis.dataCategory;
                }
              } catch {
                // No analysis file
              }

              return {
                name: tableName,
                path: dir.path,
                hasOverview,
                displayName: displayName || suggestedName || tableName,
                columnCount,
                dataType,
                dataCategory,
                dataSubCategory,
                rowCount,
                daysSinceCreated,
                daysSinceUpdate,
                usageStatus,
                suggestedName,
                dataSource,
                summaryShort,
                summaryFull,
                space: null,
                action,
              };
            })
          );

          setTables(tableList);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load tables");
      } finally {
        setLoading(false);
      }
    }

    if (dataModelsPath) {
      loadTables();
    }
  }, [dataModelsPath]);

  // Handle ESC key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  // Column definitions
  const columnDefs = useMemo<ColDef<TableInfo>[]>(() => [
    {
      field: "displayName",
      headerName: "Name",
      cellRenderer: NameCellRenderer,
      minWidth: 220,
      flex: 2,
      filter: "agTextColumnFilter",
      enableRowGroup: false,
    },
    {
      field: "name",
      headerName: "Table ID",
      minWidth: 150,
      width: 150,
      cellClass: "text-xs font-mono text-zinc-500",
      filter: "agTextColumnFilter",
      hide: true,
      enableRowGroup: false,
    },
    {
      field: "suggestedName",
      headerName: "Suggested Name",
      minWidth: 180,
      flex: 1,
      filter: "agTextColumnFilter",
      enableRowGroup: false,
      hide: true,
    },
    {
      field: "dataSource",
      headerName: "Data Source",
      width: 120,
      filter: "agSetColumnFilter",
    },
    {
      field: "summaryShort",
      headerName: "Summary",
      minWidth: 200,
      flex: 2,
      filter: "agTextColumnFilter",
      cellClass: "text-xs text-zinc-400",
      enableRowGroup: false,
      wrapText: wrapSummary,
      autoHeight: wrapSummary,
      tooltipValueGetter: (params) => {
        const data = params.data as TableInfo | undefined;
        if (!data) return "";
        return data.summaryFull || data.summaryShort || "";
      },
    },
    {
      headerName: "Tags",
      minWidth: 240,
      flex: 2,
      cellRenderer: TagsCellRenderer,
      filter: "agTextColumnFilter",
      enableRowGroup: false,
      autoHeight: true,
      valueGetter: (params) => {
        const data = params.data as TableInfo | undefined;
        if (!data) return "";
        const tags: string[] = [];
        if (data.dataCategory) tags.push(data.dataCategory);
        if (data.dataSubCategory) tags.push(data.dataSubCategory);
        if (data.dataSource) tags.push(data.dataSource);
        if (data.usageStatus && data.usageStatus !== "I Dunno") tags.push(data.usageStatus);
        if (data.action && data.action !== "None") tags.push(data.action);
        return tags.join(", ");
      },
    },
    {
      field: "rowCount",
      headerName: "Rows",
      width: 90,
      type: "numericColumn",
      valueFormatter: (params: ValueFormatterParams) =>
        params.value != null ? params.value.toLocaleString() : "-",
      filter: "agNumberColumnFilter",
      enableRowGroup: false,
    },
    {
      field: "daysSinceCreated",
      headerName: "Created",
      width: 80,
      cellRenderer: DaysCellRenderer,
      filter: "agNumberColumnFilter",
      headerTooltip: "Days since last record created",
      enableRowGroup: false,
    },
    {
      field: "daysSinceUpdate",
      headerName: "Updated",
      width: 80,
      cellRenderer: DaysCellRenderer,
      filter: "agNumberColumnFilter",
      headerTooltip: "Days since last business date update",
      enableRowGroup: false,
    },
    {
      field: "dataCategory",
      headerName: "Category",
      width: 140,
      rowGroup: true,
      hide: false,
      filter: "agSetColumnFilter",
    },
    {
      field: "dataSubCategory",
      headerName: "Sub Category",
      width: 120,
      filter: "agSetColumnFilter",
    },
    {
      field: "usageStatus",
      headerName: "Status",
      width: 100,
      cellRenderer: StatusCellRenderer,
      filter: "agSetColumnFilter",
    },
    {
      field: "action",
      headerName: "Action",
      width: 90,
      cellRenderer: ActionCellRenderer,
      filter: "agSetColumnFilter",
    },
    {
      field: "space",
      headerName: "Space",
      width: 100,
      filter: "agSetColumnFilter",
      hide: true,
    },
  ], [wrapSummary]);

  // Default column definitions
  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    filter: true,
    tooltipShowDelay: 500,
    enableRowGroup: true,
  }), []);

  // Auto group column definition
  const autoGroupColumnDef = useMemo<ColDef<TableInfo>>(() => ({
    headerName: "Category",
    minWidth: 280,
    flex: 1,
    cellRendererParams: {
      suppressCount: false,
    },
  }), []);

  // Handle row double click to navigate
  const handleRowDoubleClicked = useCallback((event: { data: TableInfo | undefined }) => {
    if (event.data) {
      onTableSelect?.(event.data.path);
    }
  }, [onTableSelect]);

  // Get row ID
  const getRowId = useCallback((params: GetRowIdParams<TableInfo>) => params.data.name, []);

  // Style group rows differently
  const getRowClass = useCallback((params: { node: { group?: boolean } }) => {
    if (params.node.group) {
      return "ag-group-row-custom";
    }
    return "";
  }, []);

  // Make group rows taller
  const getRowHeight = useCallback((params: { node: { group?: boolean } }) => {
    return params.node.group ? 44 : 36;
  }, []);

  // Export to Excel
  const exportToExcel = useCallback(() => {
    gridRef.current?.api.exportDataAsExcel({
      fileName: `${domainName}-data-models.xlsx`,
      sheetName: "Data Models",
      allColumns: true,
      skipRowGroups: true,
    });
  }, [domainName]);

  // Export to CSV
  const exportToCsv = useCallback(() => {
    gridRef.current?.api.exportDataAsCsv({
      fileName: `${domainName}-data-models.csv`,
      allColumns: true,
      skipRowGroups: true,
    });
  }, [domainName]);

  // Apply flat layout
  const applyFlatLayout = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;

    // Clear row grouping
    api.setRowGroupColumns([]);

    const columnState = [
      { colId: "dataCategory", hide: false, pinned: "left" as const, width: 140 },
      { colId: "dataSubCategory", hide: false, pinned: "left" as const, width: 110 },
      { colId: "displayName", hide: false, pinned: null, width: 220 },
      { colId: "rowCount", hide: false, pinned: null, width: 80 },
      { colId: "daysSinceCreated", hide: false, pinned: null, width: 75 },
      { colId: "daysSinceUpdate", hide: false, pinned: null, width: 75 },
      { colId: "dataSource", hide: false, pinned: null, width: 110 },
      { colId: "usageStatus", hide: false, pinned: null, width: 95 },
      { colId: "action", hide: false, pinned: null, width: 85 },
      { colId: "ag-Grid-AutoColumn", hide: true },
      { colId: "name", hide: true },
      { colId: "suggestedName", hide: true },
      { colId: "summaryShort", hide: true },
      { colId: "tags", hide: false, pinned: null, width: 240 },
      { colId: "space", hide: true },
    ];

    api.applyColumnState({
      state: columnState,
      applyOrder: true,
    });

    api.applyColumnState({
      state: [
        { colId: "dataCategory", sort: "asc", sortIndex: 0 },
        { colId: "dataSubCategory", sort: "asc", sortIndex: 1 },
      ],
      defaultState: { sort: null },
    });
  }, []);

  // Reset layout
  const resetLayout = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;

    api.resetColumnState();
    api.setRowGroupColumns(["dataCategory"]);
  }, []);

  // Auto-size all columns
  const autoSizeAllColumns = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.autoSizeAllColumns();
  }, []);

  // Save current layout
  const saveCurrentLayout = useCallback((name: string) => {
    const api = gridRef.current?.api;
    if (!api || !name.trim()) return;

    const columnState = api.getColumnState();
    const rowGroupColumns = api.getRowGroupColumns().map(col => col.getColId());
    const filterModel = api.getFilterModel();

    const layout = {
      columnState,
      rowGroupColumns,
      filterModel,
      savedAt: new Date().toISOString(),
    };

    const newLayouts = { ...savedLayouts, [name.trim()]: layout };
    setSavedLayouts(newLayouts);
    localStorage.setItem("tv-desktop-ag-grid-layouts", JSON.stringify(newLayouts));

    setShowSaveDialog(false);
    setNewLayoutName("");
  }, [savedLayouts]);

  // Load a saved layout
  const loadLayout = useCallback((name: string) => {
    const api = gridRef.current?.api;
    if (!api) return;

    const layout = savedLayouts[name] as {
      columnState: ColumnState[];
      rowGroupColumns: string[];
      filterModel?: Record<string, unknown>;
    } | undefined;
    if (!layout) return;

    api.setRowGroupColumns([]);

    api.applyColumnState({
      state: layout.columnState,
      applyOrder: true,
    });

    if (layout.rowGroupColumns?.length > 0) {
      api.setRowGroupColumns(layout.rowGroupColumns);
    }

    if (layout.filterModel) {
      api.setFilterModel(layout.filterModel);
    } else {
      api.setFilterModel(null);
    }

    setShowLayoutMenu(false);
  }, [savedLayouts]);

  // Delete a saved layout
  const deleteLayout = useCallback((name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newLayouts = { ...savedLayouts };
    delete newLayouts[name];
    setSavedLayouts(newLayouts);
    localStorage.setItem("tv-desktop-ag-grid-layouts", JSON.stringify(newLayouts));
  }, [savedLayouts]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={32} className="mx-auto mb-3 text-zinc-600 animate-spin" />
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
    <div className={`${isFullscreen ? "fixed inset-0 z-50 bg-slate-50 dark:bg-zinc-950 p-4 flex flex-col" : "h-full flex flex-col"}`}>
      {/* Custom styles for AG Grid */}
      <style>{`
        .ag-group-row-custom {
          background-color: #27272a !important;
          font-weight: 600 !important;
          border-top: 2px solid #3f3f46 !important;
          border-bottom: 1px solid #3f3f46 !important;
        }
        .ag-group-row-custom .ag-group-value {
          font-size: 13px !important;
          font-weight: 700 !important;
          color: #2dd4bf !important;
        }
        .ag-group-row-custom .ag-group-child-count {
          font-weight: 500 !important;
          color: #71717a !important;
        }
        .ag-theme-alpine-dark .ag-row-odd:not(.ag-group-row-custom) {
          background-color: #1f1f23 !important;
        }
      `}</style>

      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-800 flex-shrink-0">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Data Models Index</h2>
        <p className="text-sm text-zinc-500">
          {domainName} • {tables.length} tables • {tables.length > 0 ? Math.round((tables.filter(t => t.hasOverview).length / tables.length) * 100) : 0}% documented
        </p>
      </div>

      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Quick filter..."
            value={quickFilterText}
            onChange={(e) => setQuickFilterText(e.target.value)}
            className="w-full px-3 py-2 pl-9 text-sm rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-teal-500"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={applyFlatLayout}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors"
            title="Apply flat layout with Category pinned left"
          >
            <Columns size={14} />
            Flat
          </button>
          <button
            onClick={resetLayout}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors"
            title="Reset to default grouped layout"
          >
            <RotateCcw size={14} />
            Reset
          </button>
          <button
            onClick={autoSizeAllColumns}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors"
            title="Auto-size all columns"
          >
            <ChevronsLeftRight size={14} />
            Fit
          </button>

          {/* Layouts dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowLayoutMenu(!showLayoutMenu)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors"
              title="Saved layouts"
            >
              <Bookmark size={14} />
              Layouts
            </button>
            {showLayoutMenu && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-slate-200 dark:border-zinc-700 z-50 py-1">
                <button
                  onClick={() => {
                    setShowLayoutMenu(false);
                    setShowSaveDialog(true);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700 flex items-center gap-2"
                >
                  <span className="text-green-600 dark:text-green-400">+</span>
                  Save current layout...
                </button>
                {Object.keys(savedLayouts).length > 0 && (
                  <>
                    <div className="border-t border-slate-200 dark:border-zinc-700 my-1" />
                    <div className="px-3 py-1 text-xs font-medium text-zinc-500">
                      Saved Layouts
                    </div>
                    {Object.keys(savedLayouts).map((name) => (
                      <div
                        key={name}
                        onClick={() => loadLayout(name)}
                        className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700 flex items-center justify-between cursor-pointer group"
                      >
                        <span className="truncate">{name}</span>
                        <button
                          onClick={(e) => deleteLayout(name, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500 dark:text-red-400"
                          title="Delete layout"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => setWrapSummary(!wrapSummary)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
              wrapSummary
                ? "border-teal-500 bg-teal-500/20 text-teal-600 dark:text-teal-400"
                : "border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700"
            }`}
            title={wrapSummary ? "Click to truncate text" : "Click to wrap text"}
          >
            <WrapText size={14} />
          </button>
          <button
            onClick={exportToCsv}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors"
            title="Export to CSV"
          >
            <Download size={14} />
            CSV
          </button>
          <button
            onClick={exportToExcel}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-500 transition-colors"
            title="Export to Excel"
          >
            <FileSpreadsheet size={14} />
            Excel
          </button>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
              isFullscreen
                ? "border-teal-500 bg-teal-500/20 text-teal-600 dark:text-teal-400"
                : "border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700"
            }`}
            title={isFullscreen ? "Exit fullscreen (ESC)" : "Enter fullscreen"}
          >
            {isFullscreen ? <X size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* AG Grid */}
      <div
        className="ag-theme-alpine-dark flex-1 min-h-0 overflow-hidden"
        style={{ width: "100%", height: isFullscreen ? "100%" : "calc(100vh - 200px)" }}
      >
        <style>{`
          .ag-theme-alpine-dark {
            --ag-background-color: #18181b;
            --ag-header-background-color: #27272a;
            --ag-odd-row-background-color: #1f1f23;
            --ag-row-hover-color: #3f3f46;
            --ag-border-color: #3f3f46;
            --ag-header-foreground-color: #a1a1aa;
            --ag-foreground-color: #e4e4e7;
            --ag-secondary-foreground-color: #71717a;
          }
          .ag-theme-alpine-dark .ag-row {
            cursor: pointer;
          }
          .ag-theme-alpine-dark .ag-header-cell-resize {
            pointer-events: auto !important;
            cursor: col-resize !important;
            z-index: 1 !important;
          }
          .ag-theme-alpine-dark .ag-header {
            pointer-events: auto !important;
          }
          .ag-theme-alpine-dark .ag-column-drop {
            pointer-events: auto !important;
          }
        `}</style>
        <AgGridReact<TableInfo>
          ref={gridRef}
          theme="legacy"
          rowData={tables}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          autoGroupColumnDef={autoGroupColumnDef}
          groupDisplayType="groupRows"
          groupDefaultExpanded={-1}
          getRowHeight={getRowHeight}
          animateRows={true}
          rowSelection="multiple"
          onRowDoubleClicked={handleRowDoubleClicked}
          getRowId={getRowId}
          getRowClass={getRowClass}
          quickFilterText={quickFilterText}
          enableRangeSelection={true}
          suppressRowClickSelection={true}
          enableBrowserTooltips={true}
          rowGroupPanelShow="always"
          getContextMenuItems={() => [
            "copy",
            "copyWithHeaders",
            "separator",
            "export",
            "separator",
            "autoSizeAll",
            "resetColumns",
            "separator",
            "expandAll",
            "contractAll",
          ]}
          sideBar={{
            toolPanels: [
              {
                id: "columns",
                labelDefault: "Columns",
                labelKey: "columns",
                iconKey: "columns",
                toolPanel: "agColumnsToolPanel",
              },
              {
                id: "filters",
                labelDefault: "Filters",
                labelKey: "filters",
                iconKey: "filter",
                toolPanel: "agFiltersToolPanel",
              },
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
        />
      </div>

      {/* Save Layout Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-xl p-6 w-96 max-w-[90vw] border border-slate-200 dark:border-zinc-700">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
              Save Layout
            </h3>
            <input
              type="text"
              value={newLayoutName}
              onChange={(e) => setNewLayoutName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newLayoutName.trim()) {
                  saveCurrentLayout(newLayoutName);
                } else if (e.key === "Escape") {
                  setShowSaveDialog(false);
                  setNewLayoutName("");
                }
              }}
              placeholder="Enter layout name..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-teal-500 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowSaveDialog(false);
                  setNewLayoutName("");
                }}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                onClick={() => saveCurrentLayout(newLayoutName)}
                disabled={!newLayoutName.trim()}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close layout menu */}
      {showLayoutMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowLayoutMenu(false)}
        />
      )}
    </div>
  );
}
