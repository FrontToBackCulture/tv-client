// src/modules/product/DomainListView.tsx
// Domain list with auto-discovery from file system, grouped by type

import { useState, useRef, useEffect, useCallback } from "react";
import { useDiscoverDomains, useSyncAllDomains, useSyncAllDomainsMonitoring, useSyncAllDomainsSod, useSyncAllDomainsImporterErrors, useSyncAllDomainsIntegrationErrors, useRunAllDomainsDataModelHealth, useRunAllDomainsWorkflowHealth, useRunAllDomainsDashboardHealth, useRunAllDomainsQueryHealth, useRunAllDomainsArtifactAudit, useRunAllDomainsOverview, type DiscoveredDomain } from "../../hooks/useValSync";
import { useRepository } from "../../stores/repositoryStore";
import { useJobsStore } from "../../stores/jobsStore";
import { Loader2, Database, FolderOpen, AlertCircle, RefreshCw, Square, ChevronDown, Zap } from "lucide-react";
import { cn } from "../../lib/cn";

interface DomainListViewProps {
  search: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const TYPE_ORDER = ["production", "demo", "template"] as const;
const TYPE_LABELS: Record<string, string> = {
  production: "Production",
  demo: "Demo",
  template: "Templates",
};

/** Format ISO timestamp as relative time (e.g., "2d ago", "3h ago") */
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

