// src/modules/library/DataModelsAgGrid.tsx
// AG Grid Enterprise view for data models - full-featured table browser

import { useState, useCallback, useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
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
  CellValueChangedEvent,
  RowClickedEvent,
  PasteEndEvent,
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
  Filter,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { useAppStore } from "../../stores/appStore";

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule]);

// Set license key from environment variable
if (typeof window !== "undefined" && import.meta.env.VITE_AG_GRID_LICENSE_KEY) {
  LicenseManager.setLicenseKey(import.meta.env.VITE_AG_GRID_LICENSE_KEY);
}

export interface TableInfo {
  name: string;
  path: string;
  hasOverview: boolean;
  displayName: string | null;
  columnCount: number | null;
  calculatedColumnCount: number | null;
  dataType: string | null;
  dataCategory: string | null;
  dataSubCategory: string | null;
  rowCount: number | null;
  daysSinceCreated: number | null;
  daysSinceUpdate: number | null;
  usageStatus: string | null;
  suggestedName: string | null;
  dataSource: string | null;
  sourceSystem: string | null;
  summaryShort: string | null;
  summaryFull: string | null;
  space: string | null;
  action: string | null;
  tags: string | null;
  tableType: string | null;
  // Relationship counts
  workflowCount: number | null;
  scheduledWorkflowCount: number | null;
  queryCount: number | null;
  dashboardCount: number | null;
  // Timestamps
  lastSampleAt: string | null;
  lastDetailsAt: string | null;
  lastAnalyzeAt: string | null;
  lastOverviewAt: string | null;
}

export interface DataModelsAgGridHandle {
  /** Returns table names currently visible after all grid filters are applied */
  getFilteredTableNames: () => string[];
}

interface DataModelsAgGridProps {
  dataModelsPath: string;
  domainName: string;
  onTableSelect?: (tablePath: string) => void;
  // Review mode props
  reviewMode?: boolean;
  onRowSelected?: (tablePath: string | null, tableName: string | null, rowData: TableInfo | null) => void;
  onCellEdited?: (tableName: string, field: string, newValue: unknown) => void;
  modifiedRows?: Map<string, Partial<TableInfo>>;
}

// Re-export static defaults for consumers that need them
export { DROPDOWN_VALUES } from "../../lib/classificationValues";
import { useClassificationStore } from "../../stores/classificationStore";


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
      className += "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      break;
    case "Not Used":
      className += "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      break;
    case "Historically Used":
      className += "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
      break;
    case "I Dunno":
      className += "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400";
      break;
    default:
      className += "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400";
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
      className += "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      break;
    case "To Delete":
      className += "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      break;
    case "Approved":
      className += "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      break;
    default:
      className += "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400";
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

