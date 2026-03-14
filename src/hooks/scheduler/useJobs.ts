import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { schedulerKeys } from "./keys";
import { useFolderConfig } from "../useKnowledgePaths";

// ============================================================================
// Types (match Rust structs)
// ============================================================================

export type RunStatus = "running" | "success" | "failed";
export type RunTrigger = "scheduled" | "manual";

export interface SkillRef {
  bot: string;
  slug: string;
  title: string;
}

export interface SchedulerJob {
  id: string;
  name: string;
  skillPrompt: string;
  cronExpression: string;
  model: string;
  maxBudget: number | null;
  allowedTools: string[];
  slackWebhookUrl: string | null;
  slackChannelName: string | null;
  enabled: boolean;
  generateReport: boolean;
  reportPrefix: string | null;
  skillRefs: SkillRef[] | null;
  botPath: string | null;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  lastRunStatus: RunStatus | null;
}

export interface JobInput {
  name: string;
  skillPrompt: string;
  cronExpression: string;
  model?: string;
  maxBudget?: number | null;
  allowedTools?: string[];
  slackWebhookUrl?: string | null;
  slackChannelName?: string | null;
  enabled?: boolean;
  generateReport?: boolean;
  reportPrefix?: string | null;
  skillRefs?: SkillRef[] | null;
  botPath?: string | null;
}

export interface SchedulerStatus {
  totalJobs: number;
  enabledJobs: number;
  runningJobs: number;
  lastCheckAt: string | null;
}

// ============================================================================
// Query hooks
// ============================================================================

export function useJobs() {
  return useQuery({
    queryKey: schedulerKeys.jobs(),
    queryFn: () => invoke<SchedulerJob[]>("scheduler_list_jobs"),
    staleTime: 1000 * 10,
  });
}

export function useJob(id: string | null) {
  return useQuery({
    queryKey: schedulerKeys.job(id ?? ""),
    queryFn: () => invoke<SchedulerJob>("scheduler_get_job", { id }),
    enabled: !!id,
  });
}

export function useSchedulerStatus() {
  return useQuery({
    queryKey: schedulerKeys.status(),
    queryFn: () => invoke<SchedulerStatus>("scheduler_get_status"),
    staleTime: 1000 * 30,
  });
}

// ============================================================================
// Mutation hooks
// ============================================================================

export function useCreateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: JobInput) =>
      invoke<SchedulerJob>("scheduler_create_job", { input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: schedulerKeys.jobs() });
      qc.invalidateQueries({ queryKey: schedulerKeys.status() });
    },
  });
}

export function useUpdateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: JobInput }) =>
      invoke<SchedulerJob>("scheduler_update_job", { id, input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: schedulerKeys.jobs() });
    },
  });
}

export function useDeleteJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      invoke<void>("scheduler_delete_job", { id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: schedulerKeys.jobs() });
      qc.invalidateQueries({ queryKey: schedulerKeys.status() });
    },
  });
}

export function useToggleJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      invoke<SchedulerJob>("scheduler_toggle_job", { id, enabled }),
    onMutate: async ({ id, enabled }) => {
      await qc.cancelQueries({ queryKey: schedulerKeys.jobs() });
      qc.setQueryData<SchedulerJob[]>(schedulerKeys.jobs(), (old) =>
        old?.map((j) => (j.id === id ? { ...j, enabled } : j))
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: schedulerKeys.jobs() });
      qc.invalidateQueries({ queryKey: schedulerKeys.status() });
    },
  });
}

export function useRunJob() {
  const qc = useQueryClient();
  const folderConfig = useFolderConfig();
  return useMutation({
    mutationFn: (id: string) =>
      invoke<string>("scheduler_run_job", { id, defaultReportsFolder: `${folderConfig.platform}/sod-reports` }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: schedulerKeys.jobs() });
      qc.invalidateQueries({ queryKey: schedulerKeys.status() });
    },
  });
}

export function useStopJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) =>
      invoke<void>("scheduler_stop_job", { runId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: schedulerKeys.jobs() });
      qc.invalidateQueries({ queryKey: schedulerKeys.status() });
    },
  });
}
