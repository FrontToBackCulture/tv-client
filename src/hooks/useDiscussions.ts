// src/hooks/useDiscussions.ts
// React Query hooks for the universal discussions system

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

export type DiscussionOrigin = "direct" | "automation";

export interface AgentMetrics {
  cost_usd?: number;
  duration_ms?: number;
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_tokens?: number;
  cache_read_tokens?: number;
  model?: string;
}

export interface Discussion {
  id: string;
  entity_type: string;
  entity_id: string;
  parent_id: string | null;
  author: string;
  body: string;
  title: string | null;
  origin: DiscussionOrigin;
  attachments: string[]; // array of image URLs
  agent_metrics: AgentMetrics | null; // SDK-run cost/token usage; null for non-SDK replies
  last_activity_at: string;
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

/**
 * Fetch distinct bot-chat sessions for an entity, matching entity_ids like
 * `task-chat:{taskId}` or `task-chat:{taskId}:{sessionSuffix}`.
 *
 * Returns one summary per entity_id (session), sorted by last activity desc.
 */
export interface BotChatSession {
  entity_id: string;
  title: string | null;
  created_at: string;
  last_activity_at: string;
  message_count: number;
  sample_body: string;
}

export function useBotChatSessions(entityIdPrefix: string | null) {
  return useQuery({
    queryKey: ["discussions", "bot-chat-sessions", entityIdPrefix ?? ""],
    enabled: !!entityIdPrefix,
    queryFn: async (): Promise<BotChatSession[]> => {
      if (!entityIdPrefix) return [];
      const { data, error } = await supabase
        .from("discussions")
        .select("entity_id, title, body, created_at, last_activity_at")
        .eq("entity_type", "general")
        .or(`entity_id.eq.${entityIdPrefix},entity_id.like.${entityIdPrefix}:%`)
        .order("created_at", { ascending: true });

      if (error) throw new Error(error.message);

      // Group by entity_id
      const grouped = new Map<string, BotChatSession>();
      for (const row of (data ?? []) as any[]) {
        const existing = grouped.get(row.entity_id);
        if (existing) {
          existing.message_count += 1;
          if (row.last_activity_at > existing.last_activity_at) {
            existing.last_activity_at = row.last_activity_at;
          }
        } else {
          grouped.set(row.entity_id, {
            entity_id: row.entity_id,
            title: row.title,
            created_at: row.created_at,
            last_activity_at: row.last_activity_at,
            message_count: 1,
            sample_body: row.body,
          });
        }
      }
      return [...grouped.values()].sort(
        (a, b) => new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime(),
      );
    },
    staleTime: 10_000,
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
      title?: string;
      attachments?: string[];
      origin?: DiscussionOrigin;
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
      queryClient.invalidateQueries({ queryKey: ["chat", "threads"] });
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
