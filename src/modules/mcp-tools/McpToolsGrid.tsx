// MCP Tools registry — discovery grid mirroring the Skills module layout.
// Left rail = View section (Active/Deprecated/Hidden/Missing/Unverified) +
// Category tree. Right side = AG Grid with floating filters and inline edits
// for the editable subset.

import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  ColDef,
  ColumnState,
  ModuleRegistry,
  AllCommunityModule,
  CellValueChangedEvent,
  GetRowIdParams,
} from "ag-grid-community";
import { AllEnterpriseModule, LicenseManager } from "ag-grid-enterprise";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import {
  Search,
  X,
  Layers,
  CheckCircle2,
  Archive,
  ShieldAlert,
  EyeOff,
  CircleDashed,
  PanelLeftOpen,
  PanelLeftClose,
  ChevronDown,
  ChevronRight,
  Bookmark,
  ChevronsLeftRight,
  RotateCcw,
  Download,
  WrapText,
  Maximize2,
  Save,
  Star,
  Clock,
  RefreshCw,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { useAppStore } from "../../stores/appStore";
import { groupRowStyles, themeStyles } from "../domains/reviewGridStyles";
import { useMcpTools, useUpdateMcpTool, useSyncMcpTools } from "../../hooks/mcp-tools/useMcpTools";
import { toast } from "../../stores/toastStore";
import type { McpTool } from "../../hooks/mcp-tools/types";
import {
  useGridLayouts,
  useSaveGridLayout,
  useDeleteGridLayout,
  useSetDefaultGridLayout,
  type GridLayout,
} from "../../hooks/useGridLayouts";
import { Button } from "../../components/ui/Button";

interface JsonSchemaProperty {
  type?: string;
  description?: string;
  enum?: unknown[];
  items?: { type?: string };
}
interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule]);
if (typeof window !== "undefined" && import.meta.env.VITE_AG_GRID_LICENSE_KEY) {
  LicenseManager.setLicenseKey(import.meta.env.VITE_AG_GRID_LICENSE_KEY);
}

const STATUS_VALUES = ["active", "deprecated", "hidden", "missing"];
const GRID_KEY = "mcp-tools";

type ViewMode = "all" | "active" | "deprecated" | "hidden" | "missing" | "unverified";

const VIEW_DEFS: { id: ViewMode; label: string; icon: typeof Layers }[] = [
  { id: "all",         label: "All",          icon: Layers },
  { id: "active",      label: "Active",       icon: CheckCircle2 },
  { id: "deprecated",  label: "Deprecated",   icon: Archive },
  { id: "hidden",      label: "Hidden",       icon: EyeOff },
  { id: "missing",     label: "Missing",      icon: CircleDashed },
  { id: "unverified",  label: "Unverified",   icon: ShieldAlert },
];

interface Props {
  onSelectTool?: (slug: string) => void;
  onToggleChanges?: () => void;
  showChanges?: boolean;
}

function matchesView(t: McpTool, v: ViewMode): boolean {
  switch (v) {
    case "all":         return true;
    case "active":      return t.status === "active";
    case "deprecated":  return t.status === "deprecated";
    case "hidden":      return t.status === "hidden";
    case "missing":     return t.status === "missing";
    case "unverified":  return t.status === "active" && !t.verified;
  }
}

