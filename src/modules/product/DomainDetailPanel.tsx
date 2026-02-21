// src/modules/product/DomainDetailPanel.tsx
// Domain detail with auth status, sync controls, and artifact status

import { useState, useEffect } from "react";
import {
  useValAuth,
  useValCredentials,
  useSetValCredentials,
  useValSyncStatus,
  useValOutputStatus,
  useValLogin,
  useValSyncAll,
  useValSyncArtifact,
} from "../../hooks/val-sync";
import { StatusChip } from "./StatusChip";
import {
  X,
  Loader2,
  RefreshCw,
  KeyRound,
  CheckCircle2,
  XCircle,
  Clock,
  Play,
  History,
  Eye,
  EyeOff,
  Check,
  Pencil,
  Zap,
  Maximize2,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { EmptyState } from "../../components/EmptyState";
import { timeAgoVerbose as timeAgo } from "../../lib/date";
import { useJobsStore } from "../../stores/jobsStore";
import { useViewContextStore } from "../../stores/viewContextStore";
import { DomainAiTab } from "./DomainAiTab";
import { FilesTab } from "./DomainDetailFilesTab";
import { UnifiedReviewView } from "../library/UnifiedReviewView";
import type { ReviewResourceType } from "../library/reviewTypes";
import {
  ARTIFACT_LABELS, EXTRACT_LABELS, TYPE_COLORS,
  formatRelativeShort,
  type DomainDetailPanelProps, type Tab,
} from "./domainDetailShared";

export function DomainDetailPanel({ id: domain, onClose, onReviewDataModels, onReviewQueries, onReviewWorkflows, onReviewDashboards, discoveredDomain }: DomainDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  // Report domain + sub-tab to help bot
  const setViewDetail = useViewContextStore((s) => s.setDetail);
  useEffect(() => {
    const tabLabels: Record<Tab, string> = { overview: "Overview", "data-models": "Data Models", queries: "Queries", workflows: "Workflows", dashboards: "Dashboards", files: "Files", sync: "Sync", history: "History", ai: "AI" };
    setViewDetail(`${domain} → ${tabLabels[activeTab]}`);
  }, [domain, activeTab, setViewDetail]);

  const [showCredForm, setShowCredForm] = useState(false);
  const [credEmail, setCredEmail] = useState("");
  const [credPassword, setCredPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const authQuery = useValAuth(domain);
  const credQuery = useValCredentials(domain);
  const setCredMutation = useSetValCredentials();
  const statusQuery = useValSyncStatus(domain);
  const outputStatusQuery = useValOutputStatus(domain);
  const loginMutation = useValLogin();
  const syncAllMutation = useValSyncAll();
  const syncArtifactMutation = useValSyncArtifact();
  const auth = authQuery.data;
  const creds = credQuery.data;
  const metadata = statusQuery.data;

  const addJob = useJobsStore((s) => s.addJob);
  const updateJob = useJobsStore((s) => s.updateJob);

  const isSyncing = syncAllMutation.isPending || syncArtifactMutation.isPending;

  const handleLogin = () => {
    const jobId = `val-login-${domain}-${Date.now()}`;
    addJob({ id: jobId, name: `Login: ${domain}`, status: "running", message: "Authenticating..." });
    loginMutation.mutate(domain, {
      onSuccess: (data) => {
        updateJob(jobId, {
          status: "completed",
          message: data.authenticated ? "Authenticated" : data.message,
        });
      },
      onError: (err) => {
        updateJob(jobId, { status: "failed", message: String(err) });
      },
    });
  };

  const handleSaveCredentials = () => {
    if (!credEmail.trim() || !credPassword.trim()) return;
    setCredMutation.mutate(
      { domain, email: credEmail.trim(), password: credPassword.trim() },
      {
        onSuccess: () => {
          setShowCredForm(false);
          setCredEmail("");
          setCredPassword("");
          setShowPassword(false);
        },
      }
    );
  };

  const handleEditCredentials = () => {
    setCredEmail(creds?.email ?? "");
    setCredPassword("");
    setShowCredForm(true);
  };

  const handleSyncAll = () => {
    const jobId = `val-sync-all-${domain}-${Date.now()}`;
    addJob({
      id: jobId,
      name: `Sync All: ${domain}`,
      status: "running",
      message: "Starting full sync + extract...",
      progress: 0,
    });
    syncAllMutation.mutate(domain, {
      onSuccess: (data) => {
        const syncCount = data.results.length;
        const extractCount = data.extract_results.length;
        updateJob(jobId, {
          status: "completed",
          progress: 100,
          message: `${syncCount} syncs + ${extractCount} extracts in ${(data.total_duration_ms / 1000).toFixed(1)}s`,
        });
        statusQuery.refetch();
      },
      onError: (err) => {
        updateJob(jobId, { status: "failed", message: String(err) });
      },
    });
  };

  const handleSyncArtifact = (artifactType: string) => {
    const label = ARTIFACT_LABELS[artifactType] ?? artifactType;
    const jobId = `val-sync-${artifactType}-${domain}-${Date.now()}`;
    addJob({
      id: jobId,
      name: `Sync ${label}: ${domain}`,
      status: "running",
      message: `Syncing ${label.toLowerCase()}...`,
    });
    syncArtifactMutation.mutate(
      { domain, artifactType },
      {
        onSuccess: (data) => {
          updateJob(jobId, {
            status: "completed",
            message: `${data.count} items in ${(data.duration_ms / 1000).toFixed(1)}s`,
          });
          statusQuery.refetch();
        },
        onError: (err) => {
          updateJob(jobId, { status: "failed", message: String(err) });
        },
      }
    );
  };


  // Review tab config — maps tab IDs to folder names, resource types, and full-screen callbacks
  const REVIEW_TABS: Record<string, { folder: string; resourceType: ReviewResourceType; onFullScreen?: () => void }> = {
    "data-models": { folder: "data_models", resourceType: "table", onFullScreen: onReviewDataModels },
    queries: { folder: "queries", resourceType: "query", onFullScreen: onReviewQueries },
    workflows: { folder: "workflows", resourceType: "workflow", onFullScreen: onReviewWorkflows },
    dashboards: { folder: "dashboards", resourceType: "dashboard", onFullScreen: onReviewDashboards },
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "ai", label: "AI" },
    { id: "sync", label: "Sync" },
    { id: "data-models", label: "Data Models" },
    { id: "queries", label: "Queries" },
    { id: "workflows", label: "Workflows" },
    { id: "dashboards", label: "Dashboards" },
    { id: "files", label: "Files" },
    { id: "history", label: "History" },
  ];

  const typeColors = discoveredDomain ? (TYPE_COLORS[discoveredDomain.domain_type] ?? TYPE_COLORS.production) : null;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Header — Profile style when discoveredDomain provided, simple otherwise */}
      {discoveredDomain && typeColors ? (
        <div className="flex-shrink-0">
          <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-start gap-3.5">
              {/* Initials avatar */}
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold flex-shrink-0", typeColors.avatar)}>
                {domain.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 font-mono truncate">
                    {domain}
                  </h2>
                  <span className={cn("px-2 py-0.5 rounded text-[10px] font-medium capitalize", typeColors.badge, typeColors.badgeText)}>
                    {discoveredDomain.domain_type}
                  </span>
                  {auth?.authenticated ? (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                      <CheckCircle2 size={10} />
                      Authenticated
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                      <XCircle size={10} />
                      Not authenticated
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-0.5 truncate font-mono">
                  {discoveredDomain.global_path}
                </p>
                {/* Stat pills */}
                <div className="flex items-center gap-2 mt-2">
                  {discoveredDomain.artifact_count != null && discoveredDomain.artifact_count > 0 && (
                    <span className="px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-400">
                      <Zap size={10} className="inline mr-1 -mt-0.5" />
                      {discoveredDomain.artifact_count.toLocaleString()} Artifacts
                    </span>
                  )}
                  <span className="px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-400">
                    <RefreshCw size={10} className="inline mr-1 -mt-0.5" />
                    {formatRelativeShort(discoveredDomain.last_sync)}
                  </span>
                </div>
              </div>
              {/* Close button */}
              <button
                onClick={onClose}
                className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 flex-shrink-0"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 font-mono">
              {domain}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              {auth?.authenticated ? (
                <StatusChip label="Authenticated" color="green" />
              ) : (
                <StatusChip label="Not authenticated" color="gray" />
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="px-4 border-b border-zinc-200 dark:border-zinc-800 flex gap-4 flex-shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "py-2 text-sm border-b-2 transition-colors",
              activeTab === tab.id
                ? "border-teal-500 text-teal-600 dark:text-teal-400"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Review tab content — rendered outside the padded wrapper so the grid fills the space */}
      {REVIEW_TABS[activeTab] && discoveredDomain && (
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Expand button bar */}
          <div className="flex items-center justify-end px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
            {REVIEW_TABS[activeTab].onFullScreen && (
              <button
                onClick={REVIEW_TABS[activeTab].onFullScreen}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
              >
                <Maximize2 size={12} />
                Full Screen
              </button>
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            <UnifiedReviewView
              key={`${domain}-${activeTab}`}
              resourceType={REVIEW_TABS[activeTab].resourceType}
              folderPath={`${discoveredDomain.global_path}/${REVIEW_TABS[activeTab].folder}`}
              domainName={domain}
            />
          </div>
        </div>
      )}

      {/* Tab content */}
      <div className={cn("flex-1 overflow-auto p-4", REVIEW_TABS[activeTab] && "hidden")}>
        {activeTab === "overview" && discoveredDomain && (
          /* Two-column overview when discoveredDomain is provided */
          <div className="flex gap-6">
            {/* Left column — artifacts + extractions */}
            <div className="flex-1 space-y-4 min-w-0">
              {/* Artifact status summary */}
              <div>
                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Synced Artifacts
                </label>
                {metadata && Object.keys(metadata.artifacts).length > 0 ? (
                  <div className="mt-1 space-y-1">
                    {Object.entries(metadata.artifacts).map(([type, status]) => (
                      <div
                        key={type}
                        className="p-2 rounded border border-zinc-200 dark:border-zinc-800 flex items-center justify-between"
                      >
                        <span className="text-sm text-zinc-700 dark:text-zinc-300">
                          {ARTIFACT_LABELS[type] ?? type}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-400">{status.count} items</span>
                          <StatusChip
                            label={status.status}
                            color={status.status === "ok" ? "green" : "red"}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState message="No artifacts synced yet" className="py-4" />
                )}
              </div>

              {/* Extractions summary */}
              {metadata && Object.keys(metadata.extractions).length > 0 && (
                <div>
                  <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Extractions
                  </label>
                  <div className="mt-1 space-y-1">
                    {Object.entries(metadata.extractions).map(([type, status]) => (
                      <div
                        key={type}
                        className="p-2 rounded border border-zinc-200 dark:border-zinc-800 flex items-center justify-between"
                      >
                        <span className="text-sm text-zinc-700 dark:text-zinc-300">
                          {EXTRACT_LABELS[type] ?? type}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-400">{status.count} items</span>
                          <StatusChip
                            label={status.status}
                            color={status.status === "ok" ? "green" : "red"}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right column (320px) — credentials + auth + history */}
            <div className="w-[320px] flex-shrink-0 space-y-4">
              {/* Credentials section */}
              <div>
                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Credentials
                </label>
                <div className="mt-1 p-3 rounded border border-zinc-200 dark:border-zinc-800 space-y-2">
                  {!showCredForm && creds?.has_credentials && (
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 size={14} className="text-green-500" />
                          <span className="text-sm text-zinc-700 dark:text-zinc-300">
                            {creds.email}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-400 ml-5">Password set</div>
                      </div>
                      <button
                        onClick={handleEditCredentials}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
                      >
                        <Pencil size={10} />
                        Edit
                      </button>
                    </div>
                  )}
                  {!showCredForm && !creds?.has_credentials && !credQuery.isLoading && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <XCircle size={14} className="text-zinc-400" />
                        <span className="text-sm text-zinc-500">No credentials set</span>
                      </div>
                      <button
                        onClick={() => setShowCredForm(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-500 text-white rounded transition-colors"
                      >
                        <KeyRound size={12} />
                        Set Credentials
                      </button>
                    </div>
                  )}
                  {showCredForm && (
                    <div className="space-y-2">
                      <input
                        type="email"
                        value={credEmail}
                        onChange={(e) => setCredEmail(e.target.value)}
                        placeholder="Email"
                        className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                        autoFocus
                      />
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={credPassword}
                          onChange={(e) => setCredPassword(e.target.value)}
                          placeholder="Password"
                          className="w-full px-3 py-1.5 pr-8 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                        >
                          {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      {setCredMutation.isError && (
                        <p className="text-xs text-red-500">
                          {(setCredMutation.error as Error).message}
                        </p>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleSaveCredentials}
                          disabled={setCredMutation.isPending || !credEmail.trim() || !credPassword.trim()}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded transition-colors"
                        >
                          {setCredMutation.isPending ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Check size={12} />
                          )}
                          Save
                        </button>
                        <button
                          onClick={() => { setShowCredForm(false); setCredEmail(""); setCredPassword(""); setShowPassword(false); }}
                          className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Auth section */}
              <div>
                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Authentication
                </label>
                <div className="mt-1 p-3 rounded border border-zinc-200 dark:border-zinc-800 space-y-2">
                  <div className="flex items-center gap-2">
                    {auth?.authenticated ? (
                      <CheckCircle2 size={14} className="text-green-500" />
                    ) : (
                      <XCircle size={14} className="text-zinc-400" />
                    )}
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">
                      {auth?.message ?? "Loading..."}
                    </span>
                  </div>
                  {auth?.expires_at && (
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <Clock size={12} />
                      Expires: {new Date(auth.expires_at).toLocaleString()}
                    </div>
                  )}
                  {!auth?.authenticated && creds?.has_credentials && (
                    <button
                      onClick={handleLogin}
                      disabled={loginMutation.isPending}
                      className="mt-1 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded transition-colors"
                    >
                      {loginMutation.isPending ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <KeyRound size={12} />
                      )}
                      Login
                    </button>
                  )}
                  {!auth?.authenticated && !creds?.has_credentials && !credQuery.isLoading && (
                    <p className="text-xs text-zinc-400">Set credentials above to login</p>
                  )}
                  {loginMutation.isError && (
                    <p className="text-xs text-red-500 mt-1">
                      {(loginMutation.error as Error).message}
                    </p>
                  )}
                </div>
              </div>

              {/* Recent history (last 5) */}
              {metadata && metadata.history.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Recent History
                  </label>
                  <div className="mt-1 space-y-1">
                    {[...metadata.history].reverse().slice(0, 5).map((entry, i) => (
                      <div
                        key={i}
                        className="p-2 rounded border border-zinc-200 dark:border-zinc-800 flex items-start gap-2"
                      >
                        <History size={10} className="text-zinc-400 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate">
                              {entry.operation}
                            </span>
                            <StatusChip
                              label={entry.status}
                              color={entry.status === "ok" ? "green" : "red"}
                            />
                          </div>
                          <span className="text-[10px] text-zinc-400">
                            {timeAgo(entry.timestamp)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "overview" && !discoveredDomain && (
          /* Single-column fallback when no discoveredDomain */
          <div className="space-y-4">
            {/* Credentials section */}
            <div>
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Credentials
              </label>
              <div className="mt-1 p-3 rounded border border-zinc-200 dark:border-zinc-800 space-y-2">
                {!showCredForm && creds?.has_credentials && (
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={14} className="text-green-500" />
                        <span className="text-sm text-zinc-700 dark:text-zinc-300">
                          {creds.email}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-400 ml-5">Password set</div>
                    </div>
                    <button
                      onClick={handleEditCredentials}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
                    >
                      <Pencil size={10} />
                      Edit
                    </button>
                  </div>
                )}
                {!showCredForm && !creds?.has_credentials && !credQuery.isLoading && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <XCircle size={14} className="text-zinc-400" />
                      <span className="text-sm text-zinc-500">No credentials set</span>
                    </div>
                    <button
                      onClick={() => setShowCredForm(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-500 text-white rounded transition-colors"
                    >
                      <KeyRound size={12} />
                      Set Credentials
                    </button>
                  </div>
                )}
                {showCredForm && (
                  <div className="space-y-2">
                    <input
                      type="email"
                      value={credEmail}
                      onChange={(e) => setCredEmail(e.target.value)}
                      placeholder="Email"
                      className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                      autoFocus
                    />
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={credPassword}
                        onChange={(e) => setCredPassword(e.target.value)}
                        placeholder="Password"
                        className="w-full px-3 py-1.5 pr-8 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                      >
                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    {setCredMutation.isError && (
                      <p className="text-xs text-red-500">
                        {(setCredMutation.error as Error).message}
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSaveCredentials}
                        disabled={setCredMutation.isPending || !credEmail.trim() || !credPassword.trim()}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded transition-colors"
                      >
                        {setCredMutation.isPending ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Check size={12} />
                        )}
                        Save
                      </button>
                      <button
                        onClick={() => { setShowCredForm(false); setCredEmail(""); setCredPassword(""); setShowPassword(false); }}
                        className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Auth section */}
            <div>
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Authentication
              </label>
              <div className="mt-1 p-3 rounded border border-zinc-200 dark:border-zinc-800 space-y-2">
                <div className="flex items-center gap-2">
                  {auth?.authenticated ? (
                    <CheckCircle2 size={14} className="text-green-500" />
                  ) : (
                    <XCircle size={14} className="text-zinc-400" />
                  )}
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">
                    {auth?.message ?? "Loading..."}
                  </span>
                </div>
                {auth?.expires_at && (
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <Clock size={12} />
                    Expires: {new Date(auth.expires_at).toLocaleString()}
                  </div>
                )}
                {!auth?.authenticated && creds?.has_credentials && (
                  <button
                    onClick={handleLogin}
                    disabled={loginMutation.isPending}
                    className="mt-1 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded transition-colors"
                  >
                    {loginMutation.isPending ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <KeyRound size={12} />
                    )}
                    Login
                  </button>
                )}
                {!auth?.authenticated && !creds?.has_credentials && !credQuery.isLoading && (
                  <p className="text-xs text-zinc-400">Set credentials above to login</p>
                )}
                {loginMutation.isError && (
                  <p className="text-xs text-red-500 mt-1">
                    {(loginMutation.error as Error).message}
                  </p>
                )}
              </div>
            </div>

            {/* Artifact status summary */}
            <div>
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Synced Artifacts
              </label>
              {metadata && Object.keys(metadata.artifacts).length > 0 ? (
                <div className="mt-1 space-y-1">
                  {Object.entries(metadata.artifacts).map(([type, status]) => (
                    <div
                      key={type}
                      className="p-2 rounded border border-zinc-200 dark:border-zinc-800 flex items-center justify-between"
                    >
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">
                        {ARTIFACT_LABELS[type] ?? type}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-400">{status.count} items</span>
                        <StatusChip
                          label={status.status}
                          color={status.status === "ok" ? "green" : "red"}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-sm text-zinc-500">No artifacts synced yet</p>
              )}
            </div>

            {/* Extractions summary */}
            {metadata && Object.keys(metadata.extractions).length > 0 && (
              <div>
                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Extractions
                </label>
                <div className="mt-1 space-y-1">
                  {Object.entries(metadata.extractions).map(([type, status]) => (
                    <div
                      key={type}
                      className="p-2 rounded border border-zinc-200 dark:border-zinc-800 flex items-center justify-between"
                    >
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">
                        {EXTRACT_LABELS[type] ?? type}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-400">{status.count} items</span>
                        <StatusChip
                          label={status.status}
                          color={status.status === "ok" ? "green" : "red"}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "files" && (
          <FilesTab outputs={outputStatusQuery.data?.outputs ?? []} isLoading={outputStatusQuery.isLoading} />
        )}

        {activeTab === "sync" && (
          <div className="space-y-4">
            {/* Sync All button */}
            <div>
              <button
                onClick={handleSyncAll}
                disabled={isSyncing}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-md text-sm font-medium transition-colors"
              >
                {syncAllMutation.isPending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <RefreshCw size={16} />
                )}
                Sync All + Extract
              </button>
              {syncAllMutation.isSuccess && (
                <div className="mt-2 p-2 rounded bg-green-500/10 text-green-600 dark:text-green-400 text-xs">
                  Completed in {syncAllMutation.data.total_duration_ms}ms —{" "}
                  {syncAllMutation.data.status}
                </div>
              )}
              {syncAllMutation.isError && (
                <p className="mt-2 text-xs text-red-500">
                  {(syncAllMutation.error as Error).message}
                </p>
              )}
            </div>

            {/* Individual sync buttons */}
            <div>
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Individual Sync
              </label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {Object.entries(ARTIFACT_LABELS).map(([type, label]) => {
                  const artifactStatus = metadata?.artifacts[type];
                  return (
                    <button
                      key={type}
                      onClick={() => handleSyncArtifact(type)}
                      disabled={isSyncing}
                      className="flex items-center gap-2 p-2 text-left rounded border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50 transition-colors"
                    >
                      <Play size={12} className="text-teal-500 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="text-sm text-zinc-700 dark:text-zinc-300 block">
                          {label}
                        </span>
                        {artifactStatus && (
                          <span className="text-[10px] text-zinc-400 block truncate">
                            {artifactStatus.count} items ·{" "}
                            {timeAgo(artifactStatus.last_sync)}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sync result */}
            {syncArtifactMutation.isSuccess && (
              <div className="p-2 rounded bg-green-500/10 text-green-600 dark:text-green-400 text-xs">
                {syncArtifactMutation.data.message} ({syncArtifactMutation.data.duration_ms}ms)
              </div>
            )}
            {syncArtifactMutation.isError && (
              <p className="text-xs text-red-500">
                {(syncArtifactMutation.error as Error).message}
              </p>
            )}

          </div>
        )}

        {activeTab === "history" && (
          <div className="space-y-1">
            {metadata && metadata.history.length > 0 ? (
              [...metadata.history].reverse().map((entry, i) => (
                <div
                  key={i}
                  className="p-2 rounded border border-zinc-200 dark:border-zinc-800 flex items-start gap-2"
                >
                  <History size={12} className="text-zinc-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">
                        {entry.operation}
                      </span>
                      <StatusChip
                        label={entry.status}
                        color={entry.status === "ok" ? "green" : "red"}
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-zinc-400">
                        {timeAgo(entry.timestamp)}
                      </span>
                      {entry.details && (
                        <span className="text-[10px] text-zinc-400">{entry.details}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState message="No sync history yet" className="py-4" />
            )}
          </div>
        )}

        {activeTab === "ai" && discoveredDomain && (
          <DomainAiTab aiPath={`${discoveredDomain.global_path}/ai`} domainName={domain} globalPath={discoveredDomain.global_path} />
        )}

        {activeTab === "ai" && !discoveredDomain && (
          <EmptyState message="Domain path not available" className="py-4" />
        )}
      </div>
    </div>
  );
}
