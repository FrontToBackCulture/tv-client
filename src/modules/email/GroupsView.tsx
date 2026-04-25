// src/modules/email/GroupsView.tsx
// Groups AG Grid — sidebar with size presets, shared layouts, floating filters.

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  ColDef,
  ColumnState,
  ModuleRegistry,
  AllCommunityModule,
  GetRowIdParams,
} from "ag-grid-community";
import { AllEnterpriseModule, LicenseManager } from "ag-grid-enterprise";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import { Plus, Trash2, Layers, Users, Bookmark, Star, Save, RotateCcw, ChevronsLeftRight, X, Maximize2 } from "lucide-react";
import { useEmailGroups, useDeleteEmailGroup } from "../../hooks/email";
import type { EmailGroupWithCount } from "../../lib/email/types";
import { cn } from "../../lib/cn";
import { useAppStore } from "../../stores/appStore";
import { toast } from "../../stores/toastStore";
import { themeStyles } from "../domains/reviewGridStyles";
import {
  useGridLayouts,
  useSaveGridLayout,
  useDeleteGridLayout,
  useSetDefaultGridLayout,
  type GridLayout,
} from "../../hooks/useGridLayouts";

ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule]);
if (typeof window !== "undefined" && import.meta.env.VITE_AG_GRID_LICENSE_KEY) {
  LicenseManager.setLicenseKey(import.meta.env.VITE_AG_GRID_LICENSE_KEY);
}

const GRID_KEY = "email-groups";

type SizeBucket = "all" | "empty" | "small" | "medium" | "large";

const SIZE_PRESETS: { id: SizeBucket; label: string; match: (c: number) => boolean }[] = [
  { id: "all",    label: "All",              match: () => true },
  { id: "empty",  label: "Empty",            match: (c) => c === 0 },
  { id: "small",  label: "Small (1–10)",     match: (c) => c >= 1 && c <= 10 },
  { id: "medium", label: "Medium (11–50)",   match: (c) => c >= 11 && c <= 50 },
  { id: "large",  label: "Large (51+)",      match: (c) => c >= 51 },
];

interface GroupRow {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  createdAt: string | null;
  createdTs: number;
  updatedAt: string | null;
  updatedTs: number;
}

interface GroupsViewProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onNewGroup: () => void;
}

