// Email query keys + real-time subscriptions

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";

export const emailKeys = {
  all: ["email"] as const,
  contacts: () => [...emailKeys.all, "contacts"] as const,
  contact: (id: string) => [...emailKeys.contacts(), id] as const,
  contactsByGroup: (groupId: string) =>
    [...emailKeys.contacts(), "group", groupId] as const,
  groups: () => [...emailKeys.all, "groups"] as const,
  group: (id: string) => [...emailKeys.groups(), id] as const,
  campaigns: () => [...emailKeys.all, "campaigns"] as const,
  campaign: (id: string) => [...emailKeys.campaigns(), id] as const,
  campaignStats: (id: string) =>
    [...emailKeys.campaigns(), id, "stats"] as const,
  events: () => [...emailKeys.all, "events"] as const,
  eventsByCampaign: (campaignId: string) =>
    [...emailKeys.events(), "campaign", campaignId] as const,
  eventsByContact: (contactId: string) =>
    [...emailKeys.events(), "contact", contactId] as const,
};

export function useEmailRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("email-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "email_contacts" },
        () => {
          queryClient.invalidateQueries({ queryKey: emailKeys.contacts() });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "email_groups" },
        () => {
          queryClient.invalidateQueries({ queryKey: emailKeys.groups() });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "email_contact_groups" },
        () => {
          queryClient.invalidateQueries({ queryKey: emailKeys.contacts() });
          queryClient.invalidateQueries({ queryKey: emailKeys.groups() });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "email_campaigns" },
        () => {
          queryClient.invalidateQueries({ queryKey: emailKeys.campaigns() });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "email_events" },
        () => {
          queryClient.invalidateQueries({ queryKey: emailKeys.events() });
          queryClient.invalidateQueries({ queryKey: emailKeys.campaigns() });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
