// src/modules/public-data/JobReviewsView.tsx
// Browse MCF job postings, filter, review, and add companies to CRM

import { useState, useRef, useEffect, useMemo } from "react";
import {
  Search,
  Loader2,
  ExternalLink,
  Building2,
  ChevronDown,
  X,
  Save,
  Trash2,
  Filter,
  Briefcase,
  Eye,
  SkipForward,
  UserPlus,
  Check,
  Sparkles,
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

// ─── Main View ─────────────────────────────────────────

export function JobReviewsView() {
  const user = useAuth((s) => s.user);
  const currentUser = user?.login || user?.name || "unknown";

  const [filters, setFilters] = useState<JobFilters>({});
  const [selectedMcfUuid, setSelectedMcfUuid] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [smartSearch, setSmartSearch] = useState(false);
  const [semanticQuery, setSemanticQuery] = useState("");

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
    <div className="flex h-full">
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
        />
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-zinc-400">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : filteredJobs.length === 0 ? (
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
            <>
              <div className="px-4 py-1.5 text-[11px] text-zinc-400 border-b border-zinc-100 dark:border-zinc-800">
                {filteredJobs.length}{smartSearch ? "" : "+"} results
                {smartSearch && isSemanticFetching && (
                  <Loader2 size={10} className="inline animate-spin ml-1" />
                )}
              </div>
              {filteredJobs.map((job) => (
                <JobRow
                  key={job.id}
                  job={job}
                  selected={job.mcf_uuid === selectedMcfUuid}
                  reviewed={reviewedIds?.has(job.mcf_uuid)}
                  similarity={"similarity" in job ? (job as SemanticSearchResult).similarity : undefined}
                  onClick={() =>
                    setSelectedMcfUuid(
                      job.mcf_uuid === selectedMcfUuid ? null : job.mcf_uuid
                    )
                  }
                />
              ))}
              {!smartSearch && (
                <div ref={sentinelRef} className="h-12 flex items-center justify-center">
                  {isFetchingNextPage && (
                    <Loader2 size={16} className="animate-spin text-zinc-400" />
                  )}
                </div>
              )}
            </>
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
}) {
  const { data: savedFilters = [] } = useSavedFilters();
  const deleteFilter = useDeleteSavedFilter();
  const [searchInput, setSearchInput] = useState(filters.search || "");
  const [smartInput, setSmartInput] = useState(semanticQuery);

  const handleSearchSubmit = () => {
    onChange({ ...filters, search: searchInput || undefined });
  };

  const handleSmartSearchSubmit = () => {
    onSemanticQueryChange(smartInput);
  };

  return (
    <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 space-y-2">
      {/* Row 1: Search + smart toggle + saved filters + save */}
      <div className="flex items-center gap-2">
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
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-violet-500 animate-spin"
            />
          ) : (
            <Search
              size={14}
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
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-500 text-zinc-900 dark:text-zinc-100 placeholder-violet-400"
            />
          ) : (
            <input
              type="text"
              placeholder="Search jobs or companies..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearchSubmit()}
              onBlur={handleSearchSubmit}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-500 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400"
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
      </div>

      {/* Row 2: Filter chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <MultiSelectChips
          label="Industry"
          options={INDUSTRY_TAG_OPTIONS}
          selected={filters.industry_tag || []}
          onChange={(v) => onChange({ ...filters, industry_tag: v.length ? v : undefined })}
        />
        <MultiSelectChips
          label="Role"
          options={ROLE_CATEGORY_OPTIONS}
          selected={filters.role_category || []}
          onChange={(v) => onChange({ ...filters, role_category: v.length ? v : undefined })}
        />

        <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-700 mx-1" />

        {/* Unreviewed toggle */}
        <button
          onClick={() =>
            onChange({ ...filters, unreviewed_only: !filters.unreviewed_only })
          }
          className={`px-2 py-0.5 text-[11px] font-medium rounded-full transition-colors ${
            filters.unreviewed_only
              ? "bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
          }`}
        >
          Unreviewed only
        </button>

        {/* Clear all */}
        {Object.keys(filters).length > 0 && (
          <button
            onClick={() => {
              onChange({});
              setSearchInput("");
            }}
            className="px-2 py-0.5 text-[11px] font-medium text-red-500 hover:text-red-600 rounded-full"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Multi-Select Chip Dropdown ────────────────────────

function MultiSelectChips({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Record<string, string>;
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const toggle = (key: string) => {
    onChange(
      selected.includes(key)
        ? selected.filter((s) => s !== key)
        : [...selected, key]
    );
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full transition-colors ${
          selected.length > 0
            ? "bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300"
            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
        }`}
      >
        {label}
        {selected.length > 0 && (
          <span className="bg-teal-600 text-white text-[9px] rounded-full px-1 min-w-[14px] text-center">
            {selected.length}
          </span>
        )}
        <ChevronDown size={10} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg z-20 max-h-64 overflow-y-auto">
          {Object.entries(options).map(([key, display]) => (
            <button
              key={key}
              onClick={() => toggle(key)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <div
                className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                  selected.includes(key)
                    ? "bg-teal-600 border-teal-600"
                    : "border-zinc-300 dark:border-zinc-600"
                }`}
              >
                {selected.includes(key) && <Check size={10} className="text-white" />}
              </div>
              <span className="text-zinc-700 dark:text-zinc-300">{display}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Job Row ───────────────────────────────────────────

function JobRow({
  job,
  selected,
  reviewed,
  similarity,
  onClick,
}: {
  job: McfJobPosting;
  selected: boolean;
  reviewed?: boolean;
  similarity?: number;
  onClick: () => void;
}) {
  const salaryText = formatSalary(job.salary_min, job.salary_max, job.salary_type);

  return (
    <div
      onClick={onClick}
      className={`px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 cursor-pointer transition-colors ${
        selected
          ? "bg-teal-50 dark:bg-teal-950/30"
          : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Review indicator */}
        <div className="flex-shrink-0 mt-1">
          {reviewed ? (
            <div className="w-2 h-2 rounded-full bg-teal-500" />
          ) : (
            <div className="w-2 h-2 rounded-full bg-zinc-200 dark:bg-zinc-700" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Title */}
          <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
            {job.title}
          </div>

          {/* Company */}
          <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
            {job.company_name || "Unknown company"}
            {job.company_employee_count && (
              <span className="ml-2 text-zinc-400">
                ({job.company_employee_count} employees)
              </span>
            )}
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-1 mt-1.5">
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
          </div>
        </div>

        {/* Salary + date + similarity */}
        <div className="flex-shrink-0 text-right">
          {similarity !== undefined && (
            <div className="text-[10px] font-medium text-violet-600 dark:text-violet-400 mb-0.5">
              {Math.round(similarity * 100)}% match
            </div>
          )}
          {salaryText && (
            <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {salaryText}
            </div>
          )}
          <div className="text-[11px] text-zinc-400 mt-0.5">
            {job.new_posting_date
              ? new Date(job.new_posting_date).toLocaleDateString("en-SG", {
                  day: "numeric",
                  month: "short",
                })
              : ""}
          </div>
        </div>
      </div>
    </div>
  );
}

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
