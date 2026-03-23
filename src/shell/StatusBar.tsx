// src/shell/StatusBar.tsx

import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../stores/appStore";
import { useJobsStore, useRunningJobs, useRecentJobs } from "../stores/jobsStore";
import { cn } from "../lib/cn";
import { Sun, Moon, Loader2, CheckCircle2, XCircle, X, Trash2, Sparkles, PanelRight } from "lucide-react";
import { useSidePanelStore } from "../stores/sidePanelStore";
import { NotificationBell } from "../components/notifications/NotificationBell";
import { useAppUpdate } from "../hooks/useAppUpdate";
import { UpdatePreviewPanel } from "./UpdatePreviewPanel";

interface ClaudeMcpStatus {
  binary_installed: boolean;
  binary_path: string;
  config_exists: boolean;
  config_has_tv_mcp: boolean;
  platform: string;
}

type ClaudeState = "ready" | "partial" | "none";

function useClaudeStatus(): ClaudeState {
  const [state, setState] = useState<ClaudeState>("none");

  useEffect(() => {
    invoke<ClaudeMcpStatus>("claude_mcp_status")
      .then((s) => {
        if (s.binary_installed && s.config_has_tv_mcp) setState("ready");
        else if (s.binary_installed || s.config_has_tv_mcp) setState("partial");
        else setState("none");
      })
      .catch(() => setState("none"));
  }, []);

  return state;
}

export function StatusBar() {
  const syncStatus = useAppStore((s) => s.syncStatus);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const openSettings = useAppStore((s) => s.openSettings);
  const claudeState = useClaudeStatus();
  const runningJobs = useRunningJobs();
  const recentJobs = useRecentJobs(10);
  const clearCompleted = useJobsStore((s) => s.clearCompleted);
  const removeJob = useJobsStore((s) => s.removeJob);

  const sidePanelOpen = useSidePanelStore((s) => s.isOpen);
  const togglePanel = useSidePanelStore((s) => s.togglePanel);
  const activeModule = useAppStore((s) => s.activeModule);
  const { updateAvailable, version: updateVersion, body: updateBody, downloading, installed, progress, error: updateError, installUpdate } = useAppUpdate();
  const [showJobsPanel, setShowJobsPanel] = useState(false);
  const [showUpdatePreview, setShowUpdatePreview] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const updatePanelRef = useRef<HTMLDivElement>(null);

  // Close panels on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowJobsPanel(false);
      }
      if (updatePanelRef.current && !updatePanelRef.current.contains(e.target as Node)) {
        setShowUpdatePreview(false);
      }
    }
    if (showJobsPanel || showUpdatePreview) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showJobsPanel, showUpdatePreview]);

  const hasJobs = recentJobs.length > 0;
  const hasRunning = runningJobs.length > 0;

  return (
    <div className="h-6 bg-zinc-100 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex items-center px-3 text-xs text-zinc-500 relative select-none">
      <div className="flex items-center gap-4">
        <span>TV Desktop v{__APP_VERSION__}</span>
        {import.meta.env.DEV && (
          <span className="px-1.5 py-0.5 rounded text-xs font-bold tracking-wider bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400">
            DEV
          </span>
        )}
        {installed && (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
            <CheckCircle2 size={10} />
            <span>v{updateVersion} installed — restart to finish</span>
          </span>
        )}
        {updateAvailable && !downloading && !installed && (
          <div className="relative" ref={updatePanelRef}>
            <button
              onClick={() => setShowUpdatePreview(!showUpdatePreview)}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 hover:bg-teal-200 dark:hover:bg-teal-900/50 transition-colors"
            >
              <Sparkles size={10} />
              <span>Update {updateVersion}</span>
            </button>
            {showUpdatePreview && (
              <UpdatePreviewPanel
                version={updateVersion!}
                notes={updateBody}
                onInstall={() => { setShowUpdatePreview(false); installUpdate(); }}
                onClose={() => setShowUpdatePreview(false)}
              />
            )}
          </div>
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
        <button
          data-help-id="status-bar-claude"
          onClick={() => openSettings("claude")}
          className="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
          title="Claude Code status — click to open settings"
        >
          <span
            className={cn(
              "w-2 h-2 rounded-full",
              claudeState === "ready" && "bg-green-500",
              claudeState === "partial" && "bg-yellow-500",
              claudeState === "none" && "bg-zinc-400"
            )}
          />
          <span className={cn(
            "text-xs",
            claudeState === "ready" ? "text-zinc-600 dark:text-zinc-400" : "text-zinc-400"
          )}>
            Claude
          </span>
        </button>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-4">
        {/* Background Jobs Indicator - always visible */}
        <div className="relative" ref={panelRef}>
            <button
              data-help-id="status-bar-jobs"
              onClick={() => setShowJobsPanel(!showJobsPanel)}
              className={cn(
                "flex items-center gap-1.5 px-2 py-0.5 rounded transition-colors",
                hasRunning
                  ? "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
                  : "hover:bg-zinc-200 dark:hover:bg-zinc-800"
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
              <div className="absolute bottom-full right-0 mb-1 w-96 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg overflow-hidden animate-modal-in">
                <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-200 dark:border-zinc-700">
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
                        className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
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
                            <div className="h-1 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
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

        <span>⌘K for commands</span>

        {/* Notifications */}
        <NotificationBell variant="statusbar" />

        {/* Doc panel toggle */}
        {activeModule !== "library" && (
          <button
            onClick={togglePanel}
            className={cn(
              "flex items-center gap-1.5 px-1.5 py-0.5 rounded transition-colors",
              sidePanelOpen
                ? "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
                : "hover:bg-zinc-200 dark:hover:bg-zinc-800"
            )}
            title="Toggle Document Panel (⌘.)"
          >
            <PanelRight size={12} />
            <span>Doc Panel</span>
          </button>
        )}

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          data-help-id="status-bar-theme"
          className="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
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
