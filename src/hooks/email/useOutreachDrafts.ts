// Outreach draft hooks — list, approve, skip, batch approve

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { invoke } from "@tauri-apps/api/core";
import { emailKeys } from "./keys";
import { draftKeys } from "./useDrafts";
import type { EmailDraft } from "./useDrafts";

export interface OutreachDraft extends EmailDraft {
  draft_type: "outreach";
  // Joined contact/company info
  crm_contacts?: { id: string; name: string | null; email: string | null; linkedin_url: string | null; linkedin_connect_msg: string | null; linkedin_connect_status: string | null } | null;
  crm_companies?: { id: string; name: string | null } | null;
}

export const outreachKeys = {
  all: [...emailKeys.all, "outreach"] as const,
  list: (status?: string) => [...outreachKeys.all, "list", status || "all"] as const,
};

/** Fetch outreach drafts with optional status filter */
export function useOutreachDrafts(status?: string) {
  return useQuery({
    queryKey: outreachKeys.list(status),
    queryFn: async () => {
      let query = supabase
        .from("email_drafts")
        .select("*, crm_contacts(id, name, email, linkedin_url, linkedin_connect_msg, linkedin_connect_status), crm_companies(id, name)")
        .eq("draft_type", "outreach")
        .order("created_at", { ascending: false });

      if (status && status !== "all") {
        query = query.eq("status", status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as OutreachDraft[];
    },
  });
}

interface ApproveOutreachResult {
  success: boolean;
  outlook_message_id: string | null;
  error: string | null;
}

/** Approve an outreach draft — injects tracking and pushes to Outlook */
export function useApproveOutreach() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (draftId: string) => {
      return await invoke<ApproveOutreachResult>("email_approve_outreach", { draftId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: outreachKeys.all });
      queryClient.invalidateQueries({ queryKey: draftKeys.all });
    },
  });
}

/** Skip an outreach draft */
export function useSkipOutreach() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (draftId: string) => {
      return await invoke<boolean>("email_skip_outreach", { draftId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: outreachKeys.all });
      queryClient.invalidateQueries({ queryKey: draftKeys.all });
    },
  });
}

/** Batch approve outreach drafts */
export function useBatchApproveOutreach() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (draftIds: string[]) => {
      return await invoke<ApproveOutreachResult[]>("email_batch_approve_outreach", { draftIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: outreachKeys.all });
      queryClient.invalidateQueries({ queryKey: draftKeys.all });
    },
  });
}

/** Approve a LinkedIn connect message (just marks status, no automation) */
export function useApproveLinkedIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contactId, status }: { contactId: string; status: "approved" | "sent" }) => {
      const { error } = await supabase
        .from("crm_contacts")
        .update({ linkedin_connect_status: status })
        .eq("id", contactId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: outreachKeys.all });
    },
  });
}

/** Update LinkedIn connect message text */
export function useUpdateLinkedInMsg() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contactId, msg }: { contactId: string; msg: string }) => {
      const { error } = await supabase
        .from("crm_contacts")
        .update({ linkedin_connect_msg: msg, linkedin_connect_status: "draft" })
        .eq("id", contactId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: outreachKeys.all });
    },
  });
}
