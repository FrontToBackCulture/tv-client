// src/modules/home/HomeModule.tsx
//
// The Cockpit — Melvin's daily operating surface.
//
// Three rows in the main column:
//   1. Commitment Bar  — today's one thing + sales session + interrupt/outbound counters
//   2. Client Delivery — live view over `projects` (work + linked company) + task counts
//   3. Escalation Inbox — unresolved interrupts, to triage at 1pm and 5pm
//
// Sidebar: weekly summary so the engine metric is always visible.
//
// Design principle: every element earns its place by answering one of
// (a) what do I need to do right now, (b) what's the state of the business,
// (c) am I on track against the plan.

import { useState, useEffect, useMemo } from "react";
import {
  Play,
  Square,
  Flame,
  Plus,
  AlertTriangle,
  CheckCircle2,
  X,
  Send,
  Clock,
  TrendingUp,
  Minus,
  ExternalLink,
  ArrowRight,
  ChevronRight,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/PageHeader";
import { Button, IconButton, FormField, Input, Select, Textarea } from "../../components/ui";
import { EmptyState } from "../../components/EmptyState";
import { useNotificationNavStore } from "../../stores/notificationNavStore";
import { useModuleTabStore } from "../../stores/moduleTabStore";
import {
  useDailyFocus,
  useUpdateDailyFocus,
  useToggleSalesSession,
  useDeliveryProjects,
  useUnresolvedEscalations,
  useLogEscalation,
  useUpdateEscalation,
  useWeeklySummary,
  useRangeSummary,
  usePlanWeekProgress,
  useUpdatePlanWeekProgress,
} from "../../hooks/cockpit";
import {
  ESCALATION_CATEGORIES,
  categoryLabel,
  healthLabel,
  healthColor,
  EscalationCategory,
} from "../../lib/cockpit/types";
import {
  getCurrentPlanWeek,
  getCurrentMonth,
  dailySalesTargetFor,
  dailyOutboundTargetFor,
  PLAN_WEEKS,
  PLAN_START,
  PlanWeek,
} from "./planWeeks";
import {
  SCHEDULES,
  scheduleKindForDay,
  dayTypeLabel,
  isBlockActive,
  blockDate,
  ScheduleBlock,
  ScheduleKind,
} from "./scheduleTemplates";
import { useCalendarEvents, CalendarEvent } from "../../hooks/useCalendar";

// ============================================================================
// Helpers
// ============================================================================

function formatHours(h: number): string {
  return `${h.toFixed(1)}h`;
}

function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function daysSince(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / (24 * 3_600_000));
  if (days === 0) return "today";
  if (days === 1) return "1d";
  return `${days}d`;
}

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

// ============================================================================
// Row 1 — Commitment Bar
// ============================================================================

