// DataModelsAgGrid: Toolbar component

import { useState } from "react";
import type { AgGridReact } from "ag-grid-react";
import type { ColumnState } from "ag-grid-community";
import {
  Search,
  Download,
  Maximize2,
  X,
  RotateCcw,
  Columns,
  WrapText,
  FileSpreadsheet,
  Bookmark,
  ChevronsLeftRight,
  Filter,
  Star,
  Save,
} from "lucide-react";
import { cn } from "../../lib/cn";
import type { TableInfo } from "./dataModelsGridTypes";

interface DataModelsGridToolbarProps {
  gridRef: React.RefObject<AgGridReact<TableInfo> | null>;
  domainName: string;
  reviewMode: boolean;
  quickFilterText: string;
  setQuickFilterText: (v: string) => void;
  wrapSummary: boolean;
  setWrapSummary: (v: boolean) => void;
  isFullscreen: boolean;
  setIsFullscreen: (v: boolean) => void;
  reviewFilter: "all" | "needs-review" | "modified";
  setReviewFilter: (v: "all" | "needs-review" | "modified") => void;
  modifiedRows?: Map<string, Record<string, unknown>>;
}

export function DataModelsGridToolbar({
  gridRef,
  domainName,
  reviewMode,
  quickFilterText,
  setQuickFilterText,
  wrapSummary,
  setWrapSummary,
  isFullscreen,
  setIsFullscreen,
  reviewFilter,
  setReviewFilter,
  modifiedRows,
}: DataModelsGridToolbarProps) {
  const [savedLayouts, setSavedLayouts] = useState<Record<string, object>>(() => {
    const stored = localStorage.getItem("tv-desktop-ag-grid-layouts");
    if (stored) {
      try { return JSON.parse(stored); } catch { /* ignore */ }
    }
    return {};
  });
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newLayoutName, setNewLayoutName] = useState("");
  const [defaultLayoutName, setDefaultLayoutName] = useState<string | null>(() =>
    localStorage.getItem("tv-desktop-ag-grid-default-layout")
  );

  const applyFlatLayout = () => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.setRowGroupColumns([]);
    api.applyColumnState({
      state: [
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
      ],
      applyOrder: true,
    });
    api.applyColumnState({
      state: [
        { colId: "dataCategory", sort: "asc", sortIndex: 0 },
        { colId: "dataSubCategory", sort: "asc", sortIndex: 1 },
      ],
      defaultState: { sort: null },
    });
  };

  const resetLayout = () => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.setFilterModel(null);
    api.resetColumnState();
    api.setRowGroupColumns(["dataCategory"]);
    setQuickFilterText("");
    setReviewFilter("all");
  };

  const autoSizeAllColumns = () => {
    gridRef.current?.api.autoSizeAllColumns();
  };

  const exportToExcel = () => {
    gridRef.current?.api.exportDataAsExcel({
      fileName: `${domainName}-data-models.xlsx`,
      sheetName: "Data Models",
      allColumns: true,
      skipRowGroups: true,
    });
  };

  const exportToCsv = () => {
    gridRef.current?.api.exportDataAsCsv({
      fileName: `${domainName}-data-models.csv`,
      allColumns: true,
      skipRowGroups: true,
    });
  };

  const saveCurrentLayout = (name: string) => {
    const api = gridRef.current?.api;
    if (!api || !name.trim()) return;
    const layout = {
      columnState: api.getColumnState(),
      rowGroupColumns: api.getRowGroupColumns().map(col => col.getColId()),
      filterModel: api.getFilterModel(),
      savedAt: new Date().toISOString(),
    };
    const newLayouts = { ...savedLayouts, [name.trim()]: layout };
    setSavedLayouts(newLayouts);
    localStorage.setItem("tv-desktop-ag-grid-layouts", JSON.stringify(newLayouts));
    setShowSaveDialog(false);
    setNewLayoutName("");
  };

  const loadLayout = (name: string) => {
    const api = gridRef.current?.api;
    if (!api) return;
    const layout = savedLayouts[name] as {
      columnState: ColumnState[];
      rowGroupColumns: string[];
      filterModel?: Record<string, unknown>;
    } | undefined;
    if (!layout) return;
    api.setRowGroupColumns([]);
    api.applyColumnState({ state: layout.columnState, applyOrder: true });
    if (layout.rowGroupColumns?.length > 0) {
      api.setRowGroupColumns(layout.rowGroupColumns);
    }
    if (layout.filterModel) {
      api.setFilterModel(layout.filterModel);
    } else {
      api.setFilterModel(null);
    }
    setShowLayoutMenu(false);
  };

  const deleteLayout = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newLayouts = { ...savedLayouts };
    delete newLayouts[name];
    setSavedLayouts(newLayouts);
    localStorage.setItem("tv-desktop-ag-grid-layouts", JSON.stringify(newLayouts));
    if (defaultLayoutName === name) {
      setDefaultLayoutName(null);
      localStorage.removeItem("tv-desktop-ag-grid-default-layout");
    }
  };

  const toggleDefaultLayout = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (defaultLayoutName === name) {
      setDefaultLayoutName(null);
      localStorage.removeItem("tv-desktop-ag-grid-default-layout");
    } else {
      setDefaultLayoutName(name);
      localStorage.setItem("tv-desktop-ag-grid-default-layout", name);
    }
  };

  return (
    <>
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
        {/* Left side: Search and filters */}
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Quick filter..."
              value={quickFilterText}
              onChange={(e) => setQuickFilterText(e.target.value)}
              className="w-full px-3 py-2 pl-9 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-teal-500"
            />
          </div>

          {reviewMode && (
            <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 rounded-lg p-1">
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
                    action: { filterType: "set", values: ["To Review"] },
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
          <button onClick={applyFlatLayout} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors" title="Apply flat layout with Category pinned left">
            <Columns size={14} /> Flat
          </button>
          <button onClick={resetLayout} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors" title="Reset to default grouped layout">
            <RotateCcw size={14} /> Reset
          </button>
          <button onClick={autoSizeAllColumns} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors" title="Auto-size all columns">
            <ChevronsLeftRight size={14} /> Fit
          </button>

          {/* Layouts dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowLayoutMenu(!showLayoutMenu)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
              title="Saved layouts"
            >
              <Bookmark size={14} /> Layouts
            </button>
            {showLayoutMenu && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 z-50 py-1">
                <button
                  onClick={() => { setShowLayoutMenu(false); setShowSaveDialog(true); }}
                  className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2"
                >
                  <span className="text-green-600 dark:text-green-400">+</span>
                  Save current layout...
                </button>
                {Object.keys(savedLayouts).length > 0 && (
                  <>
                    <div className="border-t border-zinc-200 dark:border-zinc-700 my-1" />
                    <div className="px-3 py-1 text-xs font-medium text-zinc-500">Saved Layouts</div>
                    {Object.keys(savedLayouts).map((name) => (
                      <div
                        key={name}
                        onClick={() => loadLayout(name)}
                        className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center justify-between cursor-pointer group"
                      >
                        <span className="truncate flex items-center gap-1.5">
                          {defaultLayoutName === name && <Star size={11} className="text-amber-500 fill-amber-500 flex-shrink-0" />}
                          {name}
                        </span>
                        <div className="flex items-center gap-0.5">
                          <button onClick={(e) => { e.stopPropagation(); saveCurrentLayout(name); }} className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-400 hover:text-teal-500 hover:bg-teal-100 dark:hover:bg-teal-900/30" title="Overwrite with current layout">
                            <Save size={12} />
                          </button>
                          <button
                            onClick={(e) => toggleDefaultLayout(name, e)}
                            className={cn(
                              "p-1 rounded",
                              defaultLayoutName === name
                                ? "text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                                : "opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                            )}
                            title={defaultLayoutName === name ? "Remove as default" : "Set as default"}
                          >
                            <Star size={12} className={defaultLayoutName === name ? "fill-amber-500" : ""} />
                          </button>
                          <button onClick={(e) => deleteLayout(name, e)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500 dark:text-red-400" title="Delete layout">
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {!reviewMode && (
            <>
              <button
                onClick={() => setWrapSummary(!wrapSummary)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  wrapSummary
                    ? "border-teal-500 bg-teal-500/20 text-teal-600 dark:text-teal-400"
                    : "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                }`}
                title={wrapSummary ? "Click to truncate text" : "Click to wrap text"}
              >
                <WrapText size={14} />
              </button>
              <button onClick={exportToCsv} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors" title="Export to CSV">
                <Download size={14} /> CSV
              </button>
              <button onClick={exportToExcel} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-500 transition-colors" title="Export to Excel">
                <FileSpreadsheet size={14} /> Excel
              </button>
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  isFullscreen
                    ? "border-teal-500 bg-teal-500/20 text-teal-600 dark:text-teal-400"
                    : "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                }`}
                title={isFullscreen ? "Exit fullscreen (ESC)" : "Enter fullscreen"}
              >
                {isFullscreen ? <X size={14} /> : <Maximize2 size={14} />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Save Layout Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-xl p-6 w-96 max-w-[90vw] border border-zinc-200 dark:border-zinc-700">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Save Layout</h3>
            <input
              type="text"
              value={newLayoutName}
              onChange={(e) => setNewLayoutName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newLayoutName.trim()) saveCurrentLayout(newLayoutName);
                else if (e.key === "Escape") { setShowSaveDialog(false); setNewLayoutName(""); }
              }}
              placeholder="Enter layout name..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-teal-500 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowSaveDialog(false); setNewLayoutName(""); }} className="px-4 py-2 text-sm font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700">
                Cancel
              </button>
              <button onClick={() => saveCurrentLayout(newLayoutName)} disabled={!newLayoutName.trim()} className="px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close layout menu */}
      {showLayoutMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowLayoutMenu(false)} />
      )}
    </>
  );
}
