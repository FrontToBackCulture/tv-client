// Centered modal listing all background jobs with full progress detail.
// Replaces the small status-bar popup for users who need to actually read
// long messages or step-by-step logs (Sync Tables, Refresh Drift, etc.).

import { useState, useMemo, useEffect, memo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CheckCircle2, XCircle, Loader2, X, Trash2, StopCircle, Search } from "lucide-react";
import { cn } from "../lib/cn";
import { useJobsStore, useRecentJobs, type BackgroundJob } from "../stores/jobsStore";

interface JobsModalProps {
  onClose: () => void;
}

export function JobsModal({ onClose }: JobsModalProps) {
  const jobs = useRecentJobs(50);
  const removeJob = useJobsStore((s) => s.removeJob);
  const clearCompleted = useJobsStore((s) => s.clearCompleted);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "running" | "completed" | "failed">("all");

  const visibleJobs = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return jobs.filter((j) => {
      if (statusFilter !== "all" && j.status !== statusFilter) return false;
      if (!f) return true;
      return (
        j.name.toLowerCase().includes(f) ||
        j.message?.toLowerCase().includes(f) ||
        j.log?.some((e) => e.message.toLowerCase().includes(f))
      );
    });
  }, [jobs, filter, statusFilter]);

  const counts = useMemo(() => ({
    all: jobs.length,
    running: jobs.filter((j) => j.status === "running").length,
    completed: jobs.filter((j) => j.status === "completed").length,
    failed: jobs.filter((j) => j.status === "failed").length,
  }), [jobs]);

  // ESC key closes the modal. Standard escape hatch when the X button or
  // backdrop click feels unreachable (e.g., user is at the keyboard).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    // Backdrop click closes — but only when the click lands on the backdrop
    // itself, not bubbled from inside the panel. The previous "-z-10
    // click-outside div" pattern is broken because it sits behind the modal
    // panel in the same stacking context, so clicks on the dimmed area
    // never reach it.
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl border border-zinc-200 dark:border-zinc-800 w-[80vw] max-w-4xl h-[80vh] flex flex-col animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Background Jobs</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={clearCompleted}
              className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <Trash2 size={12} />
              Clear completed
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Filter / status tabs */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-200 dark:border-zinc-800">
          <div className="relative flex-1 max-w-md">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Filter by name, message, log…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800">
            {(["all", "running", "completed", "failed"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors capitalize",
                  statusFilter === s
                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200",
                )}
              >
                {s} <span className="text-zinc-400">{counts[s]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Body — list of expanded job cards */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2">
          {visibleJobs.length === 0 ? (
            <div className="text-center py-12 text-zinc-400 text-sm">
              {jobs.length === 0 ? "No recent jobs" : "No jobs match this filter"}
            </div>
          ) : (
            visibleJobs.map((job) => <JobCardMemo key={job.id} job={job} jobId={job.id} removeJob={removeJob} />)
          )}
        </div>
      </div>
    </div>
  );
}

// Wrapper around JobCard that takes (jobId, removeJob) as stable props so
// React.memo can short-circuit re-renders when other jobs in the list update.
// Without this, every silent progress tick re-renders all 20+ JobCards in the
// modal — the cause of the UI getting unresponsive during long syncs.
const JobCardMemo = memo(function JobCardMemo({
  job,
  jobId,
  removeJob,
}: {
  job: BackgroundJob;
  jobId: string;
  removeJob: (id: string) => void;
}) {
  const onRemove = useCallback(() => removeJob(jobId), [removeJob, jobId]);
  return <JobCard job={job} onRemove={onRemove} />;
});

function JobCard({ job, onRemove }: { job: BackgroundJob; onRemove: () => void }) {
  const elapsed = job.completedAt
    ? (job.completedAt.getTime() - job.startedAt.getTime()) / 1000
    : (Date.now() - job.startedAt.getTime()) / 1000;

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-900/50">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          {job.status === "running" && <Loader2 size={14} className="animate-spin text-teal-500 flex-shrink-0 mt-0.5" />}
          {job.status === "completed" && <CheckCircle2 size={14} className="text-green-500 flex-shrink-0 mt-0.5" />}
          {job.status === "failed" && <XCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate" title={job.name}>
              {job.name}
            </div>
            {job.message && (
              <div className="text-xs text-zinc-500 mt-0.5 break-words whitespace-pre-wrap">
                {job.message}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[10px] text-zinc-400 font-mono">
            {elapsed >= 60 ? `${(elapsed / 60).toFixed(1)}m` : `${elapsed.toFixed(1)}s`}
          </span>
          {job.status === "running" ? (
            <button
              onClick={async () => {
                try {
                  await invoke("claude_run_cancel", { runId: job.id });
                  useJobsStore.getState().updateJob(job.id, { status: "failed", message: "Cancelled" });
                } catch {
                  // Run already finished
                }
              }}
              className="text-zinc-400 hover:text-red-500"
              title="Cancel"
            >
              <StopCircle size={14} />
            </button>
          ) : (
            <button onClick={onRemove} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {job.status === "running" && job.progress !== undefined && (
        <div className="px-3 pt-2">
          <div className="h-1 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
            <div className="h-full bg-teal-500 transition-all duration-300" style={{ width: `${job.progress}%` }} />
          </div>
        </div>
      )}

      {/* Log timeline */}
      {job.log && job.log.length > 0 && (
        <div className="max-h-72 overflow-y-auto bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800">
          <ul className="text-[11px] font-mono leading-snug py-1">
            {job.log.map((entry, idx) => (
              <li
                key={idx}
                className={cn(
                  "px-3 py-0.5 flex gap-3",
                  entry.kind === "error" && "text-red-600 dark:text-red-400",
                  entry.kind === "warn" && "text-amber-600 dark:text-amber-400",
                  entry.kind !== "error" && entry.kind !== "warn" && "text-zinc-600 dark:text-zinc-300",
                )}
              >
                <span className="text-zinc-400 dark:text-zinc-500 w-14 text-right flex-shrink-0">
                  +{(entry.t / 1000).toFixed(1)}s
                </span>
                <span className="break-words whitespace-pre-wrap min-w-0 flex-1">{entry.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
