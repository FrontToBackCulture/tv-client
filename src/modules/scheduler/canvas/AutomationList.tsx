// Left panel — list of all automations, click to load canvas

import { useMemo } from "react";
import { Plus, Loader2, Zap, Copy } from "lucide-react";
import { useCloneAutomation, useRunningJobsStore } from "@/hooks/scheduler";
import type { JobRun } from "@/hooks/scheduler";
import { cn } from "@/lib/cn";
import { nextCronRun, formatNextRun } from "@/lib/cron";
import type { AutomationGraph } from "./types";

interface Props {
  automations: AutomationGraph[];
  allRuns: JobRun[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

/** Group runs by automation_id (or job_id for legacy), return last N per automation */
function useRunsByAutomation(runs: JobRun[], count: number) {
  return useMemo(() => {
    const map: Record<string, JobRun[]> = {};
    for (const run of runs) {
      const key = run.automation_id || run.job_id;
      if (!key) continue;
      if (!map[key]) map[key] = [];
      if (map[key].length < count) map[key].push(run);
    }
    return map;
  }, [runs, count]);
}

function formatLastRun(auto: AutomationGraph, latestRun: JobRun | undefined): string | null {
  if (!auto.last_run_at) return null;
  const d = new Date(auto.last_run_at);
  const time = d.toLocaleString("en-SG", {
    timeZone: "Asia/Singapore",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const duration = latestRun?.duration_secs;
  if (duration != null) {
    const dur = duration < 60 ? `${Math.round(duration)}s` : `${Math.floor(duration / 60)}m`;
    return `${time} (${dur})`;
  }
  return time;
}

function isStuck(auto: AutomationGraph): boolean {
  if (auto.last_run_status !== "running" || !auto.last_run_at) return false;
  return Date.now() - new Date(auto.last_run_at).getTime() > 60 * 60 * 1000; // >1hr
}

export function AutomationList({ automations, allRuns, isLoading, selectedId, onSelect, onNew }: Props) {
  const cloneAutomation = useCloneAutomation();
  const runningJobs = useRunningJobsStore((s) => s.runningJobs);
  const runsByAuto = useRunsByAutomation(allRuns, 5);

  async function handleClone(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    try {
      const newId = await cloneAutomation.mutateAsync(id);
      onSelect(newId);
    } catch (err) {
      console.error("Failed to clone:", err);
    }
  }

  return (
    <div className="w-[260px] flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-200 dark:border-zinc-800">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300 uppercase tracking-wide">
          Automations
        </span>
        <button
          onClick={onNew}
          title="New automation"
          className="p-1 text-zinc-400 hover:text-teal-500 transition-colors"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-1.5">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={16} className="animate-spin text-zinc-400" />
          </div>
        ) : automations.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">No automations yet.</p>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">Click + to create one.</p>
          </div>
        ) : (
          automations.map((auto) => {
            const recentRuns = runsByAuto[auto.id] ?? [];
            const latestRun = recentRuns[0];
            const stuck = isStuck(auto);
            const liveRunning = !!runningJobs[auto.id] || (auto.last_run_status === "running" && !stuck);

            // Derive status from latest run (more reliable than automations table)
            const effectiveStatus = latestRun?.status ?? auto.last_run_status;

            // Determine status
            let statusLabel: string;
            let statusClass: string;
            if (!auto.enabled && !liveRunning) {
              statusLabel = "Disabled";
              statusClass = "text-zinc-400 dark:text-zinc-500";
            } else if (stuck) {
              statusLabel = "Possibly stuck";
              statusClass = "text-amber-500";
            } else if (liveRunning) {
              statusLabel = "Running";
              statusClass = "text-blue-500";
            } else if (effectiveStatus === "success") {
              statusLabel = "Success";
              statusClass = "text-emerald-500";
            } else if (effectiveStatus === "failed") {
              statusLabel = "Failed";
              statusClass = "text-red-500";
            } else {
              statusLabel = "Idle";
              statusClass = "text-zinc-400 dark:text-zinc-500";
            }

            // Next run
            const nextRun = auto.enabled && auto.cron_expression
              ? formatNextRun(nextCronRun(auto.cron_expression))
              : "—";

            const lastRunText = formatLastRun(auto, latestRun);

            return (
              <div
                key={auto.id}
                onClick={() => onSelect(auto.id)}
                className={cn(
                  "group relative w-full text-left px-3 py-2.5 rounded-md mb-0.5 transition-colors cursor-pointer border",
                  selectedId === auto.id
                    ? "bg-teal-500/5 dark:bg-teal-500/8 border-zinc-200 dark:border-zinc-800"
                    : "border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-900/50",
                )}
              >
                {/* Row 1: Icon + Name */}
                <div className="flex items-center gap-2 mb-1.5 pr-6">
                  <div className={cn(
                    "w-[18px] h-[18px] rounded flex items-center justify-center text-[9px] shrink-0",
                    auto.enabled
                      ? "bg-teal-500/10 text-teal-500"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400",
                  )}>
                    <Zap size={10} />
                  </div>
                  <div className={cn(
                    "text-[12.5px] font-semibold truncate",
                    auto.enabled ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-500",
                  )}>
                    {auto.name}
                  </div>
                </div>

                {/* Row 2: Status + last run time */}
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={cn("flex items-center gap-1 text-[10px] font-semibold", statusClass)}>
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full shrink-0",
                      stuck ? "bg-amber-500" :
                      liveRunning ? "bg-blue-500 animate-pulse" :
                      effectiveStatus === "success" ? "bg-emerald-500" :
                      effectiveStatus === "failed" ? "bg-red-500" :
                      "bg-zinc-400 dark:bg-zinc-500",
                    )} />
                    {statusLabel}
                  </span>
                  {lastRunText && (
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono truncate">
                      {lastRunText}
                    </span>
                  )}
                </div>

                {/* Row 3: Next run + trend dots */}
                <div className="flex items-center justify-between">
                  <span className="text-[9.5px] text-zinc-400 dark:text-zinc-500">
                    {auto.enabled ? (auto.cron_expression ? `Next: ${nextRun}` : "Manual") : "—"}
                  </span>
                  <div className="flex gap-[3px] items-center">
                    {(recentRuns.length > 0 ? recentRuns.slice(0, 5) : Array(5).fill(null)).map((run, i) => (
                      <span
                        key={i}
                        className={cn(
                          "w-[5px] h-[5px] rounded-full",
                          !run ? "bg-zinc-300/30 dark:bg-zinc-700/30" :
                          run.status === "success" ? "bg-emerald-400 dark:bg-emerald-500/70" :
                          run.status === "failed" ? "bg-red-400 dark:bg-red-500/70" :
                          "bg-blue-400 dark:bg-blue-500/70",
                        )}
                      />
                    ))}
                  </div>
                </div>

                {/* Clone button */}
                <button
                  onClick={(e) => handleClone(e, auto.id)}
                  disabled={cloneAutomation.isPending}
                  title="Clone automation"
                  className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-teal-500 transition-all"
                >
                  {cloneAutomation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
