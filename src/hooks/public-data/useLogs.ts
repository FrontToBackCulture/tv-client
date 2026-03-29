import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { publicDataKeys } from "./keys";
import type { IngestionLog } from "../../lib/public-data/types";

export function useIngestionLogs(sourceId?: string, limit = 20) {
  return useQuery({
    queryKey: sourceId ? publicDataKeys.logsBySource(sourceId) : publicDataKeys.logs(),
    queryFn: async (): Promise<IngestionLog[]> => {
      let query = supabase
        .schema("public_data")
        .from("ingestion_log")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(limit);
      if (sourceId) query = query.eq("source_id", sourceId);
      const { data, error } = await query;
      if (error) throw new Error(`Failed to fetch logs: ${error.message}`);
      return (data ?? []) as IngestionLog[];
    },
  });
}
