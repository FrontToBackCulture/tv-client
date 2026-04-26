// src/modules/public-data/JobReviewsView.tsx
// Browse MCF job postings, filter, review, and add companies to CRM

import { useState, useRef, useEffect, useMemo, useCallback, forwardRef, useImperativeHandle } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  ColDef,
  ModuleRegistry,
  AllCommunityModule,
  GetRowIdParams,
} from "ag-grid-community";
import { AllEnterpriseModule, LicenseManager } from "ag-grid-enterprise";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import { useAppStore } from "../../stores/appStore";
import { themeStyles } from "../domains/reviewGridStyles";
import { CollapsibleSection } from "../../components/ui/CollapsibleSection";
import {
  Search,
  Loader2,
  ExternalLink,
  Building2,
  ChevronDown,
  ChevronRight,
  X,
  Save,
  Trash2,
  Filter,
  Briefcase,
  Eye,
  SkipForward,
  UserPlus,
  Sparkles,
  Layers,
  Circle,
  Bookmark,
  Maximize2,
  RotateCcw,
  ChevronsLeftRight,
  Star,
  PanelLeftOpen,
  PanelLeftClose,
} from "lucide-react";
import { useAuth } from "../../stores/authStore";
import {
  useMcfJobs,
  useMcfJob,
  useJobReviews,
  useReviewedJobIds,
  useUpsertJobReview,
  useSavedFilters,
  useCreateSavedFilter,
  useDeleteSavedFilter,
  useSemanticSearch,
  useEmbeddingCoverage,
} from "../../hooks/public-data";
import type { SemanticSearchResult } from "../../hooks/public-data";
import { useCreateCompany } from "../../hooks/crm/useCompanies";
import { FormModal, inputClass } from "../../components/ui/FormModal";
import type {
  McfJobPosting,
  JobFilters,
  ReviewStatus,
  JobReview,
} from "../../lib/public-data/types";
import {
  INDUSTRY_TAG_OPTIONS,
  ROLE_CATEGORY_OPTIONS,
  REVIEW_STATUS_CONFIG,
} from "../../lib/public-data/types";

// Register AG Grid modules (idempotent)
ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule]);

if (typeof window !== "undefined" && import.meta.env.VITE_AG_GRID_LICENSE_KEY) {
  LicenseManager.setLicenseKey(import.meta.env.VITE_AG_GRID_LICENSE_KEY);
}

// ─── Main View ─────────────────────────────────────────

export function JobReviewsView() {
  const user = useAuth((s) => s.user);
  const currentUser = user?.login || user?.name || "unknown";

  const [filters, setFilters] = useState<JobFilters>({});
  const [selectedMcfUuid, setSelectedMcfUuid] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [smartSearch, setSmartSearch] = useState(false);
  const [semanticQuery, setSemanticQuery] = useState("");

  // Grid imperative handle + view state (lifted so the filter bar can drive layouts/fullscreen)
  const gridHandleRef = useRef<JobsGridHandle>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && isFullscreen) setIsFullscreen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  // Standard paginated search
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useMcfJobs(filters);

  // Semantic search
  const {
    data: semanticResults = [],
    isLoading: isSemanticLoading,
    isFetching: isSemanticFetching,
  } = useSemanticSearch(semanticQuery, filters, smartSearch);

  const { data: reviewedIds } = useReviewedJobIds(currentUser);

  const standardJobs = useMemo(() => data?.pages.flat() ?? [], [data]);

  // Pick the right job list based on mode
  const jobs = smartSearch ? semanticResults : standardJobs;

  // Client-side filter for unreviewed
  const filteredJobs = useMemo(() => {
    if (!filters.unreviewed_only || !reviewedIds) return jobs;
    return jobs.filter((j) => !reviewedIds.has(j.mcf_uuid));
  }, [jobs, filters.unreviewed_only, reviewedIds]);

  const loading = smartSearch ? isSemanticLoading : isLoading;

  // Infinite scroll sentinel (standard mode only)
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (smartSearch) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, smartSearch]);

  return (
   <div className="h-full flex overflow-hidden px-4 py-4">
    <div className="flex-1 min-h-0 flex overflow-hidden border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-950">
      {sidebarOpen && <JobsSidebar filters={filters} onChange={setFilters} />}

      {/* Left: filter bar + list */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-zinc-200 dark:border-zinc-800">
        <JobsFilterBar
          filters={filters}
          onChange={setFilters}
          onSave={() => setShowSaveModal(true)}
          currentUser={currentUser}
          smartSearch={smartSearch}
          onSmartSearchToggle={setSmartSearch}
          semanticQuery={semanticQuery}
          onSemanticQueryChange={setSemanticQuery}
          isSearching={isSemanticFetching}
          gridHandleRef={gridHandleRef}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />
        <div className="px-4 py-1.5 text-[11px] text-zinc-400 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2 flex-shrink-0">
          {loading ? (
            <Loader2 size={10} className="animate-spin" />
          ) : (
            <>{filteredJobs.length}{smartSearch ? "" : "+"} results</>
          )}
          {smartSearch && isSemanticFetching && (
            <Loader2 size={10} className="animate-spin" />
          )}
        </div>
        <div className="flex-1 min-h-0">
          {!loading && filteredJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-zinc-400">
              <Briefcase size={32} className="mb-2" />
              <p className="text-sm">
                {smartSearch && semanticQuery
                  ? "No semantic matches found"
                  : "No jobs found"}
              </p>
              <p className="text-xs mt-1">
                {smartSearch
                  ? "Try a different description or lower the threshold"
                  : "Try adjusting your filters"}
              </p>
            </div>
          ) : (
            <JobsGrid
              ref={gridHandleRef}
              jobs={filteredJobs}
              reviewedIds={reviewedIds}
              selectedMcfUuid={selectedMcfUuid}
              onSelectJob={(uuid) =>
                setSelectedMcfUuid(uuid === selectedMcfUuid ? null : uuid)
              }
              sentinelRef={!smartSearch ? sentinelRef : undefined}
              isFetchingNextPage={isFetchingNextPage}
              isFullscreen={isFullscreen}
            />
          )}
        </div>
      </div>

      {/* Right: detail panel */}
      {selectedMcfUuid && (
        <JobDetailPanel
          mcfUuid={selectedMcfUuid}
          currentUser={currentUser}
          onClose={() => setSelectedMcfUuid(null)}
        />
      )}

      {/* Save filter modal */}
      {showSaveModal && (
        <SaveFilterModal
          filters={filters}
          currentUser={currentUser}
          onClose={() => setShowSaveModal(false)}
        />
      )}
    </div>
   </div>
  );
}

