// src/modules/product/DomainTabView.tsx
// Domains tab — sidebar + batch dashboard + detail panel (bot-style layout)

import { useState, useCallback, useRef, useEffect } from "react";
import {
  useDiscoverDomains,
  useSyncAllDomains,
  useSyncAllDomainsMonitoring,
  useSyncAllDomainsSod,
  useSyncAllDomainsImporterErrors,
  useSyncAllDomainsIntegrationErrors,
  useSyncAllDomainsAiToS3,
  useRunAllDomainsDataModelHealth,
  useRunAllDomainsWorkflowHealth,
  useRunAllDomainsQueryHealth,
  useRunAllDomainsArtifactAudit,
  useRunAllDomainsOverview,
  type DiscoveredDomain,
} from "../../hooks/val-sync";
import { useRepository } from "../../stores/repositoryStore";
import { useJobsStore } from "../../stores/jobsStore";
import {
  Search,
  Loader2,
  Database,
  AlertCircle,
  RefreshCw,
  Square,
  ChevronDown,
  ChevronRight,
  Zap,
  BarChart3,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "../../lib/cn";
import { DomainDetailPanel } from "./DomainDetailPanel";

// ============================
// Props
// ============================

interface DomainTabViewProps {
  initialDomain?: string | null;
  onReviewDataModels: (domain: string) => void;
  onReviewQueries: (domain: string) => void;
  onReviewWorkflows: (domain: string) => void;
  onReviewDashboards: (domain: string) => void;
}

// ============================
// Constants
// ============================

const TYPE_ORDER = ["production", "not-active", "demo", "template"] as const;
const TYPE_LABELS: Record<string, string> = {
  production: "Production",
  "not-active": "Not Active",
  demo: "Demo",
  template: "Templates",
};

// Sections collapsed by default
const DEFAULT_COLLAPSED = new Set(["not-active"]);

// ============================
// Helpers
// ============================

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return "Never";
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function groupByType(domains: DiscoveredDomain[]): Map<string, DiscoveredDomain[]> {
  const groups = new Map<string, DiscoveredDomain[]>();
  for (const type of TYPE_ORDER) {
    const items = domains.filter((d) => d.domain_type === type);
    if (items.length > 0) groups.set(type, items);
  }
  const known = new Set<string>(TYPE_ORDER as unknown as string[]);
  const other = domains.filter((d) => !known.has(d.domain_type));
  if (other.length > 0) groups.set("other", other);
  return groups;
}

// ============================
// DropdownMenu (from DomainListView)
// ============================

function DropdownMenu({
  label,
  items,
  disabled,
  color = "zinc",
  tooltip,
}: {
  label: string;
  items: { label: string; onClick: () => void; isRunning?: boolean; tooltip?: string }[];
  disabled: boolean;
  color?: "zinc" | "teal" | "violet";
  tooltip?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const colorClasses = {
    zinc: "text-zinc-600 hover:text-zinc-500 border-zinc-300 dark:border-zinc-700",
    teal: "text-teal-600 hover:text-teal-500 border-teal-300 dark:border-teal-800",
    violet: "text-violet-600 hover:text-violet-500 border-violet-300 dark:border-violet-800",
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={disabled}
        title={tooltip}
        className={cn(
          "flex items-center gap-1 px-2.5 py-1 text-xs font-medium border rounded transition-colors disabled:opacity-50",
          colorClasses[color]
        )}
      >
        {label}
        <ChevronDown size={10} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-20 min-w-[220px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md shadow-lg py-1">
          {items.map((item, i) => (
            <button
              key={i}
              onClick={() => { item.onClick(); setOpen(false); }}
              disabled={disabled}
              title={item.tooltip}
              className="w-full text-left px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 flex items-center gap-2"
            >
              {item.isRunning && <Loader2 size={10} className="animate-spin" />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================
// Main component
// ============================

export function DomainTabView({ initialDomain, onReviewDataModels, onReviewQueries, onReviewWorkflows, onReviewDashboards }: DomainTabViewProps) {
  const [selectedDomain, setSelectedDomain] = useState<string | null>(initialDomain ?? null);
  const [search, setSearch] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set(DEFAULT_COLLAPSED));

  const { activeRepository } = useRepository();
  const domainsPath = activeRepository ? `${activeRepository.path}/0_Platform/domains` : null;
  const { data: domains, isLoading, isError, error, refetch } = useDiscoverDomains(domainsPath);

  // ── Batch operation hooks ──
  const addJob = useJobsStore((s) => s.addJob);
  const updateJob = useJobsStore((s) => s.updateJob);

  const { trigger: syncAll, abort: abortSync, progress: syncProgress } = useSyncAllDomains();
  const { trigger: syncMonitoring, progress: monitoringProgress } = useSyncAllDomainsMonitoring();
  const { trigger: syncSod, progress: sodProgress } = useSyncAllDomainsSod();
  const { trigger: syncImporterErrors, progress: importerProgress } = useSyncAllDomainsImporterErrors();
  const { trigger: syncIntegrationErrors, progress: integrationProgress } = useSyncAllDomainsIntegrationErrors();
  const { trigger: syncAiToS3, progress: s3Progress } = useSyncAllDomainsAiToS3();
  const { trigger: runDataModelHealth, progress: dataModelHealthProgress } = useRunAllDomainsDataModelHealth();
  const { trigger: runWorkflowHealth, progress: workflowHealthProgress } = useRunAllDomainsWorkflowHealth();
  const { trigger: runQueryHealth, progress: queryHealthProgress } = useRunAllDomainsQueryHealth();
  const { trigger: runArtifactAudit, progress: artifactAuditProgress } = useRunAllDomainsArtifactAudit();
  const { trigger: runOverview, progress: overviewProgress } = useRunAllDomainsOverview();

  const [fullAnalysisRunning, setFullAnalysisRunning] = useState(false);

  // Running states
  const isSyncing = syncProgress?.isRunning ?? false;
  const isMonitoringSyncing = monitoringProgress?.isRunning ?? false;
  const isSodSyncing = sodProgress?.isRunning ?? false;
  const isImporterSyncing = importerProgress?.isRunning ?? false;
  const isIntegrationSyncing = integrationProgress?.isRunning ?? false;
  const isS3Syncing = s3Progress?.isRunning ?? false;
  const isDataModelHealthRunning = dataModelHealthProgress?.isRunning ?? false;
  const isWorkflowHealthRunning = workflowHealthProgress?.isRunning ?? false;
  const isQueryHealthRunning = queryHealthProgress?.isRunning ?? false;
  const isArtifactAuditRunning = artifactAuditProgress?.isRunning ?? false;
  const isOverviewRunning = overviewProgress?.isRunning ?? false;
  const [isGa4Syncing, setIsGa4Syncing] = useState(false);

  const handleSyncGa4 = useCallback(async () => {
    if (isGa4Syncing) return;
    setIsGa4Syncing(true);
    const jobId = `ga4-sync-${Date.now()}`;
    addJob({ id: jobId, name: "Sync GA4 Analytics", status: "running", progress: 50, message: "Fetching from GA4..." });
    try {
      const [supabaseUrl, supabaseKey] = await invoke<[string | null, string | null]>("settings_get_supabase_credentials");
      if (!supabaseUrl || !supabaseKey) throw new Error("Supabase credentials not configured");
      const result = await invoke<{ source: string; rows_upserted: number; warnings: string[] }>(
        "ga4_fetch_analytics",
        { supabaseUrl, supabaseKey }
      );
      const warningText = result.warnings.length > 0 ? ` | Warnings: ${result.warnings.join("; ")}` : "";
      updateJob(jobId, { status: result.warnings.length > 0 ? "completed" : "completed", progress: 100, message: `Synced ${result.rows_upserted} page views${warningText}` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      updateJob(jobId, { status: "failed", progress: 100, message: msg });
    } finally {
      setIsGa4Syncing(false);
    }
  }, [isGa4Syncing, addJob, updateJob]);

  const anyRunning =
    isSyncing || isMonitoringSyncing || isSodSyncing || isImporterSyncing ||
    isIntegrationSyncing || isS3Syncing || isDataModelHealthRunning || isWorkflowHealthRunning ||
    isQueryHealthRunning || isArtifactAuditRunning ||
    isOverviewRunning || fullAnalysisRunning || isGa4Syncing;

  const getCurrentOperation = () => {
    if (isSyncing) return syncProgress?.currentDomain ? `Syncing ${syncProgress.currentDomain}` : "Syncing...";
    if (isMonitoringSyncing) return "Syncing monitoring...";
    if (isSodSyncing) return "Syncing SOD...";
    if (isImporterSyncing) return "Syncing importer errors...";
    if (isIntegrationSyncing) return "Syncing integration errors...";
    if (isS3Syncing) return s3Progress?.currentDomain ? `Syncing ${s3Progress.currentDomain} AI to S3` : "Syncing AI to S3...";
    if (isDataModelHealthRunning) return "Running data model health...";
    if (isWorkflowHealthRunning) return "Running workflow health...";
    if (isQueryHealthRunning) return "Running query health...";
    if (isArtifactAuditRunning) return "Running artifact audit...";
    if (isOverviewRunning) return "Generating overview...";
    return null;
  };

  // Get the active progress percentage
  const getProgressPct = (): number => {
    const p =
      syncProgress ?? monitoringProgress ?? sodProgress ?? importerProgress ??
      integrationProgress ?? dataModelHealthProgress ?? workflowHealthProgress ??
      queryHealthProgress ?? artifactAuditProgress ?? overviewProgress;
    if (!p || !p.isRunning || p.total === 0) return 0;
    return Math.round((p.current / p.total) * 100);
  };

  const all = domains ?? [];
  const domainNames = all.map((d) => d.domain);

  // Stats
  const productionCount = all.filter((d) => d.domain_type === "production").length;
  const notActiveCount = all.filter((d) => d.domain_type === "not-active").length;
  const demoCount = all.filter((d) => d.domain_type === "demo").length;
  const templateCount = all.filter((d) => d.domain_type === "template").length;

  // Full Analysis pipeline
  const handleFullAnalysis = useCallback(async () => {
    if (anyRunning || domainNames.length === 0) return;
    setFullAnalysisRunning(true);
    const jobId = `full-analysis-${Date.now()}`;
    const steps = [
      { name: "Sync All", fn: () => syncAll(domainNames) },
      { name: "Query Health", fn: () => runQueryHealth(domainNames) },
      { name: "Artifact Audit", fn: () => runArtifactAudit(domainNames) },
      { name: "Generate Overview", fn: () => runOverview(domainNames) },
    ];

    addJob({
      id: jobId,
      name: `Full Analysis (${domainNames.length} domains)`,
      status: "running",
      progress: 0,
      message: "Starting full analysis pipeline...",
    });

    try {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const pct = Math.round((i / steps.length) * 100);
        updateJob(jobId, { progress: pct, message: `[${i + 1}/${steps.length}] ${step.name}...` });

        await new Promise<void>((resolve) => {
          step.fn();
          let elapsed = 0;
          const check = setInterval(() => {
            elapsed += 500;
            const stillRunning =
              (step.name === "Sync All" && syncProgress?.isRunning) ||
              (step.name === "Query Health" && queryHealthProgress?.isRunning) ||
              (step.name === "Artifact Audit" && artifactAuditProgress?.isRunning) ||
              (step.name === "Generate Overview" && overviewProgress?.isRunning);
            if (!stillRunning || elapsed > 5 * 60 * 1000) { clearInterval(check); resolve(); }
          }, 500);
        });

        await new Promise((r) => setTimeout(r, 300));
      }
      updateJob(jobId, { status: "completed", progress: 100, message: `Full analysis complete for ${domainNames.length} domains` });
    } catch (err) {
      updateJob(jobId, { status: "failed", message: `Full analysis failed: ${err}` });
    } finally {
      setFullAnalysisRunning(false);
    }
  }, [domainNames, anyRunning, syncAll, runQueryHealth, runArtifactAudit, runOverview, addJob, updateJob, syncProgress?.isRunning, queryHealthProgress?.isRunning, artifactAuditProgress?.isRunning, overviewProgress?.isRunning]);

  // Abort any running batch operation
  const handleStop = useCallback(() => {
    abortSync();
  }, [abortSync]);

  // Filter domains
  const filtered = all.filter((d) =>
    search ? d.domain.toLowerCase().includes(search.toLowerCase()) : true
  );
  const grouped = groupByType(filtered);
  const currentOp = getCurrentOperation();

  // Find the selected discoveredDomain object
  const selectedDiscoveredDomain = all.find((d) => d.domain === selectedDomain) ?? null;

  // Dropdown menu items
  const syncItems = [
    { label: "Sync All (Schema)", onClick: () => syncAll(domainNames), isRunning: isSyncing, tooltip: "Fetch all schema data from VAL API" },
    { label: "Workflow Executions", onClick: () => syncMonitoring(domainNames), isRunning: isMonitoringSyncing, tooltip: "Fetch recent workflow execution history" },
    { label: "SOD Tables", onClick: () => syncSod(domainNames), isRunning: isSodSyncing, tooltip: "Fetch Start-of-Day table sync status" },
    { label: "Importer Errors", onClick: () => syncImporterErrors(domainNames), isRunning: isImporterSyncing, tooltip: "Fetch recent importer errors" },
    { label: "Integration Errors", onClick: () => syncIntegrationErrors(domainNames), isRunning: isIntegrationSyncing, tooltip: "Fetch recent integration errors" },
    { label: "Push AI to S3", onClick: () => syncAiToS3(all.map(d => ({ domain: d.domain, global_path: d.global_path }))), isRunning: isS3Syncing, tooltip: "Sync all domain AI folders to S3" },
  ];

  const healthItems = [
    { label: "Data Model Health", onClick: () => runDataModelHealth(domainNames), isRunning: isDataModelHealthRunning, tooltip: "Check table freshness" },
    { label: "Workflow Health", onClick: () => runWorkflowHealth(domainNames), isRunning: isWorkflowHealthRunning, tooltip: "Analyze workflow execution success rates" },
    { label: "Query Health", onClick: () => runQueryHealth(domainNames), isRunning: isQueryHealthRunning, tooltip: "Analyze query health based on dashboard usage" },
  ];

  const analysisItems = [
    { label: "Artifact Audit", onClick: () => runArtifactAudit(domainNames), isRunning: isArtifactAuditRunning, tooltip: "Compare local vs remote artifacts" },
    { label: "Generate Overview HTML", onClick: () => runOverview(domainNames), isRunning: isOverviewRunning, tooltip: "Generate static HTML overview pages" },
  ];

  // ── Loading / Error / Empty states ──
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="text-zinc-400 animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 px-8">
        <AlertCircle size={32} className="mb-2 text-red-400 opacity-70" />
        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Failed to load domains</p>
        <p className="text-xs text-zinc-400 mt-1 text-center max-w-xs">
          {String(error).includes("unknown")
            ? "Restart the app to load the new val-sync commands (Rust rebuild required)"
            : String(error)}
        </p>
        <button
          onClick={() => refetch()}
          className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-600 hover:text-teal-500 border border-teal-600/30 rounded transition-colors"
        >
          <RefreshCw size={12} />
          Retry
        </button>
      </div>
    );
  }

  if (!domainsPath) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
        <Database size={32} className="mb-2 opacity-50" />
        <p className="text-sm">No repository selected</p>
        <p className="text-xs text-zinc-400 mt-1">Select a repository to discover domains</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* ── Sidebar (220px) ── */}
      <div className="w-[220px] flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex flex-col overflow-hidden">
        {/* Search */}
        <div className="p-2.5 pb-1.5">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search domains..."
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:border-teal-500"
            />
          </div>
        </div>

        {/* Domain list */}
        <div className="flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-xs text-zinc-400">
                {all.length === 0 ? "No domains found" : "No match"}
              </p>
            </div>
          ) : (
            Array.from(grouped.entries()).map(([type, items]) => {
              const isCollapsed = collapsedSections.has(type);
              return (
                <div key={type}>
                  {/* Collapsible group header */}
                  <button
                    onClick={() => setCollapsedSections((prev) => {
                      const next = new Set(prev);
                      if (next.has(type)) next.delete(type);
                      else next.add(type);
                      return next;
                    })}
                    className="w-full flex items-center gap-1 px-3 pt-3 pb-1 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <ChevronRight
                      size={10}
                      className={cn(
                        "text-zinc-400 transition-transform flex-shrink-0",
                        !isCollapsed && "rotate-90"
                      )}
                    />
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400">
                      {TYPE_LABELS[type] ?? type}
                    </span>
                    <span className="text-[9px] text-zinc-400/60 ml-auto">{items.length}</span>
                  </button>
                  {/* Items */}
                  {!isCollapsed && items.map((d) => (
                    <button
                      key={d.domain}
                      onClick={() => setSelectedDomain(d.domain)}
                      className={cn(
                        "w-full text-left px-2.5 py-1.5 mx-1 rounded-md text-xs transition-colors",
                        d.domain === selectedDomain
                          ? "bg-teal-500/10 text-teal-700 dark:text-teal-300"
                          : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
                      )}
                      style={{ width: "calc(100% - 8px)" }}
                    >
                      <span className="font-mono font-medium block truncate">{d.domain}</span>
                      {d.last_sync && (
                        <span className="text-[10px] text-zinc-400 block mt-0.5">
                          {formatRelativeTime(d.last_sync)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Content area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedDomain && selectedDiscoveredDomain ? (
          /* Selected state: render DomainDetailPanel full-width */
          <DomainDetailPanel
            id={selectedDomain}
            onClose={() => setSelectedDomain(null)}
            onReviewDataModels={() => onReviewDataModels(selectedDomain)}
            onReviewQueries={() => onReviewQueries(selectedDomain)}
            onReviewWorkflows={() => onReviewWorkflows(selectedDomain)}
            onReviewDashboards={() => onReviewDashboards(selectedDomain)}
            discoveredDomain={selectedDiscoveredDomain}
          />
        ) : (
          /* Empty state: batch dashboard */
          <div className="flex-1 flex flex-col overflow-auto">
            {/* Stats header */}
            <div className="px-6 pt-6 pb-2">
              <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {all.length} domains
                <span className="text-zinc-400 font-normal ml-2 text-xs">
                  {productionCount} production{notActiveCount > 0 ? ` · ${notActiveCount} inactive` : ""} · {demoCount} demo · {templateCount} template
                </span>
              </h2>
            </div>

            {/* Batch controls */}
            <div className="px-6 py-3 space-y-3">
              {/* Full Analysis button */}
              <button
                onClick={handleFullAnalysis}
                disabled={anyRunning}
                title="Run complete analysis pipeline: Sync All → Query Health → Artifact Audit → Generate Overview"
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-600 hover:bg-teal-500 rounded-lg transition-colors disabled:opacity-50"
              >
                {fullAnalysisRunning ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Zap size={14} />
                )}
                Full Analysis
              </button>

              {/* Dropdown menus row */}
              <div className="flex items-center gap-2">
                <DropdownMenu label="Sync" items={syncItems} disabled={anyRunning} color="teal" tooltip="Fetch data from VAL API" />
                <DropdownMenu label="Health" items={healthItems} disabled={anyRunning} color="violet" tooltip="Run health checks" />
                <DropdownMenu label="Analysis" items={analysisItems} disabled={anyRunning} tooltip="Audit and reporting" />

                <button
                  onClick={handleSyncGa4}
                  disabled={anyRunning}
                  title="Fetch dashboard page views from Google Analytics"
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors",
                    isGa4Syncing
                      ? "border-purple-400 text-purple-600 bg-purple-50 dark:bg-purple-900/20"
                      : "border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800",
                    anyRunning && !isGa4Syncing && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {isGa4Syncing ? <Loader2 size={12} className="animate-spin" /> : <BarChart3 size={12} />}
                  GA4
                </button>

                {anyRunning && (
                  <>
                    <div className="w-px h-5 bg-zinc-300 dark:bg-zinc-700 ml-1" />
                    <button
                      onClick={handleStop}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-red-600 hover:text-red-500 border border-red-300 dark:border-red-800 rounded transition-colors"
                    >
                      <Square size={10} />
                      Stop
                    </button>
                  </>
                )}
              </div>

              <p className="text-[10px] text-zinc-400">
                Full Analysis: Sync → Query Health → Audit → Overview
              </p>
            </div>

            {/* Progress bar */}
            {currentOp && (
              <div className="mx-6 mb-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <Loader2 size={12} className="text-zinc-400 animate-spin"  />
                  <span className="text-xs text-teal-700 dark:text-teal-400">{currentOp}</span>
                </div>
                <div className="h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-500 rounded-full transition-all duration-300"
                    style={{ width: `${getProgressPct()}%` }}
                  />
                </div>
              </div>
            )}

            {/* Completion summary */}
            {syncProgress && !syncProgress.isRunning && syncProgress.current > 0 && (
              <div className={cn(
                "mx-6 mb-3 px-3 py-2 rounded-lg text-xs",
                syncProgress.failed.length > 0
                  ? "bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50"
                  : "bg-green-50 dark:bg-green-900/10 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/50"
              )}>
                {syncProgress.completed.length}/{syncProgress.total} domains synced
                {syncProgress.failed.length > 0 && (
                  <> — failed: <span className="font-mono">{syncProgress.failed.join(", ")}</span></>
                )}
              </div>
            )}

            {/* Hint */}
            <div className="flex-1 flex items-center justify-center px-8">
              <p className="text-sm text-zinc-400 text-center">
                Select a domain from the sidebar to view details
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
