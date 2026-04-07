// src/modules/product/DomainDetailPanel.tsx
// Domain detail with auth status, sync controls, and artifact status

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  useValAuth,
  useValCredentials,
  useSetValCredentials,
  useValSyncStatus,
  useValOutputStatus,
  useValLogin,
  useValSyncAll,
  useValSyncArtifact,
  useUpdateDomainType,
  useAiTableCoverage,
} from "../../hooks/val-sync";
import { formatError } from "../../lib/formatError";
import { StatusChip } from "./StatusChip";
import {
  X,
  RefreshCw,
  KeyRound,
  CheckCircle2,
  XCircle,
  Clock,
  Play,
  Eye,
  EyeOff,
  Check,
  Pencil,
  Zap,
  Maximize2,
  Folder,
  FileText,
  AlertCircle,
  ChevronDown,
  MessageSquare,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { Button, IconButton } from "../../components/ui";
import { EmptyState } from "../../components/EmptyState";
import { DiscussionPanel } from "../../components/discussions/DiscussionPanel";
import { useDiscussionCount } from "../../hooks/useDiscussions";

import { useJobsStore } from "../../stores/jobsStore";
import { useSidePanelStore } from "../../stores/sidePanelStore";
import { useViewContextStore } from "../../stores/viewContextStore";

import { useRegisterCommands } from "../../stores/commandStore";
import { DomainAiTab } from "./DomainAiTab";
import { DomainReportsTab } from "./DomainReportsTab";
import DomainSolutionsTab from "./DomainSolutionsTab";

import { UnifiedReviewView } from "./UnifiedReviewView";
import { DomainCleanupTab } from "./DomainCleanupTab";
import { DomainDependenciesTab } from "./DomainDependenciesTab";
import type { ReviewResourceType } from "./reviewTypes";
import {
  ARTIFACT_LABELS, ARTIFACT_META, OUTPUT_FILE_DESCRIPTIONS,
  formatRelativeShort, buildMergedRows,
  type DomainDetailPanelProps, type Tab,
} from "./domainDetailShared";
import { useDomainTypeConfig } from "./useDomainTypeConfig";
import { usePrimaryKnowledgePaths } from "../../hooks/useKnowledgePaths";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import * as XLSX from "xlsx";

export function DomainDetailPanel({ id: domain, onClose, onReviewDataModels, onReviewQueries, onReviewWorkflows, onReviewDashboards, discoveredDomain }: DomainDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  // Report domain + sub-tab to help bot
  const setViewDetail = useViewContextStore((s) => s.setDetail);
  useEffect(() => {
    const tabLabels: Record<Tab, string> = { overview: "Overview", "data-models": "Data Models", queries: "Queries", workflows: "Workflows", dashboards: "Dashboards", cleanup: "Cleanup", reports: "Reports", ai: "AI", dependencies: "Dependencies", discussion: "Discussion", solutions: "Solutions" };
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
  const updateTypeMutation = useUpdateDomainType();
  const typeConfig = useDomainTypeConfig();
  const auth = authQuery.data;
  const creds = credQuery.data;
  const metadata = statusQuery.data;

  const addJob = useJobsStore((s) => s.addJob);
  const updateJob = useJobsStore((s) => s.updateJob);
  const { openPanel } = useSidePanelStore();

  // Optimistic domain type for instant UI feedback
  const [optimisticType, setOptimisticType] = useState(discoveredDomain?.domain_type ?? "production");
  useEffect(() => {
    setOptimisticType(discoveredDomain?.domain_type ?? "production");
  }, [discoveredDomain?.domain_type]);

  const isSyncing = syncAllMutation.isPending || syncArtifactMutation.isPending;
  const { data: discussionCount } = useDiscussionCount("domain", domain);
  const paths = usePrimaryKnowledgePaths();
  const tableCoverageMutation = useAiTableCoverage();

  const handleExportAiTableCoverage = useCallback(async () => {
    if (!paths?.skills) return;
    const result = await tableCoverageMutation.mutateAsync({ domain, skillsPath: paths.skills });

    const wb = XLSX.utils.book_new();

    // Tab 1: Tables used by AI Skills
    const aiData = result.ai_tables.map((t) => ({
      "Table ID": t.table_id,
      "Display Name": t.display_name,
      Space: t.space,
      Zone: t.zone,
    }));
    const aiSheet = XLSX.utils.json_to_sheet(aiData.length ? aiData : [{ "Table ID": "(none)", "Display Name": "", Space: "", Zone: "" }]);
    XLSX.utils.book_append_sheet(wb, aiSheet, "AI Skill Tables");

    // Tab 2: Tables NOT used by AI Skills
    const unusedData = result.unused_tables.map((t) => ({
      "Table ID": t.table_id,
      "Display Name": t.display_name,
      Space: t.space,
      Zone: t.zone,
    }));
    const unusedSheet = XLSX.utils.json_to_sheet(unusedData.length ? unusedData : [{ "Table ID": "(none)", "Display Name": "", Space: "", Zone: "" }]);
    XLSX.utils.book_append_sheet(wb, unusedSheet, "Unused Tables");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const filePath = await save({
      defaultPath: `${domain}-ai-table-coverage.xlsx`,
      filters: [{ name: "Excel", extensions: ["xlsx"] }],
    });
    if (!filePath) return;
    await writeFile(filePath, new Uint8Array(buf));
  }, [domain, paths?.skills, tableCoverageMutation]);

  // Sync dropdown menu
  const [syncMenuOpen, setSyncMenuOpen] = useState(false);
  const syncMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (syncMenuRef.current && !syncMenuRef.current.contains(e.target as Node)) setSyncMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);



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
        updateJob(jobId, { status: "failed", message: formatError(err) });
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
        updateJob(jobId, { status: "failed", message: formatError(err) });
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
          updateJob(jobId, { status: "failed", message: formatError(err) });
        },
      }
    );
  };


  // Register contextual commands for Command Palette (⌘K)
  const paletteCommands = useMemo(() => [
    { id: `domain-${domain}-sync-all`, label: `Sync All: ${domain}`, description: "Full sync + extract for this domain", icon: <RefreshCw size={15} />, action: handleSyncAll },
    ...Object.entries(ARTIFACT_LABELS).map(([type, label]) => ({
      id: `domain-${domain}-sync-${type}`,
      label: `Sync ${label}: ${domain}`,
      description: `Fetch latest ${label.toLowerCase()} from VAL`,
      icon: <Play size={15} />,
      action: () => handleSyncArtifact(type),
    })),
    { id: `domain-${domain}-login`, label: `Login: ${domain}`, description: "Authenticate with VAL for this domain", icon: <KeyRound size={15} />, action: handleLogin },
  ], [domain]);

  useRegisterCommands(paletteCommands, [domain]);

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
    { id: "data-models", label: "Data Models" },
    { id: "queries", label: "Queries" },
    { id: "workflows", label: "Workflows" },
    { id: "dashboards", label: "Dashboards" },
    { id: "cleanup", label: "Cleanup" },
    { id: "dependencies", label: "Dependencies" },
    { id: "reports", label: "Reports" },
    { id: "solutions", label: "Solutions" },
    { id: "discussion", label: "Discussion" },
  ];

  const typeColors = discoveredDomain ? (typeConfig.colors[optimisticType] ?? typeConfig.colors.production ?? null) : null;

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
                  <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                    {domain}
                  </h2>
                  <select
                    value={optimisticType}
                    onChange={(e) => {
                      const newType = e.target.value;
                      setOptimisticType(newType);
                      updateTypeMutation.mutate({ domain, domainType: newType });
                    }}
                    className={cn(
                      "px-2 py-0.5 rounded text-xs font-medium capitalize cursor-pointer border-none appearance-none",
                      "focus:outline-none focus:ring-1 focus:ring-zinc-400",
                      typeColors.badge, typeColors.badgeText
                    )}
                  >
                    {typeConfig.types.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  {auth?.authenticated ? (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                      <CheckCircle2 size={10} />
                      Authenticated
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
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
                    <span className="px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400">
                      <Zap size={10} className="inline mr-1 -mt-0.5" />
                      {discoveredDomain.artifact_count.toLocaleString()} Artifacts
                    </span>
                  )}
                  <span className="px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400">
                    <RefreshCw size={10} className="inline mr-1 -mt-0.5" />
                    {formatRelativeShort(discoveredDomain.last_sync)}
                  </span>
                </div>
              </div>
              {/* Actions */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <div ref={syncMenuRef} className="relative">
                  <div className="flex items-center">
                    <Button
                      onClick={handleSyncAll}
                      disabled={isSyncing}
                      variant="ghost"
                      icon={RefreshCw}
                      loading={syncAllMutation.isPending}
                      className="rounded-r-none"
                    >
                      Sync All
                    </Button>
                    <button
                      onClick={() => setSyncMenuOpen(!syncMenuOpen)}
                      disabled={isSyncing}
                      className="px-1.5 py-1.5 border-l border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-r-md disabled:opacity-50 transition-colors"
                    >
                      <ChevronDown size={12} className={cn("transition-transform", syncMenuOpen && "rotate-180")} />
                    </button>
                  </div>
                  {syncMenuOpen && (
                    <div className="absolute top-full right-0 mt-1 z-20 min-w-[200px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-lg py-1">
                      <div className="px-3 py-1 text-xs text-zinc-400 uppercase tracking-wider">Sync Individual</div>
                      {Object.entries(ARTIFACT_LABELS).map(([type, label]) => (
                        <button
                          key={type}
                          onClick={() => { handleSyncArtifact(type); setSyncMenuOpen(false); }}
                          disabled={isSyncing}
                          className="w-full text-left px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 disabled:opacity-50"
                        >
                          {label}
                        </button>
                      ))}
                      <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />
                      <div className="px-3 py-1 text-xs text-zinc-400 uppercase tracking-wider">Export</div>
                      <button
                        onClick={() => { handleExportAiTableCoverage(); setSyncMenuOpen(false); }}
                        disabled={tableCoverageMutation.isPending}
                        className="w-full text-left px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 disabled:opacity-50"
                      >
                        {tableCoverageMutation.isPending ? "Exporting..." : "AI Table Coverage"}
                      </button>
                    </div>
                  )}
                </div>
                <IconButton
                  onClick={onClose}
                  icon={X}
                  label="Close"
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
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
          <IconButton
            onClick={onClose}
            icon={X}
            label="Close"
          />
        </div>
      )}

      {/* Tabs */}
      <div className="px-4 border-b border-zinc-200 dark:border-zinc-800 flex gap-4 flex-shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "py-2 text-sm border-b-2 transition-colors flex items-center gap-1",
              activeTab === tab.id
                ? "border-teal-500 text-teal-600 dark:text-teal-400"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            )}
          >
            {tab.id === "discussion" ? (
              <>
                <MessageSquare size={13} />
                {(discussionCount ?? 0) > 0 && (
                  <span className="text-[10px] bg-zinc-200 dark:bg-zinc-800 px-1 py-0.5 rounded-full">
                    {discussionCount}
                  </span>
                )}
              </>
            ) : (
              tab.label
            )}
          </button>
        ))}
      </div>

      {/* Discussion tab */}
      {activeTab === "discussion" && (
        <div className="flex-1 overflow-hidden">
          <DiscussionPanel entityType="domain" entityId={domain} />
        </div>
      )}

      {/* AI tab — full-height tree+detail pane */}
      {activeTab === "ai" && discoveredDomain && (
        <div className="flex-1 overflow-hidden">
          <DomainAiTab aiPath={`${discoveredDomain.global_path}/ai`} domainName={domain} globalPath={discoveredDomain.global_path} />
        </div>
      )}

      {/* Cleanup tab — dependency analysis and resource cleanup */}
      {activeTab === "cleanup" && discoveredDomain && (
        <div className="flex-1 overflow-hidden">
          <DomainCleanupTab domainName={domain} globalPath={discoveredDomain.global_path} />
        </div>
      )}

      {/* Dependencies tab — dependency graph explorer */}
      {activeTab === "dependencies" && (
        <div className="flex-1 overflow-hidden">
          <DomainDependenciesTab domainName={domain} />
        </div>
      )}

      {/* Reports tab — full-height tree+detail pane */}
      {activeTab === "reports" && discoveredDomain && (
        <div className="flex-1 overflow-hidden">
          <DomainReportsTab reportsPath={`${discoveredDomain.global_path}/reports`} domainName={domain} />
        </div>
      )}

      {/* Solutions tab — onboarding matrix */}
      {activeTab === "solutions" && (
        <div className="flex-1 overflow-hidden">
          <DomainSolutionsTab domainName={domain} />
        </div>
      )}

      {/* Review tab content — rendered outside the padded wrapper so the grid fills the space */}
      {REVIEW_TABS[activeTab] && discoveredDomain && (
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Expand button bar */}
          <div className="flex items-center justify-end px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
            {REVIEW_TABS[activeTab].onFullScreen && (
              <Button
                onClick={REVIEW_TABS[activeTab].onFullScreen}
                variant="ghost"
                icon={Maximize2}
              >
                Full Screen
              </Button>
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
      <div className={cn("flex-1 overflow-auto p-4", (REVIEW_TABS[activeTab] || activeTab === "ai" || activeTab === "reports" || activeTab === "cleanup" || activeTab === "dependencies" || activeTab === "solutions") && "hidden")}>
        {activeTab === "overview" && discoveredDomain && (
          /* Two-column overview when discoveredDomain is provided */
          <div className="flex gap-6">
            {/* Left column — merged artifacts table */}
            <div className="flex-1 min-w-0">
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Domain Artifacts
              </label>
              <p className="text-xs text-zinc-400 mt-0.5 mb-2">
                Data pulled from the VAL API. <strong className="text-zinc-500 dark:text-zinc-400">Fetched</strong> = raw items from API. <strong className="text-zinc-500 dark:text-zinc-400">Extracted</strong> = individual files written to disk.
              </p>
              {metadata && (Object.keys(metadata.artifacts).length > 0 || Object.keys(metadata.extractions).length > 0) ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-zinc-400 uppercase tracking-wider">
                      <th className="text-left py-1.5 font-medium">Name</th>
                      <th className="text-right py-1.5 font-medium pr-3">Fetched</th>
                      <th className="text-right py-1.5 font-medium pr-3">Extracted</th>
                      <th className="text-right py-1.5 font-medium">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const rows = buildMergedRows(metadata.artifacts, metadata.extractions);
                      let lastGroup = "";
                      return rows.map((row) => {
                        const latestSync = [row.sync?.last_sync, row.extract?.last_sync]
                          .filter(Boolean)
                          .sort()
                          .pop() ?? null;
                        const showGroupHeader = row.group !== lastGroup;
                        lastGroup = row.group;
                        const meta = ARTIFACT_META[row.label];
                        return (
                          <React.Fragment key={row.label}>
                            {showGroupHeader && (
                              <tr>
                                <td colSpan={4} className="pt-4 pb-1">
                                  <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{row.group}</span>
                                </td>
                              </tr>
                            )}
                            <tr className="border-t border-zinc-100 dark:border-zinc-800">
                              <td className="py-2">
                                <div className="text-zinc-700 dark:text-zinc-300">{row.label}</div>
                                {meta?.description && (
                                  <div className="text-xs text-zinc-400 mt-0.5">{meta.description}</div>
                                )}
                              </td>
                              <td className="py-2 text-right pr-3">
                                {row.sync ? (
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className="text-xs text-zinc-400">{row.sync.count}</span>
                                    {row.sync.status !== "ok" && <StatusChip label={row.sync.status} color="red" />}
                                  </span>
                                ) : (
                                  <span className="text-xs text-zinc-300 dark:text-zinc-600">—</span>
                                )}
                              </td>
                              <td className="py-2 text-right pr-3">
                                {row.extract ? (
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className="text-xs text-zinc-400">{row.extract.count}</span>
                                    {row.extract.status !== "ok" && <StatusChip label={row.extract.status} color="red" />}
                                  </span>
                                ) : (
                                  <span className="text-xs text-zinc-300 dark:text-zinc-600">—</span>
                                )}
                              </td>
                              <td className="py-2 text-right">
                                <span className="text-xs text-zinc-400">{formatRelativeShort(latestSync)}</span>
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      });
                    })()}
                    {/* Output files: Health Checks, Analysis */}
                    {(() => {
                      const fileOutputs = (outputStatusQuery.data?.outputs ?? [])
                        .filter((o) => !["Schema Sync", "Extractions", "Monitoring", "Analytics"].includes(o.category));
                      let lastCategory = "";
                      return fileOutputs.map((output) => {
                        const showCategoryHeader = output.category !== lastCategory;
                        lastCategory = output.category;
                        const desc = OUTPUT_FILE_DESCRIPTIONS[output.name];
                        return (
                          <React.Fragment key={output.relative_path}>
                            {showCategoryHeader && (
                              <tr>
                                <td colSpan={4} className="pt-4 pb-1">
                                  <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{output.category}</span>
                                </td>
                              </tr>
                            )}
                            <tr
                              className={cn(
                                "border-t",
                                !output.exists
                                  ? "border-amber-200 dark:border-amber-800/50 bg-amber-50/30 dark:bg-amber-900/10"
                                  : "border-zinc-100 dark:border-zinc-800",
                                output.exists && !output.is_folder && "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900"
                              )}
                              onClick={() => { if (output.exists && !output.is_folder) openPanel(output.path, output.name); }}
                            >
                              <td className="py-2">
                                <div className={cn("flex items-center gap-1.5", output.exists ? "text-zinc-700 dark:text-zinc-300" : "text-zinc-400")}>
                                  {output.is_folder
                                    ? <Folder size={12} className={output.exists ? "text-amber-500" : "text-zinc-300"} />
                                    : <FileText size={12} className={output.exists ? "text-blue-500" : "text-zinc-300"} />
                                  }
                                  {output.name}
                                </div>
                                {desc && <div className="text-xs text-zinc-400 mt-0.5">{desc}</div>}
                              </td>
                              <td className="py-2 text-right pr-3">
                                <span className="text-xs text-zinc-300 dark:text-zinc-600">—</span>
                              </td>
                              <td className="py-2 text-right pr-3">
                                <span className="text-xs text-zinc-300 dark:text-zinc-600">—</span>
                              </td>
                              <td className="py-2 text-right">
                                {output.exists && output.modified ? (
                                  <span className="text-xs text-zinc-400">{formatRelativeShort(output.modified)}</span>
                                ) : !output.exists ? (
                                  <span className="text-xs text-amber-600 dark:text-amber-400 inline-flex items-center gap-0.5">
                                    <AlertCircle size={10} />
                                    Missing
                                  </span>
                                ) : (
                                  <span className="text-xs text-zinc-300 dark:text-zinc-600">—</span>
                                )}
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              ) : (
                <EmptyState message="No artifacts synced yet" className="py-4" />
              )}
            </div>

            {/* Right column (320px) — credentials + auth */}
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
                      <Button
                        onClick={handleEditCredentials}
                        variant="ghost"
                        icon={Pencil}
                      >
                        Edit
                      </Button>
                    </div>
                  )}
                  {!showCredForm && !creds?.has_credentials && !credQuery.isLoading && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <XCircle size={14} className="text-zinc-400" />
                        <span className="text-sm text-zinc-500">No credentials set</span>
                      </div>
                      <Button
                        onClick={() => setShowCredForm(true)}
                        icon={KeyRound}
                      >
                        Set Credentials
                      </Button>
                    </div>
                  )}
                  {showCredForm && (
                    <div className="space-y-2">
                      <input
                        type="email"
                        value={credEmail}
                        onChange={(e) => setCredEmail(e.target.value)}
                        placeholder="Email"
                        className="w-full px-3 py-1.5 text-sm border border-zinc-200 dark:border-zinc-800 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                        autoFocus
                      />
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={credPassword}
                          onChange={(e) => setCredPassword(e.target.value)}
                          placeholder="Password"
                          className="w-full px-3 py-1.5 pr-8 text-sm border border-zinc-200 dark:border-zinc-800 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
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
                        <Button
                          onClick={handleSaveCredentials}
                          disabled={!credEmail.trim() || !credPassword.trim()}
                          icon={Check}
                          loading={setCredMutation.isPending}
                        >
                          Save
                        </Button>
                        <Button
                          onClick={() => { setShowCredForm(false); setCredEmail(""); setCredPassword(""); setShowPassword(false); }}
                          variant="ghost"
                        >
                          Cancel
                        </Button>
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
                      Expires: {new Date(auth.expires_at).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}
                    </div>
                  )}
                  {!auth?.authenticated && creds?.has_credentials && (
                    <Button
                      onClick={handleLogin}
                      icon={KeyRound}
                      loading={loginMutation.isPending}
                      className="mt-1"
                    >
                      Login
                    </Button>
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
                    <Button
                      onClick={handleEditCredentials}
                      variant="ghost"
                      icon={Pencil}
                    >
                      Edit
                    </Button>
                  </div>
                )}
                {!showCredForm && !creds?.has_credentials && !credQuery.isLoading && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <XCircle size={14} className="text-zinc-400" />
                      <span className="text-sm text-zinc-500">No credentials set</span>
                    </div>
                    <Button
                      onClick={() => setShowCredForm(true)}
                      icon={KeyRound}
                    >
                      Set Credentials
                    </Button>
                  </div>
                )}
                {showCredForm && (
                  <div className="space-y-2">
                    <input
                      type="email"
                      value={credEmail}
                      onChange={(e) => setCredEmail(e.target.value)}
                      placeholder="Email"
                      className="w-full px-3 py-1.5 text-sm border border-zinc-200 dark:border-zinc-800 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                      autoFocus
                    />
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={credPassword}
                        onChange={(e) => setCredPassword(e.target.value)}
                        placeholder="Password"
                        className="w-full px-3 py-1.5 pr-8 text-sm border border-zinc-200 dark:border-zinc-800 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
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
                      <Button
                        onClick={handleSaveCredentials}
                        disabled={!credEmail.trim() || !credPassword.trim()}
                        icon={Check}
                        loading={setCredMutation.isPending}
                      >
                        Save
                      </Button>
                      <Button
                        onClick={() => { setShowCredForm(false); setCredEmail(""); setCredPassword(""); setShowPassword(false); }}
                        variant="ghost"
                      >
                        Cancel
                      </Button>
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
                    Expires: {new Date(auth.expires_at).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}
                  </div>
                )}
                {!auth?.authenticated && creds?.has_credentials && (
                  <Button
                    onClick={handleLogin}
                    icon={KeyRound}
                    loading={loginMutation.isPending}
                    className="mt-1"
                  >
                    Login
                  </Button>
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

            {/* Merged artifacts table */}
            <div>
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Domain Artifacts
              </label>
              <p className="text-xs text-zinc-400 mt-0.5 mb-2">
                Data pulled from the VAL API. <strong className="text-zinc-500 dark:text-zinc-400">Fetched</strong> = raw items from API. <strong className="text-zinc-500 dark:text-zinc-400">Extracted</strong> = individual files written to disk.
              </p>
              {metadata && (Object.keys(metadata.artifacts).length > 0 || Object.keys(metadata.extractions).length > 0) ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-zinc-400 uppercase tracking-wider">
                      <th className="text-left py-1.5 font-medium">Name</th>
                      <th className="text-right py-1.5 font-medium pr-3">Fetched</th>
                      <th className="text-right py-1.5 font-medium pr-3">Extracted</th>
                      <th className="text-right py-1.5 font-medium">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const rows = buildMergedRows(metadata.artifacts, metadata.extractions);
                      let lastGroup = "";
                      return rows.map((row) => {
                        const latestSync = [row.sync?.last_sync, row.extract?.last_sync]
                          .filter(Boolean)
                          .sort()
                          .pop() ?? null;
                        const showGroupHeader = row.group !== lastGroup;
                        lastGroup = row.group;
                        const meta = ARTIFACT_META[row.label];
                        return (
                          <React.Fragment key={row.label}>
                            {showGroupHeader && (
                              <tr>
                                <td colSpan={4} className="pt-4 pb-1">
                                  <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{row.group}</span>
                                </td>
                              </tr>
                            )}
                            <tr className="border-t border-zinc-100 dark:border-zinc-800">
                              <td className="py-2">
                                <div className="text-zinc-700 dark:text-zinc-300">{row.label}</div>
                                {meta?.description && (
                                  <div className="text-xs text-zinc-400 mt-0.5">{meta.description}</div>
                                )}
                              </td>
                              <td className="py-2 text-right pr-3">
                                {row.sync ? (
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className="text-xs text-zinc-400">{row.sync.count}</span>
                                    {row.sync.status !== "ok" && <StatusChip label={row.sync.status} color="red" />}
                                  </span>
                                ) : (
                                  <span className="text-xs text-zinc-300 dark:text-zinc-600">—</span>
                                )}
                              </td>
                              <td className="py-2 text-right pr-3">
                                {row.extract ? (
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className="text-xs text-zinc-400">{row.extract.count}</span>
                                    {row.extract.status !== "ok" && <StatusChip label={row.extract.status} color="red" />}
                                  </span>
                                ) : (
                                  <span className="text-xs text-zinc-300 dark:text-zinc-600">—</span>
                                )}
                              </td>
                              <td className="py-2 text-right">
                                <span className="text-xs text-zinc-400">{formatRelativeShort(latestSync)}</span>
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              ) : (
                <p className="mt-1 text-sm text-zinc-500">No artifacts synced yet</p>
              )}
            </div>
          </div>
        )}



        {activeTab === "ai" && !discoveredDomain && (
          <EmptyState message="Domain path not available" className="py-4" />
        )}

        {activeTab === "reports" && !discoveredDomain && (
          <EmptyState message="Domain path not available" className="py-4" />
        )}
      </div>
    </div>
  );
}
