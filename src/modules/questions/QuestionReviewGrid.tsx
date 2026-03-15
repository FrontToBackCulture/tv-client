// src/modules/questions/QuestionReviewGrid.tsx
// AG Grid Enterprise review table for question library management

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { toast } from "../../stores/toastStore";
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
  Download,
  FileSpreadsheet,
  Maximize2,
  X,
  RotateCcw,
  Bookmark,
  Star,
  Save,
  WrapText,
  Globe,
  Loader2,
  ChevronsLeftRight,
  Plus,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { Button } from "../../components/ui";
import { useAppStore } from "../../stores/appStore";
import { groupRowStyles, themeStyles } from "../domains/reviewGridStyles";
import {
  useQuestions,
  useUpdateQuestion,
  useCreateQuestion,
} from "../../hooks/gallery/useQuestions";
import type { Question } from "../../lib/gallery/types";

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule]);

if (typeof window !== "undefined" && import.meta.env.VITE_AG_GRID_LICENSE_KEY) {
  LicenseManager.setLicenseKey(import.meta.env.VITE_AG_GRID_LICENSE_KEY);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuestionRow {
  id: string;
  question: string;
  description: string;
  category: string;
  subcategory: string;
  solution: string;
  video_url: string;
  published: boolean;
  featured: boolean;
  sort_order: number;
  updated_at: string;
}

const LAYOUT_STORAGE_KEY = "tv-desktop-question-review-layouts";
const DEFAULT_LAYOUT_KEY = "tv-desktop-question-review-default-layout";

const SOLUTION_VALUES = ["analytics", "ar-automation", "ap-automation"];

interface QuestionReviewGridProps {
  onSelectQuestion?: (id: string) => void;
}

// ─── Column Definitions ───────────────────────────────────────────────────────

function buildColumns(wrapText: boolean): ColDef<QuestionRow>[] {
  return [
    {
      field: "question",
      headerName: "Question",
      minWidth: 250,
      flex: 2,
      filter: "agTextColumnFilter",
      pinned: "left",
      editable: true,
      enableRowGroup: false,
      wrapText,
      autoHeight: wrapText,
    },
    {
      field: "description",
      headerName: "Description",
      minWidth: 200,
      flex: 1,
      filter: "agTextColumnFilter",
      editable: true,
      cellClass: "text-xs text-zinc-600 dark:text-zinc-400",
      enableRowGroup: false,
      wrapText,
      autoHeight: wrapText,
    },
    {
      field: "category",
      headerName: "Category",
      width: 150,
      filter: "agSetColumnFilter",
      editable: true,
    },
    {
      field: "subcategory",
      headerName: "Subcategory",
      width: 130,
      filter: "agSetColumnFilter",
      editable: true,
      cellClass: "text-xs text-zinc-500",
    },
    {
      field: "solution",
      headerName: "Solution",
      width: 140,
      filter: "agSetColumnFilter",
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: SOLUTION_VALUES },
      cellRenderer: (params: { value: string }) => {
        if (!params.value) return null;
        const colors: Record<string, string> = {
          analytics: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
          "ar-automation": "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400",
          "ap-automation": "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
        };
        return (
          <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", colors[params.value] ?? "")}>
            {params.value}
          </span>
        );
      },
    },
    {
      field: "video_url",
      headerName: "Video URL",
      width: 220,
      filter: "agTextColumnFilter",
      editable: true,
      cellClass: "text-xs text-zinc-500 font-mono",
      enableRowGroup: false,
      cellRenderer: (params: { value: string }) => {
        if (!params.value) return <span className="text-zinc-300 dark:text-zinc-600 text-xs">—</span>;
        return (
          <a
            href={params.value}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-violet-500 hover:text-violet-400 truncate"
            title={params.value}
          >
            {params.value.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40)}
          </a>
        );
      },
    },
    {
      field: "published",
      headerName: "Published",
      width: 100,
      filter: "agSetColumnFilter",
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: [true, false] },
      cellRenderer: (params: { value: boolean }) => {
        if (params.value === undefined || params.value === null) return <span className="text-zinc-300 text-xs">—</span>;
        return params.value
          ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400">Live</span>
          : <span className="text-zinc-400 text-xs">No</span>;
      },
    },
    {
      field: "featured",
      headerName: "Featured",
      width: 100,
      filter: "agSetColumnFilter",
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: [true, false] },
      cellRenderer: (params: { value: boolean }) => {
        if (params.value === undefined || params.value === null) return <span className="text-zinc-300 text-xs">—</span>;
        return params.value
          ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Yes</span>
          : <span className="text-zinc-400 text-xs">No</span>;
      },
    },
    {
      field: "sort_order",
      headerName: "Order",
      width: 80,
      filter: "agNumberColumnFilter",
      editable: true,
      cellEditor: "agNumberCellEditor",
      cellClass: "text-xs text-zinc-500",
    },
    {
      field: "updated_at",
      headerName: "Updated",
      width: 110,
      filter: "agTextColumnFilter",
      cellClass: "text-xs text-zinc-500",
      valueFormatter: (params) => {
        if (!params.value) return "—";
        return params.value.slice(0, 10);
      },
      sort: "desc",
    },
  ];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function QuestionReviewGrid({ onSelectQuestion }: QuestionReviewGridProps) {
  const theme = useAppStore((s) => s.theme);
  const gridRef = useRef<AgGridReact<QuestionRow>>(null);
  const { data: questions = [] } = useQuestions();
  const updateQuestion = useUpdateQuestion();
  const createQuestion = useCreateQuestion();

  const [quickFilter, setQuickFilter] = useState("");
  const [wrapText, setWrapText] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRevalidating, setIsRevalidating] = useState(false);

  const handleRevalidateWebsite = useCallback(async () => {
    setIsRevalidating(true);
    try {
      await fetch("https://www.thinkval.com/api/revalidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paths: [
            "/solutions/analytics",
            "/solutions/analytics/questions",
            "/solutions/ar-automation",
            "/solutions/ap-automation",
          ],
        }),
      });
    } catch {
      // Best-effort
    } finally {
      setIsRevalidating(false);
    }
  }, []);

  // Layout management
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newLayoutName, setNewLayoutName] = useState("");
  const [savedLayouts, setSavedLayouts] = useState<Record<string, object>>(() => {
    const stored = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (stored) {
      try { return JSON.parse(stored); } catch { /* ignore */ }
    }
    return {};
  });
  const [defaultLayoutName, setDefaultLayoutName] = useState<string | null>(() =>
    localStorage.getItem(DEFAULT_LAYOUT_KEY)
  );

  // ESC to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) setIsFullscreen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  // Build row data from Supabase questions
  const rowData = useMemo<QuestionRow[]>(() => {
    return questions.map((q: Question) => ({
      id: q.id,
      question: q.question,
      description: q.description ?? "",
      category: q.category,
      subcategory: q.subcategory ?? "",
      solution: q.solution ?? "analytics",
      video_url: q.video_url ?? "",
      published: q.published,
      featured: q.featured,
      sort_order: q.sort_order,
      updated_at: q.updated_at,
    }));
  }, [questions]);

  const columnDefs = useMemo(() => buildColumns(wrapText), [wrapText]);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    filter: true,
    tooltipShowDelay: 500,
    enableRowGroup: true,
    cellClass: "text-xs",
  }), []);

  const autoGroupColumnDef = useMemo<ColDef<QuestionRow>>(() => ({
    headerName: "Category",
    minWidth: 250,
    flex: 1,
    cellRendererParams: { suppressCount: false },
  }), []);

  const getRowId = useCallback((params: GetRowIdParams<QuestionRow>) => params.data.id, []);

  const getRowClass = useCallback((params: { node: { group?: boolean } }) => {
    if (params.node.group) return "ag-group-row-custom";
    return undefined;
  }, []);

  const getRowHeight = useCallback((params: { node: { group?: boolean } }) => {
    return params.node.group ? 44 : 36;
  }, []);

  // Persist edits to Supabase
  const handleCellValueChanged = useCallback(
    (event: CellValueChangedEvent<QuestionRow>) => {
      const { data, colDef } = event;
      if (!data || !colDef.field) return;

      const field = colDef.field as keyof QuestionRow;
      if (field === "id" || field === "updated_at") return;

      // Map row field to Supabase column
      const value = data[field];
      const updates: Record<string, unknown> = {};

      if (field === "description" || field === "subcategory" || field === "video_url") {
        updates[field] = (value as string)?.trim() || null;
      } else {
        updates[field] = value;
      }

      updateQuestion.mutate({ id: data.id, updates });
    },
    [updateQuestion],
  );

  // Add new question
  const handleAddQuestion = useCallback(async () => {
    await createQuestion.mutateAsync({
      question: "New question",
      category: "Uncategorized",
      solution: "analytics",
    });
  }, [createQuestion]);

  // ─── Layout actions ─────────────────────────────────────────────────────────

  const resetLayout = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.setFilterModel(null);
    api.resetColumnState();
    api.setRowGroupColumns(["category"]);
    setQuickFilter("");
    toast.info("Layout reset to default");
  }, []);

  const autoSizeAllColumns = useCallback(() => {
    gridRef.current?.api.autoSizeAllColumns();
  }, []);

  const exportToExcel = useCallback(() => {
    gridRef.current?.api.exportDataAsExcel({
      fileName: `question-review-${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheetName: "Questions",
      allColumns: true,
      skipRowGroups: true,
    });
  }, []);

  const exportToCsv = useCallback(() => {
    gridRef.current?.api.exportDataAsCsv({
      fileName: `question-review-${new Date().toISOString().slice(0, 10)}.csv`,
      allColumns: true,
      skipRowGroups: true,
    });
  }, []);

  const saveCurrentLayout = useCallback((name: string) => {
    const api = gridRef.current?.api;
    if (!api || !name.trim()) return;
    const layout: Record<string, unknown> = {
      columnState: api.getColumnState(),
      filterModel: api.getFilterModel(),
      rowGroupColumns: api.getRowGroupColumns().map(col => col.getColId()),
      savedAt: new Date().toISOString(),
    };
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
    const layout = savedLayouts[name] as {
      columnState: ColumnState[];
      rowGroupColumns?: string[];
      filterModel?: Record<string, unknown>;
    } | undefined;
    if (!layout) return;
    api.setRowGroupColumns([]);
    api.applyColumnState({ state: layout.columnState, applyOrder: true });
    if (layout.rowGroupColumns?.length) {
      api.setRowGroupColumns(layout.rowGroupColumns);
    }
    if (layout.filterModel) {
      api.setFilterModel(layout.filterModel);
    } else {
      api.setFilterModel(null);
    }
    setShowLayoutMenu(false);
    toast.info(`Layout "${name}" applied`);
  }, [savedLayouts]);

  const deleteLayout = useCallback((name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newLayouts = { ...savedLayouts };
    delete newLayouts[name];
    setSavedLayouts(newLayouts);
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(newLayouts));
    if (defaultLayoutName === name) {
      setDefaultLayoutName(null);
      localStorage.removeItem(DEFAULT_LAYOUT_KEY);
    }
    toast.info(`Layout "${name}" deleted`);
  }, [savedLayouts, defaultLayoutName]);

  const toggleDefaultLayout = useCallback((name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (defaultLayoutName === name) {
      setDefaultLayoutName(null);
      localStorage.removeItem(DEFAULT_LAYOUT_KEY);
      toast.info(`"${name}" removed as default`);
    } else {
      setDefaultLayoutName(name);
      localStorage.setItem(DEFAULT_LAYOUT_KEY, name);
      toast.info(`"${name}" set as default layout`);
    }
  }, [defaultLayoutName]);

  // Auto-apply default layout on first render
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
          const layout = layouts[defaultName] as {
            columnState?: ColumnState[];
            filterModel?: Record<string, unknown>;
            rowGroupColumns?: string[];
          } | undefined;
          if (layout?.columnState) {
            api.applyColumnState({ state: layout.columnState, applyOrder: true });
            if (layout.rowGroupColumns?.length) api.setRowGroupColumns(layout.rowGroupColumns);
            if (layout.filterModel) api.setFilterModel(layout.filterModel);
            return;
          }
        }
      } catch { /* ignore */ }
    }

    api.setRowGroupColumns(["category"]);
  }, []);

  const themeClass = theme === "dark" ? "ag-theme-alpine-dark" : "ag-theme-alpine";

  return (
    <div className={isFullscreen ? "fixed inset-0 z-50 bg-zinc-50 dark:bg-zinc-950 p-4 flex flex-col" : "h-full flex flex-col"}>
      <style>{groupRowStyles}{themeStyles}{`
        .ag-theme-alpine .ag-cell,
        .ag-theme-alpine-dark .ag-cell {
          display: flex;
          align-items: center;
        }
      `}</style>

      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
        {/* Left: search + count */}
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Quick filter..."
              value={quickFilter}
              onChange={(e) => setQuickFilter(e.target.value)}
              className="w-full px-3 py-2 pl-9 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-teal-500"
            />
          </div>
          <span className="text-xs text-zinc-500">{rowData.length} questions</span>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          <Button size="md" icon={Plus} onClick={handleAddQuestion}>
            Add
          </Button>

          {/* Layouts dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowLayoutMenu(!showLayoutMenu)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
              title="Layouts & view options"
            >
              <Bookmark size={14} /> Layouts
            </button>
            {showLayoutMenu && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 z-50 py-1">
                <button
                  onClick={() => { autoSizeAllColumns(); setShowLayoutMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2"
                >
                  <ChevronsLeftRight size={13} /> Auto-fit Columns
                </button>
                <button
                  onClick={() => { resetLayout(); setShowLayoutMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2"
                >
                  <RotateCcw size={13} /> Reset to Default
                </button>

                <div className="border-t border-zinc-200 dark:border-zinc-700 my-1" />

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
                          <button onClick={(e) => { e.stopPropagation(); saveCurrentLayout(name); }} className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-400 hover:text-teal-500 hover:bg-teal-100 dark:hover:bg-teal-900/30" title="Overwrite">
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

          <button
            onClick={() => setWrapText(!wrapText)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
              wrapText
                ? "border-teal-500 bg-teal-500/20 text-teal-600 dark:text-teal-400"
                : "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
            }`}
            title={wrapText ? "Click to truncate text" : "Click to wrap text"}
          >
            <WrapText size={14} />
          </button>

          <button
            onClick={handleRevalidateWebsite}
            disabled={isRevalidating}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
            title="Revalidate website cache"
          >
            {isRevalidating ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
            Revalidate
          </button>

          <Button variant="secondary" size="md" icon={Download} onClick={exportToCsv} title="Export to CSV">
            CSV
          </Button>
          <Button size="md" icon={FileSpreadsheet} onClick={exportToExcel} title="Export to Excel">
            Excel
          </Button>

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
        </div>
      </div>

      {/* AG Grid */}
      <div
        className={cn(themeClass, "flex-1 min-h-0 overflow-hidden")}
        style={{ width: "100%" }}
      >
        <AgGridReact<QuestionRow>
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
          onRowDoubleClicked={(e) => {
            if (e.data?.id && onSelectQuestion) onSelectQuestion(e.data.id);
          }}
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
          getContextMenuItems={() => [
            "copy" as const,
            "copyWithHeaders" as const,
            "paste" as const,
            "separator" as const,
            "export" as const,
            "separator" as const,
            "autoSizeAll" as const,
            "resetColumns" as const,
            "separator" as const,
            "expandAll" as const,
            "contractAll" as const,
          ]}
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 animate-fade-in">
          <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-xl p-6 w-96 max-w-[90vw] border border-zinc-200 dark:border-zinc-700 animate-modal-in">
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

      {showLayoutMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowLayoutMenu(false)} />
      )}
    </div>
  );
}
