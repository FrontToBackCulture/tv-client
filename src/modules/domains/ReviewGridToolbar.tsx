// Unified review grid: Toolbar component
//
// Layout management: workspace-shared via Supabase `grid_layouts`. Each
// resource type uses its own grid_key (`review-table`, `review-query`, etc.)
// so columns saved on one tab don't pollute another. Mirrors the Skills
// review grid (`SkillReviewGrid.tsx`) so behavior is consistent across the
// Lab module.

import { useState, useEffect, useMemo, useCallback } from "react";
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
  Star,
  Save,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { Button } from "../../components/ui";
import { useRegisterCommands } from "../../stores/commandStore";
import { toast } from "../../stores/toastStore";
import { formatError } from "../../lib/formatError";
import {
  useGridLayouts,
  useSaveGridLayout,
  useDeleteGridLayout,
  useSetDefaultGridLayout,
} from "../../hooks/useGridLayouts";
import type { ReviewResourceType, ReviewRow } from "./reviewTypes";

interface ReviewGridToolbarProps {
  gridRef: React.RefObject<AgGridReact<ReviewRow> | null>;
  domainName: string;
  reviewMode: boolean;
  quickFilterText: string;
  setQuickFilterText: (v: string) => void;
  wrapSummary: boolean;
  setWrapSummary: (v: boolean) => void;
  isFullscreen: boolean;
  setIsFullscreen: (v: boolean) => void;
  reviewFilter: "all" | "needs-review" | "modified" | "deleted";
  setReviewFilter: (v: "all" | "needs-review" | "modified" | "deleted") => void;
  isTable?: boolean;
  /** Per-resource-type so layouts don't cross-pollute between tabs. */
  resourceType: ReviewResourceType;
  /** Optional — opens dedicated full-screen review route (review mode only) */
  onOpenFullScreen?: () => void;
  /** Slot for parent-supplied actions (e.g. Fetch/AI/Sync to Portal). Rendered
   *  in the right-actions group, ahead of the Layouts dropdown, so they sit
   *  inside the grid frame instead of floating in a separate page header. */
  toolbarActions?: React.ReactNode;
}

