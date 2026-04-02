// src/hooks/useRealtimeSync.ts
// Subscribe to Supabase Realtime for automatic UI updates when data changes
// All Supabase-backed tables are subscribed here at app level so updates
// are received regardless of which module is currently mounted.

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

export function useRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channels: RealtimeChannel[] = [];

    // Helper to reduce boilerplate
    const pg = (table: string) =>
      ({ event: "*", schema: "public", table } as const);

    // ── CRM ──────────────────────────────────────────────────────────
    const crmChannel = supabase
      .channel("crm-changes")
      .on("postgres_changes", pg("crm_companies"), () => {
        queryClient.invalidateQueries({ queryKey: ["crm", "companies"] });
      })
      .on("postgres_changes", pg("crm_contacts"), () => {
        queryClient.invalidateQueries({ queryKey: ["crm", "contacts"] });
        queryClient.invalidateQueries({ queryKey: ["crm", "companies"] });
        queryClient.invalidateQueries({ queryKey: ["email", "contacts"] });
      })
      .on("postgres_changes", pg("crm_activities"), () => {
        queryClient.invalidateQueries({ queryKey: ["crm", "activities"] });
        queryClient.invalidateQueries({ queryKey: ["crm", "companies"] });
      })
      .subscribe();
    channels.push(crmChannel);

    // ── Work ─────────────────────────────────────────────────────────
    const workChannel = supabase
      .channel("work-changes")
      .on("postgres_changes", pg("tasks"), () => {
        queryClient.invalidateQueries({ queryKey: ["work", "tasks"] });
        queryClient.invalidateQueries({ queryKey: ["crm", "deal-tasks"] });
      })
      .on("postgres_changes", pg("projects"), () => {
        queryClient.invalidateQueries({ queryKey: ["work", "projects"] });
        queryClient.invalidateQueries({ queryKey: ["crm", "deals"] });
        queryClient.invalidateQueries({ queryKey: ["crm", "pipeline"] });
        queryClient.invalidateQueries({ queryKey: ["crm", "companies"] });
        queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      })
      .on("postgres_changes", pg("initiatives"), () => {
        queryClient.invalidateQueries({ queryKey: ["work", "initiatives"] });
      })
      .on("postgres_changes", pg("milestones"), () => {
        queryClient.invalidateQueries({ queryKey: ["work", "milestones"] });
        queryClient.invalidateQueries({ queryKey: ["work", "projects"] });
      })
      .on("postgres_changes", pg("project_updates"), () => {
        queryClient.invalidateQueries({ queryKey: ["work", "project-updates"] });
        queryClient.invalidateQueries({ queryKey: ["work", "projects"] });
      })
      .subscribe();
    channels.push(workChannel);

    // ── Email ────────────────────────────────────────────────────────
    const emailChannel = supabase
      .channel("email-changes")
      .on("postgres_changes", pg("email_groups"), () => {
        queryClient.invalidateQueries({ queryKey: ["email", "groups"] });
      })
      .on("postgres_changes", pg("email_contact_groups"), () => {
        queryClient.invalidateQueries({ queryKey: ["email", "contacts"] });
        queryClient.invalidateQueries({ queryKey: ["email", "groups"] });
      })
      .on("postgres_changes", pg("email_campaigns"), () => {
        queryClient.invalidateQueries({ queryKey: ["email", "campaigns"] });
      })
      .on("postgres_changes", pg("email_events"), () => {
        queryClient.invalidateQueries({ queryKey: ["email", "events"] });
        queryClient.invalidateQueries({ queryKey: ["email", "campaigns"] });
      })
      .on("postgres_changes", pg("email_drafts"), () => {
        queryClient.invalidateQueries({ queryKey: ["email", "drafts"] });
      })
      .subscribe();
    channels.push(emailChannel);

    // ── Portal ───────────────────────────────────────────────────────
    const portalChannel = supabase
      .channel("portal-changes")
      .on("postgres_changes", pg("portal_conversations"), () => {
        queryClient.invalidateQueries({ queryKey: ["portal", "conversations"] });
      })
      .on("postgres_changes", pg("portal_messages"), () => {
        queryClient.invalidateQueries({ queryKey: ["portal", "messages"] });
        queryClient.invalidateQueries({ queryKey: ["portal", "conversations"] });
      })
      .on("postgres_changes", pg("portal_sites"), () => {
        queryClient.invalidateQueries({ queryKey: ["portal", "sites"] });
      })
      .on("postgres_changes", pg("portal_banners"), () => {
        queryClient.invalidateQueries({ queryKey: ["portal", "banners"] });
      })
      .on("postgres_changes", pg("portal_popups"), () => {
        queryClient.invalidateQueries({ queryKey: ["portal", "popups"] });
      })
      .on("postgres_changes", pg("portal_changelog"), () => {
        queryClient.invalidateQueries({ queryKey: ["portal", "changelog"] });
      })
      .on("postgres_changes", pg("portal_docs"), () => {
        queryClient.invalidateQueries({ queryKey: ["portal", "docs"] });
      })
      .subscribe();
    channels.push(portalChannel);

    // ── Product ──────────────────────────────────────────────────────
    const productChannel = supabase
      .channel("product-changes")
      .on("postgres_changes", pg("product_modules"), () => {
        queryClient.invalidateQueries({ queryKey: ["product", "modules"] });
      })
      .on("postgres_changes", pg("product_features"), () => {
        queryClient.invalidateQueries({ queryKey: ["product", "features"] });
      })
      .on("postgres_changes", pg("product_connectors"), () => {
        queryClient.invalidateQueries({ queryKey: ["product", "connectors"] });
      })
      .on("postgres_changes", pg("product_solutions"), () => {
        queryClient.invalidateQueries({ queryKey: ["product", "solutions"] });
      })
      .on("postgres_changes", pg("product_releases"), () => {
        queryClient.invalidateQueries({ queryKey: ["product", "releases"] });
      })
      .on("postgres_changes", pg("product_release_items"), () => {
        queryClient.invalidateQueries({ queryKey: ["product", "releases"] });
      })
      .on("postgres_changes", pg("product_deployments"), () => {
        queryClient.invalidateQueries({ queryKey: ["product", "deployments"] });
      })
      .on("postgres_changes", pg("product_activity"), () => {
        queryClient.invalidateQueries({ queryKey: ["product", "activity"] });
      })
      .on("postgres_changes", pg("product_task_links"), () => {
        queryClient.invalidateQueries({ queryKey: ["product", "task-links"] });
      })
      .subscribe();
    channels.push(productChannel);

    // ── Skills ───────────────────────────────────────────────────────
    const skillsChannel = supabase
      .channel("skills-changes")
      .on("postgres_changes", pg("skills"), () => {
        queryClient.invalidateQueries({ queryKey: ["skills"] });
      })
      .on("postgres_changes", pg("skill_activity"), () => {
        queryClient.invalidateQueries({ queryKey: ["skill-activity"] });
      })
      .on("postgres_changes", pg("skill_library"), () => {
        queryClient.invalidateQueries({ queryKey: ["skill-library"] });
      })
      .subscribe();
    channels.push(skillsChannel);

    // ── Scheduler ────────────────────────────────────────────────────
    const schedulerChannel = supabase
      .channel("scheduler-changes")
      .on("postgres_changes", pg("api_task_logs"), () => {
        queryClient.invalidateQueries({ queryKey: ["api-task-logs"] });
      })
      .on("postgres_changes", pg("jobs"), () => {
        queryClient.invalidateQueries({ queryKey: ["scheduler", "jobs"] });
        queryClient.invalidateQueries({ queryKey: ["scheduler", "status"] });
      })
      .on("postgres_changes", pg("job_runs"), () => {
        queryClient.invalidateQueries({ queryKey: ["scheduler", "runs"] });
      })
      .subscribe();
    channels.push(schedulerChannel);

    // ── Workspaces ───────────────────────────────────────────────────
    const workspaceChannel = supabase
      .channel("workspace-changes")
      .on("postgres_changes", pg("workspace_sessions"), () => {
        queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      })
      .on("postgres_changes", pg("workspace_artifacts"), () => {
        queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      })
      .on("postgres_changes", pg("workspace_context"), () => {
        queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      })
      .subscribe();
    channels.push(workspaceChannel);

    // ── Feed ─────────────────────────────────────────────────────────
    const feedChannel = supabase
      .channel("feed-changes")
      .on("postgres_changes", pg("feed_cards"), () => {
        queryClient.invalidateQueries({ queryKey: ["feed"] });
      })
      .on("postgres_changes", pg("feed_interactions"), () => {
        queryClient.invalidateQueries({ queryKey: ["feed"] });
      })
      .subscribe();
    channels.push(feedChannel);

    // ── Discussions ──────────────────────────────────────────────────
    const discussionsChannel = supabase
      .channel("discussions-changes")
      .on("postgres_changes", pg("discussions"), () => {
        queryClient.invalidateQueries({ queryKey: ["discussions"] });
        queryClient.invalidateQueries({ queryKey: ["chat", "threads"] });
      })
      .subscribe();
    channels.push(discussionsChannel);

    // ── Chat (read positions + entity mentions) ─────────────────────
    const chatChannel = supabase
      .channel("chat-changes")
      .on("postgres_changes", pg("chat_read_positions"), () => {
        queryClient.invalidateQueries({ queryKey: ["chat", "read"] });
      })
      .on("postgres_changes", pg("discussion_mentions"), () => {
        queryClient.invalidateQueries({ queryKey: ["chat", "mentions"] });
        queryClient.invalidateQueries({ queryKey: ["chat", "mentionCount"] });
      })
      .subscribe();
    channels.push(chatChannel);

    // ── Notifications ────────────────────────────────────────────────
    const notificationsChannel = supabase
      .channel("notifications-changes")
      .on("postgres_changes", pg("notifications"), () => {
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
      })
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
