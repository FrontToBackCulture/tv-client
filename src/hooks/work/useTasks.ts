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
import { toast } from "../../stores/toastStore";

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
          project:projects(identifier_prefix, name, color, project_type),
          milestone:milestones(*),
          assignees:task_assignees(user:users(*)),
          creator:users!tasks_created_by_fkey(*),
          company:crm_companies!tasks_company_id_fkey(id, name, display_name, stage, referred_by),
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
      // Only select fields needed for list/dashboard views — detail panel uses useTask()
      const allTasks: TaskWithRelations[] = [];
      let offset = 0;
      const batchSize = 1000;

      while (true) {
        const { data, error } = await supabase
          .from("tasks")
          .select(
            `
            *,
            status:task_statuses(id, type, color),
            project:projects(identifier_prefix, name, color, project_type),
            assignees:task_assignees(user:users(id, name)),
            company:crm_companies!tasks_company_id_fkey(id, name, display_name, stage),
            contact:crm_contacts!tasks_contact_id_fkey(id, name, email)
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
          project:projects(identifier_prefix, name, color, project_type),
          milestone:milestones(*),
          assignees:task_assignees(user:users(*)),
          creator:users!tasks_created_by_fkey(*),
          company:crm_companies!tasks_company_id_fkey(id, name, display_name, stage, referred_by),
          contact:crm_contacts!tasks_contact_id_fkey(id, name, email)
        `
        )
        .eq("id", id)
        .maybeSingle();

      if (error) {
        console.error(`[useTask] Failed to fetch task ${id}:`, error.code, error.message);
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
      task: Omit<TaskInsert, "task_number"> & { assignee_ids?: string[] }
    ): Promise<Task> => {
      const { assignee_ids, ...taskData } = task;

      // Get project to get next task number
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("next_task_number")
        .eq("id", taskData.project_id)
        .single();

      if (projectError)
        throw new Error(`Failed to fetch project: ${projectError.message}`);

      const taskNumber = project.next_task_number;

      // Get max sort_order for the status
      const { data: existingTasks } = await supabase
        .from("tasks")
        .select("sort_order")
        .eq("status_id", taskData.status_id)
        .order("sort_order", { ascending: false })
        .limit(1);

      const maxOrder = existingTasks?.[0]?.sort_order ?? -1;

      // Create the task
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          ...taskData,
          task_number: taskNumber,
          sort_order: maxOrder + 1,
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to create task: ${error.message}`);

      // Insert assignees
      if (assignee_ids && assignee_ids.length > 0) {
        await supabase.from("task_assignees").insert(
          assignee_ids.map(user_id => ({ task_id: data.id, user_id }))
        );
      }

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
      assignee_ids,
    }: {
      id: string;
      updates: TaskUpdate;
      assignee_ids?: string[];
    }): Promise<Task> => {
      const { data, error } = await supabase
        .from("tasks")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(`Failed to update task: ${error.message}`);

      // Replace assignees if provided
      if (assignee_ids !== undefined) {
        await supabase.from("task_assignees").delete().eq("task_id", id);
        if (assignee_ids.length > 0) {
          await supabase.from("task_assignees").insert(
            assignee_ids.map(user_id => ({ task_id: id, user_id }))
          );
        }
      }

      // Log activity (fire-and-forget, non-blocking)
      const activities = Object.entries(updates)
        .filter(([field]) => {
          const label = FIELD_LABELS[field];
          return label !== "" && label !== undefined;
        })
        .map(([field, value]) => ({
          task_id: id,
          action: `Changed ${FIELD_LABELS[field] || field}`,
          new_value: value ?? null,
        }));
      if (activities.length > 0) {
        supabase.from("task_activity").insert(activities).then();
      }

      return data;
    },
    onMutate: ({ id, updates }) => {
      // Synchronous — no await, instant optimistic update
      queryClient.cancelQueries({ queryKey: workKeys.tasks() });

      const patcher = (old: TaskWithRelations[] | undefined) =>
        Array.isArray(old) ? old.map(t => t.id === id ? { ...t, ...updates } as TaskWithRelations : t) : old;

      queryClient.setQueriesData<TaskWithRelations[]>(
        { queryKey: workKeys.tasks() },
        patcher,
      );
    },
    onSuccess: (data) => {
      toast.success("Saved");
      queryClient.invalidateQueries({ queryKey: workKeys.task(data.id) });
      queryClient.invalidateQueries({ queryKey: workKeys.tasks() });
    },
    onError: (err) => {
      toast.error(`Failed to update task: ${err.message}`);
      // Refetch to restore correct state
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
