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
          creator:users!tasks_created_by_fkey(*),
          company:crm_companies!tasks_company_id_fkey(id, name, display_name, stage),
          contact:crm_contacts!tasks_contact_id_fkey(id, name, email)
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
      // Fetch all tasks in batches (Supabase default limit is 1000)
      const allTasks: TaskWithRelations[] = [];
      let offset = 0;
      const batchSize = 1000;

      while (true) {
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
          .order("updated_at", { ascending: false })
          .range(offset, offset + batchSize - 1);

        if (error) throw new Error(`Failed to fetch tasks: ${error.message}`);
        allTasks.push(...((data ?? []) as TaskWithRelations[]));

        if (!data || data.length < batchSize) break;
        offset += batchSize;
      }

      return allTasks;
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
          creator:users!tasks_created_by_fkey(*),
          company:crm_companies!tasks_company_id_fkey(id, name, display_name, stage),
          contact:crm_contacts!tasks_contact_id_fkey(id, name, email)
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

      // Log creation activity
      supabase.from("task_activity").insert({
        task_id: data.id,
        action: "Created task",
      }).then();

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

// Human-readable field labels for activity logging
const FIELD_LABELS: Record<string, string> = {
  status_id: "status",
  assignee_id: "assignee",
  milestone_id: "milestone",
  priority: "priority",
  due_date: "due date",
  title: "title",
  description: "description",
  task_type: "type",
  company_id: "company",
  contact_id: "contact",
  sort_order: "",  // skip logging sort changes
};

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
      // Fetch current values for changed fields (for activity log)
      const { data: current } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", id)
        .single();

      const { data, error } = await supabase
        .from("tasks")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(`Failed to update task: ${error.message}`);

      // Log activity for each changed field (fire-and-forget)
      if (current) {
        const activities = Object.entries(updates)
          .filter(([field, value]) => {
            const label = FIELD_LABELS[field];
            if (label === "") return false; // explicitly skipped
            return current[field] !== value;
          })
          .map(([field, value]) => ({
            task_id: id,
            action: `Changed ${FIELD_LABELS[field] || field}`,
            old_value: current[field] ?? null,
            new_value: value ?? null,
          }));

        if (activities.length > 0) {
          supabase.from("task_activity").insert(activities).then();
        }
      }

      return data;
    },
    // Optimistic update: patch all task caches (all-tasks + per-project) immediately
    onMutate: async ({ id, updates }) => {
      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: workKeys.tasks() });

      const patcher = (old: TaskWithRelations[] | undefined) =>
        old?.map(t => t.id === id ? { ...t, ...updates } as TaskWithRelations : t);

      // Patch ALL task list caches (matches ["work","tasks"], ["work","tasks","project",id], etc.)
      queryClient.setQueriesData<TaskWithRelations[]>(
        { queryKey: workKeys.tasks() },
        patcher,
      );
    },
    onSuccess: (data) => {
      // Invalidate the single-task detail cache (refetch so detail panel is fresh)
      queryClient.invalidateQueries({ queryKey: workKeys.task(data.id) });
      // Mark all task-list caches as stale but don't refetch immediately — optimistic update is in place
      queryClient.invalidateQueries({ queryKey: workKeys.tasks(), refetchType: "none" });
    },
    onError: () => {
      // On error, refetch to restore correct state
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