// ─── Filter Bar ────────────────────────────────────────

function JobsFilterBar({
  filters,
  onChange,
  onSave,
  currentUser: _currentUser,
  smartSearch,
  onSmartSearchToggle,
  semanticQuery,
  onSemanticQueryChange,
  isSearching,
  gridHandleRef,
  isFullscreen,
  onToggleFullscreen,
  sidebarOpen,
  onToggleSidebar,
}: {
  filters: JobFilters;
  onChange: (f: JobFilters) => void;
  onSave: () => void;
  currentUser: string;
  smartSearch: boolean;
  onSmartSearchToggle: (v: boolean) => void;
  semanticQuery: string;
  onSemanticQueryChange: (q: string) => void;
  isSearching: boolean;
  gridHandleRef: React.RefObject<JobsGridHandle | null>;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}) {
  const { data: savedFilters = [] } = useSavedFilters();
  const deleteFilter = useDeleteSavedFilter();
  const [searchInput, setSearchInput] = useState(filters.search || "");
  const [smartInput, setSmartInput] = useState(semanticQuery);

  // Layouts state — local to the bar, persisted in localStorage
  const LAYOUTS_KEY = "tv-jobs-grid-layouts";
  const DEFAULT_LAYOUT_KEY = "tv-jobs-grid-default-layout";
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [savedLayouts, setSavedLayouts] = useState<Record<string, object>>(() => {
    try { return JSON.parse(localStorage.getItem(LAYOUTS_KEY) || "{}"); } catch { return {}; }
  });
  const [defaultLayoutName, setDefaultLayoutName] = useState<string | null>(() =>
    localStorage.getItem(DEFAULT_LAYOUT_KEY)
  );
  const persistLayouts = (next: Record<string, object>) => {
    setSavedLayouts(next);
    localStorage.setItem(LAYOUTS_KEY, JSON.stringify(next));
  };
  const saveCurrentLayout = (name: string) => {
    const api = gridHandleRef.current?.getApi();
    if (!api || !name.trim()) return;
    persistLayouts({
      ...savedLayouts,
      [name.trim()]: { columnState: api.getColumnState(), filterModel: api.getFilterModel() },
    });
  };
  const loadLayout = (name: string) => {
    const api = gridHandleRef.current?.getApi();
    const layout = savedLayouts[name] as { columnState?: unknown; filterModel?: Record<string, unknown> } | undefined;
    if (!api || !layout?.columnState) return;
    api.applyColumnState({ state: layout.columnState as never, applyOrder: true });
    if (layout.filterModel) api.setFilterModel(layout.filterModel);
    setShowLayoutMenu(false);
  };
  const deleteLayout = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = { ...savedLayouts };
    delete next[name];
    persistLayouts(next);
    if (defaultLayoutName === name) {
      setDefaultLayoutName(null);
      localStorage.removeItem(DEFAULT_LAYOUT_KEY);
    }
  };
  const toggleDefaultLayout = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = defaultLayoutName === name ? null : name;
    setDefaultLayoutName(next);
    if (next) localStorage.setItem(DEFAULT_LAYOUT_KEY, next); else localStorage.removeItem(DEFAULT_LAYOUT_KEY);
  };
  const autoSizeAll = () => gridHandleRef.current?.getApi()?.autoSizeAllColumns();
  const resetLayout = () => {
    const api = gridHandleRef.current?.getApi();
    if (!api) return;
    api.resetColumnState();
    api.setFilterModel(null);
  };

  const handleSearchSubmit = () => {
    onChange({ ...filters, search: searchInput || undefined });
  };

  const handleSmartSearchSubmit = () => {
    onSemanticQueryChange(smartInput);
  };

  return (
    <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 space-y-1.5">
      {/* Row 1: Search + smart toggle + saved filters + save */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleSidebar}
          className={`flex items-center justify-center p-1.5 rounded-md border transition-colors flex-shrink-0 ${
            sidebarOpen
              ? "border-teal-500 bg-teal-500/20 text-teal-600 dark:text-teal-400"
              : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          }`}
          title={sidebarOpen ? "Collapse sidebar" : "Open sidebar"}
        >
          {sidebarOpen ? <PanelLeftClose size={12} /> : <PanelLeftOpen size={12} />}
        </button>
        {/* Smart search toggle */}
        <button
          onClick={() => onSmartSearchToggle(!smartSearch)}
          className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors flex-shrink-0 ${
            smartSearch
              ? "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 ring-1 ring-violet-300 dark:ring-violet-700"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
          }`}
          title={smartSearch ? "Switch to keyword search" : "Switch to AI semantic search"}
        >
          <Sparkles size={12} />
          AI
        </button>
        {smartSearch && <EmbeddingCoverageLabel />}

        {/* Search input — different mode */}
        <div className="relative flex-1">
          {isSearching ? (
            <Loader2
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-violet-500 animate-spin"
            />
          ) : (
            <Search
              size={13}
              className={`absolute left-2.5 top-1/2 -translate-y-1/2 ${
                smartSearch ? "text-violet-400" : "text-zinc-400"
              }`}
            />
          )}
          {smartSearch ? (
            <input
              type="text"
              placeholder="Describe what you're looking for... e.g. accounts receivable and payable"
              value={smartInput}
              onChange={(e) => setSmartInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSmartSearchSubmit()}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-500 text-zinc-900 dark:text-zinc-100 placeholder-violet-400"
            />
          ) : (
            <input
              type="text"
              placeholder="Search jobs or companies..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearchSubmit()}
              onBlur={handleSearchSubmit}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-500 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400"
            />
          )}
        </div>

        {/* Saved filters dropdown */}
        {savedFilters.length > 0 && (
          <div className="relative group">
            <button className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md">
              <Filter size={12} />
              Saved
              <ChevronDown size={12} />
            </button>
            <div className="hidden group-hover:block absolute right-0 top-full mt-1 w-56 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg z-20">
              {savedFilters.map((sf) => (
                <div
                  key={sf.id}
                  className="flex items-center justify-between px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
                  onClick={() => {
                    onChange(sf.filters);
                    setSearchInput(sf.filters.search || "");
                  }}
                >
                  <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate">
                    {sf.name}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteFilter.mutate(sf.id);
                    }}
                    className="p-0.5 hover:text-red-500"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={onSave}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/30 hover:bg-teal-100 dark:hover:bg-teal-900/40 rounded-md"
          title="Save current filters"
        >
          <Save size={12} />
          Save
        </button>

        {/* Layouts dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowLayoutMenu(!showLayoutMenu)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
            title="Layouts & view options"
          >
            <Bookmark size={12} /> Layouts
          </button>
          {showLayoutMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowLayoutMenu(false)} />
              <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-zinc-800 rounded-md shadow-lg border border-zinc-200 dark:border-zinc-800 z-50 py-1">
                <button onClick={() => { autoSizeAll(); setShowLayoutMenu(false); }} className="w-full px-3 py-1.5 text-left text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center gap-2">
                  <ChevronsLeftRight size={12} /> Auto-fit Columns
                </button>
                <button onClick={() => { resetLayout(); setShowLayoutMenu(false); }} className="w-full px-3 py-1.5 text-left text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center gap-2">
                  <RotateCcw size={12} /> Reset to Default
                </button>
                <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />
                <button
                  onClick={() => {
                    const name = window.prompt("Layout name?");
                    if (name?.trim()) saveCurrentLayout(name);
                    setShowLayoutMenu(false);
                  }}
                  className="w-full px-3 py-1.5 text-left text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center gap-2"
                >
                  <span className="text-green-600 dark:text-green-400">+</span> Save current layout...
                </button>
                {Object.keys(savedLayouts).length > 0 && (
                  <>
                    <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />
                    <div className="px-3 py-1 text-[10px] font-medium text-zinc-500 uppercase tracking-wide">Saved</div>
                    {Object.keys(savedLayouts).map((name) => (
                      <div
                        key={name}
                        onClick={() => loadLayout(name)}
                        className="w-full px-3 py-1.5 text-left text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center justify-between cursor-pointer group"
                      >
                        <span className="truncate flex items-center gap-1.5">
                          {defaultLayoutName === name && <Star size={10} className="text-amber-500 fill-amber-500 flex-shrink-0" />}
                          {name}
                        </span>
                        <div className="flex items-center gap-0.5">
                          <button onClick={(e) => toggleDefaultLayout(name, e)} className={`p-1 rounded ${defaultLayoutName === name ? "text-amber-500" : "opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-amber-500"}`} title={defaultLayoutName === name ? "Remove as default" : "Set as default"}>
                            <Star size={10} className={defaultLayoutName === name ? "fill-amber-500" : ""} />
                          </button>
                          <button onClick={(e) => deleteLayout(name, e)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500" title="Delete layout">
                            <X size={10} />
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

        {/* Fullscreen */}
        <button
          onClick={onToggleFullscreen}
          className={`flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md border transition-colors ${
            isFullscreen
              ? "border-teal-500 bg-teal-500/20 text-teal-600 dark:text-teal-400"
              : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
          }`}
          title={isFullscreen ? "Exit fullscreen (ESC)" : "Enter fullscreen"}
        >
          {isFullscreen ? <X size={12} /> : <Maximize2 size={12} />}
        </button>
      </div>

      {/* Row 2: Clear all */}
      {Object.keys(filters).length > 0 && (
        <div className="flex items-center">
          <button
            onClick={() => {
              onChange({});
              setSearchInput("");
            }}
            className="px-2 py-0.5 text-[11px] font-medium text-red-500 hover:text-red-600 rounded-full"
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Sidebar ───────────────────────────────────────────

type JobView = "all" | "unreviewed";
const VIEW_DEFS: { id: JobView; label: string; icon: typeof Layers }[] = [
  { id: "all",        label: "All",         icon: Layers },
  { id: "unreviewed", label: "Unreviewed",  icon: Circle },
];

function JobsSidebar({
  filters,
  onChange,
}: {
  filters: JobFilters;
  onChange: (f: JobFilters) => void;
}) {
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set(["industry", "role"]));
  const toggleSection = (s: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  const view: JobView = filters.unreviewed_only ? "unreviewed" : "all";
  const setView = (v: JobView) => {
    onChange({ ...filters, unreviewed_only: v === "unreviewed" ? true : undefined });
  };

  const selectedIndustry = filters.industry_tag?.[0];
  const selectedRole = filters.role_category?.[0];
  const hasSpecificIndustry = (filters.industry_tag?.length ?? 0) === 1;
  const hasSpecificRole = (filters.role_category?.length ?? 0) === 1;

  return (
    <aside className="w-64 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 flex flex-col overflow-hidden rounded-l-md">
      {/* View section */}
      <div className="px-3 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <CollapsibleSection title="View" storageKey="job-reviews:view">
          {VIEW_DEFS.map((v) => {
            const Icon = v.icon;
            const active = view === v.id;
            return (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[13px] ${
                  active
                    ? "bg-teal-100 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                }`}
              >
                <Icon size={13} />
                {v.label}
              </button>
            );
          })}
        </CollapsibleSection>
      </div>

      {/* Industry + Role sections */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-3">
        <SidebarSection
          title="Industry"
          isOpen={openSections.has("industry")}
          onToggle={() => toggleSection("industry")}
        >
          <SidebarRow
            label="All industries"
            active={!hasSpecificIndustry}
            onClick={() => onChange({ ...filters, industry_tag: undefined })}
          />
          {Object.entries(INDUSTRY_TAG_OPTIONS).map(([key, label]) => (
            <SidebarRow
              key={key}
              label={label}
              active={hasSpecificIndustry && selectedIndustry === key}
              onClick={() => onChange({ ...filters, industry_tag: [key] })}
            />
          ))}
        </SidebarSection>

        <SidebarSection
          title="Role"
          isOpen={openSections.has("role")}
          onToggle={() => toggleSection("role")}
        >
          <SidebarRow
            label="All roles"
            active={!hasSpecificRole}
            onClick={() => onChange({ ...filters, role_category: undefined })}
          />
          {Object.entries(ROLE_CATEGORY_OPTIONS).map(([key, label]) => (
            <SidebarRow
              key={key}
              label={label}
              active={hasSpecificRole && selectedRole === key}
              onClick={() => onChange({ ...filters, role_category: [key] })}
            />
          ))}
        </SidebarSection>
      </div>
    </aside>
  );
}

