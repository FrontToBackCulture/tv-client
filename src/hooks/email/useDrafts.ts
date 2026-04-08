// Email draft hooks — query drafts by contact, send/delete drafts

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { invoke } from "@tauri-apps/api/core";
import { emailKeys } from "./keys";

export interface EmailDraft {
  id: string;
  contact_id: string;
  company_id: string | null;
  to_email: string;
  subject: string;
  html_body: string;
  from_name: string;
  from_email: string;
  status: "draft" | "approved" | "sent" | "failed" | "skipped";
  created_at: string;
  sent_at: string | null;
  draft_type?: "manual" | "outreach";
  context?: Record<string, unknown> | null;
  automation_run_id?: string | null;
  outlook_message_id?: string | null;
}

export const draftKeys = {
  all: [...emailKeys.all, "drafts"] as const,
  byContact: (contactId: string) => [...draftKeys.all, "contact", contactId] as const,
};

/** Fetch drafts for a specific contact */
export function useEmailDrafts(contactId: string | undefined) {
  return useQuery({
    queryKey: draftKeys.byContact(contactId || ""),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_drafts")
        .select("*")
        .eq("contact_id", contactId!)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as EmailDraft[];
    },
    enabled: !!contactId,
  });
}

/** Send a draft (real send or test) */
export function useSendDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ draftId, testEmail }: { draftId: string; testEmail?: string }) => {
      return await invoke<{ success: boolean; message_id?: string; error?: string }>(
        "email_send_draft",
        { draftId, testEmail: testEmail || null }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: draftKeys.all });
    },
  });
}

/** Tracking events for a sent draft */
export interface DraftTrackingEvents {
  opened: boolean;
  openedAt: string | null;
  clicks: { url: string; at: string }[];
}

/** Fetch tracking events for a specific draft */
export function useDraftTracking(draftId: string | undefined, enabled: boolean = true) {
  return useQuery({
    queryKey: [...draftKeys.all, "tracking", draftId || ""],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_events")
        .select("event_type, url_clicked, occurred_at")
        .eq("draft_id", draftId!)
        .in("event_type", ["opened", "clicked"])
        .order("occurred_at", { ascending: true });

      if (error) throw error;

      const events = data || [];
      const openEvent = events.find(e => e.event_type === "opened");
      const clickEvents = events
        .filter(e => e.event_type === "clicked" && e.url_clicked)
        .map(e => ({ url: e.url_clicked!, at: e.occurred_at }));

      return {
        opened: !!openEvent,
        openedAt: openEvent?.occurred_at || null,
        clicks: clickEvents,
      } as DraftTrackingEvents;
    },
    enabled: !!draftId && enabled,
    refetchInterval: 30000, // poll every 30s for fresh tracking data
  });
}

/** Update a draft's fields (from_name, from_email, subject, html_body) */
export function useUpdateDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ draftId, updates }: { draftId: string; updates: Partial<Pick<EmailDraft, "from_name" | "from_email" | "subject" | "html_body">> }) => {
      const { error } = await supabase
        .from("email_drafts")
        .update(updates)
        .eq("id", draftId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: draftKeys.all });
    },
  });
}

/** Delete a draft */
export function useDeleteDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (draftId: string) => {
      const { error } = await supabase
        .from("email_drafts")
        .delete()
        .eq("id", draftId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: draftKeys.all });
    },
  });
}