  // For older dates, show the date
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function groupByType(domains: DiscoveredDomain[]): Map<string, DiscoveredDomain[]> {
  const groups = new Map<string, DiscoveredDomain[]>();
  for (const type of TYPE_ORDER) {
    const items = domains.filter((d) => d.domain_type === type);
    if (items.length > 0) {
      groups.set(type, items);
    }
  }
  const known = new Set<string>(TYPE_ORDER);
  const other = domains.filter((d) => !known.has(d.domain_type));
  if (other.length > 0) {
    groups.set("other", other);
  }
  return groups;
}

// Dropdown menu component with tooltips
function DropdownMenu({
  label,
  items,
  disabled,
  color = "slate",
  tooltip
}: {
  label: string;
  items: { label: string; onClick: () => void; isRunning?: boolean; tooltip?: string }[];
  disabled: boolean;
  color?: "slate" | "teal" | "violet";
  tooltip?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const colorClasses = {
    slate: "text-slate-600 hover:text-slate-500 border-slate-300 dark:border-slate-700",
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
          "flex items-center gap-1 px-2.5 py-1 text-xs font-medium border rounded transition-colors disabled:opacity-40",
          colorClasses[color]
        )}
      >
        {label}
        <ChevronDown size={10} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-20 min-w-[220px] bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-md shadow-lg py-1">
          {items.map((item, i) => (
            <button
              key={i}
              onClick={() => {
                item.onClick();
                setOpen(false);
              }}
              disabled={disabled}
              title={item.tooltip}
              className="w-full text-left px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-40 flex items-center gap-2"
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

export function DomainListView({ search, selectedId, onSelect }: DomainListViewProps) {
  const { activeRepository } = useRepository();
  const addJob = useJobsStore((s) => s.addJob);
  const updateJob = useJobsStore((s) => s.updateJob);
  const domainsPath = activeRepository
    ? `${activeRepository.path}/0_Platform/domains`
    : null;

  const { data: domains, isLoading, isError, error, refetch } = useDiscoverDomains(domainsPath);
  const { trigger: syncAll, abort: abortSync, progress: syncProgress } = useSyncAllDomains();
  const { trigger: syncMonitoring, progress: monitoringProgress } = useSyncAllDomainsMonitoring();
  const { trigger: syncSod, progress: sodProgress } = useSyncAllDomainsSod();
  const { trigger: syncImporterErrors, progress: importerProgress } = useSyncAllDomainsImporterErrors();
  const { trigger: syncIntegrationErrors, progress: integrationProgress } = useSyncAllDomainsIntegrationErrors();
  const { trigger: runDataModelHealth, progress: dataModelHealthProgress } = useRunAllDomainsDataModelHealth();
  const { trigger: runWorkflowHealth, progress: workflowHealthProgress } = useRunAllDomainsWorkflowHealth();
  const { trigger: runDashboardHealth, progress: dashboardHealthProgress } = useRunAllDomainsDashboardHealth();
  const { trigger: runQueryHealth, progress: queryHealthProgress } = useRunAllDomainsQueryHealth();
  const { trigger: runArtifactAudit, progress: artifactAuditProgress } = useRunAllDomainsArtifactAudit();
  const { trigger: runOverview, progress: overviewProgress } = useRunAllDomainsOverview();

  const [fullAnalysisRunning, setFullAnalysisRunning] = useState(false);

  // Compute running states
  const isSyncing = syncProgress?.isRunning ?? false;
  const isMonitoringSyncing = monitoringProgress?.isRunning ?? false;
  const isSodSyncing = sodProgress?.isRunning ?? false;
  const isImporterSyncing = importerProgress?.isRunning ?? false;
  const isIntegrationSyncing = integrationProgress?.isRunning ?? false;
  const isDataModelHealthRunning = dataModelHealthProgress?.isRunning ?? false;
  const isWorkflowHealthRunning = workflowHealthProgress?.isRunning ?? false;
  const isDashboardHealthRunning = dashboardHealthProgress?.isRunning ?? false;
  const isQueryHealthRunning = queryHealthProgress?.isRunning ?? false;
  const isArtifactAuditRunning = artifactAuditProgress?.isRunning ?? false;
  const isOverviewRunning = overviewProgress?.isRunning ?? false;

  const anyRunning = isSyncing || isMonitoringSyncing || isSodSyncing || isImporterSyncing ||
    isIntegrationSyncing || isDataModelHealthRunning || isWorkflowHealthRunning ||
    isDashboardHealthRunning || isQueryHealthRunning || isArtifactAuditRunning ||
    isOverviewRunning || fullAnalysisRunning;

  // Get current running operation label
  const getCurrentOperation = () => {
    if (isSyncing) return syncProgress?.currentDomain ? `Syncing ${syncProgress.currentDomain}` : "Syncing...";
    if (isMonitoringSyncing) return "Syncing monitoring...";
    if (isSodSyncing) return "Syncing SOD...";
    if (isImporterSyncing) return "Syncing importer errors...";
    if (isIntegrationSyncing) return "Syncing integration errors...";
    if (isDataModelHealthRunning) return "Running data model health...";
    if (isWorkflowHealthRunning) return "Running workflow health...";
    if (isDashboardHealthRunning) return "Running dashboard health...";
    if (isQueryHealthRunning) return "Running query health...";
    if (isArtifactAuditRunning) return "Running artifact audit...";
    if (isOverviewRunning) return "Generating overview...";
    return null;
  };

  const all = domains ?? [];
  const domainNames = all.map((d) => d.domain);

  // Full Analysis: Run operations in correct sequence
  // Sequence: Sync All → Dashboard Health → Query Health → Audit → Overview
  const handleFullAnalysis = useCallback(async () => {
    if (anyRunning || domainNames.length === 0) return;

    setFullAnalysisRunning(true);
    const jobId = `full-analysis-${Date.now()}`;
    const steps = [
      { name: "Sync All", fn: () => syncAll(domainNames) },
      { name: "Dashboard Health", fn: () => runDashboardHealth(domainNames) },
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
        updateJob(jobId, {
          progress: pct,
          message: `[${i + 1}/${steps.length}] ${step.name}...`,
        });

        // Wait for step to complete
        await new Promise<void>((resolve) => {
          step.fn();
          // Poll for completion
          const check = setInterval(() => {
            const stillRunning =
              (step.name === "Sync All" && syncProgress?.isRunning) ||
              (step.name === "Dashboard Health" && dashboardHealthProgress?.isRunning) ||
              (step.name === "Query Health" && queryHealthProgress?.isRunning) ||
              (step.name === "Artifact Audit" && artifactAuditProgress?.isRunning) ||
              (step.name === "Generate Overview" && overviewProgress?.isRunning);

            if (!stillRunning) {
              clearInterval(check);
              resolve();
            }
          }, 500);
        });

        // Small delay between steps
        await new Promise((r) => setTimeout(r, 300));
      }

      updateJob(jobId, {
        status: "completed",
        progress: 100,
        message: `Full analysis complete for ${domainNames.length} domains`,
      });
    } catch (err) {
      updateJob(jobId, {
        status: "failed",
        message: `Full analysis failed: ${err}`,
      });
    } finally {
      setFullAnalysisRunning(false);
    }
  }, [domainNames, anyRunning, syncAll, runDashboardHealth, runQueryHealth, runArtifactAudit, runOverview, addJob, updateJob, syncProgress?.isRunning, dashboardHealthProgress?.isRunning, queryHealthProgress?.isRunning, artifactAuditProgress?.isRunning, overviewProgress?.isRunning]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="text-zinc-600 animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 px-8">
        <AlertCircle size={32} className="mb-2 text-red-400 opacity-70" />
        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
          Failed to load domains
        </p>
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

  const filtered = all.filter((d) =>
    search ? d.domain.toLowerCase().includes(search.toLowerCase()) : true
  );

  if (filtered.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
        <Database size={32} className="mb-2 opacity-50" />
        <p className="text-sm">
          {all.length === 0 ? "No domains found" : "No domains match search"}
        </p>
        {all.length === 0 && (
          <p className="text-xs text-zinc-400 mt-1 text-center max-w-xs">
            Expected domain folders at {domainsPath}
          </p>
        )}
      </div>
    );
  }

  const grouped = groupByType(filtered);
  const currentOp = getCurrentOperation();

  // Menu items with tooltips
  const syncItems = [
    {
      label: "Sync All (Schema)",
      onClick: () => syncAll(domainNames),
      isRunning: isSyncing,
      tooltip: "Fetch all schema data from VAL API: fields, queries, workflows, dashboards, tables, calc fields. Creates all_*.json files and extracts individual definitions."
    },
    {
      label: "Workflow Executions",
      onClick: () => syncMonitoring(domainNames),
      isRunning: isMonitoringSyncing,
      tooltip: "Fetch recent workflow execution history. Used by Workflow Health to analyze success rates and timing."
    },
    {
      label: "SOD Tables",
      onClick: () => syncSod(domainNames),
      isRunning: isSodSyncing,
      tooltip: "Fetch Start-of-Day table sync status. Shows which tables have been refreshed today."
    },
    {
      label: "Importer Errors",
      onClick: () => syncImporterErrors(domainNames),
      isRunning: isImporterSyncing,
      tooltip: "Fetch recent importer/connector errors. Helps identify data ingestion issues."
    },
    {
      label: "Integration Errors",
      onClick: () => syncIntegrationErrors(domainNames),
      isRunning: isIntegrationSyncing,
      tooltip: "Fetch recent integration errors. Helps identify API and system connection issues."
    },
  ];

  const healthItems = [
    {
      label: "Data Model Health",
      onClick: () => runDataModelHealth(domainNames),
      isRunning: isDataModelHealthRunning,
      tooltip: "Check table freshness using health-config.json. Requires /generate-health-config first to pick the right date columns."
    },
    {
      label: "Workflow Health",
      onClick: () => runWorkflowHealth(domainNames),
      isRunning: isWorkflowHealthRunning,
      tooltip: "Analyze workflow execution success rates and recency. Identifies failing or stale scheduled workflows."
    },
    {
      label: "Dashboard Health",
      onClick: () => runDashboardHealth(domainNames),
      isRunning: isDashboardHealthRunning,
      tooltip: "Analyze dashboard usage from session data. Scores dashboards as critical/active/declining/unused based on view frequency."
    },
    {
      label: "Query Health",
      onClick: () => runQueryHealth(domainNames),
      isRunning: isQueryHealthRunning,
      tooltip: "Analyze query health based on dashboard usage. Run Dashboard Health first - queries inherit health from dashboards that use them."
    },
  ];

  const analysisItems = [
    {
      label: "Artifact Audit",
      onClick: () => runArtifactAudit(domainNames),
      isRunning: isArtifactAuditRunning,
      tooltip: "Compare local extracted files against VAL API. Identifies stale artifacts that exist locally but were deleted in VAL."
    },
    {
      label: "Generate Overview HTML",
      onClick: () => runOverview(domainNames),
      isRunning: isOverviewRunning,
      tooltip: "Generate a static HTML overview page showing sync status, artifact counts, and recent history."
    },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="px-4 py-2 bg-slate-50 dark:bg-zinc-950 border-b border-slate-200 dark:border-zinc-800">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-zinc-500">{all.length} domains</span>
          {anyRunning && (
            <button
              onClick={abortSync}
              className="flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium text-red-600 hover:text-red-500 border border-red-300 dark:border-red-800 rounded transition-colors"
            >
              <Square size={10} />
              Stop
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Primary action: Full Analysis */}
          <button
            onClick={handleFullAnalysis}
            disabled={anyRunning}
            title="Run complete analysis pipeline: Sync All → Dashboard Health → Query Health → Artifact Audit → Generate Overview. Best for initial setup or full refresh."
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-600 hover:bg-teal-500 rounded transition-colors disabled:opacity-40"
          >
            {fullAnalysisRunning ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Zap size={12} />
            )}
            Full Analysis
          </button>

          <div className="w-px h-5 bg-slate-300 dark:bg-zinc-700" />

          {/* Dropdown menus */}
          <DropdownMenu
            label="Sync"
            items={syncItems}
            disabled={anyRunning}
            color="teal"
            tooltip="Fetch data from VAL API"
          />
          <DropdownMenu
            label="Health"
            items={healthItems}
            disabled={anyRunning}
            color="violet"
            tooltip="Run health checks on synced data"
          />
          <DropdownMenu
            label="Analysis"
            items={analysisItems}
            disabled={anyRunning}
            tooltip="Audit and reporting tools"
          />
        </div>

        {/* Tooltip showing sequence */}
        <p className="text-[10px] text-zinc-400 mt-1.5">
          Full Analysis: Sync → Dashboard Health → Query Health → Audit → Overview
        </p>
      </div>

      {/* Progress bar for any running operation */}
      {currentOp && (
        <div className="px-4 py-1.5 bg-teal-50 dark:bg-teal-900/10 border-b border-teal-200 dark:border-teal-800/50">
          <div className="flex items-center gap-2">
            <Loader2 size={12} className="text-teal-600 animate-spin" />
            <span className="text-xs text-teal-700 dark:text-teal-400">{currentOp}</span>
          </div>
        </div>
      )}

      {/* Sync complete summary */}
      {syncProgress && !syncProgress.isRunning && syncProgress.current > 0 && (
        <div className={cn(
          "px-4 py-1.5 border-b text-xs",
          syncProgress.failed.length > 0
            ? "bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-400"
            : "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800/50 text-green-700 dark:text-green-400"
        )}>
          {syncProgress.completed.length}/{syncProgress.total} domains synced
          {syncProgress.failed.length > 0 && (
            <> — failed: <span className="font-mono">{syncProgress.failed.join(", ")}</span></>
          )}
        </div>
      )}

      {/* Table header */}
      <div className="flex items-center px-4 py-2 bg-slate-100 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 text-xs font-medium text-zinc-500 uppercase tracking-wider">
        <span className="flex-1">Domain</span>
        <span className="w-32 text-center">Last Synced</span>
        <span className="w-24 text-center">Artifacts</span>
      </div>

      {/* Grouped rows */}
      <div className="flex-1 overflow-auto">
        {Array.from(grouped.entries()).map(([type, items]) => (
          <div key={type}>
            {/* Section header */}
            <div className="sticky top-0 z-10 px-4 py-1.5 bg-slate-50 dark:bg-zinc-950 border-b border-slate-200 dark:border-zinc-800">
              <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                {TYPE_LABELS[type] ?? type} ({items.length})
              </span>
            </div>

            {/* Domain rows */}
            {items.map((domain) => (
              <button
                key={domain.domain}
                onClick={() => onSelect(domain.domain)}
                className={cn(
                  "w-full flex items-center px-4 py-2.5 text-left border-b border-slate-100 dark:border-zinc-800/50 transition-colors",
                  domain.domain === selectedId
                    ? "bg-teal-500/5 dark:bg-teal-500/10"
                    : "hover:bg-slate-50 dark:hover:bg-zinc-900/50"
                )}
              >
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 font-mono block truncate">
                    {domain.domain}
                  </span>
                  <span className="text-xs text-zinc-400 flex items-center gap-1 mt-0.5 truncate">
                    <FolderOpen size={10} />
                    {domain.global_path.split("/").slice(-2).join("/")}
                  </span>
                </div>
                <span className="w-32 text-center text-xs">
                  {domain.last_sync ? (
                    <span className="text-zinc-600 dark:text-zinc-400" title={new Date(domain.last_sync).toLocaleString()}>
                      {formatRelativeTime(domain.last_sync)}
                    </span>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </span>
                <span className="w-24 text-center">
                  {domain.artifact_count ? (
                    <span className="text-xs text-zinc-600 dark:text-zinc-400 font-mono">
                      {domain.artifact_count.toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