function SidebarSection({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-wide text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      >
        {isOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {title}
      </button>
      {isOpen && <div className="mt-0.5">{children}</div>}
    </div>
  );
}

function SidebarRow({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center pl-4 pr-2 py-1 rounded text-[12px] text-left truncate ${
        active
          ? "bg-teal-100 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300"
          : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
      }`}
      title={label}
    >
      <span className="truncate">{label}</span>
    </button>
  );
}

// ─── Jobs Grid ─────────────────────────────────────────

interface JobsGridRow {
  id: string;
  mcf_uuid: string;
  title: string;
  company_name: string | null;
  company_employee_count: string | null;
  industry_label: string;
  role_label: string;
  salary: string;
  posted: string;
  postedTs: number;
  reviewed: boolean;
  similarity?: number;
}

export interface JobsGridHandle {
  getApi: () => import("ag-grid-community").GridApi | undefined;
}

const JobsGrid = forwardRef<JobsGridHandle, {
  jobs: McfJobPosting[];
  reviewedIds: Set<string> | undefined;
  selectedMcfUuid: string | null;
  onSelectJob: (mcfUuid: string) => void;
  sentinelRef?: React.Ref<HTMLDivElement>;
  isFetchingNextPage: boolean;
  isFullscreen: boolean;
}>(function JobsGrid({
  jobs,
  reviewedIds,
  selectedMcfUuid,
  onSelectJob,
  sentinelRef,
  isFetchingNextPage,
  isFullscreen,
}, ref) {
  const theme = useAppStore((s) => s.theme);
  const gridRef = useRef<AgGridReact<JobsGridRow>>(null);

  useImperativeHandle(ref, () => ({
    getApi: () => gridRef.current?.api,
  }), []);

  const rowData = useMemo<JobsGridRow[]>(() => {
    return jobs.map((j) => ({
      id: j.id,
      mcf_uuid: j.mcf_uuid,
      title: j.title,
      company_name: j.company_name,
      company_employee_count: j.company_employee_count,
      industry_label: j.industry_tag
        ? INDUSTRY_TAG_OPTIONS[j.industry_tag] || j.industry_tag
        : "",
      role_label: j.role_category
        ? ROLE_CATEGORY_OPTIONS[j.role_category] || j.role_category
        : "",
      salary: formatSalary(j.salary_min, j.salary_max, j.salary_type) || "",
      posted: j.new_posting_date
        ? new Date(j.new_posting_date).toLocaleDateString("en-SG", {
            day: "numeric",
            month: "short",
          })
        : "",
      postedTs: j.new_posting_date ? new Date(j.new_posting_date).getTime() : 0,
      reviewed: reviewedIds?.has(j.mcf_uuid) ?? false,
      similarity:
        "similarity" in j ? (j as SemanticSearchResult).similarity : undefined,
    }));
  }, [jobs, reviewedIds]);

  const hasSimilarity = useMemo(
    () => rowData.some((r) => r.similarity !== undefined),
    [rowData],
  );

  const columnDefs = useMemo<ColDef<JobsGridRow>[]>(() => {
    const cols: ColDef<JobsGridRow>[] = [
      {
        headerName: "",
        field: "reviewed",
        width: 36,
        sortable: false,
        filter: false,
        resizable: false,
        cellClass: "flex items-center justify-center",
        cellRenderer: (p: { value: boolean }) => (
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              p.value ? "bg-teal-500" : "bg-zinc-300 dark:bg-zinc-700"
            }`}
          />
        ),
      },
      {
        field: "title",
        headerName: "Title",
        flex: 2,
        minWidth: 220,
        filter: "agTextColumnFilter",
        cellClass: "text-sm font-medium text-zinc-900 dark:text-zinc-100",
      },
      {
        field: "company_name",
        headerName: "Company",
        flex: 1.5,
        minWidth: 180,
        filter: "agTextColumnFilter",
        cellRenderer: (p: { value: string; data?: JobsGridRow }) => (
          <span className="text-xs text-zinc-600 dark:text-zinc-400">
            {p.value || "Unknown company"}
            {p.data?.company_employee_count && (
              <span className="ml-1 text-zinc-400">
                ({p.data.company_employee_count})
              </span>
            )}
          </span>
        ),
      },
      {
        field: "industry_label",
        headerName: "Industry",
        width: 140,
        filter: "agSetColumnFilter",
        cellRenderer: (p: { value: string }) =>
          p.value ? (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
              {p.value}
            </span>
          ) : null,
      },
      {
        field: "role_label",
        headerName: "Role",
        width: 160,
        filter: "agSetColumnFilter",
        cellRenderer: (p: { value: string }) =>
          p.value ? (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400">
              {p.value}
            </span>
          ) : null,
      },
      {
        field: "salary",
        headerName: "Salary",
        width: 130,
        filter: "agTextColumnFilter",
        cellClass: "text-sm font-medium text-zinc-700 dark:text-zinc-300",
      },
      {
        field: "postedTs",
        headerName: "Posted",
        width: 110,
        sort: "desc",
        filter: "agNumberColumnFilter",
        valueFormatter: (p: { data?: JobsGridRow }) => p.data?.posted ?? "",
        cellClass: "text-xs text-zinc-500 dark:text-zinc-400",
      },
    ];

    if (hasSimilarity) {
      cols.splice(1, 0, {
        headerName: "Match",
        field: "similarity",
        width: 90,
        sort: "desc",
        cellRenderer: (p: { value: number | undefined }) =>
          p.value !== undefined ? (
            <span className="text-[11px] font-medium text-violet-600 dark:text-violet-400">
              {Math.round(p.value * 100)}%
            </span>
          ) : null,
      });
    }

    return cols;
  }, [hasSimilarity]);

  const defaultColDef = useMemo<ColDef>(
    () => ({
      sortable: true,
      resizable: true,
      filter: true,
      floatingFilter: true,
      tooltipShowDelay: 500,
      cellClass: "text-xs",
    }),
    [],
  );

  const getRowId = useCallback(
    (params: GetRowIdParams<JobsGridRow>) => params.data.mcf_uuid,
    [],
  );

  const themeClass = theme === "dark" ? "ag-theme-alpine-dark" : "ag-theme-alpine";

  return (
    <div className={isFullscreen ? "fixed inset-0 z-50 bg-zinc-50 dark:bg-zinc-950 p-4 flex flex-col" : "h-full flex flex-col"}>
      <style>{themeStyles}{`
        .ag-theme-alpine .ag-cell,
        .ag-theme-alpine-dark .ag-cell {
          display: flex;
          align-items: center;
        }
        .ag-theme-alpine .ag-row.ag-row-selected-tv,
        .ag-theme-alpine-dark .ag-row.ag-row-selected-tv {
          background-color: rgb(204 251 241 / 0.4) !important;
        }
        .ag-theme-alpine-dark .ag-row.ag-row-selected-tv {
          background-color: rgb(19 78 74 / 0.3) !important;
        }
      `}</style>

      <div className={`${themeClass} flex-1 min-h-0`} style={{ width: "100%" }}>
        <AgGridReact<JobsGridRow>
          ref={gridRef}
          theme="legacy"
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          getRowId={getRowId}
          rowHeight={36}
          headerHeight={32}
          floatingFiltersHeight={28}
          autoSizeStrategy={{ type: "fitCellContents", skipHeader: false }}
          animateRows
          enableBrowserTooltips
          rowSelection="single"
          suppressRowClickSelection
          onRowClicked={(e) => {
            if (e.data?.mcf_uuid) onSelectJob(e.data.mcf_uuid);
          }}
          getRowClass={(p) =>
            p.data?.mcf_uuid === selectedMcfUuid
              ? "ag-row-selected-tv"
              : undefined
          }
        />
      </div>
      {sentinelRef && (
        <div ref={sentinelRef} className="h-10 flex items-center justify-center flex-shrink-0">
          {isFetchingNextPage && (
            <Loader2 size={14} className="animate-spin text-zinc-400" />
          )}
        </div>
      )}
    </div>
  );
});

