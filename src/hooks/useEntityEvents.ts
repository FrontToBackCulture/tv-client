// Hooks for calendar event ↔ entity linking (projects, tasks, companies, contacts)
// Same pattern as useEntityEmails.ts — uses event_cache for team visibility

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "../lib/supabase";
import { useJobsStore } from "../stores/jobsStore";

// Types
export interface EventEntityLink {
  id: string;
  event_id: string;
  entity_type: "project" | "task" | "company" | "contact";
  entity_id: string;
  match_method: string | null;
  relevance_score: number | null;
  // Legacy denormalized columns (kept for backward compat)
  subject: string | null;
  start_at: string | null;
  end_at: string | null;
  organizer_name: string | null;
  organizer_email: string | null;
  location: string | null;
  created_at: string;
}

export interface LinkedEvent extends EventEntityLink {
  // Resolved from event_cache or local SQLite
  body_preview: string | null;
  attendees: EventAttendee[] | null;
  is_all_day: boolean;
  is_online_meeting: boolean;
  online_meeting_url: string | null;
  web_link: string | null;
  start_timezone: string | null;
  end_timezone: string | null;
}

export interface EventAttendee {
  name: string;
  email: string;
  responseStatus: string;
  attendeeType: string;
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

// Tauri CalendarEvent shape (camelCase from serde)
interface TauriCalendarEvent {
  id: string;
  subject: string;
  bodyPreview: string;
  startAt: string;
  startTimezone: string;
  endAt: string;
  endTimezone: string;
  isAllDay: boolean;
  location: string;
  organizerName: string;
  organizerEmail: string;
  attendees: EventAttendee[];
  isOnlineMeeting: boolean;
  onlineMeetingUrl: string | null;
  showAs: string;
  importance: string;
  isCancelled: boolean;
  webLink: string;
  createdAt: string;
  lastModifiedAt: string;
  categories: string[];
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

/** Fetch linked events for an entity — resolves metadata from event_cache then local SQLite */
export function useLinkedEvents(entityType: string, entityId: string) {
  return useQuery({
    queryKey: entityEventKeys.linked(entityType, entityId),
    queryFn: async (): Promise<LinkedEvent[]> => {
      // 1. Get links
      const { data: links, error } = await supabase
        .from("event_entity_links")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("start_at", { ascending: false });

      if (error) throw new Error(error.message);
      if (!links?.length) return [];

      const eventIds = links.map((l) => l.event_id);

      // 2. Check shared cache in Supabase
      const { data: cached } = await supabase
        .from("event_cache")
        .select("*")
        .in("id", eventIds);

      const cacheMap = new Map(
        (cached || []).map((c) => [c.id, c])
      );

      // 3. Find IDs not in cache — try local SQLite
      const uncachedIds = eventIds.filter((id) => !cacheMap.has(id));
      const localMap = new Map<string, TauriCalendarEvent>();

      if (uncachedIds.length > 0) {
        try {
          const events = await Promise.all(
            uncachedIds.map((id) =>
              invoke<TauriCalendarEvent | null>("outlook_get_event", { id })
            )
          );
          for (const e of events) {
            if (e) localMap.set(e.id, e);
          }
        } catch {
          // SQLite not available
        }
      }

      // 4. Merge: prefer cache, fall back to local, then link row denormalized fields
      const results: LinkedEvent[] = [];
      for (const link of links) {
        const c = cacheMap.get(link.event_id);
        const local = localMap.get(link.event_id);

        if (c) {
          results.push({
            ...link,
            subject: c.subject ?? link.subject,
            start_at: c.start_at ?? link.start_at,
            end_at: c.end_at ?? link.end_at,
            organizer_name: c.organizer_name ?? link.organizer_name,
            organizer_email: c.organizer_email ?? link.organizer_email,
            location: c.location ?? link.location,
            body_preview: c.body_preview,
            attendees: c.attendees as EventAttendee[] | null,
            is_all_day: c.is_all_day ?? false,
            is_online_meeting: c.is_online_meeting ?? false,
            online_meeting_url: c.online_meeting_url,
            web_link: c.web_link,
            start_timezone: c.start_timezone,
            end_timezone: c.end_timezone,
          });
        } else if (local) {
          results.push({
            ...link,
            subject: local.subject || link.subject,
            start_at: local.startAt || link.start_at,
            end_at: local.endAt || link.end_at,
            organizer_name: local.organizerName || link.organizer_name,
            organizer_email: local.organizerEmail || link.organizer_email,
            location: local.location || link.location,
            body_preview: local.bodyPreview,
            attendees: local.attendees,
            is_all_day: local.isAllDay,
            is_online_meeting: local.isOnlineMeeting,
            online_meeting_url: local.onlineMeetingUrl,
            web_link: local.webLink,
            start_timezone: local.startTimezone,
            end_timezone: local.endTimezone,
          });
        } else {
          // Fallback to denormalized link row data
          results.push({
            ...link,
            body_preview: null,
            attendees: null,
            is_all_day: false,
            is_online_meeting: false,
            online_meeting_url: null,
            web_link: null,
            start_timezone: null,
            end_timezone: null,
          });
        }
      }

      return results;
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
      const { addJob, updateJob } = useJobsStore.getState();
      const jobId = `scan-events-${Date.now()}`;
      addJob({ id: jobId, name: "Scan Calendar Events", status: "running", message: "Scanning local calendar events..." });
      let raw: EventScanCandidate[];
      try {
        raw = await invoke<EventScanCandidate[]>("outlook_scan_events", {
          domains,
          contactEmails,
        });
        updateJob(jobId, { status: "completed", message: `Found ${raw.length} events` });
      } catch (err) {
        console.error("[event-scan] Tauri invoke failed:", err);
        updateJob(jobId, { status: "failed", message: `${err}` });
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

/** Link events to an entity — also caches event metadata to Supabase for team visibility */
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

      // Cache event metadata to Supabase (so teammates can see full details)
      const cacheRows = await Promise.all(
        events.map(async (e) => {
          // Try to get full event details from local SQLite
          let detail: TauriCalendarEvent | null = null;
          try {
            detail = await invoke<TauriCalendarEvent | null>("outlook_get_event", { id: e.eventId });
          } catch { /* local SQLite not available */ }

          if (detail) {
            return {
              id: e.eventId,
              subject: detail.subject,
              body_preview: detail.bodyPreview || null,
              start_at: detail.startAt,
              end_at: detail.endAt,
              start_timezone: detail.startTimezone,
              end_timezone: detail.endTimezone,
              is_all_day: detail.isAllDay,
              location: detail.location,
              organizer_name: detail.organizerName,
              organizer_email: detail.organizerEmail,
              attendees: detail.attendees,
              is_online_meeting: detail.isOnlineMeeting,
              online_meeting_url: detail.onlineMeetingUrl,
              web_link: detail.webLink,
            };
          }

          // Fallback: cache what we have from scan candidate
          return {
            id: e.eventId,
            subject: e.subject,
            body_preview: null,
            start_at: e.startAt,
            end_at: e.endAt,
            start_timezone: null,
            end_timezone: null,
            is_all_day: false,
            location: e.location,
            organizer_name: e.organizerName,
            organizer_email: e.organizerEmail,
            attendees: [],
            is_online_meeting: false,
            online_meeting_url: null,
            web_link: null,
          };
        })
      );

      // Upsert to event_cache (ignore conflicts — don't overwrite existing cache)
      await supabase
        .from("event_cache")
        .upsert(cacheRows, { onConflict: "id", ignoreDuplicates: true });
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
