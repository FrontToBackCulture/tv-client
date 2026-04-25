// src/modules/public-data/PublicDataModule.tsx
// Public Data module — manage and sync public datasets for tryval

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { usePersistedModuleView } from "../../hooks/usePersistedModuleView";
import {
  Database,
  RefreshCw,
  Clock,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Loader2,
  Globe,
  Play,
  Briefcase,
  Layers,
  Bookmark,
  Star,
  Save,
  RotateCcw,
  ChevronsLeftRight,
  X,
  Maximize2,
} from "lucide-react";
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
import { JobReviewsView } from "./JobReviewsView";
import { ViewTab } from "../../components/ViewTab";
import { PageHeader } from "../../components/PageHeader";
import { useViewContextStore } from "../../stores/viewContextStore";
import { useSources, useSyncSource, useSyncAllP1, useClassifyJobs } from "../../hooks/public-data";
import { useIngestionLogs } from "../../hooks/public-data";
import type { DataSource, IngestionLog } from "../../lib/public-data/types";
import { STATUS_CONFIG, PRIORITY_LABELS, DOMAIN_LABELS, DATA_TYPE_LABELS } from "../../lib/public-data/types";
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

const GRID_KEY = "public-data-sources";

interface SourceRow {
  id: string;
  name: string;
  description: string;
  domain: string;
  domainLabel: string;
  priority: number;
  priorityLabel: string;
  dataType: string;
  dataTypeLabel: string;
  rowCount: number;
  syncStatus: string;
  syncStatusLabel: string;
  syncError: string | null;
  refreshFrequency: string;
  lastSyncedAt: string | null;
  lastSyncedTs: number;
  targetTable: string;
  enabled: boolean;
  raw: DataSource;
}

type ViewType = "sources" | "history" | "jobs";

export function PublicDataModule() {
  const [activeView, setActiveView] = usePersistedModuleView<ViewType>("public-data", "sources");
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  const setViewContext = useViewContextStore((s) => s.setView);
  useEffect(() => {
    const labels: Record<ViewType, string> = {
      sources: "Data Sources",
      history: "Sync History",
      jobs: "Job Postings",
    };
    setViewContext("public-data", labels[activeView]);
  }, [activeView, setViewContext]);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      <PageHeader
        description="Public data sources — government registries, incentive databases, and industry datasets."
        tabs={<>
          <ViewTab label="Sources" icon={Database} active={activeView === "sources"} onClick={() => setActiveView("sources")} />
          <ViewTab label="Jobs" icon={Briefcase} active={activeView === "jobs"} onClick={() => setActiveView("jobs")} />
          <ViewTab label="History" icon={Clock} active={activeView === "history"} onClick={() => setActiveView("history")} />
        </>}
        actions={<SyncAllButton />}
      />

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeView === "sources" && (
          <SourcesView selectedId={selectedSourceId} onSelect={setSelectedSourceId} />
        )}
        {activeView === "jobs" && <JobReviewsView />}
        {activeView === "history" && <HistoryView />}
      </div>
    </div>
  );
}

// ─── Sync All Button ────────────────────────────────────