// ─── Job Detail Panel ──────────────────────────────────

function JobDetailPanel({
  mcfUuid,
  currentUser,
  onClose,
}: {
  mcfUuid: string;
  currentUser: string;
  onClose: () => void;
}) {
  const { data: job } = useMcfJob(mcfUuid);
  const { data: reviews = [] } = useJobReviews(mcfUuid);
  const myReview = reviews.find((r) => r.reviewed_by === currentUser);

  if (!job) {
    return (
      <div className="w-[480px] flex-shrink-0 flex items-center justify-center text-zinc-400">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-[480px] flex-shrink-0 overflow-y-auto bg-white dark:bg-zinc-950">
      <div className="p-5 space-y-5">
        {/* Header */}
        <div>
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
              {job.title}
            </h2>
            <button onClick={onClose} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded">
              <X size={16} className="text-zinc-400" />
            </button>
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <Building2 size={14} className="text-zinc-400" />
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {job.company_name || "Unknown"}
            </span>
            {job.company_url && (
              <a
                href={job.company_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-500 hover:text-teal-600"
              >
                <ExternalLink size={12} />
              </a>
            )}
          </div>
          {job.job_details_url && (
            <a
              href={job.job_details_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-xs text-teal-600 dark:text-teal-400 hover:underline"
            >
              View on MyCareersFuture
              <ExternalLink size={10} />
            </a>
          )}
        </div>

        {/* Quick facts */}
        <div className="grid grid-cols-2 gap-2">
          <Fact label="Salary" value={formatSalary(job.salary_min, job.salary_max, job.salary_type) || "Not disclosed"} />
          <Fact label="Experience" value={job.minimum_years_experience != null ? `${job.minimum_years_experience}+ years` : "—"} />
          <Fact label="Vacancies" value={job.number_of_vacancies?.toString() || "—"} />
          <Fact label="Company Size" value={job.company_employee_count || "—"} />
          <Fact label="UEN" value={job.company_uen || "—"} />
          <Fact label="Posted" value={job.new_posting_date ? new Date(job.new_posting_date).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" }) : "—"} />
          <Fact label="SSIC" value={job.acra_ssic_code ? `${job.acra_ssic_code} — ${job.acra_ssic_description || ""}` : "—"} />
          <Fact label="SSOC" value={job.ssoc_code || "—"} />
        </div>

        {/* Classification badges */}
        <div className="flex flex-wrap gap-1.5">
          {job.industry_tag && (
            <Badge color="amber">
              {INDUSTRY_TAG_OPTIONS[job.industry_tag] || job.industry_tag}
            </Badge>
          )}
          {job.role_category && (
            <Badge color="teal">
              {ROLE_CATEGORY_OPTIONS[job.role_category] || job.role_category}
            </Badge>
          )}
          {job.employment_types?.map((t) => (
            <Badge key={t} color="zinc">{t}</Badge>
          ))}
          {job.position_levels?.map((l) => (
            <Badge key={l} color="zinc">{l}</Badge>
          ))}
        </div>

        {/* Description */}
        {job.description && (
          <div>
            <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
              Description
            </h3>
            <div
              className="text-sm text-zinc-700 dark:text-zinc-300 prose prose-sm dark:prose-invert max-w-none max-h-64 overflow-y-auto"
              dangerouslySetInnerHTML={{ __html: job.description }}
            />
          </div>
        )}

        {/* Review form */}
        <ReviewForm
          mcfUuid={mcfUuid}
          currentUser={currentUser}
          existingReview={myReview || null}
          companyName={job.company_name}
          companyUen={job.company_uen}
          industryTag={job.industry_tag}
        />
      </div>
    </div>
  );
}

// ─── Review Form ───────────────────────────────────────

const STATUS_BUTTONS: { status: ReviewStatus; icon: typeof Eye; label: string }[] = [
  { status: "reviewing", icon: Eye, label: "Reviewing" },
  { status: "researching", icon: Search, label: "Researching" },
  { status: "prospected", icon: UserPlus, label: "Prospected" },
  { status: "skipped", icon: SkipForward, label: "Skip" },
];

function ReviewForm({
  mcfUuid,
  currentUser,
  existingReview,
  companyName,
  companyUen,
  industryTag,
}: {
  mcfUuid: string;
  currentUser: string;
  existingReview: JobReview | null;
  companyName: string | null;
  companyUen: string | null;
  industryTag: string | null;
}) {
  const upsertReview = useUpsertJobReview();
  const createCompany = useCreateCompany();
  const [notes, setNotes] = useState(existingReview?.notes || "");
  const [priority, setPriority] = useState<number | null>(existingReview?.priority ?? null);

  // Reset when switching jobs
  useEffect(() => {
    setNotes(existingReview?.notes || "");
    setPriority(existingReview?.priority ?? null);
  }, [existingReview, mcfUuid]);

  const handleStatus = (status: ReviewStatus) => {
    upsertReview.mutate({
      mcf_uuid: mcfUuid,
      status,
      priority,
      notes: notes || null,
      tags: existingReview?.tags || [],
      crm_company_id: existingReview?.crm_company_id || null,
      reviewed_by: currentUser,
      reviewed_at: new Date().toISOString(),
    });
  };

  const handleAddToCrm = async () => {
    if (!companyName) return;
    try {
      const company = await createCompany.mutateAsync({
        name: companyName,
        uen: companyUen || undefined,
        industry: industryTag
          ? INDUSTRY_TAG_OPTIONS[industryTag] || industryTag
          : undefined,
        stage: "prospect",
      } as any);

      upsertReview.mutate({
        mcf_uuid: mcfUuid,
        status: "prospected",
        priority,
        notes: notes || null,
        tags: existingReview?.tags || [],
        crm_company_id: company.id,
        reviewed_by: currentUser,
        reviewed_at: new Date().toISOString(),
      });
    } catch {
      // Error handled by mutation
    }
  };

  const currentStatus = existingReview?.status || "new";

  return (
    <div className="space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-4">
      <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
        Review
      </h3>

      {/* Current status */}
      {existingReview && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Current:</span>
          <ReviewStatusBadge status={currentStatus as ReviewStatus} />
          {existingReview.crm_company_id && (
            <span className="text-[11px] text-teal-600 dark:text-teal-400 font-medium">
              Linked to CRM
            </span>
          )}
        </div>
      )}

      {/* Status buttons */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_BUTTONS.map(({ status, icon: Icon, label }) => (
          <button
            key={status}
            onClick={() => handleStatus(status)}
            disabled={upsertReview.isPending}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
              currentStatus === status
                ? `bg-${REVIEW_STATUS_CONFIG[status].color}-100 dark:bg-${REVIEW_STATUS_CONFIG[status].color}-900/40 text-${REVIEW_STATUS_CONFIG[status].color}-700 dark:text-${REVIEW_STATUS_CONFIG[status].color}-300 ring-1 ring-${REVIEW_STATUS_CONFIG[status].color}-300`
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            }`}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {/* Priority */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">Priority:</span>
        {[1, 2, 3].map((p) => (
          <button
            key={p}
            onClick={() => setPriority(priority === p ? null : p)}
            className={`w-6 h-6 text-xs font-bold rounded ${
              priority === p
                ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Notes */}
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => {
          if (existingReview && notes !== (existingReview.notes || "")) {
            handleStatus(existingReview.status);
          }
        }}
        placeholder="Notes..."
        rows={3}
        className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-500 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 resize-none"
      />

      {/* Add to CRM button */}
      {!existingReview?.crm_company_id && companyName && (
        <button
          onClick={handleAddToCrm}
          disabled={createCompany.isPending}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-lg transition-colors"
        >
          {createCompany.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <UserPlus size={14} />
          )}
          Add {companyName} to CRM
        </button>
      )}
    </div>
  );
}

// ─── Save Filter Modal ─────────────────────────────────

function SaveFilterModal({
  filters,
  currentUser,
  onClose,
}: {
  filters: JobFilters;
  currentUser: string;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const createFilter = useCreateSavedFilter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await createFilter.mutateAsync({
      name: name.trim(),
      filters,
      created_by: currentUser,
    });
    onClose();
  };

  return (
    <FormModal
      title="Save Filter"
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Save"
      isSaving={createFilter.isPending}
    >
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
          Filter name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. AP roles in F&B"
          autoFocus
          className={inputClass}
        />
      </div>
      <div className="text-xs text-zinc-500">
        Active filters:{" "}
        {Object.entries(filters)
          .filter(([, v]) => v !== undefined)
          .map(([k]) => k)
          .join(", ") || "none"}
      </div>
    </FormModal>
  );
}

// ─── Shared Components ─────────────────────────────────

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
    purple: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400",
    amber: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
    teal: "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400",
    zinc: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400",
    red: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
  };

  return (
    <span
      className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
        colorMap[color] || colorMap.zinc
      }`}
    >
      {children}
    </span>
  );
}

function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  const config = REVIEW_STATUS_CONFIG[status];
  const colorMap: Record<string, string> = {
    blue: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
    amber: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
    purple: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400",
    teal: "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400",
    zinc: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400",
  };

  return (
    <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${colorMap[config.color] || colorMap.zinc}`}>
      {config.label}
    </span>
  );
}

function EmbeddingCoverageLabel() {
  const { data } = useEmbeddingCoverage();
  if (!data) return null;
  const pct = data.total > 0 ? Math.round((data.embedded / data.total) * 100) : 0;
  return (
    <span className="text-[10px] text-violet-500 dark:text-violet-400 flex-shrink-0" title={`${data.embedded.toLocaleString()} / ${data.total.toLocaleString()} jobs embedded`}>
      {pct}% indexed
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900">
      <div className="text-[11px] text-zinc-400 dark:text-zinc-500">{label}</div>
      <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mt-0.5 truncate">
        {value}
      </div>
    </div>
  );
}

function formatSalary(
  min: number | null,
  max: number | null,
  type: string | null
): string | null {
  if (!min && !max) return null;
  const fmt = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : n.toString();
  const suffix = type === "Monthly" ? "/mo" : type === "Annual" ? "/yr" : "";

  if (min && max && min !== max) return `$${fmt(min)}–${fmt(max)}${suffix}`;
  if (min) return `$${fmt(min)}+${suffix}`;
  if (max) return `Up to $${fmt(max)}${suffix}`;
  return null;
}