// Tag style helper - light and dark mode
const getTagStyle = (tag: string, type: string) => {
  if (type === "status") {
    switch (tag) {
      case "In Use": return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400";
      case "Not Used": return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400";
      case "Historically Used": return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400";
      case "I Dunno": return "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400";
      default: return "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400";
    }
  }
  if (type === "action") {
    switch (tag) {
      case "To Review": return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400";
      case "To Delete": return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400";
      case "Approved": return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400";
      default: return "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400";
    }
  }
  if (type === "category") return "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400";
  if (type === "subCategory") return "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400";
  if (type === "dataSource") return "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400";
  if (type === "dataType") return "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400";
  if (type === "tag") return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  return "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400";
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

  // Add actual tags from classification (comma-separated string)
  if (data.tags) {
    data.tags.split(",").forEach(tag => {
      const trimmed = tag.trim();
      if (trimmed) {
        addTag(trimmed, "tag");
      }
    });
  }

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

export const DataModelsAgGrid = forwardRef<DataModelsAgGridHandle, DataModelsAgGridProps>(function DataModelsAgGrid({
  dataModelsPath,
  domainName,
  onTableSelect,
  reviewMode = false,
  onRowSelected,
  onCellEdited,
  modifiedRows,
}, ref) {
  const gridRef = useRef<AgGridReact>(null);
  const theme = useAppStore((s) => s.theme);
  const classificationValues = useClassificationStore((s) => s.values);

  useImperativeHandle(ref, () => ({
    getFilteredTableNames: () => {
      if (!gridRef.current?.api) return [];
      const names: string[] = [];
      gridRef.current.api.forEachNodeAfterFilterAndSort((node) => {
        if (node.data?.name) {
          names.push(node.data.name);
        }
      });
      return names;
    },
  }));
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
  const [reviewFilter, setReviewFilter] = useState<"all" | "needs-review" | "modified">("all");

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

  // Update grid when modifiedRows changes (for detail panel edits)
  // Track a serialized version of modifiedRows to detect any change
  const modifiedRowsJson = useMemo(() => {
    if (!modifiedRows || modifiedRows.size === 0) return "";
    const obj: Record<string, unknown> = {};
    modifiedRows.forEach((v, k) => { obj[k] = v; });
    return JSON.stringify(obj);
  }, [modifiedRows]);

  useEffect(() => {
    if (!gridRef.current?.api || !modifiedRows || modifiedRows.size === 0 || tables.length === 0) {
      return;
    }

    // Check if tables already has the modified values (to prevent unnecessary updates)
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

    // Build updated rows for modified entries
    const updatedRows: TableInfo[] = [];
    modifiedRows.forEach((mods, tableName) => {
      const original = tables.find(t => t.name === tableName);
      if (original) {
        updatedRows.push({ ...original, ...mods });
      }
    });

    if (updatedRows.length > 0) {
      gridRef.current.api.applyTransaction({ update: updatedRows });

      // Also update tables state so values persist after modifiedRows is cleared
      setTables(prevTables => {
        return prevTables.map(table => {
          const mods = modifiedRows.get(table.name);
          return mods ? { ...table, ...mods } : table;
        });
      });
    }
  }, [modifiedRowsJson, tables]);

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
              calculatedColumnCount: t.calculatedColumnCount as number | null,
              dataType: t.dataType as string | null,
              dataCategory: t.dataCategory as string | null,
              dataSubCategory: t.dataSubCategory as string | null,
              rowCount: t.rowCount as number | null,
              daysSinceCreated: t.daysSinceCreated as number | null,
              daysSinceUpdate: t.daysSinceUpdate as number | null,
              usageStatus: t.usageStatus as string | null,
              suggestedName: t.suggestedName as string | null,
              dataSource: t.dataSource as string | null,
              sourceSystem: t.sourceSystem as string | null,
              summaryShort: t.summaryShort as string | null,
              summaryFull: t.summaryFull as string | null,
              space: t.space as string | null,
              action: t.action as string | null,
              tags: t.tags as string | null,
              tableType: t.tableType as string | null,
              workflowCount: t.workflowCount as number | null,
              scheduledWorkflowCount: t.scheduledWorkflowCount as number | null,
              queryCount: t.queryCount as number | null,
              dashboardCount: t.dashboardCount as number | null,
              lastSampleAt: t.lastSampleAt as string | null,
              lastDetailsAt: t.lastDetailsAt as string | null,
              lastAnalyzeAt: t.lastAnalyzeAt as string | null,
              lastOverviewAt: t.lastOverviewAt as string | null,
            }));

            // Supplement with timestamps from actual files (index may not have them)
            const tablesWithTimestamps = await Promise.all(
              tableList.map(async (table) => {
                let lastSampleAt = table.lastSampleAt;
                let lastDetailsAt = table.lastDetailsAt;
                let lastAnalyzeAt = table.lastAnalyzeAt;
                let lastOverviewAt = table.lastOverviewAt;

                // Read definition_sample.json for timestamp if not in index
                if (!lastSampleAt) {
                  try {
                    const sampleContent = await invoke<string>("read_file", {
                      path: `${table.path}/definition_sample.json`,
                    });
                    const sample = JSON.parse(sampleContent);
                    lastSampleAt = sample.meta?.sampledAt || null;
                  } catch {
                    // No sample file
                  }
                }

                // Read definition_details.json for timestamp if not in index
                if (!lastDetailsAt) {
                  try {
                    const detailsContent = await invoke<string>("read_file", {
                      path: `${table.path}/definition_details.json`,
                    });
                    const details = JSON.parse(detailsContent);
                    lastDetailsAt = details.meta?.generatedAt || null;
                  } catch {
                    // No details file
                  }
                }

                // Read definition_analysis.json for timestamp if not in index
                if (!lastAnalyzeAt) {
                  try {
                    const analysisContent = await invoke<string>("read_file", {
                      path: `${table.path}/definition_analysis.json`,
                    });
                    const analysis = JSON.parse(analysisContent);
                    lastAnalyzeAt = analysis.meta?.analyzedAt || null;
                  } catch {
                    // No analysis file
                  }
                }

                // Get overview.md file modified time if not in index
                if (!lastOverviewAt && table.hasOverview) {
                  try {
                    const fileInfo = await invoke<{ modified?: string }>("get_file_info", {
                      path: `${table.path}/overview.md`,
                    });
                    lastOverviewAt = fileInfo.modified || null;
                  } catch {
                    // Ignore
                  }
                }

                return {
                  ...table,
                  lastSampleAt,
                  lastDetailsAt,
                  lastAnalyzeAt,
                  lastOverviewAt,
                };
              })
            );

            setTables(tablesWithTimestamps);
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
              let calculatedColumnCount: number | null = null;
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
              let sourceSystem: string | null = null;
              let summaryShort: string | null = null;
              let summaryFull: string | null = null;
              let tags: string | null = null;
              let tableType: string | null = null;
              // Relationship counts
              let workflowCount: number | null = null;
              let scheduledWorkflowCount: number | null = null;
              let queryCount: number | null = null;
              let dashboardCount: number | null = null;
              // Timestamps
              let lastDetailsAt: string | null = null;
              let lastSampleAt: string | null = null;
              let lastAnalyzeAt: string | null = null;
              let lastOverviewAt: string | null = null;

              // Read definition_details.json
              try {
                const detailsContent = await invoke<string>("read_file", {
                  path: `${dir.path}/definition_details.json`,
                });
                const details = JSON.parse(detailsContent);
                // displayName is nested under meta
                displayName = details.meta?.displayName || null;
                // Table type from meta
                tableType = details.meta?.tableType || null;
                // Timestamp from meta
                lastDetailsAt = details.meta?.generatedAt || null;
                // Health section (rowCount comes from sample, not here)
                if (details.health) {
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
                    // Count calculated columns (have formula or isCalculated flag)
                    calculatedColumnCount = details.columns.filter(
                      (col: { formula?: string; isCalculated?: boolean }) =>
                        col.formula || col.isCalculated
                    ).length;
                  } else {
                    const systemCols = details.columns.system?.length || 0;
                    const customCols = details.columns.custom?.length || 0;
                    columnCount = systemCols + customCols;
                    // Count calculated from custom columns
                    if (details.columns.custom) {
                      calculatedColumnCount = details.columns.custom.filter(
                        (col: { formula?: string; isCalculated?: boolean }) =>
                          col.formula || col.isCalculated
                      ).length;
                    }
                  }
                }
                // Count relationships
                if (details.relationships) {
                  if (details.relationships.workflows && Array.isArray(details.relationships.workflows)) {
                    workflowCount = details.relationships.workflows.length;
                    scheduledWorkflowCount = details.relationships.workflows.filter(
                      (wf: { scheduled?: boolean }) => wf.scheduled === true
                    ).length;
                  }
                  if (details.relationships.queries && Array.isArray(details.relationships.queries)) {
                    queryCount = details.relationships.queries.length;
                  }
                  if (details.relationships.dashboards && Array.isArray(details.relationships.dashboards)) {
                    dashboardCount = details.relationships.dashboards.length;
                  }
                }
              } catch {
                // No details file
              }

              // Read definition_sample.json for timestamp + rowCount
              try {
                const sampleContent = await invoke<string>("read_file", {
                  path: `${dir.path}/definition_sample.json`,
                });
                const sample = JSON.parse(sampleContent);
                lastSampleAt = sample.meta?.sampledAt || null;
                if (sample.meta?.totalRowCount != null) {
                  rowCount = sample.meta.totalRowCount;
                }
              } catch {
                // No sample file
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
                // Timestamp from meta
                lastAnalyzeAt = analysis.meta?.analyzedAt || null;
                // Category from analysis can override if not found in overview
                if (!dataCategory && analysis.dataCategory) {
                  dataCategory = analysis.dataCategory;
                }
                // Sub Category from analysis if not found in overview
                if (!dataSubCategory && analysis.dataSubCategory) {
                  dataSubCategory = analysis.dataSubCategory;
                }
                // Usage Status from analysis if not found in overview
                if (!usageStatus && analysis.usageStatus) {
                  usageStatus = analysis.usageStatus;
                }
                // Action from analysis if not found in overview
                if (!action && analysis.action) {
                  action = analysis.action;
                }
                // Tags from analysis
                if (analysis.tags) {
                  tags = analysis.tags;
                }
                // Source System from analysis
                if (analysis.sourceSystem) {
                  sourceSystem = analysis.sourceSystem;
                }
              } catch {
                // No analysis file
              }

              // Get overview.md file modified time
              if (hasOverview) {
                try {
                  const fileInfo = await invoke<{ modified?: string }>("get_file_info", {
                    path: `${dir.path}/overview.md`,
                  });
                  lastOverviewAt = fileInfo.modified || null;
                } catch {
                  // Ignore
                }
              }

              return {
                name: tableName,
                path: dir.path,
                hasOverview,
                displayName: displayName || suggestedName || tableName,
                columnCount,
                calculatedColumnCount,
                dataType,
                dataCategory,
                dataSubCategory,
                rowCount,
                daysSinceCreated,
                daysSinceUpdate,
                usageStatus,
                suggestedName,
                dataSource,
                sourceSystem,
                summaryShort,
                summaryFull,
                space: null,
                action,
                tags,
                tableType,
                workflowCount,
                scheduledWorkflowCount,
                queryCount,
                dashboardCount,
                lastSampleAt,
                lastDetailsAt,
                lastAnalyzeAt,
                lastOverviewAt,
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
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
      cellEditorParams: {
        values: ["", ...classificationValues.dataSource],
      },
    },
    {
      field: "summaryShort",
      headerName: "Short Summary",
      minWidth: 200,
      flex: 1,
      filter: "agTextColumnFilter",
      cellClass: "text-xs text-zinc-400",
      enableRowGroup: false,
      wrapText: wrapSummary,
      autoHeight: wrapSummary,
      editable: reviewMode,
      cellEditor: "agLargeTextCellEditor",
      cellEditorParams: {
        maxLength: 500,
        rows: 3,
        cols: 50,
      },
      cellEditorPopup: true,
    },
    {
      field: "summaryFull",
      headerName: "Full Summary",
      minWidth: 300,
      flex: 2,
      filter: "agTextColumnFilter",
      cellClass: "text-xs text-zinc-400",
      enableRowGroup: false,
      wrapText: wrapSummary,
      autoHeight: wrapSummary,
      editable: reviewMode,
      cellEditor: "agLargeTextCellEditor",
      cellEditorParams: {
        maxLength: 2000,
        rows: 6,
        cols: 60,
      },
      cellEditorPopup: true,
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
        // Include actual tags
        if (data.tags) tags.push(data.tags);
        return tags.join(", ");
      },
      hide: reviewMode, // Hide tags in review mode - we show editable columns instead
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
      rowGroup: !reviewMode, // Don't group in review mode
      hide: false,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
      cellEditorParams: {
        values: ["", ...classificationValues.dataCategory],
      },
    },
    {
      field: "dataSubCategory",
      headerName: "Sub Category",
      width: 120,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
      cellEditorParams: {
        values: ["", ...classificationValues.dataSubCategory],
      },
    },
    {
      field: "usageStatus",
      headerName: "Status",
      width: 100,
      cellRenderer: reviewMode ? undefined : StatusCellRenderer, // Use default renderer when editable
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
      cellEditorParams: {
        values: ["", ...classificationValues.usageStatus],
      },
    },
    {
      field: "action",
      headerName: "Action",
      width: 100,
      cellRenderer: reviewMode ? undefined : ActionCellRenderer, // Use default renderer when editable
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
      cellEditorParams: {
        values: ["", ...classificationValues.action],
      },
    },
    {
      field: "dataType",
      headerName: "Table Type",
      width: 110,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
      cellEditorParams: {
        values: ["", ...classificationValues.dataType],
      },
      valueFormatter: (params: ValueFormatterParams) => {
        const val = params.value as string | null;
        if (!val) return "-";
        return val;
      },
    },
    {
      field: "sourceSystem",
      headerName: "Source System",
      width: 120,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
      cellEditorParams: {
        values: ["", ...classificationValues.sourceSystem],
      },
    },
    {
      field: "workflowCount",
      headerName: "Workflows",
      width: 90,
      type: "numericColumn",
      filter: "agNumberColumnFilter",
      headerTooltip: "Total number of workflows using this table",
      valueFormatter: (params: ValueFormatterParams) =>
        params.value != null ? String(params.value) : "-",
    },
    {
      field: "scheduledWorkflowCount",
      headerName: "Sched WFs",
      width: 90,
      type: "numericColumn",
      filter: "agNumberColumnFilter",
      headerTooltip: "Number of scheduled workflows using this table",
      valueFormatter: (params: ValueFormatterParams) =>
        params.value != null ? String(params.value) : "-",
    },
    {
      field: "queryCount",
      headerName: "Queries",
      width: 80,
      type: "numericColumn",
      filter: "agNumberColumnFilter",
      headerTooltip: "Number of queries using this table",
      valueFormatter: (params: ValueFormatterParams) =>
        params.value != null ? String(params.value) : "-",
    },
    {
      field: "dashboardCount",
      headerName: "Dashboards",
      width: 95,
      type: "numericColumn",
      filter: "agNumberColumnFilter",
      headerTooltip: "Number of dashboards using this table",
      valueFormatter: (params: ValueFormatterParams) =>
        params.value != null ? String(params.value) : "-",
    },
    {
      field: "columnCount",
      headerName: "Columns",
      width: 85,
      type: "numericColumn",
      filter: "agNumberColumnFilter",
      headerTooltip: "Total number of columns",
      valueFormatter: (params: ValueFormatterParams) =>
        params.value != null ? String(params.value) : "-",
    },
    {
      field: "calculatedColumnCount",
      headerName: "Calc Cols",
      width: 85,
      type: "numericColumn",
      filter: "agNumberColumnFilter",
      headerTooltip: "Number of calculated columns",
      valueFormatter: (params: ValueFormatterParams) =>
        params.value != null ? String(params.value) : "-",
    },
    {
      field: "lastSampleAt",
      headerName: "Last Sample",
      width: 140,
      filter: "agDateColumnFilter",
      headerTooltip: "Last time sample data was fetched",
      valueFormatter: (params: ValueFormatterParams) => {
        if (!params.value) return "-";
        try {
          const date = new Date(params.value);
          return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        } catch {
          return params.value;
        }
      },
    },
    {
      field: "lastDetailsAt",
      headerName: "Last Details",
      width: 140,
      filter: "agDateColumnFilter",
      headerTooltip: "Last time details were fetched",
      valueFormatter: (params: ValueFormatterParams) => {
        if (!params.value) return "-";
        try {
          const date = new Date(params.value);
          return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        } catch {
          return params.value;
        }
      },
    },
    {
      field: "lastAnalyzeAt",
      headerName: "Last Analyze",
      width: 140,
      filter: "agDateColumnFilter",
      headerTooltip: "Last time AI analysis was run",
      valueFormatter: (params: ValueFormatterParams) => {
        if (!params.value) return "-";
        try {
          const date = new Date(params.value);
          return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        } catch {
          return params.value;
        }
      },
    },
    {
      field: "lastOverviewAt",
      headerName: "Last Overview",
      width: 140,
      filter: "agDateColumnFilter",
      headerTooltip: "Last time overview.md was generated",
      valueFormatter: (params: ValueFormatterParams) => {
        if (!params.value) return "-";
        try {
          const date = new Date(params.value);
          return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        } catch {
          return params.value;
        }
      },
    },
    {
      field: "space",
      headerName: "Space",
      width: 100,
      filter: "agSetColumnFilter",
      hide: true,
    },
  ], [wrapSummary, reviewMode, classificationValues]);

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

  // Handle row single click for selection in review mode
  const handleRowClicked = useCallback((event: RowClickedEvent<TableInfo>) => {
    if (reviewMode && event.data && onRowSelected) {
      onRowSelected(event.data.path, event.data.name, event.data);
    }
  }, [reviewMode, onRowSelected]);

  // Handle cell value change in review mode
  const handleCellValueChanged = useCallback((event: CellValueChangedEvent<TableInfo>) => {
    if (reviewMode && event.data && event.colDef.field && onCellEdited) {
      onCellEdited(event.data.name, event.colDef.field, event.newValue);
    }
  }, [reviewMode, onCellEdited]);

  // Handle paste end - process all pasted cells
  const handlePasteEnd = useCallback((_event: PasteEndEvent<TableInfo>) => {
    if (!reviewMode || !onCellEdited || !gridRef.current?.api) return;

    // Get the pasted cell ranges
    const cellRanges = gridRef.current.api.getCellRanges();
    if (!cellRanges || cellRanges.length === 0) return;

    // Process each cell in the pasted range
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
          if (field && rowNode.data) {
            onCellEdited(rowNode.data.name, field, value);
          }
        });
      }
    });
  }, [reviewMode, onCellEdited]);

  // Merge modifiedRows into tables for display
  // This ensures grid reflects edits made in the detail panel
  const mergedTables = useMemo(() => {
    if (!modifiedRows || modifiedRows.size === 0) return tables;
    return tables.map(table => {
      const mods = modifiedRows.get(table.name);
      return mods ? { ...table, ...mods } : table;
    });
  }, [tables, modifiedRows]);

  // Get row ID
  const getRowId = useCallback((params: GetRowIdParams<TableInfo>) => params.data.name, []);

  // Style group rows and modified rows differently
  const getRowClass = useCallback((params: { node: { group?: boolean }; data?: TableInfo }) => {
    const classes: string[] = [];
    if (params.node.group) {
      classes.push("ag-group-row-custom");
    }
    // Highlight modified rows in review mode
    if (reviewMode && params.data && modifiedRows?.has(params.data.name)) {
      classes.push("ag-row-modified");
    }
    return classes.join(" ");
  }, [reviewMode, modifiedRows]);

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
        /* Light mode group rows */
        .ag-theme-alpine .ag-group-row-custom {
          background-color: #f1f5f9 !important;
          font-weight: 600 !important;
          border-top: 2px solid #e2e8f0 !important;
          border-bottom: 1px solid #e2e8f0 !important;
        }
        .ag-theme-alpine .ag-group-row-custom .ag-group-value {
          font-size: 13px !important;
          font-weight: 700 !important;
          color: #0d9488 !important;
        }
        .ag-theme-alpine .ag-group-row-custom .ag-group-child-count {
          font-weight: 500 !important;
          color: #64748b !important;
        }
        .ag-theme-alpine .ag-row-odd:not(.ag-group-row-custom) {
          background-color: #f8fafc !important;
        }
        /* Light mode modified row highlighting */
        .ag-theme-alpine .ag-row-modified {
          background-color: rgba(251, 191, 36, 0.15) !important;
        }
        .ag-theme-alpine .ag-row-modified.ag-row-odd {
          background-color: rgba(251, 191, 36, 0.2) !important;
        }
        .ag-theme-alpine .ag-row-modified:hover {
          background-color: rgba(251, 191, 36, 0.25) !important;
        }
        /* Light mode editable cell indicator */
        .ag-theme-alpine .ag-cell-editable {
          cursor: pointer;
        }
        .ag-theme-alpine .ag-cell-editable:hover {
          background-color: rgba(13, 148, 136, 0.1);
        }
        /* Dark mode group rows */
        .ag-theme-alpine-dark .ag-group-row-custom {
          background-color: #18181b !important;
          font-weight: 600 !important;
          border-top: 2px solid #27272a !important;
          border-bottom: 1px solid #27272a !important;
        }
        .ag-theme-alpine-dark .ag-group-row-custom .ag-group-value {
          font-size: 13px !important;
          font-weight: 700 !important;
          color: #2dd4bf !important;
        }
        .ag-theme-alpine-dark .ag-group-row-custom .ag-group-child-count {
          font-weight: 500 !important;
          color: #52525b !important;
        }
        .ag-theme-alpine-dark .ag-row-odd:not(.ag-group-row-custom) {
          background-color: #0f0f12 !important;
        }
        /* Dark mode modified row highlighting */
        .ag-theme-alpine-dark .ag-row-modified {
          background-color: rgba(251, 191, 36, 0.1) !important;
        }
        .ag-theme-alpine-dark .ag-row-modified.ag-row-odd {
          background-color: rgba(251, 191, 36, 0.12) !important;
        }
        .ag-theme-alpine-dark .ag-row-modified:hover {
          background-color: rgba(251, 191, 36, 0.18) !important;
        }
        /* Dark mode editable cell indicator */
        .ag-theme-alpine-dark .ag-cell-editable {
          cursor: pointer;
        }
        .ag-theme-alpine-dark .ag-cell-editable:hover {
          background-color: rgba(45, 212, 191, 0.08);
        }
      `}</style>

      {/* Header - hide in review mode since parent provides header */}
      {!reviewMode && (
        <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-800 flex-shrink-0">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Data Models Index</h2>
          <p className="text-sm text-zinc-500">
            {domainName} • {tables.length} tables • {tables.length > 0 ? Math.round((tables.filter(t => t.hasOverview).length / tables.length) * 100) : 0}% documented
          </p>
        </div>
      )}

      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
        {/* Left side: Search and filters */}
        <div className="flex items-center gap-3 flex-1">
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

          {/* Review filter buttons - only show in review mode */}
          {reviewMode && (
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-900 rounded-lg p-1">
              <button
                onClick={() => {
                  setReviewFilter("all");
                  gridRef.current?.api.setFilterModel(null);
                }}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors",
                  reviewFilter === "all"
                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                )}
              >
                All
              </button>
              <button
                onClick={() => {
                  setReviewFilter("needs-review");
                  gridRef.current?.api.setFilterModel({
                    action: {
                      filterType: "set",
                      values: ["To Review"],
                    },
                  });
                }}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors",
                  reviewFilter === "needs-review"
                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                )}
              >
                <Filter size={12} />
                Needs Review
              </button>
              <button
                onClick={() => {
                  setReviewFilter("modified");
                  // Can't directly filter by modified in AG Grid, show all and let visual highlighting work
                  gridRef.current?.api.setFilterModel(null);
                }}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors",
                  reviewFilter === "modified"
                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                )}
              >
                Modified ({modifiedRows?.size || 0})
              </button>
            </div>
          )}
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

          {/* Hide these buttons in review mode - parent handles export */}
          {!reviewMode && (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* AG Grid */}
      <div
        className={`${theme === "dark" ? "ag-theme-alpine-dark" : "ag-theme-alpine"} flex-1 min-h-0 overflow-hidden`}
        style={{ width: "100%", height: isFullscreen ? "100%" : "calc(100vh - 200px)" }}
      >
        <style>{`
          /* Light mode */
          .ag-theme-alpine {
            --ag-background-color: #ffffff;
            --ag-header-background-color: #f8fafc;
            --ag-odd-row-background-color: #f8fafc;
            --ag-row-hover-color: #f1f5f9;
            --ag-border-color: #e2e8f0;
            --ag-header-foreground-color: #475569;
            --ag-foreground-color: #1e293b;
            --ag-secondary-foreground-color: #64748b;
          }
          .ag-theme-alpine .ag-row {
            cursor: pointer;
          }
          .ag-theme-alpine .ag-header-cell-resize {
            pointer-events: auto !important;
            cursor: col-resize !important;
            z-index: 1 !important;
          }
          .ag-theme-alpine .ag-header {
            pointer-events: auto !important;
          }
          .ag-theme-alpine .ag-column-drop {
            pointer-events: auto !important;
          }
          /* Dark mode - core variables */
          .ag-theme-alpine-dark {
            --ag-background-color: #09090b;
            --ag-header-background-color: #18181b;
            --ag-odd-row-background-color: #0f0f12;
            --ag-row-hover-color: #1c1c20;
            --ag-border-color: #27272a;
            --ag-header-foreground-color: #a1a1aa;
            --ag-foreground-color: #d4d4d8;
            --ag-secondary-foreground-color: #71717a;
            --ag-selected-row-background-color: rgba(20, 184, 166, 0.12);
            --ag-range-selection-background-color: rgba(20, 184, 166, 0.15);
            --ag-range-selection-border-color: #14b8a6;
            --ag-input-focus-border-color: #14b8a6;
            --ag-checkbox-checked-color: #14b8a6;
            --ag-row-border-color: #1e1e22;
            --ag-control-panel-background-color: #0f0f12;
            --ag-side-button-selected-background-color: #18181b;
            --ag-column-hover-color: rgba(20, 184, 166, 0.06);
            --ag-input-border-color: #3f3f46;
            --ag-invalid-color: #ef4444;
            --ag-chip-background-color: #27272a;
            --ag-modal-overlay-background-color: rgba(0, 0, 0, 0.5);
            --ag-popup-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
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
            background-color: #18181b !important;
            border-bottom: 1px solid #27272a !important;
          }
          .ag-theme-alpine-dark .ag-column-drop-cell {
            background-color: #27272a !important;
            border: 1px solid #3f3f46 !important;
            color: #a1a1aa !important;
          }
          /* Dark mode - filter popups */
          .ag-theme-alpine-dark .ag-popup,
          .ag-theme-alpine-dark .ag-menu {
            background-color: #18181b !important;
            border: 1px solid #27272a !important;
          }
          .ag-theme-alpine-dark .ag-filter-toolpanel,
          .ag-theme-alpine-dark .ag-filter {
            background-color: #18181b !important;
          }
          .ag-theme-alpine-dark .ag-text-field-input,
          .ag-theme-alpine-dark .ag-select .ag-picker-field-wrapper {
            background-color: #09090b !important;
            border-color: #3f3f46 !important;
            color: #d4d4d8 !important;
          }
          .ag-theme-alpine-dark .ag-text-field-input:focus {
            border-color: #14b8a6 !important;
          }
          /* Dark mode - sidebar panels */
          .ag-theme-alpine-dark .ag-side-bar {
            background-color: #0f0f12 !important;
            border-left: 1px solid #27272a !important;
          }
          .ag-theme-alpine-dark .ag-side-buttons {
            background-color: #0f0f12 !important;
          }
          .ag-theme-alpine-dark .ag-side-button-button {
            color: #71717a !important;
          }
          .ag-theme-alpine-dark .ag-side-button-button:hover {
            color: #a1a1aa !important;
          }
          .ag-theme-alpine-dark .ag-tool-panel-wrapper {
            background-color: #0f0f12 !important;
            border-right: 1px solid #27272a !important;
          }
          .ag-theme-alpine-dark .ag-column-select-header {
            border-bottom: 1px solid #27272a !important;
          }
          /* Dark mode - status bar */
          .ag-theme-alpine-dark .ag-status-bar {
            background-color: #18181b !important;
            border-top: 1px solid #27272a !important;
            color: #71717a !important;
          }
          .ag-theme-alpine-dark .ag-paging-panel {
            background-color: #18181b !important;
            color: #71717a !important;
            border-top: 1px solid #27272a !important;
          }
          .ag-theme-alpine-dark .ag-paging-button {
            color: #a1a1aa !important;
          }
          /* Dark mode - cell editors */
          .ag-theme-alpine-dark .ag-cell-edit-wrapper,
          .ag-theme-alpine-dark .ag-cell-editor {
            background-color: #18181b !important;
          }
          .ag-theme-alpine-dark .ag-cell-inline-editing {
            background-color: #18181b !important;
            border-color: #14b8a6 !important;
          }
          .ag-theme-alpine-dark .ag-rich-select {
            background-color: #18181b !important;
          }
          .ag-theme-alpine-dark .ag-rich-select-row {
            color: #d4d4d8 !important;
          }
          .ag-theme-alpine-dark .ag-rich-select-row-selected {
            background-color: rgba(20, 184, 166, 0.15) !important;
          }
          .ag-theme-alpine-dark .ag-rich-select-row:hover {
            background-color: #27272a !important;
          }
          /* Dark mode - context menu */
          .ag-theme-alpine-dark .ag-menu-option-active {
            background-color: #27272a !important;
          }
          .ag-theme-alpine-dark .ag-menu-separator {
            border-color: #27272a !important;
          }
          /* Dark mode - scrollbar */
          .ag-theme-alpine-dark ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
          }
          .ag-theme-alpine-dark ::-webkit-scrollbar-track {
            background: #09090b;
          }
          .ag-theme-alpine-dark ::-webkit-scrollbar-thumb {
            background: #3f3f46;
            border-radius: 4px;
          }
          .ag-theme-alpine-dark ::-webkit-scrollbar-thumb:hover {
            background: #52525b;
          }
        `}</style>
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
          getContextMenuItems={() => [
            "copy",
            "copyWithHeaders",
            "paste",
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
          pagination={true}
          paginationPageSize={100}
          paginationPageSizeSelector={[50, 100, 200, 500]}
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
});
