// Automations tab — DIO automations (Data → Instruction → Output) + Skill automations

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useCurrentUserId, useUsers } from "../../hooks/work/useUsers";
import {
  triggerDioAutomation,
  DEFAULT_MODEL,
  DEFAULT_SOURCES,
  DEFAULT_THREAD_TITLE_NEW,
} from "../../hooks/chat/useTaskAdvisor";
import { useDioAutomations, useCreateDio } from "../../hooks/chat/useDioAutomations";
import {
  useJobs,
  useCreateJob,
  useUpdateJob,
  useToggleJob,
  useRunJob,
  useStopJob,
  useDeleteJob,
  type Job,
  type JobInput,
} from "../../hooks/scheduler";
import { DioAutomationCard } from "./DioAutomationCard";
import { SkillAutomationCard } from "./SkillAutomationCard";
import { SkillAutomationSheet } from "./SkillAutomationSheet";
import { Button } from "../../components/ui";

export function AutomationsView() {
  const queryClient = useQueryClient();
  const userId = useCurrentUserId();
  const { data: allUsers = [] } = useUsers();
  const userName = allUsers.find((u) => u.id === userId)?.name || "user";

  // DIO automations
  const { data: dioAutomations = [] } = useDioAutomations();
  const createDio = useCreateDio();
  const [runningDioId, setRunningDioId] = useState<string | null>(null);

  async function handleRunDio(id: string) {
    if (!userId) return;
    setRunningDioId(id);
    try {
      await triggerDioAutomation(id, queryClient, userId, userName);
    } finally {
      setRunningDioId(null);
    }
  }

  function handleNewDio() {
    createDio.mutate({
      name: "New Automation",
      description: null,
      enabled: true,
      interval_hours: 2,
      sources: DEFAULT_SOURCES,
      model: DEFAULT_MODEL,
      post_mode: "new_thread",
      thread_title: DEFAULT_THREAD_TITLE_NEW,
    });
  }

  // Skill automations
  const { data: jobs = [] } = useJobs();
  const createJob = useCreateJob();
  const updateJob = useUpdateJob();
  const toggleJob = useToggleJob();
  const runJob = useRunJob();
  const stopJob = useStopJob();
  const deleteJob = useDeleteJob();
  const [showSheet, setShowSheet] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);

  const handleCreateOrUpdateJob = useCallback((input: JobInput) => {
    if (editingJob) {
      updateJob.mutate({ id: editingJob.id, input }, { onSuccess: () => { setShowSheet(false); setEditingJob(null); } });
    } else {
      createJob.mutate(input, { onSuccess: () => setShowSheet(false) });
    }
  }, [editingJob, createJob, updateJob]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-8">
        {/* DIO Automations */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Data → Instruction → Output
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Lightweight automations that gather data, compose a message via Claude, and post to Chat.
              </p>
            </div>
            <Button icon={Plus} onClick={handleNewDio} loading={createDio.isPending}>
              New
            </Button>
          </div>

          {dioAutomations.length === 0 ? (
            <div className="border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg p-8 text-center">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">No automations yet.</p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                Create one to periodically review tasks, deals, emails, or projects and get a check-in in Chat.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {dioAutomations.map((auto) => (
                <DioAutomationCard
                  key={auto.id}
                  automation={auto}
                  onRunNow={handleRunDio}
                  running={runningDioId === auto.id}
                />
              ))}
            </div>
          )}
        </div>

        {/* Skill Automations */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Skill Automations
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Scheduled skills that run via Claude CLI with full MCP tool access.
              </p>
            </div>
            <Button icon={Plus} onClick={() => { setEditingJob(null); setShowSheet(true); }}>
              New
            </Button>
          </div>

          {jobs.length === 0 ? (
            <div className="border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg p-8 text-center">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">No skill automations yet.</p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                Create one to run skills like SOD checks, drive file monitoring, or custom reports on a schedule.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <SkillAutomationCard
                  key={job.id}
                  job={job}
                  onToggle={(id, enabled) => toggleJob.mutate({ id, enabled })}
                  onRunNow={(id) => runJob.mutate(id)}
                  onStop={(runId) => stopJob.mutate(runId)}
                  onEdit={(j) => { setEditingJob(j); setShowSheet(true); }}
                  onDelete={(id) => deleteJob.mutate(id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {showSheet && (
        <SkillAutomationSheet
          job={editingJob}
          onSubmit={handleCreateOrUpdateJob}
          onClose={() => { setShowSheet(false); setEditingJob(null); }}
          isLoading={createJob.isPending || updateJob.isPending}
        />
      )}
    </div>
  );
}