export function GroupsView({ selectedId, onSelect, onNewGroup }: GroupsViewProps) {
  const theme = useAppStore((s) => s.theme);
  const [quickFilter, setQuickFilter] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sizeFilter, setSizeFilter] = useState<SizeBucket>("all");
  const gridRef = useRef<AgGridReact<GroupRow>>(null);

  const { data: groups = [], isLoading } = useEmailGroups();
  const deleteGroup = useDeleteEmailGroup();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) setIsFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  // Sidebar preset counts
  const sizeCounts = useMemo(() => {
    const counts: Record<SizeBucket, number> = { all: 0, empty: 0, small: 0, medium: 0, large: 0 };
    for (const g of groups) {
      const n = g.memberCount ?? 0;
      counts.all++;
      for (const p of SIZE_PRESETS) {
        if (p.id !== "all" && p.match(n)) counts[p.id]++;
      }
    }
    return counts;
  }, [groups]);

  // Rows (filtered by sidebar preset)
  const rowData = useMemo<GroupRow[]>(() => {
    const preset = SIZE_PRESETS.find((p) => p.id === sizeFilter) ?? SIZE_PRESETS[0];
    const filtered = (groups as EmailGroupWithCount[]).filter((g) => preset.match(g.memberCount ?? 0));
    return filtered.map((g) => ({
      id: g.id,
      name: g.name || "(untitled)",
      description: g.description || "",
      memberCount: g.memberCount ?? 0,
      createdAt: g.created_at || null,
      createdTs: g.created_at ? new Date(g.created_at).getTime() : 0,
      updatedAt: g.updated_at || null,
      updatedTs: g.updated_at ? new Date(g.updated_at).getTime() : 0,
    }));
  }, [groups, sizeFilter]);

  const handleDelete = useCallback(async (id: string, name: string) => {
    if (!window.confirm(`Delete group "${name}"? Contacts will not be deleted, just removed from this group.`)) return;
    try {
      await deleteGroup.mutateAsync(id);
      if (selectedId === id) onSelect(null);
      toast.success(`Group "${name}" deleted`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete group");
    }
  }, [deleteGroup, onSelect, selectedId]);

  const columnDefs = useMemo<ColDef<GroupRow>[]>(() => [
    {
      field: "name",
      headerName: "Name",
      flex: 2,
      minWidth: 240,
      pinned: "left",
      filter: "agTextColumnFilter",
      cellRenderer: (p: { value: string }) => (
        <span className="text-xs font-medium text-zinc-800 dark:text-zinc-100 truncate">{p.value}</span>
      ),
    },
    {
      field: "description",
      headerName: "Description",
      flex: 3,
      minWidth: 240,
      filter: "agTextColumnFilter",
      cellClass: "text-xs text-zinc-500 dark:text-zinc-400",
      valueFormatter: (p) => p.value || "—",
    },
    {
      field: "memberCount",
      headerName: "Members",
      width: 110,
      filter: "agNumberColumnFilter",
      cellRenderer: (p: { value: number }) => (
        <span className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400 tabular-nums">
          <Users size={11} className="text-zinc-400" /> {p.value ?? 0}
        </span>
      ),
    },
    {
      field: "createdTs",
      headerName: "Created",
      width: 130,
      filter: "agNumberColumnFilter",
      valueFormatter: (p: { data?: GroupRow }) => {
        if (!p.data?.createdAt) return "—";
        return new Date(p.data.createdAt).toLocaleDateString("en-SG", { year: "numeric", month: "short", day: "2-digit" });
      },
      cellClass: "text-xs text-zinc-500 dark:text-zinc-400",
    },
    {
      field: "updatedTs",
      headerName: "Updated",
      width: 130,
      filter: "agNumberColumnFilter",
      sort: "desc",
      sortIndex: 0,
      valueFormatter: (p: { data?: GroupRow }) => {
        if (!p.data?.updatedAt) return "—";
        return new Date(p.data.updatedAt).toLocaleDateString("en-SG", { year: "numeric", month: "short", day: "2-digit" });
      },
      cellClass: "text-xs text-zinc-500 dark:text-zinc-400",
    },
    {
      headerName: "",
      width: 60,
      sortable: false,
      filter: false,
      resizable: false,
      cellRenderer: (p: { data?: GroupRow }) => {
        if (!p.data) return null;
        return (
          <span className="flex items-center gap-0.5">
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); handleDelete(p.data!.id, p.data!.name); }}
              className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
              title="Delete"
            >
              <Trash2 size={12} />
            </button>
          </span>
        );
      },
    },
  ], [handleDelete]);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    filter: true,
    floatingFilter: true,
    tooltipShowDelay: 500,
    cellClass: "text-xs",
  }), []);

  const getRowId = useCallback((params: GetRowIdParams<GroupRow>) => params.data.id, []);

  // ─── Shared layouts ────────────────────────────────────────────────────────
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newLayoutName, setNewLayoutName] = useState("");
  const [activeLayoutName, setActiveLayoutName] = useState<string | null>(null);
  const [layoutModified, setLayoutModified] = useState(false);
  const [activeFilterCount, setActiveFilterCount] = useState(0);
  const { data: layouts = [], isFetched: layoutsFetched } = useGridLayouts(GRID_KEY);
  const saveLayoutMutation = useSaveGridLayout(GRID_KEY);
  const deleteLayoutMutation = useDeleteGridLayout(GRID_KEY);
  const setDefaultMutation = useSetDefaultGridLayout(GRID_KEY);
  const layoutsByName = useMemo(() => {
    const m: Record<string, GridLayout> = {};
    for (const l of layouts) m[l.name] = l;
    return m;
  }, [layouts]);
  const defaultLayout = useMemo(() => layouts.find((l) => l.is_default) ?? null, [layouts]);

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
          row_group_columns: api.getRowGroupColumns().map((c) => c.getColId()),
        },
      });
      setActiveLayoutName(trimmed);
      setLayoutModified(false);
      setShowSaveDialog(false);
      setNewLayoutName("");
      toast.success(`Layout "${trimmed}" saved`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save layout");
    }
  }, [saveLayoutMutation]);

  const loadLayout = useCallback((name: string) => {
    const api = gridRef.current?.api;
    if (!api) return;
    const layout = layoutsByName[name];
    if (!layout) return;
    api.setRowGroupColumns([]);
    api.applyColumnState({ state: layout.column_state as ColumnState[], applyOrder: true });
    if (layout.row_group_columns?.length) api.setRowGroupColumns(layout.row_group_columns);
    if (layout.filter_model && Object.keys(layout.filter_model).length) api.setFilterModel(layout.filter_model);
    else api.setFilterModel(null);
    setActiveLayoutName(name);
    setLayoutModified(false);
    setShowLayoutMenu(false);
    toast.info(`Layout "${name}" applied`);
  }, [layoutsByName]);

  const deleteLayout = useCallback(async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const layout = layoutsByName[name];
    if (!layout) return;
    try {
      await deleteLayoutMutation.mutateAsync(layout.id);
      if (activeLayoutName === name) { setActiveLayoutName(null); setLayoutModified(false); }
      toast.info(`Layout "${name}" deleted`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete layout");
    }
  }, [layoutsByName, deleteLayoutMutation, activeLayoutName]);

  const toggleDefaultLayout = useCallback(async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const layout = layoutsByName[name];
    if (!layout) return;
    try {
      await setDefaultMutation.mutateAsync({ id: layout.id, makeDefault: !layout.is_default });
      toast.info(layout.is_default ? `"${name}" removed as default` : `"${name}" set as default layout`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update default");
    }
  }, [layoutsByName, setDefaultMutation]);

  const resetLayout = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.setFilterModel(null);
    api.resetColumnState();
    api.setRowGroupColumns([]);
    setQuickFilter("");
    setActiveLayoutName(null);
    setLayoutModified(false);
    toast.info("Layout reset");
  }, []);

  const autoSizeAllColumns = useCallback(() => {
    gridRef.current?.api.autoSizeAllColumns();
  }, []);

  const hasAppliedDefault = useRef(false);
  const isFirstDataRendered = useRef(false);
  const applyDefaultIfReady = useCallback(() => {
    if (hasAppliedDefault.current) return;
    if (!isFirstDataRendered.current) return;
    if (!layoutsFetched) return;
    const api = gridRef.current?.api;
    if (!api) return;
    if (defaultLayout) {
      api.applyColumnState({ state: defaultLayout.column_state as ColumnState[], applyOrder: true });
      if (defaultLayout.row_group_columns?.length) api.setRowGroupColumns(defaultLayout.row_group_columns);
      if (defaultLayout.filter_model && Object.keys(defaultLayout.filter_model).length) {
        api.setFilterModel(defaultLayout.filter_model);
      }
      setActiveLayoutName(defaultLayout.name);
      setLayoutModified(false);
    } else {
      api.autoSizeAllColumns(false);
    }
    hasAppliedDefault.current = true;
  }, [defaultLayout, layoutsFetched]);

  const handleFirstDataRendered = useCallback(() => {
    isFirstDataRendered.current = true;
    applyDefaultIfReady();
  }, [applyDefaultIfReady]);

  useEffect(() => { applyDefaultIfReady(); }, [applyDefaultIfReady]);

  const handleFilterChanged = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    const model = api.getFilterModel() ?? {};
    setActiveFilterCount(Object.keys(model).length);
    if (hasAppliedDefault.current && activeLayoutName) setLayoutModified(true);
  }, [activeLayoutName]);

  const handleLayoutDirty = useCallback(() => {
    if (hasAppliedDefault.current && activeLayoutName) setLayoutModified(true);
  }, [activeLayoutName]);

  const clearAllFilters = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.setFilterModel(null);
    setQuickFilter("");
  }, []);

  const themeClass = theme === "dark" ? "ag-theme-alpine-dark" : "ag-theme-alpine";

  return (
    <div className={isFullscreen
      ? "fixed inset-0 z-50 bg-zinc-50 dark:bg-zinc-950 p-4 flex overflow-hidden"
      : "h-full flex overflow-hidden px-4 py-4"
    }>
      <div className="flex-1 min-h-0 flex overflow-hidden border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-950">
        {/* Sidebar: Size presets */}
        <aside className="w-60 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 flex flex-col overflow-hidden rounded-l-md">
          <div className="flex-1 overflow-y-auto px-3 py-3">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Size</div>
            <div className="space-y-0.5">
              {SIZE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setSizeFilter(preset.id)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[13px]",
                    sizeFilter === preset.id
                      ? "bg-teal-100 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
                  )}
                >
                  <span className="flex items-center gap-2">
                    {preset.id === "all" ? <Layers size={13} /> : <Users size={13} />}
                    {preset.label}
                  </span>
                  <span className="text-[11px] text-zinc-500">{sizeCounts[preset.id]}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Main column */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2 flex-shrink-0">
            <input
              type="text"
              value={quickFilter}
              onChange={(e) => setQuickFilter(e.target.value)}
              placeholder="Quick filter..."
              className="max-w-md flex-1 px-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            <span className="text-[11px] text-zinc-400 whitespace-nowrap">{rowData.length} group{rowData.length === 1 ? "" : "s"}</span>

            {(activeFilterCount > 0 || quickFilter.trim().length > 0) && (
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60 transition-colors whitespace-nowrap"
                title="Clear all filters"
              >
                <span>
                  {activeFilterCount + (quickFilter.trim().length > 0 ? 1 : 0)} filter{activeFilterCount + (quickFilter.trim().length > 0 ? 1 : 0) === 1 ? "" : "s"} active
                </span>
                <X size={11} />
              </button>
            )}

            <div className="flex-1" />

            <button
              onClick={onNewGroup}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md bg-teal-600 text-white hover:bg-teal-700 transition-colors"
            >
              <Plus size={11} /> New
            </button>

            {/* Layouts dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowLayoutMenu(!showLayoutMenu)}
                className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                title={activeLayoutName ? `Current layout: ${activeLayoutName}${layoutModified ? " (modified)" : ""}` : "Layouts"}
              >
                <Bookmark size={11} />
                {activeLayoutName ? (
                  <span className="flex items-center gap-1">
                    <span className="max-w-[110px] truncate">{activeLayoutName}</span>
                    {layoutModified && <span className="text-amber-500" title="Layout has unsaved changes">•</span>}
                  </span>
                ) : (
                  <span>Layouts</span>
                )}
              </button>
              {showLayoutMenu && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-800 z-50 py-1">
                  <button onClick={() => { autoSizeAllColumns(); setShowLayoutMenu(false); }} className="w-full px-3 py-2 text-left text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center gap-2">
                    <ChevronsLeftRight size={12} /> Auto-fit Columns
                  </button>
                  <button onClick={() => { resetLayout(); setShowLayoutMenu(false); }} className="w-full px-3 py-2 text-left text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center gap-2">
                    <RotateCcw size={12} /> Reset Layout
                  </button>
                  <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />
                  <button onClick={() => { setShowLayoutMenu(false); setShowSaveDialog(true); }} className="w-full px-3 py-2 text-left text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center gap-2">
                    <span className="text-green-600 dark:text-green-400">+</span> Save current layout...
                  </button>
                  {layouts.length > 0 && (
                    <>
                      <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />
                      <div className="px-3 py-1 text-[10px] font-medium text-zinc-500 uppercase tracking-wide">Shared Layouts</div>
                      {layouts.map((layout) => (
                        <div key={layout.id} onClick={() => loadLayout(layout.name)} className="w-full px-3 py-2 text-left text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center justify-between cursor-pointer group">
                          <span className="truncate flex items-center gap-1.5">
                            {layout.is_default && <Star size={10} className="text-amber-500 fill-amber-500" />}
                            {layout.name}
                          </span>
                          <div className="flex items-center gap-0.5">
                            <button onClick={(e) => { e.stopPropagation(); saveCurrentLayout(layout.name); }} className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-400 hover:text-teal-500" title="Overwrite with current layout"><Save size={11} /></button>
                            <button onClick={(e) => toggleDefaultLayout(layout.name, e)} className={cn("p-1 rounded", layout.is_default ? "text-amber-500" : "opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-amber-500")} title={layout.is_default ? "Remove as default" : "Set as default"}><Star size={11} className={layout.is_default ? "fill-amber-500" : ""} /></button>
                            <button onClick={(e) => deleteLayout(layout.name, e)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500 dark:text-red-400" title="Delete layout"><X size={11} /></button>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className={cn(
                "flex items-center justify-center p-1.5 rounded-md border transition-colors",
                isFullscreen
                  ? "border-teal-500 bg-teal-500/20 text-teal-600 dark:text-teal-400"
                  : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              )}
              title={isFullscreen ? "Exit fullscreen (ESC)" : "Enter fullscreen"}
            >
              {isFullscreen ? <X size={12} /> : <Maximize2 size={12} />}
            </button>
          </div>

          {/* AG Grid */}
          <div className={`${themeClass} flex-1 min-h-0`} style={{ width: "100%" }}>
            <style>{themeStyles}{`
              .ag-theme-alpine .ag-cell,
              .ag-theme-alpine-dark .ag-cell { display: flex; align-items: center; }
            `}</style>
            {isLoading ? (
              <div className="flex items-center justify-center h-full text-xs text-zinc-400">Loading...</div>
            ) : (
              <AgGridReact<GroupRow>
                ref={gridRef}
                theme="legacy"
                rowData={rowData}
                columnDefs={columnDefs}
                defaultColDef={defaultColDef}
                getRowId={getRowId}
                rowHeight={40}
                headerHeight={32}
                floatingFiltersHeight={30}
                animateRows
                enableBrowserTooltips
                rowSelection="single"
                suppressRowClickSelection
                quickFilterText={quickFilter}
                onFirstDataRendered={handleFirstDataRendered}
                onFilterChanged={handleFilterChanged}
                onColumnMoved={handleLayoutDirty}
                onColumnResized={handleLayoutDirty}
                onColumnVisible={handleLayoutDirty}
                onColumnPinned={handleLayoutDirty}
                onSortChanged={handleLayoutDirty}
                onRowClicked={(e) => { if (e.data?.id) onSelect(e.data.id === selectedId ? null : e.data.id); }}
                sideBar={{
                  toolPanels: [
                    { id: "columns", labelDefault: "Columns", labelKey: "columns", iconKey: "columns", toolPanel: "agColumnsToolPanel" },
                    { id: "filters", labelDefault: "Filters", labelKey: "filters", iconKey: "filter", toolPanel: "agFiltersToolPanel" },
                  ],
                  defaultToolPanel: "",
                }}
                pagination
                paginationPageSize={100}
                paginationPageSizeSelector={[50, 100, 200, 500]}
              />
            )}
          </div>
        </div>
      </div>

      {showSaveDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-lg p-6 w-96 max-w-[90vw] border border-zinc-200 dark:border-zinc-800">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Save Layout</h3>
            <input
              type="text"
              value={newLayoutName}
              onChange={(e) => setNewLayoutName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newLayoutName.trim()) saveCurrentLayout(newLayoutName);
                else if (e.key === "Escape") { setShowSaveDialog(false); setNewLayoutName(""); }
              }}
              placeholder="Enter layout name..."
              className="w-full px-3 py-2 text-sm rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowSaveDialog(false); setNewLayoutName(""); }} className="px-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700">Cancel</button>
              <button onClick={() => saveCurrentLayout(newLayoutName)} disabled={!newLayoutName.trim()} className="px-3 py-1.5 text-xs rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}

      {showLayoutMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowLayoutMenu(false)} />
      )}
    </div>
  );
}
