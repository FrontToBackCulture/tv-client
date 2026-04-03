// Header bar above the canvas — name, toggle, run button, last run info

import { useState } from "react";
import { Play, Loader2, Square, Trash2 } from "lucide-react";
import { useRunJob, useStopJob, useRunningJobsStore, useToggleAutomation, useUpdateAutomation, useDeleteAutomation } from "@/hooks/scheduler";
import { cn } from "@/lib/cn";
import type { AutomationGraph } from "./types";

interface Props {
  automation: AutomationGraph;
  onDeleted: () => void;
}

export function AutomationCanvasHeader({ automation, onDeleted }: Props) {
  const runJob = useRunJob();
  const stopJob = useStopJob();
  const toggleAutomation = useToggleAutomation();
  const updateAutomation = useUpdateAutomation();
  const deleteAutomation = useDeleteAutomation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const runningInfo = useRunningJobsStore((s) =>
    automation.job_id ? s.runningJobs[automation.job_id] : undefined
  );
  const isRunning = !!runningInfo || automation.last_run_status === "running";

  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(automation.name);

  function saveName() {
    setEditingName(false);
    if (name.trim() && name !== automation.name) {
      updateAutomation.mutate({ id: automation.id, name: name.trim() });
    }
  }

  function handleRun() {
    if (automation.job_id) {
      runJob.mutate(automation.job_id);
    }
    // DIO automations run via triggerDioAutomation (handled at the view level)
  }

  function handleStop() {
    if (runningInfo?.runId) {
      stopJob.mutate(runningInfo.runId);
    }
  }

  const lastRunDate = automation.last_run_at
    ? new Date(automation.last_run_at).toLocaleString("en-SG", {
        timeZone: "Asia/Singapore",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Never";

  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
      {/* Left: name + type badge */}
      <div className="flex items-center gap-3 min-w-0">
        {editingName ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") { setName(automation.name); setEditingName(false); } }}
            className="text-sm font-medium bg-transparent border-b border-teal-500 outline-none text-zinc-900 dark:text-zinc-100 px-0 py-0"
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            className="text-sm font-medium text-zinc-900 dark:text-zinc-100 hover:text-teal-600 dark:hover:text-teal-400 transition-colors truncate"
          >
            {automation.name}
          </button>
        )}
        <span className={cn(
          "text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wide",
          automation.automation_type === "dio"
            ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
            : "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400",
        )}>
          {automation.automation_type}
        </span>

        {/* Enable toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={automation.enabled}
          onClick={() => toggleAutomation.mutate({
            id: automation.id,
            enabled: !automation.enabled,
            job_id: automation.job_id,
            dio_id: automation.dio_id,
          })}
          className={cn(
            "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors",
            automation.enabled ? "bg-teal-600" : "bg-zinc-300 dark:bg-zinc-600",
          )}
        >
          <span className={cn(
            "inline-block h-3 w-3 rounded-full bg-white transition-transform",
            automation.enabled ? "translate-x-3.5" : "translate-x-0.5",
          )} />
        </button>

        {/* Delete */}
        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                deleteAutomation.mutate(
                  { id: automation.id, job_id: automation.job_id, dio_id: automation.dio_id },
                  { onSuccess: () => onDeleted() },
                );
                setConfirmDelete(false);
              }}
              className="text-[10px] px-1.5 py-0.5 rounded bg-red-600 text-white hover:bg-red-500"
            >
              Delete
            </button>
            <button onClick={() => setConfirmDelete(false)} className="text-[10px] px-1.5 py-0.5 rounded text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="p-1 text-zinc-400 hover:text-red-500 transition-colors" title="Delete automation">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Right: run info + actions */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">Last: {lastRunDate}</span>

        {automation.last_run_status && !isRunning && (
          <span className={cn(
            "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
            automation.last_run_status === "success" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
            automation.last_run_status === "failed" && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
          )}>
            {automation.last_run_status}
          </span>
        )}

        {isRunning && runningInfo?.runId && (
          <button
            onClick={handleStop}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          >
            <Square size={10} className="fill-current" /> Stop
          </button>
        )}

        <button
          onClick={handleRun}
          disabled={isRunning}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isRunning ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
          {isRunning ? "Running..." : "Run now"}
        </button>
      </div>
    </div>
  );
}
