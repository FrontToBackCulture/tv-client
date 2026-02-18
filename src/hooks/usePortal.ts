// src/hooks/usePortal.ts

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type {
  Conversation,
  Message,
  PortalSite,
  ConversationFilters,
  Banner,
  Popup,
  ChangelogEntry,
  PortalDoc,
} from "../lib/portal/types";

// Query keys
export const portalKeys = {
  all: ["portal"] as const,
  sites: () => [...portalKeys.all, "sites"] as const,
  conversations: () => [...portalKeys.all, "conversations"] as const,
  conversationsByFilter: (filters: ConversationFilters) =>
    [...portalKeys.conversations(), filters] as const,
  conversation: (id: string) => [...portalKeys.conversations(), id] as const,
  messages: (conversationId: string) =>
    [...portalKeys.all, "messages", conversationId] as const,
  banners: () => [...portalKeys.all, "banners"] as const,
  popups: () => [...portalKeys.all, "popups"] as const,
  changelog: () => [...portalKeys.all, "changelog"] as const,
  docs: () => [...portalKeys.all, "docs"] as const,
};

// ── Sites ──

export function usePortalSites() {
  return useQuery({
    queryKey: portalKeys.sites(),
    queryFn: async (): Promise<PortalSite[]> => {
      const { data, error } = await supabase
        .from("portal_sites")
        .select("*")
        .order("name");
      if (error) throw new Error(`Failed to fetch sites: ${error.message}`);
      return (data ?? []) as PortalSite[];
    },
  });
}

// ── Conversations ──

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
    refetchInterval: 10000, // Poll every 10s as backup to realtime
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

// ── Messages ──

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
      // Update conversation status: agent reply → active, internal note → no change
      if (variables.content_type !== "internal_note") {
        await supabase
          .from("portal_conversations")
          .update({
            status: "active",
            updated_at: new Date().toISOString(),
          })
          .eq("id", data.conversation_id);
      } else {
        // Still bump updated_at for internal notes
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

// ── Banners ──

export function useBanners() {
  return useQuery({
    queryKey: portalKeys.banners(),
    queryFn: async (): Promise<Banner[]> => {
      const { data, error } = await supabase
        .from("portal_banners")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw new Error(`Failed to fetch banners: ${error.message}`);
      return (data ?? []) as Banner[];
    },
  });
}

export function useCreateBanner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (banner: Partial<Banner>): Promise<Banner> => {
      const { data, error } = await supabase
        .from("portal_banners")
        .insert(banner)
        .select()
        .single();
      if (error) throw new Error(`Failed to create banner: ${error.message}`);
      return data as Banner;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.banners() });
    },
  });
}

export function useUpdateBanner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<Banner> & { id: string }): Promise<Banner> => {
      const { data, error } = await supabase
        .from("portal_banners")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update banner: ${error.message}`);
      return data as Banner;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.banners() });
    },
  });
}

export function useDeleteBanner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from("portal_banners")
        .delete()
        .eq("id", id);
      if (error) throw new Error(`Failed to delete banner: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.banners() });
    },
  });
}

// ── Popups ──

export function usePopups() {
  return useQuery({
    queryKey: portalKeys.popups(),
    queryFn: async (): Promise<Popup[]> => {
      const { data, error } = await supabase
        .from("portal_popups")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw new Error(`Failed to fetch popups: ${error.message}`);
      return (data ?? []) as Popup[];
    },
  });
}

export function useCreatePopup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (popup: Partial<Popup>): Promise<Popup> => {
      const { data, error } = await supabase
        .from("portal_popups")
        .insert(popup)
        .select()
        .single();
      if (error) throw new Error(`Failed to create popup: ${error.message}`);
      return data as Popup;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.popups() });
    },
  });
}

export function useUpdatePopup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<Popup> & { id: string }): Promise<Popup> => {
      const { data, error } = await supabase
        .from("portal_popups")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update popup: ${error.message}`);
      return data as Popup;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.popups() });
    },
  });
}

export function useDeletePopup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from("portal_popups")
        .delete()
        .eq("id", id);
      if (error) throw new Error(`Failed to delete popup: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.popups() });
    },
  });
}

// ── Changelog ──

export function useChangelog() {
  return useQuery({
    queryKey: portalKeys.changelog(),
    queryFn: async (): Promise<ChangelogEntry[]> => {
      const { data, error } = await supabase
        .from("portal_changelog")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw new Error(`Failed to fetch changelog: ${error.message}`);
      return (data ?? []) as ChangelogEntry[];
    },
  });
}

