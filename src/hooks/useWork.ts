// React Query hooks for Work module
// Direct Supabase calls - no middleware

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type {
  Project,
  ProjectInsert,
  ProjectUpdate,
  Task,
  TaskInsert,
  TaskUpdate,
  TaskWithRelations,
  TaskStatus,
  TaskStatusInsert,
  Label,
  LabelInsert,
  User,
  Initiative,
  InitiativeInsert,
  InitiativeUpdate,
  Milestone,
  MilestoneInsert,
  MilestoneUpdate,
  MilestoneWithProgress,
  ProjectUpdateInsert,
  ProjectUpdateWithUser,
} from "../lib/work/types";

// ============================================
// Query Keys
// ============================================
export const workKeys = {
  all: ["work"] as const,
  projects: () => [...workKeys.all, "projects"] as const,
  project: (id: string) => [...workKeys.projects(), id] as const,
  tasks: () => [...workKeys.all, "tasks"] as const,
  tasksByProject: (projectId: string) =>
    [...workKeys.tasks(), "project", projectId] as const,
  task: (id: string) => [...workKeys.tasks(), id] as const,
  statuses: (projectId: string) =>
    [...workKeys.all, "statuses", projectId] as const,
  labels: () => [...workKeys.all, "labels"] as const,
  users: () => [...workKeys.all, "users"] as const,
  initiatives: () => [...workKeys.all, "initiatives"] as const,
  initiative: (id: string) => [...workKeys.initiatives(), id] as const,
  milestones: (projectId: string) =>
    [...workKeys.all, "milestones", projectId] as const,
  projectUpdates: (projectId: string) =>
    [...workKeys.all, "projectUpdates", projectId] as const,
};

// ============================================
// Projects
// ============================================

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

// ============================================
// Tasks
// ============================================

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

// ============================================
// Task Statuses
// ============================================

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

// ============================================
// Labels
// ============================================

export function useLabels() {
  return useQuery({
    queryKey: workKeys.labels(),
    queryFn: async (): Promise<Label[]> => {
      const { data, error } = await supabase
        .from("labels")
        .select("*")
        .order("name");

      if (error) throw new Error(`Failed to fetch labels: ${error.message}`);
      return data ?? [];
    },
  });
}

export function useCreateLabel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (label: LabelInsert): Promise<Label> => {
      const { data, error } = await supabase
        .from("labels")
        .insert(label)
        .select()
        .single();

      if (error) throw new Error(`Failed to create label: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workKeys.labels() });
    },
  });
}

// ============================================
// Users
// ============================================

export function useUsers(type?: "human" | "bot") {
  return useQuery({
    queryKey: [...workKeys.users(), type],
    queryFn: async (): Promise<User[]> => {
      let query = supabase.from("users").select("*").order("name");

      if (type) {
        query = query.eq("type", type);
      }

      const { data, error } = await query;

      if (error) throw new Error(`Failed to fetch users: ${error.message}`);
      return data ?? [];
    },
  });
}

// ============================================
// Initiatives
// ============================================

export function useInitiatives() {
  return useQuery({
    queryKey: workKeys.initiatives(),
    queryFn: async (): Promise<Initiative[]> => {
      const { data, error } = await supabase
        .from("initiatives")
        .select("*")
        .is("archived_at", null)
        .order("sort_order");

      if (error)
        throw new Error(`Failed to fetch initiatives: ${error.message}`);
      return data ?? [];
    },
  });
}

export function useInitiative(id: string | null) {
  return useQuery({
    queryKey: workKeys.initiative(id || ""),
    queryFn: async (): Promise<Initiative | null> => {
      if (!id) return null;

      const { data, error } = await supabase
        .from("initiatives")
        .select("*")
        .eq("id", id)
        .single();

      if (error && error.code !== "PGRST116") {
        throw new Error(`Failed to fetch initiative: ${error.message}`);
      }
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateInitiative() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (initiative: InitiativeInsert): Promise<Initiative> => {
      const { data, error } = await supabase
        .from("initiatives")
        .insert(initiative)
        .select()
        .single();

      if (error)
        throw new Error(`Failed to create initiative: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workKeys.initiatives() });
    },
  });
}

export function useUpdateInitiative() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: InitiativeUpdate;
    }): Promise<Initiative> => {
      const { data, error } = await supabase
        .from("initiatives")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error)
        throw new Error(`Failed to update initiative: ${error.message}`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: workKeys.initiatives() });
      queryClient.invalidateQueries({ queryKey: workKeys.initiative(data.id) });
    },
  });
}

// ============================================
// Milestones
// ============================================

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

// ============================================
// Project Updates
// ============================================

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
