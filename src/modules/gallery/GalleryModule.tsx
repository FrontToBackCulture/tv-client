// src/modules/gallery/GalleryModule.tsx

import { useState, useMemo, useEffect, useCallback, useRef, forwardRef } from "react";
import { usePersistedModuleView } from "../../hooks/usePersistedModuleView";
import { Search, X, Loader2, ChevronRight, FileText, Image as ImageIcon, PenTool, Video, Pin, PinOff, ArrowUpDown, ChevronDown, Presentation, Globe, BarChart3, Receipt, Clock, ShoppingBag, Star, Truck, Users, Utensils, Wallet, LayoutGrid, Table2, Bookmark, Columns3, Download, CloudUpload, ChevronsLeftRight, RotateCcw, Columns, RefreshCw } from "lucide-react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, CellValueChangedEvent } from "ag-grid-community";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { Button, IconButton } from "../../components/ui";
import { SectionLoading } from "../../components/ui/DetailStates";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/PageHeader";
import { ViewTab } from "../../components/ViewTab";
import { useAppStore } from "../../stores/appStore";
import { useGalleryScan, useSkillDemos, type GalleryTab, type GalleryItem, type SkillExample } from "./useGallery";
import { useReadFile } from "../../hooks/useFiles";
import { ImageEditor } from "./ImageEditor";
import { ExcalidrawEditor } from "./ExcalidrawEditor";
import { useSkillRegistry } from "../skills/useSkillRegistry";
import { useUpdateSkill, useSkills } from "../../hooks/skills/useSkills";
import { ReportDetailPanel } from "./ReportDetailPanel";
import { useSkillLibraryMap, useUpsertSkillLibraryEntry } from "../../hooks/gallery/useSkillLibrary";
import { supabase } from "../../lib/supabase";
import { formatError } from "../../lib/formatError";
import { useQueryClient } from "@tanstack/react-query";
import { skillLibraryKeys } from "../../hooks/gallery/keys";
import { toast } from "../../stores/toastStore";

// ─── Tabs ────────────────────────────────────────────────────────────────────

const TABS: { id: GalleryTab; label: string; icon: typeof FileText }[] = [
  { id: "reports", label: "Skills", icon: FileText },
  { id: "decks", label: "Decks", icon: Presentation },
  { id: "images", label: "Images", icon: ImageIcon },
  { id: "excalidraw", label: "Excalidraw", icon: PenTool },
  { id: "videos", label: "Videos", icon: Video },
];

// ─── Main Module ─────────────────────────────────────────────────────────────

export function GalleryModule() {
  const [tab, setTab] = usePersistedModuleView<GalleryTab>("gallery", "reports");
  const [search, setSearch] = useState("");
  const [reportViewMode, setReportViewMode] = useState<"cards" | "grid">("grid");

  const { data: galleryItems = [], isLoading: scanLoading } = useGalleryScan();
  const { data: demos = [], isLoading: demosLoading } = useSkillDemos();

  // Map tab IDs to gallery_type values from Rust
  const tabToType: Record<string, string> = { images: "image", excalidraw: "excalidraw", videos: "video" };

  // Split demos by type
  const reportDemos = useMemo(() => demos.filter(d => d.demo_type !== "deck"), [demos]);
  const deckDemos = useMemo(() => demos.filter(d => d.demo_type === "deck"), [demos]);

  // Counts per type
  const counts = useMemo(() => ({
    reports: reportDemos.length,
    decks: deckDemos.length,
    images: galleryItems.filter(i => i.gallery_type === "image").length,
    excalidraw: galleryItems.filter(i => i.gallery_type === "excalidraw").length,
    videos: galleryItems.filter(i => i.gallery_type === "video").length,
  }), [galleryItems, reportDemos, deckDemos]);

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        description="Images, drawings, and generated reports — browse, edit, and manage visual assets."
        tabs={<>
          {TABS.map(t => (
            <ViewTab
              key={t.id}
              icon={t.icon}
              label={t.label}
              badge={counts[t.id]}
              active={tab === t.id}
              onClick={() => { setTab(t.id); setSearch(""); }}
            />
          ))}
        </>}
      />
      {/* Filter bar — hidden when Reports grid view is active (grid has its own toolbar) */}
      {!(tab === "reports" && reportViewMode === "grid") && (
        <div className="flex-shrink-0 px-4 py-2 border-b border-zinc-200 dark:border-zinc-800">
          <div className="relative max-w-md">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`Filter ${tab}...`}
              className="w-full pl-8 pr-8 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            {search && (
              <IconButton icon={X} size={12} label="Clear" onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2" />
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {tab === "reports" ? (
          <div className="flex-1 overflow-y-auto">
            <ReportsTab demos={reportDemos} search={search} isLoading={demosLoading} viewMode={reportViewMode} onViewModeChange={setReportViewMode} />
          </div>
        ) : tab === "decks" ? (
          <div className="flex-1 overflow-y-auto">
            <DecksTab demos={deckDemos} search={search} isLoading={demosLoading} />
          </div>
        ) : (
          <FileGalleryTab
            items={galleryItems.filter(i => i.gallery_type === (tabToType[tab] ?? tab))}
            search={search}
            isLoading={scanLoading}
            galleryType={tab}
          />
        )}
      </div>
    </div>
  );
}

// ─── Reports Tab (demo HTML from skills) ─────────────────────────────────────

type ReportSort = "name" | "date" | "category";

