// Work Milestones CRUD hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type {
  Milestone,
  MilestoneInsert,
  MilestoneUpdate,
  MilestoneWithProgress,
} from "../../lib/work/types";
import { workKeys } from "./keys";

export function useMilestones(projectId: string | null) {
  return useQuery({
    queryKey: workKeys.milestones(projectId || ""),
    queryFn: async (): Promise<MilestoneWithProgress[]> => {
      if (!projectId) return [];

      // Get milestones
      const { data: milestones, error } = await supabase
        .from("milestones")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order")
        .order("target_date", { nullsFirst: false });

      if (error)
        throw new Error(`Failed to fetch milestones: ${error.message}`);

      // Get task counts
      const { data: taskCounts, error: countError } = await supabase
        .from("tasks")
        .select("milestone_id, status:task_statuses(type)")
        .eq("project_id", projectId);

      if (countError)
        throw new Error(`Failed to fetch task counts: ${countError.message}`);

      // Calculate counts
      const counts = new Map<string | null, { total: number; completed: number }>();
      for (const task of taskCounts ?? []) {
        const milestoneId = task.milestone_id as string | null;
        const current = counts.get(milestoneId) ?? { total: 0, completed: 0 };
        current.total++;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const status = task.status as any;
        const statusType = Array.isArray(status) ? status[0]?.type : status?.type;
        if (statusType === "completed") {
          current.completed++;
        }
        counts.set(milestoneId, current);
      }

      return (milestones ?? []).map((m) => {
        const count = counts.get(m.id) ?? { total: 0, completed: 0 };
        return {
          ...m,
          taskCount: count.total,
          completedCount: count.completed,
        };
      });
    },
    enabled: !!projectId,
  });
}

export function useCreateMilestone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (milestone: MilestoneInsert): Promise<Milestone> => {
      const { data, error } = await supabase
        .from("milestones")
        .insert(milestone)
        .select()
        .single();

      if (error)
        throw new Error(`Failed to create milestone: ${error.message}`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: workKeys.milestones(data.project_id),
      });
    },
  });
}

export function useUpdateMilestone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: MilestoneUpdate;
    }): Promise<Milestone> => {
      const { data, error } = await supabase
        .from("milestones")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error)
        throw new Error(`Failed to update milestone: ${error.message}`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: workKeys.milestones(data.project_id),
      });
    },
  });
}

export function useDeleteMilestone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from("milestones").delete().eq("id", id);
      if (error)
        throw new Error(`Failed to delete milestone: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workKeys.all });
    },
  });
}
