// Email Campaigns CRUD hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "../../lib/supabase";
import type {
  EmailCampaign,
  EmailCampaignInsert,
  EmailCampaignUpdate,
  EmailCampaignFilters,
  EmailCampaignWithStats,
  CampaignStats,
} from "../../lib/email/types";
import { emailKeys } from "./keys";

export function useEmailCampaigns(filters?: EmailCampaignFilters) {
  return useQuery({
    queryKey: [...emailKeys.campaigns(), filters],
    queryFn: async (): Promise<EmailCampaignWithStats[]> => {
      let query = supabase
        .from("email_campaigns")
        .select("*, email_groups(id, name)");

      if (filters?.status) {
        if (Array.isArray(filters.status)) {
          query = query.in("status", filters.status);
        } else {
          query = query.eq("status", filters.status);
        }
      }

      if (filters?.groupId) {
        query = query.eq("group_id", filters.groupId);
      }

      if (filters?.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,subject.ilike.%${filters.search}%`
        );
      }

      const { data, error } = await query.order("created_at", {
        ascending: false,
      });

      if (error)
        throw new Error(`Failed to fetch campaigns: ${error.message}`);

      return (data ?? []).map((campaign: any) => ({
        ...campaign,
        group: campaign.email_groups,
        email_groups: undefined,
      }));
    },
  });
}

export function useEmailCampaign(id: string | null) {
  return useQuery({
    queryKey: emailKeys.campaign(id || ""),
    queryFn: async (): Promise<EmailCampaignWithStats | null> => {
      if (!id) return null;

      const { data, error } = await supabase
        .from("email_campaigns")
        .select("*, email_groups(id, name)")
        .eq("id", id)
        .single();

      if (error?.code === "PGRST116") return null;
      if (error)
        throw new Error(`Failed to fetch campaign: ${error.message}`);

      return {
        ...data,
        group: (data as any).email_groups,
        email_groups: undefined,
      };
    },
    enabled: !!id,
  });
}

export function useCampaignStats(campaignId: string | null) {
  return useQuery({
    queryKey: emailKeys.campaignStats(campaignId || ""),
    queryFn: async (): Promise<CampaignStats | null> => {
      if (!campaignId) return null;

      const { data: events, error } = await supabase
        .from("email_events")
        .select("event_type, contact_id")
        .eq("campaign_id", campaignId);

      if (error)
        throw new Error(`Failed to fetch campaign stats: ${error.message}`);

      const allEvents = events ?? [];
      const sent = new Set(
        allEvents
          .filter((e) => e.event_type === "sent")
          .map((e) => e.contact_id)
      ).size;
      const bounced = new Set(
        allEvents
          .filter((e) => e.event_type === "bounced")
          .map((e) => e.contact_id)
      ).size;
      const delivered = sent - bounced;
      const opened = new Set(
        allEvents
          .filter((e) => e.event_type === "opened")
          .map((e) => e.contact_id)
      ).size;
      const clicked = new Set(
        allEvents
          .filter((e) => e.event_type === "clicked")
          .map((e) => e.contact_id)
      ).size;
      const complained = new Set(
        allEvents
          .filter((e) => e.event_type === "complained")
          .map((e) => e.contact_id)
      ).size;
      const unsubscribed = new Set(
        allEvents
          .filter((e) => e.event_type === "unsubscribed")
          .map((e) => e.contact_id)
      ).size;

      return {
        sent,
        delivered,
        opened,
        clicked,
        bounced,
        complained,
        unsubscribed,
        openRate: delivered > 0 ? (opened / delivered) * 100 : 0,
        clickRate: delivered > 0 ? (clicked / delivered) * 100 : 0,
      };
    },
    enabled: !!campaignId,
  });
}

// Event priority for determining "latest" status per contact
const EVENT_PRIORITY: Record<string, number> = {
  complained: 7,
  bounced: 6,
  unsubscribed: 5,
  clicked: 4,
  opened: 3,
  delivered: 2,
  sent: 1,
};

export interface CampaignRecipient {
  contactId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  latestEvent: string; // "sent" | "delivered" | "opened" | "clicked" | "bounced" | "complained" | "unsubscribed" | "pending"
}

export function useCampaignRecipients(campaignId: string | null, groupId: string | null) {
  return useQuery({
    queryKey: [...emailKeys.eventsByCampaign(campaignId || ""), "recipients"],
    queryFn: async (): Promise<CampaignRecipient[]> => {
      if (!campaignId || !groupId) return [];

      // Fetch group contacts
      const { data: memberships } = await supabase
        .from("email_contact_groups")
        .select("contact_id")
        .eq("group_id", groupId);

      const contactIds = (memberships ?? []).map((m) => m.contact_id);
      if (contactIds.length === 0) return [];

      // Fetch contacts
      const { data: contacts } = await supabase
        .from("email_contacts")
        .select("id, email, first_name, last_name, status")
        .in("id", contactIds);

      // Fetch events for this campaign
      const { data: events } = await supabase
        .from("email_events")
        .select("contact_id, event_type")
        .eq("campaign_id", campaignId);

      // Build latest event per contact (highest priority wins)
      const eventMap = new Map<string, string>();
      for (const ev of events ?? []) {
        const current = eventMap.get(ev.contact_id);
        const currentPri = current ? (EVENT_PRIORITY[current] || 0) : 0;
        const newPri = EVENT_PRIORITY[ev.event_type] || 0;
        if (newPri > currentPri) {
          eventMap.set(ev.contact_id, ev.event_type);
        }
      }

      return (contacts ?? []).map((c) => {
        const contactStatus = c.status || "active";
        const isActive = contactStatus === "active";
        return {
          contactId: c.id,
          email: c.email,
          firstName: c.first_name,
          lastName: c.last_name,
          latestEvent: eventMap.get(c.id) || (isActive ? "pending" : "skipped"),
        };
      });
    },
    enabled: !!campaignId && !!groupId,
  });
}

export function useCreateEmailCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      campaign: EmailCampaignInsert
    ): Promise<EmailCampaign> => {
      const { data, error } = await supabase
        .from("email_campaigns")
        .insert(campaign)
        .select()
        .single();

      if (error)
        throw new Error(`Failed to create campaign: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.campaigns() });
    },
  });
}

