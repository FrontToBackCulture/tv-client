// Jobs View — full page view of all background jobs

import { Activity, CheckCircle2, XCircle, Loader2, Trash2 } from "lucide-react";
import { useJobsStore, type BackgroundJob } from "../../stores/jobsStore";

function formatDuration(start: Date, end?: Date): string {
  const ms = (end || new Date()).getTime() - start.getTime();
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ${secs % 60}s`;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function JobRow({ job }: { job: BackgroundJob }) {
  const isRunning = job.status === "running";
  const isFailed = job.status === "failed";
  const isCompleted = job.status === "completed";

  return (
    <div className={`flex items-center gap-3 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 ${isRunning ? "bg-blue-50/30 dark:bg-blue-900/5" : ""}`}>
      {/* Status icon */}
      {isRunning && <Loader2 size={16} className="text-blue-500 animate-spin flex-shrink-0" />}
      {isCompleted && <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />}
      {isFailed && <XCircle size={16} className="text-red-500 flex-shrink-0" />}

      {/* Job info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{job.name}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
            isRunning ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" :
            isCompleted ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" :
            "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
          }`}>
            {job.status}
          </span>
        </div>
        {job.message && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">{job.message}</p>
        )}
        {job.progress != null && isRunning && (
          <div className="w-48 h-1 bg-zinc-200 dark:bg-zinc-700 rounded-full mt-1 overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${job.progress}%` }} />
          </div>
        )}
      </div>

      {/* Timing */}
      <div className="text-right flex-shrink-0">
        <div className="text-[10px] text-zinc-400">{formatTime(job.startedAt)}</div>
        <div className="text-[10px] text-zinc-500 font-medium">
          {formatDuration(job.startedAt, job.completedAt)}
        </div>
      </div>
    </div>
  );
}

export function JobsView() {
  const jobs = useJobsStore((s) => s.jobs);
  const clearCompleted = useJobsStore((s) => s.clearCompleted);

  const running = jobs.filter(j => j.status === "running");
  const completed = jobs.filter(j => j.status === "completed");
  const failed = jobs.filter(j => j.status === "failed");

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={20} className="text-zinc-500" />
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Background Jobs</h3>
          <span className="text-xs text-zinc-400">{jobs.length} total</span>
        </div>
        {(completed.length > 0 || failed.length > 0) && (
          <button
            onClick={clearCompleted}
            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          >
            <Trash2 size={12} />
            Clear completed
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-xs">
          <Loader2 size={12} className={running.length > 0 ? "text-blue-500 animate-spin" : "text-zinc-300"} />
          <span className="text-zinc-500">{running.length} running</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <CheckCircle2 size={12} className={completed.length > 0 ? "text-emerald-500" : "text-zinc-300"} />
          <span className="text-zinc-500">{completed.length} completed</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <XCircle size={12} className={failed.length > 0 ? "text-red-500" : "text-zinc-300"} />
          <span className="text-zinc-500">{failed.length} failed</span>
        </div>
      </div>

      {/* Job list */}
      {jobs.length === 0 ? (
        <div className="text-center py-12 text-sm text-zinc-400">
          No jobs yet. Jobs appear here when you run syncs, triage, or other background operations.
        </div>
      ) : (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
          {/* Running first, then failed, then completed */}
          {[...running, ...failed, ...completed].map(job => (
            <JobRow key={job.id} job={job} />
          ))}
        </div>
      )}

      <p className="text-[10px] text-zinc-400">
        Jobs are persisted to the database. Showing jobs from the last hour.
      </p>
    </div>
  );
}