function ReportsTab({ demos, search, isLoading, viewMode, onViewModeChange }: { demos: SkillExample[]; search: string; isLoading: boolean; viewMode: "cards" | "grid"; onViewModeChange: (mode: "cards" | "grid") => void }) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<ReportSort>("category");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [gridQuickFilter, setGridQuickFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "report" | "diagnostic" | "chat">("all");
  const [gridSelectedExample, setGridSelectedExample] = useState<SkillExample | null>(null);
  const gridViewRef = useRef<AgGridReact<ReportsGridRow>>(null);
  const { data: selectedHtml } = useReadFile(selectedPath ?? undefined);
  const { data: registry } = useSkillRegistry();
  const updateSkill = useUpdateSkill();
  const queryClient = useQueryClient();

  const selectedExample = demos.find(e => e.file_path === selectedPath);
  const { data: reportSkillMap } = useSkillLibraryMap();

  const iframeSrcDoc = useMemo(() => {
    if (!selectedHtml) return undefined;
    const overrideStyle = `<style>body,body>*{max-width:100%!important;width:100%!important;box-sizing:border-box!important}body{margin:0!important;padding:1rem!important;overflow-x:hidden!important}img,table,pre{max-width:100%!important}</style>`;
    if (selectedHtml.includes("</head>")) {
      return selectedHtml.replace("</head>", `${overrideStyle}</head>`);
    }
    return overrideStyle + selectedHtml;
  }, [selectedHtml]);

  // Build category label map
  const categoryLabels = useMemo(() => {
    const map: Record<string, string> = {};
    if (registry?.categories) {
      for (const cat of registry.categories) {
        map[cat.id] = cat.label;
      }
    }
    return map;
  }, [registry]);

  // Get category order map for sorting
  const categoryOrder = useMemo(() => {
    const map: Record<string, number> = {};
    if (registry?.categories) {
      registry.categories.forEach((cat, idx) => {
        map[cat.id] = cat.order ?? idx;
      });
    }
    return map;
  }, [registry]);

  const togglePin = useCallback((slug: string) => {
    const entry = registry?.skills[slug];
    const currentPinned = entry?.gallery_pinned ?? false;
    updateSkill.mutate({ slug, updates: { gallery_pinned: !currentPinned } });
  }, [registry, updateSkill]);

  // Filter, sort, and group
  // Layout management for grid view (must be before any early returns)
  const GALLERY_LAYOUT_KEY = "tv-desktop-gallery-grid-layouts";
  const GALLERY_DEFAULT_LAYOUT_KEY = "tv-desktop-gallery-grid-default-layout";
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newLayoutName, setNewLayoutName] = useState("");
  const [savedLayouts, setSavedLayouts] = useState<Record<string, object>>(() => {
    const stored = localStorage.getItem(GALLERY_LAYOUT_KEY);
    if (stored) { try { return JSON.parse(stored); } catch { /* ignore */ } }
    return {};
  });
  const [defaultLayoutName, setDefaultLayoutName] = useState<string | null>(() =>
    localStorage.getItem(GALLERY_DEFAULT_LAYOUT_KEY)
  );

  const saveCurrentLayout = useCallback((name: string) => {
    if (!gridViewRef.current?.api) return;
    const state = gridViewRef.current.api.getColumnState();
    const newLayouts = { ...savedLayouts, [name]: state };
    setSavedLayouts(newLayouts);
    localStorage.setItem(GALLERY_LAYOUT_KEY, JSON.stringify(newLayouts));
  }, [savedLayouts]);

  const applyLayout = useCallback((name: string) => {
    if (!gridViewRef.current?.api || !savedLayouts[name]) return;
    gridViewRef.current.api.applyColumnState({ state: savedLayouts[name] as any, applyOrder: true });
  }, [savedLayouts]);

  const deleteLayout = useCallback((name: string) => {
    const newLayouts = { ...savedLayouts };
    delete newLayouts[name];
    setSavedLayouts(newLayouts);
    localStorage.setItem(GALLERY_LAYOUT_KEY, JSON.stringify(newLayouts));
    if (defaultLayoutName === name) {
      setDefaultLayoutName(null);
      localStorage.removeItem(GALLERY_DEFAULT_LAYOUT_KEY);
    }
  }, [savedLayouts, defaultLayoutName]);

  const setAsDefault = useCallback((name: string) => {
    setDefaultLayoutName(name);
    localStorage.setItem(GALLERY_DEFAULT_LAYOUT_KEY, name);
  }, []);

  // Actions menu state
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number; current: string } | null>(null);

  const handleRevalidateWebsite = useCallback(async () => {
    setIsRevalidating(true);
    try {
      await fetch("https://www.thinkval.com/api/revalidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paths: [
            "/solutions/analytics",
            "/solutions/analytics/ai-skills",
            "/solutions/ar-automation",
            "/solutions/ap-automation",
          ],
        }),
      });
      toast.success("Website cache purged");
    } catch {
      toast.error("Failed to revalidate website");
    } finally {
      setIsRevalidating(false);
    }
  }, []);

  const handleBulkUploadToS3 = useCallback(async () => {
    // Use grid's displayed rows (respects filters) when available, else fall back to all demos
    let itemsToUpload: { skill_slug: string; file_path: string; file_name: string }[] = [];
    const api = gridViewRef.current?.api;
    if (api) {
      const displayedRows: ReportsGridRow[] = [];
      api.forEachNodeAfterFilterAndSort((node) => { if (node.data) displayedRows.push(node.data); });
      // Match back to demos for file_path (grid rows don't have file_path)
      for (const row of displayedRows) {
        const demo = demos.find(d => d.slug === row.skill_slug && d.file_name === row.file_name);
        if (demo) itemsToUpload.push({ skill_slug: demo.slug, file_path: demo.file_path, file_name: demo.file_name });
      }
    } else {
      itemsToUpload = demos.map(d => ({ skill_slug: d.slug, file_path: d.file_path, file_name: d.file_name }));
    }

    if (!itemsToUpload.length) {
      toast.info("No demo files found to upload");
      return;
    }
    setIsBulkUploading(true);
    let success = 0;
    let failed = 0;
    const errors: string[] = [];
    const total = itemsToUpload.length;
    setUploadProgress({ done: 0, total, current: itemsToUpload[0]?.skill_slug ?? "" });

    for (let i = 0; i < itemsToUpload.length; i++) {
      const { skill_slug, file_path, file_name } = itemsToUpload[i];
      setUploadProgress({ done: i, total, current: `${skill_slug}/${file_name}` });
      try {
        const result = await invoke<{ url: string; s3_key: string; size_bytes: number }>("gallery_upload_demo_report", {
          filePath: file_path,
          skillSlug: skill_slug,
          fileName: file_name,
        });
        const { error: skillsErr } = await supabase.from("skills").update({ demo_uploaded: true, demo_url: result.url }).eq("slug", skill_slug);
        if (skillsErr) throw new Error(`skills update: ${skillsErr.message}`);
        const { error: libErr } = await supabase.from("skill_library")
          .update({ report_url: result.url })
          .eq("skill_slug", skill_slug)
          .eq("file_name", file_name);
        if (libErr) throw new Error(`skill_library update: ${libErr.message}`);
        success++;
      } catch (err) {
        failed++;
        errors.push(`${skill_slug}/${file_name}: ${formatError(err)}`);
      }
    }
    // Refetch skill library cache so grid picks up new S3 URLs before hiding progress
    await queryClient.refetchQueries({ queryKey: skillLibraryKeys.all });
    setUploadProgress(null);
    setIsBulkUploading(false);
    if (failed > 0) {
      toast.error(`Bulk upload: ${success} uploaded, ${failed} failed\n${errors.slice(0, 3).join("\n")}`);
    } else {
      toast.success(`Bulk upload complete: ${success} uploaded`);
    }
  }, [demos, updateSkill, queryClient]);

  const { pinnedItems, groups } = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = demos.filter(ex =>
      !q || ex.skill_name.toLowerCase().includes(q) || ex.file_name.toLowerCase().includes(q) || ex.slug.toLowerCase().includes(q)
    );

    // Enrich with registry data
    const enriched = filtered.map(ex => ({
      ...ex,
      pinned: registry?.skills[ex.slug]?.gallery_pinned ?? false,
      category: registry?.skills[ex.slug]?.category ?? "uncategorized",
      order: registry?.skills[ex.slug]?.gallery_order ?? 999,
    }));

    // Separate pinned
    const pinned = enriched.filter(e => e.pinned);
    const unpinned = enriched.filter(e => !e.pinned);

    // Sort function
    const sortFn = (a: typeof enriched[0], b: typeof enriched[0]) => {
      if (sortBy === "name") return a.skill_name.localeCompare(b.skill_name);
      if (sortBy === "date") return (b.modified || "").localeCompare(a.modified || "");
      // category sort: by order field, then name
      const diff = a.order - b.order;
      return diff !== 0 ? diff : a.skill_name.localeCompare(b.skill_name);
    };

    pinned.sort(sortFn);

    // Group unpinned by category if sorting by category
    if (sortBy === "category") {
      const grouped: Record<string, typeof enriched> = {};
      for (const item of unpinned) {
        const cat = item.category;
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(item);
      }
      // Sort items within each group
      for (const cat in grouped) {
        grouped[cat].sort((a, b) => {
          const diff = a.order - b.order;
          return diff !== 0 ? diff : a.skill_name.localeCompare(b.skill_name);
        });
      }
      // Sort category groups by category order
      const sortedGroups = Object.entries(grouped).sort(
        ([a], [b]) => (categoryOrder[a] ?? 999) - (categoryOrder[b] ?? 999)
      );
      return { pinnedItems: pinned, groups: sortedGroups };
    }

    // Flat sort for name/date
    unpinned.sort(sortFn);
    return { pinnedItems: pinned, groups: [["all", unpinned] as [string, typeof enriched]] };
  }, [demos, search, registry, sortBy, categoryOrder]);

  if (isLoading) return <SectionLoading className="py-12" />;

  if (selectedPath && iframeSrcDoc) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-shrink-0 px-4 pt-3 pb-2">
          <Button
            variant="ghost"
            icon={ChevronRight}
            onClick={() => setSelectedPath(null)}
            className="mb-2 [&_svg:first-child]:rotate-180"
          >
            Back to gallery
          </Button>
          {selectedExample && (
            <div>
              <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{selectedExample.skill_name}</h2>
              <p className="text-xs text-zinc-400">{selectedExample.file_name}</p>
            </div>
          )}
        </div>
        <div className="flex-1 min-h-0 flex gap-4 px-4 pb-4">
          {/* Report preview */}
          <div className="flex-1 min-w-0">
            <iframe
              srcDoc={iframeSrcDoc}
              className="w-full h-full border-0 rounded-lg border border-zinc-200 dark:border-zinc-800"
              sandbox="allow-scripts"
            />
          </div>
          {/* Metadata panel */}
          {selectedExample && (
            <div className="w-80 shrink-0 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
              <h3 className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider mb-3">Website Library</h3>
              <ReportDetailPanel example={selectedExample} htmlContent={selectedHtml ?? undefined} />
            </div>
          )}
        </div>
      </div>
    );
  }

  const totalCount = pinnedItems.length + groups.reduce((n, [, items]) => n + items.length, 0);
  const sortLabels: Record<ReportSort, string> = { name: "Name A-Z", date: "Newest First", category: "Category" };

  // Category visual config — icon + accent color for grouped headers
  const categoryVisuals: Record<string, { icon: typeof BarChart3; color: string }> = {
    analytics: { icon: BarChart3, color: "text-blue-500" },
    recon: { icon: Wallet, color: "text-emerald-500" },
    insights: { icon: Star, color: "text-amber-500" },
    receipts: { icon: Receipt, color: "text-violet-500" },
    "receipt-items": { icon: Utensils, color: "text-pink-500" },
    loyalty: { icon: Users, color: "text-indigo-500" },
    utilisation: { icon: Clock, color: "text-cyan-500" },
    timesheet: { icon: Clock, color: "text-orange-500" },
    delivery: { icon: Truck, color: "text-rose-500" },
    review: { icon: Star, color: "text-yellow-500" },
    inventory: { icon: ShoppingBag, color: "text-lime-600" },
  };
  const defaultVisual = { icon: LayoutGrid, color: "text-zinc-400" };

  // View toggle button group (shared between both modes)
  const viewToggle = (
    <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <button
        onClick={() => onViewModeChange("cards")}
        className={cn(
          "p-2 transition-colors",
          viewMode === "cards"
            ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900"
            : "bg-white dark:bg-zinc-800 text-zinc-400 hover:text-zinc-600"
        )}
        title="Card view"
      >
        <LayoutGrid size={14} />
      </button>
      <button
        onClick={() => onViewModeChange("grid")}
        className={cn(
          "p-2 transition-colors",
          viewMode === "grid"
            ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900"
            : "bg-white dark:bg-zinc-800 text-zinc-400 hover:text-zinc-600"
        )}
        title="Table view"
      >
        <Table2 size={14} />
      </button>
    </div>
  );

  if (viewMode === "grid") {
    return (
      <div className="flex flex-col h-full">
        {/* Grid toolbar — matches Skills Manage style */}
        <div className="flex items-center justify-between gap-4 px-4 py-2 bg-white dark:bg-zinc-950 flex-shrink-0">
          {/* Left: view toggle + quick filter + type filter */}
          <div className="flex items-center gap-3 flex-1">
            {viewToggle}
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Quick filter..."
                value={gridQuickFilter}
                onChange={(e) => setGridQuickFilter(e.target.value)}
                className="w-full px-3 py-2 pl-9 text-sm rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
              />
            </div>
            {/* Type filter */}
            <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              {(["all", "report", "diagnostic", "chat"] as const).map((type) => {
                const active = typeFilter === type;
                const colors: Record<string, string> = {
                  all: active ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900" : "",
                  report: active ? "bg-blue-600 text-white" : "",
                  diagnostic: active ? "bg-amber-600 text-white" : "",
                  chat: active ? "bg-violet-600 text-white" : "",
                };
                return (
                  <button
                    key={type}
                    onClick={() => setTypeFilter(type)}
                    className={cn(
                      "px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap",
                      active
                        ? colors[type]
                        : "bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    )}
                  >
                    {type === "all" ? "All" : type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: layouts + export */}
          <div className="flex items-center gap-2">
            {/* Layouts dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowLayoutMenu(!showLayoutMenu)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
              >
                <Bookmark size={14} /> Layouts
              </button>
              {showLayoutMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowLayoutMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg py-1 min-w-[200px]">
                    <button
                      onClick={() => {
                        const api = gridViewRef.current?.api;
                        if (api) {
                          api.setRowGroupColumns([]);
                          api.applyColumnState({
                            state: [
                              { colId: "skill_slug", hide: false, pinned: "left" as const, width: 200 },
                            ],
                            applyOrder: false,
                          });
                        }
                        setShowLayoutMenu(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-2"
                    >
                      <Columns size={13} /> Flat View
                    </button>
                    <button
                      onClick={() => { gridViewRef.current?.api?.autoSizeAllColumns(); setShowLayoutMenu(false); }}
                      className="w-full text-left px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-2"
                    >
                      <ChevronsLeftRight size={13} /> Auto-fit Columns
                    </button>
                    <button
                      onClick={() => { gridViewRef.current?.api?.resetColumnState(); setShowLayoutMenu(false); }}
                      className="w-full text-left px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-2"
                    >
                      <RotateCcw size={13} /> Reset to Default
                    </button>
                    <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />
                    <button
                      onClick={() => { setShowSaveDialog(true); setShowLayoutMenu(false); }}
                      className="w-full text-left px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-2"
                    >
                      <span className="text-green-600">+</span> Save current layout...
                    </button>
                    {Object.keys(savedLayouts).length > 0 && (
                      <>
                        <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />
                        <div className="px-3 py-1 text-[10px] text-zinc-400 uppercase tracking-wider">Saved Layouts</div>
                        {Object.keys(savedLayouts).map(name => (
                          <div key={name} className="flex items-center justify-between px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 group cursor-pointer" onClick={() => { applyLayout(name); setShowLayoutMenu(false); }}>
                            <span className="text-xs text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                              {defaultLayoutName === name && <Star size={11} className="text-amber-500 fill-amber-500" />}
                              {name}
                            </span>
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                              <button onClick={(e) => { e.stopPropagation(); saveCurrentLayout(name); }} className="p-0.5 text-zinc-400 hover:text-zinc-600" title="Overwrite with current">
                                <Download size={12} />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); setAsDefault(name); }} className="p-0.5 text-zinc-400 hover:text-amber-500" title="Set as default">
                                <Star size={12} />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); deleteLayout(name); }} className="p-0.5 text-zinc-400 hover:text-red-500" title="Delete">
                                <X size={12} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Actions dropdown */}
            <div className="relative">
              <button
                onClick={() => setActionsMenuOpen(!actionsMenuOpen)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
              >
                <RefreshCw size={14} />
                Actions
                <ChevronDown size={12} className={cn("transition-transform", actionsMenuOpen && "rotate-180")} />
              </button>
              {actionsMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setActionsMenuOpen(false)} />
                  <div className="absolute top-full right-0 mt-1 z-20 w-72 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg py-1.5">
                    <button
                      onClick={() => { handleBulkUploadToS3(); setActionsMenuOpen(false); }}
                      disabled={isBulkUploading}
                      className="w-full text-left px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 disabled:opacity-50 flex items-start gap-2.5"
                    >
                      <CloudUpload size={15} className="text-zinc-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Upload Demos to S3</div>
                        <div className="text-xs text-zinc-400 dark:text-zinc-500">Upload filtered demo files to S3 storage</div>
                      </div>
                    </button>
                    <button
                      onClick={() => { handleRevalidateWebsite(); setActionsMenuOpen(false); }}
                      disabled={isRevalidating}
                      className="w-full text-left px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 disabled:opacity-50 flex items-start gap-2.5"
                    >
                      <Globe size={15} className="text-zinc-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Revalidate Website</div>
                        <div className="text-xs text-zinc-400 dark:text-zinc-500">Purge thinkval.com cache</div>
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Column toggle */}
            <button
              onClick={() => gridViewRef.current?.api?.openToolPanel("columns")}
              className="flex items-center gap-1.5 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
              title="Toggle columns"
            >
              <Columns3 size={14} />
            </button>

            {/* CSV */}
            <button
              onClick={() => gridViewRef.current?.api?.exportDataAsCsv()}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
            >
              <Download size={14} /> CSV
            </button>

            {/* Excel */}
            <button
              onClick={() => gridViewRef.current?.api?.exportDataAsExcel()}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-teal-500 bg-teal-500 text-white hover:bg-teal-600 transition-colors"
            >
              Excel
            </button>
          </div>
        </div>

        {/* Upload progress bar */}
        {uploadProgress && (
          <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300 flex items-center gap-2">
                <Loader2 size={12} className="animate-spin" />
                Uploading {uploadProgress.done}/{uploadProgress.total}
              </span>
              <span className="text-[11px] text-zinc-400 font-mono truncate max-w-xs">{uploadProgress.current}</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-500 rounded-full transition-all duration-300"
                style={{ width: `${(uploadProgress.done / uploadProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Grid + optional detail panel */}
        <div className="flex-1 min-h-0 flex">
          <div className={cn("min-h-0", gridSelectedExample ? "flex-1" : "w-full")}>
            <ReportsGridView
              ref={gridViewRef}
              search={gridQuickFilter}
              typeFilter={typeFilter}
              demos={demos}
              defaultLayoutName={defaultLayoutName}
              savedLayouts={savedLayouts}
              onRowDoubleClicked={(row) => {
                const demo = demos.find(d => d.slug === row.skill_slug && d.file_name === row.file_name);
                if (demo) {
                  setGridSelectedExample(demo);
                } else {
                  // No local file — create a minimal SkillExample for the panel
                  setGridSelectedExample({
                    slug: row.skill_slug,
                    skill_name: row.title,
                    file_name: row.file_name,
                    file_path: "",
                    modified: "",
                    demo_type: "report",
                  });
                }
              }}
            />
          </div>
          {gridSelectedExample && (
            <div className="w-[440px] shrink-0 border-l border-zinc-200 dark:border-zinc-800 overflow-y-auto bg-zinc-50 dark:bg-zinc-950">
              {/* Panel header */}
              <div className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 px-5 py-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Skill Details</h3>
                  <p className="text-[11px] text-zinc-400 font-mono mt-0.5">{gridSelectedExample.slug}</p>
                </div>
                <button
                  onClick={() => setGridSelectedExample(null)}
                  className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 transition"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="p-5">
                <ReportDetailPanel example={gridSelectedExample} />
              </div>
            </div>
          )}
        </div>

        {/* Save Layout Dialog */}
        {showSaveDialog && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
            <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg p-6 w-80 border border-zinc-200 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-3">Save Layout</h3>
              <input
                autoFocus
                value={newLayoutName}
                onChange={e => setNewLayoutName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && newLayoutName.trim()) {
                    saveCurrentLayout(newLayoutName.trim());
                    setNewLayoutName("");
                    setShowSaveDialog(false);
                  }
                }}
                placeholder="Layout name..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 mb-3"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setShowSaveDialog(false); setNewLayoutName(""); }}
                  className="px-3 py-1.5 text-xs rounded-lg text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800/50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (newLayoutName.trim()) {
                      saveCurrentLayout(newLayoutName.trim());
                      setNewLayoutName("");
                      setShowSaveDialog(false);
                    }
                  }}
                  className="px-3 py-1.5 text-xs rounded-lg bg-teal-500 text-white hover:bg-teal-600 font-medium"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="px-6 py-5">
      {/* Cards header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-100">Report Gallery</h2>
          <p className="text-xs text-zinc-400 mt-0.5">{totalCount} reports across {groups.length} {groups.length === 1 && groups[0]?.[0] === "all" ? "view" : "categories"}</p>
        </div>
        <div className="flex items-center gap-2">
        {viewToggle}
        <div className="relative">
          <button
            onClick={() => setShowSortMenu(!showSortMenu)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 hover:border-zinc-200 dark:hover:border-zinc-600 shadow-sm transition-colors"
          >
            <ArrowUpDown size={12} />
            {sortLabels[sortBy]}
            <ChevronDown size={10} />
          </button>
          {showSortMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowSortMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg py-1 min-w-[140px]">
                {(["category", "name", "date"] as ReportSort[]).map(opt => (
                  <button
                    key={opt}
                    onClick={() => { setSortBy(opt); setShowSortMenu(false); }}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800",
                      sortBy === opt ? "text-teal-600 dark:text-teal-400 font-medium" : "text-zinc-600 dark:text-zinc-300"
                    )}
                  >
                    {sortLabels[opt]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        </div>
      </div>

      {totalCount === 0 ? (
        <div className="text-center py-16 text-sm text-zinc-400">
          {search ? `No reports matching "${search}"` : "No demo reports found in _skills/*/demo/"}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Pinned section */}
          {pinnedItems.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Pin size={13} className="text-teal-500" />
                <h3 className="text-sm font-semibold text-teal-600 dark:text-teal-400">Pinned</h3>
                <span className="text-xs text-zinc-400">{pinnedItems.length}</span>
              </div>
              <div className="grid grid-cols-4 xl:grid-cols-5 gap-3">
                {pinnedItems.map(ex => (
                  <ReportThumbnail
                    key={ex.file_path}
                    example={ex}
                    pinned
                    isPublished={reportSkillMap?.has(`${ex.slug}:${ex.file_name}`) && reportSkillMap.get(`${ex.slug}:${ex.file_name}`)!.published}
                    onTogglePin={() => togglePin(ex.slug)}
                    onClick={() => setSelectedPath(ex.file_path)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Category groups (or flat list) */}
          {(() => {
            // Separate large categories (3+) from small ones (1-2 items)
            const largeGroups = sortBy === "category" ? groups.filter(([, items]) => items.length >= 3) : groups;
            const smallGroups = sortBy === "category" ? groups.filter(([, items]) => items.length < 3) : [];

            return (
              <>
                {largeGroups.map(([catId, items]) => {
                  const visual = categoryVisuals[catId] ?? defaultVisual;
                  const CatIcon = visual.icon;
                  return (
                    <div key={catId}>
                      {sortBy === "category" && (
                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-zinc-100 dark:border-zinc-800">
                          <CatIcon size={14} className={visual.color} />
                          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                            {categoryLabels[catId] || catId}
                          </h3>
                          <span className="text-xs text-zinc-400">{items.length}</span>
                        </div>
                      )}
                      <div className="grid grid-cols-4 xl:grid-cols-5 gap-3">
                        {items.map(ex => (
                          <ReportThumbnail
                            key={ex.file_path}
                            example={ex}
                            pinned={ex.pinned}
                            isPublished={reportSkillMap?.has(`${ex.slug}:${ex.file_name}`) && reportSkillMap.get(`${ex.slug}:${ex.file_name}`)!.published}
                            onTogglePin={() => togglePin(ex.slug)}
                            onClick={() => setSelectedPath(ex.file_path)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Small categories — compact rows instead of large grid cards */}
                {smallGroups.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-zinc-100 dark:border-zinc-800">
                      <LayoutGrid size={14} className="text-zinc-400" />
                      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">More Reports</h3>
                      <span className="text-xs text-zinc-400">{smallGroups.reduce((n, [, items]) => n + items.length, 0)}</span>
                    </div>
                    <div className="grid grid-cols-2 xl:grid-cols-3 gap-2">
                      {smallGroups.flatMap(([catId, items]) =>
                        items.map(ex => (
                          <ReportCompactRow
                            key={ex.file_path}
                            example={ex}
                            categoryLabel={categoryLabels[catId] || catId}
                            categoryVisual={categoryVisuals[catId] ?? defaultVisual}
                            pinned={ex.pinned}
                            isPublished={reportSkillMap?.has(`${ex.slug}:${ex.file_name}`) && reportSkillMap.get(`${ex.slug}:${ex.file_name}`)!.published}
                            onTogglePin={() => togglePin(ex.slug)}
                            onClick={() => setSelectedPath(ex.file_path)}
                          />
                        ))
                      )}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ─── Reports Grid View (AG Grid for bulk editing skill_library metadata) ─────

// Known fake demo domain codes to strip from file names
const DEMO_DOMAINS = new Set(["nv", "hvr", "ktn", "vrg", "mr", "arg", "nvg", "mv", "seg"]);

function formatDemoTitle(fileName: string, skillName: string): string {
  // demo.html → use skill name, humanized
  if (fileName === "demo.html") {
    return skillName.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }

  let name = fileName.replace(/\.html$/, "");

  // s1-program-overview → Program Overview
  if (/^s\d+-/.test(name)) {
    name = name.replace(/^s\d+-/, "");
    return name.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }

  // Split by hyphens, remove domain code, rejoin with " - " between platform/type and section
  const parts = name.split("-");

  // Find and remove the domain code (2-3 letter code that's in our known set)
  const cleaned = parts.filter(p => !DEMO_DOMAINS.has(p.toLowerCase()));

  // Try to find a natural split point: "report", "report" prefix, etc.
  // Pattern: {platform} {type} - {section}
  // e.g. ["grab", "report", "commission"] → "Grab Report - Commission"
  // e.g. ["service", "staff", "idle", "time"] → "Service Staff - Idle Time"
  const reportIdx = cleaned.indexOf("report");
  if (reportIdx >= 0 && reportIdx < cleaned.length - 1) {
    const prefix = cleaned.slice(0, reportIdx + 1);
    const section = cleaned.slice(reportIdx + 1);
    return [
      prefix.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
      section.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
    ].filter(Boolean).join(" - ");
  }

  // For non-"report" files, split after the second word if 4+ parts
  if (cleaned.length >= 4) {
    const prefix = cleaned.slice(0, 2);
    const section = cleaned.slice(2);
    return [
      prefix.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
      section.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
    ].filter(Boolean).join(" - ");
  }

  // Fallback: just capitalize all words
  return cleaned.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

interface ReportsGridRow {
  id: string;
  skill_slug: string;
  file_name: string;
  title: string;
  description: string;
  writeup: string;
  type: string;
  solution: string;
  category: string;
  subcategory: string;
  metrics: string;
  sources: string;
  published: boolean;
  featured: boolean;
  report_url: string;
  sort_order: number;
}

const GRID_COL_DEFS: ColDef<ReportsGridRow>[] = [
  { field: "skill_slug", headerName: "Skill", width: 200, filter: "agTextColumnFilter", pinned: "left", cellClass: "text-xs font-mono" },
  { field: "file_name", headerName: "File", width: 200, filter: "agTextColumnFilter", cellClass: "text-xs font-mono" },
  {
    field: "type", headerName: "Type", width: 100, filter: "agSetColumnFilter", editable: true,
    cellEditor: "agSelectCellEditor", cellEditorParams: { values: ["report", "diagnostic", "chat"] },
    cellRenderer: (params: { value: string }) => {
      if (!params.value) return null;
      const colors: Record<string, string> = { report: "bg-blue-600 text-white", diagnostic: "bg-amber-600 text-white", chat: "bg-violet-600 text-white" };
      return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[params.value] ?? ""}`}>{params.value}</span>;
    },
  },
  { field: "title", headerName: "Title", width: 220, filter: "agTextColumnFilter", editable: true },
  { field: "description", headerName: "Description", minWidth: 300, maxWidth: 500, filter: "agTextColumnFilter", editable: true, wrapText: true, autoHeight: true, cellStyle: { lineHeight: "1.4", paddingTop: "6px", paddingBottom: "6px", whiteSpace: "normal", display: "block" } },
  { field: "writeup", headerName: "Writeup", minWidth: 400, maxWidth: 700, filter: "agTextColumnFilter", editable: true, wrapText: true, autoHeight: true, cellStyle: { lineHeight: "1.4", paddingTop: "6px", paddingBottom: "6px", whiteSpace: "normal", display: "block" } },
  {
    field: "solution", headerName: "Solution", width: 130, filter: "agSetColumnFilter", editable: true,
    cellEditor: "agSelectCellEditor", cellEditorParams: { values: ["analytics", "ar-automation", "ap-automation"] },
  },
  { field: "category", headerName: "Category", width: 120, filter: "agSetColumnFilter", editable: true },
  { field: "subcategory", headerName: "Subcategory", width: 120, filter: "agSetColumnFilter", editable: true },
  { field: "metrics", headerName: "Metrics", width: 180, filter: "agTextColumnFilter", editable: true, cellClass: "text-xs" },
  { field: "sources", headerName: "Sources", width: 180, filter: "agTextColumnFilter", editable: true, cellClass: "text-xs" },
  {
    field: "published", headerName: "Published", width: 90, filter: "agSetColumnFilter", editable: true,
    cellEditor: "agSelectCellEditor", cellEditorParams: { values: [true, false] },
    cellRenderer: (params: { value: boolean }) => params.value
      ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400">Live</span>
      : <span className="text-zinc-400 text-xs">No</span>,
  },
  {
    field: "featured", headerName: "Featured", width: 90, filter: "agSetColumnFilter", editable: true,
    cellEditor: "agSelectCellEditor", cellEditorParams: { values: [true, false] },
    cellRenderer: (params: { value: boolean }) => params.value
      ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Yes</span>
      : <span className="text-zinc-400 text-xs">No</span>,
  },
  { field: "sort_order", headerName: "Order", width: 70, filter: "agNumberColumnFilter", editable: true },
  { field: "report_url", headerName: "S3 URL", width: 200, filter: "agTextColumnFilter", cellClass: "text-xs font-mono text-zinc-400" },
];

const ReportsGridView = forwardRef<AgGridReact<ReportsGridRow>, { search: string; typeFilter?: string; demos?: SkillExample[]; onRowDoubleClicked?: (row: ReportsGridRow) => void; defaultLayoutName?: string | null; savedLayouts?: Record<string, object> }>(function ReportsGridView({ search, typeFilter = "all", demos = [], onRowDoubleClicked, defaultLayoutName, savedLayouts }, ref) {
  const gridRef = useRef<AgGridReact<ReportsGridRow>>(null);
  // Use callback ref to ensure parent ref is set after AG Grid mounts
  const setGridRef = useCallback((node: AgGridReact<ReportsGridRow> | null) => {
    (gridRef as React.MutableRefObject<AgGridReact<ReportsGridRow> | null>).current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as React.MutableRefObject<AgGridReact<ReportsGridRow> | null>).current = node;
  }, [ref]);
  const { data: libraryMap, isLoading: libLoading } = useSkillLibraryMap();
  const { data: skillsList = [], isLoading: skillsLoading } = useSkills();
  const upsert = useUpsertSkillLibraryEntry();
  const theme = useAppStore((s) => s.theme);
  const themeClass = theme === "dark" ? "ag-theme-alpine-dark" : "ag-theme-alpine";

  // Build skill_type lookup from skills table
  const skillTypeMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of skillsList) map[s.slug] = s.skill_type ?? "report";
    return map;
  }, [skillsList]);

  const rowData = useMemo<ReportsGridRow[]>(() => {
    // Merge local demos with skill_library entries
    const rows: ReportsGridRow[] = [];
    const seen = new Set<string>();

    // 1. All local demo files — enriched with skill_library data where it exists
    for (const demo of demos) {
      const key = `${demo.slug}:${demo.file_name}`;
      seen.add(key);
      const lib = libraryMap?.get(key);
      const skillType = lib?.type ?? skillTypeMap[demo.slug] ?? "report";

      rows.push({
        id: lib?.id ?? key,
        skill_slug: demo.slug,
        file_name: demo.file_name,
        title: lib?.title ?? formatDemoTitle(demo.file_name, demo.skill_name),
        description: lib?.description ?? "",
        writeup: lib?.writeup ?? "",
        type: skillType,
        solution: lib?.solution ?? "analytics",
        category: lib?.category ?? "",
        subcategory: lib?.subcategory ?? "",
        metrics: (lib?.metrics ?? []).join(", "),
        sources: (lib?.sources ?? []).join(", "),
        published: lib?.published ?? false,
        featured: lib?.featured ?? false,
        report_url: lib?.report_url ?? "",
        sort_order: lib?.sort_order ?? 999,
      });
    }

    // 2. skill_library entries that don't have a local demo (e.g. uploaded directly)
    if (libraryMap) {
      for (const [key, lib] of libraryMap) {
        if (!seen.has(key)) {
          rows.push({
            id: lib.id,
            skill_slug: lib.skill_slug,
            file_name: lib.file_name,
            title: lib.title,
            description: lib.description ?? "",
            writeup: lib.writeup ?? "",
            type: lib.type,
            solution: lib.solution,
            category: lib.category,
            subcategory: lib.subcategory ?? "",
            metrics: (lib.metrics ?? []).join(", "),
            sources: (lib.sources ?? []).join(", "),
            published: lib.published,
            featured: lib.featured,
            report_url: lib.report_url ?? "",
            sort_order: lib.sort_order,
          });
        }
      }
    }

    // Filter
    return rows
      .filter(r => typeFilter === "all" || r.type === typeFilter)
      .filter(r => {
        if (!search) return true;
        const q = search.toLowerCase();
        return r.title.toLowerCase().includes(q) || r.skill_slug.toLowerCase().includes(q) || r.file_name.toLowerCase().includes(q);
      });
  }, [demos, libraryMap, skillTypeMap, search, typeFilter]);

  const handleCellValueChanged = useCallback((event: CellValueChangedEvent<ReportsGridRow>) => {
    const { data, colDef } = event;
    if (!data || !colDef.field) return;

    const field = colDef.field as keyof ReportsGridRow;
    const updates: Record<string, unknown> = {};

    if (field === "metrics") {
      updates.metrics = data.metrics ? data.metrics.split(",").map((s: string) => s.trim()).filter(Boolean) : [];
    } else if (field === "sources") {
      updates.sources = data.sources ? data.sources.split(",").map((s: string) => s.trim()).filter(Boolean) : [];
    } else {
      updates[field] = data[field];
    }

    upsert.mutate({
      skill_slug: data.skill_slug,
      file_name: data.file_name,
      title: data.title,
      category: data.category || "uncategorized",
      solution: data.solution || "analytics",
      type: data.type || "report",
      description: data.description || null,
      writeup: data.writeup || null,
      subcategory: data.subcategory || null,
      published: data.published,
      featured: data.featured,
      sort_order: data.sort_order,
      report_url: data.report_url || null,
      ...updates,
    } as any);
  }, [upsert]);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    filter: true,
    cellClass: "text-xs",
    cellStyle: { display: "flex", alignItems: "center" },
  }), []);

  if (libLoading || skillsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={20} className="animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div
      className={cn(themeClass, "flex-1 min-h-0 overflow-hidden")}
      style={{ width: "100%", height: "100%" }}
    >
      <AgGridReact<ReportsGridRow>
        ref={setGridRef}
        theme="legacy"
        rowData={rowData}
        columnDefs={GRID_COL_DEFS}
        defaultColDef={defaultColDef}
        getRowId={(params) => params.data.id}
        onCellValueChanged={handleCellValueChanged}
        onRowDoubleClicked={(e) => { if (e.data && onRowDoubleClicked) onRowDoubleClicked(e.data); }}
        onGridReady={() => {
          // Apply saved default layout once grid is ready
          if (defaultLayoutName && savedLayouts?.[defaultLayoutName]) {
            gridRef.current?.api?.applyColumnState({ state: savedLayouts[defaultLayoutName] as any, applyOrder: true });
          }
        }}
        quickFilterText={search}
        animateRows
        enableRangeSelection
        enableBrowserTooltips
        singleClickEdit
        stopEditingWhenCellsLoseFocus
        rowSelection="single"
        suppressRowClickSelection
        rowHeight={36}
        headerHeight={36}
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
        paginationPageSizeSelector={[50, 100, 200]}
      />
    </div>
  );
});

function ReportThumbnail({ example, pinned, isPublished, onTogglePin, onClick }: {
  example: SkillExample;
  pinned?: boolean;
  isPublished?: boolean;
  onTogglePin?: () => void;
  onClick: () => void;
}) {
  // Lazy load: only read file when thumbnail is visible in viewport
  const [isVisible, setIsVisible] = useState(false);
  const thumbRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setIsVisible(true); observer.disconnect(); } },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const { data: htmlContent } = useReadFile(isVisible ? example.file_path : undefined);

  const thumbSrcDoc = useMemo(() => {
    if (!htmlContent) return undefined;
    const thumbStyle = `<style>body{margin:0!important;padding:0.5rem!important;overflow:hidden!important;pointer-events:none!important}body,body>*{max-width:100%!important;width:100%!important;box-sizing:border-box!important}img,table,pre{max-width:100%!important}</style>`;
    if (htmlContent.includes("</head>")) {
      return htmlContent.replace("</head>", `${thumbStyle}</head>`);
    }
    return thumbStyle + htmlContent;
  }, [htmlContent]);

  return (
    <div ref={thumbRef} className="group relative rounded-lg border border-zinc-200/80 dark:border-zinc-800 overflow-hidden text-left hover:border-teal-400/60 dark:hover:border-teal-600 shadow-sm hover:shadow-md transition-all duration-200">
      {/* Pin button - top right corner */}
      {onTogglePin && (
        <button
          onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
          className={cn(
            "absolute top-2 right-2 z-10 p-1.5 rounded-lg transition-all",
            pinned
              ? "bg-teal-500 text-white shadow-sm opacity-100"
              : "bg-black/50 backdrop-blur-sm text-white opacity-0 group-hover:opacity-100"
          )}
          title={pinned ? "Unpin" : "Pin to top"}
        >
          {pinned ? <PinOff size={11} /> : <Pin size={11} />}
        </button>
      )}
      {/* Published indicator - top left */}
      {isPublished && (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-500 text-white text-[10px] font-semibold shadow-sm">
          <Globe size={9} />
          Live
        </div>
      )}
      <button onClick={onClick} className="w-full text-left">
        <div className="relative h-32 overflow-hidden bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-950">
          {thumbSrcDoc ? (
            <iframe
              srcDoc={thumbSrcDoc}
              className="w-[300%] h-[300%] border-0 origin-top-left pointer-events-none"
              style={{ transform: "scale(0.333)" }}
              tabIndex={-1}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={16} className="animate-spin text-zinc-300" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        </div>
        <div className="px-3 py-2 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-950">
          <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">{example.skill_name}</p>
          <p className="text-[10px] text-zinc-400 mt-0.5 truncate">{example.file_name}</p>
        </div>
      </button>
    </div>
  );
}

function ReportCompactRow({ example, categoryLabel, categoryVisual, pinned, isPublished, onTogglePin, onClick }: {
  example: SkillExample;
  categoryLabel: string;
  categoryVisual: { icon: typeof BarChart3; color: string };
  pinned?: boolean;
  isPublished?: boolean;
  onTogglePin?: () => void;
  onClick: () => void;
}) {
  const { data: htmlContent } = useReadFile(example.file_path);
  const CatIcon = categoryVisual.icon;

  const thumbSrcDoc = useMemo(() => {
    if (!htmlContent) return undefined;
    const thumbStyle = `<style>body{margin:0!important;padding:0.5rem!important;overflow:hidden!important;pointer-events:none!important}body,body>*{max-width:100%!important;width:100%!important;box-sizing:border-box!important}img,table,pre{max-width:100%!important}</style>`;
    if (htmlContent.includes("</head>")) {
      return htmlContent.replace("</head>", `${thumbStyle}</head>`);
    }
    return thumbStyle + htmlContent;
  }, [htmlContent]);

  return (
    <div
      className="group relative flex items-center gap-3 rounded-lg border border-zinc-200/80 dark:border-zinc-800 overflow-hidden hover:border-teal-400/60 dark:hover:border-teal-600 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer bg-white dark:bg-zinc-950"
      onClick={onClick}
    >
      {/* Mini thumbnail */}
      <div className="relative w-28 h-20 flex-shrink-0 overflow-hidden bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-950">
        {thumbSrcDoc ? (
          <iframe
            srcDoc={thumbSrcDoc}
            className="w-[300%] h-[300%] border-0 origin-top-left pointer-events-none"
            style={{ transform: "scale(0.333)" }}
            tabIndex={-1}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={12} className="animate-spin text-zinc-300" />
          </div>
        )}
        {isPublished && (
          <div className="absolute top-1 left-1 flex items-center gap-0.5 px-1 py-px rounded-full bg-teal-500 text-white text-[8px] font-semibold">
            <Globe size={7} />
            Live
          </div>
        )}
      </div>
      {/* Text */}
      <div className="flex-1 min-w-0 py-2 pr-3">
        <div className="flex items-center gap-1.5 mb-0.5">
          <CatIcon size={10} className={categoryVisual.color} />
          <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">{categoryLabel}</span>
        </div>
        <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">{example.skill_name}</p>
        <p className="text-[10px] text-zinc-400 truncate">{example.file_name}</p>
      </div>
      {/* Pin button */}
      {onTogglePin && (
        <button
          onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
          className={cn(
            "absolute top-1.5 right-1.5 p-1 rounded-md transition-all",
            pinned
              ? "bg-teal-500 text-white opacity-100"
              : "bg-black/40 text-white opacity-0 group-hover:opacity-100"
          )}
          title={pinned ? "Unpin" : "Pin to top"}
        >
          {pinned ? <PinOff size={9} /> : <Pin size={9} />}
        </button>
      )}
    </div>
  );
}

// ─── Decks Tab ───────────────────────────────────────────────────────────────

function DecksTab({ demos, search, isLoading }: { demos: SkillExample[]; search: string; isLoading: boolean }) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const { data: selectedHtml } = useReadFile(selectedPath ?? undefined);

  const selectedExample = demos.find(e => e.file_path === selectedPath);

  // For decks, no style overrides — let the deck render natively in the iframe
  const iframeSrcDoc = useMemo(() => {
    if (!selectedHtml) return undefined;
    return selectedHtml;
  }, [selectedHtml]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return demos.filter(ex =>
      !q || ex.skill_name.toLowerCase().includes(q) || ex.file_name.toLowerCase().includes(q) || ex.slug.toLowerCase().includes(q)
    );
  }, [demos, search]);

  if (isLoading) return <SectionLoading className="py-12" />;

  // Full-screen deck viewer
  if (selectedPath && iframeSrcDoc) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-shrink-0 px-4 pt-3 pb-2">
          <Button
            variant="ghost"
            icon={ChevronRight}
            onClick={() => setSelectedPath(null)}
            className="mb-2 [&_svg:first-child]:rotate-180"
          >
            Back to gallery
          </Button>
          {selectedExample && (
            <div>
              <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{selectedExample.skill_name}</h2>
              <p className="text-xs text-zinc-400">{selectedExample.file_name}</p>
            </div>
          )}
        </div>
        <div className="flex-1 min-h-0 px-4 pb-4">
          <iframe
            srcDoc={iframeSrcDoc}
            className="w-full h-full border-0 rounded-lg border border-zinc-200 dark:border-zinc-800"
            sandbox="allow-scripts"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-zinc-400">{filtered.length} decks</span>
      </div>
      {filtered.length === 0 ? (
        <div className="text-center py-8 text-xs text-zinc-400">
          {search ? `No decks matching "${search}"` : "No demo decks found in _skills/*/demo/"}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {filtered.map(ex => (
            <DeckThumbnail key={ex.file_path} example={ex} onClick={() => setSelectedPath(ex.file_path)} />
          ))}
        </div>
      )}
    </div>
  );
}

