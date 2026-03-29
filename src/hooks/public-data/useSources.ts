import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { publicDataKeys } from "./keys";
import { useJobsStore } from "../../stores/jobsStore";
import type { DataSource, IngestionResult } from "../../lib/public-data/types";

export function useSources(domain?: string) {
  return useQuery({
    queryKey: [...publicDataKeys.sources(), domain],
    queryFn: async (): Promise<DataSource[]> => {
      let query = supabase
        .schema("public_data")
        .from("sources")
        .select("*")
        .order("priority")
        .order("name");
      if (domain) query = query.eq("domain", domain);
      const { data, error } = await query;
      if (error) throw new Error(`Failed to fetch sources: ${error.message}`);
      return (data ?? []) as DataSource[];
    },
  });
}

export function useSource(id: string | null) {
  return useQuery({
    queryKey: publicDataKeys.source(id || ""),
    queryFn: async (): Promise<DataSource | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .schema("public_data")
        .from("sources")
        .select("*")
        .eq("id", id)
        .single();
      if (error?.code === "PGRST116") return null;
      if (error) throw new Error(`Failed to fetch source: ${error.message}`);
      return data as DataSource;
    },
    enabled: !!id,
  });
}

export function useSyncSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (source: { id: string; name: string }): Promise<Record<string, IngestionResult>> => {
      const jobId = `public-data-${source.id}-${Date.now()}`;
      const { addJob, updateJob } = useJobsStore.getState();

      addJob({ id: jobId, name: `Sync ${source.name}`, status: "running", message: "Fetching from source API..." });

      try {
        const { data, error } = await supabase.functions.invoke("ingest-public-data", {
          body: { source_id: source.id },
        });
        if (error) throw new Error(error.message);

        const result = data.results?.[source.id];
        if (result?.status === "error") {
          updateJob(jobId, { status: "failed", message: result.error });
        } else {
          updateJob(jobId, {
            status: "completed",
            message: `${result?.rows?.toLocaleString() ?? 0} rows synced`,
          });
        }
        return data.results;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        updateJob(jobId, { status: "failed", message: msg });
        throw err;
      }
    },
    onMutate: async (source) => {
      queryClient.setQueryData(
        publicDataKeys.sources(),
        (old: DataSource[] | undefined) =>
          old?.map((s) => (s.id === source.id ? { ...s, sync_status: "running" as const } : s))
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: publicDataKeys.sources() });
      queryClient.invalidateQueries({ queryKey: publicDataKeys.logs() });
    },
  });
}

export function useSyncAllP1() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<Record<string, IngestionResult>> => {
      const jobId = `public-data-all-${Date.now()}`;
      const { addJob, updateJob } = useJobsStore.getState();

      addJob({ id: jobId, name: "Sync All Sources", status: "running", message: "Running ingestion..." });

      try {
        const { data, error } = await supabase.functions.invoke("ingest-public-data", {
          body: { source_id: "all" },
        });
        if (error) throw new Error(error.message);

        const results = data.results as Record<string, IngestionResult>;
        const succeeded = Object.values(results).filter((r) => r.status === "success").length;
        const failed = Object.values(results).filter((r) => r.status === "error").length;
        const totalRows = Object.values(results).reduce((sum, r) => sum + (r.rows || 0), 0);

        if (failed > 0) {
          updateJob(jobId, {
            status: "failed",
            message: `${succeeded} succeeded, ${failed} failed — ${totalRows.toLocaleString()} rows total`,
          });
        } else {
          updateJob(jobId, {
            status: "completed",
            message: `${succeeded} sources synced — ${totalRows.toLocaleString()} rows total`,
          });
        }
        return results;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        updateJob(jobId, { status: "failed", message: msg });
        throw err;
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: publicDataKeys.sources() });
      queryClient.invalidateQueries({ queryKey: publicDataKeys.logs() });
    },
  });
}
