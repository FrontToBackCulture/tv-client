// Work Project Updates hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type {
  ProjectUpdateInsert,
  ProjectUpdateWithUser,
} from "../../lib/work/types";
import { workKeys } from "./keys";

export function useProjectUpdates(projectId: string | null) {
  return useQuery({
    queryKey: workKeys.projectUpdates(projectId || ""),
    queryFn: async (): Promise<ProjectUpdateWithUser[]> => {
      if (!projectId) return [];

      const { data, error } = await supabase
        .from("project_updates")
        .select(
          `
          *,
          creator:created_by(id, name, avatar_url, type)
        `
        )
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (error)
        throw new Error(`Failed to fetch project updates: ${error.message}`);
      return data ?? [];
    },
    enabled: !!projectId,
  });
}

export function useCreateProjectUpdate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (update: ProjectUpdateInsert): Promise<void> => {
      const { error } = await supabase
        .from("project_updates")
        .insert(update);

      if (error)
        throw new Error(`Failed to create project update: ${error.message}`);

      // Update project health
      if (update.health) {
        await supabase
          .from("projects")
          .update({ health: update.health })
          .eq("id", update.project_id);
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: workKeys.projectUpdates(variables.project_id),
      });
      queryClient.invalidateQueries({
        queryKey: workKeys.project(variables.project_id),
      });
    },
  });
}
