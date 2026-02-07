// src/modules/library/DataModelsReviewView.tsx
// Split-view review mode for data models - grid on left, detail preview on right

import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Download, CheckCircle, AlertTriangle, Loader2, FileText, Database, RefreshCw, Tags, Sparkles } from "lucide-react";
import { DataModelsAgGrid, DataModelsAgGridHandle, TableInfo } from "./DataModelsAgGrid";
import { TableDetailPreview } from "./TableDetailPreview";
import { cn } from "../../lib/cn";
import { useJobsStore } from "../../stores/jobsStore";

// Storage key for panel width
const PANEL_WIDTH_KEY = "tv-desktop-review-panel-width";

function getPanelWidth(): number {
  if (typeof window === "undefined") return 400;
  const stored = localStorage.getItem(PANEL_WIDTH_KEY);
  return stored ? parseInt(stored, 10) : 400;
}

function savePanelWidth(width: number): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(PANEL_WIDTH_KEY, String(width));
  }
}

interface DataModelsReviewViewProps {
  dataModelsPath: string;
  domainName: string;
  onTableSelect?: (tablePath: string) => void;
}

// Editable field values for dropdown editors
export const DROPDOWN_VALUES = {
  dataCategory: [
    "Sales",
    "Finance",
    "Inventory",
    "Customer",
    "Operations",
    "System",
    "Master Data",
    "Staging",
    "Other",
  ],
  dataSubCategory: [
    "Orders",
    "Payments",
    "GL",
    "AP",
    "AR",
    "Stock",
    "Products",
    "Config",
    "Import",
    "Transactions",
    "Reports",
    "Mapping",
    "Other",
  ],
  usageStatus: ["In Use", "Not Used", "Historically Used", "I Dunno"],
  action: ["None", "To Review", "To Delete", "Approved"],
  dataSource: [
    "POS",
    "ERP",
    "Bank",
    "Manual",
    "API",
    "File Import",
    "System Generated",
    "Unknown",
  ],
};

