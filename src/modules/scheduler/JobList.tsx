import { useState, useEffect } from "react";
import { Play, Pencil, Trash2, ToggleLeft, ToggleRight, Loader2, Plus } from "lucide-react";
import type { SchedulerJob } from "../../hooks/scheduler";
import { useRunningJobsStore } from "../../hooks/scheduler";
import { cn } from "../../lib/cn";
import { Button, IconButton } from "../../components/ui";

interface JobListProps {
  jobs: SchedulerJob[];
  selectedJobId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onRunNow: (id: string) => void;
  onEdit: (job: SchedulerJob) => void;
  onDelete: (id: string) => void;
  onAddNew?: () => void;
  compact?: boolean;
}

export function JobList({
  jobs,
  selectedJobId,
  onSelect,
  onToggle,
  onRunNow,
  onEdit,
  onDelete,
  onAddNew,
  compact,
}: JobListProps) {
  if (jobs.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-sm text-zinc-400 dark:text-zinc-500">
        No scheduled jobs yet.
        {onAddNew && (
          <Button icon={Plus} onClick={onAddNew}>
            New Job
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {jobs.map((job) => (
          <JobRow
            key={job.id}
            job={job}
            isSelected={selectedJobId === job.id}
            onSelect={onSelect}
            onToggle={onToggle}
            onRunNow={onRunNow}
            onEdit={onEdit}
            onDelete={onDelete}
            compact={compact}
          />
        ))}
      </div>
      {onAddNew && (
        <div className="flex-shrink-0 p-2 border-t border-zinc-100 dark:border-zinc-800">
          <Button variant="ghost" icon={Plus} onClick={onAddNew} className="w-full justify-center">
            New Job
          </Button>
        </div>
      )}
    </div>
  );
}

function JobRow({
  job,
  isSelected,
  onSelect,
  onToggle,
  onRunNow,
  onEdit,
  onDelete,
  compact,
}: {
  job: SchedulerJob;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onRunNow: (id: string) => void;
  onEdit: (job: SchedulerJob) => void;
  onDelete: (id: string) => void;
  compact?: boolean;
}) {
  const runningInfo = useRunningJobsStore((s) => s.runningJobs[job.id]);
  const isRunning = !!runningInfo || job.last_run_status === "running";

  if (compact) {
    return (
      <div
        onClick={() => onSelect(job.id)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 cursor-pointer transition-colors",
          "hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
          isSelected && "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300"
        )}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle(job.id, !job.enabled);
          }}
          className={cn(
            "flex-shrink-0 transition-colors",
            job.enabled ? "text-teal-500" : "text-zinc-300 dark:text-zinc-600"
          )}
          title={job.enabled ? "Disable" : "Enable"}
        >
          {job.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={cn(
              "text-xs font-medium truncate",
              job.enabled
                ? "text-zinc-900 dark:text-zinc-100"
                : "text-zinc-400 dark:text-zinc-500"
            )}>
              {job.name}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">
              {job.cron_expression ? describeCronShort(job.cron_expression) : "ad-hoc"}
            </span>
            {job.skill_refs && job.skill_refs.length > 0 && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                {job.skill_refs.length}sk
              </span>
            )}
            {isRunning ? <RunningBadge startedAt={runningInfo?.startedAt} step={runningInfo?.step} /> : <StatusBadge status={job.last_run_status} />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => onSelect(job.id)}
      className={cn(
        "flex items-center gap-3 px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 cursor-pointer transition-colors",
        "hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
        isSelected && "bg-teal-50 dark:bg-teal-950/30"
      )}
    >
      {/* Toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle(job.id, !job.enabled);
        }}
        className={cn(
          "flex-shrink-0 transition-colors",
          job.enabled ? "text-teal-500" : "text-zinc-300 dark:text-zinc-600"
        )}
        title={job.enabled ? "Disable" : "Enable"}
      >
        {job.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
      </button>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-sm font-medium truncate",
            job.enabled
              ? "text-zinc-900 dark:text-zinc-100"
              : "text-zinc-400 dark:text-zinc-500"
          )}>
            {job.name}
          </span>
          {isRunning ? <RunningBadge startedAt={runningInfo?.startedAt} step={runningInfo?.step} /> : <StatusBadge status={job.last_run_status} />}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">
            {job.cron_expression ? describeCronShort(job.cron_expression) : "ad-hoc"}
          </span>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            {job.model}
          </span>
          {job.skill_refs && job.skill_refs.length > 0 && (
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              {job.skill_refs.length} skill{job.skill_refs.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 flex items-center gap-1">
        {isRunning ? (
          <Loader2 size={14} className="text-blue-500 animate-spin mx-1.5" />
        ) : (
          <IconButton
            icon={Play}
            size={14}
            label="Run Now"
            onClick={(e) => {
              e.stopPropagation();
              onRunNow(job.id);
            }}
          />
        )}
        <IconButton
          icon={Pencil}
          size={14}
          label="Edit"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(job);
          }}
        />
        <IconButton
          icon={Trash2}
          size={14}
          variant="danger"
          label="Delete"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Delete job "${job.name}"?`)) onDelete(job.id);
          }}
        />
      </div>
    </div>
  );
}

/** Animated badge that shows elapsed time and current step */
function RunningBadge({ startedAt, step }: { startedAt?: number; step?: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
      <Loader2 size={10} className="animate-spin" />
      {step || "running"} {startedAt ? formatElapsed(elapsed) : ""}
    </span>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;

  const styles: Record<string, string> = {
    success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    running: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  };

  return (
    <span className={cn("px-1.5 py-0.5 text-xs font-medium rounded-full", styles[status] ?? "")}>
      {status}
    </span>
  );
}

function formatElapsed(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function describeCronShort(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;

  const [min, hour, , , dow] = parts;

  if (min.startsWith("*/")) return `Every ${min.slice(2)}m`;
  if (hour === "*" && min === "0") return "Hourly";

  const h = parseInt(hour);
  const m = parseInt(min) || 0;
  if (isNaN(h)) return expr;

  const ampm = h >= 12 ? "p" : "a";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  let time = `${h12}:${m.toString().padStart(2, "0")}${ampm}`;

  const dowMap: Record<string, string> = {
    "1-5": "wkdays", "*": "daily", "0-6": "daily",
  };
  if (dow !== "*") time += ` ${dowMap[dow] ?? dow}`;
  else time += " daily";

  return time;
}
