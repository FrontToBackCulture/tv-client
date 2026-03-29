import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "@/lib/supabase";
import { schedulerKeys } from "./keys";
import { useFolderConfig } from "../useKnowledgePaths";

// ============================================================================
// Types
// ============================================================================

export type RunStatus = "running" | "success" | "failed";
export type RunTrigger = "scheduled" | "manual";

export interface SkillRef {
  bot: string;
  slug: string;
  title: string;
}

export interface Job {
  id: string;
  name: string;
  skill_prompt: string;
  cron_expression: string | null;
  model: string;
  max_budget: number | null;
  allowed_tools: string[];
  slack_webhook_url: string | null;
  slack_channel_name: string | null;
  enabled: boolean;
  generate_report: boolean;
  report_prefix: string | null;
  skill_refs: SkillRef[] | null;
  bot_path: string | null;
  sod_reports_folder: string | null;
  created_at: string;
  updated_at: string;
  last_run_at: string | null;
  last_run_status: RunStatus | null;
}

/** Backward-compatible alias */
export type SchedulerJob = Job;

export interface JobInput {
  name: string;
  skill_prompt: string;
  cron_expression?: string | null;
  model?: string;
  max_budget?: number | null;
  allowed_tools?: string[];
  slack_webhook_url?: string | null;
  slack_channel_name?: string | null;
  enabled?: boolean;
  generate_report?: boolean;
  report_prefix?: string | null;
  skill_refs?: SkillRef[] | null;
  bot_path?: string | null;
  sod_reports_folder?: string | null;
}

export interface SchedulerStatus {
  totalJobs: number;
  enabledJobs: number;
  runningJobs: number;
  lastCheckAt: string | null;
}

// ============================================================================
// Query hooks (Supabase direct)
// ============================================================================

export function useJobs() {
  return useQuery({
    queryKey: schedulerKeys.jobs(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Job[];
    },
    staleTime: 1000 * 10,
  });
}

export function useJob(id: string | null) {
  return useQuery({
    queryKey: schedulerKeys.job(id ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as Job;
    },
    enabled: !!id,
  });
}

export function useSchedulerStatus() {
  return useQuery({
    queryKey: schedulerKeys.status(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("enabled, last_run_status");
      if (error) throw error;
      const jobs = data ?? [];
      return {
        totalJobs: jobs.length,
        enabledJobs: jobs.filter((j) => j.enabled).length,
        runningJobs: jobs.filter((j) => j.last_run_status === "running").length,
        lastCheckAt: null,
      } as SchedulerStatus;
    },
    staleTime: 1000 * 30,
  });
}

// ============================================================================
// Mutation hooks (Supabase direct for CRUD, Tauri for execution)
// ============================================================================

export function useCreateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: JobInput) => {
      const now = new Date().toISOString();
      const job = {
        id: crypto.randomUUID(),
        name: input.name,
        skill_prompt: input.skill_prompt,
        cron_expression: input.cron_expression ?? null,
        model: input.model ?? "sonnet",
        max_budget: input.max_budget ?? null,
        allowed_tools: input.allowed_tools ?? [],
        slack_webhook_url: input.slack_webhook_url ?? null,
        slack_channel_name: input.slack_channel_name ?? null,
        enabled: input.enabled ?? true,
        generate_report: input.generate_report ?? true,
        report_prefix: input.report_prefix ?? null,
        skill_refs: input.skill_refs ?? null,
        bot_path: input.bot_path ?? null,
        sod_reports_folder: input.sod_reports_folder ?? null,
        created_at: now,
        updated_at: now,
        last_run_at: null,
        last_run_status: null,
      };
      const { data, error } = await supabase
        .from("jobs")
        .insert(job)
        .select()
        .single();
      if (error) throw error;
      return data as Job;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: schedulerKeys.jobs() });
      qc.invalidateQueries({ queryKey: schedulerKeys.status() });
    },
  });
}

export function useUpdateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: JobInput }) => {
      const updates: Record<string, unknown> = {
        name: input.name,
        skill_prompt: input.skill_prompt,
        cron_expression: input.cron_expression ?? null,
        updated_at: new Date().toISOString(),
      };
      if (input.model !== undefined) updates.model = input.model;
      if (input.max_budget !== undefined) updates.max_budget = input.max_budget;
      if (input.allowed_tools !== undefined) updates.allowed_tools = input.allowed_tools;
      if (input.slack_webhook_url !== undefined) updates.slack_webhook_url = input.slack_webhook_url;
      if (input.slack_channel_name !== undefined) updates.slack_channel_name = input.slack_channel_name;
      if (input.enabled !== undefined) updates.enabled = input.enabled;
      if (input.generate_report !== undefined) updates.generate_report = input.generate_report;
      if (input.report_prefix !== undefined) updates.report_prefix = input.report_prefix;
      if (input.skill_refs !== undefined) updates.skill_refs = input.skill_refs;
      if (input.bot_path !== undefined) updates.bot_path = input.bot_path;
      if (input.sod_reports_folder !== undefined) updates.sod_reports_folder = input.sod_reports_folder;

      const { data, error } = await supabase
        .from("jobs")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Job;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: schedulerKeys.jobs() });
    },
  });
}

export function useDeleteJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("jobs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: schedulerKeys.jobs() });
      qc.invalidateQueries({ queryKey: schedulerKeys.status() });
    },
  });
}

export function useToggleJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { data, error } = await supabase
        .from("jobs")
        .update({ enabled, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Job;
    },
    onMutate: async ({ id, enabled }) => {
      await qc.cancelQueries({ queryKey: schedulerKeys.jobs() });
      qc.setQueryData<Job[]>(schedulerKeys.jobs(), (old) =>
        old?.map((j) => (j.id === id ? { ...j, enabled } : j))
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: schedulerKeys.jobs() });
      qc.invalidateQueries({ queryKey: schedulerKeys.status() });
    },
  });
}

// Run & Stop still go through Tauri (they spawn local processes)
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
