// Work Task Statuses hook

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { TaskStatus } from "../../lib/work/types";
import { workKeys } from "./keys";

export function useStatuses(projectId: string | null) {
  return useQuery({
    queryKey: workKeys.statuses(projectId || ""),
    queryFn: async (): Promise<TaskStatus[]> => {
      if (!projectId) return [];

      const { data, error } = await supabase
        .from("task_statuses")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order");

      if (error) throw new Error(`Failed to fetch statuses: ${error.message}`);
      return data ?? [];
    },
    enabled: !!projectId,
  });
}
