// src/shell/StatusBar.tsx

import { useState, useRef, useEffect } from "react";
import { useAppStore } from "../stores/appStore";
import { useJobsStore, useRunningJobs, useRecentJobs } from "../stores/jobsStore";
import { cn } from "../lib/cn";
import { Sun, Moon, Loader2, CheckCircle2, XCircle, X, Trash2, Download, FlaskConical } from "lucide-react";
import { useAppUpdate } from "../hooks/useAppUpdate";

export function StatusBar() {
  const { syncStatus, theme, toggleTheme, playgroundMode, togglePlayground } = useAppStore();
  const runningJobs = useRunningJobs();
  const recentJobs = useRecentJobs(10);
  const clearCompleted = useJobsStore((s) => s.clearCompleted);
  const removeJob = useJobsStore((s) => s.removeJob);

  const { updateAvailable, version: updateVersion, downloading, installed, progress, error: updateError, installUpdate } = useAppUpdate();
  const [showJobsPanel, setShowJobsPanel] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close panel on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowJobsPanel(false);
      }
    }
    if (showJobsPanel) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showJobsPanel]);

  const hasJobs = recentJobs.length > 0;
  const hasRunning = runningJobs.length > 0;

  return (
    <div className="h-6 bg-slate-100 dark:bg-zinc-900 border-t border-slate-200 dark:border-zinc-800 flex items-center px-3 text-xs text-zinc-500 relative">
      <div className="flex items-center gap-4">
        <span>TV Desktop v0.4.7</span>
        {installed && (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
            <CheckCircle2 size={10} />
            <span>v{updateVersion} installed — restart to finish</span>
          </span>
        )}
        {updateAvailable && !downloading && !installed && (
          <button
            onClick={installUpdate}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 hover:bg-teal-200 dark:hover:bg-teal-900/50 transition-colors"
          >
            <Download size={10} />
            <span>Update {updateVersion}</span>
          </button>
        )}
        {downloading && (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400">
            <Loader2 size={10} className="animate-spin" />
            <span>Updating{progress > 0 ? ` ${progress}%` : "..."}</span>
          </span>
        )}
        {updateError && (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 max-w-xs truncate" title={updateError}>
            <XCircle size={10} />
            <span className="truncate">{updateError}</span>
          </span>
        )}
        {syncStatus !== "idle" && (
          <span className="flex items-center gap-1">
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                syncStatus === "syncing" && "bg-yellow-500 animate-pulse",
                syncStatus === "synced" && "bg-green-500",
                syncStatus === "error" && "bg-red-500"
              )}
            />
            {syncStatus === "syncing" && "Syncing..."}
            {syncStatus === "synced" && "Synced"}
            {syncStatus === "error" && "Sync error"}
          </span>
        )}
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-4">
        {/* Background Jobs Indicator - always visible */}
        <div className="relative" ref={panelRef}>
            <button
              onClick={() => setShowJobsPanel(!showJobsPanel)}
              className={cn(
                "flex items-center gap-1.5 px-2 py-0.5 rounded transition-colors",
                hasRunning
                  ? "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
                  : "hover:bg-slate-200 dark:hover:bg-zinc-800"
              )}
            >
              {hasRunning ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  <span>
                    {runningJobs.length} job{runningJobs.length > 1 ? "s" : ""} running
                  </span>
                </>
              ) : hasJobs ? (
                <>
                  <CheckCircle2 size={12} className="text-green-500" />
                  <span>Jobs</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={12} className="text-zinc-400" />
                  <span>Jobs</span>
                </>
              )}
            </button>

            {/* Jobs Panel */}
            {showJobsPanel && (
              <div className="absolute bottom-full right-0 mb-1 w-96 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg shadow-lg overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-zinc-700">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    Background Jobs
                  </span>
                  <button
                    onClick={clearCompleted}
                    className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 flex items-center gap-1"
                  >
                    <Trash2 size={10} />
                    Clear completed
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {recentJobs.length === 0 ? (
                    <div className="px-3 py-4 text-center text-zinc-400">
                      No recent jobs
                    </div>
                  ) : (
                    recentJobs.map((job) => (
                      <div
                        key={job.id}
                        className="px-3 py-2 border-b border-slate-100 dark:border-zinc-800 last:border-0 hover:bg-slate-50 dark:hover:bg-zinc-800/50"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {job.status === "running" && (
                              <Loader2
                                size={14}
                                className="animate-spin text-teal-500 flex-shrink-0"
                              />
                            )}
                            {job.status === "completed" && (
                              <CheckCircle2
                                size={14}
                                className="text-green-500 flex-shrink-0"
                              />
                            )}
                            {job.status === "failed" && (
                              <XCircle
                                size={14}
                                className="text-red-500 flex-shrink-0"
                              />
                            )}
                            <span className="truncate text-zinc-700 dark:text-zinc-200" title={job.name}>
                              {job.name}
                            </span>
                          </div>
                          {job.status !== "running" && (
                            <button
                              onClick={() => removeJob(job.id)}
                              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 flex-shrink-0"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                        {job.message && (
                          <p className="mt-1 text-xs text-zinc-500 pl-6 break-words" title={job.message}>
                            {job.message}
                          </p>
                        )}
                        {job.status === "running" && job.progress !== undefined && (
                          <div className="mt-1.5 pl-6">
                            <div className="h-1 bg-slate-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-teal-500 transition-all duration-300"
                                style={{ width: `${job.progress}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

        {/* Playground toggle */}
        <button
          onClick={togglePlayground}
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded transition-colors",
            playgroundMode
              ? "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400"
              : "hover:bg-slate-200 dark:hover:bg-zinc-800 text-zinc-400"
          )}
          title={`${playgroundMode ? "Exit" : "Enter"} playground mode (⇧⌘X)`}
        >
          <FlaskConical size={11} />
          <span>{playgroundMode ? "Playground" : "Playground"}</span>
        </button>

        <span>⌘K for commands</span>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 transition-colors"
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? (
            <>
              <Moon size={12} className="text-zinc-400" />
              <span className="text-zinc-400">Dark</span>
            </>
          ) : (
            <>
              <Sun size={12} className="text-amber-500" />
              <span className="text-zinc-600">Light</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
