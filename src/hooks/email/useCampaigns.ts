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
    }: {
      campaignId: string;
      apiBaseUrl: string;
    }): Promise<{ sent: number; failed: number; errors: string[] }> => {
      return await invoke("email_send_campaign", {
        campaignId,
        apiBaseUrl,
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
