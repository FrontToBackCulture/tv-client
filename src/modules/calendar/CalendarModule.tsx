// src/modules/calendar/CalendarModule.tsx

import { useState, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Download, Video, MapPin, Users, Clock } from "lucide-react";
import { cn } from "../../lib/cn";
import { useCalendarEvents, type CalendarEvent } from "../../hooks/useCalendar";
import { useOutlookAuth, useCalendarSyncStart, useCalendarSyncStatus } from "../../hooks/useOutlook";
import { OutlookSetup } from "../inbox/OutlookSetup";
import { DetailLoading } from "../../components/ui/DetailStates";
import { useViewContextStore } from "../../stores/viewContextStore";

type CalendarView = "week" | "month";

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay() + 1); // Monday
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Parse datetime string from Graph API as local time (not UTC).
 *  Graph returns "2026-03-23T09:30:00.0000000" in SGT (via Prefer header),
 *  but JS new Date() would parse it as UTC. Strip trailing zeros and treat as local. */
function parseLocalDate(dateStr: string): Date {
  // Remove fractional seconds beyond 3 digits and any trailing zeros
  const cleaned = dateStr.replace(/\.(\d{3})\d*$/, ".$1");
  // Append no timezone = some browsers parse as UTC, so manually parse
  const match = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (match) {
    return new Date(
      parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]),
      parseInt(match[4]), parseInt(match[5]), parseInt(match[6])
    );
  }
  return new Date(dateStr);
}

