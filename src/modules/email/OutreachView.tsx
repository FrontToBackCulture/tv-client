// src/modules/email/OutreachView.tsx
// Outreach draft AG Grid — review automation-generated emails before pushing to Outlook.
// Matches the shared grid standard: sidebar view presets, toolbar with filter-pill +
// layouts badge + fullscreen, floating filters, Supabase-shared layouts (grid_key = "outreach-drafts").

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
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
import { Send, Trash2, Layers, Inbox, CheckCircle2, Archive, Clock, Bookmark, Star, Save, RotateCcw, ChevronsLeftRight, X, Maximize2 } from "lucide-react";
import { useOutreachDrafts, useBatchApproveOutreach } from "../../hooks/email";
import { useDraftTracking, useDeleteDraft } from "../../hooks/email/useDrafts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
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

// ─── Status config ───────────────────────────────────────────────────────────

type StatusFilter = "all" | "draft" | "approved" | "sent" | "skipped";

const VIEWS: { id: StatusFilter; label: string; icon: typeof Layers; color?: string }[] = [
  { id: "all",      label: "All",            icon: Layers },
  { id: "draft",    label: "Pending Review", icon: Clock,        color: "#F59E0B" },
  { id: "approved", label: "Approved",       icon: Inbox,        color: "#3B82F6" },
  { id: "sent",     label: "Sent",           icon: CheckCircle2, color: "#10B981" },
  { id: "skipped",  label: "Skipped",        icon: Archive,      color: "#6B7280" },
];

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  draft:    { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400", label: "Pending" },
  approved: { bg: "bg-blue-100 dark:bg-blue-900/30",   text: "text-blue-700 dark:text-blue-400",   label: "In Outlook" },
  sent:     { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", label: "Sent" },
  failed:   { bg: "bg-red-100 dark:bg-red-900/30",     text: "text-red-700 dark:text-red-400",     label: "Failed" },
  skipped:  { bg: "bg-zinc-100 dark:bg-zinc-800",      text: "text-zinc-500 dark:text-zinc-400",   label: "Skipped" },
};

// ─── Tracking badges (cell renderer) ─────────────────────────────────────────

function TrackingCell({ data }: { data?: OutreachRow }) {
  if (!data) return null;
  const isApprovedOrSent = data.status === "approved" || data.status === "sent";
  const { data: tracking } = useDraftTracking(data.id, isApprovedOrSent);
  const { data: hasPixel } = useQuery({
    queryKey: ["outreach-has-pixel", data.id],
    queryFn: async () => {
      const { data: ev } = await supabase
        .from("email_events")
        .select("id")
        .eq("draft_id", data.id)
        .eq("event_type", "sent")
        .limit(1);
      return (ev?.length ?? 0) > 0;
    },
    enabled: isApprovedOrSent,
  });

  if (!isApprovedOrSent) return <span className="text-zinc-400 text-[10px]">—</span>;

  return (
    <span className="flex items-center gap-1 flex-wrap">
      {hasPixel !== undefined && (
        hasPixel ? (
          <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 font-medium">Tracked</span>
        ) : (
          <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-medium">No Pixel</span>
        )
      )}
      {tracking?.opened && (
        <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium">Opened</span>
      )}
      {tracking && tracking.clicks.length > 0 && (
        <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-medium">
          {tracking.clicks.length} click{tracking.clicks.length !== 1 ? "s" : ""}
        </span>
      )}
    </span>
  );
}

// ─── Row shape ───────────────────────────────────────────────────────────────

interface OutreachRow {
  id: string;
  status: string;
  contact: string;
  toEmail: string;
  company: string;
  subject: string;
  createdAt: string;
  createdTs: number;
}

// ─── View ────────────────────────────────────────────────────────────────────

interface OutreachViewProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const GRID_KEY = "outreach-drafts";

export function OutreachView({ selectedId, onSelect }: OutreachViewProps) {
  const theme = useAppStore((s) => s.theme);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("draft");
  const [quickFilter, setQuickFilter] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const gridRef = useRef<AgGridReact<OutreachRow>>(null);

  const { data: drafts = [], isLoading } = useOutreachDrafts(
    statusFilter === "all" ? undefined : statusFilter
  );
  const batchApprove = useBatchApproveOutreach();
  const deleteDraft = useDeleteDraft();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) setIsFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  // Map drafts → grid rows
  const rowData = useMemo<OutreachRow[]>(() => drafts.map((d) => ({
    id: d.id,
    status: d.status,
    contact: d.crm_contacts?.name || d.to_email,
    toEmail: d.to_email,
    company: d.crm_companies?.name || "",
    subject: d.subject,
    createdAt: d.created_at,
    createdTs: d.created_at ? new Date(d.created_at).getTime() : 0,
  })), [drafts]);

  // View counts for sidebar
  const viewCounts = useMemo<Record<StatusFilter, number>>(() => {
    // We only have the current statusFilter's drafts in `drafts`. For a
    // consistent sidebar we leave unknown counts blank (0) when not loaded.
    const counts: Record<StatusFilter, number> = { all: 0, draft: 0, approved: 0, sent: 0, skipped: 0 };
    if (statusFilter === "all") {
      counts.all = drafts.length;
      for (const d of drafts) {
        const s = d.status as StatusFilter;
        if (counts[s] !== undefined) counts[s]++;
      }
    } else {
      counts[statusFilter] = drafts.length;
    }
    return counts;
  }, [drafts, statusFilter]);

  const columnDefs = useMemo<ColDef<OutreachRow>[]>(() => [
    {
      headerCheckboxSelection: true,
      checkboxSelection: (p) => p.data?.status === "draft",
      width: 40,
      pinned: "left",
      sortable: false,
      filter: false,
      resizable: false,
    },
    {
      field: "contact",
      headerName: "Contact",
      flex: 1,
      minWidth: 180,
      pinned: "left",
      filter: "agTextColumnFilter",
      cellRenderer: (p: { data?: OutreachRow; value: string }) => {
        if (!p.data) return null;
        return (
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs font-medium text-zinc-800 dark:text-zinc-100 truncate">{p.value}</span>
            {p.value !== p.data.toEmail && (
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">&lt;{p.data.toEmail}&gt;</span>
            )}
          </span>
        );
      },
    },
    {
      field: "company",
      headerName: "Company",
      width: 180,
      filter: "agTextColumnFilter",
      cellClass: "text-xs text-zinc-500 dark:text-zinc-400",
    },
    {
      field: "subject",
      headerName: "Subject",
      flex: 2,
      minWidth: 260,
      filter: "agTextColumnFilter",
      cellClass: "text-xs text-zinc-600 dark:text-zinc-300",
    },
    {
      field: "status",
      headerName: "Status",
      width: 120,
      filter: "agSetColumnFilter",
      cellRenderer: (p: { value: string }) => {
        const badge = STATUS_BADGE[p.value] || STATUS_BADGE.draft;
        return <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", badge.bg, badge.text)}>{badge.label}</span>;
      },
    },
    {
      headerName: "Tracking",
      width: 180,
      sortable: false,
      filter: false,
      cellRenderer: TrackingCell,
    },
    {
      field: "createdTs",
      headerName: "Created",
      width: 160,
      sort: "desc",
      sortIndex: 0,
      filter: "agNumberColumnFilter",
      valueFormatter: (p: { data?: OutreachRow }) => {
        if (!p.data?.createdAt) return "—";
        const d = new Date(p.data.createdAt);
        return d.toLocaleString("en-SG", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
      },
      cellClass: "text-xs text-zinc-500 dark:text-zinc-400",
    },
    {
      headerName: "",
      width: 50,
      sortable: false,
      filter: false,
      resizable: false,
      cellRenderer: (p: { data?: OutreachRow }) => {
        if (!p.data) return null;
        return (
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              deleteDraft.mutate(p.data!.id);
              if (selectedId === p.data!.id) onSelect(null);
            }}
            className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
            title="Delete draft"
          >
            <Trash2 size={12} />
          </button>
        );
      },
    },
  ], [deleteDraft, onSelect, selectedId]);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    filter: true,
    floatingFilter: true,
    tooltipShowDelay: 500,
    cellClass: "text-xs",
  }), []);

  const getRowId = useCallback((params: GetRowIdParams<OutreachRow>) => params.data.id, []);

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

  const pendingIds = useMemo(
    () => drafts.filter((d) => d.status === "draft").map((d) => d.id),
    [drafts]
  );

  const handleBatchApprove = async () => {
    const ids = selectedIds.size > 0
      ? Array.from(selectedIds).filter((id) => drafts.find((d) => d.id === id)?.status === "draft")
      : pendingIds;
    if (ids.length === 0) return;
    await batchApprove.mutateAsync(ids);
    setSelectedIds(new Set());
  };

  const themeClass = theme === "dark" ? "ag-theme-alpine-dark" : "ag-theme-alpine";

  return (
    <div className={isFullscreen
      ? "fixed inset-0 z-50 bg-zinc-50 dark:bg-zinc-950 p-4 flex overflow-hidden"
      : "h-full flex overflow-hidden px-4 py-4"
    }>
      <div className="flex-1 min-h-0 flex overflow-hidden border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-950">
        {/* Sidebar: View presets */}
        <aside className="w-56 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 flex flex-col overflow-hidden rounded-l-md">
          <div className="flex-1 overflow-y-auto px-3 py-3">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">View</div>
            <div className="space-y-0.5">
              {VIEWS.map((v) => {
                const Icon = v.icon;
                const active = statusFilter === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => { setStatusFilter(v.id); setSelectedIds(new Set()); }}
                    className={cn(
                      "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[13px]",
                      active
                        ? "bg-teal-100 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300"
                        : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <Icon size={13} style={v.color ? { color: v.color } : undefined} />
                      {v.label}
                    </span>
                    {viewCounts[v.id] > 0 && (
                      <span className="text-[11px] text-zinc-500">{viewCounts[v.id]}</span>
                    )}
                  </button>
                );
              })}
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
            <span className="text-[11px] text-zinc-400 whitespace-nowrap">{rowData.length} email{rowData.length === 1 ? "" : "s"}</span>

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

            {statusFilter === "draft" && pendingIds.length > 0 && (
              <button
                onClick={handleBatchApprove}
                disabled={batchApprove.isPending}
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                <Send size={10} />
                {batchApprove.isPending
                  ? "Pushing..."
                  : selectedIds.size > 0
                    ? `Approve ${selectedIds.size}`
                    : `Approve All (${pendingIds.length})`}
              </button>
            )}

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
                        <div
                          key={layout.id}
                          onClick={() => loadLayout(layout.name)}
                          className="w-full px-3 py-2 text-left text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center justify-between cursor-pointer group"
                        >
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
              <AgGridReact<OutreachRow>
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
                rowSelection="multiple"
                suppressRowClickSelection
                quickFilterText={quickFilter}
                onFirstDataRendered={handleFirstDataRendered}
                onFilterChanged={handleFilterChanged}
                onColumnMoved={handleLayoutDirty}
                onColumnResized={handleLayoutDirty}
                onColumnVisible={handleLayoutDirty}
                onColumnPinned={handleLayoutDirty}
                onSortChanged={handleLayoutDirty}
                onSelectionChanged={() => {
                  const api = gridRef.current?.api;
                  if (!api) return;
                  const ids = new Set<string>();
                  api.getSelectedNodes().forEach((n) => { if (n.data?.id) ids.add(n.data.id); });
                  setSelectedIds(ids);
                }}
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
