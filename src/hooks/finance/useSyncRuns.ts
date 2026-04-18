import { useQuery } from "@tanstack/react-query";
import { getSupabaseClient } from "../../lib/supabase";
import { financeKeys } from "./keys";
import type { QboSyncRun } from "../../lib/finance/types";

export function useRecentSyncRuns(limit = 10) {
  return useQuery({
    queryKey: [...financeKeys.syncRuns(), limit],
    queryFn: async (): Promise<QboSyncRun[]> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("qbo_sync_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(`Failed to fetch sync runs: ${error.message}`);
      return data ?? [];
    },
    refetchInterval: 10_000,
  });
}
