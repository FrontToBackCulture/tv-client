// src/hooks/useRealtimeSync.ts
// Subscribe to Supabase Realtime for automatic UI updates when data changes

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

// Tables to watch and their corresponding query keys (reference for documentation)
const _CRM_TABLES = ["crm_companies", "crm_contacts", "crm_deals", "crm_activities", "task_deal_links"];
const _WORK_TABLES = ["tasks", "projects", "initiatives", "milestones", "project_updates"];
void _CRM_TABLES; void _WORK_TABLES; // Suppress unused warnings

export function useRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channels: RealtimeChannel[] = [];

    // Subscribe to CRM tables
    const crmChannel = supabase
      .channel("crm-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "crm_companies",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["crm", "companies"] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "crm_contacts",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["crm", "contacts"] });
          queryClient.invalidateQueries({ queryKey: ["crm", "companies"] }); // Contacts affect company details
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "crm_deals",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["crm", "deals"] });
          queryClient.invalidateQueries({ queryKey: ["crm", "companies"] }); // Deals affect company details
          queryClient.invalidateQueries({ queryKey: ["crm", "pipeline"] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "crm_activities",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["crm", "activities"] });
          queryClient.invalidateQueries({ queryKey: ["crm", "companies"] }); // Activities shown in company detail
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "task_deal_links",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["crm", "deals"] }); // Tasks shown in deal cards
          queryClient.invalidateQueries({ queryKey: ["crm", "deal-tasks"] });
        }
      )
      .subscribe();

    channels.push(crmChannel);

    // Subscribe to Work tables
    const workChannel = supabase
      .channel("work-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["work", "tasks"] });
          queryClient.invalidateQueries({ queryKey: ["work", "projects"] }); // Task counts in projects
          queryClient.invalidateQueries({ queryKey: ["crm", "deals"] }); // Tasks shown in deal cards
          queryClient.invalidateQueries({ queryKey: ["crm", "deal-tasks"] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "projects",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["work", "projects"] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "initiatives",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["work", "initiatives"] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "milestones",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["work", "milestones"] });
          queryClient.invalidateQueries({ queryKey: ["work", "projects"] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_updates",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["work", "project-updates"] });
          queryClient.invalidateQueries({ queryKey: ["work", "projects"] });
        }
      )
      .subscribe();

    channels.push(workChannel);

    // Cleanup on unmount
    return () => {
      channels.forEach((channel) => {
        supabase.removeChannel(channel);
      });
    };
  }, [queryClient]);
}
