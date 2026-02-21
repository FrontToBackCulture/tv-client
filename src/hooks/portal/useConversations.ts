// Portal Conversations + Messages hooks

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type {
  Conversation,
  Message,
  ConversationFilters,
} from "../../lib/portal/types";
import { portalKeys } from "./keys";

export function useConversations(filters?: ConversationFilters) {
  return useQuery({
    queryKey: portalKeys.conversationsByFilter(filters || {}),
    queryFn: async (): Promise<Conversation[]> => {
      let query = supabase
        .from("portal_conversations")
        .select("*, site:portal_sites(*)")
        .order("updated_at", { ascending: false })
        .limit(100);

      if (filters?.site_id) {
        query = query.eq("site_id", filters.site_id);
      }
      if (filters?.status) {
        query = query.eq("status", filters.status);
      }

      const { data, error } = await query;
      if (error) throw new Error(`Failed to fetch conversations: ${error.message}`);
      return (data ?? []) as Conversation[];
    },
    refetchInterval: 10000,
  });
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: portalKeys.conversation(id || ""),
    queryFn: async (): Promise<Conversation | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("portal_conversations")
        .select("*, site:portal_sites(*)")
        .eq("id", id)
        .single();
      if (error?.code === "PGRST116") return null;
      if (error) throw new Error(`Failed to fetch conversation: ${error.message}`);
      return data as Conversation;
    },
    enabled: !!id,
  });
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: portalKeys.messages(conversationId || ""),
    queryFn: async (): Promise<Message[]> => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from("portal_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(`Failed to fetch messages: ${error.message}`);
      return (data ?? []) as Message[];
    },
    enabled: !!conversationId,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (msg: {
      conversation_id: string;
      sender_type: "agent" | "system";
      sender_id?: string;
      sender_name?: string;
      content: string;
      content_type?: string;
    }): Promise<Message> => {
      const { data, error } = await supabase
        .from("portal_messages")
        .insert({
          conversation_id: msg.conversation_id,
          sender_type: msg.sender_type,
          sender_id: msg.sender_id || null,
          sender_name: msg.sender_name || null,
          content: msg.content,
          content_type: msg.content_type || "text",
          attachments: [],
        })
        .select()
        .single();
      if (error) throw new Error(`Failed to send message: ${error.message}`);
      return data as Message;
    },
    onSuccess: async (data, variables) => {
      if (variables.content_type !== "internal_note") {
        await supabase
          .from("portal_conversations")
          .update({
            status: "active",
            updated_at: new Date().toISOString(),
          })
          .eq("id", data.conversation_id);
      } else {
        await supabase
          .from("portal_conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", data.conversation_id);
      }

      queryClient.invalidateQueries({
        queryKey: portalKeys.messages(data.conversation_id),
      });
      queryClient.invalidateQueries({
        queryKey: portalKeys.conversations(),
      });
    },
  });
}

export function useUpdateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string;
      status?: string;
      assigned_to?: string | null;
    }): Promise<Conversation> => {
      const { data, error } = await supabase
        .from("portal_conversations")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update conversation: ${error.message}`);
      return data as Conversation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.conversations() });
    },
  });
}

export function usePortalRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("portal-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "portal_messages" },
        (payload) => {
          const msg = payload.new as Message;
          if (msg?.conversation_id) {
            queryClient.invalidateQueries({
              queryKey: portalKeys.messages(msg.conversation_id),
            });
          }
          queryClient.invalidateQueries({
            queryKey: portalKeys.conversations(),
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "portal_conversations" },
        () => {
          queryClient.invalidateQueries({
            queryKey: portalKeys.conversations(),
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