function SyncAllButton() {
  const syncAll = useSyncAllP1();

  return (
    <button
      onClick={() => syncAll.mutate()}
      disabled={syncAll.isPending}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-lg transition-colors"
    >
      {syncAll.isPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
      Sync All
    </button>
  );
}

// ─── Sources View ───────────────────────────────────────

function SourcesView({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) {
  const theme = useAppStore((s) => s.theme);
  const { data: sources = [], isLoading } = useSources();
  const syncSource = useSyncSource();
  const classify = useClassifyJobs();

  const [quickFilter, setQuickFilter] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const gridRef = useRef<AgGridReact<SourceRow>>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) setIsFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  // Sidebar domain counts
  const domainsWithCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sources) map.set(s.domain, (map.get(s.domain) || 0) + 1);
    return Array.from(map.entries()).sort(([a], [b]) =>
      (DOMAIN_LABELS[a] || a).localeCompare(DOMAIN_LABELS[b] || b),
    );
  }, [sources]);

  // Rows (filtered by sidebar domain)
  const rowData = useMemo<SourceRow[]>(() => {
    const filtered = domainFilter === "all"
      ? sources
      : sources.filter((s) => s.domain === domainFilter);
    return filtered.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description || "",
      domain: s.domain,
      domainLabel: DOMAIN_LABELS[s.domain] || s.domain,
      priority: s.priority,
      priorityLabel: PRIORITY_LABELS[s.priority] || `P${s.priority}`,
      dataType: s.data_type,
      dataTypeLabel: DATA_TYPE_LABELS[s.data_type] || s.data_type,
      rowCount: s.row_count ?? 0,
      syncStatus: s.sync_status,
      syncStatusLabel: STATUS_CONFIG[s.sync_status]?.label || s.sync_status,
      syncError: s.sync_error,
      refreshFrequency: s.refresh_frequency,
      lastSyncedAt: s.last_synced_at,
      lastSyncedTs: s.last_synced_at ? new Date(s.last_synced_at).getTime() : 0,
      targetTable: s.target_table,
      enabled: s.enabled,
      raw: s,
    }));
  }, [sources, domainFilter]);

  const handleSync = useCallback((id: string, name: string) => {
    syncSource.mutate({ id, name });
  }, [syncSource]);

  const handleClassify = useCallback(() => {
    classify.mutate();
  }, [classify]);

  const columnDefs = useMemo<ColDef<SourceRow>[]>(() => [
    {
      headerName: "",
      width: 40,
      sortable: false,
      filter: false,
      resizable: false,
      pinned: "left",
      cellRenderer: (p: { data?: SourceRow }) => {
        if (!p.data) return null;
        if (p.data.syncStatus === "success") return <CheckCircle2 size={14} className="text-green-500" />;
        if (p.data.syncStatus === "error")   return <AlertCircle size={14} className="text-red-500" />;
        if (p.data.syncStatus === "running") return <Loader2 size={14} className="text-blue-500 animate-spin" />;
        return <Globe size={14} className="text-zinc-400" />;
      },
    },
    {
      field: "name",
      headerName: "Name",
      flex: 2,
      minWidth: 260,
      pinned: "left",
      filter: "agTextColumnFilter",
      cellRenderer: (p: { data?: SourceRow; value: string }) => {
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
      field: "domainLabel",
      headerName: "Domain",
      width: 130,
      filter: "agSetColumnFilter",
      cellRenderer: (p: { value: string }) => (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 font-medium">{p.value}</span>
      ),
    },
    {
      field: "priorityLabel",
      headerName: "Priority",
      width: 90,
      filter: "agSetColumnFilter",
      cellRenderer: (p: { value: string }) => (
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">{p.value}</span>
      ),
    },
    {
      field: "dataTypeLabel",
      headerName: "Type",
      width: 110,
      filter: "agSetColumnFilter",
      cellRenderer: (p: { data?: SourceRow }) => {
        if (!p.data) return null;
        return <DataTypePill dataType={p.data.dataType} />;
      },
    },
    {
      field: "rowCount",
      headerName: "Rows",
      width: 110,
      filter: "agNumberColumnFilter",
      cellClass: "text-xs text-zinc-600 dark:text-zinc-400 tabular-nums",
      valueFormatter: (p) => p.value > 0 ? p.value.toLocaleString() : "—",
    },
    {
      field: "syncStatusLabel",
      headerName: "Status",
      width: 120,
      filter: "agSetColumnFilter",
      cellRenderer: (p: { data?: SourceRow }) => {
        if (!p.data) return null;
        return <StatusBadge status={p.data.syncStatus} />;
      },
    },
    {
      field: "refreshFrequency",
      headerName: "Refresh",
      width: 110,
      filter: "agSetColumnFilter",
      cellClass: "text-xs text-zinc-500 dark:text-zinc-400",
    },
    {
      field: "lastSyncedTs",
      headerName: "Last Synced",
      width: 140,
      filter: "agNumberColumnFilter",
      sort: "desc",
      sortIndex: 0,
      valueFormatter: (p: { data?: SourceRow }) => {
        if (!p.data?.lastSyncedAt) return "never";
        return new Date(p.data.lastSyncedAt).toLocaleString("en-SG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      },
      cellClass: "text-xs text-zinc-500 dark:text-zinc-400",
    },
    {
      headerName: "",
      width: 110,
      sortable: false,
      filter: false,
      resizable: false,
      cellRenderer: (p: { data?: SourceRow }) => {
        if (!p.data) return null;
        const isMcf = p.data.targetTable?.includes("mcf_job_postings");
        const isRunning = p.data.syncStatus === "running";
        return (
          <span className="flex items-center gap-0.5">
            {isMcf && (
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); handleClassify(); }}
                disabled={classify.isPending}
                className="flex items-center gap-1 px-1.5 py-1 text-[10px] font-medium text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30 disabled:opacity-50 rounded"
                title="Classify jobs with AI"
              >
                {classify.isPending ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
              </button>
            )}
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); handleSync(p.data!.id, p.data!.name); }}
              disabled={isRunning || syncSource.isPending}
              className="p-1 text-zinc-400 hover:text-teal-500 disabled:opacity-50 transition-colors"
              title="Sync now"
            >
              {isRunning ? <Loader2 size={12} className="text-blue-500 animate-spin" /> : <RefreshCw size={12} />}
            </button>
          </span>
        );
      },
    },
  ], [handleSync, handleClassify, classify.isPending, syncSource.isPending]);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    filter: true,
    floatingFilter: true,
    tooltipShowDelay: 500,
    cellClass: "text-xs",
  }), []);

  const getRowId = useCallback((params: GetRowIdParams<SourceRow>) => params.data.id, []);

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
        {/* Sidebar: Domains */}
        <aside className="w-60 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 flex flex-col overflow-hidden rounded-l-md">
          <div className="flex-1 overflow-y-auto px-3 py-3">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Domain</div>
            <div className="space-y-0.5">
              <button
                onClick={() => setDomainFilter("all")}
                className={cn(
                  "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[13px]",
                  domainFilter === "all"
                    ? "bg-teal-100 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
                )}
              >
                <span className="flex items-center gap-2"><Layers size={13} /> All</span>
                <span className="text-[11px] text-zinc-500">{sources.length}</span>
              </button>
              {domainsWithCount.map(([dom, count]) => (
                <button
                  key={dom}
                  onClick={() => setDomainFilter(dom)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[13px]",
                    domainFilter === dom
                      ? "bg-teal-100 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
                  )}
                >
                  <span className="truncate">{DOMAIN_LABELS[dom] || dom}</span>
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
            <span className="text-[11px] text-zinc-400 whitespace-nowrap">{rowData.length} source{rowData.length === 1 ? "" : "s"}</span>

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

          {/* AG Grid + detail */}
          <div className="flex-1 min-h-0 flex overflow-hidden">
            <div className={`${themeClass} flex-1 min-h-0`} style={{ width: "100%" }}>
              <style>{themeStyles}{`
                .ag-theme-alpine .ag-cell,
                .ag-theme-alpine-dark .ag-cell { display: flex; align-items: center; }
              `}</style>
              {isLoading ? (
                <div className="flex items-center justify-center h-full text-xs text-zinc-400">
                  <Loader2 size={16} className="animate-spin" />
                </div>
              ) : (
                <AgGridReact<SourceRow>
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

            {selectedId && (
              <SourceDetailPanel sourceId={selectedId} onClose={() => onSelect(null)} />
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

// ─── Source Detail Panel ────────────────────────────────

function SourceDetailPanel({ sourceId }: { sourceId: string; onClose?: () => void }) {
  const { data: sources = [] } = useSources();
  const source = sources.find((s) => s.id === sourceId);
  const { data: logs = [] } = useIngestionLogs(sourceId, 10);
  const syncSource = useSyncSource();

  if (!source) return null;

  return (
    <div className="w-[420px] flex-shrink-0 border-l border-zinc-200 dark:border-zinc-800 overflow-y-auto bg-white dark:bg-zinc-950">
      <div className="p-4 space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{source.name}</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{source.description}</p>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Rows" value={source.row_count > 0 ? source.row_count.toLocaleString() : "—"} />
          <StatCard label="Status" value={STATUS_CONFIG[source.sync_status]?.label || source.sync_status} />
          <StatCard label="Type" value={DATA_TYPE_LABELS[source.data_type] || source.data_type} />
          <StatCard label="Refresh" value={source.refresh_frequency} />
        </div>

        {/* Error display */}
        {source.sync_status === "error" && source.sync_error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
            <p className="text-xs text-red-700 dark:text-red-300 font-mono">{source.sync_error}</p>
          </div>
        )}

        {/* Sync button */}
        <button
          onClick={() => syncSource.mutate({ id: source.id, name: source.name })}
          disabled={syncSource.isPending || source.sync_status === "running"}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-lg transition-colors"
        >
          {syncSource.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Sync Now
        </button>

        {/* Config */}
        <div>
          <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Configuration</h3>
          <pre className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3 overflow-x-auto">
            {JSON.stringify(source.api_config, null, 2)}
          </pre>
        </div>

        {/* Recent syncs */}
        <div>
          <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Recent Syncs</h3>
          {logs.length === 0 ? (
            <p className="text-xs text-zinc-400">No sync history yet</p>
          ) : (
            <div className="space-y-1.5">
              {logs.map((log) => (
                <LogRow key={log.id} log={log} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900">
      <div className="text-[11px] text-zinc-400 dark:text-zinc-500">{label}</div>
      <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mt-0.5">{value}</div>
    </div>
  );
}

// ─── History View ───────────────────────────────────────

function HistoryView() {
  const { data: logs = [], isLoading } = useIngestionLogs(undefined, 50);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-400">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-zinc-400">
        <Clock size={32} className="mb-2" />
        <p className="text-sm">No sync history yet</p>
        <p className="text-xs mt-1">Run a sync from the Sources tab to get started</p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
          <tr>
            <th className="text-left px-4 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">Source</th>
            <th className="text-left px-4 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">Status</th>
            <th className="text-right px-4 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">Rows</th>
            <th className="text-right px-4 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">Duration</th>
            <th className="text-right px-4 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">When</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900">
              <td className="px-4 py-2 text-zinc-900 dark:text-zinc-100 font-medium">{log.source_id}</td>
              <td className="px-4 py-2">
                <StatusBadge status={log.status} />
              </td>
              <td className="px-4 py-2 text-right text-zinc-600 dark:text-zinc-400">
                {log.rows_upserted > 0 ? log.rows_upserted.toLocaleString() : "—"}
              </td>
              <td className="px-4 py-2 text-right text-zinc-600 dark:text-zinc-400">
                {log.duration_ms ? `${(log.duration_ms / 1000).toFixed(1)}s` : "—"}
              </td>
              <td className="px-4 py-2 text-right text-zinc-500 dark:text-zinc-400 text-xs">
                {new Date(log.started_at).toLocaleString("en-SG", {
                  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Shared Components ──────────────────────────────────

function LogRow({ log }: { log: IngestionLog }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 rounded bg-zinc-50 dark:bg-zinc-900">
      <div className="flex items-center gap-2">
        <StatusBadge status={log.status} />
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {log.rows_upserted > 0 ? `${log.rows_upserted.toLocaleString()} rows` : ""}
        </span>
      </div>
      <div className="text-[11px] text-zinc-400">
        {new Date(log.started_at).toLocaleString("en-SG", {
          day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
        })}
        {log.duration_ms ? ` (${(log.duration_ms / 1000).toFixed(1)}s)` : ""}
      </div>
    </div>
  );
}

function DataTypePill({ dataType }: { dataType: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    snapshot: { label: "Snapshot", cls: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400" },
    time_series_monthly: { label: "Monthly", cls: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" },
    time_series_quarterly: { label: "Quarterly", cls: "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400" },
    time_series_annual: { label: "Annual", cls: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" },
    realtime: { label: "Real-time", cls: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" },
  };
  const c = config[dataType] || { label: dataType, cls: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500" };

  return (
    <span className={`flex-shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${c.cls}`}>
      {c.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    success: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
    error: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
    running: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
  };

  return (
    <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${colors[status] || "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"}`}>
      {status}
    </span>
  );
}
