import { useState, useCallback, useEffect, useRef } from "react";
import { List, History, Radio, LucideIcon, Upload, Download, Loader2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  useJobs,
  useRuns,
  useCreateJob,
  useUpdateJob,
  useDeleteJob,
  useToggleJob,
  useRunJob,
  useStopJob,
  useSchedulerEvents,
  schedulerKeys,
  type SchedulerJob,
  type JobInput,
} from "../../hooks/scheduler";
import { useQueryClient } from "@tanstack/react-query";
import { JobList } from "./JobList";
import { JobForm } from "./JobForm";
import { JobDetail } from "./JobDetail";
import { RunHistory } from "./RunHistory";
import { ApiTaskLogs } from "./ApiTaskLogs";
import { useViewContextStore } from "../../stores/viewContextStore";
import { ApiTasksBanner } from "./ApiTasksBanner";

type SchedulerView = "jobs" | "history" | "api-logs";

export function SchedulerModule() {
  const [view, setView] = useState<SchedulerView>("jobs");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingJob, setEditingJob] = useState<SchedulerJob | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [ioBusy, setIoBusy] = useState(false);
  const qc = useQueryClient();

  // Report view context for help bot
  const setViewContext = useViewContextStore((s) => s.setView);
  useEffect(() => {
    const labels: Record<SchedulerView, string> = { jobs: "Jobs", history: "History", "api-logs": "API Logs" };
    setViewContext(view, labels[view]);
  }, [view, setViewContext]);

  // Subscribe to Tauri events for live updates
  useSchedulerEvents();

  // Data
  const { data: jobs = [] } = useJobs();
  const { data: allRuns = [], isLoading: runsLoading } = useRuns(
    view === "history" ? undefined : selectedJobId ?? undefined,
    view === "history" ? 200 : 10
  );

  // Mutations
  const createJob = useCreateJob();
  const updateJob = useUpdateJob();
  const deleteJob = useDeleteJob();
  const toggleJob = useToggleJob();
  const runJob = useRunJob();
  const stopJob = useStopJob();

  const selectedJob = jobs.find((j) => j.id === selectedJobId) ?? null;
  const selectedRuns = selectedJobId
    ? allRuns.filter((r) => r.jobId === selectedJobId)
    : allRuns;

  const handleCreateOrUpdate = useCallback(
    (input: JobInput) => {
      if (editingJob) {
        updateJob.mutate(
          { id: editingJob.id, input },
          { onSuccess: () => { setShowForm(false); setEditingJob(null); } }
        );
      } else {
        createJob.mutate(input, {
          onSuccess: () => { setShowForm(false); },
        });
      }
    },
    [editingJob, createJob, updateJob]
  );

  const handleEdit = useCallback((job: SchedulerJob) => {
    setEditingJob(job);
    setShowForm(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setShowForm(false);
    setEditingJob(null);
  }, []);

  const handleExport = useCallback(async () => {
    try {
      const filePath = await save({
        title: "Export scheduler jobs",
        defaultPath: "tv-desktop-jobs.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!filePath) return;
      setIoBusy(true);
      setToast(null);
      const count = await invoke<number>("scheduler_export_jobs", { filePath });
      setToast({ type: "success", text: `Exported ${count} job${count !== 1 ? "s" : ""}` });
    } catch (e) {
      setToast({ type: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setIoBusy(false);
    }
  }, []);

  const handleImport = useCallback(async () => {
    try {
      const filePath = await open({
        title: "Import scheduler jobs",
        filters: [{ name: "JSON", extensions: ["json"] }],
        multiple: false,
      });
      if (!filePath) return;
      setIoBusy(true);
      setToast(null);
      const count = await invoke<number>("scheduler_import_jobs", { filePath: filePath as string });
      qc.invalidateQueries({ queryKey: schedulerKeys.jobs() });
      qc.invalidateQueries({ queryKey: schedulerKeys.status() });
      setToast({ type: "success", text: `Imported ${count} job${count !== 1 ? "s" : ""} (disabled)` });
    } catch (e) {
      setToast({ type: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setIoBusy(false);
    }
  }, [qc]);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Tab bar */}
      <div className="flex-shrink-0 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/50 px-4">
        <div className="flex items-center">
          <ViewTab
            label="Jobs"
            icon={List}
            active={view === "jobs"}
            onClick={() => { setView("jobs"); setSelectedJobId(null); }}
          />
          <ViewTab
            label="History"
            icon={History}
            active={view === "history"}
            onClick={() => { setView("history"); setSelectedJobId(null); }}
          />
          <ViewTab
            label="API Logs"
            icon={Radio}
            active={view === "api-logs"}
            onClick={() => { setView("api-logs"); setSelectedJobId(null); }}
          />
        </div>
        <div className="flex items-center gap-2 pr-1">
          <button
            onClick={handleImport}
            disabled={ioBusy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50"
            title="Import jobs from JSON file"
          >
            {ioBusy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            Import
          </button>
          <button
            onClick={handleExport}
            disabled={ioBusy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50"
            title="Export all jobs to JSON file"
          >
            {ioBusy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            Export
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`mx-4 mt-2 p-2.5 rounded-lg text-xs border cursor-pointer ${
            toast.type === "success"
              ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400"
              : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
          }`}
          onClick={() => setToast(null)}
        >
          {toast.text}
        </div>
      )}

      {/* API tasks banner (Slack-triggered skills) */}
      <ApiTasksBanner />

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {view === "jobs" && (
          selectedJob ? (
            <ResizableJobsLayout
              sidebar={
                <JobList
                  jobs={jobs}
                  selectedJobId={selectedJobId}
                  onSelect={setSelectedJobId}
                  onToggle={(id, enabled) => toggleJob.mutate({ id, enabled })}
                  onRunNow={(id) => runJob.mutate(id)}
                  onEdit={handleEdit}
                  onDelete={(id) => {
                    deleteJob.mutate(id);
                    if (selectedJobId === id) setSelectedJobId(null);
                  }}
                  onAddNew={() => { setEditingJob(null); setShowForm(true); }}
                  compact
                />
              }
              detail={
                <JobDetail
                  job={selectedJob}
                  runs={selectedRuns}
                  onRunNow={(id) => runJob.mutate(id)}
                  onEdit={handleEdit}
                  onStopJob={(runId) => stopJob.mutate(runId)}
                />
              }
            />
          ) : (
            <JobList
              jobs={jobs}
              selectedJobId={selectedJobId}
              onSelect={setSelectedJobId}
              onToggle={(id, enabled) => toggleJob.mutate({ id, enabled })}
              onRunNow={(id) => runJob.mutate(id)}
              onEdit={handleEdit}
              onDelete={(id) => {
                deleteJob.mutate(id);
                if (selectedJobId === id) setSelectedJobId(null);
              }}
              onAddNew={() => { setEditingJob(null); setShowForm(true); }}
            />
          )
        )}

        {view === "history" && (
          <RunHistory runs={allRuns} isLoading={runsLoading} />
        )}

        {view === "api-logs" && (
          <ApiTaskLogs />
        )}
      </div>

      {/* Job form modal */}
      {showForm && (
        <JobForm
          job={editingJob}
          onSubmit={handleCreateOrUpdate}
          onClose={handleCloseForm}
          isLoading={createJob.isPending || updateJob.isPending}
        />
      )}
    </div>
  );
}

// Resizable split layout for jobs sidebar + detail
function ResizableJobsLayout({
  sidebar,
  detail,
}: {
  sidebar: React.ReactNode;
  detail: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = sidebarWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = ev.clientX - startX.current;
      const newWidth = Math.min(Math.max(startWidth.current + delta, 160), 500);
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [sidebarWidth]);

  return (
    <div className="flex-1 flex overflow-hidden">
      <div
        className="flex flex-col overflow-hidden flex-shrink-0"
        style={{ width: sidebarWidth }}
      >
        {sidebar}
      </div>
      <div
        onMouseDown={handleMouseDown}
        className="w-1 flex-shrink-0 cursor-col-resize bg-zinc-100 dark:bg-zinc-800/50 hover:bg-teal-400 dark:hover:bg-teal-600 transition-colors"
      />
      <div className="flex-1 overflow-hidden">
        {detail}
      </div>
    </div>
  );
}

// ViewTab (matches work module pattern)
function ViewTab({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
        active
          ? "border-teal-500 text-teal-600 dark:text-teal-400"
          : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
      }`}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}