function DeckThumbnail({ example, onClick }: { example: SkillExample; onClick: () => void }) {
  const { data: htmlContent } = useReadFile(example.file_path);

  // Show first slide only — inject style to hide everything after first slide + nav
  const thumbSrcDoc = useMemo(() => {
    if (!htmlContent) return undefined;
    const thumbStyle = `<style>
      html{scroll-snap-type:none!important;overflow:hidden!important}
      body{margin:0!important;padding:0!important;overflow:hidden!important;pointer-events:none!important}
      .slide~.slide{display:none!important}
      .nav-dots,.keyboard-hint,.progress-bar{display:none!important}
      .slide{height:100vh!important;scroll-snap-align:none!important}
    </style>`;
    if (htmlContent.includes("</head>")) {
      return htmlContent.replace("</head>", `${thumbStyle}</head>`);
    }
    return thumbStyle + htmlContent;
  }, [htmlContent]);

  return (
    <div className="group relative rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden text-left hover:border-teal-300 dark:hover:border-teal-700 hover:shadow-sm transition-all">
      <button onClick={onClick} className="w-full text-left">
        <div className="relative overflow-hidden bg-zinc-900" style={{ aspectRatio: "16/9" }}>
          {thumbSrcDoc ? (
            <iframe
              srcDoc={thumbSrcDoc}
              className="w-[400%] h-[400%] border-0 origin-top-left pointer-events-none"
              style={{ transform: "scale(0.25)" }}
              tabIndex={-1}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={14} className="animate-spin text-zinc-500" />
            </div>
          )}
          <div className="absolute inset-0 bg-teal-600/0 group-hover:bg-teal-600/5 transition-colors pointer-events-none" />
        </div>
        <div className="px-3 py-2 border-t border-zinc-100 dark:border-zinc-800">
          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">{example.skill_name}</p>
          <p className="text-xs text-zinc-400 truncate">{example.file_name}</p>
        </div>
      </button>
    </div>
  );
}

