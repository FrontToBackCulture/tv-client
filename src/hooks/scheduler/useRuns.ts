import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { schedulerKeys } from "./keys";

export interface JobRun {
  id: string;
  jobId: string;
  jobName: string;
  startedAt: string;
  finishedAt: string | null;
  durationSecs: number | null;
  status: "running" | "success" | "failed";
  output: string;
  outputPreview: string;
  error: string | null;
  slackPosted: boolean;
  trigger: "scheduled" | "manual";
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheCreationTokens: number | null;
  numTurns: number | null;
}

export function useRuns(jobId?: string, limit?: number) {
  return useQuery({
    queryKey: schedulerKeys.runs(jobId),
    queryFn: () =>
      invoke<JobRun[]>("scheduler_list_runs", {
        jobId: jobId ?? null,
        limit: limit ?? 100,
      }),
    staleTime: 1000 * 5,
  });
}

export function useRun(jobId: string | null, runId: string | null) {
  return useQuery({
    queryKey: schedulerKeys.run(jobId ?? "", runId ?? ""),
    queryFn: () =>
      invoke<JobRun>("scheduler_get_run", { runId }),
    enabled: !!runId,
  });
}

export interface ToolDetail {
  name: string;
  target: string;
}

export interface RunStep {
  turnNumber: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  tools: string[];
  toolDetails: ToolDetail[];
  stopReason: string;
}

export function useRunSteps(runId: string | null) {
  return useQuery({
    queryKey: schedulerKeys.runSteps(runId ?? ""),
    queryFn: () =>
      invoke<RunStep[]>("scheduler_get_run_steps", { runId }),
    enabled: !!runId,
    staleTime: 1000 * 60,
  });
}
