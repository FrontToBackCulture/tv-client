// src/modules/work/WorkTaskDashboard.tsx
// My Tasks and Team Tasks dashboard views

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, Clock, Calendar, CheckCircle2, X, ArrowRight, Layers, Briefcase, Inbox, Archive, Send, Bookmark, Star, Save, RotateCcw, ChevronsLeftRight, Maximize2, PanelLeftOpen, PanelLeftClose } from "lucide-react";
import { AgGridReact } from "ag-grid-react";
import {
  ColDef,
  ColumnState,
  ModuleRegistry,
  AllCommunityModule,
  GetRowIdParams,
} from "ag-grid-community";
import { AllEnterpriseModule, LicenseManager } from "ag-grid-enterprise";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import { useAppStore } from "../../stores/appStore";
import { themeStyles } from "../domains/reviewGridStyles";
import { cn } from "../../lib/cn";
import { CollapsibleSection as SidebarSection } from "../../components/ui/CollapsibleSection";
import { invoke } from "@tauri-apps/api/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { TaskWithRelations, User, Initiative } from "../../lib/work/types";
import { getTaskIdentifier } from "../../lib/work/types";
import { isOverdue } from "../../lib/date";
import { StatusIcon, PriorityBars } from "./StatusIcon";
import { TaskRow, initials } from "./workViewsShared";
import type { InitiativeProjectLink } from "./workViewsShared";
import { toast } from "../../stores/toastStore";
import { useJobsStore } from "../../stores/jobsStore";
import { formatError } from "../../lib/formatError";
import { useTeams } from "../../hooks/work/useTeams";
import {
  useGridLayouts,
  useSaveGridLayout,
  useDeleteGridLayout,
  useSetDefaultGridLayout,
  type GridLayout,
} from "../../hooks/useGridLayouts";

// Register AG Grid (idempotent across files)
ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule]);

if (typeof window !== "undefined" && import.meta.env.VITE_AG_GRID_LICENSE_KEY) {
  LicenseManager.setLicenseKey(import.meta.env.VITE_AG_GRID_LICENSE_KEY);
}

