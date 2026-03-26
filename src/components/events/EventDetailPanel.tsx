// Calendar event detail slide-over — shows full event details with attendees
// Fetches from local SQLite first, falls back to event_cache

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "../../lib/supabase";
import { ItemDetailPanel } from "../ui/ItemDetailPanel";
import {
  Loader2,
  CalendarDays,
  MapPin,
  Video,
  User,
  Users,
  Clock,
  ExternalLink,
  Check,
  X,
  HelpCircle,
  Minus,
} from "lucide-react";
import type { LinkedEvent, EventAttendee } from "../../hooks/useEntityEvents";

interface EventDetailPanelProps {
  event: LinkedEvent | null;
  onClose: () => void;
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (match) {
    const d = new Date(
      parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]),
      parseInt(match[4]), parseInt(match[5])
    );
    return d.toLocaleString("en-SG", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }
  return new Date(dateStr).toLocaleString("en-SG");
}

function formatTimeRange(startAt: string | null, endAt: string | null, isAllDay: boolean): string {
  if (isAllDay) return "All day";
  if (!startAt) return "";
  const start = formatDateTime(startAt);
  if (!endAt) return start;

  // If same day, just show time for end
  const startDate = startAt.slice(0, 10);
  const endDate = endAt.slice(0, 10);
  if (startDate === endDate) {
    const match = endAt.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (match) {
      const d = new Date(
        parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]),
        parseInt(match[4]), parseInt(match[5])
      );
      const endTime = d.toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit", hour12: true });
      return `${start} - ${endTime}`;
    }
  }
  return `${start} - ${formatDateTime(endAt)}`;
}

const responseIcons: Record<string, { icon: typeof Check; color: string; label: string }> = {
  accepted: { icon: Check, color: "text-green-500", label: "Accepted" },
  declined: { icon: X, color: "text-red-500", label: "Declined" },
  tentativelyAccepted: { icon: HelpCircle, color: "text-amber-500", label: "Tentative" },
  tentative: { icon: HelpCircle, color: "text-amber-500", label: "Tentative" },
  none: { icon: Minus, color: "text-zinc-400", label: "No response" },
  notResponded: { icon: Minus, color: "text-zinc-400", label: "No response" },
  organizer: { icon: User, color: "text-teal-500", label: "Organizer" },
};

