import { useState, useCallback, useEffect, useRef } from "react";
import { List, History, Radio, LucideIcon } from "lucide-react";
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
  type SchedulerJob,
  type JobInput,
} from "../../hooks/scheduler";
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
      </div>

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
