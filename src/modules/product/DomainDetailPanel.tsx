// src/modules/product/DomainDetailPanel.tsx
// Domain detail with auth status, sync controls, and artifact status

import { useState } from "react";
import {
  useValAuth,
  useValCredentials,
  useSetValCredentials,
  useValSyncStatus,
  useValOutputStatus,
  useValLogin,
  useValSyncAll,
  useValSyncArtifact,
  useRunTablePipeline,
  usePrepareTableOverview,
  useSampleTableData,
  useAnalyzeTableData,
  useExtractTableCalcFields,
  useGenerateTableOverviewMd,
  useListDomainTables,
  type OutputFileStatus,
} from "../../hooks/useValSync";
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
  Folder,
  FileText,
  AlertCircle,
  FileCode,
  Database,
  Sparkles,
  Calculator,
  FileOutput,
  ChevronDown,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { useJobsStore } from "../../stores/jobsStore";
import { useSidePanelStore } from "../../stores/sidePanelStore";

interface DomainDetailPanelProps {
  id: string; // domain name
  onClose: () => void;
  onReviewDataModels?: () => void;
}

const ARTIFACT_LABELS: Record<string, string> = {
  fields: "Fields",
  "all-queries": "Queries",
  "all-workflows": "Workflows",
  "all-dashboards": "Dashboards",
  "all-tables": "Tables",
  "calc-fields": "Calc Fields",
};

const EXTRACT_LABELS: Record<string, string> = {
  queries: "Queries",
  workflows: "Workflows",
  dashboards: "Dashboards",
  tables: "Tables",
  sql: "SQL",
  "calc-fields": "Calc Fields",
};

type Tab = "overview" | "files" | "sync" | "history";

