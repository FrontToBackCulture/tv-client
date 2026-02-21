// Work Projects CRUD hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type {
  Project,
  ProjectInsert,
  ProjectUpdate,
  TaskStatusInsert,
} from "../../lib/work/types";
import { workKeys } from "./keys";

export function useProjects() {
  return useQuery({
    queryKey: workKeys.projects(),
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .is("archived_at", null)
        .order("sort_order");

      if (error) throw new Error(`Failed to fetch projects: ${error.message}`);
      return data ?? [];
    },
  });
}

export function useProject(id: string | null) {
  return useQuery({
    queryKey: workKeys.project(id || ""),
    queryFn: async (): Promise<Project | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .single();

      if (error && error.code !== "PGRST116") {
        throw new Error(`Failed to fetch project: ${error.message}`);
      }
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (project: ProjectInsert): Promise<Project> => {
      const { data, error } = await supabase
        .from("projects")
        .insert(project)
        .select()
        .single();

      if (error) throw new Error(`Failed to create project: ${error.message}`);

      // Create default statuses
      const defaultStatuses: TaskStatusInsert[] = [
        {
          project_id: data.id,
          name: "Backlog",
          type: "backlog",
          color: "#6B7280",
          icon: "inbox",
          sort_order: 0,
        },
        {
          project_id: data.id,
          name: "Todo",
          type: "unstarted",
          color: "#3B82F6",
          icon: "circle",
          sort_order: 1,
        },
        {
          project_id: data.id,
          name: "In Progress",
          type: "started",
          color: "#0D7680",
          icon: "play",
          sort_order: 2,
        },
        {
          project_id: data.id,
          name: "Done",
          type: "completed",
          color: "#10B981",
          icon: "check",
          sort_order: 3,
        },
      ];

      await supabase.from("task_statuses").insert(defaultStatuses);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workKeys.projects() });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: ProjectUpdate;
    }): Promise<Project> => {
      const { data, error } = await supabase
        .from("projects")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(`Failed to update project: ${error.message}`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: workKeys.projects() });
      queryClient.invalidateQueries({ queryKey: workKeys.project(data.id) });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw new Error(`Failed to delete project: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workKeys.projects() });
    },
  });
}
