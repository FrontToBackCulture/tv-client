// src/modules/email/CampaignsView.tsx
// Campaigns AG Grid — sidebar with category presets, shared layouts, floating filters.

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
import { Plus, Copy, Trash2, Layers, Bookmark, Star, Save, RotateCcw, ChevronsLeftRight, X, Maximize2 } from "lucide-react";
import { useEmailCampaigns, useDeleteEmailCampaign, useCloneEmailCampaign } from "../../hooks/email";
import { CAMPAIGN_STATUSES } from "../../lib/email/types";
import type { EmailCampaignWithStats } from "../../lib/email/types";
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

const GRID_KEY = "email-campaigns";
const UNCATEGORIZED = "(uncategorized)";

const STATUS_COLORS: Record<string, string> = {
  gray:   "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  blue:   "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  green:  "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  red:    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

interface CampaignRow {
  id: string;
  name: string;
  description: string;
  category: string;
  status: string;
  statusLabel: string;
  statusColor: string;
  groupName: string;
  recipientCount: number;
  opens: number;
  clicks: number;
  sentAt: string | null;
  sentTs: number;
  createdAt: string | null;
  createdTs: number;
}

interface CampaignsViewProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onNewCampaign: () => void;
}

export function CampaignsView({ selectedId, onSelect, onNewCampaign }: CampaignsViewProps) {
  const theme = useAppStore((s) => s.theme);
  const [quickFilter, setQuickFilter] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const gridRef = useRef<AgGridReact<CampaignRow>>(null);

  const { data: campaigns = [], isLoading } = useEmailCampaigns();
  const deleteCampaign = useDeleteEmailCampaign();
  const cloneCampaign = useCloneEmailCampaign();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) setIsFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  // Sidebar categories
  const categoriesWithCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of campaigns) {
      const k = c.category || UNCATEGORIZED;
      map.set(k, (map.get(k) || 0) + 1);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [campaigns]);

  // Rows (filtered by sidebar category)
  const rowData = useMemo<CampaignRow[]>(() => {
    const filtered = categoryFilter === "all"
      ? campaigns
      : campaigns.filter((c) => (c.category || UNCATEGORIZED) === categoryFilter);
    return filtered.map((c) => {
      const statusDef = CAMPAIGN_STATUSES.find((s) => s.value === c.status);
      return {
        id: c.id,
        name: c.name || "(untitled)",
        description: (c as any).subject || (c as any).description || "",
        category: c.category || UNCATEGORIZED,
        status: c.status,
        statusLabel: statusDef?.label ?? c.status,
        statusColor: statusDef?.color ?? "gray",
        groupName: (c as EmailCampaignWithStats).group?.name || "",
        recipientCount: (c as EmailCampaignWithStats).recipientCount ?? 0,
        opens: (c as EmailCampaignWithStats).stats?.opened ?? 0,
        clicks: (c as EmailCampaignWithStats).stats?.clicked ?? 0,
        sentAt: c.sent_at || null,
        sentTs: c.sent_at ? new Date(c.sent_at).getTime() : 0,
        createdAt: c.created_at || null,
        createdTs: c.created_at ? new Date(c.created_at).getTime() : 0,
      };
    });
  }, [campaigns, categoryFilter]);

  const handleClone = useCallback(async (id: string) => {
    const cloned = await cloneCampaign.mutateAsync(id);
    onSelect(cloned.id);
  }, [cloneCampaign, onSelect]);

  const handleDelete = useCallback(async (id: string) => {
    if (!window.confirm("Delete this campaign?")) return;
    await deleteCampaign.mutateAsync(id);
    if (selectedId === id) onSelect(null);
  }, [deleteCampaign, onSelect, selectedId]);

  const columnDefs = useMemo<ColDef<CampaignRow>[]>(() => [
    {
      field: "name",
      headerName: "Name",
      flex: 2,
      minWidth: 280,
      pinned: "left",
      filter: "agTextColumnFilter",
      cellRenderer: (p: { data?: CampaignRow; value: string }) => {
        if (!p.data) return null;
        return (
          <span className="flex flex-col min-w-0">
            <span className="text-xs font-medium text-zinc-800 dark:text-zinc-100 truncate">{p.value}</span>
            {p.data.description && (
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">{p.data.description}</span>
            )}
          </span>
        );
      },
    },
    {
      field: "category",
      headerName: "Category",
      width: 180,
      filter: "agSetColumnFilter",
      cellRenderer: (p: { value: string }) => (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 font-medium">{p.value}</span>
      ),
    },
    {
      field: "status",
      headerName: "Status",
      width: 110,
      filter: "agSetColumnFilter",
      cellRenderer: (p: { data?: CampaignRow }) => {
        if (!p.data) return null;
        return <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", STATUS_COLORS[p.data.statusColor] || STATUS_COLORS.gray)}>{p.data.statusLabel}</span>;
      },
    },
    {
      field: "groupName",
      headerName: "Recipient Group",
      width: 160,
      filter: "agSetColumnFilter",
      cellClass: "text-xs text-zinc-600 dark:text-zinc-400",
    },
    {
      field: "recipientCount",
      headerName: "Recipients",
      width: 110,
      filter: "agNumberColumnFilter",
      cellClass: "text-xs text-zinc-500 dark:text-zinc-400 tabular-nums",
      valueFormatter: (p) => p.value ? String(p.value) : "—",
    },
    {
      field: "opens",
      headerName: "Opens",
      width: 90,
      filter: "agNumberColumnFilter",
      cellClass: "text-xs text-zinc-500 dark:text-zinc-400 tabular-nums",
      valueFormatter: (p) => p.value ? String(p.value) : "—",
    },
    {
      field: "clicks",
      headerName: "Clicks",
      width: 90,
      filter: "agNumberColumnFilter",
      cellClass: "text-xs text-zinc-500 dark:text-zinc-400 tabular-nums",
      valueFormatter: (p) => p.value ? String(p.value) : "—",
    },
    {
      field: "sentTs",
      headerName: "Sent",
      width: 130,
      filter: "agNumberColumnFilter",
      sort: "desc",
      sortIndex: 0,
      valueFormatter: (p: { data?: CampaignRow }) => {
        if (!p.data?.sentAt) return "—";
        return new Date(p.data.sentAt).toLocaleDateString("en-SG", { year: "numeric", month: "short", day: "2-digit" });
      },
      cellClass: "text-xs text-zinc-500 dark:text-zinc-400",
    },
    {
      field: "createdTs",
      headerName: "Created",
      width: 130,
      filter: "agNumberColumnFilter",
      valueFormatter: (p: { data?: CampaignRow }) => {
        if (!p.data?.createdAt) return "—";
        return new Date(p.data.createdAt).toLocaleDateString("en-SG", { year: "numeric", month: "short", day: "2-digit" });
      },
      cellClass: "text-xs text-zinc-500 dark:text-zinc-400",
    },
    {
      headerName: "",
      width: 80,
      sortable: false,
      filter: false,
      resizable: false,
      cellRenderer: (p: { data?: CampaignRow }) => {
        if (!p.data) return null;
        return (
          <span className="flex items-center gap-0.5">
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); handleClone(p.data!.id); }}
              className="p-1 text-zinc-400 hover:text-teal-500 transition-colors"
              title="Clone"
            >
              <Copy size={12} />
            </button>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); handleDelete(p.data!.id); }}
              className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
              title="Delete"
            >
              <Trash2 size={12} />
            </button>
          </span>
        );
      },
    },
  ], [handleClone, handleDelete]);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    filter: true,
    floatingFilter: true,
    tooltipShowDelay: 500,
    cellClass: "text-xs",
  }), []);

  const getRowId = useCallback((params: GetRowIdParams<CampaignRow>) => params.data.id, []);

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
        {/* Sidebar: Categories */}
        <aside className="w-60 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 flex flex-col overflow-hidden rounded-l-md">
          <div className="flex-1 overflow-y-auto px-3 py-3">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Categories</div>
            <div className="space-y-0.5">
              <button
                onClick={() => setCategoryFilter("all")}
                className={cn(
                  "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[13px]",
                  categoryFilter === "all"
                    ? "bg-teal-100 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
                )}
              >
                <span className="flex items-center gap-2"><Layers size={13} /> All</span>
                <span className="text-[11px] text-zinc-500">{campaigns.length}</span>
              </button>
              {categoriesWithCount.map(([cat, count]) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[13px]",
                    categoryFilter === cat
                      ? "bg-teal-100 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
                  )}
                >
                  <span className="truncate">{cat}</span>
                  <span className="text-[11px] text-zinc-500">{count}</span>
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
            <span className="text-[11px] text-zinc-400 whitespace-nowrap">{rowData.length} campaign{rowData.length === 1 ? "" : "s"}</span>

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
              onClick={onNewCampaign}
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
              <AgGridReact<CampaignRow>
                ref={gridRef}
                theme="legacy"
                rowData={rowData}
                columnDefs={columnDefs}
                defaultColDef={defaultColDef}
                getRowId={getRowId}
                rowHeight={44}
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
                onRowClicked={(e) => { if (e.data?.id) onSelect(e.data.id); }}
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
