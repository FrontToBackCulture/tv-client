// ProjectsGrid — AG Grid Enterprise table for all projects
// Full feature parity with SkillReviewGrid: layouts, fullscreen, export, inline editing

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
  Search, Download, FileSpreadsheet, Maximize2, X, RotateCcw, Columns,
  ChevronsLeftRight, Bookmark, Star, Save, WrapText,
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

ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule]);

if (typeof window !== "undefined" && import.meta.env.VITE_AG_GRID_LICENSE_KEY) {
  LicenseManager.setLicenseKey(import.meta.env.VITE_AG_GRID_LICENSE_KEY);
}

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

const LAYOUT_STORAGE_KEY = "tv-desktop-project-grid-layouts";
const DEFAULT_LAYOUT_KEY = "tv-desktop-project-grid-default-layout";

const STATUS_VALUES = ["planned", "active", "completed", "paused"];
const TYPE_VALUES = ["work", "deal"];
const HEALTH_VALUES = ["on_track", "at_risk", "off_track", ""];

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
    { field: "target_date", headerName: "Target Date", width: 110, editable: true, hide: true },
    { field: "task_count", headerName: "Tasks", width: 70, type: "numericColumn" },
    { field: "completed_count", headerName: "Done", width: 70, type: "numericColumn" },
    { field: "overdue_count", headerName: "Overdue", width: 80, type: "numericColumn",
      cellStyle: (params: any) => params.value > 0 ? { color: "#ef4444", fontWeight: 600 } : undefined,
    },
    {
      field: "description", headerName: "Description", minWidth: 200, flex: 1, editable: true, hide: true,
      wrapText: wrapNotes, autoHeight: wrapNotes, enableRowGroup: false,
    },
    {
      field: "deal_notes", headerName: "Notes", minWidth: 200, flex: 1, editable: true, hide: true,
      wrapText: wrapNotes, autoHeight: wrapNotes, enableRowGroup: false,
    },
    {
      field: "updated_at", headerName: "Updated", width: 100,
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
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newLayoutName, setNewLayoutName] = useState("");
  const [savedLayouts, setSavedLayouts] = useState<Record<string, object>>(() => {
    try { return JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY) || "{}"); } catch { return {}; }
  });
  const [defaultLayoutName, setDefaultLayoutName] = useState<string | null>(() => localStorage.getItem(DEFAULT_LAYOUT_KEY));

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape" && isFullscreen) setIsFullscreen(false); };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  const rowData: ProjectRow[] = useMemo(() => projects.map(p => {
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
  }), [projects, taskCounts, companyMap]);

  const columnDefs = useMemo(() => buildColumns(wrapNotes), [wrapNotes]);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true, resizable: true, filter: true, tooltipShowDelay: 500, enableRowGroup: true, cellClass: "text-xs",
  }), []);

  const autoGroupColumnDef = useMemo<ColDef<ProjectRow>>(() => ({
    headerName: "Group", minWidth: 250, flex: 1, cellRendererParams: { suppressCount: false },
  }), []);

  const getRowId = useCallback((params: GetRowIdParams<ProjectRow>) => params.data.id, []);
  const getRowClass = useCallback((params: { node: { group?: boolean } }) => params.node.group ? "ag-group-row-custom" : undefined, []);
  const getRowHeight = useCallback((params: { node: { group?: boolean } }) => params.node.group ? 44 : 36, []);

  const handleCellValueChanged = useCallback(async (event: CellValueChangedEvent<ProjectRow>) => {
    const { data, colDef, newValue } = event;
    if (!data || !colDef.field) return;
    const field = colDef.field;
    if (["company_name", "company_stage", "task_count", "completed_count", "overdue_count"].includes(field)) return;
    await supabase.from("projects").update({ [field]: newValue || null, updated_at: new Date().toISOString() }).eq("id", data.id);
  }, []);

  // Layout management
  const applyFlatLayout = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.setRowGroupColumns([]);
    api.applyColumnState({
      state: [
        { colId: "name", hide: false, pinned: "left" as const, width: 250 },
        { colId: "project_type", hide: false, width: 100 },
        { colId: "ag-Grid-AutoColumn", hide: true },
      ],
      applyOrder: false,
    });
  }, []);

  const resetLayout = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.setFilterModel(null);
    api.resetColumnState();
    api.setRowGroupColumns(["project_type"]);
    setQuickFilter("");
    toast.info("Layout reset");
  }, []);

  const autoSizeAllColumns = useCallback(() => { gridRef.current?.api.autoSizeAllColumns(); }, []);

  const exportToExcel = useCallback(() => {
    gridRef.current?.api.exportDataAsExcel({ fileName: `projects-${toSGTDateString()}.xlsx`, sheetName: "Projects", allColumns: true, skipRowGroups: true });
  }, []);

  const exportToCsv = useCallback(() => {
    gridRef.current?.api.exportDataAsCsv({ fileName: `projects-${toSGTDateString()}.csv`, allColumns: true, skipRowGroups: true });
  }, []);

  const saveCurrentLayout = useCallback((name: string) => {
    const api = gridRef.current?.api;
    if (!api || !name.trim()) return;
    const layout = { columnState: api.getColumnState(), filterModel: api.getFilterModel(), rowGroupColumns: api.getRowGroupColumns().map(c => c.getColId()), savedAt: new Date().toISOString() };
    const newLayouts = { ...savedLayouts, [name.trim()]: layout };
    setSavedLayouts(newLayouts);
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(newLayouts));
    setShowSaveDialog(false);
    setNewLayoutName("");
    toast.success(`Layout "${name.trim()}" saved`);
  }, [savedLayouts]);

  const loadLayout = useCallback((name: string) => {
    const api = gridRef.current?.api;
    if (!api) return;
    const layout = savedLayouts[name] as { columnState: ColumnState[]; rowGroupColumns?: string[]; filterModel?: Record<string, unknown> } | undefined;
    if (!layout) return;
    api.setRowGroupColumns([]);
    api.applyColumnState({ state: layout.columnState, applyOrder: true });
    if (layout.rowGroupColumns?.length) api.setRowGroupColumns(layout.rowGroupColumns);
    if (layout.filterModel) api.setFilterModel(layout.filterModel); else api.setFilterModel(null);
    setShowLayoutMenu(false);
    toast.info(`Layout "${name}" applied`);
  }, [savedLayouts]);

  const deleteLayout = useCallback((name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newLayouts = { ...savedLayouts }; delete newLayouts[name];
    setSavedLayouts(newLayouts);
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(newLayouts));
    if (defaultLayoutName === name) { setDefaultLayoutName(null); localStorage.removeItem(DEFAULT_LAYOUT_KEY); }
    toast.info(`Layout "${name}" deleted`);
  }, [savedLayouts, defaultLayoutName]);

  const toggleDefaultLayout = useCallback((name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (defaultLayoutName === name) { setDefaultLayoutName(null); localStorage.removeItem(DEFAULT_LAYOUT_KEY); }
    else { setDefaultLayoutName(name); localStorage.setItem(DEFAULT_LAYOUT_KEY, name); }
  }, [defaultLayoutName]);

  const hasAppliedDefault = useRef(false);
  const handleFirstDataRendered = useCallback(() => {
    if (hasAppliedDefault.current) return;
    hasAppliedDefault.current = true;
    const api = gridRef.current?.api;
    if (!api) return;
    const defaultName = localStorage.getItem(DEFAULT_LAYOUT_KEY);
    if (defaultName) {
      try {
        const stored = localStorage.getItem(LAYOUT_STORAGE_KEY);
        if (stored) {
          const layouts = JSON.parse(stored);
          const layout = layouts[defaultName];
          if (layout?.columnState) {
            api.applyColumnState({ state: layout.columnState, applyOrder: true });
            if (layout.rowGroupColumns?.length) api.setRowGroupColumns(layout.rowGroupColumns);
            if (layout.filterModel) api.setFilterModel(layout.filterModel);
            return;
          }
        }
      } catch { /* */ }
    }
    api.setRowGroupColumns(["project_type"]);
  }, []);

  const themeClass = theme === "dark" ? "ag-theme-alpine-dark" : "ag-theme-alpine";

  return (
    <div className={isFullscreen ? "fixed inset-0 z-50 bg-zinc-50 dark:bg-zinc-950 p-4 flex flex-col" : "h-full flex flex-col"}>
      <style>{groupRowStyles}{themeStyles}{`
        .ag-theme-alpine .ag-cell, .ag-theme-alpine-dark .ag-cell { display: flex; align-items: center; }
      `}</style>

      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input type="text" placeholder="Quick filter..." value={quickFilter} onChange={(e) => setQuickFilter(e.target.value)}
              className="w-full px-3 py-2 pl-9 text-sm rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Layouts */}
          <div className="relative">
            <button onClick={() => setShowLayoutMenu(!showLayoutMenu)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors">
              <Bookmark size={14} /> Layouts
            </button>
            {showLayoutMenu && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-800 z-50 py-1">
                <button onClick={() => { applyFlatLayout(); setShowLayoutMenu(false); }} className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center gap-2"><Columns size={13} /> Flat View</button>
                <button onClick={() => { autoSizeAllColumns(); setShowLayoutMenu(false); }} className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center gap-2"><ChevronsLeftRight size={13} /> Auto-fit Columns</button>
                <button onClick={() => { resetLayout(); setShowLayoutMenu(false); }} className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center gap-2"><RotateCcw size={13} /> Reset to Default</button>
                <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />
                <button onClick={() => { setShowLayoutMenu(false); setShowSaveDialog(true); }} className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center gap-2"><span className="text-green-600">+</span> Save current layout...</button>
                {Object.keys(savedLayouts).length > 0 && (
                  <>
                    <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />
                    <div className="px-3 py-1 text-xs font-medium text-zinc-500">Saved Layouts</div>
                    {Object.keys(savedLayouts).map(name => (
                      <div key={name} onClick={() => loadLayout(name)} className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center justify-between cursor-pointer group">
                        <span className="truncate flex items-center gap-1.5">{defaultLayoutName === name && <Star size={11} className="text-amber-500 fill-amber-500" />}{name}</span>
                        <div className="flex items-center gap-0.5">
                          <button onClick={(e) => { e.stopPropagation(); saveCurrentLayout(name); }} className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-400 hover:text-teal-500"><Save size={12} /></button>
                          <button onClick={(e) => toggleDefaultLayout(name, e)} className={cn("p-1 rounded", defaultLayoutName === name ? "text-amber-500" : "opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-amber-500")}><Star size={12} className={defaultLayoutName === name ? "fill-amber-500" : ""} /></button>
                          <button onClick={(e) => deleteLayout(name, e)} className="opacity-0 group-hover:opacity-100 p-1 rounded text-red-500"><X size={12} /></button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          <button onClick={() => setWrapNotes(!wrapNotes)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${wrapNotes ? "border-teal-500 bg-teal-500/20 text-teal-600" : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"}`}>
            <WrapText size={14} />
          </button>

          <Button variant="secondary" size="md" icon={Download} onClick={exportToCsv}>CSV</Button>
          <Button size="md" icon={FileSpreadsheet} onClick={exportToExcel}>Excel</Button>

          <button onClick={() => setIsFullscreen(!isFullscreen)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${isFullscreen ? "border-teal-500 bg-teal-500/20 text-teal-600" : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"}`}>
            {isFullscreen ? <X size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
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
          quickFilterText={quickFilter}
          onCellValueChanged={handleCellValueChanged}
          onFirstDataRendered={handleFirstDataRendered}
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

      {/* Save Layout Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-lg p-6 w-96 max-w-[90vw] border border-zinc-200 dark:border-zinc-800">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Save Layout</h3>
            <input type="text" value={newLayoutName} onChange={(e) => setNewLayoutName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && newLayoutName.trim()) saveCurrentLayout(newLayoutName); else if (e.key === "Escape") { setShowSaveDialog(false); setNewLayoutName(""); } }}
              placeholder="Enter layout name..." autoFocus
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 mb-4" />
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