// ─── File Gallery Tab (images, excalidraw, videos) ───────────────────────────

function FileGalleryTab({ items, search, isLoading, galleryType }: {
  items: GalleryItem[];
  search: string;
  isLoading: boolean;
  galleryType: string;
}) {
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [editMode, setEditMode] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(i =>
      !q || i.file_name.toLowerCase().includes(q) || i.folder.toLowerCase().includes(q)
    );
  }, [items, search]);

  if (isLoading) return <div className="flex-1 flex items-center justify-center py-12"><SectionLoading /></div>;

  if (selectedItem) {
    // Edit mode — full editor
    if (editMode) {
      if (selectedItem.gallery_type === "excalidraw") {
        return <ExcalidrawEditor item={selectedItem} onBack={() => setEditMode(false)} />;
      }
      if (selectedItem.gallery_type === "image") {
        return <ImageEditor item={selectedItem} onBack={() => setEditMode(false)} />;
      }
    }

    // Preview mode — view with optional Edit button
    const canEdit = selectedItem.gallery_type === "image" || selectedItem.gallery_type === "excalidraw";
    return (
      <div className="flex flex-col h-full">
        <div className="flex-shrink-0 px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              icon={ChevronRight}
              onClick={() => { setSelectedItem(null); setEditMode(false); }}
              className="[&_svg:first-child]:rotate-180"
            >
              Back
            </Button>
            <div>
              <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{selectedItem.file_name}</h2>
              <p className="text-xs text-zinc-400">{selectedItem.folder}</p>
            </div>
          </div>
          {canEdit && (
            <Button size="md" icon={PenTool} onClick={() => setEditMode(true)}>
              Edit
            </Button>
          )}
        </div>
        <div className="flex-1 min-h-0 px-4 pb-4 flex items-center justify-center">
          <FilePreview item={selectedItem} fullSize />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {filtered.length === 0 ? (
        <div className="text-center py-8 text-xs text-zinc-400">
          {search ? `No ${galleryType} files matching "${search}"` : `No ${galleryType} files found`}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {filtered.map(item => (
            <FileCard key={item.file_path} item={item} onClick={() => setSelectedItem(item)} />
          ))}
        </div>
      )}
    </div>
  );
}