export function useUpdateEmailCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: EmailCampaignUpdate;
    }): Promise<EmailCampaign> => {
      const { data, error } = await supabase
        .from("email_campaigns")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error)
        throw new Error(`Failed to update campaign: ${error.message}`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: emailKeys.campaigns() });
      queryClient.invalidateQueries({ queryKey: emailKeys.campaign(data.id) });
    },
  });
}

export function useSendCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      campaignId,
      apiBaseUrl,
      knowledgePath,
    }: {
      campaignId: string;
      apiBaseUrl: string;
      knowledgePath?: string;
    }): Promise<{ sent: number; failed: number; errors: string[] }> => {
      return await invoke("email_send_campaign", {
        campaignId,
        apiBaseUrl,
        knowledgePath: knowledgePath || null,
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: emailKeys.campaigns() });
      queryClient.invalidateQueries({
        queryKey: emailKeys.campaign(variables.campaignId),
      });
      queryClient.invalidateQueries({
        queryKey: emailKeys.campaignStats(variables.campaignId),
      });
    },
  });
}

export function useSendTestEmail() {
  return useMutation({
    mutationFn: async ({
      campaignId,
      testEmail,
      apiBaseUrl,
      knowledgePath,
    }: {
      campaignId: string;
      testEmail: string;
      apiBaseUrl: string;
      knowledgePath?: string;
    }): Promise<{ success: boolean; error: string | null }> => {
      return await invoke("email_send_test", {
        campaignId,
        testEmail,
        apiBaseUrl,
        knowledgePath: knowledgePath || null,
      });
    },
  });
}

export function useDeleteEmailCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from("email_campaigns")
        .delete()
        .eq("id", id);

      if (error)
        throw new Error(`Failed to delete campaign: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.campaigns() });
    },
  });
}

export function useCloneEmailCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<EmailCampaign> => {
      const { data: original, error: fetchError } = await supabase
        .from("email_campaigns")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchError || !original)
        throw new Error(`Failed to fetch campaign: ${fetchError?.message}`);

      const { data, error } = await supabase
        .from("email_campaigns")
        .insert({
          name: `${original.name} (copy)`,
          subject: original.subject,
          from_name: original.from_name,
          from_email: original.from_email,
          group_id: original.group_id,
          content_path: original.content_path,
          html_body: original.html_body,
          report_path: original.report_path,
          bcc_email: original.bcc_email,
          status: "draft",
        })
        .select()
        .single();

      if (error)
        throw new Error(`Failed to clone campaign: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.campaigns() });
    },
  });
}
