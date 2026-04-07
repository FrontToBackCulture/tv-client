// src/hooks/useSharedInbox.ts
// React Query hooks + realtime for the shared inbox module

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { formatError } from "../lib/formatError";

// ─── Types ──────────────────────────────────────

export interface SharedMailbox {
  id: string;
  label: string;
  email_address: string;
  active: boolean;
  last_synced_at: string | null;
  last_sync_error: string | null;
  created_at: string;
  created_by: string | null;
}

export interface SharedEmail {
  id: string;
  mailbox_id: string;
  graph_message_id: string;
  conversation_id: string | null;
  subject: string | null;
  from_name: string | null;
  from_email: string | null;
  to_addresses: Array<{ name: string; email: string }> | null;
  cc_addresses: Array<{ name: string; email: string }> | null;
  received_at: string | null;
  preview: string | null;
  body_html: string | null;
  has_attachments: boolean;
  importance: string | null;
  is_read_in_source: boolean;
  web_link: string | null;
  folder_name: string;
  created_at: string;
}

// ─── Query Keys ─────────────────────────────────

const keys = {
  mailboxes: ["shared-inbox", "mailboxes"] as const,
  emails: (mailboxId?: string) => ["shared-inbox", "emails", mailboxId] as const,
  body: (emailId: string) => ["shared-inbox", "body", emailId] as const,
};

// ─── Mailboxes ──────────────────────────────────

export function useSharedMailboxes() {
  return useQuery({
    queryKey: keys.mailboxes,
    queryFn: async (): Promise<SharedMailbox[]> => {
      const { data, error } = await supabase
        .from("shared_mailboxes")
        .select("*")
        .eq("active", true)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 5,
  });
}

// ─── Emails ─────────────────────────────────────

export function useSharedEmails(mailboxId?: string) {
  return useQuery({
    queryKey: keys.emails(mailboxId),
    queryFn: async (): Promise<SharedEmail[]> => {
      if (!mailboxId) return [];
      const { data, error } = await supabase
        .from("shared_emails")
        .select("*")
        .eq("mailbox_id", mailboxId)
        .order("received_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    enabled: !!mailboxId,
    staleTime: 1000 * 60,
  });
}

// ─── Email Body (on-demand fetch via Edge Function) ──

export function useSharedEmailBody(emailId: string | null) {
  return useQuery({
    queryKey: keys.body(emailId || ""),
    queryFn: async (): Promise<string> => {
      if (!emailId) return "";

      // First check if body_html is already in the cached email data
      const { data: email } = await supabase
        .from("shared_emails")
        .select("body_html")
        .eq("id", emailId)
        .single();

      if (email?.body_html) return email.body_html;

      // Fetch via Edge Function
      const { data, error } = await supabase.functions.invoke("shared-inbox-body", {
        body: { email_id: emailId },
      });
      if (error) throw new Error(formatError(error));
      return data?.body_html || "";
    },
    enabled: !!emailId,
    staleTime: 1000 * 60 * 30, // body doesn't change, cache for 30 min
  });
}

// ─── Sync (manual trigger) ──────────────────────

export function useSyncSharedMailbox() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (mailboxId?: string) => {
      const { data, error } = await supabase.functions.invoke("shared-inbox-sync", {
        body: mailboxId ? { mailbox_id: mailboxId } : {},
      });
      if (error) throw new Error(formatError(error));
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shared-inbox"] });
    },
  });
}

// ─── Register Mailbox ───────────────────────────

export interface RegisterMailboxInput {
  code: string;
  label: string;
  email_address: string;
  tenant_id: string;
  client_id: string;
  client_secret: string;
  redirect_uri: string;
}

export function useRegisterSharedMailbox() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RegisterMailboxInput) => {
      const { data, error } = await supabase.functions.invoke("shared-inbox-register", {
        body: input,
      });
      if (error) throw new Error(formatError(error));
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.mailboxes });
    },
  });
}

// ─── Remove Mailbox ─────────────────────────────

export function useRemoveSharedMailbox() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (mailboxId: string) => {
      const { error } = await supabase
        .from("shared_mailboxes")
        .update({ active: false })
        .eq("id", mailboxId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.mailboxes });
    },
  });
}

// ─── Realtime ───────────────────────────────────

export function useSharedInboxRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("shared-inbox-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shared_emails" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["shared-inbox", "emails"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shared_mailboxes" },
        () => {
          queryClient.invalidateQueries({ queryKey: keys.mailboxes });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
