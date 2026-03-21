// src/hooks/useRealtimeSync.ts
// Subscribe to Supabase Realtime for automatic UI updates when data changes

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

// Tables to watch and their corresponding query keys (reference for documentation)
const _CRM_TABLES = ["crm_companies", "crm_contacts", "crm_activities"];
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
          table: "crm_activities",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["crm", "activities"] });
          queryClient.invalidateQueries({ queryKey: ["crm", "companies"] }); // Activities shown in company detail
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
          // Projects table now contains deals and workspaces too
          queryClient.invalidateQueries({ queryKey: ["crm", "deals"] });
          queryClient.invalidateQueries({ queryKey: ["crm", "pipeline"] });
          queryClient.invalidateQueries({ queryKey: ["crm", "companies"] });
          queryClient.invalidateQueries({ queryKey: ["workspaces"] });
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

    // Subscribe to API task logs (Slack-triggered skills)
    const schedulerChannel = supabase
      .channel("scheduler-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "api_task_logs",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["api-task-logs"] });
        }
      )
      .subscribe();

    channels.push(schedulerChannel);

    // Subscribe to Workspace child tables (sessions/artifacts/context — still their own tables)
    const workspaceChannel = supabase
      .channel("workspace-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "workspace_sessions",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["workspaces"] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "workspace_artifacts",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["workspaces"] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "workspace_context",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["workspaces"] });
        }
      )
      .subscribe();

    channels.push(workspaceChannel);

    // Subscribe to Feed tables
    const feedChannel = supabase
      .channel("feed-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "feed_cards",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["feed"] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "feed_interactions",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["feed"] });
        }
      )
      .subscribe();

    channels.push(feedChannel);

    // Subscribe to Discussions table
    const discussionsChannel = supabase
      .channel("discussions-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "discussions",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["discussions"] });
        }
      )
      .subscribe();

    channels.push(discussionsChannel);

    // Subscribe to Notifications table
    const notificationsChannel = supabase
      .channel("notifications-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
        }
      )
      .subscribe();

    channels.push(notificationsChannel);

    // Cleanup on unmount
    return () => {
      channels.forEach((channel) => {
        supabase.removeChannel(channel);
      });
    };
  }, [queryClient]);
}