export function useCreateChangelog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entry: Partial<ChangelogEntry>): Promise<ChangelogEntry> => {
      const isPublished = entry.is_published ?? false;
      const { data, error } = await supabase
        .from("portal_changelog")
        .insert({
          ...entry,
          is_published: isPublished,
          published_at: isPublished ? new Date().toISOString() : null,
        })
        .select()
        .single();
      if (error) throw new Error(`Failed to create changelog entry: ${error.message}`);
      return data as ChangelogEntry;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.changelog() });
    },
  });
}

export function useUpdateChangelog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<ChangelogEntry> & { id: string }): Promise<ChangelogEntry> => {
      const payload: Record<string, unknown> = {
        ...updates,
        updated_at: new Date().toISOString(),
      };
      // Set published_at on first publish
      if (updates.is_published === true) {
        // Fetch existing to check if already has published_at
        const { data: existing } = await supabase
          .from("portal_changelog")
          .select("published_at")
          .eq("id", id)
          .single();
        if (existing && !existing.published_at) {
          payload.published_at = new Date().toISOString();
        }
      }
      const { data, error } = await supabase
        .from("portal_changelog")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update changelog entry: ${error.message}`);
      return data as ChangelogEntry;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.changelog() });
    },
  });
}

export function useDeleteChangelog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from("portal_changelog")
        .delete()
        .eq("id", id);
      if (error) throw new Error(`Failed to delete changelog entry: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.changelog() });
    },
  });
}

// ── Sites (CRUD) ──

export function useCreateSite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      slug: string;
      base_url?: string;
    }): Promise<PortalSite> => {
      const { data, error } = await supabase
        .from("portal_sites")
        .insert({
          name: input.name,
          slug: input.slug,
          base_url: input.base_url || null,
          config: {},
        })
        .select()
        .single();
      if (error) throw new Error(`Failed to create site: ${error.message}`);
      return data as PortalSite;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.sites() });
    },
  });
}

export function useUpdateSite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string;
      features?: Record<string, boolean>;
      name?: string;
      slug?: string;
      base_url?: string;
    }): Promise<PortalSite> => {
      // Get existing config to merge
      const { data: existing } = await supabase
        .from("portal_sites")
        .select("config")
        .eq("id", id)
        .single();

      const currentConfig = (existing?.config || {}) as Record<string, unknown>;
      const updatedConfig = {
        ...currentConfig,
        features: {
          ...((currentConfig.features as Record<string, boolean>) || {}),
          ...(updates.features || {}),
        },
      };

      const payload: Record<string, unknown> = {
        config: updatedConfig,
        updated_at: new Date().toISOString(),
      };
      if (updates.name) payload.name = updates.name;
      if (updates.slug) payload.slug = updates.slug;
      if (updates.base_url !== undefined) payload.base_url = updates.base_url || null;

      const { data, error } = await supabase
        .from("portal_sites")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update site: ${error.message}`);
      return data as PortalSite;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.sites() });
    },
  });
}

export function useDeleteSite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from("portal_sites")
        .delete()
        .eq("id", id);
      if (error) throw new Error(`Failed to delete site: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.sites() });
    },
  });
}

// ── Docs (Help Center) ──

export function usePortalDocs() {
  return useQuery({
    queryKey: portalKeys.docs(),
    queryFn: async (): Promise<PortalDoc[]> => {
      const { data, error } = await supabase
        .from("portal_docs")
        .select("*")
        .order("sort_order")
        .order("created_at", { ascending: false });
      if (error) throw new Error(`Failed to fetch docs: ${error.message}`);
      return (data ?? []) as PortalDoc[];
    },
  });
}

export function useCreateDoc() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (doc: Partial<PortalDoc>): Promise<PortalDoc> => {
      const { data, error } = await supabase
        .from("portal_docs")
        .insert({
          title: doc.title || "Untitled",
          summary: doc.summary || null,
          content: doc.content || "",
          category: doc.category || null,
          doc_type: doc.doc_type || "article",
          tags: doc.tags || [],
          is_widget_visible: doc.is_widget_visible ?? false,
          sort_order: doc.sort_order ?? 0,
          target_sites: doc.target_sites || [],
        })
        .select()
        .single();
      if (error) throw new Error(`Failed to create doc: ${error.message}`);
      return data as PortalDoc;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.docs() });
    },
  });
}

export function useUpdateDoc() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<PortalDoc> & { id: string }): Promise<PortalDoc> => {
      const { data, error } = await supabase
        .from("portal_docs")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update doc: ${error.message}`);
      return data as PortalDoc;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.docs() });
    },
  });
}

export function useDeleteDoc() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from("portal_docs")
        .delete()
        .eq("id", id);
      if (error) throw new Error(`Failed to delete doc: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.docs() });
    },
  });
}

// ── Realtime ──

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
