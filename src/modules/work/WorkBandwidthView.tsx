// src/modules/work/WorkBandwidthView.tsx
// Team Bandwidth View — pulse check on workload, slippage, and risk

import { useState, useMemo } from "react";
import {
  AlertTriangle, TrendingUp, TrendingDown, Clock, CheckCircle2,
  ChevronDown, ChevronRight, Minus, Activity, Users,
} from "lucide-react";
import type { TaskWithRelations, User, Initiative } from "../../lib/work/types";
import { isOverdue } from "../../lib/date";
import { TaskRow, Stat, initials } from "./workViewsShared";
import type { InitiativeProjectLink } from "./workViewsShared";

// ─── Types ───────────────────────────────────────────────────────────────

interface PersonStats {
  user: User | null;
  active: TaskWithRelations[];
  overdue: TaskWithRelations[];
  dueThisWeek: TaskWithRelations[];
  highPriority: TaskWithRelations[]; // priority 1 or 2
  stale: TaskWithRelations[]; // not updated in 7+ days
  noDate: TaskWithRelations[];
  completedThisWeek: TaskWithRelations[];
  completedLastWeek: TaskWithRelations[];
  inProgress: TaskWithRelations[];
}

type LoadLevel = "overloaded" | "heavy" | "normal" | "light" | "idle";

// ─── Helpers ─────────────────────────────────────────────────────────────

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function isThisWeek(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return d >= now && d <= weekEnd;
}

function isActive(t: TaskWithRelations): boolean {
  return t.status?.type !== "complete";
}

function wasCompletedInRange(t: TaskWithRelations, startMs: number, endMs: number): boolean {
  if (t.status?.type !== "complete" || !t.updated_at) return false;
  const ts = new Date(t.updated_at).getTime();
  return ts >= startMs && ts < endMs;
}

function isStale(t: TaskWithRelations): boolean {
  if (!t.updated_at) return false;
  return Date.now() - new Date(t.updated_at).getTime() > WEEK_MS;
}

function getLoadLevel(activeCount: number): LoadLevel {
  if (activeCount >= 25) return "overloaded";
  if (activeCount >= 15) return "heavy";
  if (activeCount >= 5) return "normal";
  if (activeCount >= 1) return "light";
  return "idle";
}

const LOAD_CONFIG: Record<LoadLevel, { label: string; color: string; bg: string }> = {
  overloaded: { label: "Overloaded", color: "#EF4444", bg: "bg-red-50 dark:bg-red-900/20" },
  heavy: { label: "Heavy", color: "#F59E0B", bg: "bg-amber-50 dark:bg-amber-900/20" },
  normal: { label: "Normal", color: "#3B82F6", bg: "bg-blue-50 dark:bg-blue-900/20" },
  light: { label: "Light", color: "#10B981", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
  idle: { label: "Idle", color: "#9CA3AF", bg: "bg-zinc-50 dark:bg-zinc-800/30" },
};

function computePersonStats(
  userId: string | null,
  user: User | null,
  allTasks: TaskWithRelations[],
  nowMs: number,
  weekAgoMs: number,
  twoWeeksAgoMs: number,
): PersonStats {
  const userTasks = allTasks.filter(t =>
    userId === null
      ? (!t.assignees || t.assignees.length === 0)
      : (t.assignees || []).some(a => a.user?.id === userId)
  );
  const active = userTasks.filter(isActive);

  return {
    user,
    active,
    overdue: active.filter(t => isOverdue(t.due_date)),
    dueThisWeek: active.filter(t => isThisWeek(t.due_date)),
    highPriority: active.filter(t => t.priority === 1 || t.priority === 2),
    stale: active.filter(t => isStale(t) && t.status?.type !== "todo"),
    noDate: active.filter(t => !t.due_date),
    completedThisWeek: userTasks.filter(t => wasCompletedInRange(t, weekAgoMs, nowMs)),
    completedLastWeek: userTasks.filter(t => wasCompletedInRange(t, twoWeeksAgoMs, weekAgoMs)),
    inProgress: active.filter(t => t.status?.type === "in_progress"),
  };
}

// ─── Load Bar ────────────────────────────────────────────────────────────

function LoadBar({ stats }: { stats: PersonStats }) {
  const total = stats.active.length;
  const overdueCount = stats.overdue.length;
  const inProgressCount = stats.inProgress.length;
  const todoCount = total - overdueCount - inProgressCount;
  const max = 30; // scale reference

  const pctOverdue = Math.min((overdueCount / max) * 100, 100);
  const pctInProgress = Math.min((inProgressCount / max) * 100, 100);
  const pctTodo = Math.min((Math.max(todoCount, 0) / max) * 100, 100);

  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-2.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden flex">
        {pctOverdue > 0 && (
          <div className="h-full bg-red-400 dark:bg-red-500" style={{ width: `${pctOverdue}%` }} title={`${overdueCount} overdue`} />
        )}
        {pctInProgress > 0 && (
          <div className="h-full bg-amber-400 dark:bg-amber-500" style={{ width: `${pctInProgress}%` }} title={`${inProgressCount} in progress`} />
        )}
        {pctTodo > 0 && (
          <div className="h-full bg-blue-300 dark:bg-blue-600" style={{ width: `${pctTodo}%` }} title={`${Math.max(todoCount, 0)} todo`} />
        )}
      </div>
      <span className="text-xs text-zinc-500 tabular-nums w-6 text-right">{total}</span>
    </div>
  );
}