const ACTION_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  do_now: { label: "Now", bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400" },
  do_this_week: { label: "This Week", bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400" },
  defer: { label: "Defer", bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-600 dark:text-blue-400" },
  delegate: { label: "Delegate", bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-500 dark:text-zinc-400" },
  kill: { label: "Kill", bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-400 dark:text-zinc-500" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function isToday(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  return new Date(dateStr).toDateString() === new Date().toDateString();
}

function suggestDeferDate(): string {
  const d = new Date();
  // Next Monday
  const daysToMon = (8 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + daysToMon);
  return d.toISOString().slice(0, 10);
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function classifyTask(t: TaskWithRelations): "overdue" | "today" | "upcoming" | "no_date" | "done" {
  if (t.status?.type === "complete") return "done";
  if (!t.due_date) return "no_date";
  if (isToday(t.due_date)) return "today";
  if (isOverdue(t.due_date)) return "overdue";
  return "upcoming";
}

// ─── Bucketing helper ─────────────────────────────────────────────────────

function bucketTasks(tasks: TaskWithRelations[]) {
  const b = { overdue: [] as TaskWithRelations[], today: [] as TaskWithRelations[], upcoming: [] as TaskWithRelations[], no_date: [] as TaskWithRelations[], done: [] as TaskWithRelations[] };
  for (const t of tasks) {
    b[classifyTask(t)].push(t);
  }
  b.overdue.sort((a, c) => new Date(a.due_date!).getTime() - new Date(c.due_date!).getTime());
  b.upcoming.sort((a, c) => new Date(a.due_date!).getTime() - new Date(c.due_date!).getTime());
  return b;
}

function isSalesTask(t: TaskWithRelations): boolean {
  return (t as any).project?.project_type === "deal";
}

// ─── CollapsibleSection ───────────────────────────────────────────────────

function CollapsibleSection({ label, count, icon: Icon, color, defaultOpen = true, badge, actions, children }: {
  label: string;
  count?: number;
  icon?: typeof AlertTriangle;
  color?: string;
  defaultOpen?: boolean;
  badge?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors rounded-lg"
      >
        {open ? <ChevronDown size={12} className="text-zinc-400" /> : <ChevronRight size={12} className="text-zinc-400" />}
        {Icon && <Icon size={13} style={{ color }} />}
        <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{label}</span>
        {count != null && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${color || "#6B7280"}15`, color: color || "#6B7280" }}>{count}</span>
        )}
        {badge && <span className="text-[10px] text-zinc-400 font-normal">{badge}</span>}
        {actions && <span className="ml-auto" onClick={e => e.stopPropagation()}>{actions}</span>}
      </button>
      {open && children}
    </div>
  );
}

// ─── DoTodayRow — task row with inline defer controls ─────────────────────

// Temporarily exported to suppress TS6133 — unused but kept for future use
export function _DoTodayRow({ task, onSelect, contextLabel, onDeferred, onReject }: {
  task: TaskWithRelations;
  onSelect: (id: string) => void;
  contextLabel?: string;
  onDeferred: () => void;
  onReject?: () => void;
}) {
  const [deferring, setDeferring] = useState(false);
  const deferDate = suggestDeferDate();
  const taskIsOverdue = isOverdue(task.due_date || "");
  const triageStyle = task.triage_action ? ACTION_STYLES[task.triage_action] : null;
  const reason = task.triage_reason;

  const handleDefer = async () => {
    setDeferring(true);
    try {
      const { error } = await supabase.from("tasks").update({ due_date: deferDate }).eq("id", task.id);
      if (error) throw error;
      toast.success(`Deferred to ${formatShortDate(deferDate)}`);
      onDeferred();
    } catch (err) {
      toast.error(`Failed to defer: ${err}`);
    } finally {
      setDeferring(false);
    }
  };

  return (
    <div className="group border-b border-amber-100 dark:border-amber-900/20 last:border-b-0 hover:bg-amber-50/30 dark:hover:bg-amber-900/10 transition-colors">
      {/* Main row — click anywhere to open task */}
      <button onClick={() => onSelect(task.id)} className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors rounded">
        {task.status && (
          <StatusIcon type={task.status.type as import("../../lib/work/types").StatusType} color={task.status.color || "#6B7280"} size={14} />
        )}
        <PriorityBars priority={task.priority || 0} size={11} />
        <span
          className="text-xs text-zinc-400 tabular-nums flex-shrink-0 whitespace-nowrap cursor-pointer hover:text-teal-500 dark:hover:text-teal-400 transition-colors"
          title={`Click to copy: ${task.id}`}
          onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(task.id); toast.success("Task ID copied"); }}
        >{getTaskIdentifier(task)}</span>
        {contextLabel && (
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 flex-shrink-0 max-w-[200px] truncate font-medium" title={contextLabel}>
            {contextLabel}
          </span>
        )}
        <span className="text-xs text-zinc-800 dark:text-zinc-200 flex-1 truncate">
          {task.title}
        </span>
        {triageStyle && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${triageStyle.bg} ${triageStyle.text}`}>
            {triageStyle.label} {task.triage_score}
          </span>
        )}
        {task.company && (
          <span className="text-[10px] text-zinc-400 flex-shrink-0 max-w-[100px] truncate">{task.company.display_name || task.company.name}</span>
        )}
        {task.due_date && (
          <span className={`text-xs flex-shrink-0 ${taskIsOverdue ? "text-red-500" : "text-zinc-400"}`}>
            {formatShortDate(task.due_date)}
          </span>
        )}
      </button>
      {/* Reason + Defer/keep */}
      <div className="flex items-center gap-2 px-3 pb-1 text-[10px]">
        {reason && <span className="text-zinc-500 dark:text-zinc-400 flex-1 truncate">{reason}</span>}
        {!reason && <span className="flex-1" />}
        <button
          onClick={handleDefer}
          disabled={deferring}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20 font-medium transition-colors flex-shrink-0"
        >
          <ArrowRight size={10} />
          {deferring ? "..." : `Defer to ${formatShortDate(deferDate)}`}
        </button>
        {onReject && (
          <button onClick={onReject} className="px-2 py-0.5 rounded text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 font-medium transition-colors flex-shrink-0">
            Keep
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────

function TaskDashboardSkeleton() {
  return (
    <div className="h-full flex flex-col animate-pulse">
      {/* Stats skeleton */}
      <div className="flex-shrink-0 flex items-center gap-6 px-4 py-4 border-b border-zinc-100 dark:border-zinc-800">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-10 h-8 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="space-y-1">
              <div className="w-8 h-2 rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="w-12 h-2 rounded bg-zinc-100 dark:bg-zinc-800/50" />
            </div>
          </div>
        ))}
      </div>
      {/* Today skeleton */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-4 h-4 rounded bg-emerald-200 dark:bg-emerald-900/30" />
          <div className="w-16 h-3 rounded bg-emerald-200 dark:bg-emerald-900/30" />
          <div className="w-24 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800" />
        </div>
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-3 py-2">
            <div className="w-4 h-3 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="w-3 h-3 rounded-full bg-zinc-200 dark:bg-zinc-800" />
            <div className="w-16 h-3 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="w-40 h-3 rounded bg-zinc-100 dark:bg-zinc-800/50" />
            <div className="flex-1 h-3 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="w-16 h-3 rounded bg-zinc-100 dark:bg-zinc-800/50" />
          </div>
        ))}
      </div>
      {/* Sections skeleton */}
      <div className="flex-1 p-4 space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-2 px-3 py-2">
            <div className="w-3 h-3 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="w-24 h-3 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="w-6 h-4 rounded-full bg-zinc-100 dark:bg-zinc-800/50" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MyTasksView ──────────────────────────────────────────────────────────

export function MyTasksView({ allTasks, users: _users, currentUserId, onSelectTask, initiatives, initiativeLinks }: {
  allTasks: TaskWithRelations[];
  users: User[];
  currentUserId: string | null;
  onSelectTask: (id: string) => void;
  initiatives?: Initiative[];
  initiativeLinks?: InitiativeProjectLink[];
}) {
  const [includeNotion, setIncludeNotion] = useState(true);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [showChangesPanel, setShowChangesPanel] = useState(false);
  const queryClient = useQueryClient();

  const STALE_DAYS = 60;
  const staleThreshold = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;

  // Recent changes across all my tasks (last 50 updates)
  const myTaskIds = useMemo(() => allTasks.filter(t => (t.assignees || []).some(a => a.user?.id === currentUserId)).map(t => t.id), [allTasks, currentUserId]);
  const { data: recentChanges = [] } = useQuery({
    queryKey: ["task_changes_recent", currentUserId, myTaskIds.length],
    queryFn: async () => {
      if (myTaskIds.length === 0) return [];
      const { data, error } = await supabase
        .from("task_changes")
        .select("*")
        .in("task_id", myTaskIds.slice(0, 200))
        .order("changed_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    enabled: myTaskIds.length > 0,
    staleTime: 30_000,
  });

  const allMyTasks = useMemo(() => {
    if (!currentUserId) return [];
    return allTasks
      .filter(t => (t.assignees || []).some(a => a.user?.id === currentUserId))
      .filter(t => includeNotion || !(t as any).notion_page_id);
  }, [allTasks, currentUserId, includeNotion]);

  // Separate: archived, stale, active
  const archivedTasks = useMemo(() =>
    allMyTasks.filter(t => (t as any).archived_at),
  [allMyTasks]);

  const isStale = useCallback((t: TaskWithRelations) => {
    if (t.status?.type === "complete") return false;
    if (t.due_date) return new Date(t.due_date).getTime() < staleThreshold;
    const lastUpdate = t.updated_at ? new Date(t.updated_at).getTime() : 0;
    return lastUpdate < staleThreshold;
  }, [staleThreshold]);

  const staleTasks = useMemo(() =>
    allMyTasks.filter(t => !(t as any).archived_at && isStale(t)),
  [allMyTasks, isStale]);

  const myTasks = useMemo(() =>
    allMyTasks.filter(t => !(t as any).archived_at && !isStale(t)),
  [allMyTasks, isStale]);

  // Filter proposals for Focus panel



  // Build project_id → "Initiative > Project" lookup
  const contextLabels = useMemo(() => {
    const map = new Map<string, string>();
    if (!initiatives?.length || !initiativeLinks?.length) {
      for (const t of myTasks) {
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
    for (const t of myTasks) {
      if (!map.has(t.project_id) && t.project?.name) {
        const initName = projToInit.get(t.project_id);
        map.set(t.project_id, initName ? `${initName} › ${t.project.name}` : t.project.name);
      }
    }
    return map;
  }, [myTasks, initiatives, initiativeLinks]);


  // TODAY task sequence — direct ID lookup, no fuzzy matching (currently unused)
  // const todayTaskSequence = useMemo(() => {
  //   if (!priorities?.task_ids?.length) return [];
  //   const taskMap = new Map(myTasks.map(t => [t.id, t]));
  //   return priorities.task_ids
  //     .map((id, i) => ({
  //       task: taskMap.get(id) || null,
  //       reason: priorities.reasons?.[i] || null,
  //     }))
  //     .filter(item => item.task && item.task.status?.type !== "complete");
  // }, [priorities?.task_ids, priorities?.reasons, myTasks]);

  // Suggested Defer — overdue + due today tasks, sorted by score
  const [rejectedDeferIds, _setRejectedDeferIds] = useState<Set<string>>(new Set());
  const suggestedDeferTasks = useMemo(() => {
    return myTasks
      .filter(t => t.status?.type !== "complete")
      .filter(t => isOverdue(t.due_date || "") || isToday(t.due_date))
      .filter(t => !rejectedDeferIds.has(t.id))
      .sort((a, b) => {
        const scoreDiff = (b.triage_score ?? 0) - (a.triage_score ?? 0);
        if (scoreDiff !== 0) return scoreDiff;
        return (a.due_date || "").localeCompare(b.due_date || "");
      });
  }, [myTasks, rejectedDeferIds]);

  // No Due Date — active tasks with no due date
  const noDueDateTasks = useMemo(() => {
    return myTasks.filter(t =>
      t.status?.type !== "complete" && !t.due_date
    );
  }, [myTasks]);

  const allBuckets = useMemo(() => bucketTasks(myTasks), [myTasks]);
  const recentlyCompleted = allBuckets.done.filter(t => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return t.updated_at && new Date(t.updated_at).getTime() > weekAgo;
  });

  // Motivation stats
  const completedToday = useMemo(() =>
    myTasks.filter(t => t.status?.type === "complete" && t.updated_at && isToday(t.updated_at)).length,
  [myTasks]);
  // const todayTotal = todayTaskSequence.length;
  // const todayDone = todayTaskSequence.filter(item => item.task?.status?.type === "complete").length;
  // const todayProgress = todayTotal > 0 ? Math.round((todayDone / todayTotal) * 100) : 0;
  const allClear = allBuckets.overdue.length === 0 && suggestedDeferTasks.length === 0;
  const activeCount = myTasks.filter(t => t.status?.type !== "complete").length;

  if (!currentUserId) {
    return <div className="flex items-center justify-center h-full text-sm text-zinc-400">No user profile found</div>;
  }

  if (allTasks.length === 0) {
    return <TaskDashboardSkeleton />;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Stats */}
      <div className="flex-shrink-0 flex items-center gap-4 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{completedToday}</span>
          <span className="text-[10px] text-zinc-400 leading-tight">done<br/>today</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-2xl font-bold ${allBuckets.overdue.length > 0 ? "text-red-500" : "text-emerald-500"}`}>{allBuckets.overdue.length}</span>
          <span className="text-[10px] text-zinc-400 leading-tight">overdue<br/>{allBuckets.overdue.length === 0 ? "clear!" : "to clear"}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-blue-500">{activeCount}</span>
          <span className="text-[10px] text-zinc-400 leading-tight">active<br/>tasks</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-emerald-500">{recentlyCompleted.length}</span>
          <span className="text-[10px] text-zinc-400 leading-tight">done<br/>this week</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-2xl font-bold ${noDueDateTasks.length > 0 ? "text-amber-500" : "text-zinc-300"}`}>{noDueDateTasks.length}</span>
          <span className="text-[10px] text-zinc-400 leading-tight">no due<br/>date</span>
        </div>
        <div className="flex-1" />
        {allClear && (
          <span className="text-xs font-medium text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1 rounded-full">All clear!</span>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <MyTasksGridView
        myTasks={myTasks}
        staleTasks={staleTasks}
        archivedTasks={archivedTasks}
        recentlyCompleted={recentlyCompleted}
        contextLabels={contextLabels}
        selectedTaskIds={selectedTaskIds}
        setSelectedTaskIds={setSelectedTaskIds}
        onSelectTask={onSelectTask}
        onToggleChanges={() => setShowChangesPanel(!showChangesPanel)}
        showChanges={showChangesPanel}
        includeNotion={includeNotion}
        setIncludeNotion={setIncludeNotion}
        onBulkSyncToNotion={async () => {
          const tasksToSync = allMyTasks.filter(t => selectedTaskIds.has(t.id) && (t as any).notion_page_id);
          if (tasksToSync.length === 0) { toast.error("No selected tasks have Notion pages"); return; }
          const jobId = `notion-bulk-${Date.now()}`;
          const jobStore = useJobsStore.getState();
          jobStore.addJob({ id: jobId, name: `Notion Bulk Sync`, status: "running", message: `0/${tasksToSync.length} tasks...` });
          let synced = 0, failed = 0;
          for (const t of tasksToSync) {
            try { await invoke("notion_push_task", { taskId: t.id }); synced++; }
            catch { failed++; }
            jobStore.updateJob(jobId, { message: `${synced + failed}/${tasksToSync.length} (${synced} synced${failed ? `, ${failed} failed` : ""})` });
          }
          jobStore.updateJob(jobId, { status: failed > 0 ? "failed" : "completed", message: `${synced} synced${failed ? `, ${failed} failed` : ""} of ${tasksToSync.length}` });
          setSelectedTaskIds(new Set());
          queryClient.invalidateQueries({ queryKey: ["work"] });
        }}
      />

      </div>{/* end flex-col content */}

      {/* Recent Changes Side Panel */}
      {showChangesPanel && (
        <div className="flex-shrink-0 w-80 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-purple-500" />
              <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Recent Changes</span>
              {recentChanges.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 font-medium">{recentChanges.length}</span>
              )}
            </div>
            <button onClick={() => setShowChangesPanel(false)} className="p-1 rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
              <X size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {recentChanges.length === 0 ? (
              <div className="p-4 text-center">
                <Clock size={24} className="text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
                <p className="text-xs text-zinc-400">No changes yet</p>
                <p className="text-[10px] text-zinc-400 mt-1">Changes to due dates, status, priority, and other fields will appear here.</p>
              </div>
            ) : (
              <div className="py-2">
                {(() => {
                  const fieldLabel: Record<string, string> = { due_date: "Due Date", title: "Title", status_id: "Status", priority: "Priority", project_id: "Project", company_id: "Company", triage_action: "Triage", triage_score: "Score", archived_at: "Archived" };
                  // Group by date
                  const grouped = new Map<string, typeof recentChanges>();
                  for (const c of recentChanges) {
                    const day = new Date(c.changed_at).toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short" });
                    if (!grouped.has(day)) grouped.set(day, []);
                    grouped.get(day)!.push(c);
                  }
                  return [...grouped.entries()].map(([day, dayChanges]) => (
                    <div key={day}>
                      <div className="px-4 py-1.5 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider sticky top-0 bg-white dark:bg-zinc-950">{day}</div>
                      {(dayChanges as any[]).map((c: any) => {
                        const task = allMyTasks.find(t => t.id === c.task_id);
                        return (
                          <div
                            key={c.id}
                            className="px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 cursor-pointer border-b border-zinc-50 dark:border-zinc-800/30"
                            onClick={() => { if (task) onSelectTask(task.id); }}
                          >
                            <div className="flex items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">{task?.title || c.task_id.slice(0, 8)}</div>
                                <div className="flex items-center gap-1.5 mt-1.5">
                                  <span className="text-[10px] font-medium text-purple-500">{fieldLabel[c.field] || c.field}</span>
                                </div>
                                <div className="flex items-center gap-1.5 mt-1">
                                  {c.old_value && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/10 text-red-500 line-through truncate max-w-[100px]" title={c.old_value}>{c.old_value}</span>
                                  )}
                                  <span className="text-[10px] text-zinc-400">&rarr;</span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 truncate max-w-[100px]" title={c.new_value || "(empty)"}>{c.new_value || "(empty)"}</span>
                                </div>
                              </div>
                              <span className="text-[10px] text-zinc-400 flex-shrink-0 mt-0.5">
                                {new Date(c.changed_at).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                            {c.changed_by && <div className="text-[9px] text-zinc-400 mt-1">by {c.changed_by}</div>}
                          </div>
                        );
                      })}
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
        </div>
      )}
      </div>{/* end flex row */}
    </div>
  );
}

// ─── TeamTasksView ────────────────────────────────────────────────────────

const TEAM_STALE_DAYS = 60;

function isTeamTaskStale(t: TaskWithRelations): boolean {
  if (t.status?.type === "complete") return false;
  const threshold = Date.now() - TEAM_STALE_DAYS * 24 * 60 * 60 * 1000;
  if (t.due_date) return new Date(t.due_date).getTime() < threshold;
  const lastUpdate = t.updated_at ? new Date(t.updated_at).getTime() : 0;
  return lastUpdate < threshold;
}

// ─── Project Grouped Tasks — groups by initiative > project ─────────────

export function _ProjectGroupedTasks({ tasks, onSelectTask, contextLabels }: {
  tasks: TaskWithRelations[];
  onSelectTask: (id: string) => void;
  contextLabels: Map<string, string>;
}) {
  const grouped = useMemo(() => {
    // Group by project
    const byProject = new Map<string, { name: string; type: string; color: string; tasks: TaskWithRelations[] }>();
    for (const t of tasks) {
      const pid = t.project_id || "none";
      if (!byProject.has(pid)) {
        byProject.set(pid, {
          name: contextLabels.get(pid) || (t as any).project?.name || "No Project",
          type: (t as any).project?.project_type || "work",
          color: (t as any).project?.color || "#6B7280",
          tasks: [],
        });
      }
      byProject.get(pid)!.tasks.push(t);
    }
    // Sort: deals first, then by task count desc
    return [...byProject.entries()].sort((a, b) => {
      if (a[1].type === "deal" && b[1].type !== "deal") return -1;
      if (b[1].type === "deal" && a[1].type !== "deal") return 1;
      return b[1].tasks.length - a[1].tasks.length;
    });
  }, [tasks, contextLabels]);

  return (
    <>
      {grouped.map(([pid, { name, type, color, tasks: projectTasks }]) => {
        const overdue = projectTasks.filter(t => isOverdue(t.due_date || ""));
        return (
          <CollapsibleSection
            key={pid}
            label={name}
            count={projectTasks.length}
            color={color}
            defaultOpen={overdue.length > 0}
            badge={type === "deal" ? "Deal" : undefined}
          >
            <div className="ml-2 pl-2">
              {overdue.length > 0 && (
                <CollapsibleSection label="Overdue" count={overdue.length} icon={AlertTriangle} color="#EF4444" defaultOpen={false}>
                  <StatusGroupedTasks tasks={overdue} onSelectTask={onSelectTask} contextLabels={contextLabels} />
                </CollapsibleSection>
              )}
              {(() => {
                const upcoming = projectTasks.filter(t => t.due_date && !isOverdue(t.due_date) && !isToday(t.due_date));
                return upcoming.length > 0 ? (
                  <CollapsibleSection label="Upcoming" count={upcoming.length} icon={Calendar} color="#3B82F6" defaultOpen={false}>
                    <StatusGroupedTasks tasks={upcoming} onSelectTask={onSelectTask} contextLabels={contextLabels} />
                  </CollapsibleSection>
                ) : null;
              })()}
              {(() => {
                const noDate = projectTasks.filter(t => !t.due_date);
                return noDate.length > 0 ? (
                  <CollapsibleSection label="No Due Date" count={noDate.length} icon={Calendar} color="#9CA3AF" defaultOpen={false}>
                    <StatusGroupedTasks tasks={noDate} onSelectTask={onSelectTask} contextLabels={contextLabels} />
                  </CollapsibleSection>
                ) : null;
              })()}
            </div>
          </CollapsibleSection>
        );
      })}
    </>
  );
}


function StatusGroupedTasks({ tasks, onSelectTask, contextLabels, rowComponent, selectedTaskIds, onToggleSelect }: {
  tasks: TaskWithRelations[];
  onSelectTask: (id: string) => void;
  contextLabels: Map<string, string>;
  rowComponent?: (task: TaskWithRelations) => React.ReactNode;
  selectedTaskIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  const grouped = useMemo(() => {
    // Sort order: furthest along pipeline first (complete → late in_progress → early in_progress → todo)
    const statusOrder = [
      "Done", "Monitor", "Won't Do", "Archived",
      "Ready to Deploy", "Ready for Test", "Blocked", "Waiting", "In Review", "In Progress",
      "On Hold", "Up Next", "Backlog", "New",
    ];
    const map = new Map<string, { status: TaskWithRelations["status"]; tasks: TaskWithRelations[] }>();
    for (const t of tasks) {
      const key = t.status?.name || "No Status";
      if (!map.has(key)) map.set(key, { status: t.status, tasks: [] });
      map.get(key)!.tasks.push(t);
    }
    // Sort tasks within each group by due date (most recent first)
    for (const [, group] of map) {
      group.tasks.sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      });
    }
    return [...map.entries()].sort((a, b) => {
      const aIdx = statusOrder.indexOf(a[0]);
      const bIdx = statusOrder.indexOf(b[0]);
      return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
    });
  }, [tasks]);

  return (
    <div className="ml-2 pl-2">
      {grouped.map(([statusName, { status, tasks: statusTasks }]) => (
        <div key={statusName} className="mb-1">
          <div className="flex items-center gap-1.5 px-2 py-1">
            {status && (
              <StatusIcon type={status.type as import("../../lib/work/types").StatusType} color={status.color || "#6B7280"} size={10} />
            )}
            <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">{statusName}</span>
            <span className="text-[9px] text-zinc-400">{statusTasks.length}</span>
          </div>
          {statusTasks.map(t => rowComponent ? rowComponent(t) : (
            <div key={t.id} className="flex items-center gap-1">
              {onToggleSelect && (
                <input
                  type="checkbox"
                  checked={selectedTaskIds?.has(t.id) ?? false}
                  onChange={() => onToggleSelect(t.id)}
                  className="w-3 h-3 rounded border-zinc-200 dark:border-zinc-800 text-blue-500 focus:ring-blue-500 flex-shrink-0 cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                />
              )}
              <TaskRow task={t} onSelect={onSelectTask} contextLabel={contextLabels.get(t.project_id)} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}


export function TeamTasksView({ allTasks, users: _users, onSelectTask, initiatives, initiativeLinks }: {
  allTasks: TaskWithRelations[];
  users: User[];
  onSelectTask: (id: string) => void;
  initiatives?: Initiative[];
  initiativeLinks?: InitiativeProjectLink[];
}) {
  const { data: teams = [] } = useTeams();
  const [includeNotion, setIncludeNotion] = useState(true);
  const [showStale, setShowStale] = useState(false);
  const [selectedPersonIds, setSelectedPersonIds] = useState<Set<string>>(new Set());
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [teamDefaulted, setTeamDefaulted] = useState(false);
  // Default to Analyst team on first load
  useEffect(() => {
    if (!teamDefaulted && teams.length > 0) {
      const analyst = teams.find(t => t.slug === "analyst" || t.name.toLowerCase() === "analyst");
      if (analyst) {
        setSelectedTeamId(analyst.id);
        setSelectedPersonIds(new Set(analyst.members.map(m => m.user_id)));
      }
      setTeamDefaulted(true);
    }
  }, [teams, teamDefaulted]);
  const [sortBy, setSortBy] = useState<"tasks" | "overdue" | "name">("overdue");

  const filteredByNotion = useMemo(() =>
    allTasks.filter(t => includeNotion || !(t as any).notion_page_id),
  [allTasks, includeNotion]);

  const staleCount = useMemo(() => filteredByNotion.filter(isTeamTaskStale).length, [filteredByNotion]);

  const tasks = useMemo(() => {
    const nonStale = showStale ? filteredByNotion : filteredByNotion.filter(t => !isTeamTaskStale(t));
    return nonStale.filter(t => t.status?.type !== "complete");
  }, [filteredByNotion, showStale]);

  // Context labels
  const contextLabels = useMemo(() => {
    const map = new Map<string, string>();
    if (!initiatives?.length || !initiativeLinks?.length) {
      for (const t of allTasks) {
        if (t.project?.name && !map.has(t.project_id)) map.set(t.project_id, t.project.name);
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

  // All persons for filter pills — sorted by team order
  const allPersons = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of tasks) {
      for (const a of (t.assignees || [])) {
        if (a.user?.id && !seen.has(a.user.id)) seen.set(a.user.id, a.user.name);
      }
    }
    const teamOrder = ["analyst", "customer-success", "engineering", "sales"];
    const userTeamRank = new Map<string, number>();
    for (const team of teams) {
      const rank = teamOrder.findIndex(t => team.slug?.toLowerCase() === t || team.name.toLowerCase() === t);
      for (const m of team.members) {
        const r = rank === -1 ? 99 : rank;
        const existing = userTeamRank.get(m.user_id);
        if (existing === undefined || r < existing) userTeamRank.set(m.user_id, r);
      }
    }
    return [...seen.entries()].sort((a, b) => {
      const aRank = userTeamRank.get(a[0]) ?? 98;
      const bRank = userTeamRank.get(b[0]) ?? 98;
      if (aRank !== bRank) return aRank - bRank;
      return a[1].localeCompare(b[1]);
    });
  }, [tasks, teams]);

  // Apply person filter to tasks for stats and sections
  const filteredTasks = useMemo(() => {
    if (selectedPersonIds.size === 0) return tasks;
    return tasks.filter(t => (t.assignees || []).some(a => a.user?.id && selectedPersonIds.has(a.user.id)));
  }, [tasks, selectedPersonIds]);

  // Task filters (for People tab) — action filter lives in the sidebar; company
  // and context can be filtered from the grid's per-column floating filters.
  const [actionFilter, setActionFilter] = useState<Set<string>>(new Set());

  const applyTaskFilters = useCallback((taskList: TaskWithRelations[]) => {
    if (actionFilter.size === 0) return taskList;
    return taskList.filter(t => actionFilter.has(t.triage_action || "untriaged"));
  }, [actionFilter]);

  const totalActive = filteredTasks.length;
  const totalOverdue = filteredTasks.filter(t => isOverdue(t.due_date || "")).length;
  const totalNoDate = filteredTasks.filter(t => !t.due_date).length;
  const totalNoCompany = filteredTasks.filter(t => !t.company).length;
  const completedThisWeek = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return filteredByNotion.filter(t =>
      t.status?.type === "complete" && t.updated_at && new Date(t.updated_at).getTime() > weekAgo
    ).length;
  }, [filteredByNotion]);

  if (allTasks.length === 0) {
    return <TaskDashboardSkeleton />;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Stats */}
      <div className="flex-shrink-0 flex items-center gap-4 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <span className={`text-2xl font-bold ${totalOverdue > 0 ? "text-red-500" : "text-emerald-500"}`}>{totalOverdue}</span>
          <span className="text-[10px] text-zinc-400 leading-tight">overdue<br/>{totalOverdue === 0 ? "clear!" : "across team"}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-blue-500">{totalActive}</span>
          <span className="text-[10px] text-zinc-400 leading-tight">active<br/>tasks</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-emerald-500">{completedThisWeek}</span>
          <span className="text-[10px] text-zinc-400 leading-tight">done<br/>this week</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-2xl font-bold ${totalNoDate > 0 ? "text-amber-500" : "text-zinc-300"}`}>{totalNoDate}</span>
          <span className="text-[10px] text-zinc-400 leading-tight">no due<br/>date</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-2xl font-bold ${totalNoCompany > 0 ? "text-amber-500" : "text-zinc-300"}`}>{totalNoCompany}</span>
          <span className="text-[10px] text-zinc-400 leading-tight">no<br/>company</span>
        </div>
      </div>

      <TeamPeopleGridView
          includeNotion={includeNotion}
          setIncludeNotion={setIncludeNotion}
          showStale={showStale}
          setShowStale={setShowStale}
          staleCount={staleCount}
          tasks={applyTaskFilters(filteredTasks.filter(t => t.status?.type !== "complete"))}
          contextLabels={contextLabels}
          onSelectTask={onSelectTask}
          teams={teams}
          selectedTeamId={selectedTeamId}
          onSelectTeam={(teamId) => {
            if (!teamId) {
              setSelectedTeamId(null);
              setSelectedPersonIds(new Set());
            } else {
              const team = teams.find(t => t.id === teamId);
              setSelectedTeamId(teamId);
              setSelectedPersonIds(new Set(team?.members.map(m => m.user_id) ?? []));
            }
          }}
          allPersons={allPersons}
          selectedPersonIds={selectedPersonIds}
          onTogglePerson={(id) => {
            const next = new Set(selectedPersonIds);
            if (next.has(id)) next.delete(id); else next.add(id);
            setSelectedPersonIds(next);
            setSelectedTeamId(null);
          }}
          onClearPersons={() => { setSelectedPersonIds(new Set()); setSelectedTeamId(null); }}
          actionFilter={actionFilter}
          onToggleAction={(action) => {
            setActionFilter(prev => {
              const next = new Set(prev);
              if (next.has(action)) next.delete(action); else next.add(action);
              return next;
            });
          }}
          sortBy={sortBy}
          onSortByChange={setSortBy}
        />
    </div>
  );
}

// ─── My Tasks AG Grid View ─────────────────────────────────────────────────

type MyTasksGridFilter = "all" | "today" | "this_week" | "no_due" | "sales" | "work" | "stale" | "completed_week" | "archived";

interface MyTasksGridRow {
  id: string;
  identifier: string;
  title: string;
  statusName: string;
  statusType: string;
  statusColor: string | null;
  priority: number;
  dueDate: string | null;
  dueTs: number;
  context: string;
  projectName: string;
  projectColor: string | null;
  isSales: boolean;
  isStale: boolean;
  isArchived: boolean;
  archivedAt: string | null;
  updatedAt: string | null;
  notion: boolean;
  triageScore: number | null;
}

const MY_TASKS_VIEWS: { id: MyTasksGridFilter; label: string; icon: typeof Layers; color?: string }[] = [
  { id: "all",             label: "All active",     icon: Layers },
  { id: "today",           label: "Today",          icon: AlertTriangle, color: "#EF4444" },
  { id: "this_week",       label: "This week",      icon: Calendar,      color: "#3B82F6" },
  { id: "no_due",          label: "No due date",    icon: Calendar,      color: "#F59E0B" },
  { id: "sales",           label: "Sales",          icon: Briefcase,     color: "#3B82F6" },
  { id: "work",            label: "Work",           icon: Inbox,         color: "#0D9488" },
  { id: "stale",           label: "Stale",          icon: Clock,         color: "#F59E0B" },
  { id: "completed_week",  label: "Done this week", icon: CheckCircle2,  color: "#10B981" },
  { id: "archived",        label: "Archived",       icon: Archive,       color: "#6B7280" },
];

// ─── Team People AG Grid View ───────────────────────────────────────────────
// Row-grouped by assignee; each task can appear under multiple people if
// multi-assigned. `grid_key = "team-tasks"` — shared layouts per workspace.

interface TeamGridRow {
  rowId: string;          // composite id for multi-assignee dedupe
  taskId: string;
  assignee: string;
  identifier: string;
  title: string;
  statusName: string;
  statusType: string;
  statusColor: string | null;
  priority: number;
  triageAction: string;
  dueDate: string | null;
  dueTs: number;
  context: string;
  company: string;
  triageScore: number | null;
  notion: boolean;
  isOverdue: boolean;
}

function TeamPeopleGridView({
  tasks,
  contextLabels,
  onSelectTask,
  teams,
  selectedTeamId,
  onSelectTeam,
  allPersons,
  selectedPersonIds,
  onTogglePerson,
  onClearPersons,
  actionFilter,
  onToggleAction,
  sortBy,
  onSortByChange,
  includeNotion,
  setIncludeNotion,
  showStale,
  setShowStale,
  staleCount,
}: {
  tasks: TaskWithRelations[];
  contextLabels: Map<string, string>;
  onSelectTask: (id: string) => void;
  teams: { id: string; name: string; slug?: string; color?: string; members: { user_id: string }[] }[];
  selectedTeamId: string | null;
  onSelectTeam: (teamId: string | null) => void;
  allPersons: [string, string][];
  selectedPersonIds: Set<string>;
  onTogglePerson: (id: string) => void;
  onClearPersons: () => void;
  actionFilter: Set<string>;
  onToggleAction: (action: string) => void;
  sortBy: "overdue" | "tasks" | "name";
  onSortByChange: (s: "overdue" | "tasks" | "name") => void;
  includeNotion?: boolean;
  setIncludeNotion?: (v: boolean) => void;
  showStale?: boolean;
  setShowStale?: (v: boolean) => void;
  staleCount?: number;
}) {
  const theme = useAppStore((s) => s.theme);
  const [quickFilter, setQuickFilter] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const gridRef = useRef<AgGridReact<TeamGridRow>>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) setIsFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  // Fan out multi-assignee tasks → one row per (task, person) pair
  const rowData = useMemo<TeamGridRow[]>(() => {
    const rows: TeamGridRow[] = [];
    for (const t of tasks) {
      const assignees = t.assignees?.length ? t.assignees : [{ user: null as any }];
      for (const a of assignees) {
        const assignee = a.user?.name || "Unassigned";
        rows.push({
          rowId: `${t.id}:${a.user?.id || "none"}`,
          taskId: t.id,
          assignee,
          identifier: getTaskIdentifier(t as any),
          title: t.title || "(untitled)",
          statusName: t.status?.name || "—",
          statusType: t.status?.type || "todo",
          statusColor: t.status?.color || null,
          priority: t.priority ?? 0,
          triageAction: (t as any).triage_action || "untriaged",
          dueDate: t.due_date || null,
          dueTs: t.due_date ? new Date(t.due_date).getTime() : 0,
          context: contextLabels.get(t.project_id) || t.project?.name || "—",
          company: (t.company as any)?.display_name || t.company?.name || "",
          triageScore: (t as any).triage_score ?? null,
          notion: !!(t as any).notion_page_id,
          isOverdue: !!t.due_date && isOverdue(t.due_date),
        });
      }
    }
    return rows;
  }, [tasks, contextLabels]);

  const columnDefs = useMemo<ColDef<TeamGridRow>[]>(() => [
    {
      field: "assignee",
      headerName: "Assignee",
      rowGroup: true,
      hide: true,
      enableRowGroup: true,
      filter: "agSetColumnFilter",
    },
    {
      field: "identifier",
      headerName: "ID",
      width: 95,
      filter: "agTextColumnFilter",
      cellClass: "text-[11px] font-mono text-zinc-400",
    },
    {
      field: "statusName",
      headerName: "Status",
      width: 130,
      filter: "agSetColumnFilter",
      cellRenderer: (p: { value: string; data?: TeamGridRow }) => (
        <span className="flex items-center gap-1.5">
          <StatusIcon type={(p.data?.statusType ?? "todo") as any} color={p.data?.statusColor ?? "#6B7280"} size={11} />
          <span className="text-xs text-zinc-700 dark:text-zinc-300">{p.value}</span>
        </span>
      ),
    },
    {
      field: "priority",
      headerName: "P",
      width: 60,
      filter: "agNumberColumnFilter",
      cellRenderer: (p: { value: number }) => <PriorityBars priority={p.value as any} size={10} />,
    },
    {
      field: "title",
      headerName: "Title",
      flex: 2,
      minWidth: 280,
      filter: "agTextColumnFilter",
      cellClass: "text-sm text-zinc-900 dark:text-zinc-100",
    },
    {
      field: "context",
      headerName: "Project",
      flex: 1.4,
      minWidth: 220,
      filter: "agTextColumnFilter",
      cellClass: "text-xs text-zinc-500 dark:text-zinc-400",
    },
    {
      field: "triageAction",
      headerName: "Action",
      width: 110,
      filter: "agSetColumnFilter",
      valueFormatter: (p: { value: string }) =>
        p.value === "do_now" ? "Now"
        : p.value === "do_this_week" ? "This Week"
        : p.value === "defer" ? "Defer"
        : p.value === "delegate" ? "Delegate"
        : p.value === "kill" ? "Kill"
        : "Untriaged",
    },
    {
      field: "dueTs",
      headerName: "Due",
      width: 110,
      sort: "asc",
      sortIndex: 0,
      filter: "agNumberColumnFilter",
      valueFormatter: (p: { data?: TeamGridRow }) => p.data?.dueDate ? formatShortDate(p.data.dueDate) : "—",
      cellClass: (p: { data?: TeamGridRow }) => {
        if (!p.data?.dueDate) return "text-xs text-zinc-400";
        if (p.data.isOverdue) return "text-xs text-red-500 font-medium";
        if (isToday(p.data.dueDate)) return "text-xs text-amber-500 font-medium";
        return "text-xs text-zinc-500 dark:text-zinc-400";
      },
    },
    {
      field: "company",
      headerName: "Company",
      width: 160,
      filter: "agSetColumnFilter",
      cellClass: "text-xs text-zinc-500 dark:text-zinc-400",
    },
    {
      field: "triageScore",
      headerName: "Score",
      width: 80,
      filter: "agNumberColumnFilter",
      valueFormatter: (p: { value: number | null }) => p.value != null ? String(p.value) : "—",
      cellClass: "text-xs text-zinc-500 dark:text-zinc-400",
    },
    {
      field: "notion",
      headerName: "Notion",
      width: 80,
      filter: "agSetColumnFilter",
      cellRenderer: (p: { value: boolean }) =>
        p.value ? <span className="text-[10px] text-zinc-400">✓</span> : null,
    },
  ], []);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    filter: true,
    floatingFilter: true,
    tooltipShowDelay: 500,
  }), []);

  const autoGroupColumnDef = useMemo<ColDef<TeamGridRow>>(() => ({
    headerName: "Assignee",
    minWidth: 240,
    pinned: "left",
    cellRendererParams: { suppressCount: false },
  }), []);

  const getRowId = useCallback((params: GetRowIdParams<TeamGridRow>) => params.data.rowId, []);

  // ─── Shared layouts (grid_key = "team-tasks") ──────────────────────────────
  const GRID_KEY = "team-tasks";
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newLayoutName, setNewLayoutName] = useState("");
  const [activeLayoutName, setActiveLayoutName] = useState<string | null>(null);
  const [layoutModified, setLayoutModified] = useState(false);
  const [activeFilterCount, setActiveFilterCount] = useState(0);
  const { data: layouts = [], isFetched: layoutsFetched } = useGridLayouts(GRID_KEY);
  const saveLayoutMutation = useSaveGridLayout(GRID_KEY);
  const deleteLayoutMutation = useDeleteGridLayout(GRID_KEY);
  const setDefaultMutation = useSetDefaultGridLayout(GRID_KEY);
  const layoutsByName = useMemo(() => {
    const m: Record<string, GridLayout> = {};
    for (const l of layouts) m[l.name] = l;
    return m;
  }, [layouts]);
  const defaultLayout = useMemo(() => layouts.find((l) => l.is_default) ?? null, [layouts]);

  const saveCurrentLayout = useCallback(async (name: string) => {
    const api = gridRef.current?.api;
    const trimmed = name.trim();
    if (!api || !trimmed) return;
    try {
      await saveLayoutMutation.mutateAsync({
        name: trimmed,
        payload: {
          column_state: api.getColumnState() as unknown[],
          filter_model: (api.getFilterModel() ?? {}) as Record<string, unknown>,
          row_group_columns: api.getRowGroupColumns().map((col) => col.getColId()),
        },
      });
      setActiveLayoutName(trimmed);
      setLayoutModified(false);
      setShowSaveDialog(false);
      setNewLayoutName("");
      toast.success(`Layout "${trimmed}" saved`);
    } catch (err) {
      toast.error(formatError(err));
    }
  }, [saveLayoutMutation]);

  const loadLayout = useCallback((name: string) => {
    const api = gridRef.current?.api;
    if (!api) return;
    const layout = layoutsByName[name];
    if (!layout) return;
    api.setRowGroupColumns([]);
    api.applyColumnState({ state: layout.column_state as ColumnState[], applyOrder: true });
    if (layout.row_group_columns?.length) api.setRowGroupColumns(layout.row_group_columns);
    if (layout.filter_model && Object.keys(layout.filter_model).length) {
      api.setFilterModel(layout.filter_model);
    } else {
      api.setFilterModel(null);
    }
    setActiveLayoutName(name);
    setLayoutModified(false);
    setShowLayoutMenu(false);
    toast.info(`Layout "${name}" applied`);
  }, [layoutsByName]);

  const deleteLayout = useCallback(async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const layout = layoutsByName[name];
    if (!layout) return;
    try {
      await deleteLayoutMutation.mutateAsync(layout.id);
      if (activeLayoutName === name) { setActiveLayoutName(null); setLayoutModified(false); }
      toast.info(`Layout "${name}" deleted`);
    } catch (err) {
      toast.error(formatError(err));
    }
  }, [layoutsByName, deleteLayoutMutation, activeLayoutName]);

  const toggleDefaultLayout = useCallback(async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const layout = layoutsByName[name];
    if (!layout) return;
    try {
      await setDefaultMutation.mutateAsync({ id: layout.id, makeDefault: !layout.is_default });
      toast.info(layout.is_default ? `"${name}" removed as default` : `"${name}" set as default layout`);
    } catch (err) {
      toast.error(formatError(err));
    }
  }, [layoutsByName, setDefaultMutation]);

  const resetLayout = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.setFilterModel(null);
    api.resetColumnState();
    api.setRowGroupColumns(["assignee"]);
    setQuickFilter("");
    setActiveLayoutName(null);
    setLayoutModified(false);
    toast.info("Layout reset");
  }, []);

  const autoSizeAllColumns = useCallback(() => {
    gridRef.current?.api.autoSizeAllColumns();
  }, []);

  const hasAppliedDefault = useRef(false);
  const isFirstDataRendered = useRef(false);

  const applyDefaultIfReady = useCallback(() => {
    if (hasAppliedDefault.current) return;
    if (!isFirstDataRendered.current) return;
    if (!layoutsFetched) return;
    const api = gridRef.current?.api;
    if (!api) return;

    if (defaultLayout) {
      api.applyColumnState({ state: defaultLayout.column_state as ColumnState[], applyOrder: true });
      if (defaultLayout.row_group_columns?.length) api.setRowGroupColumns(defaultLayout.row_group_columns);
      if (defaultLayout.filter_model && Object.keys(defaultLayout.filter_model).length) {
        api.setFilterModel(defaultLayout.filter_model);
      }
      setActiveLayoutName(defaultLayout.name);
      setLayoutModified(false);
    } else {
      api.autoSizeAllColumns(false);
    }
    hasAppliedDefault.current = true;
  }, [defaultLayout, layoutsFetched]);

  const handleFirstDataRendered = useCallback(() => {
    isFirstDataRendered.current = true;
    applyDefaultIfReady();
  }, [applyDefaultIfReady]);

  useEffect(() => { applyDefaultIfReady(); }, [applyDefaultIfReady]);

  const handleFilterChanged = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    const model = api.getFilterModel() ?? {};
    setActiveFilterCount(Object.keys(model).length);
    if (hasAppliedDefault.current && activeLayoutName) setLayoutModified(true);
  }, [activeLayoutName]);

  const handleLayoutDirty = useCallback(() => {
    if (hasAppliedDefault.current && activeLayoutName) setLayoutModified(true);
  }, [activeLayoutName]);

  const clearAllFilters = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.setFilterModel(null);
    setQuickFilter("");
  }, []);

  const themeClass = theme === "dark" ? "ag-theme-alpine-dark" : "ag-theme-alpine";

  const ACTIONS: { id: string; label: string; icon: typeof Layers; color?: string }[] = [
    { id: "do_now",        label: "Now",        icon: AlertTriangle, color: "#EF4444" },
    { id: "do_this_week",  label: "This Week",  icon: Calendar,      color: "#3B82F6" },
    { id: "defer",         label: "Defer",      icon: Clock,         color: "#F59E0B" },
    { id: "untriaged",     label: "Untriaged",  icon: Inbox,         color: "#6B7280" },
  ];

  return (
    <div className={isFullscreen
      ? "fixed inset-0 z-50 bg-zinc-50 dark:bg-zinc-950 p-4 flex overflow-hidden"
      : "flex-1 min-h-0 flex overflow-hidden px-4 py-4"
    }>
      <div className="flex-1 min-h-0 flex overflow-hidden border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-950">
        {/* Sidebar: View presets, Teams, People, Sort */}
        {sidebarOpen && (
        <aside className="w-60 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 flex flex-col overflow-hidden rounded-l-md">
          <div className="flex-1 overflow-y-auto">
            <div className="px-3 py-3">
              <SidebarSection title="View" storageKey="work-tasks:view">
                <button
                  onClick={() => { actionFilter.forEach(a => onToggleAction(a)); }}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[13px]",
                    actionFilter.size === 0
                      ? "bg-teal-100 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
                  )}
                >
                  <span className="flex items-center gap-2"><Layers size={13} /> All</span>
                </button>
                {ACTIONS.map((a) => {
                  const Icon = a.icon;
                  const active = actionFilter.has(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => onToggleAction(a.id)}
                      className={cn(
                        "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[13px]",
                        active
                          ? "bg-teal-100 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300"
                          : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <Icon size={13} style={a.color ? { color: a.color } : undefined} />
                        {a.label}
                      </span>
                    </button>
                  );
                })}
              </SidebarSection>
            </div>

            {teams.length > 0 && (
              <div className="px-3 py-2 border-t border-zinc-200 dark:border-zinc-800">
                <SidebarSection title="Teams" storageKey="work-tasks:teams">
                  <button
                    onClick={() => onSelectTeam(null)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 rounded text-[13px]",
                      !selectedTeamId
                        ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
                        : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400",
                    )}
                  >
                    All teams
                  </button>
                  {teams.map((team) => (
                    <button
                      key={team.id}
                      onClick={() => onSelectTeam(selectedTeamId === team.id ? null : team.id)}
                      className={cn(
                        "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[13px]",
                        selectedTeamId === team.id
                          ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                          : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        {team.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />}
                        {team.name}
                      </span>
                      <span className="text-[11px] text-zinc-400">{team.members.length}</span>
                    </button>
                  ))}
                </SidebarSection>
              </div>
            )}

            <div className="px-3 py-2 border-t border-zinc-200 dark:border-zinc-800">
              <SidebarSection
                title="People"
                storageKey="work-tasks:people"
                rightSlot={selectedPersonIds.size > 0 && (
                  <button onClick={onClearPersons} className="text-[10px] text-zinc-400 hover:text-zinc-200">Clear</button>
                )}
              >
                {allPersons.map(([id, name]) => {
                  const active = selectedPersonIds.has(id);
                  return (
                    <button
                      key={id}
                      onClick={() => onTogglePerson(id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-1.5 rounded text-[13px]",
                        active
                          ? "bg-teal-100 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300"
                          : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
                      )}
                    >
                      <span className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[9px] font-bold text-zinc-600 dark:text-zinc-400 flex-shrink-0">
                        {initials(name)}
                      </span>
                      <span className="truncate">{name}</span>
                    </button>
                  );
                })}
              </SidebarSection>
            </div>

            <div className="px-3 py-2 border-t border-zinc-200 dark:border-zinc-800">
              <SidebarSection title="Sort" storageKey="work-tasks:sort">
                <div className="flex items-center gap-1">
                  {(["overdue", "tasks", "name"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => onSortByChange(s)}
                      className={cn(
                        "text-[11px] px-1.5 py-0.5 rounded font-medium transition-colors",
                        sortBy === s ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-800" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800",
                      )}
                    >
                      {s === "overdue" ? "Overdue" : s === "tasks" ? "Tasks" : "Name"}
                    </button>
                  ))}
                </div>
              </SidebarSection>
            </div>
          </div>
        </aside>
        )}

        {/* Main: toolbar + grid */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={cn(
            "flex items-center justify-center p-1.5 rounded-md border transition-colors flex-shrink-0",
            sidebarOpen
              ? "border-teal-500 bg-teal-500/20 text-teal-600 dark:text-teal-400"
              : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          )}
          title={sidebarOpen ? "Collapse sidebar" : "Open sidebar"}
        >
          {sidebarOpen ? <PanelLeftClose size={12} /> : <PanelLeftOpen size={12} />}
        </button>
        <input
          type="text"
          value={quickFilter}
          onChange={(e) => setQuickFilter(e.target.value)}
          placeholder="Quick filter..."
          className="max-w-md flex-1 px-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
        <span className="text-[11px] text-zinc-400 whitespace-nowrap">{rowData.length} rows</span>

        {(activeFilterCount > 0 || quickFilter.trim().length > 0) && (
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60 transition-colors whitespace-nowrap"
            title="Clear all filters"
          >
            <span>
              {activeFilterCount + (quickFilter.trim().length > 0 ? 1 : 0)} filter{activeFilterCount + (quickFilter.trim().length > 0 ? 1 : 0) === 1 ? "" : "s"} active
            </span>
            <X size={11} />
          </button>
        )}

        <div className="flex-1" />

        {setShowStale && (
          <label className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer">
            <input
              type="checkbox"
              checked={showStale ?? false}
              onChange={(e) => setShowStale(e.target.checked)}
              className="rounded border-zinc-200 dark:border-zinc-800 text-amber-600 focus:ring-amber-500 w-3 h-3"
            />
            Stale ({staleCount ?? 0})
          </label>
        )}

        {setIncludeNotion && (
          <label className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer">
            <input
              type="checkbox"
              checked={includeNotion ?? true}
              onChange={(e) => setIncludeNotion(e.target.checked)}
              className="rounded border-zinc-200 dark:border-zinc-800 text-teal-600 focus:ring-teal-500 w-3 h-3"
            />
            Notion
          </label>
        )}

        {/* Layouts dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowLayoutMenu(!showLayoutMenu)}
            className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            title={activeLayoutName ? `Current layout: ${activeLayoutName}${layoutModified ? " (modified)" : ""}` : "Layouts"}
          >
            <Bookmark size={11} />
            {activeLayoutName ? (
              <span className="flex items-center gap-1">
                <span className="max-w-[110px] truncate">{activeLayoutName}</span>
                {layoutModified && <span className="text-amber-500" title="Layout has unsaved changes">•</span>}
              </span>
            ) : (
              <span>Layouts</span>
            )}
          </button>
          {showLayoutMenu && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-800 z-50 py-1">
              <button
                onClick={() => { autoSizeAllColumns(); setShowLayoutMenu(false); }}
                className="w-full px-3 py-2 text-left text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center gap-2"
              >
                <ChevronsLeftRight size={12} /> Auto-fit Columns
              </button>
              <button
                onClick={() => { resetLayout(); setShowLayoutMenu(false); }}
                className="w-full px-3 py-2 text-left text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center gap-2"
              >
                <RotateCcw size={12} /> Reset Layout
              </button>
              <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />
              <button
                onClick={() => { setShowLayoutMenu(false); setShowSaveDialog(true); }}
                className="w-full px-3 py-2 text-left text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center gap-2"
              >
                <span className="text-green-600 dark:text-green-400">+</span>
                Save current layout...
              </button>
              {layouts.length > 0 && (
                <>
                  <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />
                  <div className="px-3 py-1 text-[10px] font-medium text-zinc-500 uppercase tracking-wide">Shared Layouts</div>
                  {layouts.map((layout) => (
                    <div
                      key={layout.id}
                      onClick={() => loadLayout(layout.name)}
                      className="w-full px-3 py-2 text-left text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center justify-between cursor-pointer group"
                    >
                      <span className="truncate flex items-center gap-1.5">
                        {layout.is_default && <Star size={10} className="text-amber-500 fill-amber-500 flex-shrink-0" />}
                        {layout.name}
                      </span>
                      <div className="flex items-center gap-0.5">
                        <button onClick={(e) => { e.stopPropagation(); saveCurrentLayout(layout.name); }} className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-400 hover:text-teal-500 hover:bg-teal-100 dark:hover:bg-teal-900/30" title="Overwrite with current layout">
                          <Save size={11} />
                        </button>
                        <button
                          onClick={(e) => toggleDefaultLayout(layout.name, e)}
                          className={cn(
                            "p-1 rounded",
                            layout.is_default
                              ? "text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                              : "opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                          )}
                          title={layout.is_default ? "Remove as default" : "Set as default"}
                        >
                          <Star size={11} className={layout.is_default ? "fill-amber-500" : ""} />
                        </button>
                        <button onClick={(e) => deleteLayout(layout.name, e)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500 dark:text-red-400" title="Delete layout">
                          <X size={11} />
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        <button
          onClick={() => setIsFullscreen(!isFullscreen)}
          className={cn(
            "flex items-center justify-center p-1.5 rounded-md border transition-colors",
            isFullscreen
              ? "border-teal-500 bg-teal-500/20 text-teal-600 dark:text-teal-400"
              : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          )}
          title={isFullscreen ? "Exit fullscreen (ESC)" : "Enter fullscreen"}
        >
          {isFullscreen ? <X size={12} /> : <Maximize2 size={12} />}
        </button>
      </div>

      {/* AG Grid */}
      <div className={`${themeClass} flex-1 min-h-0`} style={{ width: "100%" }}>
        <style>{themeStyles}{`
          .ag-theme-alpine .ag-cell,
          .ag-theme-alpine-dark .ag-cell { display: flex; align-items: center; }
        `}</style>
        <AgGridReact<TeamGridRow>
          ref={gridRef}
          theme="legacy"
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          autoGroupColumnDef={autoGroupColumnDef}
          getRowId={getRowId}
          rowHeight={36}
          headerHeight={32}
          floatingFiltersHeight={30}
          animateRows
          enableBrowserTooltips
          groupDisplayType="singleColumn"
          groupDefaultExpanded={1}
          rowGroupPanelShow="never"
          quickFilterText={quickFilter}
          onFirstDataRendered={handleFirstDataRendered}
          onFilterChanged={handleFilterChanged}
          onColumnMoved={handleLayoutDirty}
          onColumnResized={handleLayoutDirty}
          onColumnVisible={handleLayoutDirty}
          onColumnPinned={handleLayoutDirty}
          onColumnRowGroupChanged={handleLayoutDirty}
          onSortChanged={handleLayoutDirty}
          onRowClicked={(e) => { if (e.data?.taskId) onSelectTask(e.data.taskId); }}
          sideBar={{
            toolPanels: [
              { id: "columns", labelDefault: "Columns", labelKey: "columns", iconKey: "columns", toolPanel: "agColumnsToolPanel" },
              { id: "filters", labelDefault: "Filters", labelKey: "filters", iconKey: "filter", toolPanel: "agFiltersToolPanel" },
            ],
            defaultToolPanel: "",
          }}
          pagination
          paginationPageSize={200}
          paginationPageSizeSelector={[100, 200, 500, 1000]}
        />
      </div>

      {showSaveDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-lg p-6 w-96 max-w-[90vw] border border-zinc-200 dark:border-zinc-800">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Save Layout</h3>
            <input
              type="text"
              value={newLayoutName}
              onChange={(e) => setNewLayoutName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newLayoutName.trim()) saveCurrentLayout(newLayoutName);
                else if (e.key === "Escape") { setShowSaveDialog(false); setNewLayoutName(""); }
              }}
              placeholder="Enter layout name..."
              className="w-full px-3 py-2 text-sm rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowSaveDialog(false); setNewLayoutName(""); }} className="px-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700">Cancel</button>
              <button onClick={() => saveCurrentLayout(newLayoutName)} disabled={!newLayoutName.trim()} className="px-3 py-1.5 text-xs rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}
      {showLayoutMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowLayoutMenu(false)} />
      )}
        </div> {/* end main column */}
      </div> {/* end box */}
    </div>
  );
}

