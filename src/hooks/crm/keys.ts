// CRM query keys + real-time subscriptions

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";

export const crmKeys = {
  all: ["crm"] as const,
  companies: () => [...crmKeys.all, "companies"] as const,
  company: (id: string) => [...crmKeys.companies(), id] as const,
  contacts: () => [...crmKeys.all, "contacts"] as const,
  contactsByCompany: (companyId: string) =>
    [...crmKeys.contacts(), "company", companyId] as const,
  contact: (id: string) => [...crmKeys.contacts(), id] as const,
  deals: () => [...crmKeys.all, "deals"] as const,
  dealsByCompany: (companyId: string) =>
    [...crmKeys.deals(), "company", companyId] as const,
  deal: (id: string) => [...crmKeys.deals(), id] as const,
  activities: () => [...crmKeys.all, "activities"] as const,
  activitiesByCompany: (companyId: string) =>
    [...crmKeys.activities(), "company", companyId] as const,
  pipeline: () => [...crmKeys.all, "pipeline"] as const,
};

export function useCRMRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Subscribe to CRM table changes
    const channel = supabase
      .channel("crm-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crm_companies" },
        () => {
          queryClient.invalidateQueries({ queryKey: crmKeys.companies() });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crm_contacts" },
        () => {
          queryClient.invalidateQueries({ queryKey: crmKeys.contacts() });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crm_deals" },
        () => {
          queryClient.invalidateQueries({ queryKey: crmKeys.deals() });
          queryClient.invalidateQueries({ queryKey: crmKeys.pipeline() });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crm_activities" },
        () => {
          queryClient.invalidateQueries({ queryKey: crmKeys.activities() });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
