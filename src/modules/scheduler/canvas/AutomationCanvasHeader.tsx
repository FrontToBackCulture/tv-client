// Header bar above the canvas — name, toggle, run button, last run info

import { useState } from "react";
import { Play, Loader2, Square, Trash2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useToggleAutomation, useUpdateAutomation, useDeleteAutomation, useRunningJobsStore, useStopJob } from "@/hooks/scheduler";
import type { JobRun } from "@/hooks/scheduler";
import { SuggestedSkillsButton } from "./SuggestedSkillsButton";
import { cn } from "@/lib/cn";
import { nextCronRun, formatNextRun } from "@/lib/cron";
import type { AutomationGraph } from "./types";

interface Props {
  automation: AutomationGraph;
  latestRun?: JobRun;
  onDeleted: () => void;
}

export function AutomationCanvasHeader({ automation, latestRun, onDeleted }: Props) {
  const stopJob = useStopJob();
  const toggleAutomation = useToggleAutomation();
  const updateAutomation = useUpdateAutomation();
  const deleteAutomation = useDeleteAutomation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const runningInfo = useRunningJobsStore((s) => s.runningJobs[automation.id]);
  const running = !!runningInfo || automation.last_run_status === "running" || isRunning;

  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(automation.name);
  const [editingDesc, setEditingDesc] = useState(false);
  const [description, setDescription] = useState(automation.description ?? "");

  function saveName() {
    setEditingName(false);
    if (name.trim() && name !== automation.name) {
      updateAutomation.mutate({ id: automation.id, name: name.trim() });
    }
  }

  function saveDescription() {
    setEditingDesc(false);
    const trimmed = description.trim();
    if (trimmed !== (automation.description ?? "")) {
      updateAutomation.mutate({ id: automation.id, description: trimmed || null });
    }
  }

  async function handleRun() {
    setIsRunning(true);
    try {
      await invoke("scheduler_run_automation", {
        automationId: automation.id,
        defaultReportsFolder: "0_Platform/sod-reports",
      });
    } catch (e) {
      console.error("Failed to run automation:", e);
    } finally {
      setIsRunning(false);
    }
  }

  function handleStop() {
    if (runningInfo?.runId) {
      stopJob.mutate(runningInfo.runId);
    }
  }

  const lastRunDate = automation.last_run_at
    ? new Date(automation.last_run_at).toLocaleString("en-SG", {
        timeZone: "Asia/Singapore",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : null;

  const effectiveStatus = latestRun?.status ?? automation.last_run_status;
  const lastRunStatusClass = effectiveStatus === "success" ? "text-emerald-500"
    : effectiveStatus === "failed" ? "text-red-500"
    : "text-zinc-600 dark:text-zinc-300";

  const durationText = latestRun?.duration_secs != null
    ? latestRun.duration_secs < 60
      ? `${Math.round(latestRun.duration_secs)}s`
      : `${Math.floor(latestRun.duration_secs / 60)}m ${Math.round(latestRun.duration_secs % 60)}s`
    : null;

  const nextRunText = automation.enabled && automation.cron_expression
    ? formatNextRun(nextCronRun(automation.cron_expression))
    : null;

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
      {/* Left: Name + description */}
      <div className="flex-1 min-w-0 mr-4">
        <div className="flex items-center gap-2">
          {editingName ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
              className="text-sm font-semibold bg-transparent border-b border-teal-400 outline-none text-zinc-900 dark:text-zinc-100 w-full max-w-[300px]"
            />
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 hover:text-teal-600 dark:hover:text-teal-400 transition-colors truncate max-w-[300px]"
            >
              {automation.name}
            </button>
          )}
        </div>

        {editingDesc ? (
          <input
            autoFocus
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={saveDescription}
            onKeyDown={(e) => e.key === "Enter" && saveDescription()}
            placeholder="Add description..."
            className="text-[11px] bg-transparent border-b border-teal-400 outline-none text-zinc-500 dark:text-zinc-400 w-full max-w-[400px] mt-0.5"
          />
        ) : (
          <button
            onClick={() => setEditingDesc(true)}
            className="text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors truncate max-w-[400px] block"
          >
            {automation.description || "Add description..."}
          </button>
        )}
      </div>

      {/* Center: Metadata items */}
      <div className="flex items-center shrink-0 mr-3">
        {lastRunDate && (
          <div className="flex flex-col items-end text-[10px] px-2.5 border-r border-zinc-100 dark:border-zinc-800">
            <span className="text-zinc-400 dark:text-zinc-500 font-medium">Last run</span>
            <span className={cn("font-semibold font-mono text-[11px]", lastRunStatusClass)}>{lastRunDate}</span>
          </div>
        )}
        {durationText && (
          <div className="flex flex-col items-end text-[10px] px-2.5 border-r border-zinc-100 dark:border-zinc-800">
            <span className="text-zinc-400 dark:text-zinc-500 font-medium">Duration</span>
            <span className="font-semibold font-mono text-[11px] text-zinc-900 dark:text-zinc-100">{durationText}</span>
          </div>
        )}
        {nextRunText && (
          <div className="flex flex-col items-end text-[10px] px-2.5">
            <span className="text-zinc-400 dark:text-zinc-500 font-medium">Next</span>
            <span className="font-semibold font-mono text-[11px] text-zinc-900 dark:text-zinc-100">{nextRunText}</span>
          </div>
        )}
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-2 shrink-0">
        <SuggestedSkillsButton automationId={automation.id} currentSkills={automation.suggested_skills ?? []} />

        {/* Enable/disable toggle */}
        <button
          onClick={() => toggleAutomation.mutate({ id: automation.id, enabled: !automation.enabled })}
          className={cn(
            "relative w-8 h-4 rounded-full transition-colors",
            automation.enabled ? "bg-teal-500" : "bg-zinc-300 dark:bg-zinc-700",
          )}
        >
          <span className={cn(
            "absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform",
            automation.enabled ? "left-[18px]" : "left-0.5",
          )} />
        </button>

        {/* Run / Stop */}
        {running ? (
          <button
            onClick={handleStop}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors"
          >
            <Square size={10} />
            Stop
          </button>
        ) : (
          <button
            onClick={handleRun}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-teal-500 text-white hover:bg-teal-600 transition-colors"
          >
            {isRunning ? <Loader2 size={12} className="animate-spin" /> : <Play size={10} />}
            {isRunning ? "Running..." : "Run"}
          </button>
        )}

        {/* Delete */}
        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                deleteAutomation.mutate({ id: automation.id });
                onDeleted();
              }}
              className="px-2 py-1 text-[10px] rounded bg-red-500 text-white hover:bg-red-600"
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-2 py-1 text-[10px] rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