export function ReviewGridToolbar({
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
  isTable = false,
  resourceType,
  onOpenFullScreen,
  toolbarActions,
}: ReviewGridToolbarProps) {
  // Per-tab layout namespace — `review-table`, `review-query`, etc.
  const gridKey = `review-${resourceType}`;

  const { data: layouts = [] } = useGridLayouts(gridKey);
  const saveLayoutMutation = useSaveGridLayout(gridKey);
  const deleteLayoutMutation = useDeleteGridLayout(gridKey);
  const setDefaultMutation = useSetDefaultGridLayout(gridKey);

  const layoutsByName = useMemo(() => {
    const m = new Map<string, (typeof layouts)[number]>();
    for (const l of layouts) m.set(l.name, l);
    return m;
  }, [layouts]);

  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newLayoutName, setNewLayoutName] = useState("");
  const [activeLayoutName, setActiveLayoutName] = useState<string | null>(null);
  const [layoutModified, setLayoutModified] = useState(false);

  // Auto-apply the default layout lives in ReviewGrid (not here) — it has
  // direct control over the AG Grid lifecycle (onFirstDataRendered, colDef
  // rebuild detection) which is needed for reliable timing. The toolbar
  // just renders the dropdown + active-layout indicator below.
  //
  // Surface the active default's name in `activeLayoutName` so the toolbar
  // button shows it correctly after auto-apply. Does NOT trigger an apply.
  useEffect(() => {
    if (activeLayoutName) return; // user has manually loaded one
    const def = layouts.find((l) => l.is_default);
    if (def) {
      setActiveLayoutName(def.name);
      setLayoutModified(false);
    }
  }, [layouts, activeLayoutName]);

  // Track grid mutations after a layout has been applied so we can show the
  // "•" modified indicator. Skip events that fire while the layout is being
  // applied — only real user edits should flip the flag.
  useEffect(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    const onChange = () => {
      if (activeLayoutName) setLayoutModified(true);
    };
    api.addEventListener("columnMoved", onChange);
    api.addEventListener("columnVisible", onChange);
    api.addEventListener("columnResized", onChange);
    api.addEventListener("columnPinned", onChange);
    api.addEventListener("sortChanged", onChange);
    api.addEventListener("filterChanged", onChange);
    api.addEventListener("columnRowGroupChanged", onChange);
    return () => {
      api.removeEventListener("columnMoved", onChange);
      api.removeEventListener("columnVisible", onChange);
      api.removeEventListener("columnResized", onChange);
      api.removeEventListener("columnPinned", onChange);
      api.removeEventListener("sortChanged", onChange);
      api.removeEventListener("filterChanged", onChange);
      api.removeEventListener("columnRowGroupChanged", onChange);
    };
  }, [gridRef, activeLayoutName]);

  const applyFlatLayout = () => {
    const api = gridRef.current?.api;
    if (!api) return;
    if (isTable) api.setRowGroupColumns([]);
    const state = isTable
      ? [
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
        ]
      : [
          { colId: "dataCategory", hide: false, pinned: "left" as const, width: 140 },
          { colId: "dataSubCategory", hide: false, pinned: "left" as const, width: 110 },
          { colId: "name", hide: false, pinned: null, width: 220 },
        ];
    api.applyColumnState({ state, applyOrder: isTable });
    api.applyColumnState({
      state: [
        { colId: "dataCategory", sort: "asc", sortIndex: 0 },
        { colId: "dataSubCategory", sort: "asc", sortIndex: 1 },
      ],
      defaultState: { sort: null },
    });
    setActiveLayoutName(null);
    setLayoutModified(false);
  };

  const resetLayout = () => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.setFilterModel(null);
    api.resetColumnState();
    if (isTable) api.setRowGroupColumns(["dataCategory"]);
    setQuickFilterText("");
    setReviewFilter("all");
    setActiveLayoutName(null);
    setLayoutModified(false);
  };

  const autoSizeAllColumns = () => {
    gridRef.current?.api.autoSizeAllColumns();
  };

  const exportToExcel = () => {
    gridRef.current?.api.exportDataAsExcel({
      fileName: `${domainName}-review.xlsx`,
      sheetName: "Review",
      allColumns: true,
      skipRowGroups: true,
    });
  };

  const exportToCsv = () => {
    gridRef.current?.api.exportDataAsCsv({
      fileName: `${domainName}-review.csv`,
      allColumns: true,
      skipRowGroups: true,
    });
  };

  const saveCurrentLayout = useCallback(async (name: string) => {
    const api = gridRef.current?.api;
    const trimmed = name.trim();
    if (!api || !trimmed) return;
    try {
      await saveLayoutMutation.mutateAsync({
        name: trimmed,
        payload: {
          column_state: api.getColumnState() as unknown[],
          filter_model: (api.getFilterModel() ?? {}) as Record<string, unknown>,
          row_group_columns: api.getRowGroupColumns().map((col) => col.getColId()),
        },
      });
      setActiveLayoutName(trimmed);
      setLayoutModified(false);
      setShowSaveDialog(false);
      setNewLayoutName("");
      toast.success(`Layout "${trimmed}" saved`);
    } catch (err) {
      toast.error(formatError(err));
    }
  }, [gridRef, saveLayoutMutation]);

  const loadLayout = useCallback((name: string) => {
    const api = gridRef.current?.api;
    if (!api) return;
    const layout = layoutsByName.get(name);
    if (!layout) return;
    if (isTable) api.setRowGroupColumns([]);
    api.applyColumnState({ state: layout.column_state as ColumnState[], applyOrder: true });
    if (layout.row_group_columns?.length) {
      api.setRowGroupColumns(layout.row_group_columns);
    }
    if (layout.filter_model && Object.keys(layout.filter_model).length) {
      api.setFilterModel(layout.filter_model);
    } else {
      api.setFilterModel(null);
    }
    setActiveLayoutName(name);
    setLayoutModified(false);
    setShowLayoutMenu(false);
    toast.info(`Layout "${name}" applied`);
  }, [gridRef, isTable, layoutsByName]);

  const deleteLayout = useCallback(async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const layout = layoutsByName.get(name);
    if (!layout) return;
    try {
      await deleteLayoutMutation.mutateAsync(layout.id);
      if (activeLayoutName === name) {
        setActiveLayoutName(null);
        setLayoutModified(false);
      }
      toast.info(`Layout "${name}" deleted`);
    } catch (err) {
      toast.error(formatError(err));
    }
  }, [layoutsByName, deleteLayoutMutation, activeLayoutName]);

  const toggleDefaultLayout = useCallback(async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const layout = layoutsByName.get(name);
    if (!layout) return;
    try {
      await setDefaultMutation.mutateAsync({ id: layout.id, makeDefault: !layout.is_default });
      toast.info(layout.is_default ? `"${name}" removed as default` : `"${name}" set as default layout`);
    } catch (err) {
      toast.error(formatError(err));
    }
  }, [layoutsByName, setDefaultMutation]);

  // Register contextual commands for Command Palette
  const commands = useMemo(() => [
    { id: "grid-flat", label: "Flat View", description: "Remove row grouping and show all rows flat", icon: <Columns size={15} />, action: applyFlatLayout },
    { id: "grid-autofit", label: "Auto-fit Columns", description: "Resize all columns to fit their content", icon: <ChevronsLeftRight size={15} />, action: autoSizeAllColumns },
    { id: "grid-reset", label: "Reset to Default Layout", description: "Clear filters, sorting, and column changes", icon: <RotateCcw size={15} />, action: resetLayout },
    ...(!reviewMode ? [
      { id: "grid-wrap", label: wrapSummary ? "Truncate Text" : "Wrap Text", description: "Toggle text wrapping in summary columns", icon: <WrapText size={15} />, action: () => setWrapSummary(!wrapSummary) },
      { id: "grid-csv", label: "Export CSV", description: "Download grid data as a CSV file", icon: <Download size={15} />, action: exportToCsv },
      { id: "grid-excel", label: "Export Excel", description: "Download grid data as an Excel spreadsheet", icon: <FileSpreadsheet size={15} />, action: exportToExcel },
      { id: "grid-fullscreen", label: isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen", description: "Toggle fullscreen view for the data grid", icon: <Maximize2 size={15} />, action: () => setIsFullscreen(!isFullscreen) },
    ] : []),
  ], [reviewMode, wrapSummary, isFullscreen]);

  useRegisterCommands(commands, [reviewMode, wrapSummary, isFullscreen]);

  return (
    <>
      <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2 flex-wrap flex-shrink-0">
        {/* Left side: Search and filters */}
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Quick filter..."
              value={quickFilterText}
              onChange={(e) => setQuickFilterText(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          {reviewMode && (
            <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800">
              <button
                onClick={() => setReviewFilter("all")}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors",
                  reviewFilter === "all"
                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                )}
              >
                All
              </button>
              <button
                onClick={() => setReviewFilter("deleted")}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors",
                  reviewFilter === "deleted"
                    ? "bg-white dark:bg-zinc-700 text-red-600 dark:text-red-400 shadow-sm"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                )}
              >
                Deleted
              </button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          {toolbarActions}
          {/* Layouts dropdown — Supabase-backed, shows the active layout name */}
          <div className="relative">
            <button
              onClick={() => setShowLayoutMenu(!showLayoutMenu)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
              title={activeLayoutName ? `Current layout: ${activeLayoutName}${layoutModified ? " (modified)" : ""}` : "Layouts & view options"}
            >
              <Bookmark size={13} />
              {activeLayoutName ? (
                <span className="flex items-center gap-1">
                  <span className="max-w-[120px] truncate">{activeLayoutName}</span>
                  {layoutModified && <span className="text-amber-500" title="Layout has unsaved changes">•</span>}
                </span>
              ) : (
                <span>Layouts</span>
              )}
            </button>
            {showLayoutMenu && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-800 z-50 py-1">
                {/* Quick actions */}
                <button
                  onClick={() => { applyFlatLayout(); setShowLayoutMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center gap-2"
                >
                  <Columns size={13} /> Flat View
                </button>
                <button
                  onClick={() => { autoSizeAllColumns(); setShowLayoutMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center gap-2"
                >
                  <ChevronsLeftRight size={13} /> Auto-fit Columns
                </button>
                <button
                  onClick={() => { resetLayout(); setShowLayoutMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center gap-2"
                >
                  <RotateCcw size={13} /> Reset to Default
                </button>

                <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />

                <button
                  onClick={() => { exportToCsv(); setShowLayoutMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center gap-2"
                >
                  <Download size={13} /> Export CSV
                </button>
                <button
                  onClick={() => { exportToExcel(); setShowLayoutMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center gap-2"
                >
                  <FileSpreadsheet size={13} /> Export Excel
                </button>

                <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />

                <button
                  onClick={() => { setShowLayoutMenu(false); setShowSaveDialog(true); }}
                  className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center gap-2"
                >
                  <span className="text-green-600 dark:text-green-400">+</span>
                  Save current layout...
                </button>
                {layouts.length > 0 && (
                  <>
                    <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />
                    <div className="px-3 py-1 text-xs font-medium text-zinc-500">Shared Layouts</div>
                    {layouts.map((layout) => (
                      <div
                        key={layout.id}
                        onClick={() => loadLayout(layout.name)}
                        className={cn(
                          "w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center justify-between cursor-pointer group",
                          activeLayoutName === layout.name
                            ? "text-teal-600 dark:text-teal-400 font-medium"
                            : "text-zinc-700 dark:text-zinc-300",
                        )}
                      >
                        <span className="truncate flex items-center gap-1.5">
                          {layout.is_default && <Star size={11} className="text-amber-500 fill-amber-500 flex-shrink-0" />}
                          {layout.name}
                        </span>
                        <div className="flex items-center gap-0.5">
                          <button onClick={(e) => { e.stopPropagation(); saveCurrentLayout(layout.name); }} className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-400 hover:text-teal-500 hover:bg-teal-100 dark:hover:bg-teal-900/30" title="Overwrite with current layout">
                            <Save size={12} />
                          </button>
                          <button
                            onClick={(e) => toggleDefaultLayout(layout.name, e)}
                            className={cn(
                              "p-1 rounded",
                              layout.is_default
                                ? "text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                                : "opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                            )}
                            title={layout.is_default ? "Remove as default" : "Set as default"}
                          >
                            <Star size={12} className={layout.is_default ? "fill-amber-500" : ""} />
                          </button>
                          <button onClick={(e) => deleteLayout(layout.name, e)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500 dark:text-red-400" title="Delete layout">
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

          {reviewMode && onOpenFullScreen && (
            <button
              onClick={onOpenFullScreen}
              title="Open in full-screen review"
              className="flex items-center px-2 py-1.5 text-xs font-medium rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
            >
              <Maximize2 size={13} />
            </button>
          )}

          {!reviewMode && (
            <>
              <button
                onClick={() => setWrapSummary(!wrapSummary)}
                className={`flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                  wrapSummary
                    ? "border-teal-500 bg-teal-500/20 text-teal-600 dark:text-teal-400"
                    : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                }`}
                title={wrapSummary ? "Click to truncate text" : "Click to wrap text"}
              >
                <WrapText size={13} />
              </button>
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className={`flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                  isFullscreen
                    ? "border-teal-500 bg-teal-500/20 text-teal-600 dark:text-teal-400"
                    : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                }`}
                title={isFullscreen ? "Exit fullscreen (ESC)" : "Enter fullscreen"}
              >
                {isFullscreen ? <X size={13} /> : <Maximize2 size={13} />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Save Layout Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 animate-fade-in">
          <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-lg p-6 w-96 max-w-[90vw] border border-zinc-200 dark:border-zinc-800 animate-modal-in">
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
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="md" onClick={() => { setShowSaveDialog(false); setNewLayoutName(""); }}>
                Cancel
              </Button>
              <Button size="md" onClick={() => saveCurrentLayout(newLayoutName)} disabled={!newLayoutName.trim()}>
                Save
              </Button>
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