function formatTime(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return d.toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatDateRange(start: string, end: string, isAllDay: boolean): string {
  if (isAllDay) return "All day";
  return `${formatTime(start)} – ${formatTime(end)}`;
}

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 7am to 9pm

export function CalendarModule() {
  const { data: auth, isLoading: isLoadingAuth } = useOutlookAuth();
  const [view, setView] = useState<CalendarView>("week");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const setViewContext = useViewContextStore((s) => s.setView);
  useEffect(() => {
    setViewContext("calendar", `View: ${view}`);
  }, [view, setViewContext]);

  // Calculate date range for query
  const { startTime, endTime, weekStart } = useMemo(() => {
    if (view === "week") {
      const ws = startOfWeek(currentDate);
      const we = addDays(ws, 7);
      return {
        startTime: ws.toISOString(),
        endTime: we.toISOString(),
        weekStart: ws,
      };
    }
    // month
    const first = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const last = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);
    // Extend to full weeks
    const ms = startOfWeek(first);
    const me = addDays(startOfWeek(last), 7);
    return {
      startTime: ms.toISOString(),
      endTime: me.toISOString(),
      weekStart: ms,
    };
  }, [currentDate, view]);

  const { data: events = [] } = useCalendarEvents({
    startTime,
    endTime,
    limit: 500,
  });

  const syncStart = useCalendarSyncStart();
  const { data: syncStatus } = useCalendarSyncStatus();
  const isSyncing = syncStatus?.isSyncing || syncStart.isPending;

  if (isLoadingAuth) return <DetailLoading />;
  if (!auth?.isAuthenticated) return <OutlookSetup />;

  const navigateBack = () => {
    if (view === "week") setCurrentDate(addDays(currentDate, -7));
    else setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const navigateForward = () => {
    if (view === "week") setCurrentDate(addDays(currentDate, 7));
    else setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const goToToday = () => setCurrentDate(new Date());

  const headerLabel = view === "week"
    ? `${weekStart.toLocaleDateString("en-SG", { month: "short", day: "numeric" })} – ${addDays(weekStart, 6).toLocaleDateString("en-SG", { month: "short", day: "numeric", year: "numeric" })}`
    : currentDate.toLocaleDateString("en-SG", { month: "long", year: "numeric" });

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-700">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button onClick={navigateBack} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
              <ChevronLeft size={16} />
            </button>
            <button onClick={navigateForward} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
              <ChevronRight size={16} />
            </button>
          </div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{headerLabel}</h2>
          <button
            onClick={goToToday}
            className="px-2 py-1 text-xs font-medium rounded-md border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Today
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => syncStart.mutate(24)}
            disabled={isSyncing}
            title="Sync calendar (last 2 years)"
            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 disabled:opacity-50"
          >
            {isSyncing ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
          </button>
          <div className="flex rounded-lg border border-zinc-300 dark:border-zinc-600 overflow-hidden">
            {(["week", "month"] as CalendarView[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "px-3 py-1 text-xs font-medium transition-colors",
                  view === v
                    ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                )}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Calendar grid */}
        <div className="flex-1 overflow-auto">
          {view === "week" ? (
            <WeekView events={events} weekStart={weekStart} selectedEvent={selectedEvent} onSelectEvent={setSelectedEvent} />
          ) : (
            <MonthView events={events} currentDate={currentDate} selectedEvent={selectedEvent} onSelectEvent={setSelectedEvent} />
          )}
        </div>

        {/* Event detail panel */}
        {selectedEvent && (
          <EventDetailPanel event={selectedEvent} onClose={() => setSelectedEvent(null)} />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Overlap layout — assign columns to overlapping events
// ============================================================================

interface PositionedEvent {
  event: CalendarEvent;
  column: number;
  totalColumns: number;
}

function layoutOverlappingEvents(events: CalendarEvent[]): PositionedEvent[] {
  if (events.length === 0) return [];

  // Sort by start time, then by duration (longer first)
  const sorted = [...events].sort((a, b) => {
    const aStart = parseLocalDate(a.startAt).getTime();
    const bStart = parseLocalDate(b.startAt).getTime();
    if (aStart !== bStart) return aStart - bStart;
    const aDur = parseLocalDate(a.endAt).getTime() - aStart;
    const bDur = parseLocalDate(b.endAt).getTime() - bStart;
    return bDur - aDur;
  });

  // Group into clusters of overlapping events
  const clusters: { events: CalendarEvent[]; columns: number[] }[] = [];

  for (const event of sorted) {
    const eStart = parseLocalDate(event.startAt).getTime();
    const eEnd = parseLocalDate(event.endAt).getTime();

    // Find which column this event fits in within existing clusters
    let placed = false;
    for (const cluster of clusters) {
      // Check if this event overlaps with any event in the cluster
      const overlaps = cluster.events.some((ce) => {
        const cStart = parseLocalDate(ce.startAt).getTime();
        const cEnd = parseLocalDate(ce.endAt).getTime();
        return eStart < cEnd && eEnd > cStart;
      });

      if (overlaps) {
        // Find first available column
        const usedColumns = new Set<number>();
        for (const ce of cluster.events) {
          const cStart = parseLocalDate(ce.startAt).getTime();
          const cEnd = parseLocalDate(ce.endAt).getTime();
          if (eStart < cEnd && eEnd > cStart) {
            const idx = cluster.events.indexOf(ce);
            usedColumns.add(cluster.columns[idx]);
          }
        }
        let col = 0;
        while (usedColumns.has(col)) col++;
        cluster.events.push(event);
        cluster.columns.push(col);
        placed = true;
        break;
      }
    }

    if (!placed) {
      clusters.push({ events: [event], columns: [0] });
    }
  }

  // Build result with total columns per cluster
  const result: PositionedEvent[] = [];
  for (const cluster of clusters) {
    const maxCol = Math.max(...cluster.columns) + 1;
    for (let i = 0; i < cluster.events.length; i++) {
      result.push({
        event: cluster.events[i],
        column: cluster.columns[i],
        totalColumns: maxCol,
      });
    }
  }

  return result;
}

// ============================================================================
// Week View
// ============================================================================

function WeekView({
  events,
  weekStart,
  selectedEvent,
  onSelectEvent,
}: {
  events: CalendarEvent[];
  weekStart: Date;
  selectedEvent: CalendarEvent | null;
  onSelectEvent: (e: CalendarEvent) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  return (
    <div className="flex flex-col min-h-full">
      {/* Day headers */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-700 sticky top-0 bg-white dark:bg-zinc-950 z-10">
        <div className="w-16 flex-shrink-0" />
        {days.map((day, i) => {
          const isToday = isSameDay(day, today);
          return (
            <div
              key={i}
              className={cn(
                "flex-1 py-2 text-center border-l border-zinc-200 dark:border-zinc-700",
              )}
            >
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                {day.toLocaleDateString("en-SG", { weekday: "short" })}
              </div>
              <div className={cn(
                "text-sm font-semibold mt-0.5",
                isToday
                  ? "text-teal-600 dark:text-teal-400"
                  : "text-zinc-900 dark:text-zinc-100"
              )}>
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* All-day events row */}
      {(() => {
        const allDayEvents = events.filter((e) => e.isAllDay);
        if (allDayEvents.length === 0) return null;
        return (
          <div className="flex border-b border-zinc-200 dark:border-zinc-700">
            <div className="w-16 flex-shrink-0 py-1 px-2 text-xs text-zinc-400 text-right">all day</div>
            {days.map((day, i) => {
              const dayEvents = allDayEvents.filter((e) => isSameDay(parseLocalDate(e.startAt), day));
              return (
                <div key={i} className="flex-1 border-l border-zinc-200 dark:border-zinc-700 py-1 px-0.5 space-y-0.5">
                  {dayEvents.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => onSelectEvent(e)}
                      className={cn(
                        "w-full text-left px-1.5 py-0.5 text-xs rounded truncate",
                        selectedEvent?.id === e.id
                          ? "bg-teal-600 text-white"
                          : "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 hover:bg-teal-200 dark:hover:bg-teal-900/50"
                      )}
                    >
                      {e.subject}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Time grid */}
      <div className="flex flex-1">
        {/* Time labels */}
        <div className="w-16 flex-shrink-0">
          {HOURS.map((hour) => (
            <div key={hour} className="h-16 relative">
              <span className="absolute -top-2 right-2 text-xs text-zinc-400">
                {hour === 12 ? "12 PM" : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
              </span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((day, dayIdx) => {
          const dayEvents = events.filter(
            (e) => !e.isAllDay && isSameDay(parseLocalDate(e.startAt), day)
          );

          // Calculate overlap columns for events
          const positioned = layoutOverlappingEvents(dayEvents);

          return (
            <div
              key={dayIdx}
              className={cn(
                "flex-1 border-l border-zinc-200 dark:border-zinc-700 relative",
                isSameDay(day, today) && "bg-teal-50/30 dark:bg-teal-900/10"
              )}
            >
              {/* Hour lines */}
              {HOURS.map((hour) => (
                <div key={hour} className="h-16 border-b border-zinc-100 dark:border-zinc-800" />
              ))}

              {/* Events positioned absolutely with overlap columns */}
              {positioned.map(({ event, column, totalColumns }) => {
                const startDate = parseLocalDate(event.startAt);
                const endDate = parseLocalDate(event.endAt);
                const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
                const endMinutes = endDate.getHours() * 60 + endDate.getMinutes();
                const top = ((startMinutes - HOURS[0] * 60) / 60) * 64;
                const height = Math.max(((endMinutes - startMinutes) / 60) * 64, 24);

                if (top < 0 || top > HOURS.length * 64) return null;

                const widthPct = 100 / totalColumns;
                const leftPct = column * widthPct;

                return (
                  <button
                    key={event.id}
                    onClick={() => onSelectEvent(event)}
                    className={cn(
                      "absolute rounded px-1.5 py-1 text-xs overflow-hidden cursor-pointer border-l-2 border border-white dark:border-zinc-950 transition-colors",
                      selectedEvent?.id === event.id
                        ? "bg-teal-600 text-white border-l-teal-800"
                        : event.showAs === "tentative"
                        ? "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border-l-yellow-500 hover:bg-yellow-100 dark:hover:bg-yellow-900/50"
                        : "bg-teal-50 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200 border-l-teal-500 hover:bg-teal-100 dark:hover:bg-teal-900/50"
                    )}
                    style={{
                      top: `${top}px`,
                      height: `${height}px`,
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                    }}
                  >
                    <div className="font-medium truncate leading-tight">{event.subject}</div>
                    {height > 32 && (
                      <div className="text-[10px] opacity-75 truncate leading-tight mt-0.5">
                        {formatTime(event.startAt)}
                        {event.location && ` · ${event.location}`}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Month View
// ============================================================================

function MonthView({
  events,
  currentDate,
  selectedEvent,
  onSelectEvent,
}: {
  events: CalendarEvent[];
  currentDate: Date;
  selectedEvent: CalendarEvent | null;
  onSelectEvent: (e: CalendarEvent) => void;
}) {
  const today = new Date();
  const firstOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const gridStart = startOfWeek(firstOfMonth);
  const weeks: Date[][] = [];
  let d = new Date(gridStart);
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(d));
      d = addDays(d, 1);
    }
    weeks.push(week);
    // Stop if we've passed the month
    if (d.getMonth() > currentDate.getMonth() && d.getFullYear() >= currentDate.getFullYear()) {
      if (weeks.length >= 5) break;
    }
  }

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="flex flex-col h-full">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-zinc-200 dark:border-zinc-700">
        {dayNames.map((name) => (
          <div key={name} className="py-2 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {name}
          </div>
        ))}
      </div>

      {/* Weeks */}
      <div className="flex-1 grid" style={{ gridTemplateRows: `repeat(${weeks.length}, 1fr)` }}>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-zinc-100 dark:border-zinc-800">
            {week.map((day, di) => {
              const isCurrentMonth = day.getMonth() === currentDate.getMonth();
              const isToday = isSameDay(day, today);
              const dayEvents = events.filter((e) => isSameDay(parseLocalDate(e.startAt), day));

              return (
                <div
                  key={di}
                  className={cn(
                    "border-r border-zinc-100 dark:border-zinc-800 p-1 min-h-[80px] overflow-hidden",
                    !isCurrentMonth && "bg-zinc-50 dark:bg-zinc-900/50"
                  )}
                >
                  <div className={cn(
                    "text-xs mb-1",
                    isToday
                      ? "w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center font-semibold"
                      : isCurrentMonth
                      ? "text-zinc-700 dark:text-zinc-300 font-medium pl-1"
                      : "text-zinc-400 pl-1"
                  )}>
                    {day.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map((event) => (
                      <button
                        key={event.id}
                        onClick={() => onSelectEvent(event)}
                        className={cn(
                          "w-full text-left px-1 py-0.5 text-[10px] rounded truncate leading-tight",
                          selectedEvent?.id === event.id
                            ? "bg-teal-600 text-white"
                            : "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 hover:bg-teal-200"
                        )}
                      >
                        {!event.isAllDay && <span className="font-medium">{formatTime(event.startAt)} </span>}
                        {event.subject}
                      </button>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="text-[10px] text-zinc-400 pl-1">+{dayEvents.length - 3} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Event Detail Panel
// ============================================================================

function EventDetailPanel({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  return (
    <div className="w-[380px] flex-shrink-0 border-l border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
            {event.subject}
          </h3>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-sm flex-shrink-0"
          >
            &times;
          </button>
        </div>

        {/* Status badges */}
        <div className="flex flex-wrap gap-1.5">
          {event.isCancelled && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
              Cancelled
            </span>
          )}
          {event.showAs && event.showAs !== "busy" && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 capitalize">
              {event.showAs}
            </span>
          )}
          {event.importance !== "normal" && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 capitalize">
              {event.importance}
            </span>
          )}
          {event.categories.map((cat) => (
            <span key={cat} className="px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
              {cat}
            </span>
          ))}
        </div>

        {/* Time */}
        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <Clock size={14} className="flex-shrink-0" />
          <div>
            <div>{parseLocalDate(event.startAt).toLocaleDateString("en-SG", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</div>
            <div className="text-zinc-500">{formatDateRange(event.startAt, event.endAt, event.isAllDay)}</div>
          </div>
        </div>

        {/* Location */}
        {event.location && (
          <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <MapPin size={14} className="flex-shrink-0" />
            <span>{event.location}</span>
          </div>
        )}

        {/* Online meeting */}
        {event.isOnlineMeeting && event.onlineMeetingUrl && (
          <div className="flex items-center gap-2 text-sm">
            <Video size={14} className="flex-shrink-0 text-teal-600" />
            <a
              href={event.onlineMeetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-teal-600 hover:underline truncate"
            >
              Join online meeting
            </a>
          </div>
        )}

        {/* Organizer */}
        <div className="text-sm">
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Organizer</div>
          <div className="text-zinc-900 dark:text-zinc-100">{event.organizerName || event.organizerEmail}</div>
          {event.organizerName && event.organizerEmail && (
            <div className="text-xs text-zinc-500">{event.organizerEmail}</div>
          )}
        </div>

        {/* Attendees */}
        {event.attendees.length > 0 && (
          <div className="text-sm">
            <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
              <Users size={12} />
              Attendees ({event.attendees.length})
            </div>
            <div className="space-y-1.5">
              {event.attendees.map((att, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div>
                    <div className="text-zinc-900 dark:text-zinc-100 text-sm">{att.name || att.email}</div>
                    {att.name && <div className="text-xs text-zinc-500">{att.email}</div>}
                  </div>
                  <span className={cn(
                    "text-xs px-1.5 py-0.5 rounded",
                    att.responseStatus === "accepted" && "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
                    att.responseStatus === "declined" && "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
                    att.responseStatus === "tentativelyAccepted" && "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300",
                    att.responseStatus === "none" && "bg-zinc-100 dark:bg-zinc-800 text-zinc-500",
                  )}>
                    {att.responseStatus === "tentativelyAccepted" ? "tentative" : att.responseStatus}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Body preview */}
        {event.bodyPreview && (
          <div className="text-sm">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Description</div>
            <p className="text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap text-sm leading-relaxed">
              {event.bodyPreview}
            </p>
          </div>
        )}

        {/* Open in Outlook link */}
        {event.webLink && (
          <a
            href={event.webLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs text-teal-600 hover:underline mt-2"
          >
            Open in Outlook
          </a>
        )}
      </div>
    </div>
  );
}
