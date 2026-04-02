// Activity tab — live job monitor + persisted run history

import { useState } from "react";
import {
  Activity, CheckCircle2, XCircle, Loader2, Trash2,
  Clock, CheckCircle, Slack,
} from "lucide-react";
import { useJobsStore, type BackgroundJob } from "../../stores/jobsStore";
import type { JobRun } from "../../hooks/scheduler";
import { cn } from "../../lib/cn";
import { SectionLoading } from "../../components/ui";

// ---------------------------------------------------------------------------
// Live job monitor (moved from Settings > Jobs)
// ---------------------------------------------------------------------------

function LiveJobs() {
  const jobs = useJobsStore((s) => s.jobs);
  const clearCompleted = useJobsStore((s) => s.clearCompleted);

  const running = jobs.filter((j) => j.status === "running");
  const completed = jobs.filter((j) => j.status === "completed");
  const failed = jobs.filter((j) => j.status === "failed");

  if (jobs.length === 0) return null;

  return (
    <div className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-50 dark:bg-zinc-900/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs">
            <Activity size={12} className="text-zinc-400" />
            <span className="font-medium text-zinc-600 dark:text-zinc-300">Live</span>
          </div>
          <div className="flex items-center gap-3">
            {running.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-blue-500">
                <Loader2 size={10} className="animate-spin" />
                {running.length} running
              </span>
            )}
            {completed.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-500">
                <CheckCircle2 size={10} />
                {completed.length} done
              </span>
            )}
            {failed.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-red-500">
                <XCircle size={10} />
                {failed.length} failed
              </span>
            )}
          </div>
        </div>
        {(completed.length > 0 || failed.length > 0) && (
          <button
            onClick={clearCompleted}
            className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          >
            <Trash2 size={10} />
            Clear
          </button>
        )}
      </div>
      {[...running, ...failed, ...completed].map((job) => (
        <LiveJobRow key={job.id} job={job} />
      ))}
    </div>
  );
}

function LiveJobRow({ job }: { job: BackgroundJob }) {
  const isRunning = job.status === "running";
  const isFailed = job.status === "failed";
  const isCompleted = job.status === "completed";

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800/50 last:border-b-0",
        isRunning && "bg-blue-50/30 dark:bg-blue-900/5"
      )}
    >
      {isRunning && <Loader2 size={14} className="text-blue-500 animate-spin flex-shrink-0" />}
      {isCompleted && <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />}
      {isFailed && <XCircle size={14} className="text-red-500 flex-shrink-0" />}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">
            {job.name}
          </span>
          <span
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded font-medium",
              isRunning && "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
              isCompleted && "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
              isFailed && "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
            )}
          >
            {job.status}
          </span>
        </div>
        {job.message && (
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
            {job.message}
          </p>
        )}
      </div>

      <div className="text-right flex-shrink-0">
        <div className="text-[10px] text-zinc-400">
          {job.startedAt.toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </div>
        <div className="text-[10px] text-zinc-500 font-medium">
          {formatElapsed(job.startedAt, job.completedAt)}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Run history (persisted)
// ---------------------------------------------------------------------------

function RunHistoryList({ runs, isLoading }: { runs: JobRun[]; isLoading: boolean }) {
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  if (isLoading) {
    return <SectionLoading className="flex-1" />;
  }

  if (runs.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-zinc-400">
        No runs recorded yet
      </div>
    );
  }

  return (
    <>
      {runs.map((run) => {
        const isExpanded = expandedRunId === run.id;
        return (
          <div key={run.id} className="border-b border-zinc-100 dark:border-zinc-800/50">
            <button
              onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
            >
              <RunStatusIcon status={run.status} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {run.job_name}
                  </span>
                  <span
                    className={cn(
                      "px-1.5 py-0.5 text-xs font-medium rounded-full",
                      run.trigger === "scheduled"
                        ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    )}
                  >
                    {run.trigger}
                  </span>
                  {run.slack_posted && <Slack size={12} className="text-zinc-400" />}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-zinc-400">
                    {new Date(run.started_at).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}
                  </span>
                  {run.duration_secs != null && (
                    <span className="text-xs text-zinc-400">
                      {formatDurationSecs(run.duration_secs)}
                    </span>
                  )}
                  {run.cost_usd != null && run.cost_usd > 0 && (
                    <span className="text-xs text-zinc-400">${run.cost_usd.toFixed(2)}</span>
                  )}
                </div>
              </div>
            </button>

            {isExpanded && (
              <div className="px-4 pb-3">
                {run.error && (
                  <div className="mb-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-md">
                    <p className="text-xs text-red-600 dark:text-red-400 font-mono whitespace-pre-wrap">
                      {run.error}
                    </p>
                  </div>
                )}
                <div className="p-2 bg-zinc-50 dark:bg-zinc-800 rounded-md max-h-80 overflow-y-auto">
                  <pre className="text-xs text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap font-mono">
                    {run.output || "(no output)"}
                  </pre>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Combined Activity view
// ---------------------------------------------------------------------------

interface ActivityViewProps {
  runs: JobRun[];
  isLoading: boolean;
}

export function ActivityView({ runs, isLoading }: ActivityViewProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <LiveJobs />
        <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            History
          </span>
        </div>
        <RunHistoryList runs={runs} isLoading={isLoading} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function RunStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "success":
      return <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />;
    case "failed":
      return <XCircle size={16} className="text-red-500 flex-shrink-0" />;
    case "running":
      return <Loader2 size={16} className="text-blue-500 animate-spin flex-shrink-0" />;
    default:
      return <Clock size={16} className="text-zinc-400 flex-shrink-0" />;
  }
}

function formatElapsed(start: Date, end?: Date): string {
  const ms = (end || new Date()).getTime() - start.getTime();
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ${secs % 60}s`;
}

function formatDurationSecs(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}
