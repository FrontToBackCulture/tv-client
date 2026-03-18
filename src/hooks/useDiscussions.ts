// src/hooks/useDiscussions.ts
// React Query hooks for the universal discussions system

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

export interface Discussion {
  id: string;
  entity_type: string;
  entity_id: string;
  parent_id: string | null;
  author: string;
  body: string;
  created_at: string;
  updated_at: string;
}

// Query key factory
export const discussionKeys = {
  all: ["discussions"] as const,
  entity: (entityType: string, entityId: string) =>
    ["discussions", entityType, entityId] as const,
  count: (entityType: string, entityId: string) =>
    ["discussions", "count", entityType, entityId] as const,
};

/** Fetch discussions for an entity */
export function useDiscussions(entityType: string, entityId: string) {
  return useQuery({
    queryKey: discussionKeys.entity(entityType, entityId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discussions")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: true });

      if (error) throw new Error(error.message);
      return (data ?? []) as Discussion[];
    },
    enabled: !!entityType && !!entityId,
  });
}

/** Count discussions for an entity (lightweight, for badges) */
export function useDiscussionCount(entityType: string, entityId: string) {
  return useQuery({
    queryKey: discussionKeys.count(entityType, entityId),
    queryFn: async () => {
      const { count, error } = await supabase
        .from("discussions")
        .select("id", { count: "exact", head: true })
        .eq("entity_type", entityType)
        .eq("entity_id", entityId);

      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    enabled: !!entityType && !!entityId,
  });
}

/** Create a new discussion */
export function useCreateDiscussion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      entity_type: string;
      entity_id: string;
      author: string;
      body: string;
      parent_id?: string;
    }) => {
      const { data, error } = await supabase
        .from("discussions")
        .insert(params)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data as Discussion;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: discussionKeys.entity(data.entity_type, data.entity_id),
      });
      queryClient.invalidateQueries({
        queryKey: discussionKeys.count(data.entity_type, data.entity_id),
      });
    },
  });
}

/** Update a discussion */
export function useUpdateDiscussion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { id: string; body: string }) => {
      const { data, error } = await supabase
        .from("discussions")
        .update({ body: params.body, updated_at: new Date().toISOString() })
        .eq("id", params.id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data as Discussion;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: discussionKeys.entity(data.entity_type, data.entity_id),
      });
    },
  });
}

/** Delete a discussion */
export function useDeleteDiscussion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      entity_type: string;
      entity_id: string;
    }) => {
      const { error } = await supabase
        .from("discussions")
        .delete()
        .eq("id", params.id);

      if (error) throw new Error(error.message);
      return params;
    },
    onSuccess: (params) => {
      queryClient.invalidateQueries({
        queryKey: discussionKeys.entity(params.entity_type, params.entity_id),
      });
      queryClient.invalidateQueries({
        queryKey: discussionKeys.count(params.entity_type, params.entity_id),
      });
    },
  });
}
