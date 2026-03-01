// Hook to fetch historical API task logs from Supabase

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { Database } from "../../lib/supabase-types";

export type ApiTaskLog = Database["public"]["Tables"]["api_task_logs"]["Row"];

export function useApiTaskLogs() {
  return useQuery({
    queryKey: ["api-task-logs"],
    queryFn: async (): Promise<ApiTaskLog[]> => {
      const { data, error } = await supabase
        .from("api_task_logs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}