function CommitmentBar() {
  const { data: focus } = useDailyFocus();
  const updateFocus = useUpdateDailyFocus();
  const toggleSession = useToggleSalesSession();

  const [oneThing, setOneThing] = useState("");
  const [editing, setEditing] = useState(false);
  const [liveElapsed, setLiveElapsed] = useState(0);

  useEffect(() => {
    if (focus && !editing) setOneThing(focus.one_thing ?? "");
  }, [focus, editing]);

  // Tick live counter when a sales session is active.
  useEffect(() => {
    if (!focus?.sales_session_start) {
      setLiveElapsed(0);
      return;
    }
    const started = new Date(focus.sales_session_start).getTime();
    const tick = () => setLiveElapsed(Date.now() - started);
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [focus?.sales_session_start]);

  if (!focus) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-[12px] text-slate-500">
        Loading focus…
      </div>
    );
  }

  const sessionRunning = !!focus.sales_session_start;
  const displayedActual = sessionRunning
    ? Number(focus.sales_hours_actual) + liveElapsed / 3_600_000
    : Number(focus.sales_hours_actual);
  const pct = Math.min(100, (displayedActual / Math.max(0.01, Number(focus.sales_hours_target))) * 100);
  const onTrack = displayedActual >= Number(focus.sales_hours_target) * 0.5;

  const saveOneThing = () => {
    setEditing(false);
    if ((oneThing || "") !== (focus.one_thing ?? "")) {
      updateFocus.mutate({ date: focus.focus_date, updates: { one_thing: oneThing || null } });
    }
  };

  const bumpOutbound = (delta: number) => {
    const next = Math.max(0, (focus.outbound_sent ?? 0) + delta);
    updateFocus.mutate({ date: focus.focus_date, updates: { outbound_sent: next } });
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-950 p-5 space-y-4">
      {/* One thing */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
          Today's one thing
        </div>
        {editing ? (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={oneThing}
              onChange={(e) => setOneThing(e.target.value)}
              onBlur={saveOneThing}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveOneThing();
                if (e.key === "Escape") {
                  setOneThing(focus.one_thing ?? "");
                  setEditing(false);
                }
              }}
              placeholder="What's the single most important thing to finish today?"
            />
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="w-full text-left text-[15px] font-medium text-slate-800 dark:text-slate-100 hover:text-teal-600 dark:hover:text-teal-400 transition-colors min-h-[24px]"
          >
            {focus.one_thing || (
              <span className="text-slate-400 dark:text-slate-600 font-normal italic">
                Click to set today's one thing…
              </span>
            )}
          </button>
        )}
      </div>

      {/* Counters row */}
      <div className="grid grid-cols-3 gap-3">
        {/* Sales hours */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Sales
            </div>
            <button
              onClick={() => toggleSession.mutate(focus)}
              disabled={toggleSession.isPending}
              className={cn(
                "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md transition-colors",
                sessionRunning
                  ? "bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-900/40 dark:text-rose-300"
                  : "bg-teal-600 text-white hover:bg-teal-700"
              )}
            >
              {sessionRunning ? <Square size={10} /> : <Play size={10} />}
              {sessionRunning ? "Stop" : "Start"}
            </button>
          </div>
          <div className="flex items-baseline gap-1">
            <span
              className={cn(
                "text-xl font-semibold tabular-nums",
                onTrack ? "text-emerald-600 dark:text-emerald-400" : "text-slate-800 dark:text-slate-100"
              )}
            >
              {formatHours(displayedActual)}
            </span>
            <span className="text-[12px] text-slate-400 dark:text-slate-500 tabular-nums">
              / {formatHours(Number(focus.sales_hours_target))}
            </span>
          </div>
          <div className="mt-1.5 h-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className={cn(
                "h-full transition-all",
                onTrack ? "bg-emerald-500" : "bg-teal-500"
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          {sessionRunning && (
            <div className="mt-1 text-[10px] text-teal-600 dark:text-teal-400 font-medium">
              Live · {formatDuration(liveElapsed)}
            </div>
          )}
        </div>

        {/* Outbound */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Outbound
            </div>
            <div className="flex items-center gap-0.5">
              <IconButton icon={Minus} label="Decrement" size={12} onClick={() => bumpOutbound(-1)} />
              <IconButton icon={Plus} label="Increment" size={12} onClick={() => bumpOutbound(1)} />
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-semibold tabular-nums text-slate-800 dark:text-slate-100">
              {focus.outbound_sent}
            </span>
            <span className="text-[12px] text-slate-400 dark:text-slate-500 tabular-nums">
              / {focus.outbound_target}
            </span>
          </div>
          <div className="mt-1.5 h-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{
                width: `${Math.min(100, (focus.outbound_sent / Math.max(1, focus.outbound_target)) * 100)}%`,
              }}
            />
          </div>
        </div>

        {/* Interrupts */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Interrupts
            </div>
            <Flame size={11} className="text-rose-400" />
          </div>
          <div className="flex items-baseline gap-1">
            <span
              className={cn(
                "text-xl font-semibold tabular-nums",
                focus.interrupts_count === 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : focus.interrupts_count < 3
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-rose-600 dark:text-rose-400"
              )}
            >
              {focus.interrupts_count}
            </span>
            <span className="text-[12px] text-slate-400 dark:text-slate-500">today</span>
          </div>
          <div className="mt-1.5 text-[10px] text-slate-400 dark:text-slate-500 leading-tight">
            Log every sales-block interrupt
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Today's Schedule card — time-blocked view of the current day with "you are here"
// ============================================================================

function parseOutlookDate(s: string): Date {
  // Outlook returns "2026-04-12T09:30:00.0000000" — treat as local wall time
  const cleaned = s.replace(/\.(\d{3})\d*$/, ".$1");
  const m = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    return new Date(
      parseInt(m[1]),
      parseInt(m[2]) - 1,
      parseInt(m[3]),
      parseInt(m[4]),
      parseInt(m[5]),
      parseInt(m[6])
    );
  }
  return new Date(s);
}