export function McpToolsGrid({ onSelectTool, onToggleChanges, showChanges }: Props) {
  const theme = useAppStore((s) => s.theme);
  const { data: tools = [], isLoading } = useMcpTools();
  const updateTool = useUpdateMcpTool();
  const syncTools = useSyncMcpTools();

  const [view, setView] = useState<ViewMode>("active");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState<string>("all");
  const [quickFilter, setQuickFilter] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeFilterCount, setActiveFilterCount] = useState(0);
  const [wrapNotes, setWrapNotes] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newLayoutName, setNewLayoutName] = useState("");
  const [activeLayoutName, setActiveLayoutName] = useState<string | null>(null);

  const gridRef = useRef<AgGridReact<McpTool>>(null);

  // Shared workspace-wide layouts persisted in Supabase `grid_layouts`.
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

  const autoSizeAllColumns = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    const colIds = api.getColumns()?.map((c) => c.getColId()) ?? [];
    api.autoSizeColumns(colIds, false);
  }, []);

  const resetLayout = useCallback(() => {
    gridRef.current?.api?.resetColumnState();
  }, []);

  const exportToCsv = useCallback(() => {
    gridRef.current?.api?.exportDataAsCsv({ fileName: "mcp-tools.csv" });
  }, []);

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
      setShowSaveDialog(false);
      setNewLayoutName("");
      toast.success(`Layout "${trimmed}" saved`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }, [saveLayoutMutation]);

  const loadLayout = useCallback((name: string) => {
    const api = gridRef.current?.api;
    if (!api) return;
    const layout = layoutsByName[name];
    if (!layout) return;
    api.setRowGroupColumns([]);
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
    setShowLayoutMenu(false);
    toast.info(`Layout "${name}" applied`);
  }, [layoutsByName]);

  const deleteLayout = useCallback(async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const layout = layoutsByName[name];
    if (!layout) return;
    try {
      await deleteLayoutMutation.mutateAsync(layout.id);
      if (activeLayoutName === name) setActiveLayoutName(null);
      toast.info(`Layout "${name}" deleted`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }, [layoutsByName, deleteLayoutMutation, activeLayoutName]);

  const toggleDefaultLayout = useCallback(async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const layout = layoutsByName[name];
    if (!layout) return;
    try {
      await setDefaultMutation.mutateAsync({ id: layout.id, makeDefault: !layout.is_default });
      toast.info(layout.is_default ? `"${name}" removed as default` : `"${name}" set as default layout`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }, [layoutsByName, setDefaultMutation]);

  // Auto-apply default layout on first render once both grid and layout query are ready.
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
    }
    hasAppliedDefault.current = true;
  }, [defaultLayout, layoutsFetched]);

  const handleFirstDataRendered = useCallback(() => {
    isFirstDataRendered.current = true;
    applyDefaultIfReady();
  }, [applyDefaultIfReady]);

  useEffect(() => {
    applyDefaultIfReady();
  }, [applyDefaultIfReady]);

  // ESC to exit fullscreen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) setIsFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  // Counts for the View list — computed against the universe of rows so the
  // sidebar reflects everything regardless of category/quick-filter state.
  const viewCounts = useMemo<Record<ViewMode, number>>(() => {
    const c: Record<ViewMode, number> = { all: 0, active: 0, deprecated: 0, hidden: 0, missing: 0, unverified: 0 };
    for (const t of tools) {
      c.all++;
      if (matchesView(t, "active")) c.active++;
      if (matchesView(t, "deprecated")) c.deprecated++;
      if (matchesView(t, "hidden")) c.hidden++;
      if (matchesView(t, "missing")) c.missing++;
      if (matchesView(t, "unverified")) c.unverified++;
    }
    return c;
  }, [tools]);

  // Rows after the View narrowing — passed to the sidebar so its category
  // tree counts reflect the active view.
  const viewScopedRows = useMemo(() => tools.filter((t) => matchesView(t, view)), [tools, view]);

  // Final rows shown in the grid: view + category + subcategory.
  const filteredRows = useMemo(() => {
    return viewScopedRows.filter((t) => {
      if (categoryFilter !== "all" && (t.category || "Uncategorized") !== categoryFilter) return false;
      if (subcategoryFilter !== "all" && (t.subcategory || "—") !== subcategoryFilter) return false;
      return true;
    });
  }, [viewScopedRows, categoryFilter, subcategoryFilter]);

  const columns = useMemo<ColDef<McpTool>[]>(() => [
    {
      field: "name",
      headerName: "Name",
      minWidth: 220,
      flex: 2,
      filter: "agTextColumnFilter",
      pinned: "left",
      cellRenderer: (params: { value: string; node: { expanded: boolean; setExpanded: (v: boolean) => void } }) => {
        if (!params.value) return null;
        const expanded = params.node.expanded;
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", width: "100%" }}>
            <button
              type="button"
              onMouseDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => { e.stopPropagation(); params.node.setExpanded(!expanded); }}
              className="flex-shrink-0 p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400"
              title={expanded ? "Collapse details" : "Show details"}
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            <span className="font-medium">{params.value}</span>
          </span>
        );
      },
    },
    {
      field: "slug",
      headerName: "Slug",
      width: 260,
      hide: true,
      filter: "agTextColumnFilter",
      cellClass: "text-xs font-mono text-zinc-500 cursor-pointer",
      cellRenderer: (p: { value: string }) => {
        if (!p.value) return null;
        return (
          <span
            title="Click to copy"
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(p.value);
              toast.success("Copied");
            }}
            className="hover:text-teal-500 transition-colors"
          >
            {p.value}
          </span>
        );
      },
    },
    {
      field: "category",
      headerName: "Category",
      width: 140,
      filter: "agSetColumnFilter",
      editable: true,
      sort: "asc",
      sortIndex: 0,
    },
    {
      field: "subcategory",
      headerName: "Subcategory",
      width: 160,
      filter: "agSetColumnFilter",
      editable: true,
      sort: "asc",
      sortIndex: 1,
    },
    {
      field: "status",
      headerName: "Status",
      width: 130,
      filter: "agSetColumnFilter",
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: STATUS_VALUES },
      cellRenderer: (p: { value: string }) => {
        if (!p.value) return null;
        const colors: Record<string, string> = {
          active: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
          deprecated: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
          hidden: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
          missing: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
        };
        return (
          <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", colors[p.value] ?? "")}>
            {p.value}
          </span>
        );
      },
    },
    {
      field: "verified",
      headerName: "Verified",
      width: 110,
      filter: "agSetColumnFilter",
      editable: true,
      cellRenderer: (p: { value: boolean }) => (
        <span className={p.value ? "text-emerald-600 text-xs" : "text-zinc-400 text-xs"}>
          {p.value ? "Yes" : "No"}
        </span>
      ),
    },
    { field: "owner", headerName: "Owner", width: 140, filter: "agTextColumnFilter", editable: true },
    {
      field: "platforms",
      headerName: "Platform",
      width: 180,
      filter: "agSetColumnFilter",
      editable: true,
      filterParams: {
        keyCreator: (p: { value: string[] | null | undefined }) => p.value ?? [],
        valueFormatter: (p: { value: string }) => p.value,
      },
      valueFormatter: (p: { value: string[] | null | undefined }) =>
        Array.isArray(p.value) ? p.value.join(", ") : "",
      valueParser: (p: { newValue: unknown }): string[] => {
        if (Array.isArray(p.newValue)) return p.newValue.map(String);
        if (typeof p.newValue !== "string") return [];
        return p.newValue.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      },
      cellRenderer: (p: { value: string[] | null | undefined }) => {
        const items = Array.isArray(p.value) ? p.value : [];
        if (items.length === 0) return <span className="text-zinc-300 text-xs">—</span>;
        return (
          <span className="flex flex-wrap items-center gap-1">
            {items.map((t) => (
              <span
                key={t}
                className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
              >
                {t}
              </span>
            ))}
          </span>
        );
      },
    },
    {
      field: "entities",
      headerName: "Entities",
      width: 220,
      filter: "agSetColumnFilter",
      editable: true,
      filterParams: {
        keyCreator: (p: { value: string[] | null | undefined }) => p.value ?? [],
        valueFormatter: (p: { value: string }) => p.value,
      },
      valueFormatter: (p: { value: string[] | null | undefined }) =>
        Array.isArray(p.value) ? p.value.join(", ") : "",
      valueParser: (p: { newValue: unknown }): string[] => {
        if (Array.isArray(p.newValue)) return p.newValue.map(String);
        if (typeof p.newValue !== "string") return [];
        return p.newValue.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      },
      cellRenderer: (p: { value: string[] | null | undefined }) => {
        const items = Array.isArray(p.value) ? p.value : [];
        if (items.length === 0) return <span className="text-zinc-300 text-xs">—</span>;
        return (
          <span className="flex flex-wrap items-center gap-1">
            {items.map((t) => (
              <span
                key={t}
                className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
              >
                {t}
              </span>
            ))}
          </span>
        );
      },
    },
    {
      field: "parent_entities",
      headerName: "Attaches To",
      width: 220,
      filter: "agSetColumnFilter",
      editable: true,
      filterParams: {
        keyCreator: (p: { value: string[] | null | undefined }) => p.value ?? [],
        valueFormatter: (p: { value: string }) => p.value,
      },
      valueFormatter: (p: { value: string[] | null | undefined }) =>
        Array.isArray(p.value) ? p.value.join(", ") : "",
      valueParser: (p: { newValue: unknown }): string[] => {
        if (Array.isArray(p.newValue)) return p.newValue.map(String);
        if (typeof p.newValue !== "string") return [];
        return p.newValue.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      },
      cellRenderer: (p: { value: string[] | null | undefined }) => {
        const items = Array.isArray(p.value) ? p.value : [];
        if (items.length === 0) {
          return <span className="text-zinc-400 text-[10px] italic">standalone</span>;
        }
        return (
          <span className="flex flex-wrap items-center gap-1">
            {items.map((t) => (
              <span
                key={t}
                className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
              >
                {t}
              </span>
            ))}
          </span>
        );
      },
    },
    {
      field: "tags",
      headerName: "Tags",
      width: 200,
      filter: "agSetColumnFilter",
      filterParams: {
        keyCreator: (p: { value: string[] | null | undefined }) => p.value ?? [],
        valueFormatter: (p: { value: string }) => p.value,
      },
      valueFormatter: (p: { value: string[] | null | undefined }) =>
        Array.isArray(p.value) ? p.value.join(", ") : "",
      cellRenderer: (p: { value: string[] | null | undefined }) => {
        const tags = Array.isArray(p.value) ? p.value : [];
        if (tags.length === 0) return <span className="text-zinc-300 text-xs">—</span>;
        return (
          <span className="flex flex-wrap items-center gap-1">
            {tags.map((t) => (
              <span
                key={t}
                className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"
              >
                {t}
              </span>
            ))}
          </span>
        );
      },
    },
    {
      field: "last_synced_at",
      headerName: "Last Synced",
      width: 180,
      cellClass: "text-xs text-zinc-500",
      valueFormatter: (p: { value: string | null }) =>
        p.value ? new Date(p.value).toLocaleString() : "—",
    },
    {
      field: "source_file",
      headerName: "Source",
      width: 220,
      cellClass: "text-xs font-mono text-zinc-500",
      hide: true,
    },
  ], []);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    filter: true,
    floatingFilter: true,
    enableRowGroup: true,
    cellClass: "text-xs",
  }), []);

  const onCellValueChanged = async (e: CellValueChangedEvent<McpTool>) => {
    if (!e.data) return;
    const field = e.colDef.field;
    if (!field) return;
    const editable: (keyof McpTool)[] = [
      "category", "subcategory", "status", "verified", "owner", "platforms", "entities",
      "parent_entities", "purpose", "notes", "tags",
    ];
    if (!editable.includes(field as keyof McpTool)) return;
    try {
      await updateTool.mutateAsync({
        slug: e.data.slug,
        updates: { [field]: e.newValue } as Partial<McpTool>,
      });
    } catch (err) {
      toast.error(`Update failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleFilterChanged = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    const model = api.getFilterModel() ?? {};
    setActiveFilterCount(Object.keys(model).length);
  }, []);

  const clearAllFilters = useCallback(() => {
    const api = gridRef.current?.api;
    if (api) api.setFilterModel(null);
    setQuickFilter("");
  }, []);

  const getRowId = (p: GetRowIdParams<McpTool>) => p.data.slug;

  const themeClass = theme === "dark" ? "ag-theme-alpine-dark" : "ag-theme-alpine";

  return (
    <div className={isFullscreen ? "fixed inset-0 z-50 bg-zinc-50 dark:bg-zinc-950 p-4 flex flex-col" : "h-full flex flex-col"}>
      <style>{groupRowStyles}{themeStyles}</style>

      <div className="flex-1 min-h-0 flex overflow-hidden px-4 py-4">
        <div className="flex-1 min-h-0 flex overflow-hidden border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-950">
          {sidebarOpen && (
            <McpToolsSidebar
              rows={viewScopedRows}
              view={view}
              setView={(v) => { setView(v); setCategoryFilter("all"); setSubcategoryFilter("all"); }}
              viewCounts={viewCounts}
              categoryFilter={categoryFilter}
              setCategoryFilter={(c) => { setCategoryFilter(c); setSubcategoryFilter("all"); }}
              subcategoryFilter={subcategoryFilter}
              setSubcategoryFilter={setSubcategoryFilter}
              onClose={() => setSidebarOpen(false)}
            />
          )}

          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            {/* Toolbar */}
            <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2 flex-wrap flex-shrink-0">
              {/* Left: sidebar toggle + search + clear */}
              <div className="flex items-center gap-2 flex-1">
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className={cn(
                    "flex items-center justify-center p-1.5 rounded-md border transition-colors flex-shrink-0",
                    sidebarOpen
                      ? "border-teal-500 bg-teal-500/20 text-teal-600 dark:text-teal-400"
                      : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  )}
                  title={sidebarOpen ? "Collapse sidebar" : "Open sidebar"}
                >
                  {sidebarOpen ? <PanelLeftClose size={12} /> : <PanelLeftOpen size={12} />}
                </button>

                <div className="relative flex-1 max-w-md">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Quick filter..."
                    value={quickFilter}
                    onChange={(e) => setQuickFilter(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                {(activeFilterCount > 0 || quickFilter.trim().length > 0) && (
                  <button
                    onClick={clearAllFilters}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60 transition-colors whitespace-nowrap"
                    title="Clear all filters"
                  >
                    <span>
                      {activeFilterCount + (quickFilter.trim().length > 0 ? 1 : 0)} filter
                      {activeFilterCount + (quickFilter.trim().length > 0 ? 1 : 0) === 1 ? "" : "s"} active
                    </span>
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Right: layout actions */}
              <div className="flex items-center gap-1.5">
                <div className="relative">
                  <button
                    onClick={() => setShowLayoutMenu(!showLayoutMenu)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                    title={activeLayoutName ? `Current layout: ${activeLayoutName}` : "Layouts & view options"}
                  >
                    <Bookmark size={13} />
                    {activeLayoutName ? (
                      <span className="max-w-[120px] truncate">{activeLayoutName}</span>
                    ) : (
                      <span>Layouts</span>
                    )}
                  </button>
                  {showLayoutMenu && (
                    <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-800 z-50 py-1">
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
                                  ? "text-teal-700 dark:text-teal-300"
                                  : "text-zinc-700 dark:text-zinc-300",
                              )}
                            >
                              <span className="truncate flex items-center gap-1.5">
                                {layout.is_default && <Star size={11} className="text-amber-500 fill-amber-500 flex-shrink-0" />}
                                {layout.name}
                              </span>
                              <div className="flex items-center gap-0.5">
                                <button
                                  onClick={(e) => { e.stopPropagation(); saveCurrentLayout(layout.name); }}
                                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-400 hover:text-teal-500 hover:bg-teal-100 dark:hover:bg-teal-900/30"
                                  title="Overwrite with current layout"
                                >
                                  <Save size={12} />
                                </button>
                                <button
                                  onClick={(e) => toggleDefaultLayout(layout.name, e)}
                                  className={cn(
                                    "p-1 rounded",
                                    layout.is_default
                                      ? "text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                                      : "opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/30",
                                  )}
                                  title={layout.is_default ? "Remove as default" : "Set as default"}
                                >
                                  <Star size={12} className={layout.is_default ? "fill-amber-500" : ""} />
                                </button>
                                <button
                                  onClick={(e) => deleteLayout(layout.name, e)}
                                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500 dark:text-red-400"
                                  title="Delete layout"
                                >
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

                <button
                  onClick={() => setWrapNotes(!wrapNotes)}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md border transition-colors",
                    wrapNotes
                      ? "border-teal-500 bg-teal-500/20 text-teal-600 dark:text-teal-400"
                      : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                  )}
                  title={wrapNotes ? "Click to truncate text" : "Click to wrap text"}
                >
                  <WrapText size={13} />
                </button>

                <button
                  onClick={async () => {
                    try {
                      const result = await syncTools.mutateAsync();
                      toast.success(
                        `Synced ${result.synced} tools${result.marked_missing > 0 ? `, marked ${result.marked_missing} missing` : ""}`,
                      );
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : String(err));
                    }
                  }}
                  disabled={syncTools.isPending}
                  className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md border transition-colors border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={syncTools.isPending ? "Syncing tools…" : "Refresh tool list from tv-mcp"}
                >
                  <RefreshCw size={13} className={syncTools.isPending ? "animate-spin" : ""} />
                </button>

                {onToggleChanges && (
                  <button
                    onClick={onToggleChanges}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md border transition-colors",
                      showChanges
                        ? "border-purple-500 bg-purple-500/20 text-purple-600 dark:text-purple-400"
                        : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                    )}
                    title="Recent Changes"
                  >
                    <Clock size={13} />
                  </button>
                )}

                <button
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md border transition-colors",
                    isFullscreen
                      ? "border-teal-500 bg-teal-500/20 text-teal-600 dark:text-teal-400"
                      : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                  )}
                  title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                >
                  {isFullscreen ? <X size={13} /> : <Maximize2 size={13} />}
                </button>
              </div>
            </div>

            {/* Grid */}
            <div className={cn("flex-1 min-h-0", themeClass)}>
              <AgGridReact<McpTool>
                ref={gridRef}
                theme="legacy"
                rowData={filteredRows}
                columnDefs={columns}
                defaultColDef={defaultColDef}
                getRowId={getRowId}
                quickFilterText={quickFilter}
                onCellValueChanged={onCellValueChanged}
                onFilterChanged={handleFilterChanged}
                onFirstDataRendered={handleFirstDataRendered}
                onRowDoubleClicked={(e) => e.data && onSelectTool?.(e.data.slug)}
                loading={isLoading}
                animateRows
                singleClickEdit
                stopEditingWhenCellsLoseFocus
                enableBrowserTooltips
                rowSelection="single"
                suppressRowClickSelection
                groupDisplayType="groupRows"
                groupDefaultExpanded={0}
                rowGroupPanelShow="onlyWhenGrouping"
                masterDetail
                detailCellRenderer={McpToolDetailRow}
                detailRowAutoHeight
                headerHeight={32}
                floatingFiltersHeight={28}
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
      </div>

      {showLayoutMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowLayoutMenu(false)} />
      )}

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
    </div>
  );
}

// ─── Detail Row ─────────────────────────────────────────────────────────────
// Rendered as a full-width row when the user expands a tool. Shows the
// human-readable description, parameter list, examples, and provenance.

function McpToolDetailRow(params: { data?: McpTool }) {
  const t = params.data;
  if (!t) return null;

  const schema = (t.params_schema ?? {}) as JsonSchema;
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const propertyEntries = Object.entries(properties);
  const examples = Array.isArray(t.examples) ? (t.examples as unknown[]) : [];

  const formatType = (prop: JsonSchemaProperty): string => {
    if (!prop.type) return "any";
    if (prop.type === "array" && prop.items?.type) return `${prop.items.type}[]`;
    return prop.type;
  };

  return (
    <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-900/40 border-y border-zinc-200 dark:border-zinc-800">
      <div className="grid grid-cols-12 gap-6">
        {/* Description + Inputs — main column */}
        <div className="col-span-8 space-y-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">What it does</div>
            <div className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {t.description || <span className="italic text-zinc-400">No description</span>}
            </div>
          </div>

          {t.purpose && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">Notes</div>
              <div className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                {t.purpose}
              </div>
            </div>
          )}

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">
              Inputs ({propertyEntries.length})
            </div>
            {propertyEntries.length === 0 ? (
              <div className="text-xs italic text-zinc-400">This tool takes no parameters.</div>
            ) : (
              <ul className="space-y-2">
                {propertyEntries.map(([key, prop]) => {
                  const isRequired = required.has(key);
                  return (
                    <li
                      key={key}
                      className="rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 px-3 py-2"
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                          {key}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                          {formatType(prop)}
                        </span>
                        {isRequired ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 uppercase tracking-wide">
                            required
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 uppercase tracking-wide">
                            optional
                          </span>
                        )}
                      </div>
                      {prop.description && (
                        <div className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                          {prop.description}
                        </div>
                      )}
                      {Array.isArray(prop.enum) && prop.enum.length > 0 && (
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <span className="text-[10px] text-zinc-500">one of:</span>
                          {prop.enum.map((v) => (
                            <span
                              key={String(v)}
                              className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300"
                            >
                              {String(v)}
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {examples.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">
                Examples ({examples.length})
              </div>
              <div className="space-y-2">
                {examples.map((ex, i) => (
                  <pre
                    key={i}
                    className="text-[11px] font-mono bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all"
                  >
                    {typeof ex === "string" ? ex : JSON.stringify(ex, null, 2)}
                  </pre>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Provenance sidebar */}
        <div className="col-span-4 space-y-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">Slug</div>
            <div className="text-xs font-mono text-zinc-600 dark:text-zinc-400 break-all">{t.slug}</div>
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">Attaches To</div>
            {(t.parent_entities ?? []).length === 0 ? (
              <div className="text-xs italic text-zinc-400">standalone</div>
            ) : (
              <div className="flex flex-wrap items-center gap-1">
                {(t.parent_entities ?? []).map((p) => (
                  <span
                    key={p}
                    className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                  >
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">Source file</div>
            <div className="text-xs font-mono text-zinc-600 dark:text-zinc-400 break-all">
              {t.source_file ?? "—"}
            </div>
          </div>

          {t.notes && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">Internal notes</div>
              <div className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap leading-relaxed">
                {t.notes}
              </div>
            </div>
          )}

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">Sync</div>
            <div className="text-xs text-zinc-600 dark:text-zinc-400 space-y-0.5">
              <div>
                <span className="text-zinc-500">Last synced: </span>
                {t.last_synced_at ? new Date(t.last_synced_at).toLocaleString() : "—"}
              </div>
              <div>
                <span className="text-zinc-500">First seen: </span>
                {t.first_seen_at ? new Date(t.first_seen_at).toLocaleString() : "—"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ────────────────────────────────────────────────────────────────

function McpToolsSidebar({
  rows,
  view,
  setView,
  viewCounts,
  categoryFilter,
  setCategoryFilter,
  subcategoryFilter,
  setSubcategoryFilter,
  onClose,
}: {
  rows: McpTool[];
  view: ViewMode;
  setView: (v: ViewMode) => void;
  viewCounts: Record<ViewMode, number>;
  categoryFilter: string;
  setCategoryFilter: (v: string) => void;
  subcategoryFilter: string;
  setSubcategoryFilter: (v: string) => void;
  onClose?: () => void;
}) {
  const categoryGroups = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const r of rows) {
      const cat = r.category || "Uncategorized";
      const sub = r.subcategory || "—";
      if (!map.has(cat)) map.set(cat, new Map());
      const subMap = map.get(cat)!;
      subMap.set(sub, (subMap.get(sub) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([cat, subMap]) => ({
        category: cat,
        total: Array.from(subMap.values()).reduce((a, b) => a + b, 0),
        subcategories: Array.from(subMap.entries())
          .map(([sub, count]) => ({ subcategory: sub, count }))
          .sort((a, b) => a.subcategory.localeCompare(b.subcategory)),
      }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [rows]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleCat = (c: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  };

  return (
    <aside className="w-64 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 flex flex-col overflow-hidden rounded-l-md">
      {/* View section */}
      <div className="px-3 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">View</div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              title="Collapse sidebar"
            >
              <PanelLeftClose size={12} />
            </button>
          )}
        </div>
        <div className="space-y-0.5">
          {VIEW_DEFS.map((v) => {
            const Icon = v.icon;
            const active = view === v.id;
            return (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={cn(
                  "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[13px]",
                  active
                    ? "bg-teal-100 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
                )}
              >
                <span className="flex items-center gap-2">
                  <Icon size={13} />
                  {v.label}
                </span>
                <span className="text-[11px] text-zinc-500">{viewCounts[v.id]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Category tree */}
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <button
          onClick={() => { setCategoryFilter("all"); setSubcategoryFilter("all"); }}
          className={cn(
            "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[12.5px] mb-1",
            categoryFilter === "all"
              ? "bg-teal-100 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300"
              : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
          )}
        >
          <span className="font-medium">All categories</span>
          <span className="text-[11px] text-zinc-500">{rows.length}</span>
        </button>

        {categoryGroups.length === 0 && (
          <div className="px-2 py-3 text-[11px] text-zinc-400 italic">No categories</div>
        )}

        {categoryGroups.map(({ category, total, subcategories }) => {
          const isOpen = expanded.has(category);
          const isActiveCat = categoryFilter === category;
          const hasMultipleSubs = subcategories.length > 1 || subcategories[0]?.subcategory !== "—";
          return (
            <div key={category} className="mt-1">
              <div className="flex items-center group">
                <button
                  onClick={() => hasMultipleSubs && toggleCat(category)}
                  className="p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  aria-label="Toggle"
                >
                  {hasMultipleSubs ? (
                    isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />
                  ) : (
                    <span className="inline-block w-[11px]" />
                  )}
                </button>
                <button
                  onClick={() => setCategoryFilter(category)}
                  className={cn(
                    "flex-1 flex items-center justify-between gap-2 pr-2 py-1 rounded text-[12px] text-left truncate",
                    isActiveCat
                      ? "bg-teal-100 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300",
                  )}
                  title={category}
                >
                  <span className="truncate">{category}</span>
                  <span className="text-[11px] text-zinc-500 shrink-0">{total}</span>
                </button>
              </div>

              {isOpen && hasMultipleSubs && subcategories.map(({ subcategory, count }) => {
                const isActiveSub = isActiveCat && subcategoryFilter === subcategory;
                return (
                  <button
                    key={subcategory}
                    onClick={() => { setCategoryFilter(category); setSubcategoryFilter(subcategory); }}
                    className={cn(
                      "w-full flex items-center justify-between gap-2 pl-7 pr-2 py-0.5 rounded text-[11.5px] text-left",
                      isActiveSub
                        ? "bg-teal-100 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300"
                        : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400",
                    )}
                    title={subcategory}
                  >
                    <span className="truncate">
                      {subcategory === "—" ? <span className="italic text-zinc-400">no subcategory</span> : subcategory}
                    </span>
                    <span className="text-[11px] text-zinc-500 shrink-0">{count}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
