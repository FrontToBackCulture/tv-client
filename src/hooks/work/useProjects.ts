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

export function useProjects(projectType?: string) {
  return useQuery({
    queryKey: [...workKeys.projects(), projectType],
    queryFn: async (): Promise<Project[]> => {
      let query = supabase
        .from("projects")
        .select("*, company:crm_companies(name, display_name)")
        .is("archived_at", null)
        .order("sort_order");

      // Default to 'work' to not show deals/workspaces in the project list
      // "all" = no filter (show everything)
      if (projectType === "all") {
        // no filter
      } else if (projectType) {
        query = query.eq("project_type", projectType);
      } else {
        query = query.eq("project_type", "work");
      }

      const { data, error } = await query;

      if (error) throw new Error(`Failed to fetch projects: ${error.message}`);

      // For deal-type projects, prepend company name to the display name
      return (data ?? []).map((p: any) => ({
        ...p,
        name: p.project_type === "deal" && p.company?.name
          ? `${p.company.display_name || p.company.name} — ${p.name}`
          : p.name,
        company: undefined, // clean up joined data
      }));
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
        .insert({
          ...project,
          project_type: (project as any).project_type || "work",
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to create project: ${error.message}`);

      // Create default statuses
      const defaultStatuses: TaskStatusInsert[] = [
        {
          project_id: data.id,
          name: "To-do",
          type: "todo",
          color: "#9CA3AF",
          icon: "circle",
          sort_order: 0,
        },
        {
          project_id: data.id,
          name: "In Progress",
          type: "in_progress",
          color: "#F59E0B",
          icon: "play",
          sort_order: 1,
        },
        {
          project_id: data.id,
          name: "Complete",
          type: "complete",
          color: "#10B981",
          icon: "check",
          sort_order: 2,
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
