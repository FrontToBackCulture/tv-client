// Settings view for toggling background sync (email, calendar)
// + server-side cron jobs (VAL syncs via Edge Functions)
// All local syncs are disabled by default — user must explicitly enable them.
// Server syncs run on pg_cron and can be toggled from here.

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { Cloud, Monitor, ChevronDown, ChevronRight, AlertCircle, CheckCircle, Clock } from "lucide-react";

// ─── Local (client-side) syncs ────────────────

const SYNC_TOGGLES = [
  {
    key: "bg_sync_outlook_email",
    label: "Outlook Email Sync",
    description: "Sync emails from Outlook every 5 minutes",
  },
  {
    key: "bg_sync_outlook_calendar",
    label: "Outlook Calendar Sync",
    description: "Sync calendar events from Outlook every 5 minutes",
  },
] as const;

type SyncKey = (typeof SYNC_TOGGLES)[number]["key"];

// ─── Server-side cron jobs ────────────────────

interface CronJob {
  jobname: string;
  schedule: string;
  active: boolean;
}

const CRON_LABELS: Record<string, { label: string; description: string }> = {
  "shared-inbox-sync": {
    label: "Shared Inbox Sync",
    description: "Sync val@thinkval.com emails daily at 08:50 SGT",
  },
  "val-sync-workflows": {
    label: "VAL Workflow Definitions",
    description: "Sync workflow definitions from all domains daily at 09:10 SGT",
  },
  "val-sync-executions": {
    label: "VAL Executions & Notifications",
    description: "Sync workflow executions and notification stream daily at 09:05 SGT",
  },
  "val-parse-error-emails": {
    label: "VAL Error Email Parser",
    description: "Parse importer and integration errors from inbox daily at 08:55 SGT",
  },
  "ingest-public-data": {
    label: "Public Data Sync",
    description: "Ingest MCF job postings and other public datasets daily at 09:14 SGT",
  },
  "notion-sync": {
    label: "Notion Task Sync",
    description: "Sync Notion databases to Work Module daily at 08:45 SGT",
  },
  "val-sync-sod-tables": {
    label: "VAL SOD Table Status",
    description: "Sync SOD calculation status for eligible domains daily at 08:40 SGT",
  },
  "val-sync-drive-files": {
    label: "VAL Drive Files Check",
    description: "Check Drive for unprocessed files across all domains daily at 09:00 SGT",
  },
  "ga4-sync": {
    label: "GA4 Analytics Sync",
    description: "Sync Google Analytics 4 platform and website data daily at 09:15 SGT",
  },
};

function formatSchedule(cron: string): string {
  // All jobs run daily before 9am SGT (UTC+8)
  const dailyMatch = cron.match(/^(\d+) (\d+) \* \* \*$/);
  if (dailyMatch) {
    const min = parseInt(dailyMatch[1]);
    const utcHour = parseInt(dailyMatch[2]);
    const sgtHour = (utcHour + 8) % 24;
    return `Daily ${String(sgtHour).padStart(2, "0")}:${String(min).padStart(2, "0")} SGT`;
  }
  return cron;
}

function useCronJobs() {
  return useQuery({
    queryKey: ["cron-jobs"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_cron_jobs");
      if (error) {
        console.error("[BackgroundSync] Failed to fetch cron jobs:", error.message);
        return [] as CronJob[];
      }
      return (data || []) as CronJob[];
    },
    staleTime: 30_000,
  });
}

// ─── Component ────────────────────────────────

