// src/hooks/useNotifications.ts
// React Query hooks for the notification system

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

export interface Notification {
  id: string;
  recipient: string;
  type: string; // 'mention' | 'reply'
  discussion_id: string | null;
  entity_type: string;
  entity_id: string;
  actor: string;
  body_preview: string;
  read: boolean;
  created_at: string;
}

export const notificationKeys = {
  all: ["notifications"] as const,
  list: (recipient: string) => ["notifications", "list", recipient] as const,
  unreadCount: (recipient: string) =>
    ["notifications", "unread", recipient] as const,
};

/** List notifications for a user */
export function useNotifications(recipient: string, unreadOnly = false) {
  return useQuery({
    queryKey: [...notificationKeys.list(recipient), unreadOnly],
    queryFn: async () => {
      let query = supabase
        .from("notifications")
        .select("*")
        .eq("recipient", recipient)
        .order("created_at", { ascending: false })
        .limit(50);

      if (unreadOnly) {
        query = query.eq("read", false);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as Notification[];
    },
    enabled: !!recipient,
  });
}

/** Count unread notifications */
export function useUnreadCount(recipient: string) {
  return useQuery({
    queryKey: notificationKeys.unreadCount(recipient),
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient", recipient)
        .eq("read", false);

      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    enabled: !!recipient,
    refetchInterval: 30000, // Poll every 30s as a fallback
  });
}

/** Mark a single notification as read */
export function useMarkRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("id", id);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** Mark all notifications as read for a user */
export function useMarkAllRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (recipient: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("recipient", recipient)
        .eq("read", false);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** Create a notification (used internally when a mention is detected) */
export function useCreateNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      recipient: string;
      type: string;
      discussion_id: string;
      entity_type: string;
      entity_id: string;
      actor: string;
      body_preview: string;
    }) => {
      const { error } = await supabase.from("notifications").insert(params);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