export function DataModelsReviewView({
  dataModelsPath,
  domainName,
  onTableSelect,
}: DataModelsReviewViewProps) {
  // Selected table for detail preview
  const [selectedTablePath, setSelectedTablePath] = useState<string | null>(null);
  const [selectedTableName, setSelectedTableName] = useState<string | null>(null);
  const [selectedRowData, setSelectedRowData] = useState<TableInfo | null>(null);

  // Modified rows tracking - Map<tableName, modifiedFields>
  const [modifiedRows, setModifiedRows] = useState<Map<string, Partial<TableInfo>>>(new Map());

  // Save state
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Grid ref for accessing filtered rows
  const gridRef = useRef<DataModelsAgGridHandle>(null);

  // Panel resizing
  const [panelWidth, setPanelWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(400);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Jobs store for background operations
  const { addJob, updateJob, jobs } = useJobsStore();

  // Check if any batch operation is running (from jobs store)
  const runningJobs = jobs.filter((j) => j.status === "running");
  const isBatchRunning = runningJobs.some((j) =>
    j.id.startsWith("fetch-samples-") || j.id.startsWith("fetch-categorical-") || j.id.startsWith("fetch-details-") || j.id.startsWith("analyze-all-") || j.id.startsWith("generate-overviews-")
  );

  // Get table names from grid's current filter state (respects all AG Grid filters)
  const getTargetTableNames = useCallback((): string[] => {
    return gridRef.current?.getFilteredTableNames() ?? [];
  }, []);

  // Initialize panel width from localStorage
  useEffect(() => {
    setPanelWidth(getPanelWidth());
  }, []);

  // Handle panel resize
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = panelWidth;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const deltaX = startXRef.current - e.clientX; // Reverse because we're resizing from left edge
      const newWidth = startWidthRef.current + deltaX;
      // Allow panel width from 300px to 900px (or 60% of window width)
      const maxWidth = Math.min(900, window.innerWidth * 0.6);
      const clamped = Math.max(300, Math.min(maxWidth, newWidth));
      setPanelWidth(clamped);
      savePanelWidth(clamped);
    };
    const handleMouseUp = () => {
      if (isResizing) setIsResizing(false);
    };
    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  // Handle row selection (single click)
  const handleRowSelected = useCallback((tablePath: string | null, tableName: string | null, rowData: TableInfo | null) => {
    setSelectedTablePath(tablePath);
    setSelectedTableName(tableName);
    setSelectedRowData(rowData);
  }, []);

  // Handle cell edit from grid
  const handleCellEdited = useCallback((tableName: string, field: string, newValue: unknown) => {
    setModifiedRows((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(tableName) || {};
      newMap.set(tableName, { ...existing, [field]: newValue });
      return newMap;
    });

    // If this is the currently selected row, update the detail panel
    if (tableName === selectedTableName) {
      setSelectedRowData((prev) => prev ? { ...prev, [field]: newValue } as TableInfo : null);
    }

    // Clear success state when new edits are made
    setSaveSuccess(false);
  }, [selectedTableName]);

  // Handle field change from detail panel (updates both selectedRowData and modifiedRows)
  const handleDetailFieldChange = useCallback((field: string, value: string | number | null) => {
    if (!selectedTableName || !selectedRowData) return;

    // Update selectedRowData to reflect change immediately in UI
    setSelectedRowData((prev) => prev ? { ...prev, [field]: value } : null);

    // Track the modification for saving
    setModifiedRows((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(selectedTableName) || {};
      newMap.set(selectedTableName, { ...existing, [field]: value });
      return newMap;
    });

    // Clear success state when new edits are made
    setSaveSuccess(false);
  }, [selectedTableName, selectedRowData]);

  // Show toast
  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Save changes to definition_analysis.json files and regenerate overview.md
  const handleSave = useCallback(async () => {
    if (modifiedRows.size === 0) return;

    setIsSaving(true);
    setSaveError(null);

    const savedTableNames: string[] = [];

    try {
      for (const [tableName, changes] of modifiedRows.entries()) {
        const tablePath = `${dataModelsPath}/table_${tableName}`;
        const analysisPath = `${tablePath}/definition_analysis.json`;

        // Read existing file or create new structure
        let analysis: Record<string, unknown> = {};
        try {
          const content = await invoke<string>("read_file", { path: analysisPath });
          analysis = JSON.parse(content);
        } catch {
          // File doesn't exist, will create new
        }

        // Merge changes
        for (const [field, value] of Object.entries(changes)) {
          if (field === "dataCategory") {
            analysis.dataCategory = value;
          } else if (field === "dataSubCategory") {
            analysis.dataSubCategory = value;
          } else if (field === "usageStatus") {
            analysis.usageStatus = value;
          } else if (field === "action") {
            analysis.action = value;
          } else if (field === "dataSource") {
            analysis.dataSource = value;
          } else if (field === "sourceSystem") {
            analysis.sourceSystem = value;
          } else if (field === "dataType") {
            // Update classification.dataType
            if (!analysis.classification) {
              analysis.classification = {};
            }
            (analysis.classification as Record<string, unknown>).dataType = value;
          } else if (field === "tags") {
            analysis.tags = value;
          } else if (field === "suggestedName") {
            analysis.suggestedName = value;
          } else if (field === "summaryShort") {
            // Update summary.short
            if (!analysis.summary) {
              analysis.summary = {};
            }
            (analysis.summary as Record<string, unknown>).short = value;
          } else if (field === "summaryFull") {
            // Update summary.full
            if (!analysis.summary) {
              analysis.summary = {};
            }
            (analysis.summary as Record<string, unknown>).full = value;
          }
        }

        // Write back
        await invoke("write_file", {
          path: analysisPath,
          content: JSON.stringify(analysis, null, 2),
        });

        savedTableNames.push(tableName);
      }

      // Regenerate overview.md for all modified tables
      for (const tableName of savedTableNames) {
        try {
          await invoke("val_generate_table_overview_md", {
            domain: domainName,
            tableName,
            overwrite: true,
          });
        } catch (e) {
          console.warn(`Failed to regenerate overview.md for ${tableName}:`, e);
          // Continue with other tables even if one fails
        }
      }

      // Clear modified rows after successful save
      setModifiedRows(new Map());
      setSaveSuccess(true);
      showToast(`Saved changes to ${savedTableNames.length} table(s)`, "success");

      // Auto-hide success after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Failed to save changes";
      setSaveError(errorMsg);
      showToast(errorMsg, "error");
    } finally {
      setIsSaving(false);
    }
  }, [modifiedRows, dataModelsPath, domainName, showToast]);

  // Auto-save with debounce (2 seconds after last change)
  useEffect(() => {
    if (modifiedRows.size === 0) return;

    const timer = setTimeout(() => {
      handleSave();
    }, 2000);

    return () => clearTimeout(timer);
  }, [modifiedRows, handleSave]);

  // Sync to grid - save immediately
  const handleSyncToGrid = useCallback(async () => {
    if (modifiedRows.size === 0) {
      showToast("Already synced", "success");
      return;
    }
    await handleSave();
  }, [modifiedRows.size, handleSave, showToast]);

  // Export to CSV
  const handleExport = useCallback((mode: "all" | "modified" | "review") => {
    // This will be handled by the grid component
    // For now, we'll trigger a custom event that the grid can listen to
    const event = new CustomEvent("review-export", { detail: { mode } });
    window.dispatchEvent(event);
  }, []);

  // Close detail panel
  const handleCloseDetail = useCallback(() => {
    setSelectedTablePath(null);
    setSelectedTableName(null);
  }, []);

  // Generate overview.md for all tables in the domain
  const handleGenerateAllOverviews = useCallback(async () => {
    if (isBatchRunning) return;

    const tableNames = getTargetTableNames();
    if (tableNames.length === 0) return;

    const jobId = `generate-overviews-${Date.now()}`;
    addJob({
      id: jobId,
      name: `Generate Overviews (${tableNames.length} tables)`,
      status: "running",
      progress: 0,
      message: "Starting...",
    });

    try {
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < tableNames.length; i++) {
        const tableName = tableNames[i];
        const progress = Math.round(((i + 1) / tableNames.length) * 100);

        updateJob(jobId, {
          progress,
          message: `${i + 1}/${tableNames.length}: ${tableName}`,
        });

        try {
          await invoke("val_generate_table_overview_md", {
            domain: domainName,
            tableName,
            overwrite: true,
          });
          successCount++;
        } catch (e) {
          console.warn(`Failed to generate overview for ${tableName}:`, e);
          errorCount++;
        }
      }

      updateJob(jobId, {
        status: errorCount > 0 ? "failed" : "completed",
        progress: 100,
        message: `Generated ${successCount}${errorCount > 0 ? `, ${errorCount} errors` : ""}`,
      });
    } catch (e) {
      updateJob(jobId, {
        status: "failed",
        message: e instanceof Error ? e.message : "Failed",
      });
    }
  }, [isBatchRunning, getTargetTableNames, domainName, addJob, updateJob]);

  // Fetch sample data for all tables in the domain (one by one)
  const handleFetchAllSamples = useCallback(async () => {
    if (isBatchRunning) return;

    const tableNames = getTargetTableNames();
    if (tableNames.length === 0) return;

    const jobId = `fetch-samples-${Date.now()}`;
    addJob({
      id: jobId,
      name: `Fetch Samples (${tableNames.length} tables)`,
      status: "running",
      progress: 0,
      message: "Starting...",
    });

    try {
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < tableNames.length; i++) {
        const tableName = tableNames[i];
        const progress = Math.round(((i + 1) / tableNames.length) * 100);

        updateJob(jobId, {
          progress,
          message: `${i + 1}/${tableNames.length}: ${tableName}`,
        });

        try {
          await invoke("val_sample_table_data", {
            domain: domainName,
            tableName,
            overwrite: true,
            rowCount: 20,
            orderBy: null,
          });
          successCount++;
        } catch (e) {
          console.warn(`Failed to fetch sample for ${tableName}:`, e);
          errorCount++;
        }
      }

      updateJob(jobId, {
        status: errorCount > 0 ? "failed" : "completed",
        progress: 100,
        message: `Fetched ${successCount}${errorCount > 0 ? `, ${errorCount} errors` : ""}`,
      });
    } catch (e) {
      updateJob(jobId, {
        status: "failed",
        message: e instanceof Error ? e.message : "Failed",
      });
    }
  }, [isBatchRunning, getTargetTableNames, domainName, addJob, updateJob]);

  // Fetch categorical values for all tables in the domain (one by one)
  const handleFetchAllCategorical = useCallback(async () => {
    if (isBatchRunning) return;

    const tableNames = getTargetTableNames();
    if (tableNames.length === 0) return;

    const jobId = `fetch-categorical-${Date.now()}`;
    addJob({
      id: jobId,
      name: `Fetch Categorical (${tableNames.length} tables)`,
      status: "running",
      progress: 0,
      message: "Starting...",
    });

    try {
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < tableNames.length; i++) {
        const tableName = tableNames[i];
        const progress = Math.round(((i + 1) / tableNames.length) * 100);

        updateJob(jobId, {
          progress,
          message: `${i + 1}/${tableNames.length}: ${tableName}`,
        });

        try {
          await invoke("val_fetch_categorical_values", {
            domain: domainName,
            tableName,
            overwrite: true,
          });
          successCount++;
        } catch (e) {
          console.warn(`Failed to fetch categorical for ${tableName}:`, e);
          errorCount++;
        }
      }

      updateJob(jobId, {
        status: errorCount > 0 ? "failed" : "completed",
        progress: 100,
        message: `Fetched ${successCount}${errorCount > 0 ? `, ${errorCount} errors` : ""}`,
      });
    } catch (e) {
      updateJob(jobId, {
        status: "failed",
        message: e instanceof Error ? e.message : "Failed",
      });
    }
  }, [isBatchRunning, getTargetTableNames, domainName, addJob, updateJob]);

  // Fetch details for all tables in the domain (one by one)
  const handleFetchAllDetails = useCallback(async () => {
    if (isBatchRunning) return;

    const tableNames = getTargetTableNames();
    if (tableNames.length === 0) return;

    const jobId = `fetch-details-${Date.now()}`;
    addJob({
      id: jobId,
      name: `Fetch Details (${tableNames.length} tables)`,
      status: "running",
      progress: 0,
      message: "Starting...",
    });

    try {
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < tableNames.length; i++) {
        const tableName = tableNames[i];
        const progress = Math.round(((i + 1) / tableNames.length) * 100);

        updateJob(jobId, {
          progress,
          message: `${i + 1}/${tableNames.length}: ${tableName}`,
        });

        try {
          await invoke("val_prepare_table_overview", {
            domain: domainName,
            tableName,
            overwrite: true,
            skipSql: false,
            freshnessColumn: null,
          });
          successCount++;
        } catch (e) {
          console.warn(`Failed to fetch details for ${tableName}:`, e);
          errorCount++;
        }
      }

      updateJob(jobId, {
        status: errorCount > 0 ? "failed" : "completed",
        progress: 100,
        message: `Fetched ${successCount}${errorCount > 0 ? `, ${errorCount} errors` : ""}`,
      });
    } catch (e) {
      updateJob(jobId, {
        status: "failed",
        message: e instanceof Error ? e.message : "Failed",
      });
    }
  }, [isBatchRunning, getTargetTableNames, domainName, addJob, updateJob]);

  // AI Analyze all filtered tables (one by one)
  const handleAnalyzeAll = useCallback(async () => {
    if (isBatchRunning) return;

    const tableNames = getTargetTableNames();
    if (tableNames.length === 0) return;

    const jobId = `analyze-all-${Date.now()}`;
    addJob({
      id: jobId,
      name: `AI Analyze (${tableNames.length} tables)`,
      status: "running",
      progress: 0,
      message: "Starting...",
    });

    try {
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < tableNames.length; i++) {
        const tableName = tableNames[i];
        const progress = Math.round(((i + 1) / tableNames.length) * 100);

        updateJob(jobId, {
          progress,
          message: `${i + 1}/${tableNames.length}: ${tableName}`,
        });

        try {
          await invoke("val_analyze_table_data", {
            domain: domainName,
            tableName,
            overwrite: true,
          });
          successCount++;
        } catch (e) {
          console.error(`[AI Analyze] ${tableName} FAILED:`, e);
          errorCount++;
        }
      }

      updateJob(jobId, {
        status: errorCount > 0 ? "failed" : "completed",
        progress: 100,
        message: `Analyzed ${successCount}${errorCount > 0 ? `, ${errorCount} errors` : ""}`,
      });
    } catch (e) {
      updateJob(jobId, {
        status: "failed",
        message: e instanceof Error ? e.message : "Failed",
      });
    }
  }, [isBatchRunning, getTargetTableNames, domainName, addJob, updateJob]);

  const modifiedCount = modifiedRows.size;

  return (
    <div className="h-full flex flex-col">
      {/* Header toolbar */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-3 flex-shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Review Mode
          </h2>
          <p className="text-sm text-zinc-500">
            {domainName} • Click row to preview, edit fields inline
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Modified count indicator - shows pending auto-save */}
          {modifiedCount > 0 && !isSaving && (
            <span className="px-2 py-1 text-xs font-medium rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
              {modifiedCount} unsaved
            </span>
          )}

          {/* Save success indicator */}
          {saveSuccess && (
            <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
              <CheckCircle size={12} />
              Saved
            </span>
          )}

          {/* Save error indicator */}
          {saveError && (
            <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
              <AlertTriangle size={12} />
              Error
            </span>
          )}

          {/* Auto-saving indicator */}
          {isSaving && (
            <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-slate-100 dark:bg-zinc-800 text-zinc-500">
              <Loader2 size={12} className="animate-spin" />
              Saving...
            </span>
          )}

          {/* Fetch All Samples button */}
          <button
            onClick={handleFetchAllSamples}
            disabled={isBatchRunning}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Fetch sample rows for filtered tables (applies to visible rows in grid)"
          >
            <Database size={14} />
            Fetch All Samples
          </button>

          {/* Fetch All Categorical button */}
          <button
            onClick={handleFetchAllCategorical}
            disabled={isBatchRunning}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Fetch categorical values for filtered tables (applies to visible rows in grid)"
          >
            <Tags size={14} />
            Fetch All Categorical
          </button>

          {/* Fetch All Details button */}
          <button
            onClick={handleFetchAllDetails}
            disabled={isBatchRunning}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Fetch details for filtered tables (applies to visible rows in grid)"
          >
            <RefreshCw size={14} />
            Fetch All Details
          </button>

          {/* AI Analyze All button */}
          <button
            onClick={handleAnalyzeAll}
            disabled={isBatchRunning}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Run AI analysis on filtered tables (applies to visible rows in grid)"
          >
            <Sparkles size={14} />
            AI Analyze All
          </button>

          {/* Generate All Overviews button */}
          <button
            onClick={handleGenerateAllOverviews}
            disabled={isBatchRunning}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Generate overviews for filtered tables (applies to visible rows in grid)"
          >
            <FileText size={14} />
            Generate All Overviews
          </button>

          {/* Export dropdown */}
          <div className="relative group">
            <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors">
              <Download size={14} />
              Export
            </button>
            <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-slate-200 dark:border-zinc-700 z-50 py-1 hidden group-hover:block">
              <button
                onClick={() => handleExport("all")}
                className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700"
              >
                Export All
              </button>
              <button
                onClick={() => handleExport("modified")}
                className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700"
              >
                Export Modified
              </button>
              <button
                onClick={() => handleExport("review")}
                className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700"
              >
                Export Review Queue
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Split content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: AG Grid */}
        <div className="flex-1 overflow-hidden">
          <DataModelsAgGrid
            ref={gridRef}
            dataModelsPath={dataModelsPath}
            domainName={domainName}
            onTableSelect={onTableSelect}
            reviewMode={true}
            onRowSelected={handleRowSelected}
            onCellEdited={handleCellEdited}
            modifiedRows={modifiedRows}
          />
        </div>

        {/* Resize handle */}
        {selectedTablePath && (
          <div
            onMouseDown={handleMouseDown}
            className="relative w-2 cursor-col-resize group flex-shrink-0 hover:bg-slate-100 dark:hover:bg-zinc-800/50"
          >
            <div
              className={cn(
                "absolute inset-y-0 left-1/2 -translate-x-1/2 w-1 transition-all",
                isResizing
                  ? "bg-teal-500"
                  : "bg-slate-300 dark:bg-zinc-700 group-hover:bg-teal-500"
              )}
            />
          </div>
        )}

        {/* Right: Detail panel */}
        {selectedTablePath && selectedTableName && (
          <div
            className="flex-shrink-0 border-l border-slate-200 dark:border-zinc-800 overflow-hidden"
            style={{
              width: panelWidth,
              transition: isResizing ? "none" : "width 200ms",
            }}
          >
            <TableDetailPreview
              tablePath={selectedTablePath}
              tableName={selectedTableName}
              rowData={selectedRowData}
              onClose={handleCloseDetail}
              onNavigate={onTableSelect}
              onFieldChange={handleDetailFieldChange}
              onSaveBeforeGenerate={handleSave}
              onSyncToGrid={handleSyncToGrid}
            />
          </div>
        )}
      </div>

      {/* Toast notification */}
      {toast && (
        <div
          className={cn(
            "fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg z-50 transition-opacity",
            toast.type === "success"
              ? "bg-teal-600 dark:bg-teal-900 text-white dark:text-teal-100"
              : "bg-red-600 dark:bg-red-900 text-white dark:text-red-100"
          )}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