function formatClock(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

// Rolling 7-day window: today + next 6 days. Today is always the first pill.
// Keeps today visible regardless of weekday.
function computeStripAnchor(today: Date): Date {
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ============================================================================
// Week-aware block rewrites — Saturday and Sunday pull real build target text
// from the current plan week, so schedule content matches the actual plan.
// ============================================================================

function findWeekContaining(dateIso: string): PlanWeek | null {
  for (const w of PLAN_WEEKS) {
    const start = new Date(w.startDate + "T00:00:00Z").getTime();
    const end = start + 6 * 86_400_000; // Sunday inclusive (same day)
    const t = Date.parse(dateIso + "T00:00:00Z");
    if (t >= start && t <= end) return w;
  }
  return null;
}

function findUpcomingWeek(dateIso: string): PlanWeek | null {
  for (const w of PLAN_WEEKS) {
    if (w.startDate >= dateIso) return w;
  }
  return null;
}

function hasRealBuild(week: PlanWeek | null): boolean {
  if (!week) return false;
  return !week.buildTarget.toLowerCase().startsWith("no build");
}

function getContextualBlocks(date: Date, kind: ScheduleKind): ScheduleBlock[] {
  const base = SCHEDULES[kind];
  if (kind !== "saturday-build" && kind !== "sunday-prep") return base;

  const dateIso = date.toISOString().slice(0, 10);
  const weekFor = findWeekContaining(dateIso);
  const upcoming = findUpcomingWeek(dateIso);
  const isPrePlan = dateIso < PLAN_START;

  // SATURDAY: deep build day — rewrite build blocks with this week's real target
  if (kind === "saturday-build") {
    if (!weekFor) return base;
    const hasBuild = hasRealBuild(weekFor);
    return base.map((b) => {
      if (b.id === "sat-am" || b.id === "sat-pm") {
        return {
          ...b,
          label: hasBuild ? b.label : "RESERVED · NO BUILD",
          note: hasBuild
            ? `${weekFor.buildTarget} · ship ugly · iterate`
            : `Week ${weekFor.weekNumber} has no build — use for rest, strategic reading, or polish existing skills`,
          emphasis: hasBuild ? b.emphasis : "normal",
        };
      }
      return b;
    });
  }

  // SUNDAY: prep day — rewrite ship block + prep block based on current/upcoming week
  if (kind === "sunday-prep") {
    // Three cases:
    //  A. Pre-plan Sunday (before Apr 13) — ship cockpit v0, prep for week 1
    //  B. Sunday that ends a plan week with a real build — ship the build
    //  C. Sunday that ends a plan week with NO build — reflection / strategy

    if (isPrePlan) {
      const week1 = PLAN_WEEKS[0];
      return base.map((b) => {
        if (b.id === "sun-ship") {
          return {
            ...b,
            label: "SHIP COCKPIT V0 + POLISH",
            note: "Verify cockpit works · test logging interrupts · set Monday's one thing",
          };
        }
        if (b.id === "sun-prep") {
          return {
            ...b,
            note: `Week ${week1.weekNumber} — ${week1.phase} · write 25 outbound targets · review pipeline top 10 · Monday's one thing · block calendar`,
          };
        }
        return b;
      });
    }

    if (!weekFor) return base;

    const hasBuild = hasRealBuild(weekFor);
    const nextWeek = PLAN_WEEKS[PLAN_WEEKS.indexOf(weekFor) + 1] ?? upcoming;

    return base.map((b) => {
      if (b.id === "sun-ship") {
        return {
          ...b,
          label: hasBuild ? "SHIP BUILD V0 + TEST" : "REFLECTION + STRATEGY",
          note: hasBuild
            ? `${weekFor.buildTarget} · finish · run once · iterate`
            : `Week ${weekFor.weekNumber} had no build — retro the week, identify top interrupts, rest`,
          emphasis: hasBuild ? b.emphasis : "normal",
        };
      }
      if (b.id === "sun-prep") {
        if (nextWeek) {
          return {
            ...b,
            note: `Week ${nextWeek.weekNumber} — ${nextWeek.phase.replace(/^Month \d+ — /, "")} · 25 outbound · pipeline · Monday's one thing · block calendar`,
          };
        }
        return b;
      }
      return b;
    });
  }

  return base;
}

function sameYMD(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function TodayScheduleCard() {
  const [now, setNow] = useState(() => new Date());

  // Tick every minute so "you are here" advances.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Rolling 7-day strip starting from today.
  const stripAnchor = useMemo(() => computeStripAnchor(new Date()), []);
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(stripAnchor);
      d.setDate(stripAnchor.getDate() + i);
      return d;
    });
  }, [stripAnchor]);

  // Default selected day = today if today is in the week strip, else Monday of strip.
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const inStrip = weekDays.some((d) => sameYMD(d, today));
    return inStrip ? today : weekDays[0];
  });

  const base = useMemo(() => {
    const d = new Date(selectedDate);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [selectedDate]);

  const kind: ScheduleKind = scheduleKindForDay(base.getDay());
  const blocks = useMemo(() => getContextualBlocks(base, kind), [base, kind]);
  const isToday = sameYMD(base, today);

  // Whole card collapsed state (default collapsed on load).
  const [cardExpanded, setCardExpanded] = useState(false);

  const dayLabel = base.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  // Fetch calendar events for the whole strip in one call.
  const weekStart = useMemo(() => {
    const d = new Date(stripAnchor);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [stripAnchor]);
  const weekEnd = useMemo(() => {
    const d = new Date(stripAnchor);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  }, [stripAnchor]);

  const { data: weekEvents = [] } = useCalendarEvents({
    startTime: weekStart,
    endTime: weekEnd,
    limit: 500,
  });

  // Count events per day for badges on the strip.
  const eventsByDay = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ev of weekEvents) {
      if (ev.isCancelled) continue;
      const d = parseOutlookDate(ev.startAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [weekEvents]);

  // Filter events to just the selected day for the block merge.
  const events = useMemo(() => {
    return weekEvents.filter((ev) => {
      if (ev.isCancelled) return false;
      const d = parseOutlookDate(ev.startAt);
      return sameYMD(d, base);
    });
  }, [weekEvents, base]);

  // Insight for collapsed card header: active block + event count for selected day.
  const activeBlock = useMemo(
    () => (isToday ? blocks.find((b) => isBlockActive(b, now, base)) : undefined),
    [isToday, blocks, now, base]
  );
  const dayEventCount = events.length;

  // Group events by block
  const eventsByBlock = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      if (ev.isCancelled) continue;
      const evStart = parseOutlookDate(ev.startAt);
      for (const b of blocks) {
        const bStart = blockDate(base, b.startTime);
        const bEnd = blockDate(base, b.endTime === "24:00" ? "23:59" : b.endTime);
        if (evStart >= bStart && evStart < bEnd) {
          const arr = map.get(b.id) ?? [];
          arr.push(ev);
          map.set(b.id, arr);
          break;
        }
      }
    }
    return map;
  }, [events, blocks, base]);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div
        className={cn(
          "flex items-center justify-between px-4 py-2.5",
          cardExpanded && "border-b border-slate-200 dark:border-slate-800"
        )}
      >
        <button
          type="button"
          onClick={() => setCardExpanded((v) => !v)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left group"
        >
          <ChevronRight
            className={cn(
              "flex-shrink-0 w-3.5 h-3.5 text-slate-400 dark:text-slate-500 transition-transform",
              cardExpanded && "rotate-90"
            )}
          />
          <h2 className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
            Schedule
          </h2>
          {cardExpanded ? (
            <>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">· {dayLabel}</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 uppercase tracking-wider">
                {dayTypeLabel(kind)}
              </span>
            </>
          ) : (
            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate min-w-0 flex items-center gap-1.5">
              {activeBlock ? (
                <>
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-teal-600 text-white">
                    Now
                  </span>
                  <span className="font-medium text-slate-700 dark:text-slate-200 truncate">
                    {activeBlock.label}
                  </span>
                </>
              ) : (
                <span className="truncate">{dayLabel}</span>
              )}
              {dayEventCount > 0 && (
                <span className="text-[9px] font-semibold tabular-nums px-1.5 py-0.5 rounded-sm bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 flex items-center gap-1 flex-shrink-0">
                  <span className="w-1 h-1 rounded-full bg-blue-500" />
                  {dayEventCount} event{dayEventCount > 1 ? "s" : ""}
                </span>
              )}
            </span>
          )}
        </button>
        {cardExpanded && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedDate(today);
            }}
            className="text-[11px] font-medium px-2 py-0.5 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex-shrink-0"
          >
            Jump to today
          </button>
        )}
      </div>

      {cardExpanded && (
        <>
      {/* Week day strip */}
      <div className="flex items-stretch border-b border-slate-100 dark:border-slate-800">
        {weekDays.map((d) => {
          const selected = sameYMD(d, base);
          const isTodayPill = sameYMD(d, today);
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
          const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          const eventCount = eventsByDay.get(key) ?? 0;
          const dayAbbr = d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
          return (
            <button
              key={d.toISOString()}
              onClick={() => setSelectedDate(new Date(d))}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors border-r border-slate-100 dark:border-slate-800 last:border-r-0 relative",
                selected
                  ? "bg-teal-50 dark:bg-teal-950/30"
                  : "hover:bg-slate-50 dark:hover:bg-slate-800/40",
                isWeekend && !selected && "bg-slate-50/50 dark:bg-slate-900/50"
              )}
            >
              <span
                className={cn(
                  "text-[9px] font-semibold uppercase tracking-wider",
                  selected
                    ? "text-teal-700 dark:text-teal-300"
                    : "text-slate-400 dark:text-slate-500"
                )}
              >
                {dayAbbr}
              </span>
              <span
                className={cn(
                  "text-[14px] font-semibold tabular-nums flex items-center justify-center w-7 h-7 rounded-full",
                  isTodayPill && !selected && "ring-2 ring-teal-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-900",
                  selected
                    ? "bg-teal-600 text-white"
                    : isTodayPill
                    ? "text-teal-700 dark:text-teal-300"
                    : "text-slate-700 dark:text-slate-200"
                )}
              >
                {d.getDate()}
              </span>
              {eventCount > 0 && (
                <span
                  className={cn(
                    "text-[9px] font-medium tabular-nums flex items-center gap-0.5",
                    selected
                      ? "text-teal-600 dark:text-teal-400"
                      : "text-slate-400 dark:text-slate-500"
                  )}
                >
                  <span className="w-1 h-1 rounded-full bg-blue-500" />
                  {eventCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {blocks.map((b) => {
          const active = isToday && isBlockActive(b, now, base);
          const blockEvents = eventsByBlock.get(b.id) ?? [];
          return (
            <li
              key={b.id}
              className={cn(
                "px-4 py-2 flex items-start gap-3 transition-colors",
                active && "bg-teal-50/60 dark:bg-teal-950/30 border-l-[3px] border-l-teal-500",
                !active && "border-l-[3px] border-l-transparent",
                b.emphasis === "off" && !active && "opacity-60"
              )}
            >
              <div className="flex-shrink-0 w-20 text-[11px] tabular-nums font-mono text-slate-500 dark:text-slate-400 pt-0.5">
                {b.startTime}–{b.endTime === "24:00" ? "00:00" : b.endTime}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-[12px] font-semibold",
                      b.emphasis === "sacred"
                        ? "text-teal-700 dark:text-teal-300 uppercase tracking-wider"
                        : b.emphasis === "off"
                        ? "text-slate-500 dark:text-slate-500"
                        : b.emphasis === "break"
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-slate-800 dark:text-slate-100"
                    )}
                  >
                    {b.label}
                  </span>
                  {active && (
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-teal-600 text-white">
                      Now · {formatClock(now)}
                    </span>
                  )}
                </div>
                {b.note && (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                    {b.note}
                  </div>
                )}
                {blockEvents.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {blockEvents.map((ev) => {
                      const evStart = parseOutlookDate(ev.startAt);
                      const evEnd = parseOutlookDate(ev.endAt);
                      return (
                        <li
                          key={ev.id}
                          className="text-[11px] text-slate-700 dark:text-slate-200 flex items-baseline gap-1.5"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                          <span className="font-mono text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                            {formatClock(evStart)}–{formatClock(evEnd)}
                          </span>
                          <span className="font-medium truncate">{ev.subject}</span>
                          {ev.location && (
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                              · {ev.location}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ul>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Row 2 — Client Delivery (view over work projects with linked company)
// ============================================================================

function DeliveryGrid({ onOpenProject }: { onOpenProject: (projectId: string) => void }) {
  const { data: projects = [], isLoading } = useDeliveryProjects();
  const openTab = useModuleTabStore((s) => s.openTab);
  const [cardExpanded, setCardExpanded] = useState(false);

  const openWorkModule = () => openTab("work");

  // Insight metrics for the collapsed header.
  const hotCount = projects.filter((p) => p.blocked_tasks > 0 || p.overdue_tasks > 0).length;
  const overdueTotal = projects.reduce((sum, p) => sum + (p.overdue_tasks ?? 0), 0);
  const blockedTotal = projects.reduce((sum, p) => sum + (p.blocked_tasks ?? 0), 0);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div
        className={cn(
          "flex items-center justify-between px-4 py-2.5",
          cardExpanded && "border-b border-slate-200 dark:border-slate-800"
        )}
      >
        <button
          type="button"
          onClick={() => setCardExpanded((v) => !v)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          <ChevronRight
            className={cn(
              "flex-shrink-0 w-3.5 h-3.5 text-slate-400 dark:text-slate-500 transition-transform",
              cardExpanded && "rotate-90"
            )}
          />
          <h2 className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
            Client Delivery
          </h2>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            {projects.length} active
          </span>
          {!cardExpanded && (
            <span className="flex items-center gap-1.5 min-w-0">
              {hotCount > 0 ? (
                <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 flex items-center gap-1 flex-shrink-0">
                  <AlertTriangle size={9} />
                  {hotCount} hot
                </span>
              ) : projects.length > 0 ? (
                <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 flex-shrink-0">
                  All clear
                </span>
              ) : null}
              {overdueTotal > 0 && (
                <span className="text-[10px] tabular-nums text-amber-600 dark:text-amber-400 flex-shrink-0">
                  {overdueTotal} overdue
                </span>
              )}
              {blockedTotal > 0 && (
                <span className="text-[10px] tabular-nums text-rose-600 dark:text-rose-400 flex-shrink-0">
                  {blockedTotal} blocked
                </span>
              )}
            </span>
          )}
        </button>
        {cardExpanded && (
          <Button variant="ghost" size="sm" icon={ExternalLink} onClick={(e) => { e.stopPropagation(); openWorkModule(); }}>
            Open Work
          </Button>
        )}
      </div>

      {cardExpanded && (isLoading ? (
        <div className="p-6 text-center text-[12px] text-slate-500">Loading…</div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="No linked delivery projects"
          message="Create work projects with a company link in the Work module to see them here."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <th className="text-left px-4 py-2">Client</th>
                <th className="text-left px-3 py-2">Workstream</th>
                <th className="text-right px-3 py-2">Open</th>
                <th className="text-right px-3 py-2">In Prog</th>
                <th className="text-right px-3 py-2">Blocked</th>
                <th className="text-right px-3 py-2">Overdue</th>
                <th className="text-left px-3 py-2">Health</th>
                <th className="text-left px-3 py-2">Last Activity</th>
                <th className="px-3 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const hot = p.blocked_tasks > 0 || p.overdue_tasks > 0;
                return (
                  <tr
                    key={p.id}
                    onClick={() => onOpenProject(p.id)}
                    className={cn(
                      "border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer",
                      hot && "bg-rose-50/50 dark:bg-rose-950/20"
                    )}
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {hot && <AlertTriangle size={12} className="text-rose-500 flex-shrink-0" />}
                        <div className="min-w-0">
                          <div className="font-medium text-slate-800 dark:text-slate-100 truncate">
                            {p.company_name}
                          </div>
                          {p.company_domain_id && (
                            <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono truncate">
                              {p.company_domain_id}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300 truncate max-w-[200px]">
                      {p.workstream}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300 font-medium">
                      {p.open_tasks}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                      {p.in_progress_tasks || <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {p.blocked_tasks > 0 ? (
                        <span className="text-rose-600 dark:text-rose-400 font-semibold">
                          {p.blocked_tasks}
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {p.overdue_tasks > 0 ? (
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">
                          {p.overdue_tasks}
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md",
                          healthColor(p.derived_health)
                        )}
                        title={p.health ? "Set on project" : "Derived from task state"}
                      >
                        {healthLabel(p.derived_health)}
                        {!p.health && p.derived_health && (
                          <span className="text-[8px] opacity-60">auto</span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 tabular-nums">
                      {daysSince(p.last_task_activity)}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        title="Open project"
                        aria-label="Open project"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenProject(p.id);
                        }}
                        className="inline-flex items-center justify-center w-6 h-6 rounded bg-teal-600 hover:bg-teal-700 text-white transition-colors"
                      >
                        <ArrowRight size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Row 3 — Escalation Inbox
// ============================================================================

function EscalationInbox({ onLog }: { onLog: () => void }) {
  const { data: escalations = [], isLoading } = useUnresolvedEscalations();
  const updateEsc = useUpdateEscalation();
  const [cardExpanded, setCardExpanded] = useState(false);

  const resolve = (id: string) => {
    updateEsc.mutate({ id, updates: { resolved: true } });
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div
        className={cn(
          "flex items-center justify-between px-4 py-2.5",
          cardExpanded && "border-b border-slate-200 dark:border-slate-800"
        )}
      >
        <button
          type="button"
          onClick={() => setCardExpanded((v) => !v)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          <ChevronRight
            className={cn(
              "flex-shrink-0 w-3.5 h-3.5 text-slate-400 dark:text-slate-500 transition-transform",
              cardExpanded && "rotate-90"
            )}
          />
          <h2 className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
            Escalation Inbox
          </h2>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            {escalations.length} unresolved
          </span>
          {!cardExpanded && (
            <span className="flex items-center gap-1.5 min-w-0">
              {escalations.length > 0 ? (
                <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 flex items-center gap-1 flex-shrink-0">
                  <AlertTriangle size={9} />
                  Needs triage
                </span>
              ) : (
                <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 flex-shrink-0">
                  Clear
                </span>
              )}
            </span>
          )}
        </button>
        <Button
          variant="primary"
          size="sm"
          icon={Plus}
          onClick={(e) => {
            e.stopPropagation();
            onLog();
          }}
        >
          Log interrupt
        </Button>
      </div>

      {cardExpanded && (isLoading ? (
        <div className="p-6 text-center text-[12px] text-slate-500">Loading…</div>
      ) : escalations.length === 0 ? (
        <div className="p-6 text-center">
          <CheckCircle2 size={20} className="mx-auto text-emerald-500 mb-1.5" />
          <p className="text-[12px] text-slate-600 dark:text-slate-300 font-medium">Inbox clear</p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
            Log the next interrupt the moment it happens.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {escalations.map((e) => (
            <li key={e.id} className="px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                      {categoryLabel(e.category)}
                    </span>
                    {e.client_name && (
                      <>
                        <span className="text-slate-300 dark:text-slate-700">·</span>
                        <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                          {e.client_name}
                        </span>
                      </>
                    )}
                    {e.time_spent_minutes != null && (
                      <>
                        <span className="text-slate-300 dark:text-slate-700">·</span>
                        <span className="inline-flex items-center gap-0.5 text-[11px] text-slate-500">
                          <Clock size={10} />
                          {e.time_spent_minutes}m
                        </span>
                      </>
                    )}
                  </div>
                  {e.notes && (
                    <p className="text-[12px] text-slate-600 dark:text-slate-300 leading-snug">{e.notes}</p>
                  )}
                  <div className="text-[10px] text-slate-400 dark:text-slate-600 mt-0.5 tabular-nums">
                    {new Date(e.occurred_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <IconButton icon={CheckCircle2} label="Mark resolved" onClick={() => resolve(e.id)} />
              </div>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

// ============================================================================
// Sacred Rule Banner — always-visible reminder
// ============================================================================

function SacredRuleBanner() {
  return (
    <div className="px-6 py-2 bg-gradient-to-r from-teal-50 via-teal-50/70 to-amber-50/40 dark:from-teal-950/40 dark:via-teal-950/20 dark:to-amber-950/20 border-b border-teal-200/60 dark:border-teal-900/40">
      <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4 text-[11px]">
        <div className="flex items-center gap-2 text-teal-800 dark:text-teal-300 font-medium">
          <Flame size={12} className="text-teal-600 dark:text-teal-400 flex-shrink-0" />
          <span className="truncate">
            Sales is sacred · 9am–12pm no interrupts · When uncertain, default to sales
          </span>
        </div>
        <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold flex-shrink-0">
          The engine metric: sales UP · interrupts DOWN w/w
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Sidebar — Targets & Progress (daily → weekly → monthly cascade)
// ============================================================================

function TierBar({
  label,
  actual,
  target,
  unit,
  hint,
}: {
  label: string;
  actual: number;
  target: number;
  unit: string;
  hint?: string;
}) {
  const pct = Math.min(100, target === 0 ? 0 : (actual / target) * 100);
  const done = actual >= target;
  const colorClass = done
    ? "bg-emerald-500"
    : pct >= 50
    ? "bg-teal-500"
    : pct >= 25
    ? "bg-amber-500"
    : "bg-rose-500";
  return (
    <div>
      <div className="flex items-baseline justify-between mb-0.5">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
          {label}
        </span>
        <span
          className={cn(
            "text-[11px] font-semibold tabular-nums",
            done
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-slate-800 dark:text-slate-100"
          )}
        >
          {actual.toFixed(unit === "h" ? 1 : 0)}
          <span className="text-slate-400 dark:text-slate-500 font-normal">
            {" "}
            / {target}
            {unit}
          </span>
        </span>
      </div>
      <div className="h-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div className={cn("h-full transition-all", colorClass)} style={{ width: `${pct}%` }} />
      </div>
      {hint && (
        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
          {hint}
        </div>
      )}
    </div>
  );
}

function Checkbox({
  checked,
  label,
  sub,
  onToggle,
}: {
  checked: boolean | null;
  label: string;
  sub: string;
  onToggle: () => void;
}) {
  const done = checked === true;
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-start gap-2 text-left group"
    >
      <div
        className={cn(
          "mt-0.5 w-3.5 h-3.5 rounded-sm border-[1.5px] flex-shrink-0 flex items-center justify-center transition-colors",
          done
            ? "bg-emerald-500 border-emerald-500"
            : "border-slate-300 dark:border-slate-600 group-hover:border-teal-500"
        )}
      >
        {done && <CheckCircle2 size={10} className="text-white" strokeWidth={3} />}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            "text-[10px] font-semibold uppercase tracking-wider",
            done ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"
          )}
        >
          {label}
        </div>
        <div
          className={cn(
            "text-[11px] leading-snug",
            done
              ? "text-emerald-700 dark:text-emerald-300 line-through decoration-emerald-500/50"
              : "text-slate-700 dark:text-slate-300"
          )}
        >
          {sub}
        </div>
      </div>
    </button>
  );
}

function TargetsPanel() {
  const { week, state, daysIntoWeek } = useMemo(() => getCurrentPlanWeek(), []);
  const month = useMemo(() => getCurrentMonth(), []);
  const { data: focus } = useDailyFocus();
  const { data: weekly } = useWeeklySummary();

  // Month range: from first week of current month to last week (inclusive Friday)
  const firstMonthWeek = month.weeks[0];
  const lastMonthWeek = month.weeks[month.weeks.length - 1];
  const monthStart = firstMonthWeek?.startDate ?? week.startDate;
  const monthEndInclusive = useMemo(() => {
    if (!lastMonthWeek) return week.startDate;
    const d = new Date(lastMonthWeek.startDate + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 4); // Friday
    return d.toISOString().slice(0, 10);
  }, [lastMonthWeek, week.startDate]);
  const { data: monthly } = useRangeSummary(monthStart, monthEndInclusive);

  const { data: progress } = usePlanWeekProgress(week.weekNumber, week.startDate);
  const updateProgress = useUpdatePlanWeekProgress();

  const dailySalesTarget = dailySalesTargetFor(week);
  const dailyOutboundTarget = dailyOutboundTargetFor(week);
  const dailySales = Number(focus?.sales_hours_actual ?? 0);
  const dailyOutbound = focus?.outbound_sent ?? 0;

  const weeklySalesTarget = week.salesHoursTarget;
  const weeklyOutboundTarget = week.outboundWeeklyTarget;
  const weeklySales = Number(weekly?.sales_hours_total ?? 0);
  const weeklyOutbound = weekly?.outbound_sent ?? 0;

  const monthlySalesTarget = month.salesHoursTarget;
  const monthlyOutboundTarget = month.outboundTarget;
  const monthlySales = Number(monthly?.sales_hours_total ?? 0);
  const monthlyOutbound = monthly?.outbound_sent ?? 0;

  // Weekly pacing hint: how many hours needed per remaining day.
  const pacingHint = useMemo(() => {
    const activeToday = state === "active" && daysIntoWeek <= 4; // Mon=0..Fri=4
    const remainingSalesHours = Math.max(0, weeklySalesTarget - weeklySales);
    if (!activeToday) {
      if (state === "upcoming") return `Plan starts Mon ${week.startDate.slice(5)}`;
      if (weeklySales >= weeklySalesTarget) return "Week target hit";
      return `${remainingSalesHours.toFixed(1)}h short of week target`;
    }
    const workingDaysLeft = Math.max(1, 5 - daysIntoWeek);
    if (remainingSalesHours <= 0) return "Week target hit — keep pushing";
    const perDay = remainingSalesHours / workingDaysLeft;
    return `${remainingSalesHours.toFixed(1)}h left · ${perDay.toFixed(1)}h/day over ${workingDaysLeft} day${workingDaysLeft === 1 ? "" : "s"}`;
  }, [state, daysIntoWeek, weeklySalesTarget, weeklySales, week.startDate]);

  const toggleGoal = () => {
    if (!progress) return;
    updateProgress.mutate({
      weekNumber: week.weekNumber,
      updates: { goal_achieved: progress.goal_achieved === true ? null : true },
    });
  };
  const toggleBuild = () => {
    if (!progress) return;
    updateProgress.mutate({
      weekNumber: week.weekNumber,
      updates: { build_shipped: progress.build_shipped === true ? null : true },
    });
  };

  const badge =
    state === "upcoming"
      ? "Upcoming"
      : state === "past"
      ? "Past"
      : `Day ${Math.min(7, daysIntoWeek + 1)}/7`;

  return (
    <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-4">
      <div>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
            Targets & Progress
          </h3>
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 uppercase tracking-wider">
            W{week.weekNumber} · {badge}
          </span>
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {week.phase}
        </div>
      </div>

      {/* Today */}
      <div className="space-y-2">
        <TierBar label="Today · sales" actual={dailySales} target={dailySalesTarget} unit="h" />
        <TierBar
          label="Today · outbound"
          actual={dailyOutbound}
          target={dailyOutboundTarget}
          unit=""
        />
      </div>

      {/* This week */}
      <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <TierBar
          label="This week · sales"
          actual={weeklySales}
          target={weeklySalesTarget}
          unit="h"
          hint={pacingHint}
        />
        <TierBar
          label="This week · outbound"
          actual={weeklyOutbound}
          target={weeklyOutboundTarget}
          unit=""
        />
      </div>

      {/* This month */}
      <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <TierBar
          label="This month · sales"
          actual={monthlySales}
          target={monthlySalesTarget}
          unit="h"
        />
        <TierBar
          label="This month · outbound"
          actual={monthlyOutbound}
          target={monthlyOutboundTarget}
          unit=""
        />
      </div>

      {/* Qualitative checkboxes */}
      <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <Checkbox
          checked={progress?.goal_achieved ?? null}
          label="Main goal"
          sub={week.mainGoal}
          onToggle={toggleGoal}
        />
        <Checkbox
          checked={progress?.build_shipped ?? null}
          label="Build target"
          sub={week.buildTarget}
          onToggle={toggleBuild}
        />
      </div>

      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 dark:text-slate-600 italic leading-snug">
        Full plan: <span className="font-mono not-italic">_team/melvin/plan.md</span>
      </div>
    </div>
  );
}

// ============================================================================
// Sidebar — Weekly Summary
// ============================================================================

function WeeklySummaryPanel() {
  const { data: summary } = useWeeklySummary();

  if (!summary) {
    return <div className="p-4 text-[11px] text-slate-400">Loading…</div>;
  }

  const salesPct = Math.min(100, (summary.sales_hours_total / Math.max(1, summary.sales_hours_target)) * 100);
  const outboundPct = Math.min(100, (summary.outbound_sent / Math.max(1, summary.outbound_target)) * 100);
  const topCats = Object.entries(summary.escalations_by_category)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <div className="p-4 space-y-5">
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 mb-2">
          This Week
        </h3>

        <div className="space-y-3">
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Sales hours</span>
              <span className="text-[11px] font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                {summary.sales_hours_total.toFixed(1)} / {summary.sales_hours_target.toFixed(0)}
              </span>
            </div>
            <div className="h-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div className="h-full bg-teal-500 transition-all" style={{ width: `${salesPct}%` }} />
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Outbound</span>
              <span className="text-[11px] font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                {summary.outbound_sent} / {summary.outbound_target}
              </span>
            </div>
            <div className="h-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${outboundPct}%` }} />
            </div>
          </div>

          <div className="pt-1">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Interrupts</span>
              <span
                className={cn(
                  "text-[11px] font-semibold tabular-nums",
                  summary.escalations_total === 0
                    ? "text-emerald-600"
                    : summary.escalations_total < 10
                    ? "text-amber-600"
                    : "text-rose-600"
                )}
              >
                {summary.escalations_total}
              </span>
            </div>
          </div>
        </div>
      </div>

      {topCats.length > 0 && (
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 mb-2">
            By category
          </h3>
          <div className="space-y-1">
            {topCats.map(([cat, count]) => (
              <div key={cat} className="flex items-center justify-between text-[11px]">
                <span className="text-slate-600 dark:text-slate-300">
                  {categoryLabel(cat as EscalationCategory)}
                </span>
                <span className="text-slate-500 dark:text-slate-400 tabular-nums font-semibold">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
        <div className="text-[10px] text-slate-400 dark:text-slate-600 leading-relaxed">
          Review Friday 5:30pm. If sales hours are up and interrupts are down week-over-week, the engine is working.
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Modal — Log Escalation
// ============================================================================

function LogEscalationModal({ onClose }: { onClose: () => void }) {
  const logEsc = useLogEscalation();
  const [category, setCategory] = useState<EscalationCategory>("troubleshooting");
  const [clientName, setClientName] = useState("");
  const [minutes, setMinutes] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      await logEsc.mutateAsync({
        occurred_at: new Date().toISOString(),
        client_name: clientName || null,
        company_id: null,
        category,
        time_spent_minutes: minutes ? Number(minutes) : null,
        was_me: true,
        resolved: false,
        resolved_at: null,
        notes: notes || null,
      });
      onClose();
    } catch (e: any) {
      setErr(e.message ?? "Failed to log");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-[14px] font-semibold text-slate-800 dark:text-slate-100">Log interrupt</h2>
          <IconButton icon={X} label="Close" size={18} onClick={onClose} />
        </div>
        <form onSubmit={submit} className="p-4 space-y-4">
          {err && (
            <div className="text-[12px] text-rose-600 bg-rose-50 dark:bg-rose-950/30 p-2 rounded">{err}</div>
          )}

          <FormField label="Category" required>
            <Select value={category} onChange={(e) => setCategory(e.target.value as EscalationCategory)}>
              {ESCALATION_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Client">
            <Input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g. Koi"
            />
          </FormField>

          <FormField label="Time spent (minutes)">
            <Input
              type="number"
              min={0}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="0"
            />
          </FormField>

          <FormField label="Notes">
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What happened? Why did it pull you out of sales?"
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="md" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" icon={Send} loading={logEsc.isPending}>
              Log
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// Root — HomeModule
// ============================================================================

export function HomeModule() {
  const [logOpen, setLogOpen] = useState(false);
  const openTab = useModuleTabStore((s) => s.openTab);
  const setNavTarget = useNotificationNavStore((s) => s.setTarget);

  const todayString = useMemo(() => todayLabel(), []);

  const openProject = (projectId: string) => {
    // Push target first so ProjectsModule's effect can pick it up on mount.
    setNavTarget("project", projectId, false);
    // Actual switch — moduleTabStore.openTab is the real source of truth for the Shell.
    openTab("work");
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950">
      <PageHeader description="Your daily cockpit. Sales is sacred. Log every interrupt. Review Friday 5:30pm." />

      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-lg text-slate-800 dark:text-slate-100">Cockpit</h1>
          <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">{todayString}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => setLogOpen(true)}>
            Log interrupt
          </Button>
        </div>
      </div>

      <SacredRuleBanner />

      <div className="flex-1 flex overflow-hidden">
        {/* Main cockpit column */}
        <div className="flex-1 overflow-y-auto scrollbar-auto-hide p-5">
          <div className="max-w-[1100px] mx-auto space-y-4">
            <CommitmentBar />
            <TodayScheduleCard />
            <DeliveryGrid onOpenProject={openProject} />
            <EscalationInbox onLog={() => setLogOpen(true)} />
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-[260px] shrink-0 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-y-auto scrollbar-auto-hide">
          <TargetsPanel />
          <WeeklySummaryPanel />
        </div>
      </div>

      {logOpen && <LogEscalationModal onClose={() => setLogOpen(false)} />}
    </div>
  );
}
