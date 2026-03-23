// Workspace module types for tv-client
import type { Database } from "../supabase-types";

// Workspaces are stored in the projects table — mapped to workspace shape by hooks
export type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
export type ProjectInsert = Database["public"]["Tables"]["projects"]["Insert"];
export type ProjectUpdate = Database["public"]["Tables"]["projects"]["Update"];

export type WorkspaceSession = Database["public"]["Tables"]["project_sessions"]["Row"];
export type WorkspaceSessionInsert = Database["public"]["Tables"]["project_sessions"]["Insert"];

export type WorkspaceArtifact = Database["public"]["Tables"]["project_artifacts"]["Row"];
export type WorkspaceArtifactInsert = Database["public"]["Tables"]["project_artifacts"]["Insert"];

export type WorkspaceContext = Database["public"]["Tables"]["project_context"]["Row"];
export type WorkspaceContextInsert = Database["public"]["Tables"]["project_context"]["Insert"];

// Workspace shape — mapped from projects table by hooks
export interface WorkspaceWithDetails {
  id: string;
  title: string;
  description: string | null;
  status: string;
  owner: string;
  intent?: string | null;
  initiative_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  sessions: WorkspaceSession[];
  artifacts: WorkspaceArtifact[];
  context: WorkspaceContext | null;
  // Pass-through project fields
  project_type?: string;
  company_id?: string | null;
  company?: { id: string; name: string; display_name: string | null; stage: string | null } | null;
  deal_stage?: string | null;
  deal_value?: number | null;
  deal_currency?: string | null;
  deal_solution?: string | null;
  deal_expected_close?: string | null;
  deal_actual_close?: string | null;
  deal_proposal_path?: string | null;
  deal_order_form_path?: string | null;
  deal_lost_reason?: string | null;
  deal_won_notes?: string | null;
  deal_stage_changed_at?: string | null;
  deal_notes?: string | null;
  deal_contact_ids?: string[] | null;
  deal_tags?: string[] | null;
  health?: string | null;
  priority?: number | null;
  target_date?: string | null;
  lead?: string | null;
  color?: string | null;
  identifier_prefix?: string | null;
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
