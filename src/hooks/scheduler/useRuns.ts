import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { schedulerKeys } from "./keys";

export interface JobRun {
  id: string;
  job_id: string | null;
  job_name: string;
  automation_id: string | null;
  started_at: string;
  finished_at: string | null;
  duration_secs: number | null;
  status: "running" | "success" | "failed";
  output: string;
  output_preview: string;
  error: string | null;
  trigger: "scheduled" | "manual";
  cost_usd: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_creation_tokens: number | null;
  num_turns: number | null;
}

export function useRuns(jobId?: string, limit?: number) {
  return useQuery({
    queryKey: schedulerKeys.runs(jobId),
    queryFn: async () => {
      let query = supabase
        .from("job_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(limit ?? 100);
      if (jobId) {
        // Match by automation_id OR job_id (legacy)
        query = query.or(`automation_id.eq.${jobId},job_id.eq.${jobId}`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as JobRun[];
    },
    staleTime: 1000 * 5,
  });
}

export function useRun(jobId: string | null, runId: string | null) {
  return useQuery({
    queryKey: schedulerKeys.run(jobId ?? "", runId ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_runs")
        .select("*")
        .eq("id", runId!)
        .single();
      if (error) throw error;
      return data as JobRun;
    },
    enabled: !!runId,
  });
}

export interface ToolDetail {
  name: string;
  target: string;
}

export interface RunStep {
  turn_number: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  tools: string[];
  tool_details: ToolDetail[];
  stop_reason: string;
}

export function useRunSteps(runId: string | null) {
  return useQuery({
    queryKey: schedulerKeys.runSteps(runId ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_run_steps")
        .select("*")
        .eq("run_id", runId!)
        .order("turn_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RunStep[];
    },
    enabled: !!runId,
    staleTime: 1000 * 60,
  });
}
