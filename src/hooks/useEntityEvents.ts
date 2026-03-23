// Hooks for calendar event ↔ entity linking (projects, tasks, companies, contacts)
// Same pattern as useEntityEmails.ts

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "../lib/supabase";

// Types
export interface EventEntityLink {
  id: string;
  event_id: string;
  entity_type: "project" | "task" | "company" | "contact";
  entity_id: string;
  match_method: string | null;
  relevance_score: number | null;
  subject: string | null;
  start_at: string | null;
  end_at: string | null;
  organizer_name: string | null;
  organizer_email: string | null;
  location: string | null;
  created_at: string;
}

export interface EventScanCandidate {
  eventId: string;
  subject: string;
  startAt: string;
  endAt: string;
  organizerName: string;
  organizerEmail: string;
  location: string;
  matchMethod: string;
  relevanceScore: number;
  already_linked: boolean;
}

// Query keys
export const entityEventKeys = {
  all: ["entity-events"] as const,
  linked: (entityType: string, entityId: string) =>
    [...entityEventKeys.all, "linked", entityType, entityId] as const,
  count: (entityType: string, entityId: string) =>
    [...entityEventKeys.all, "count", entityType, entityId] as const,
  scan: (entityType: string, entityId: string) =>
    [...entityEventKeys.all, "scan", entityType, entityId] as const,
};

/** Fetch linked events for an entity */
export function useLinkedEvents(entityType: string, entityId: string) {
  return useQuery({
    queryKey: entityEventKeys.linked(entityType, entityId),
    queryFn: async (): Promise<EventEntityLink[]> => {
      const { data: links, error } = await supabase
        .from("event_entity_links")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("start_at", { ascending: false });

      if (error) throw new Error(error.message);
      return links || [];
    },
    enabled: !!entityType && !!entityId,
  });
}

/** Count linked events (lightweight, for badges) */
export function useLinkedEventCount(entityType: string, entityId: string) {
  return useQuery({
    queryKey: entityEventKeys.count(entityType, entityId),
    queryFn: async () => {
      const { count, error } = await supabase
        .from("event_entity_links")
        .select("id", { count: "exact", head: true })
        .eq("entity_type", entityType)
        .eq("entity_id", entityId);

      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    enabled: !!entityType && !!entityId,
  });
}

/** Scan for event candidates via local SQLite (Tauri command) */
export function useScanEvents(entityType: string, entityId: string) {
  return useQuery({
    queryKey: entityEventKeys.scan(entityType, entityId),
    queryFn: async (): Promise<EventScanCandidate[]> => {
      // 1. Resolve company_id from entity
      let companyId: string | null = null;
      if (entityType === "company") {
        companyId = entityId;
      } else if (entityType === "project") {
        const { data: project } = await supabase
          .from("projects")
          .select("company_id")
          .eq("id", entityId)
          .single();
        companyId = project?.company_id || null;
      } else if (entityType === "task") {
        const { data: task } = await supabase
          .from("tasks")
          .select("company_id, project_id")
          .eq("id", entityId)
          .single();
        companyId = task?.company_id || null;
        if (!companyId && task?.project_id) {
          const { data: project } = await supabase
            .from("projects")
            .select("company_id")
            .eq("id", task.project_id)
            .single();
          companyId = project?.company_id || null;
        }
      }

      if (!companyId) return [];

      // 2. Get company email_domains and contact emails
      const { data: company } = await supabase
        .from("crm_companies")
        .select("email_domains")
        .eq("id", companyId)
        .single();

      const { data: contacts } = await supabase
        .from("crm_contacts")
        .select("email")
        .eq("company_id", companyId);

      const domains: string[] = company?.email_domains || [];
      const contactEmails: string[] = (contacts || [])
        .map((c: { email: string }) => c.email?.toLowerCase())
        .filter(Boolean);

      if (domains.length === 0 && contactEmails.length === 0) return [];

      // 3. Call Tauri command to scan local SQLite events
      let raw: EventScanCandidate[];
      try {
        raw = await invoke<EventScanCandidate[]>("outlook_scan_events", {
          domains,
          contactEmails,
        });
      } catch (err) {
        console.error("[event-scan] Tauri invoke failed:", err);
        return [];
      }

      // 4. Check which are already linked
      const { data: existingLinks } = await supabase
        .from("event_entity_links")
        .select("event_id")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId);
      const linkedIds = new Set((existingLinks || []).map((l: { event_id: string }) => l.event_id));

      return raw.map((r) => ({
        ...r,
        already_linked: linkedIds.has(r.eventId),
      }));
    },
    enabled: false, // Only run when explicitly triggered
  });
}

/** Link events to an entity */
export function useLinkEvents() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      events,
      entityType,
      entityId,
    }: {
      events: EventScanCandidate[];
      entityType: string;
      entityId: string;
    }) => {
      const rows = events.map((e) => ({
        event_id: e.eventId,
        entity_type: entityType,
        entity_id: entityId,
        match_method: e.matchMethod,
        relevance_score: e.relevanceScore,
        subject: e.subject,
        start_at: e.startAt,
        end_at: e.endAt,
        organizer_name: e.organizerName,
        organizer_email: e.organizerEmail,
        location: e.location,
      }));

      const { error } = await supabase
        .from("event_entity_links")
        .upsert(rows, {
          onConflict: "event_id,entity_type,entity_id",
          ignoreDuplicates: true,
        });

      if (error) throw new Error(error.message);
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({
        queryKey: entityEventKeys.linked(vars.entityType, vars.entityId),
      });
      queryClient.invalidateQueries({
        queryKey: entityEventKeys.count(vars.entityType, vars.entityId),
      });
    },
  });
}

/** Unlink an event from an entity */
export function useUnlinkEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase
        .from("event_entity_links")
        .delete()
        .eq("id", linkId);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: entityEventKeys.all });
    },
  });
}