export function EventDetailPanel({ event, onClose }: EventDetailPanelProps) {
  const [enrichedEvent, setEnrichedEvent] = useState<LinkedEvent | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!event) {
      setEnrichedEvent(null);
      return;
    }

    // If we already have full data (attendees present), use directly
    if (event.attendees && event.attendees.length > 0) {
      setEnrichedEvent(event);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setEnrichedEvent(event);

    async function enrichEvent() {
      // Try local SQLite for full details
      try {
        const detail = await invoke<{
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
          webLink: string;
        } | null>("outlook_get_event", { id: event!.event_id });

        if (!cancelled && detail) {
          setEnrichedEvent({
            ...event!,
            body_preview: detail.bodyPreview || event!.body_preview,
            attendees: detail.attendees,
            is_all_day: detail.isAllDay,
            is_online_meeting: detail.isOnlineMeeting,
            online_meeting_url: detail.onlineMeetingUrl,
            web_link: detail.webLink,
            start_timezone: detail.startTimezone,
            end_timezone: detail.endTimezone,
          });
          if (!cancelled) setLoading(false);
          return;
        }
      } catch {
        // Local not available
      }

      // Fall back to event_cache
      try {
        const { data } = await supabase
          .from("event_cache")
          .select("*")
          .eq("id", event!.event_id)
          .single();

        if (!cancelled && data) {
          setEnrichedEvent({
            ...event!,
            body_preview: data.body_preview || event!.body_preview,
            attendees: data.attendees as EventAttendee[] | null,
            is_all_day: data.is_all_day ?? false,
            is_online_meeting: data.is_online_meeting ?? false,
            online_meeting_url: data.online_meeting_url,
            web_link: data.web_link,
            start_timezone: data.start_timezone,
            end_timezone: data.end_timezone,
          });
        }
      } catch {
        // No cached data
      }

      if (!cancelled) setLoading(false);
    }

    enrichEvent();
    return () => { cancelled = true; };
  }, [event?.event_id]);

  if (!event) return null;

  const ev = enrichedEvent || event;
  const attendees = ev.attendees || [];

  return (
    <ItemDetailPanel
      open={!!event}
      onClose={onClose}
      title={ev.subject || "(no subject)"}
    >
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {/* Time */}
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-start gap-3">
            <Clock size={14} className="text-zinc-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-zinc-900 dark:text-zinc-100">
                {formatTimeRange(ev.start_at, ev.end_at, ev.is_all_day)}
              </p>
              {ev.start_timezone && (
                <p className="text-xs text-zinc-400 mt-0.5">{ev.start_timezone}</p>
              )}
            </div>
          </div>

          {/* Location */}
          {ev.location && (
            <div className="flex items-start gap-3">
              <MapPin size={14} className="text-zinc-400 mt-0.5 shrink-0" />
              <p className="text-sm text-zinc-700 dark:text-zinc-300">{ev.location}</p>
            </div>
          )}

          {/* Online meeting */}
          {ev.is_online_meeting && ev.online_meeting_url && (
            <div className="flex items-start gap-3">
              <Video size={14} className="text-teal-500 mt-0.5 shrink-0" />
              <a
                href={ev.online_meeting_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-teal-600 dark:text-teal-400 hover:underline"
              >
                Join Meeting
                <ExternalLink size={12} />
              </a>
            </div>
          )}

          {/* Organizer */}
          {(ev.organizer_name || ev.organizer_email) && (
            <div className="flex items-start gap-3">
              <User size={14} className="text-zinc-400 mt-0.5 shrink-0" />
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                <span className="text-xs text-zinc-400 mr-2">Organizer</span>
                {ev.organizer_name || ev.organizer_email}
                {ev.organizer_name && ev.organizer_email && (
                  <span className="text-xs text-zinc-400 ml-1">{ev.organizer_email}</span>
                )}
              </p>
            </div>
          )}

          {/* Outlook link */}
          {ev.web_link && (
            <div className="flex items-start gap-3">
              <ExternalLink size={14} className="text-zinc-400 mt-0.5 shrink-0" />
              <a
                href={ev.web_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-teal-600 dark:text-teal-400 hover:underline"
              >
                Open in Outlook
              </a>
            </div>
          )}
        </div>

        {/* Body preview */}
        {ev.body_preview && (
          <div className="px-5 py-4">
            <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">
              Description
            </p>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {ev.body_preview}
            </p>
          </div>
        )}

        {/* Attendees */}
        {attendees.length > 0 && (
          <div className="px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <Users size={14} className="text-zinc-400" />
              <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                Attendees ({attendees.length})
              </span>
            </div>
            {loading ? (
              <div className="flex justify-center py-4">
                <Loader2 size={16} className="animate-spin text-zinc-400" />
              </div>
            ) : (
              <div className="space-y-1">
                {attendees.map((a, i) => {
                  const resp = responseIcons[a.responseStatus] || responseIcons.none;
                  const Icon = resp.icon;
                  return (
                    <div
                      key={`${a.email}-${i}`}
                      className="flex items-center gap-2.5 py-1.5 px-2 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                    >
                      <Icon size={13} className={resp.color} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-zinc-800 dark:text-zinc-200 truncate block">
                          {a.name || a.email}
                        </span>
                        {a.name && a.email && (
                          <span className="text-xs text-zinc-400 truncate block">{a.email}</span>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-400 shrink-0">{resp.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!ev.body_preview && attendees.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
            <CalendarDays size={24} className="mb-2 opacity-40" />
            <p className="text-sm">Limited details available</p>
            <p className="text-xs mt-1">Full details available on the device that linked this event</p>
          </div>
        )}
      </div>
    </ItemDetailPanel>
  );
}
