// React Query hooks for Outlook calendar events
// Data comes from Rust/MS Graph via Tauri IPC

import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// Types (match Rust CalendarEvent)
// ============================================================================

export interface CalendarEntry {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface EventAttendee {
  name: string;
  email: string;
  responseStatus: string;
  attendeeType: string;
}

export interface CalendarEvent {
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

// ============================================================================
// Hooks
// ============================================================================

export function useCalendars() {
  return useQuery({
    queryKey: ["outlook", "calendars"],
    queryFn: () => invoke<CalendarEntry[]>("outlook_list_calendars"),
    staleTime: 1000 * 60 * 5, // 5 min
  });
}

export function useCalendarEvents(options: {
  startTime: string;
  endTime: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["outlook", "events", options],
    queryFn: async () => {
      console.log("[calendar] Fetching events:", options.startTime, "to", options.endTime);
      try {
        const result = await invoke<CalendarEvent[]>("outlook_list_events", {
          startTime: options.startTime,
          endTime: options.endTime,
          limit: options.limit || 200,
        });
        console.log("[calendar] Got events:", result.length, result);
        return result;
      } catch (err) {
        console.error("[calendar] Error fetching events:", err);
        throw err;
      }
    },
    enabled: !!options.startTime && !!options.endTime,
    staleTime: 1000 * 60, // 1 min
  });
}
