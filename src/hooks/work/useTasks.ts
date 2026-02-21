// Work Tasks CRUD hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type {
  Task,
  TaskInsert,
  TaskUpdate,
  TaskWithRelations,
} from "../../lib/work/types";
import { workKeys } from "./keys";

export function useTasks(projectId: string | null) {
  return useQuery({
    queryKey: workKeys.tasksByProject(projectId || ""),
    queryFn: async (): Promise<TaskWithRelations[]> => {
      if (!projectId) return [];

      const { data, error } = await supabase
        .from("tasks")
        .select(
          `
          *,
          status:task_statuses(*),
          labels:task_labels(label:labels(*)),
          project:projects(identifier_prefix, name, color),
          milestone:milestones(*),
          assignee:users!tasks_assignee_id_fkey(*),
          creator:users!tasks_created_by_fkey(*)
        `
        )
        .eq("project_id", projectId)
        .order("sort_order");

      if (error) throw new Error(`Failed to fetch tasks: ${error.message}`);
      return (data ?? []) as TaskWithRelations[];
    },
    enabled: !!projectId,
  });
}

export function useAllTasks() {
  return useQuery({
    queryKey: workKeys.tasks(),
    queryFn: async (): Promise<TaskWithRelations[]> => {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          `
          *,
          status:task_statuses(*),
          labels:task_labels(label:labels(*)),
          project:projects(identifier_prefix, name, color),
          milestone:milestones(*),
          assignee:users!tasks_assignee_id_fkey(*),
          creator:users!tasks_created_by_fkey(*)
        `
        )
        .order("updated_at", { ascending: false });

      if (error) throw new Error(`Failed to fetch tasks: ${error.message}`);
      return (data ?? []) as TaskWithRelations[];
    },
  });
}

export function useTask(id: string | null) {
  return useQuery({
    queryKey: workKeys.task(id || ""),
    queryFn: async (): Promise<TaskWithRelations | null> => {
      if (!id) return null;

      const { data, error } = await supabase
        .from("tasks")
        .select(
          `
          *,
          status:task_statuses(*),
          labels:task_labels(label:labels(*)),
          activity:task_activity(*),
          project:projects(identifier_prefix, name, color),
          milestone:milestones(*),
          assignee:users!tasks_assignee_id_fkey(*),
          creator:users!tasks_created_by_fkey(*)
        `
        )
        .eq("id", id)
        .single();

      if (error && error.code !== "PGRST116") {
        throw new Error(`Failed to fetch task: ${error.message}`);
      }
      return data as TaskWithRelations | null;
    },
    enabled: !!id,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      task: Omit<TaskInsert, "task_number">
    ): Promise<Task> => {
      // Get project to get next task number
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("next_task_number")
        .eq("id", task.project_id)
        .single();

      if (projectError)
        throw new Error(`Failed to fetch project: ${projectError.message}`);

      const taskNumber = project.next_task_number;

      // Get max sort_order for the status
      const { data: existingTasks } = await supabase
        .from("tasks")
        .select("sort_order")
        .eq("status_id", task.status_id)
        .order("sort_order", { ascending: false })
        .limit(1);

      const maxOrder = existingTasks?.[0]?.sort_order ?? -1;

      // Create the task
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          ...task,
          task_number: taskNumber,
          sort_order: maxOrder + 1,
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to create task: ${error.message}`);

      // Increment project's next_task_number
      await supabase
        .from("projects")
        .update({ next_task_number: taskNumber + 1 })
        .eq("id", task.project_id);

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: workKeys.tasksByProject(data.project_id),
      });
      queryClient.invalidateQueries({ queryKey: workKeys.tasks() });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: TaskUpdate;
    }): Promise<Task> => {
      const { data, error } = await supabase
        .from("tasks")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(`Failed to update task: ${error.message}`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: workKeys.tasksByProject(data.project_id),
      });
      queryClient.invalidateQueries({ queryKey: workKeys.task(data.id) });
      queryClient.invalidateQueries({ queryKey: workKeys.tasks() });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw new Error(`Failed to delete task: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workKeys.tasks() });
    },
  });
}
