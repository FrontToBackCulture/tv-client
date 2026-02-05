// Work module types for tv-client
import type { Database } from "../supabase-types";

// Base types from database
export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type ProjectInsert = Database["public"]["Tables"]["projects"]["Insert"];
export type ProjectUpdate = Database["public"]["Tables"]["projects"]["Update"];

export type TaskStatus = Database["public"]["Tables"]["task_statuses"]["Row"];
export type TaskStatusInsert =
  Database["public"]["Tables"]["task_statuses"]["Insert"];

export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];
export type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];

export type Label = Database["public"]["Tables"]["labels"]["Row"];
export type LabelInsert = Database["public"]["Tables"]["labels"]["Insert"];

export type TaskActivity = Database["public"]["Tables"]["task_activity"]["Row"];

export type User = Database["public"]["Tables"]["users"]["Row"];
export type UserInsert = Database["public"]["Tables"]["users"]["Insert"];
export type UserUpdate = Database["public"]["Tables"]["users"]["Update"];

export type Initiative = Database["public"]["Tables"]["initiatives"]["Row"];
export type InitiativeInsert =
  Database["public"]["Tables"]["initiatives"]["Insert"];
export type InitiativeUpdate =
  Database["public"]["Tables"]["initiatives"]["Update"];

export type Milestone = Database["public"]["Tables"]["milestones"]["Row"];
export type MilestoneInsert =
  Database["public"]["Tables"]["milestones"]["Insert"];
export type MilestoneUpdate =
  Database["public"]["Tables"]["milestones"]["Update"];

export type ProjectUpdateRecord =
  Database["public"]["Tables"]["project_updates"]["Row"];
export type ProjectUpdateInsert =
  Database["public"]["Tables"]["project_updates"]["Insert"];

// Extended types with relations
export interface TaskWithRelations extends Task {
  status?: TaskStatus;
  labels?: Array<{ label: Label }>;
  activity?: TaskActivity[];
  project?: Pick<Project, "identifier_prefix" | "name" | "color">;
  milestone?: Milestone | null;
  assignee?: User | null;
  creator?: User | null;
}

export interface ProjectWithStatuses extends Project {
  statuses?: TaskStatus[];
}

// Priority enum
export enum Priority {
  None = 0,
  Urgent = 1,
  High = 2,
  Medium = 3,
  Low = 4,
}

export const PriorityLabels: Record<Priority, string> = {
  [Priority.None]: "No priority",
  [Priority.Urgent]: "Urgent",
  [Priority.High]: "High",
  [Priority.Medium]: "Medium",
  [Priority.Low]: "Low",
};

export const PriorityColors: Record<Priority, string> = {
  [Priority.None]: "#6B7280",
  [Priority.Urgent]: "#EF4444",
  [Priority.High]: "#F59E0B",
  [Priority.Medium]: "#3B82F6",
  [Priority.Low]: "#10B981",
};

// Status types
export type StatusType =
  | "backlog"
  | "unstarted"
  | "started"
  | "review"
  | "completed"
  | "canceled";

export const StatusTypeLabels: Record<StatusType, string> = {
  backlog: "Backlog",
  unstarted: "Todo",
  started: "In Progress",
  review: "In Review",
  completed: "Done",
  canceled: "Canceled",
};

// Initiative types
export type InitiativeStatus = "planned" | "active" | "completed" | "paused";
export type InitiativeHealth = "on_track" | "at_risk" | "off_track";

export const InitiativeStatusLabels: Record<InitiativeStatus, string> = {
  planned: "Planned",
  active: "Active",
  completed: "Completed",
  paused: "Paused",
};

export const InitiativeStatusColors: Record<InitiativeStatus, string> = {
  planned: "#6B7280",
  active: "#0D7680",
  completed: "#10B981",
  paused: "#F59E0B",
};

export const InitiativeHealthLabels: Record<InitiativeHealth, string> = {
  on_track: "On Track",
  at_risk: "At Risk",
  off_track: "Off Track",
};

export const InitiativeHealthColors: Record<InitiativeHealth, string> = {
  on_track: "#10B981",
  at_risk: "#F59E0B",
  off_track: "#EF4444",
};

// Progress types
export interface InitiativeProgress {
  totalTasks: number;
  completedTasks: number;
  percentComplete: number;
  projectsCount: number;
  completedProjects: number;
}

export interface ProjectProgress {
  totalTasks: number;
  completedTasks: number;
  percentComplete: number;
}

export interface InitiativeWithProjects extends Initiative {
  projects?: Array<{
    project: Project;
    sort_order: number;
  }>;
}

export interface InitiativeWithProgress extends Initiative {
  projects?: Array<{
    project: Project;
    sort_order: number;
  }>;
  progress?: InitiativeProgress;
}

export interface ProjectWithProgress extends Project {
  initiative?: Initiative | null;
  progress?: ProjectProgress;
}

export interface MilestoneWithProgress extends Milestone {
  taskCount: number;
  completedCount: number;
}

// Project status (reuse initiative types)
export type ProjectStatus = InitiativeStatus;
export type ProjectHealth = InitiativeHealth;
export const ProjectStatusLabels = InitiativeStatusLabels;
export const ProjectStatusColors = InitiativeStatusColors;
export const ProjectHealthLabels = InitiativeHealthLabels;
export const ProjectHealthColors = InitiativeHealthColors;

// Project update with user
export interface ProjectUpdateWithUser extends ProjectUpdateRecord {
  creator?: User | null;
}

// Helper to get task identifier
export function getTaskIdentifier(task: TaskWithRelations): string {
  const prefix = task.project?.identifier_prefix || "TASK";
  return `${prefix}-${task.task_number}`;
}
