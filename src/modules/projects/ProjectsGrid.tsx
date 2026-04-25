// ProjectsGrid — AG Grid Enterprise table for all projects
// Standard treatment: sidebar presets, shared layouts (Supabase), floating filters,
// rounded bordered box wrapper, toolbar with filter pill + Layouts + Fullscreen.

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  ColDef, ColGroupDef, ColumnState, ModuleRegistry, AllCommunityModule,
  CellValueChangedEvent, GetRowIdParams,
} from "ag-grid-community";
import { AllEnterpriseModule, LicenseManager } from "ag-grid-enterprise";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import {
  Download, FileSpreadsheet, Maximize2, X, RotateCcw, Layers,
  ChevronsLeftRight, Bookmark, Star, Save, WrapText, Target,
  Hammer, CheckCircle2, PauseCircle, Clock, Activity,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { toSGTDateString } from "../../lib/date";
import { Button } from "../../components/ui";
import { useAppStore } from "../../stores/appStore";
import { toast } from "../../stores/toastStore";
import { groupRowStyles, themeStyles } from "../domains/reviewGridStyles";
import { supabase } from "../../lib/supabase";
import type { Project } from "../../lib/work/types";
import { DEAL_STAGES, DEAL_SOLUTIONS } from "../../lib/crm/types";
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

const GRID_KEY = "projects-manage";

interface ProjectRow {
  id: string;
  name: string;
  project_type: string;
  status: string;
  description: string | null;
  owner: string | null;
  company_name: string | null;
  company_stage: string | null;
  deal_stage: string | null;
  deal_value: number | null;
  deal_currency: string | null;
  deal_solution: string | null;
  deal_expected_close: string | null;
  deal_actual_close: string | null;
  deal_notes: string | null;
  deal_proposal_path: string | null;
  deal_order_form_path: string | null;
  deal_stage_changed_at: string | null;
  days_in_stage: number | null;
  health: string | null;
  lead: string | null;
  target_date: string | null;
  intent: string | null;
  created_at: string | null;
  updated_at: string | null;
  task_count: number;
  completed_count: number;
  overdue_count: number;
}

interface Props {
  projects: Project[];
  taskCounts: Map<string, { total: number; completed: number; overdue: number }>;
  companyMap: Map<string, { name: string; stage: string | null }>;
  onSelectProject: (id: string) => void;
}

const STATUS_VALUES = ["planned", "active", "completed", "paused"];
const TYPE_VALUES = ["work", "deal"];
const HEALTH_VALUES = ["on_track", "at_risk", "off_track", ""];

type StatusKey = "all" | "active" | "planned" | "completed" | "paused";
type TypeKey = "all" | "deal" | "work";
type StageKey = string; // "all" | one of DEAL_STAGES values

const STATUS_VIEWS: { id: StatusKey; label: string; icon: typeof Layers }[] = [
  { id: "all",       label: "All",       icon: Layers },
  { id: "active",    label: "Active",    icon: Activity },
  { id: "planned",   label: "Planned",   icon: Clock },
  { id: "completed", label: "Completed", icon: CheckCircle2 },
  { id: "paused",    label: "Paused",    icon: PauseCircle },
];

const TYPE_VIEWS: { id: TypeKey; label: string; icon: typeof Layers }[] = [
  { id: "all",  label: "All Types", icon: Layers },
  { id: "deal", label: "Deals",     icon: Target },
  { id: "work", label: "Work",      icon: Hammer },
];

const STAGE_DOT_COLORS: Record<string, string> = {
  zinc:   "bg-zinc-400",
  gray:   "bg-gray-400",
  blue:   "bg-blue-500",
  purple: "bg-purple-500",
  cyan:   "bg-cyan-500",
  yellow: "bg-yellow-500",
  green:  "bg-emerald-500",
  red:    "bg-red-500",
};

function buildColumns(wrapNotes: boolean): (ColDef<ProjectRow> | ColGroupDef<ProjectRow>)[] {
  return [
    {
      field: "name", headerName: "Name", minWidth: 200, flex: 2, filter: "agTextColumnFilter",
      pinned: "left", editable: true, enableRowGroup: false,
    },
    {
      field: "project_type", headerName: "Type", width: 100, filter: "agSetColumnFilter",
      editable: true, cellEditor: "agSelectCellEditor", cellEditorParams: { values: TYPE_VALUES },
      cellRenderer: (params: any) => {
        if (!params.value) return null;
        const colors: Record<string, string> = {
          deal: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
          work: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
        };
        return <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", colors[params.value] ?? "")}>{params.value}</span>;
      },
    },
    {
      field: "status", headerName: "Status", width: 100, filter: "agSetColumnFilter",
      editable: true, cellEditor: "agSelectCellEditor", cellEditorParams: { values: STATUS_VALUES },
      cellRenderer: (params: any) => {
        if (!params.value) return null;
        const colors: Record<string, string> = {
          active: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
          planned: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
          completed: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
          paused: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
        };
        return <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", colors[params.value] ?? "")}>{params.value}</span>;
      },
    },
    { field: "company_name", headerName: "Company", width: 150, filter: "agTextColumnFilter" },
    { field: "company_stage", headerName: "Co. Stage", width: 100, filter: "agSetColumnFilter" },
    {
      field: "deal_stage", headerName: "Deal Stage", width: 110, editable: true, filter: "agSetColumnFilter",
      cellEditor: "agSelectCellEditor", cellEditorParams: { values: [...DEAL_STAGES.map(s => s.value), ""] },
    },
    {
      field: "deal_value", headerName: "Value", width: 100, editable: true, type: "numericColumn", filter: "agNumberColumnFilter",
      valueFormatter: (params: any) => params.value ? `$${Number(params.value).toLocaleString()}` : "",
    },
    {
      field: "deal_solution", headerName: "Solution", width: 130, editable: true, filter: "agSetColumnFilter",
      cellEditor: "agSelectCellEditor", cellEditorParams: { values: [...DEAL_SOLUTIONS.map(s => s.value), ""] },
    },
    {
      field: "days_in_stage", headerName: "Days in Stage", width: 110, filter: "agNumberColumnFilter",
      cellRenderer: (params: any) => {
        if (params.value == null) return null;
        const d = params.value;
        const color = d > 30 ? "text-red-500" : d > 14 ? "text-amber-500" : "text-zinc-400";
        return <span className={`text-xs ${color}`}>{d}d</span>;
      },
    },
    { field: "deal_expected_close", headerName: "Exp. Close", width: 110, editable: true, filter: "agDateColumnFilter" },
    { field: "deal_actual_close", headerName: "Act. Close", width: 110, editable: true, hide: true },
    { field: "deal_proposal_path", headerName: "Proposal", width: 150, editable: true, hide: true },
    { field: "deal_order_form_path", headerName: "Order Form", width: 150, editable: true, hide: true },
    { field: "owner", headerName: "Owner", width: 100, editable: true, filter: "agTextColumnFilter" },
    {
      field: "health", headerName: "Health", width: 90, editable: true, filter: "agSetColumnFilter",
      cellEditor: "agSelectCellEditor", cellEditorParams: { values: HEALTH_VALUES },
      cellRenderer: (params: any) => {
        if (!params.value) return null;
        const colors: Record<string, string> = {
          on_track: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
          at_risk: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
          off_track: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400",
        };
        return <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", colors[params.value] ?? "")}>{params.value}</span>;
      },
    },
    { field: "lead", headerName: "Lead", width: 100, editable: true, hide: true },
    { field: "intent", headerName: "Intent", width: 120, editable: true, hide: true, filter: "agSetColumnFilter" },
    { field: "target_date", headerName: "Target Date", width: 110, editable: true, hide: true, filter: "agDateColumnFilter" },
    { field: "task_count", headerName: "Tasks", width: 70, type: "numericColumn", filter: "agNumberColumnFilter" },
    { field: "completed_count", headerName: "Done", width: 70, type: "numericColumn", filter: "agNumberColumnFilter" },
    { field: "overdue_count", headerName: "Overdue", width: 80, type: "numericColumn", filter: "agNumberColumnFilter",
      cellStyle: (params: any) => params.value > 0 ? { color: "#ef4444", fontWeight: 600 } : undefined,
    },
    {
      field: "description", headerName: "Description", minWidth: 200, flex: 1, editable: true, hide: true,
      wrapText: wrapNotes, autoHeight: wrapNotes, enableRowGroup: false, filter: "agTextColumnFilter",
    },
    {
      field: "deal_notes", headerName: "Notes", minWidth: 200, flex: 1, editable: true, hide: true,
      wrapText: wrapNotes, autoHeight: wrapNotes, enableRowGroup: false, filter: "agTextColumnFilter",
    },
    {
      field: "updated_at", headerName: "Updated", width: 110, filter: "agDateColumnFilter",
      valueFormatter: (params: any) => params.value ? new Date(params.value).toLocaleDateString("en-SG", { month: "short", day: "numeric" }) : "",
    },
  ];
}

export function ProjectsGrid({ projects, taskCounts, companyMap, onSelectProject }: Props) {
  const theme = useAppStore((s) => s.theme);
  const gridRef = useRef<AgGridReact<ProjectRow>>(null);
  const [quickFilter, setQuickFilter] = useState("");
  const [wrapNotes, setWrapNotes] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusKey>("all");
  const [typeFilter, setTypeFilter] = useState<TypeKey>("all");
  const [stageFilter, setStageFilter] = useState<StageKey>("all");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape" && isFullscreen) setIsFullscreen(false); };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  // Predicates per dimension (excludes self so counts react to other dimensions)
  const matchStatus = useCallback((p: Project, key: StatusKey) => key === "all" || p.status === key, []);
  const matchType   = useCallback((p: Project, key: TypeKey)   => key === "all" || p.project_type === key, []);
  const matchStage  = useCallback((p: Project, key: StageKey)  => key === "all" || p.deal_stage === key, []);

  // Per-dimension counts: each section's counts respect the other two filters
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const v of STATUS_VIEWS) counts[v.id] = 0;
    for (const proj of projects) {
      if (!matchType(proj, typeFilter) || !matchStage(proj, stageFilter)) continue;
      for (const v of STATUS_VIEWS) if (matchStatus(proj, v.id)) counts[v.id]++;
    }
    return counts;
  }, [projects, typeFilter, stageFilter, matchType, matchStage, matchStatus]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const v of TYPE_VIEWS) counts[v.id] = 0;
    for (const proj of projects) {
      if (!matchStatus(proj, statusFilter) || !matchStage(proj, stageFilter)) continue;
      for (const v of TYPE_VIEWS) if (matchType(proj, v.id)) counts[v.id]++;
    }
    return counts;
  }, [projects, statusFilter, stageFilter, matchStatus, matchStage, matchType]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    for (const s of DEAL_STAGES) counts[s.value] = 0;
    for (const proj of projects) {
      if (!matchStatus(proj, statusFilter) || !matchType(proj, typeFilter)) continue;
      counts.all++;
      if (proj.deal_stage && counts[proj.deal_stage] !== undefined) counts[proj.deal_stage]++;
    }
    return counts;
  }, [projects, statusFilter, typeFilter, matchStatus, matchType]);

  // Filtered projects (AND across all three dimensions)
  const filteredProjects = useMemo(() => {
    return projects.filter((p) =>
      matchStatus(p, statusFilter) &&
      matchType(p, typeFilter) &&
      matchStage(p, stageFilter),
    );
  }, [projects, statusFilter, typeFilter, stageFilter, matchStatus, matchType, matchStage]);

  const rowData: ProjectRow[] = useMemo(() => filteredProjects.map(p => {
    const counts = taskCounts.get(p.id) || { total: 0, completed: 0, overdue: 0 };
    const company = companyMap.get(p.company_id || "");
    return {
      id: p.id, name: p.name, project_type: p.project_type || "work", status: p.status || "active",
      description: p.description, owner: (p as any).owner,
      company_name: company?.name || null, company_stage: company?.stage || null,
      deal_stage: p.deal_stage, deal_value: p.deal_value, deal_currency: p.deal_currency,
      deal_solution: p.deal_solution, deal_expected_close: p.deal_expected_close,
      deal_actual_close: p.deal_actual_close, deal_notes: p.deal_notes,
      deal_proposal_path: p.deal_proposal_path, deal_order_form_path: p.deal_order_form_path,
      deal_stage_changed_at: p.deal_stage_changed_at || null,
      days_in_stage: p.deal_stage_changed_at ? Math.floor((Date.now() - new Date(p.deal_stage_changed_at).getTime()) / (1000 * 60 * 60 * 24)) : null,
      health: p.health, lead: p.lead, target_date: p.target_date, intent: (p as any).intent,
      created_at: p.created_at, updated_at: p.updated_at,
      task_count: counts.total, completed_count: counts.completed, overdue_count: counts.overdue,
    };
  }), [filteredProjects, taskCounts, companyMap]);

  const columnDefs = useMemo(() => buildColumns(wrapNotes), [wrapNotes]);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true, resizable: true, filter: true, floatingFilter: true,
    tooltipShowDelay: 500, enableRowGroup: true, cellClass: "text-xs",
  }), []);

  const autoGroupColumnDef = useMemo<ColDef<ProjectRow>>(() => ({
    headerName: "Group", minWidth: 250, flex: 1, cellRendererParams: { suppressCount: false },
  }), []);

  const getRowId = useCallback((params: GetRowIdParams<ProjectRow>) => params.data.id, []);
  const getRowClass = useCallback((params: { node: { group?: boolean } }) => params.node.group ? "ag-group-row-custom" : undefined, []);
  const getRowHeight = useCallback((params: { node: { group?: boolean } }) => params.node.group ? 40 : 36, []);

  const handleCellValueChanged = useCallback(async (event: CellValueChangedEvent<ProjectRow>) => {
    const { data, colDef, newValue } = event;
    if (!data || !colDef.field) return;
    const field = colDef.field;
    if (["company_name", "company_stage", "task_count", "completed_count", "overdue_count"].includes(field)) return;
    await supabase.from("projects").update({ [field]: newValue || null, updated_at: new Date().toISOString() }).eq("id", data.id);
  }, []);

  const autoSizeAllColumns = useCallback(() => { gridRef.current?.api.autoSizeAllColumns(); }, []);

  const exportToExcel = useCallback(() => {
    gridRef.current?.api.exportDataAsExcel({ fileName: `projects-${toSGTDateString()}.xlsx`, sheetName: "Projects", allColumns: true, skipRowGroups: true });
  }, []);

  const exportToCsv = useCallback(() => {
    gridRef.current?.api.exportDataAsCsv({ fileName: `projects-${toSGTDateString()}.csv`, allColumns: true, skipRowGroups: true });
  }, []);

  // ─── Shared layouts (Supabase) ────────────────────────────────────────────
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
      <style>{groupRowStyles}{themeStyles}{`
        .ag-theme-alpine .ag-cell, .ag-theme-alpine-dark .ag-cell { display: flex; align-items: center; }
      `}</style>

      <div className="flex-1 min-h-0 flex overflow-hidden border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-950">
        {/* Sidebar */}
        <aside className="w-60 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 flex flex-col overflow-hidden rounded-l-md">
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {/* VIEW = Status */}
            <div>
              <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">View</div>
              <div className="space-y-0.5">
                {STATUS_VIEWS.map((v) => {
                  const Icon = v.icon;
                  return (
                    <button
                      key={v.id}
                      onClick={() => setStatusFilter(v.id)}
                      className={cn(
                        "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[13px]",
                        statusFilter === v.id
                          ? "bg-teal-100 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300"
                          : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
                      )}
                    >
                      <span className="flex items-center gap-2"><Icon size={13} /> {v.label}</span>
                      <span className="text-[11px] text-zinc-500">{statusCounts[v.id]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* PROJECTS = Type */}
            <div>
              <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Projects</div>
              <div className="space-y-0.5">
                {TYPE_VIEWS.map((v) => {
                  const Icon = v.icon;
                  return (
                    <button
                      key={v.id}
                      onClick={() => setTypeFilter(v.id)}
                      className={cn(
                        "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[13px]",
                        typeFilter === v.id
                          ? "bg-teal-100 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300"
                          : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
                      )}
                    >
                      <span className="flex items-center gap-2"><Icon size={13} /> {v.label}</span>
                      <span className="text-[11px] text-zinc-500">{typeCounts[v.id]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* STAGE = Deal stages */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">Stage</div>
                {stageFilter !== "all" && (
                  <button
                    onClick={() => setStageFilter("all")}
                    className="text-[10px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="space-y-0.5">
                <button
                  onClick={() => setStageFilter("all")}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[13px]",
                    stageFilter === "all"
                      ? "bg-teal-100 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
                  )}
                >
                  <span className="flex items-center gap-2"><Layers size={13} /> All Stages</span>
                  <span className="text-[11px] text-zinc-500">{stageCounts.all}</span>
                </button>
                {DEAL_STAGES.map((stage) => (
                  <button
                    key={stage.value}
                    onClick={() => setStageFilter(stage.value)}
                    className={cn(
                      "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[13px]",
                      stageFilter === stage.value
                        ? "bg-teal-100 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300"
                        : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
                    )}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className={cn("w-2 h-2 rounded-full shrink-0", STAGE_DOT_COLORS[stage.color] || "bg-zinc-400")} />
                      <span className="truncate">{stage.label}</span>
                    </span>
                    <span className="text-[11px] text-zinc-500">{stageCounts[stage.value] || 0}</span>
                  </button>
                ))}
              </div>
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
            <span className="text-[11px] text-zinc-400 whitespace-nowrap">{rowData.length} project{rowData.length === 1 ? "" : "s"}</span>

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

            {/* Wrap toggle */}
            <button
              onClick={() => setWrapNotes(!wrapNotes)}
              className={cn(
                "flex items-center justify-center p-1.5 rounded-md border transition-colors",
                wrapNotes
                  ? "border-teal-500 bg-teal-500/20 text-teal-600 dark:text-teal-400"
                  : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              )}
              title="Wrap text in Notes/Description"
            >
              <WrapText size={12} />
            </button>

            <Button variant="secondary" size="sm" icon={Download} onClick={exportToCsv}>CSV</Button>
            <Button size="sm" icon={FileSpreadsheet} onClick={exportToExcel}>Excel</Button>

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
          <div className={cn(themeClass, "flex-1 min-h-0 overflow-hidden")} style={{ width: "100%" }}>
            <AgGridReact<ProjectRow>
              ref={gridRef}
              theme="legacy"
              rowData={rowData}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              autoGroupColumnDef={autoGroupColumnDef}
              getRowId={getRowId}
              getRowClass={getRowClass}
              getRowHeight={getRowHeight}
              headerHeight={32}
              floatingFiltersHeight={30}
              quickFilterText={quickFilter}
              onCellValueChanged={handleCellValueChanged}
              onFirstDataRendered={handleFirstDataRendered}
              onFilterChanged={handleFilterChanged}
              onColumnMoved={handleLayoutDirty}
              onColumnResized={handleLayoutDirty}
              onColumnVisible={handleLayoutDirty}
              onColumnPinned={handleLayoutDirty}
              onSortChanged={handleLayoutDirty}
              onColumnRowGroupChanged={handleLayoutDirty}
              onRowDoubleClicked={(e) => { if (e.data) onSelectProject(e.data.id); }}
              animateRows
              enableRangeSelection
              enableBrowserTooltips
              singleClickEdit
              stopEditingWhenCellsLoseFocus
              groupDisplayType="singleColumn"
              groupDefaultExpanded={0}
              rowGroupPanelShow="never"
              rowSelection="single"
              suppressRowClickSelection
              getContextMenuItems={() => ["copy", "copyWithHeaders", "paste", "separator", "export", "separator", "autoSizeAll", "resetColumns", "separator", "expandAll", "contractAll"]}
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
              pagination
              paginationPageSize={100}
              paginationPageSizeSelector={[50, 100, 200, 500]}
            />
          </div>
        </div>
      </div>

      {/* Save Layout Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-lg p-6 w-96 max-w-[90vw] border border-zinc-200 dark:border-zinc-800">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Save Layout</h3>
            <input type="text" value={newLayoutName} onChange={(e) => setNewLayoutName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && newLayoutName.trim()) saveCurrentLayout(newLayoutName); else if (e.key === "Escape") { setShowSaveDialog(false); setNewLayoutName(""); } }}
              placeholder="Enter layout name..." autoFocus
              className="w-full px-3 py-2 text-sm rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 mb-4" />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="md" onClick={() => { setShowSaveDialog(false); setNewLayoutName(""); }}>Cancel</Button>
              <Button size="md" onClick={() => saveCurrentLayout(newLayoutName)} disabled={!newLayoutName.trim()}>Save</Button>
            </div>
          </div>
        </div>
      )}

      {showLayoutMenu && <div className="fixed inset-0 z-40" onClick={() => setShowLayoutMenu(false)} />}
    </div>
  );
}