export function BackgroundSyncView() {
  const [values, setValues] = useState<Record<SyncKey, boolean>>({
    bg_sync_outlook_email: false,
    bg_sync_outlook_calendar: false,
  });
  const [loading, setLoading] = useState(true);
  const cronQuery = useCronJobs();

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const result = { ...values };
    for (const toggle of SYNC_TOGGLES) {
      const val = await invoke<string | null>("settings_get_key", {
        keyName: toggle.key,
      }).catch(() => null);
      result[toggle.key] = val === "true";
    }
    setValues(result);
    setLoading(false);
  }

  async function toggle(key: SyncKey) {
    const newValue = !values[key];
    setValues((prev) => ({ ...prev, [key]: newValue }));
    await invoke("settings_set_key", {
      keyName: key,
      value: newValue ? "true" : "false",
    });
  }

  const cronJobs = cronQuery.data || [];
  const syncRunsQuery = useQuery({
    queryKey: ["sync-run-history"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_sync_run_history", { max_rows: 200 });
      if (error) {
        console.error("[BackgroundSync] Failed to fetch run history:", error.message);
        return [];
      }
      return (data || []) as Array<{
        source: string;
        job_name: string;
        status: string;
        error: string | null;
        started_at: string;
        completed_at: string | null;
        duration_secs: number | null;
        details: Record<string, unknown> | null;
      }>;
    },
    staleTime: 30_000,
  });
  const allSyncRuns = syncRunsQuery.data || [];
  const [showLatestOnly, setShowLatestOnly] = useState(true);
  const syncRuns = showLatestOnly
    ? Object.values(
        allSyncRuns.reduce<Record<string, (typeof allSyncRuns)[number]>>((acc, run) => {
          const key = `${run.source}:${run.job_name}`;
          if (!acc[key]) acc[key] = run;
          return acc;
        }, {})
      )
    : allSyncRuns;
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Background Sync
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Manage automatic background syncing. Local syncs run on this device.
          Server syncs run on Supabase infrastructure.
        </p>
      </div>

      {/* Local syncs */}
      <div>
        <div className="flex items-center gap-2 mb-2 px-1">
          <Monitor className="w-4 h-4 text-zinc-400" />
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Local Syncs</h3>
          <span className="text-xs text-zinc-400">Runs on this device</span>
        </div>
        <div className="space-y-1">
          {SYNC_TOGGLES.map((item) => {
            const enabled = values[item.key];
            return (
              <label
                key={item.key}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {item.label}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {item.description}
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  disabled={loading}
                  onClick={() => toggle(item.key)}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ml-3 ${
                    enabled
                      ? "bg-teal-600"
                      : "bg-zinc-300 dark:bg-zinc-600"
                  } ${loading ? "opacity-50" : ""}`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white dark:bg-zinc-200 transition-transform ${
                      enabled ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </label>
            );
          })}
        </div>
      </div>

      {/* Server syncs */}
      <div>
        <div className="flex items-center gap-2 mb-2 px-1">
          <Cloud className="w-4 h-4 text-zinc-400" />
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Server Syncs</h3>
          <span className="text-xs text-zinc-400">Runs on Supabase (pg_cron)</span>
        </div>
        <div className="space-y-1">
          {cronJobs.length === 0 && !cronQuery.isLoading && (
            <div className="px-3 py-2.5 text-sm text-zinc-400">
              No server sync jobs found. Cron jobs may require database permissions to view.
            </div>
          )}
          {cronJobs.map((job) => {
            const meta = CRON_LABELS[job.jobname];
            return (
              <div
                key={job.jobname}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {meta?.label || job.jobname}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {meta?.description || job.schedule}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3 shrink-0">
                  <span className="text-xs text-zinc-400 font-mono">
                    {formatSchedule(job.schedule)}
                  </span>
                  <span
                    className={`inline-flex h-2 w-2 rounded-full ${
                      job.active ? "bg-green-500" : "bg-zinc-400"
                    }`}
                    title={job.active ? "Active" : "Paused"}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sync Run History */}
      <div>
        <div className="flex items-center gap-2 mb-2 px-1">
          <Clock className="w-4 h-4 text-zinc-400" />
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Recent Sync Runs</h3>
          <span className="text-xs text-zinc-400">
            {showLatestOnly ? `${syncRuns.length} jobs — latest run each` : `Last ${allSyncRuns.length} runs`}
          </span>
          <button
            onClick={() => setShowLatestOnly(!showLatestOnly)}
            className="ml-auto text-xs text-blue-500 hover:text-blue-400 transition-colors"
          >
            {showLatestOnly ? "Show all runs" : "Show latest only"}
          </button>
        </div>
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                <th className="text-left px-3 py-2 text-xs font-semibold text-zinc-500 w-8"></th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-zinc-500">Source</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-zinc-500">Job</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-zinc-500">Status</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-zinc-500">Started (SGT)</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-zinc-500">Duration</th>
              </tr>
            </thead>
            <tbody>
              {syncRuns.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-4 text-center text-zinc-400">No sync runs recorded yet</td></tr>
              )}
              {syncRuns.map((run, idx) => {
                const runKey = `${run.source}:${run.job_name}:${run.started_at}:${idx}`;
                const isExpanded = expandedRun === runKey;
                const hasError = run.status === "failed" || (run.error && run.error.length > 0);
                const durationStr = run.duration_secs != null ? (run.duration_secs < 60 ? `${Math.round(run.duration_secs)}s` : `${Math.round(run.duration_secs / 60)}m`) : "-";
                const startSGT = new Date(run.started_at).toLocaleString("en-SG", { timeZone: "Asia/Singapore", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
                const sourceLabel = run.source === "local" ? "Local" : "Server";
                const sourceBg = run.source === "local" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" : "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300";
                // Resolve friendly name
                const friendlyName = CRON_LABELS[run.job_name]?.label || run.job_name;

                // Skip server-detail rows (they duplicate server cron rows with more detail)
                // Show them only in expanded view
                if (run.source === "server-detail") return null;

                return (
                  <tr key={runKey} className="group">
                    <td colSpan={6} className="p-0">
                      <button
                        onClick={() => setExpandedRun(isExpanded ? null : runKey)}
                        className={`w-full flex items-center text-left px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800/50 ${hasError ? "bg-red-50/50 dark:bg-red-950/10" : ""}`}
                      >
                        <span className="w-8 shrink-0">
                          {(run.error || run.details) ? (
                            isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-zinc-400" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                          ) : <span className="w-3.5" />}
                        </span>
                        <span className="flex-1 min-w-0 flex items-center gap-3">
                          <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold ${sourceBg}`}>{sourceLabel}</span>
                          <span className="w-48 shrink-0 text-xs text-zinc-700 dark:text-zinc-300 truncate" title={run.job_name}>{friendlyName}</span>
                          <span className="w-20 shrink-0">
                            {(run.status === "succeeded" || (run.status === "completed" && !hasError)) && <span className="inline-flex items-center gap-1 text-xs text-green-600"><CheckCircle className="w-3 h-3" /> OK</span>}
                            {run.status === "completed" && hasError && <span className="inline-flex items-center gap-1 text-xs text-yellow-600"><AlertCircle className="w-3 h-3" /> Partial</span>}
                            {run.status === "failed" && <span className="inline-flex items-center gap-1 text-xs text-red-600"><AlertCircle className="w-3 h-3" /> Failed</span>}
                            {run.status === "running" && <span className="inline-flex items-center gap-1 text-xs text-blue-600"><Clock className="w-3 h-3" /> Running</span>}
                          </span>
                          <span className="w-36 shrink-0 text-xs text-zinc-500">{startSGT}</span>
                          <span className="w-14 shrink-0 text-xs text-zinc-400">{durationStr}</span>
                        </span>
                      </button>
                      {isExpanded && (run.error || run.details) && (
                        <div className="px-11 py-3 bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 space-y-2">
                          {run.error && (
                            <div>
                              <div className="text-xs font-semibold text-red-600 mb-1">Error</div>
                              <div className="text-xs font-mono bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 p-2 rounded break-all max-h-40 overflow-y-auto">
                                {run.error}
                              </div>
                            </div>
                          )}
                          {run.details && (
                            <div>
                              <div className="text-xs font-semibold text-zinc-500 mb-1">Details</div>
                              <div className="text-xs font-mono bg-zinc-100 dark:bg-zinc-900 p-2 rounded break-all max-h-48 overflow-y-auto whitespace-pre-wrap">
                                {JSON.stringify(run.details, null, 2)}
                              </div>
                            </div>
                          )}
                          {run.completed_at && (
                            <div className="text-xs text-zinc-400">
                              Completed: {new Date(run.completed_at).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