// ─── Velocity Indicator ──────────────────────────────────────────────────

function VelocityIndicator({ thisWeek, lastWeek }: { thisWeek: number; lastWeek: number }) {
  if (lastWeek === 0 && thisWeek === 0) {
    return <span className="text-[10px] text-zinc-400">—</span>;
  }
  if (lastWeek === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
        <TrendingUp size={10} /> {thisWeek}
      </span>
    );
  }
  const delta = thisWeek - lastWeek;
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
        <TrendingUp size={10} /> {thisWeek}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-red-500 font-medium">
        <TrendingDown size={10} /> {thisWeek}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] text-zinc-500 font-medium">
      <Minus size={10} /> {thisWeek}
    </span>
  );
}

// ─── Person Row ──────────────────────────────────────────────────────────

function PersonRow({ stats, onSelectTask, contextLabels }: { stats: PersonStats; onSelectTask: (id: string) => void; contextLabels?: Map<string, string> }) {
  const [expanded, setExpanded] = useState(false);
  const load = getLoadLevel(stats.active.length);
  const cfg = LOAD_CONFIG[load];
  const hasAlerts = stats.overdue.length > 0 || stats.stale.length > 0;

  return (
    <div className="mb-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors rounded-lg ${hasAlerts ? "border-l-2 border-red-400" : ""}`}
      >
        {expanded
          ? <ChevronDown size={12} className="text-zinc-400 flex-shrink-0" />
          : <ChevronRight size={12} className="text-zinc-400 flex-shrink-0" />
        }

        {/* Avatar */}
        <div className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-xs font-medium text-zinc-600 dark:text-zinc-400 flex-shrink-0">
          {stats.user ? initials(stats.user.name) : "?"}
        </div>

        {/* Name */}
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 w-28 truncate text-left flex-shrink-0">
          {stats.user?.name || "Unassigned"}
        </span>

        {/* Load badge */}
        <span
          className="text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0"
          style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}
        >
          {cfg.label}
        </span>

        {/* Load bar */}
        <LoadBar stats={stats} />

        {/* Alert pills */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {stats.overdue.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 font-medium">
              {stats.overdue.length} overdue
            </span>
          )}
          {stats.stale.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400 font-medium">
              {stats.stale.length} stale
            </span>
          )}
        </div>

        {/* Velocity */}
        <div className="flex-shrink-0 w-10 text-right">
          <VelocityIndicator thisWeek={stats.completedThisWeek.length} lastWeek={stats.completedLastWeek.length} />
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="ml-8 pl-4 border-l-2 border-zinc-100 dark:border-zinc-800 pb-2">
          {/* Mini stats row */}
          <div className="flex items-center gap-4 px-3 py-2 text-[10px] text-zinc-500 uppercase tracking-wide">
            <span>{stats.inProgress.length} in progress</span>
            <span>{stats.dueThisWeek.length} due this week</span>
            <span>{stats.highPriority.length} high/urgent</span>
            <span>{stats.noDate.length} no date</span>
            <span>{stats.completedThisWeek.length} done this week</span>
          </div>

          {/* Overdue tasks first */}
          {stats.overdue.length > 0 && (
            <div className="mb-2">
              <div className="px-3 py-1 text-[10px] font-semibold text-red-500 uppercase tracking-wide">Overdue</div>
              {stats.overdue
                .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
                .map(t => <TaskRow key={t.id} task={t} onSelect={onSelectTask} contextLabel={contextLabels?.get(t.project_id)} />)
              }
            </div>
          )}

          {/* Stale tasks */}
          {stats.stale.length > 0 && (
            <div className="mb-2">
              <div className="px-3 py-1 text-[10px] font-semibold text-amber-500 uppercase tracking-wide">Stale (no update 7d+)</div>
              {stats.stale
                .sort((a, b) => new Date(a.updated_at || 0).getTime() - new Date(b.updated_at || 0).getTime())
                .slice(0, 10)
                .map(t => <TaskRow key={t.id} task={t} onSelect={onSelectTask} contextLabel={contextLabels?.get(t.project_id)} />)
              }
              {stats.stale.length > 10 && (
                <div className="px-3 py-1 text-[10px] text-zinc-400">+{stats.stale.length - 10} more</div>
              )}
            </div>
          )}

          {/* High priority without urgency signals */}
          {stats.highPriority.filter(t => !stats.overdue.includes(t)).length > 0 && (
            <div className="mb-2">
              <div className="px-3 py-1 text-[10px] font-semibold text-blue-500 uppercase tracking-wide">High Priority</div>
              {stats.highPriority
                .filter(t => !stats.overdue.includes(t))
                .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
                .slice(0, 10)
                .map(t => <TaskRow key={t.id} task={t} onSelect={onSelectTask} contextLabel={contextLabels?.get(t.project_id)} />)
              }
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Alert Card ──────────────────────────────────────────────────────────

function AlertCard({ title, count, color, icon: Icon, children, defaultOpen = true }: {
  title: string;
  count: number;
  color: string;
  icon: typeof AlertTriangle;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;

  return (
    <div className="rounded-lg border border-zinc-100 dark:border-zinc-800 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
      >
        {open ? <ChevronDown size={12} className="text-zinc-400" /> : <ChevronRight size={12} className="text-zinc-400" />}
        <Icon size={13} style={{ color }} />
        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{title}</span>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${color}15`, color }}>{count}</span>
      </button>
      {open && <div className="px-2 pb-2">{children}</div>}
    </div>
  );
}

// ─── Main View ───────────────────────────────────────────────────────────

const STALE_DAYS = 60;

function isTaskStale(t: TaskWithRelations): boolean {
  if (t.status?.type === "complete") return false;
  const threshold = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;
  // If due date exists and is older than threshold → stale
  if (t.due_date) return new Date(t.due_date).getTime() < threshold;
  // No due date — check updated_at
  const lastUpdate = t.updated_at ? new Date(t.updated_at).getTime() : 0;
  return lastUpdate < threshold;
}

export function BandwidthView({ allTasks, users, onSelectTask, initiatives, initiativeLinks }: {
  allTasks: TaskWithRelations[];
  users: User[];
  onSelectTask: (id: string) => void;
  initiatives?: Initiative[];
  initiativeLinks?: InitiativeProjectLink[];
}) {
  const [includeNotion, setIncludeNotion] = useState(true);
  const [showStale, setShowStale] = useState(false);

  // Build project_id → "Initiative › Project" lookup
  const contextLabels = useMemo(() => {
    const map = new Map<string, string>();
    if (!initiatives?.length || !initiativeLinks?.length) {
      for (const t of allTasks) {
        if (t.project?.name && !map.has(t.project_id)) {
          map.set(t.project_id, t.project.name);
        }
      }
      return map;
    }
    const initMap = new Map(initiatives.map(i => [i.id, i.name]));
    const projToInit = new Map<string, string>();
    for (const link of initiativeLinks) {
      const initName = initMap.get(link.initiative_id);
      if (initName) projToInit.set(link.project_id, initName);
    }
    for (const t of allTasks) {
      if (!map.has(t.project_id) && t.project?.name) {
        const initName = projToInit.get(t.project_id);
        map.set(t.project_id, initName ? `${initName} › ${t.project.name}` : t.project.name);
      }
    }
    return map;
  }, [allTasks, initiatives, initiativeLinks]);

  const filteredByNotion = useMemo(() => {
    return allTasks.filter(t => includeNotion || !(t as any).notion_page_id);
  }, [allTasks, includeNotion]);

  const staleCount = useMemo(() => filteredByNotion.filter(isTaskStale).length, [filteredByNotion]);

  const tasks = useMemo(() => {
    if (showStale) return filteredByNotion;
    return filteredByNotion.filter(t => !isTaskStale(t));
  }, [filteredByNotion, showStale]);

  const nowMs = Date.now();
  const weekAgoMs = nowMs - WEEK_MS;
  const twoWeeksAgoMs = nowMs - 2 * WEEK_MS;

  // Compute per-person stats
  const personStats = useMemo(() => {
    const assigneeIds = new Set<string | null>();
    for (const t of tasks) {
      if (!t.assignees || t.assignees.length === 0) {
        assigneeIds.add(null);
      } else {
        for (const a of t.assignees) {
          assigneeIds.add(a.user?.id || null);
        }
      }
    }

    const stats: PersonStats[] = [];
    for (const userId of assigneeIds) {
      const user = userId ? users.find(u => u.id === userId) || null : null;
      stats.push(computePersonStats(userId, user, tasks, nowMs, weekAgoMs, twoWeeksAgoMs));
    }

    // Sort: overloaded first, then by active count desc, unassigned last
    return stats.sort((a, b) => {
      if (!a.user && b.user) return 1;
      if (a.user && !b.user) return -1;
      // Sort by overdue count first, then active count
      if (a.overdue.length !== b.overdue.length) return b.overdue.length - a.overdue.length;
      return b.active.length - a.active.length;
    });
  }, [tasks, users, nowMs, weekAgoMs, twoWeeksAgoMs]);

  // Team-wide aggregates
  const teamStats = useMemo(() => {
    const activeTasks = tasks.filter(isActive);
    return {
      totalActive: activeTasks.length,
      totalOverdue: activeTasks.filter(t => isOverdue(t.due_date)).length,
      totalStale: activeTasks.filter(t => isStale(t) && t.status?.type !== "todo").length,
      completedThisWeek: tasks.filter(t => wasCompletedInRange(t, weekAgoMs, nowMs)).length,
      completedLastWeek: tasks.filter(t => wasCompletedInRange(t, twoWeeksAgoMs, weekAgoMs)).length,
      highPriorityNoDate: activeTasks.filter(t => (t.priority === 1 || t.priority === 2) && !t.due_date),
      overdueHighPriority: activeTasks.filter(t => isOverdue(t.due_date) && (t.priority === 1 || t.priority === 2)),
    };
  }, [tasks, nowMs, weekAgoMs, twoWeeksAgoMs]);

  const velocityDelta = teamStats.completedThisWeek - teamStats.completedLastWeek;

  return (
    <div className="h-full flex flex-col">
      {/* Stats bar */}
      <div className="flex-shrink-0 grid grid-cols-5 gap-3 p-4 border-b border-zinc-100 dark:border-zinc-800">
        <Stat label="Active" value={teamStats.totalActive} icon={Users} color="#0D7680" />
        <Stat label="Overdue" value={teamStats.totalOverdue} icon={AlertTriangle} color={teamStats.totalOverdue > 0 ? "#EF4444" : "#9CA3AF"} />
        <Stat label="Stale (7d+)" value={teamStats.totalStale} icon={Clock} color={teamStats.totalStale > 0 ? "#F59E0B" : "#9CA3AF"} />
        <Stat label="Done This Week" value={teamStats.completedThisWeek} icon={CheckCircle2} color="#10B981" />
        <Stat
          label="Velocity"
          value={`${velocityDelta >= 0 ? "+" : ""}${velocityDelta}`}
          icon={Activity}
          color={velocityDelta > 0 ? "#10B981" : velocityDelta < 0 ? "#EF4444" : "#9CA3AF"}
        />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Team Bandwidth</span>
          {/* Legend */}
          <div className="flex items-center gap-3 text-[10px] text-zinc-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-400" /> Overdue</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-400" /> In Progress</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-300" /> Todo</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
            <input type="checkbox" checked={showStale} onChange={(e) => setShowStale(e.target.checked)} className="rounded border-zinc-200 dark:border-zinc-800 text-amber-600 focus:ring-amber-500" />
            Show Stale ({staleCount})
          </label>
          <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
            <input type="checkbox" checked={includeNotion} onChange={(e) => setIncludeNotion(e.target.checked)} className="rounded border-zinc-200 dark:border-zinc-800 text-teal-600 focus:ring-teal-500" />
            Include Notion
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Alerts section — things that need attention */}
        {(teamStats.overdueHighPriority.length > 0 || teamStats.highPriorityNoDate.length > 0) && (
          <div className="p-4 pb-2 space-y-2">
            <AlertCard title="Overdue + High Priority" count={teamStats.overdueHighPriority.length} color="#EF4444" icon={AlertTriangle}>
              {teamStats.overdueHighPriority
                .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99) || new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
                .map(t => <TaskRow key={t.id} task={t} onSelect={onSelectTask} contextLabel={contextLabels?.get(t.project_id)} />)
              }
            </AlertCard>

            <AlertCard title="High Priority — No Due Date" count={teamStats.highPriorityNoDate.length} color="#F59E0B" icon={Clock} defaultOpen={false}>
              {teamStats.highPriorityNoDate
                .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
                .map(t => <TaskRow key={t.id} task={t} onSelect={onSelectTask} contextLabel={contextLabels?.get(t.project_id)} />)
              }
            </AlertCard>
          </div>
        )}

        {/* Per-person bandwidth */}
        <div className="p-4 pt-2">
          {/* Column headers */}
          <div className="flex items-center gap-3 px-3 py-1.5 text-[10px] text-zinc-400 uppercase tracking-wide">
            <span className="w-3" /> {/* chevron space */}
            <span className="w-7" /> {/* avatar space */}
            <span className="w-28">Person</span>
            <span className="w-16">Load</span>
            <span className="flex-1">Workload</span>
            <span className="w-24 text-center">Alerts</span>
            <span className="w-10 text-right">Done/wk</span>
          </div>

          {personStats.map(stats => (
            <PersonRow
              key={stats.user?.id || "unassigned"}
              stats={stats}
              onSelectTask={onSelectTask}
              contextLabels={contextLabels}
            />
          ))}

          {personStats.length === 0 && (
            <div className="text-center py-12 text-sm text-zinc-400">No tasks found</div>
          )}
        </div>
      </div>
    </div>
  );
}
