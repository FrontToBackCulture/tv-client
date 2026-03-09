// Workspace module types for tv-client
import type { Database } from "../supabase-types";

export type Workspace = Database["public"]["Tables"]["workspaces"]["Row"];
export type WorkspaceInsert = Database["public"]["Tables"]["workspaces"]["Insert"];
export type WorkspaceUpdate = Database["public"]["Tables"]["workspaces"]["Update"];

export type WorkspaceSession = Database["public"]["Tables"]["workspace_sessions"]["Row"];
export type WorkspaceSessionInsert = Database["public"]["Tables"]["workspace_sessions"]["Insert"];

export type WorkspaceArtifact = Database["public"]["Tables"]["workspace_artifacts"]["Row"];
export type WorkspaceArtifactInsert = Database["public"]["Tables"]["workspace_artifacts"]["Insert"];

export type WorkspaceContext = Database["public"]["Tables"]["workspace_context"]["Row"];
export type WorkspaceContextInsert = Database["public"]["Tables"]["workspace_context"]["Insert"];

// Workspace with all related data joined
export interface WorkspaceWithDetails extends Workspace {
  sessions: WorkspaceSession[];
  artifacts: WorkspaceArtifact[];
  context: WorkspaceContext | null;
}

// Artifact type labels for display
export const ARTIFACT_TYPE_LABELS: Record<string, string> = {
  skill: "Skill",
  doc: "Document",
  crm_deal: "CRM Deal",
  crm_company: "CRM Company",
  task: "Task",
  domain: "Domain",
  code: "Code",
  report: "Report",
  proposal: "Proposal",
  order_form: "Order Form",
  other: "Other",
};

export const WORKSPACE_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  active: "Active",
  in_progress: "In Progress",
  done: "Done",
  paused: "Paused",
};

export const WORKSPACE_STATUS_COLORS: Record<string, string> = {
  open: "#3B82F6",
  active: "#F97316",
  in_progress: "#F59E0B",
  done: "#10B981",
  paused: "#6B7280",
};