function MyTasksGridView({
  myTasks,
  staleTasks,
  archivedTasks,
  recentlyCompleted,
  contextLabels,
  selectedTaskIds,
  setSelectedTaskIds,
  onSelectTask,
  onBulkSyncToNotion,
  onToggleChanges,
  showChanges,
  includeNotion,
  setIncludeNotion,
}: {
  myTasks: TaskWithRelations[];
  staleTasks: TaskWithRelations[];
  archivedTasks: TaskWithRelations[];
  recentlyCompleted: TaskWithRelations[];
  contextLabels: Map<string, string>;
  selectedTaskIds: Set<string>;
  setSelectedTaskIds: (ids: Set<string>) => void;
  onSelectTask: (id: string) => void;
  onBulkSyncToNotion: () => void | Promise<void>;
  onToggleChanges?: () => void;
  showChanges?: boolean;
  includeNotion?: boolean;
  setIncludeNotion?: (v: boolean) => void;
}) {
  const theme = useAppStore((s) => s.theme);
  const [view, setView] = useState<MyTasksGridFilter>("all");
  const [quickFilter, setQuickFilter] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const gridRef = useRef<AgGridReact<MyTasksGridRow>>(null);

  // ESC to exit fullscreen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) setIsFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  // Filter the source list per the active view
  const filteredTasks = useMemo<TaskWithRelations[]>(() => {
    const weekFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;
    switch (view) {
      case "all":            return myTasks.filter(t => t.status?.type !== "complete");
      case "today":          return myTasks.filter(t => t.status?.type !== "complete" && (isOverdue(t.due_date || "") || isToday(t.due_date)));
      case "this_week":      return myTasks.filter(t => t.status?.type !== "complete" && t.due_date && new Date(t.due_date).getTime() <= weekFromNow);
      case "no_due":         return myTasks.filter(t => t.status?.type !== "complete" && !t.due_date);
      case "sales":          return myTasks.filter(t => isSalesTask(t) && t.status?.type !== "complete");
      case "work":           return myTasks.filter(t => !isSalesTask(t) && t.status?.type !== "complete");
      case "stale":          return staleTasks;
      case "completed_week": return recentlyCompleted;
      case "archived":       return archivedTasks;
    }
  }, [view, myTasks, staleTasks, archivedTasks, recentlyCompleted]);

  // Counts per view
  const viewCounts = useMemo<Record<MyTasksGridFilter, number>>(() => {
    const weekFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;
    return {
      all:            myTasks.filter(t => t.status?.type !== "complete").length,
      today:          myTasks.filter(t => t.status?.type !== "complete" && (isOverdue(t.due_date || "") || isToday(t.due_date))).length,
      this_week:      myTasks.filter(t => t.status?.type !== "complete" && t.due_date && new Date(t.due_date).getTime() <= weekFromNow).length,
      no_due:         myTasks.filter(t => t.status?.type !== "complete" && !t.due_date).length,
      sales:          myTasks.filter(t => isSalesTask(t) && t.status?.type !== "complete").length,
      work:           myTasks.filter(t => !isSalesTask(t) && t.status?.type !== "complete").length,
      stale:          staleTasks.length,
      completed_week: recentlyCompleted.length,
      archived:       archivedTasks.length,
    };
  }, [myTasks, staleTasks, archivedTasks, recentlyCompleted]);

  // Map to grid rows
  const rowData = useMemo<MyTasksGridRow[]>(() => {
    return filteredTasks.map((t) => ({
      id: t.id,
      identifier: getTaskIdentifier(t as any),
      title: t.title || "(untitled)",
      statusName: t.status?.name || "—",
      statusType: t.status?.type || "todo",
      statusColor: t.status?.color || null,
      priority: t.priority ?? 0,
      dueDate: t.due_date || null,
      dueTs: t.due_date ? new Date(t.due_date).getTime() : 0,
      context: contextLabels.get(t.project_id) || t.project?.name || "—",
      projectName: t.project?.name || "",
      projectColor: t.project?.color || null,
      isSales: isSalesTask(t),
      isStale: false,
      isArchived: !!(t as any).archived_at,
      archivedAt: (t as any).archived_at || null,
      updatedAt: t.updated_at || null,
      notion: !!(t as any).notion_page_id,
      triageScore: (t as any).triage_score ?? null,
    }));
  }, [filteredTasks, contextLabels]);

  const columnDefs = useMemo<ColDef<MyTasksGridRow>[]>(() => [
    {
      headerCheckboxSelection: true,
      checkboxSelection: true,
      width: 40,
      pinned: "left",
      sortable: false,
      filter: false,
      resizable: false,
    },
    {
      field: "identifier",
      headerName: "ID",
      width: 95,
      filter: "agTextColumnFilter",
      cellClass: "text-[11px] font-mono text-zinc-400",
    },
    {
      field: "statusName",
      headerName: "Status",
      width: 130,
      filter: "agSetColumnFilter",
      cellRenderer: (p: { value: string; data?: MyTasksGridRow }) => (
        <span className="flex items-center gap-1.5">
          <StatusIcon type={(p.data?.statusType ?? "todo") as any} color={p.data?.statusColor ?? "#6B7280"} size={11} />
          <span className="text-xs text-zinc-700 dark:text-zinc-300">{p.value}</span>
        </span>
      ),
    },
    {
      field: "priority",
      headerName: "P",
      width: 60,
      filter: "agNumberColumnFilter",
      cellRenderer: (p: { value: number }) => <PriorityBars priority={p.value as any} size={10} />,
    },
    {
      field: "title",
      headerName: "Title",
      flex: 2,
      minWidth: 280,
      filter: "agTextColumnFilter",
      cellClass: "text-sm text-zinc-900 dark:text-zinc-100",
    },
    {
      field: "context",
      headerName: "Project",
      flex: 1.4,
      minWidth: 220,
      filter: "agTextColumnFilter",
      cellClass: "text-xs text-zinc-500 dark:text-zinc-400",
    },
    {
      field: "dueTs",
      headerName: "Due",
      width: 110,
      sort: "asc",
      sortIndex: 0,
      filter: "agNumberColumnFilter",
      valueFormatter: (p: { data?: MyTasksGridRow }) => p.data?.dueDate ? formatShortDate(p.data.dueDate) : "—",
      cellClass: (p: { data?: MyTasksGridRow }) => {
        if (!p.data?.dueDate) return "text-xs text-zinc-400";
        if (isOverdue(p.data.dueDate)) return "text-xs text-red-500 font-medium";
        if (isToday(p.data.dueDate)) return "text-xs text-amber-500 font-medium";
        return "text-xs text-zinc-500 dark:text-zinc-400";
      },
    },
    {
      field: "triageScore",
      headerName: "Score",
      width: 80,
      filter: "agNumberColumnFilter",
      valueFormatter: (p: { value: number | null }) => p.value != null ? String(p.value) : "—",
      cellClass: "text-xs text-zinc-500 dark:text-zinc-400",
    },
    {
      field: "notion",
      headerName: "Notion",
      width: 80,
      filter: "agSetColumnFilter",
      cellRenderer: (p: { value: boolean }) =>
        p.value ? <span className="text-[10px] text-zinc-400">✓</span> : null,
    },
  ], []);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    filter: true,
    floatingFilter: true,
    tooltipShowDelay: 500,
  }), []);

  const getRowId = useCallback((params: GetRowIdParams<MyTasksGridRow>) => params.data.id, []);

  // ─── Shared layouts (Supabase grid_layouts, grid_key = "my-tasks") ───────
  const GRID_KEY = "my-tasks";
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newLayoutName, setNewLayoutName] = useState("");
  const [activeLayoutName, setActiveLayoutName] = useState<string | null>(null);
  const [layoutModified, setLayoutModified] = useState(false);
  const [activeFilterCount, setActiveFilterCount] = useState(0);
  const { data: layouts = [], isFetched: layoutsFetched } = useGridLayouts(GRID_KEY);
  const saveLayoutMutation = useSaveGridLayout(GRID_KEY);
  const deleteLayoutMutation = useDeleteGridLayout(GRID_KEY);
  const setDefaultMutation = useSetDefaultGridLayout(GRID_KEY);
  const layoutsByName = useMemo(() => {
    const m: Record<string, GridLayout> = {};
    for (const l of layouts) m[l.name] = l;
    return m;
  }, [layouts]);
  const defaultLayout = useMemo(() => layouts.find((l) => l.is_default) ?? null, [layouts]);

  const saveCurrentLayout = useCallback(async (name: string) => {
    const api = gridRef.current?.api;
    const trimmed = name.trim();
    if (!api || !trimmed) return;
    try {
      await saveLayoutMutation.mutateAsync({
        name: trimmed,
        payload: {
          column_state: api.getColumnState() as unknown[],
          filter_model: (api.getFilterModel() ?? {}) as Record<string, unknown>,
          row_group_columns: api.getRowGroupColumns().map((col) => col.getColId()),
        },
      });
      setActiveLayoutName(trimmed);
      setLayoutModified(false);
      setShowSaveDialog(false);
      setNewLayoutName("");
      toast.success(`Layout "${trimmed}" saved`);
    } catch (err) {
      toast.error(formatError(err));
    }
  }, [saveLayoutMutation]);

  const loadLayout = useCallback((name: string) => {
    const api = gridRef.current?.api;
    if (!api) return;
    const layout = layoutsByName[name];
    if (!layout) return;
    api.setRowGroupColumns([]);
    api.applyColumnState({ state: layout.column_state as ColumnState[], applyOrder: true });
    if (layout.row_group_columns?.length) api.setRowGroupColumns(layout.row_group_columns);
    if (layout.filter_model && Object.keys(layout.filter_model).length) {
      api.setFilterModel(layout.filter_model);
    } else {
      api.setFilterModel(null);
    }
    setActiveLayoutName(name);
    setLayoutModified(false);
    setShowLayoutMenu(false);
    toast.info(`Layout "${name}" applied`);
  }, [layoutsByName]);

  const deleteLayout = useCallback(async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const layout = layoutsByName[name];
    if (!layout) return;
    try {
      await deleteLayoutMutation.mutateAsync(layout.id);
      if (activeLayoutName === name) {
        setActiveLayoutName(null);
        setLayoutModified(false);
      }
      toast.info(`Layout "${name}" deleted`);
    } catch (err) {
      toast.error(formatError(err));
    }
  }, [layoutsByName, deleteLayoutMutation, activeLayoutName]);

  const toggleDefaultLayout = useCallback(async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const layout = layoutsByName[name];
    if (!layout) return;
    try {
      await setDefaultMutation.mutateAsync({ id: layout.id, makeDefault: !layout.is_default });
      toast.info(layout.is_default ? `"${name}" removed as default` : `"${name}" set as default layout`);
    } catch (err) {
      toast.error(formatError(err));
    }
  }, [layoutsByName, setDefaultMutation]);

  const resetLayout = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.setFilterModel(null);
    api.resetColumnState();
    api.setRowGroupColumns([]);
    setQuickFilter("");
    setActiveLayoutName(null);
    setLayoutModified(false);
    toast.info("Layout reset");
  }, []);

  const autoSizeAllColumns = useCallback(() => {
    gridRef.current?.api.autoSizeAllColumns();
  }, []);

  // Apply default layout once grid + Supabase query are both ready.
  const hasAppliedDefault = useRef(false);
  const isFirstDataRendered = useRef(false);

  const applyDefaultIfReady = useCallback(() => {
    if (hasAppliedDefault.current) return;
    if (!isFirstDataRendered.current) return;
    if (!layoutsFetched) return;
    const api = gridRef.current?.api;
    if (!api) return;

    if (defaultLayout) {
      api.applyColumnState({ state: defaultLayout.column_state as ColumnState[], applyOrder: true });
      if (defaultLayout.row_group_columns?.length) api.setRowGroupColumns(defaultLayout.row_group_columns);
      if (defaultLayout.filter_model && Object.keys(defaultLayout.filter_model).length) {
        api.setFilterModel(defaultLayout.filter_model);
      }
      setActiveLayoutName(defaultLayout.name);
      setLayoutModified(false);
    } else {
      api.autoSizeAllColumns(false);
    }
    hasAppliedDefault.current = true;
  }, [defaultLayout, layoutsFetched]);

  const handleFirstDataRendered = useCallback(() => {
    isFirstDataRendered.current = true;
    applyDefaultIfReady();
  }, [applyDefaultIfReady]);

  useEffect(() => {
    applyDefaultIfReady();
  }, [applyDefaultIfReady]);

  const handleFilterChanged = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    const model = api.getFilterModel() ?? {};
    setActiveFilterCount(Object.keys(model).length);
    if (hasAppliedDefault.current && activeLayoutName) setLayoutModified(true);
  }, [activeLayoutName]);

  const handleLayoutDirty = useCallback(() => {
    if (hasAppliedDefault.current && activeLayoutName) setLayoutModified(true);
  }, [activeLayoutName]);

  const clearAllFilters = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.setFilterModel(null);
    setQuickFilter("");
  }, []);

  const themeClass = theme === "dark" ? "ag-theme-alpine-dark" : "ag-theme-alpine";

  return (
    <div className={isFullscreen
      ? "fixed inset-0 z-50 bg-zinc-50 dark:bg-zinc-950 p-4 flex overflow-hidden"
      : "flex-1 min-h-0 flex overflow-hidden px-4 py-4"
    }>
      <div className="flex-1 min-h-0 flex overflow-hidden border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-950">
        {/* Sidebar */}
        {sidebarOpen && (
        <aside className="w-60 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 flex flex-col overflow-hidden rounded-l-md">
          <div className="px-3 py-3">
            <SidebarSection title="View" storageKey="my-tasks:view">
              {MY_TASKS_VIEWS.map((v) => {
                const Icon = v.icon;
                const active = view === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => { setView(v.id); setSelectedTaskIds(new Set()); }}
                    className={cn(
                      "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[13px]",
                      active
                        ? "bg-teal-100 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300"
                        : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <Icon size={13} style={v.color ? { color: v.color } : undefined} />
                      {v.label}
                    </span>
                    <span className="text-[11px] text-zinc-500">{viewCounts[v.id]}</span>
                  </button>
                );
              })}
            </SidebarSection>
          </div>
        </aside>
        )}

        {/* Main column */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={cn(
                "flex items-center justify-center p-1.5 rounded-md border transition-colors flex-shrink-0",
                sidebarOpen
                  ? "border-teal-500 bg-teal-500/20 text-teal-600 dark:text-teal-400"
                  : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              )}
              title={sidebarOpen ? "Collapse sidebar" : "Open sidebar"}
            >
              {sidebarOpen ? <PanelLeftClose size={12} /> : <PanelLeftOpen size={12} />}
            </button>
            {/* Left group: search, count, filter pill */}
            <input
              type="text"
              value={quickFilter}
              onChange={(e) => setQuickFilter(e.target.value)}
              placeholder="Quick filter..."
              className="max-w-md flex-1 px-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            <span className="text-[11px] text-zinc-400 whitespace-nowrap">{rowData.length} tasks</span>

            {(activeFilterCount > 0 || quickFilter.trim().length > 0) && (
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60 transition-colors whitespace-nowrap"
                title="Clear all filters"
              >
                <span>
                  {activeFilterCount + (quickFilter.trim().length > 0 ? 1 : 0)} filter{activeFilterCount + (quickFilter.trim().length > 0 ? 1 : 0) === 1 ? "" : "s"} active
                </span>
                <X size={11} />
              </button>
            )}

            {/* Spacer pushes remaining buttons to the right */}
            <div className="flex-1" />

            {/* Right group: Selected-task actions (shown only when selection is non-empty) */}
            {selectedTaskIds.size > 0 && (
              <>
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400 whitespace-nowrap">{selectedTaskIds.size} selected</span>
                <button
                  onClick={() => onBulkSyncToNotion()}
                  className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 font-medium whitespace-nowrap"
                >
                  <Send size={11} /> Sync to Notion
                </button>
                <button
                  onClick={() => { setSelectedTaskIds(new Set()); gridRef.current?.api.deselectAll(); }}
                  className="text-[11px] px-2 py-1 rounded text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                >
                  Clear
                </button>
              </>
            )}

            {setIncludeNotion && (
              <label className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeNotion ?? true}
                  onChange={(e) => setIncludeNotion(e.target.checked)}
                  className="rounded border-zinc-200 dark:border-zinc-800 text-teal-600 focus:ring-teal-500 w-3 h-3"
                />
                Notion
              </label>
            )}

            {/* Layouts dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowLayoutMenu(!showLayoutMenu)}
                className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                title={activeLayoutName ? `Current layout: ${activeLayoutName}${layoutModified ? " (modified)" : ""}` : "Layouts"}
              >
                <Bookmark size={11} />
                {activeLayoutName ? (
                  <span className="flex items-center gap-1">
                    <span className="max-w-[110px] truncate">{activeLayoutName}</span>
                    {layoutModified && <span className="text-amber-500" title="Layout has unsaved changes">•</span>}
                  </span>
                ) : (
                  <span>Layouts</span>
                )}
              </button>
              {showLayoutMenu && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-800 z-50 py-1">
                  <button
                    onClick={() => { autoSizeAllColumns(); setShowLayoutMenu(false); }}
                    className="w-full px-3 py-2 text-left text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center gap-2"
                  >
                    <ChevronsLeftRight size={12} /> Auto-fit Columns
                  </button>
                  <button
                    onClick={() => { resetLayout(); setShowLayoutMenu(false); }}
                    className="w-full px-3 py-2 text-left text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center gap-2"
                  >
                    <RotateCcw size={12} /> Reset Layout
                  </button>
                  <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />
                  <button
                    onClick={() => { setShowLayoutMenu(false); setShowSaveDialog(true); }}
                    className="w-full px-3 py-2 text-left text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center gap-2"
                  >
                    <span className="text-green-600 dark:text-green-400">+</span>
                    Save current layout...
                  </button>
                  {layouts.length > 0 && (
                    <>
                      <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />
                      <div className="px-3 py-1 text-[10px] font-medium text-zinc-500 uppercase tracking-wide">Shared Layouts</div>
                      {layouts.map((layout) => (
                        <div
                          key={layout.id}
                          onClick={() => loadLayout(layout.name)}
                          className="w-full px-3 py-2 text-left text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center justify-between cursor-pointer group"
                        >
                          <span className="truncate flex items-center gap-1.5">
                            {layout.is_default && <Star size={10} className="text-amber-500 fill-amber-500 flex-shrink-0" />}
                            {layout.name}
                          </span>
                          <div className="flex items-center gap-0.5">
                            <button onClick={(e) => { e.stopPropagation(); saveCurrentLayout(layout.name); }} className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-400 hover:text-teal-500 hover:bg-teal-100 dark:hover:bg-teal-900/30" title="Overwrite with current layout">
                              <Save size={11} />
                            </button>
                            <button
                              onClick={(e) => toggleDefaultLayout(layout.name, e)}
                              className={cn(
                                "p-1 rounded",
                                layout.is_default
                                  ? "text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                                  : "opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                              )}
                              title={layout.is_default ? "Remove as default" : "Set as default"}
                            >
                              <Star size={11} className={layout.is_default ? "fill-amber-500" : ""} />
                            </button>
                            <button onClick={(e) => deleteLayout(layout.name, e)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500 dark:text-red-400" title="Delete layout">
                              <X size={11} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            {onToggleChanges && (
              <button
                onClick={onToggleChanges}
                className={cn(
                  "flex items-center justify-center p-1.5 rounded-md border transition-colors",
                  showChanges
                    ? "border-purple-500 bg-purple-500/20 text-purple-600 dark:text-purple-400"
                    : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                )}
                title="Recent Changes"
              >
                <Clock size={12} />
              </button>
            )}

            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className={cn(
                "flex items-center justify-center p-1.5 rounded-md border transition-colors",
                isFullscreen
                  ? "border-teal-500 bg-teal-500/20 text-teal-600 dark:text-teal-400"
                  : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              )}
              title={isFullscreen ? "Exit fullscreen (ESC)" : "Enter fullscreen"}
            >
              {isFullscreen ? <X size={12} /> : <Maximize2 size={12} />}
            </button>
          </div>

          {/* AG Grid */}
          <div className={`${themeClass} flex-1 min-h-0`} style={{ width: "100%" }}>
            <style>{themeStyles}{`
              .ag-theme-alpine .ag-cell,
              .ag-theme-alpine-dark .ag-cell { display: flex; align-items: center; }
            `}</style>
            <AgGridReact<MyTasksGridRow>
              ref={gridRef}
              theme="legacy"
              rowData={rowData}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              getRowId={getRowId}
              rowHeight={36}
              headerHeight={32}
              floatingFiltersHeight={30}
              animateRows
              enableBrowserTooltips
              rowSelection="multiple"
              suppressRowClickSelection
              quickFilterText={quickFilter}
              onFirstDataRendered={handleFirstDataRendered}
              onFilterChanged={handleFilterChanged}
              onColumnMoved={handleLayoutDirty}
              onColumnResized={handleLayoutDirty}
              onColumnVisible={handleLayoutDirty}
              onColumnPinned={handleLayoutDirty}
              onSortChanged={handleLayoutDirty}
              onSelectionChanged={() => {
                const api = gridRef.current?.api;
                if (!api) return;
                const ids = new Set<string>();
                api.getSelectedNodes().forEach((n) => { if (n.data?.id) ids.add(n.data.id); });
                setSelectedTaskIds(ids);
              }}
              onRowClicked={(e) => {
                if (e.data?.id) onSelectTask(e.data.id);
              }}
              sideBar={{
                toolPanels: [
                  { id: "columns", labelDefault: "Columns", labelKey: "columns", iconKey: "columns", toolPanel: "agColumnsToolPanel" },
                  { id: "filters", labelDefault: "Filters", labelKey: "filters", iconKey: "filter", toolPanel: "agFiltersToolPanel" },
                ],
                defaultToolPanel: "",
              }}
              statusBar={{
                statusPanels: [
                  { statusPanel: "agTotalAndFilteredRowCountComponent", align: "left" },
                  { statusPanel: "agSelectedRowCountComponent", align: "left" },
                ],
              }}
              pagination
              paginationPageSize={100}
              paginationPageSizeSelector={[50, 100, 200, 500]}
            />
          </div>
        </div>
      </div>

      {/* Save Layout Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-lg p-6 w-96 max-w-[90vw] border border-zinc-200 dark:border-zinc-800">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Save Layout</h3>
            <input
              type="text"
              value={newLayoutName}
              onChange={(e) => setNewLayoutName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newLayoutName.trim()) saveCurrentLayout(newLayoutName);
                else if (e.key === "Escape") { setShowSaveDialog(false); setNewLayoutName(""); }
              }}
              placeholder="Enter layout name..."
              className="w-full px-3 py-2 text-sm rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowSaveDialog(false); setNewLayoutName(""); }}
                className="px-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                onClick={() => saveCurrentLayout(newLayoutName)}
                disabled={!newLayoutName.trim()}
                className="px-3 py-1.5 text-xs rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close layout menu */}
      {showLayoutMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowLayoutMenu(false)} />
      )}
    </div>
  );
}

