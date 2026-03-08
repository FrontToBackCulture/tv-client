// Workspace CRUD hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type {
  Workspace,
  WorkspaceInsert,
  WorkspaceUpdate,
  WorkspaceWithDetails,
  WorkspaceSession,
  WorkspaceArtifact,
  WorkspaceArtifactInsert,
  WorkspaceContext,
} from "../../lib/workspace/types";
import { workspaceKeys } from "./keys";

export function useWorkspaces(filters?: { status?: string; owner?: string }) {
  return useQuery({
    queryKey: workspaceKeys.list(filters),
    queryFn: async (): Promise<Workspace[]> => {
      let query = supabase
        .from("workspaces")
        .select("*")
        .order("updated_at", { ascending: false });

      if (filters?.status) {
        query = query.eq("status", filters.status);
      }
      if (filters?.owner) {
        query = query.eq("owner", filters.owner);
      }

      const { data, error } = await query;
      if (error) throw new Error(`Failed to fetch workspaces: ${error.message}`);
      return data ?? [];
    },
  });
}

export function useWorkspace(id: string | null) {
  return useQuery({
    queryKey: workspaceKeys.detail(id || ""),
    queryFn: async (): Promise<WorkspaceWithDetails | null> => {
      if (!id) return null;

      // Fetch workspace
      const { data: workspace, error } = await supabase
        .from("workspaces")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw new Error(`Failed to fetch workspace: ${error.message}`);
      if (!workspace) return null;

      // Fetch related data in parallel
      const [sessionsRes, artifactsRes, contextRes] = await Promise.all([
        supabase
          .from("workspace_sessions")
          .select("*")
          .eq("workspace_id", id)
          .order("date", { ascending: false }),
        supabase
          .from("workspace_artifacts")
          .select("*")
          .eq("workspace_id", id)
          .order("created_at", { ascending: false }),
        supabase
          .from("workspace_context")
          .select("*")
          .eq("workspace_id", id)
          .maybeSingle(),
      ]);

      return {
        ...workspace,
        sessions: (sessionsRes.data ?? []) as WorkspaceSession[],
        artifacts: (artifactsRes.data ?? []) as WorkspaceArtifact[],
        context: (contextRes.data as WorkspaceContext) ?? null,
      };
    },
    enabled: !!id,
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (workspace: WorkspaceInsert): Promise<Workspace> => {
      const { data, error } = await supabase
        .from("workspaces")
        .insert(workspace)
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
      updates: WorkspaceUpdate;
    }): Promise<Workspace> => {
      const { data, error } = await supabase
        .from("workspaces")
        .update(updates)
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
      const { error } = await supabase.from("workspaces").delete().eq("id", id);
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
        .from("workspace_artifacts")
        .insert(artifact);
      if (error) throw new Error(`Failed to add artifact: ${error.message}`);
    },
    onSuccess: (_, artifact) => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(artifact.workspace_id) });
    },
  });
}

export function useRemoveArtifact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, workspaceId }: { id: string; workspaceId: string }): Promise<void> => {
      const { error } = await supabase.from("workspace_artifacts").delete().eq("id", id);
      if (error) throw new Error(`Failed to remove artifact: ${error.message}`);
      // Return workspaceId for invalidation
      void workspaceId;
    },
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(workspaceId) });
    },
  });
}
