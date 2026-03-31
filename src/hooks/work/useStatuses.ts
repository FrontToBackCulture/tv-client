// Work Task Statuses hook — statuses are global (not per-project)

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { TaskStatus } from "../../lib/work/types";
import { workKeys } from "./keys";

export function useStatuses() {
  return useQuery({
    queryKey: workKeys.statuses("global"),
    queryFn: async (): Promise<TaskStatus[]> => {
      const { data, error } = await supabase
        .from("task_statuses")
        .select("*")
        .order("sort_order");

      if (error) throw new Error(`Failed to fetch statuses: ${error.message}`);
      return data ?? [];
    },
  });
}
