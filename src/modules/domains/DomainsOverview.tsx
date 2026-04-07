// src/modules/domains/DomainsOverview.tsx
// Level 1: All-domains overview — domain cards with status + batch operations

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  useDiscoverDomains,
  useSyncAllDomains,
  useSyncAllDomainsMonitoring,
  useSyncAllDomainsSod,
  useSyncAllDomainsImporterErrors,
  useSyncAllDomainsIntegrationErrors,
  useSyncAllDomainsAiToS3,
  useComputeAllDependencies,
  type DiscoveredDomain,
} from "../../hooks/val-sync";
import { useDomainHealthCheckRunner } from "../../hooks/val-sync/useDomainHealthChecks";
import { usePrimaryKnowledgePaths } from "../../hooks/useKnowledgePaths";
import { useJobsStore } from "../../stores/jobsStore";
import { formatError } from "../../lib/formatError";
import { useDomainArtifactsRebuild } from "../../hooks/useDomainArtifactsRebuild";
import {
  Search,
  Loader2,
  Database,
  AlertCircle,
  RefreshCw,
  Square,
  ChevronDown,
  Zap,
  BarChart3,
  ChevronRight,
  FolderOpen,
  Check,
  HeartPulse,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "../../lib/cn";
import { toast } from "../../stores/toastStore";
import { Button } from "../../components/ui";
import { useRegisterCommands } from "../../stores/commandStore";
import { DetailLoading } from "../../components/ui/DetailStates";

interface DomainsOverviewProps {
  onSelectDomain: (domain: string) => void;
}

import { useDomainTypeConfig } from "./useDomainTypeConfig";

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

function groupByType(domains: DiscoveredDomain[], typeOrder: string[]): Map<string, DiscoveredDomain[]> {
  const groups = new Map<string, DiscoveredDomain[]>();
  for (const type of typeOrder) {
    const items = domains.filter((d) => d.domain_type === type);
    if (items.length > 0) groups.set(type, items);
  }
  const known = new Set<string>(typeOrder);
  const other = domains.filter((d) => !known.has(d.domain_type));
  if (other.length > 0) groups.set("other", other);
  return groups;
}

// ============================
// DropdownMenu
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
    zinc: "text-zinc-600 hover:text-zinc-500 border-zinc-200 dark:border-zinc-800",
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
        <div className="absolute top-full left-0 mt-1 z-20 min-w-[220px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-lg py-1">
          {items.map((item, i) => (
            <button
              key={i}
              onClick={() => { item.onClick(); setOpen(false); }}
              disabled={disabled}
              title={item.tooltip}
              className="w-full text-left px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 disabled:opacity-50 flex items-center gap-2"
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
// Domain Card
// ============================

function DomainCard({
  domain,
  onClick,
  dotColors,
  labels,
}: {
  domain: DiscoveredDomain;
  onClick: () => void;
  dotColors: Record<string, string>;
  labels: Record<string, string>;
}) {
  const dotColor = dotColors[domain.domain_type] ?? "bg-zinc-400";
  const [copied, setCopied] = useState(false);

  const handleCopyReportsPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    const reportsPath = `${domain.global_path}/reports`;
    navigator.clipboard.writeText(reportsPath);
    setCopied(true);
    toast.success(`Copied ${domain.domain} reports path`);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "text-left p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 cursor-pointer",
        "bg-white dark:bg-zinc-900",
        "hover:border-teal-300 dark:hover:border-teal-700 hover:shadow-sm",
        "transition-all group"
      )}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <div className={cn("w-2 h-2 rounded-full", dotColor)} />
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            {domain.domain}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopyReportsPath}
            title="Copy reports folder path"
            className={cn(
              "p-1 rounded transition-colors",
              copied
                ? "text-green-500"
                : "text-zinc-300 dark:text-zinc-600 hover:text-teal-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
            )}
          >
            {copied ? <Check size={13} /> : <FolderOpen size={13} />}
          </button>
          <ChevronRight
            size={14}
            className="text-zinc-300 dark:text-zinc-600 group-hover:text-teal-500 transition-colors"
          />
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs text-zinc-400">
        <span>{labels[domain.domain_type] ?? domain.domain_type}</span>
        {domain.last_sync && (
          <>
            <span>·</span>
            <span>Synced {formatRelativeTime(domain.last_sync)}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ============================
// Main component
// ============================

export function DomainsOverview({ onSelectDomain }: DomainsOverviewProps) {
  const [search, setSearch] = useState("");
  const typeConfig = useDomainTypeConfig();

  const paths = usePrimaryKnowledgePaths();
  const domainsPath = paths ? `${paths.platform}/domains` : null;
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
  const { trigger: computeDeps, progress: depsProgress } = useComputeAllDependencies();
  const { progress: rebuildProgress, rebuild: rebuildIndex } = useDomainArtifactsRebuild();
  const { trigger: runHealthChecks, progress: healthProgress } = useDomainHealthCheckRunner();

  const [fullAnalysisRunning, setFullAnalysisRunning] = useState(false);

  // Running states
  const isSyncing = syncProgress?.isRunning ?? false;
  const isMonitoringSyncing = monitoringProgress?.isRunning ?? false;
  const isSodSyncing = sodProgress?.isRunning ?? false;
  const isImporterSyncing = importerProgress?.isRunning ?? false;
  const isIntegrationSyncing = integrationProgress?.isRunning ?? false;
  const isS3Syncing = s3Progress?.isRunning ?? false;
  const isRebuildRunning = rebuildProgress.running;
  const isHealthChecking = healthProgress?.isRunning ?? false;
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
      updateJob(jobId, { status: "completed", progress: 100, message: `Synced ${result.rows_upserted} page views${warningText}` });
    } catch (e: unknown) {
      updateJob(jobId, { status: "failed", progress: 100, message: formatError(e) });
    } finally {
      setIsGa4Syncing(false);
    }
  }, [isGa4Syncing, addJob, updateJob]);

  const anyRunning =
    isSyncing || isMonitoringSyncing || isSodSyncing || isImporterSyncing ||
    isIntegrationSyncing || isS3Syncing ||
    fullAnalysisRunning || isGa4Syncing || isRebuildRunning || isHealthChecking;

  const getCurrentOperation = () => {
    if (isSyncing) return syncProgress?.currentDomain ? `Syncing ${syncProgress.currentDomain}` : "Syncing...";
    if (isMonitoringSyncing) return "Syncing monitoring...";
    if (isSodSyncing) return "Syncing SOD...";
    if (isImporterSyncing) return "Syncing importer errors...";
    if (isIntegrationSyncing) return "Syncing integration errors...";
    if (isS3Syncing) return s3Progress?.currentDomain ? `Syncing ${s3Progress.currentDomain} AI to S3` : "Syncing AI to S3...";
    if (isRebuildRunning) return rebuildProgress.domain ? `Rebuilding index: ${rebuildProgress.domain} (${rebuildProgress.resourceType})` : "Rebuilding index...";
    return null;
  };

  const getProgressPct = (): number => {
    if (isRebuildRunning && rebuildProgress.domainsTotal > 0) {
      return Math.round((rebuildProgress.domainsCompleted / rebuildProgress.domainsTotal) * 100);
    }
    const p =
      syncProgress ?? monitoringProgress ?? sodProgress ?? importerProgress ??
      integrationProgress;
    if (!p || !p.isRunning || p.total === 0) return 0;
    return Math.round((p.current / p.total) * 100);
  };

  const all = domains ?? [];
  const domainNames = all.map((d) => d.domain);

  const productionCount = all.filter((d) => d.domain_type === "production").length;
  const notActiveCount = all.filter((d) => d.domain_type === "not-active").length;
  const demoCount = all.filter((d) => d.domain_type === "demo").length;
  const templateCount = all.filter((d) => d.domain_type === "template").length;

  // Full Analysis pipeline
  const handleFullAnalysis = useCallback(async () => {
    if (anyRunning || domainNames.length === 0) return;
    setFullAnalysisRunning(true);
    const jobId = `full-analysis-${Date.now()}`;
    addJob({
      id: jobId,
      name: `Full Sync (${domainNames.length} domains)`,
      status: "running",
      progress: 0,
      message: "Starting full sync pipeline...",
    });

    try {
      syncAll(domainNames);
      await new Promise<void>((resolve) => {
        let elapsed = 0;
        const check = setInterval(() => {
          elapsed += 500;
          if (!syncProgress?.isRunning || elapsed > 10 * 60 * 1000) { clearInterval(check); resolve(); }
        }, 500);
      });
      updateJob(jobId, { status: "completed", progress: 100, message: `Full sync complete for ${domainNames.length} domains` });
    } catch (err) {
      updateJob(jobId, { status: "failed", message: `Full sync failed: ${err}` });
    } finally {
      setFullAnalysisRunning(false);
    }
  }, [domainNames, anyRunning, syncAll, addJob, updateJob, syncProgress?.isRunning]);

  const handleStop = useCallback(() => {
    abortSync();
  }, [abortSync]);

  // Filter
  const filtered = all.filter((d) =>
    search ? d.domain.toLowerCase().includes(search.toLowerCase()) : true
  );
  const grouped = groupByType(filtered, typeConfig.order);
  const currentOp = getCurrentOperation();

  // Dropdown menu items
  const syncItems = [
    { label: "Sync All (Schema)", onClick: () => syncAll(domainNames), isRunning: isSyncing, tooltip: "Fetch all schema data from VAL API" },
    { label: "Workflow Executions", onClick: () => syncMonitoring(domainNames), isRunning: isMonitoringSyncing, tooltip: "Fetch recent workflow execution history" },
    { label: "SOD Tables", onClick: () => syncSod(domainNames), isRunning: isSodSyncing, tooltip: "Fetch Start-of-Day table sync status" },
    { label: "Importer Errors", onClick: () => syncImporterErrors(domainNames), isRunning: isImporterSyncing, tooltip: "Fetch recent importer errors" },
    { label: "Integration Errors", onClick: () => syncIntegrationErrors(domainNames), isRunning: isIntegrationSyncing, tooltip: "Fetch recent integration errors" },
    { label: "Push AI to S3", onClick: () => syncAiToS3(all.map(d => ({ domain: d.domain, global_path: d.global_path }))), isRunning: isS3Syncing, tooltip: "Sync all domain AI folders to S3" },
    { label: "Rebuild Index", onClick: () => rebuildIndex(all), isRunning: isRebuildRunning, tooltip: "Rebuild cross-domain artifacts index in Supabase from filesystem" },
    { label: "Health Checks", onClick: () => runHealthChecks(all.filter(d => d.domain_type === "production").map(d => d.domain)), isRunning: isHealthChecking, tooltip: "Run data health checks across all production domains" },
    { label: "Compute Dependencies", onClick: () => computeDeps(domainNames), isRunning: depsProgress?.isRunning ?? false, tooltip: "Compute resource dependencies + table recency for cleanup analysis" },
  ];

  // Command palette commands
  const paletteCommands = useMemo(() => [
    { id: "domain-sync-all", label: "Sync All (Schema)", description: "Fetch all schema data from VAL API for every domain", icon: <RefreshCw size={15} />, action: () => syncAll(domainNames) },
    { id: "domain-sync-monitoring", label: "Sync Workflow Executions", description: "Fetch recent workflow execution history", icon: <RefreshCw size={15} />, action: () => syncMonitoring(domainNames) },
    { id: "domain-sync-sod", label: "Sync SOD Tables", description: "Fetch Start-of-Day table sync status", icon: <RefreshCw size={15} />, action: () => syncSod(domainNames) },
    { id: "domain-sync-importer", label: "Sync Importer Errors", description: "Fetch recent importer errors across domains", icon: <RefreshCw size={15} />, action: () => syncImporterErrors(domainNames) },
    { id: "domain-sync-integration", label: "Sync Integration Errors", description: "Fetch recent integration errors across domains", icon: <RefreshCw size={15} />, action: () => syncIntegrationErrors(domainNames) },
    { id: "domain-sync-s3", label: "Push AI to S3", description: "Upload all domain AI folders to S3 storage", icon: <RefreshCw size={15} />, action: () => syncAiToS3(all.map(d => ({ domain: d.domain, global_path: d.global_path }))) },
    { id: "domain-sync-ga4", label: "Sync GA4 Analytics", description: "Fetch dashboard page views from Google Analytics", icon: <BarChart3 size={15} />, action: handleSyncGa4 },
    { id: "domain-rebuild-index", label: "Rebuild Cross-Domain Index", description: "Rebuild Supabase domain_artifacts from filesystem data", icon: <Database size={15} />, action: () => rebuildIndex(all) },
    { id: "domain-compute-deps", label: "Compute Dependencies", description: "Compute resource dependencies + table recency for all domains", icon: <RefreshCw size={15} />, action: () => computeDeps(domainNames) },
    { id: "domain-full-sync", label: "Full Sync Pipeline", description: "Sync All domains sequentially", icon: <Zap size={15} />, action: handleFullAnalysis },
    { id: "domain-health-checks", label: "Run Health Checks", description: "Check workflow failures, mapping duplicates, and stale jobs across production domains", icon: <HeartPulse size={15} />, action: () => runHealthChecks(all.filter(d => d.domain_type === "production").map(d => d.domain)) },
    ...(anyRunning ? [{ id: "domain-stop", label: "Stop Running Operation", description: "Abort the currently running batch operation", icon: <Square size={15} />, action: handleStop }] : []),
  ], [domainNames, anyRunning, all]);

  useRegisterCommands(paletteCommands, [domainNames, anyRunning, all]);

  // ── States ──
  if (isLoading) return <DetailLoading />;

  if (isError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 px-8">
        <AlertCircle size={32} className="mb-2 text-red-400 opacity-70" />
        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Failed to load domains</p>
        <p className="text-xs text-zinc-400 mt-1 text-center max-w-xs">
          {(() => {
            const msg = error instanceof Error ? error.message : typeof error === "object" && error !== null ? JSON.stringify(error) : String(error);
            return msg.includes("unknown")
              ? "Restart the app to load the new val-sync commands (Rust rebuild required)"
              : msg;
          })()}
        </p>
        <Button onClick={() => refetch()} variant="secondary" icon={RefreshCw} className="mt-3">
          Retry
        </Button>
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
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header: stats + search + batch controls */}
      <div className="flex-shrink-0 px-6 pt-5 pb-3 space-y-3 border-b border-zinc-100 dark:border-zinc-800">
        {/* Title row */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">
              Domains
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              {all.length} domains — {productionCount} production
              {notActiveCount > 0 ? ` · ${notActiveCount} inactive` : ""}
              {demoCount > 0 ? ` · ${demoCount} demo` : ""}
              {templateCount > 0 ? ` · ${templateCount} template` : ""}
            </p>
          </div>
          <div className="relative w-56">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search domains..."
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            />
          </div>
        </div>

        {/* Batch controls row */}
        <div className="flex items-center gap-2">
          <Button
            onClick={handleFullAnalysis}
            disabled={anyRunning}
            title="Sync all domains sequentially"
            size="sm"
            icon={Zap}
            loading={fullAnalysisRunning}
          >
            Full Sync
          </Button>

          <DropdownMenu label="Sync" items={syncItems} disabled={anyRunning} color="teal" tooltip="Fetch data from VAL API" />

          <button
            onClick={handleSyncGa4}
            disabled={anyRunning}
            title="Fetch dashboard page views from Google Analytics"
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors",
              isGa4Syncing
                ? "border-purple-400 text-purple-600 bg-purple-50 dark:bg-purple-900/20"
                : "border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
              anyRunning && !isGa4Syncing && "opacity-50 cursor-not-allowed"
            )}
          >
            {isGa4Syncing ? <Loader2 size={12} className="animate-spin" /> : <BarChart3 size={12} />}
            GA4
          </button>

          {anyRunning && (
            <>
              <div className="w-px h-5 bg-zinc-300 dark:bg-zinc-700 ml-1" />
              <Button onClick={handleStop} variant="danger" icon={Square} size="sm">
                Stop
              </Button>
            </>
          )}
        </div>

        {/* Progress bar */}
        {currentOp && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Loader2 size={12} className="text-zinc-400 animate-spin" />
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
            "px-3 py-2 rounded-lg text-xs",
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
      </div>

      {/* Domain cards grid */}
      <div className="flex-1 overflow-auto p-6">
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-zinc-400">
              {all.length === 0 ? "No domains found" : "No matching domains"}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Array.from(grouped.entries()).map(([type, items]) => (
              <div key={type}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    {typeConfig.labels[type] ?? type}
                  </span>
                  <span className="text-xs text-zinc-400/60">{items.length}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {items.map((d) => (
                    <DomainCard
                      key={d.domain}
                      domain={d}
                      onClick={() => onSelectDomain(d.domain)}
                      dotColors={typeConfig.dotColors}
                      labels={typeConfig.labels}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