export function DomainDetailPanel({ id: domain, onClose, onReviewDataModels }: DomainDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
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

  // Table pipeline mutations
  const runPipelineMutation = useRunTablePipeline();
  const prepareOverviewMutation = usePrepareTableOverview();
  const sampleDataMutation = useSampleTableData();
  const analyzeDataMutation = useAnalyzeTableData();
  const extractCalcFieldsMutation = useExtractTableCalcFields();
  const generateOverviewMdMutation = useGenerateTableOverviewMd();
  const domainTablesQuery = useListDomainTables(domain);

  const auth = authQuery.data;
  const creds = credQuery.data;
  const metadata = statusQuery.data;

  const addJob = useJobsStore((s) => s.addJob);
  const updateJob = useJobsStore((s) => s.updateJob);

  const isSyncing = syncAllMutation.isPending || syncArtifactMutation.isPending;
  const isPipelineRunning =
    runPipelineMutation.isPending ||
    prepareOverviewMutation.isPending ||
    sampleDataMutation.isPending ||
    analyzeDataMutation.isPending ||
    extractCalcFieldsMutation.isPending ||
    generateOverviewMdMutation.isPending;

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

  // Pipeline handlers
  const [pipelineTableName, setPipelineTableName] = useState("all");

  const handleRunFullPipeline = () => {
    const jobId = `val-pipeline-${domain}-${Date.now()}`;
    addJob({
      id: jobId,
      name: `Table Pipeline: ${domain}`,
      status: "running",
      progress: 0,
      message: `Running pipeline for ${pipelineTableName === "all" ? "all tables" : pipelineTableName}...`,
    });
    runPipelineMutation.mutate(
      { domain, tableName: pipelineTableName, overwrite: false },
      {
        onSuccess: (data) => {
          updateJob(jobId, {
            status: data.tables_errored > 0 ? "failed" : "completed",
            progress: 100,
            message: `${data.tables_processed} processed, ${data.tables_skipped} skipped, ${data.tables_errored} errors (${(data.total_duration_ms / 1000).toFixed(1)}s)`,
          });
          outputStatusQuery.refetch();
        },
        onError: (err) => {
          updateJob(jobId, { status: "failed", message: String(err) });
        },
      }
    );
  };

  const handlePipelineStep = (
    step: "prepare" | "sample" | "analyze" | "calc" | "overview",
    tableName: string
  ) => {
    const stepLabels = {
      prepare: "Prepare Overview",
      sample: "Sample Data",
      analyze: "Analyze Data",
      calc: "Extract Calc Fields",
      overview: "Generate Overview MD",
    };
    const label = stepLabels[step];
    const jobId = `val-pipeline-${step}-${domain}-${Date.now()}`;
    addJob({
      id: jobId,
      name: `${label}: ${domain}/${tableName}`,
      status: "running",
      message: `Running ${label.toLowerCase()}...`,
    });

    const callbacks = {
      onSuccess: (data: { status: string; message: string; duration_ms: number }) => {
        updateJob(jobId, {
          status: "completed",
          message: `${data.message} (${(data.duration_ms / 1000).toFixed(1)}s)`,
        });
        outputStatusQuery.refetch();
      },
      onError: (err: unknown) => {
        updateJob(jobId, { status: "failed", message: String(err) });
      },
    };

    switch (step) {
      case "prepare":
        prepareOverviewMutation.mutate({ domain, tableName, overwrite: false, skipSql: false }, callbacks);
        break;
      case "sample":
        sampleDataMutation.mutate({ domain, tableName, overwrite: false }, callbacks);
        break;
      case "analyze":
        analyzeDataMutation.mutate({ domain, tableName, overwrite: false }, callbacks);
        break;
      case "calc":
        extractCalcFieldsMutation.mutate({ domain, tableName, overwrite: false }, callbacks);
        break;
      case "overview":
        generateOverviewMdMutation.mutate({ domain, tableName, overwrite: false }, callbacks);
        break;
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "files", label: "Files" },
    { id: "sync", label: "Sync" },
    { id: "history", label: "History" },
  ];

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
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
          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-500"
        >
          <X size={16} />
        </button>
      </div>

      {/* Tabs */}
      <div className="px-4 border-b border-slate-200 dark:border-zinc-800 flex gap-4">
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

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === "overview" && (
          <div className="space-y-4">
            {/* Review Data Models action */}
            {onReviewDataModels && (
              <button
                onClick={onReviewDataModels}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <ClipboardCheck size={16} />
                Review Data Models
              </button>
            )}

            {/* Credentials section */}
            <div>
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Credentials
              </label>
              <div className="mt-1 p-3 rounded border border-slate-200 dark:border-zinc-800 space-y-2">
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
                      className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded transition-colors"
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
                      className="w-full px-3 py-1.5 text-sm border border-slate-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                      autoFocus
                    />
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={credPassword}
                        onChange={(e) => setCredPassword(e.target.value)}
                        placeholder="Password"
                        className="w-full px-3 py-1.5 pr-8 text-sm border border-slate-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
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
              <div className="mt-1 p-3 rounded border border-slate-200 dark:border-zinc-800 space-y-2">
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
                      className="p-2 rounded border border-slate-200 dark:border-zinc-800 flex items-center justify-between"
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
                      className="p-2 rounded border border-slate-200 dark:border-zinc-800 flex items-center justify-between"
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
                      className="flex items-center gap-2 p-2 text-left rounded border border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-900 disabled:opacity-50 transition-colors"
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

            {/* Divider */}
            <div className="border-t border-slate-200 dark:border-zinc-800 my-4" />

            {/* Table Documentation Pipeline */}
            <div>
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Table Documentation Pipeline
              </label>
              <p className="text-[10px] text-zinc-400 mt-0.5 mb-2">
                Generate overview.md files for tables in data_models/
              </p>

              {/* Table selection dropdown */}
              <div className="flex gap-2 mb-3">
                <div className="relative flex-1">
                  <select
                    value={pipelineTableName}
                    onChange={(e) => setPipelineTableName(e.target.value)}
                    disabled={domainTablesQuery.isLoading}
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 appearance-none cursor-pointer pr-8 disabled:opacity-50"
                  >
                    <option value="all">All Tables ({domainTablesQuery.data?.length || 0})</option>
                    {domainTablesQuery.data?.map((table) => (
                      <option key={table.id} value={table.id}>
                        {table.display_name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
                  />
                </div>
                <button
                  onClick={handleRunFullPipeline}
                  disabled={isPipelineRunning || !pipelineTableName.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded text-sm font-medium transition-colors"
                >
                  {runPipelineMutation.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <FileCode size={14} />
                  )}
                  Run Pipeline
                </button>
              </div>

              {/* Pipeline result */}
              {runPipelineMutation.isSuccess && (
                <PipelineResultView data={runPipelineMutation.data} />
              )}
              {runPipelineMutation.isError && (
                <p className="mb-3 text-xs text-red-500">
                  {(runPipelineMutation.error as Error).message}
                </p>
              )}

              {/* Individual pipeline steps */}
              <div className="grid grid-cols-1 gap-1.5">
                {[
                  { step: "prepare" as const, label: "1. Prepare Overview", icon: Database, desc: "definition_details.json" },
                  { step: "sample" as const, label: "2. Sample Data", icon: Database, desc: "definition_sample.json" },
                  { step: "analyze" as const, label: "3. Analyze (AI)", icon: Sparkles, desc: "definition_analysis.json" },
                  { step: "calc" as const, label: "4. Extract Calc Fields", icon: Calculator, desc: "definition_calculated_fields.json" },
                  { step: "overview" as const, label: "5. Generate MD", icon: FileOutput, desc: "overview.md" },
                ].map(({ step, label, icon: Icon, desc }) => (
                  <button
                    key={step}
                    onClick={() => handlePipelineStep(step, pipelineTableName)}
                    disabled={isPipelineRunning || !pipelineTableName.trim()}
                    className="flex items-center gap-2 p-2 text-left rounded border border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-900 disabled:opacity-50 transition-colors"
                  >
                    <Icon size={14} className="text-purple-500 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="text-sm text-zinc-700 dark:text-zinc-300 block">
                        {label}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {desc}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "history" && (
          <div className="space-y-1">
            {metadata && metadata.history.length > 0 ? (
              [...metadata.history].reverse().map((entry, i) => (
                <div
                  key={i}
                  className="p-2 rounded border border-slate-200 dark:border-zinc-800 flex items-start gap-2"
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
              <p className="text-sm text-zinc-500">No sync history yet</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Format a timestamp as relative time */
function timeAgo(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

/** Files tab showing output status grouped by category */
function FilesTab({ outputs, isLoading }: { outputs: OutputFileStatus[]; isLoading: boolean }) {
  const { openPanel } = useSidePanelStore();

  function handleOpenFile(output: OutputFileStatus) {
    if (!output.exists || output.is_folder) return;
    openPanel(output.path, output.name);
  }
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={24} className="text-zinc-400 animate-spin" />
      </div>
    );
  }

  if (outputs.length === 0) {
    return (
      <p className="text-sm text-zinc-500">No output files configured</p>
    );
  }

  // Group outputs by category
  const byCategory = new Map<string, OutputFileStatus[]>();
  for (const output of outputs) {
    const list = byCategory.get(output.category) ?? [];
    list.push(output);
    byCategory.set(output.category, list);
  }

  // Category order
  const categoryOrder = ["Schema Sync", "Extractions", "Monitoring", "Analytics", "Health Checks"];
  const sortedCategories = [...byCategory.keys()].sort(
    (a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b)
  );

  return (
    <div className="space-y-4">
      {sortedCategories.map((category) => {
        const items = byCategory.get(category) ?? [];
        const existsCount = items.filter((o) => o.exists).length;
        return (
          <div key={category}>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                {category}
              </label>
              <span className="text-[10px] text-zinc-400">
                {existsCount}/{items.length} exist
              </span>
            </div>
            <div className="space-y-1">
              {items.map((output) => (
                <div
                  key={output.relative_path}
                  onClick={() => handleOpenFile(output)}
                  className={cn(
                    "p-2 rounded border flex items-start gap-2",
                    output.exists && !output.is_folder
                      ? "border-slate-200 dark:border-zinc-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-900"
                      : output.exists
                      ? "border-slate-200 dark:border-zinc-800"
                      : "border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-900/10"
                  )}
                  title={output.exists && !output.is_folder ? "Click to view in side panel" : undefined}
                >
                  {output.is_folder ? (
                    <Folder size={14} className={cn(
                      "mt-0.5 flex-shrink-0",
                      output.exists ? "text-amber-500" : "text-zinc-300"
                    )} />
                  ) : (
                    <FileText size={14} className={cn(
                      "mt-0.5 flex-shrink-0",
                      output.exists ? "text-blue-500" : "text-zinc-300"
                    )} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        "text-sm font-medium",
                        output.exists
                          ? "text-zinc-700 dark:text-zinc-300"
                          : "text-zinc-400"
                      )}>
                        {output.name}
                      </span>
                      {output.exists ? (
                        <CheckCircle2 size={12} className="text-green-500 flex-shrink-0" />
                      ) : (
                        <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                          <AlertCircle size={10} />
                          Missing
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-zinc-400 font-mono truncate" title={output.path}>
                        {output.relative_path}
                      </span>
                      <span className="text-[9px] px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 whitespace-nowrap">
                        {output.created_by}
                      </span>
                    </div>
                    {output.exists && (
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-400">
                        {output.modified && (
                          <span className="flex items-center gap-0.5">
                            <Clock size={9} />
                            {timeAgo(output.modified)}
                          </span>
                        )}
                        {output.is_folder && output.item_count !== null && (
                          <span>{output.item_count} items</span>
                        )}
                        {!output.is_folder && output.size !== null && (
                          <span>{formatSize(output.size)}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Pipeline result view with generated files */
function PipelineResultView({ data }: { data: import("../../hooks/useValSync").PipelineRunResult }) {
  const { openPanel } = useSidePanelStore();
  const [expanded, setExpanded] = useState(false);

  // Collect all output files from all tables
  const allFiles = data.results.flatMap((r) => r.output_files);
  const hasFiles = allFiles.length > 0;

  return (
    <div className="mb-3 rounded border border-purple-200 dark:border-purple-800/50 bg-purple-500/10 overflow-hidden">
      {/* Summary header - clickable to expand */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-2 text-left hover:bg-purple-500/10 transition-colors"
      >
        <CheckCircle2 size={14} className="text-purple-600 dark:text-purple-400 flex-shrink-0" />
        <span className="text-xs text-purple-600 dark:text-purple-400 flex-1">
          {data.tables_processed} tables processed, {data.tables_skipped} skipped, {data.tables_errored} errors
          <span className="text-purple-400 dark:text-purple-500 ml-1">
            ({(data.total_duration_ms / 1000).toFixed(1)}s)
          </span>
        </span>
        {hasFiles && (
          <span className="text-[10px] text-purple-500 dark:text-purple-400">
            {expanded ? "▼" : "▶"} {allFiles.length} files
          </span>
        )}
      </button>

      {/* Expanded file list */}
      {expanded && hasFiles && (
        <div className="border-t border-purple-200 dark:border-purple-800/50 p-2 space-y-2">
          {data.results.filter((r) => r.output_files.length > 0).map((result) => (
            <div key={result.table_name}>
              <div className="text-[10px] font-medium text-purple-600 dark:text-purple-400 mb-1">
                {result.table_name}
              </div>
              <div className="space-y-0.5">
                {result.output_files.map((filePath) => {
                  const fileName = filePath.split("/").pop() || filePath;
                  const isOverview = fileName === "overview.md";
                  return (
                    <button
                      key={filePath}
                      onClick={() => openPanel(filePath, fileName)}
                      className={cn(
                        "w-full flex items-center gap-1.5 px-2 py-1 text-left rounded text-xs transition-colors",
                        isOverview
                          ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/50"
                          : "text-zinc-600 dark:text-zinc-400 hover:bg-purple-100 dark:hover:bg-purple-900/20"
                      )}
                    >
                      {isOverview ? (
                        <FileOutput size={12} className="flex-shrink-0" />
                      ) : (
                        <FileCode size={12} className="flex-shrink-0" />
                      )}
                      <span className="truncate font-mono">{fileName}</span>
                      {isOverview && (
                        <span className="ml-auto text-[9px] opacity-70">View</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Format file size */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