function FileCard({ item, onClick }: { item: GalleryItem; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden text-left hover:border-teal-300 dark:hover:border-teal-700 hover:shadow-sm transition-all"
    >
      <div className="relative h-36 overflow-hidden bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center">
        <FilePreview item={item} />
        <div className="absolute inset-0 bg-teal-600/0 group-hover:bg-teal-600/5 transition-colors" />
      </div>
      <div className="px-3 py-2 border-t border-zinc-100 dark:border-zinc-800">
        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">{item.file_name}</p>
        <p className="text-xs text-zinc-400 truncate">{item.folder}</p>
        <p className="text-[10px] text-zinc-300 dark:text-zinc-600 mt-0.5">
          {item.modified ? item.modified.slice(0, 10) : ""}
          {item.size_bytes > 0 && ` · ${formatSize(item.size_bytes)}`}
        </p>
      </div>
    </button>
  );
}

function FilePreview({ item, fullSize }: { item: GalleryItem; fullSize?: boolean }) {
  if (item.gallery_type === "image") {
    return (
      <img
        src={convertFileSrc(item.file_path)}
        alt={item.file_name}
        className={fullSize ? "max-w-full max-h-full object-contain" : "w-full h-full object-cover"}
        loading="lazy"
      />
    );
  }

  if (item.gallery_type === "excalidraw") {
    return <ExcalidrawPreview filePath={item.file_path} fullSize={fullSize} />;
  }

  if (item.gallery_type === "video") {
    if (fullSize) {
      return (
        <video
          src={convertFileSrc(item.file_path)}
          controls
          className="max-w-full max-h-full"
        />
      );
    }
    return (
      <div className="flex flex-col items-center gap-2 text-zinc-400">
        <Video size={24} />
      </div>
    );
  }

  return null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Excalidraw Preview ──────────────────────────────────────────────────────

function ExcalidrawPreview({ filePath, fullSize }: { filePath: string; fullSize?: boolean }) {
  const { data: content } = useReadFile(filePath);
  const [svgHtml, setSvgHtml] = useState<string | null>(null);

  useEffect(() => {
    if (!content) return;
    let cancelled = false;

    async function render() {
      try {
        const data = JSON.parse(content!);
        const { exportToSvg } = await import("@excalidraw/excalidraw");
        const svg = await exportToSvg({
          elements: data.elements || [],
          appState: {
            exportWithDarkMode: false,
            exportBackground: true,
            viewBackgroundColor: data.appState?.viewBackgroundColor || "#ffffff",
          },
          files: data.files || {},
        });
        if (!cancelled) {
          setSvgHtml(new XMLSerializer().serializeToString(svg));
        }
      } catch {
        // Silently fail — show nothing
      }
    }

    render();
    return () => { cancelled = true; };
  }, [content]);

  if (!svgHtml) {
    return (
      <div className="flex items-center justify-center text-zinc-300">
        <Loader2 size={fullSize ? 24 : 14} className="animate-spin" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "[&_svg]:max-w-full [&_svg]:h-auto",
        fullSize
          ? "w-full h-full flex items-center justify-center overflow-auto p-4"
          : "w-full h-full overflow-hidden"
      )}
      dangerouslySetInnerHTML={{ __html: svgHtml }}
    />
  );
}
