// Workspace CRUD hooks
// Queries from unified projects table (project_type='work')

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type {
  WorkspaceSession,
  WorkspaceArtifact,
  WorkspaceArtifactInsert,
  WorkspaceContext,
  WorkspaceWithDetails,
} from "../../lib/workspace/types";
import { workspaceKeys } from "./keys";

// Workspace status mapping (workspace ↔ project)
const wsToProjectStatus: Record<string, string> = {
  open: "planned",
  active: "active",
  in_progress: "active",
  done: "completed",
  paused: "paused",
};

const projectToWsStatus: Record<string, string> = {
  planned: "open",
  active: "active",
  completed: "done",
  paused: "paused",
};

export type WorkspaceWithCounts = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  owner: string;
  intent: string | null;
  initiative_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  session_count: number;
  artifact_count: number;
};

export function useWorkspaces(filters?: { status?: string; owner?: string }) {
  return useQuery({
    queryKey: workspaceKeys.list(filters),
    queryFn: async (): Promise<WorkspaceWithCounts[]> => {
      let query = supabase
        .from("projects")
        .select("*, project_sessions(count), project_artifacts(count)")
        .eq("project_type", "work")
        .is("archived_at", null)
        .order("updated_at", { ascending: false });

      if (filters?.status) {
        const projectStatus = wsToProjectStatus[filters.status] || filters.status;
        query = query.eq("status", projectStatus);
      }
      if (filters?.owner) {
        query = query.eq("owner", filters.owner);
      }

      const { data, error } = await query;
      if (error) throw new Error(`Failed to fetch workspaces: ${error.message}`);

      // Flatten the count aggregates and map to workspace shape
      return (data ?? []).map((row: any) => ({
        id: row.id,
        title: row.name,
        description: row.description,
        status: projectToWsStatus[row.status] || "open",
        owner: row.owner || "",
        intent: row.intent,
        initiative_id: null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        session_count: row.project_sessions?.[0]?.count ?? 0,
        artifact_count: row.project_artifacts?.[0]?.count ?? 0,
      }));
    },
  });
}

export function useWorkspace(id: string | null) {
  return useQuery({
    queryKey: workspaceKeys.detail(id || ""),
    queryFn: async (): Promise<WorkspaceWithDetails | null> => {
      if (!id) return null;

      // Fetch project with company join
      const { data: project, error } = await supabase
        .from("projects")
        .select("*, company:crm_companies(id, name, display_name, stage)")
        .eq("id", id)
        .single();

      if (error) throw new Error(`Failed to fetch workspace: ${error.message}`);
      if (!project) return null;

      // Fetch related data in parallel (query by project_id)
      const [sessionsRes, artifactsRes, contextRes] = await Promise.all([
        supabase
          .from("project_sessions")
          .select("*")
          .eq("project_id", id)
          .order("date", { ascending: false }),
        supabase
          .from("project_artifacts")
          .select("*")
          .eq("project_id", id)
          .order("created_at", { ascending: false }),
        supabase
          .from("project_context")
          .select("*")
          .eq("project_id", id)
          .maybeSingle(),
      ]);

      // Map project to workspace shape, preserving project-level metadata
      return {
        id: project.id,
        title: project.name,
        description: project.description,
        status: projectToWsStatus[project.status || "planned"] || "open",
        owner: project.owner || "",
        intent: project.intent,
        initiative_id: null,
        created_at: project.created_at,
        updated_at: project.updated_at,
        sessions: (sessionsRes.data ?? []) as WorkspaceSession[],
        artifacts: (artifactsRes.data ?? []) as WorkspaceArtifact[],
        context: (contextRes.data as WorkspaceContext) ?? null,
        // Pass through unified project fields for detail view
        project_type: project.project_type,
        company_id: project.company_id,
        deal_stage: project.deal_stage,
        deal_value: project.deal_value,
        deal_currency: project.deal_currency,
        deal_solution: project.deal_solution,
        deal_expected_close: project.deal_expected_close,
        deal_actual_close: project.deal_actual_close,
        deal_proposal_path: project.deal_proposal_path,
        deal_order_form_path: project.deal_order_form_path,
        deal_lost_reason: project.deal_lost_reason,
        deal_won_notes: project.deal_won_notes,
        deal_stage_changed_at: project.deal_stage_changed_at,
        deal_notes: project.deal_notes,
        deal_contact_ids: project.deal_contact_ids,
        deal_tags: project.deal_tags,
        company: project.company,
        // Work project fields
        health: project.health,
        priority: project.priority,
        target_date: project.target_date,
        lead: project.lead,
        color: project.color,
        identifier_prefix: project.identifier_prefix,
      } as any;
    },
    enabled: !!id,
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (workspace: {
      title: string;
      description?: string | null;
      status?: string;
      owner: string;
      intent?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("projects")
        .insert({
          name: workspace.title,
          description: workspace.description,
          status: wsToProjectStatus[workspace.status || "active"] || "active",
          project_type: "work",
          owner: workspace.owner,
          intent: workspace.intent,
          identifier_prefix: "WS",
        } as any)
        .select()
        .single();

      if (error) throw new Error(`Failed to create workspace: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
    },
  });
}

export function useUpdateWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: {
        title?: string;
        description?: string;
        status?: string;
        intent?: string;
      };
    }) => {
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };
      if (updates.title !== undefined) updateData.name = updates.title;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.status !== undefined) updateData.status = wsToProjectStatus[updates.status] || updates.status;
      if (updates.intent !== undefined) updateData.intent = updates.intent;

      const { data, error } = await supabase
        .from("projects")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(`Failed to update workspace: ${error.message}`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(data.id) });
    },
  });
}

export function useDeleteWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      // Soft delete via archived_at
      const { error } = await supabase
        .from("projects")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(`Failed to delete workspace: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
    },
  });
}

export function useAddArtifact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (artifact: WorkspaceArtifactInsert): Promise<void> => {
      const { error } = await supabase
        .from("project_artifacts")
        .insert(artifact);
      if (error) throw new Error(`Failed to add artifact: ${error.message}`);
    },
    onSuccess: (_, artifact) => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(artifact.project_id || "") });
    },
  });
}

export function useRemoveArtifact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, workspaceId }: { id: string; workspaceId: string }): Promise<void> => {
      const { error } = await supabase.from("project_artifacts").delete().eq("id", id);
      if (error) throw new Error(`Failed to remove artifact: ${error.message}`);
      void workspaceId;
    },
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(workspaceId) });
    },
  });
}
