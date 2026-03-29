// src/modules/work/WorkTaskDashboard.tsx
// My Tasks and Team Tasks dashboard views

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, Clock, Calendar, CheckCircle2, Loader2, Zap, X, Target, ArrowRight } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { TaskWithRelations, User, Initiative } from "../../lib/work/types";
import { getTaskIdentifier } from "../../lib/work/types";
import { isOverdue } from "../../lib/date";
import { StatusIcon, PriorityBars } from "./StatusIcon";
import { TaskRow, initials } from "./workViewsShared";
import type { InitiativeProjectLink } from "./workViewsShared";
import { toast } from "../../stores/toastStore";
import { useJobsStore } from "../../stores/jobsStore";
import { useClaudeRunStore } from "../../stores/claudeRunStore";
import { useTeams } from "../../hooks/work/useTeams";

// ─── Task Triage Types & Hooks ───────────────────────────────────────────

interface TriageProposal {
  task_id: string;
  title: string;
  project: string;
  type: "task" | "deal";             // serde renames item_type → "type"
  triage_score: number;
  triage_action: "do_now" | "do_this_week" | "defer" | "delegate" | "kill";
  triage_reason: string;
  // Structured metadata
  due_date?: string | null;
  days_overdue?: number | null;      // positive = overdue, negative = days until
  suggested_due_date?: string | null;
  // Deal-specific
  deal_stage?: string | null;
  deal_value?: number | null;
  days_stale?: number | null;
  company?: string | null;
}

interface TaskTriageResult {
  success: boolean;
  proposals: TriageProposal[];
  output_text: string;
  error: string | null;
  cost_usd: number | null;
}

interface TaskTriageProgress {
  message: string;
  phase: "starting" | "running" | "complete" | "error";
}

function useTaskTriage() {
  return useMutation({
    mutationFn: async ({ model, taskIds }: { model?: string; taskIds?: string[] } = {}) => {
      const result = await invoke<TaskTriageResult>("work_task_triage", {
        model: model ?? "sonnet",
        taskIds: taskIds ?? null,
      });
      return result;
    },
  });
}


function useTriageProgress(active: boolean) {
  const [logs, setLogs] = useState<string[]>([]);
  const [phase, setPhase] = useState<string>("idle");

  useEffect(() => {
    if (!active) return;
    setLogs([]);
    setPhase("starting");

    const unlisten = listen<TaskTriageProgress>("task-triage:progress", (event) => {
      const { message, phase: p } = event.payload;
      setPhase(p);
      setLogs((prev) => [...prev, message]);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [active]);

  return { logs, phase, clearLogs: () => setLogs([]) };
}

// Listen for Claude's background enrichment completing — refresh task data
function useTriageEnrichment() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const unlisten = listen("task-triage:enriched", () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["work"] });
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [queryClient]);
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

// ─── TaskBucket ───────────────────────────────────────────────────────────

function TaskBucket({ label, tasks, icon: Icon, color, defaultOpen = true, onSelectTask, contextLabels }: {
  label: string;
  tasks: TaskWithRelations[];
  icon: typeof AlertTriangle;
  color: string;
  defaultOpen?: boolean;
  onSelectTask: (id: string) => void;
  contextLabels?: Map<string, string>;
}) {
  const [open, setOpen] = useState(defaultOpen && tasks.length > 0);
  if (tasks.length === 0) return null;

  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors rounded-lg"
      >
        {open ? <ChevronDown size={12} className="text-zinc-400" /> : <ChevronRight size={12} className="text-zinc-400" />}
        <Icon size={13} style={{ color }} />
        <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">{label}</span>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${color}15`, color }}>{tasks.length}</span>
      </button>
      {open && (
        <StatusGroupedTasks tasks={tasks} onSelectTask={onSelectTask} contextLabels={contextLabels || new Map()} />
      )}
    </div>
  );
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

function daysAgo(dateStr: string | null | undefined): number {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
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
          <button onClick={onReject} className="px-2 py-0.5 rounded text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-medium transition-colors flex-shrink-0">
            Keep
          </button>
        )}
      </div>
    </div>
  );
}

// ─── TaskBuckets (renders overdue/today/upcoming/no_date for a set of tasks) ─

function TaskBuckets({ tasks, onSelectTask, contextLabels, showCompleted, defaultCollapsed }: {
  tasks: TaskWithRelations[];
  onSelectTask: (id: string) => void;
  contextLabels?: Map<string, string>;
  showCompleted?: TaskWithRelations[];
  defaultCollapsed?: boolean;
}) {
  const buckets = useMemo(() => bucketTasks(tasks), [tasks]);
  const active = tasks.filter(t => t.status?.type !== "complete");
  const collapsed = defaultCollapsed ?? false;

  return (
    <>
      <TaskBucket label="Overdue" tasks={buckets.overdue} icon={AlertTriangle} color="#EF4444" defaultOpen={!collapsed} onSelectTask={onSelectTask} contextLabels={contextLabels} />
      <TaskBucket label="Due Today" tasks={buckets.today} icon={Clock} color="#F59E0B" defaultOpen={!collapsed} onSelectTask={onSelectTask} contextLabels={contextLabels} />
      <TaskBucket label="Upcoming" tasks={buckets.upcoming} icon={Calendar} color="#3B82F6" defaultOpen={!collapsed} onSelectTask={onSelectTask} contextLabels={contextLabels} />
      <TaskBucket label="No Due Date" tasks={buckets.no_date} icon={Calendar} color="#9CA3AF" defaultOpen={false} onSelectTask={onSelectTask} contextLabels={contextLabels} />
      {showCompleted && showCompleted.length > 0 && (
        <TaskBucket label="Completed This Week" tasks={showCompleted} icon={CheckCircle2} color="#10B981" defaultOpen={false} onSelectTask={onSelectTask} contextLabels={contextLabels} />
      )}
      {active.length === 0 && (
        <div className="text-center py-6 text-xs text-zinc-400">No active tasks</div>
      )}
    </>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────

function TaskDashboardSkeleton() {
  return (
    <div className="h-full flex flex-col animate-pulse">
      {/* Stats skeleton */}
      <div className="flex-shrink-0 flex items-center gap-6 px-4 py-4 border-b border-zinc-100 dark:border-zinc-800/50">
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
      <div className="flex-shrink-0 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50">
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
  const [myTasksTab, setMyTasksTab] = useState<"strategy" | "tasks">("strategy");
  const [_showTriageLog, _setShowTriageLog] = useState(false);
  const triageMutation = useTaskTriage();
  useTriageEnrichment();
  const queryClient = useQueryClient();
  // const { data: priorities } = useQuery({
  //   queryKey: ["work", "priorities"],
  //   queryFn: () => invoke<{ task_ids?: string[]; reasons?: string[]; last_confirmed?: string }>("work_get_priorities"),
  //   staleTime: 60_000,
  // });
  // reprioritise — temporarily disabled, kept for future use
  // const [reprioritising, setReprioritising] = useState(false);
  // const handleReprioritise = useCallback(async () => {
  //   setReprioritising(true);
  //   try {
  //     await invoke("work_reprioritise");
  //     await queryClient.invalidateQueries({ queryKey: ["work", "priorities"] });
  //     toast.success("Priorities updated");
  //   } catch (err) {
  //     toast.error(`Reprioritise failed: ${err}`);
  //   } finally {
  //     setReprioritising(false);
  //   }
  // }, [queryClient]);
  const { logs: triageLogs, phase: _triagePhase, clearLogs: _clearLogs } = useTriageProgress(triageMutation.isPending || _showTriageLog);
  const logEndRef = useRef<HTMLDivElement>(null);
  // const { addJob, updateJob } = useJobsStore(); // unused while handleTriage is disabled
  // const triageJobId = useRef<string | null>(null);

  // Auto-scroll log to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [triageLogs.length]);

  // handleTriage — temporarily disabled, kept for future use
  // const handleTriage = useCallback(() => {
  //   const jobId = `triage-${Date.now()}`;
  //   triageJobId.current = jobId;
  //   clearLogs();
  //   setShowTriageLog(true);
  //   addJob({ id: jobId, name: "Task Triage", status: "running", message: "Scoring tasks..." });
  //   const toastId = toast.loading("Triaging tasks...");
  //   triageMutation.mutate(
  //     { model: "sonnet" },
  //     {
  //       onSuccess: (result) => {
  //         if (result.success && result.proposals.length > 0) {
  //           updateJob(jobId, { status: "completed", message: `${result.proposals.length} tasks scored` });
  //           toast.update(toastId, { type: "success", message: `${result.proposals.length} tasks scored and prioritized`, duration: 4000 });
  //           queryClient.invalidateQueries({ queryKey: ["work"] });
  //           setShowTriageLog(false);
  //         } else {
  //           updateJob(jobId, { status: "failed", message: result.error || "No proposals" });
  //           toast.update(toastId, { type: "error", message: result.error || "Triage produced no proposals", duration: 5000 });
  //         }
  //       },
  //       onError: (err) => {
  //         updateJob(jobId, { status: "failed", message: String(err) });
  //         toast.update(toastId, { type: "error", message: `Triage failed: ${err}`, duration: 5000 });
  //       },
  //     }
  //   );
  // }, [triageMutation, addJob, updateJob, clearLogs]);


  // visibleProposals is computed after salesTasks below

  const STALE_DAYS = 60;
  const staleThreshold = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;

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

  // Split into sales (deal) vs non-sales (work) tasks
  const salesTasks = useMemo(() => myTasks.filter(isSalesTask), [myTasks]);
  const workTasks = useMemo(() => myTasks.filter(t => !isSalesTask(t)), [myTasks]);

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

  const activeSales = salesTasks.filter(t => t.status?.type !== "complete");

  // (triage summary shown via proposals Focus panel)
  const activeWork = workTasks.filter(t => t.status?.type !== "complete");

  // (triage summary is now shown via proposals panel)
  const allBuckets = useMemo(() => bucketTasks(myTasks), [myTasks]);
  const recentlyCompleted = allBuckets.done.filter(t => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return t.updated_at && new Date(t.updated_at).getTime() > weekAgo;
  });
  const recentlyCompletedSales = recentlyCompleted.filter(isSalesTask);
  const recentlyCompletedWork = recentlyCompleted.filter(t => !isSalesTask(t));

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
      <div className="flex-shrink-0 flex items-center gap-4 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50">
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
        <label className="flex items-center gap-1 text-[10px] text-zinc-400 cursor-pointer">
          <input type="checkbox" checked={includeNotion} onChange={(e) => setIncludeNotion(e.target.checked)} className="rounded border-zinc-300 text-teal-600 focus:ring-teal-500 w-3 h-3" />
          Notion
        </label>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 flex items-center gap-0 px-4 border-b border-zinc-100 dark:border-zinc-800/50">
        {(["strategy", "tasks"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setMyTasksTab(tab)}
            className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
              myTasksTab === tab
                ? "border-teal-500 text-teal-600 dark:text-teal-400"
                : "border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            }`}
          >
            {tab === "strategy" ? "Strategy" : "Tasks"}
          </button>
        ))}
      </div>

      {/* Strategy Tab */}
      {myTasksTab === "strategy" && (
        <div className="flex-1 overflow-y-auto">
          <PlansBanner />
          <TriageBanner view="my_tasks" tasks={myTasks.filter(t => t.status?.type !== "complete")} />
        </div>
      )}

      {/* Tasks Tab */}
      {myTasksTab === "tasks" && (
      <div className="flex-1 overflow-y-auto p-4">

        {/* Today's Work — overdue + due today, all in one view */}
        {(() => {
          const todayTasks = myTasks.filter(t => t.status?.type !== "complete" && (isOverdue(t.due_date || "") || isToday(t.due_date)));
          return todayTasks.length > 0 ? (
            <div className="mb-4 rounded-lg border border-red-200/30 dark:border-red-800/20 bg-red-50/30 dark:bg-red-900/5 p-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={14} className="text-red-500" />
                <span className="text-sm font-semibold text-red-600 dark:text-red-400">Today</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-medium">{todayTasks.length}</span>
              </div>
              <StatusGroupedTasks tasks={todayTasks} onSelectTask={onSelectTask} contextLabels={contextLabels} />
            </div>
          ) : (
            <div className="mb-4 rounded-lg border border-emerald-200/30 dark:border-emerald-800/20 bg-emerald-50/30 dark:bg-emerald-900/5 p-3 flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-500" />
              <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">All clear for today</span>
            </div>
          );
        })()}

        {/* No Due Date — with inline date picker */}
        {noDueDateTasks.length > 0 && (
          <CollapsibleSection label="Needs Due Date" count={noDueDateTasks.length} icon={AlertTriangle} color="#F59E0B" defaultOpen={false} badge="Assign due dates">
            <div className="ml-2 border-l-2 border-amber-100 dark:border-amber-900/30 pl-2">
              {noDueDateTasks.map(t => (
                <NeedsDueDateRow key={t.id} task={t} onSelect={onSelectTask} contextLabel={contextLabels.get(t.project_id)} onUpdated={() => queryClient.invalidateQueries({ queryKey: ["work"] })} />
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Sales */}
        <CollapsibleSection label="Sales" count={activeSales.length} color="#3B82F6" defaultOpen={false}>
          <div className="ml-2 pl-2">
            <TaskBuckets tasks={salesTasks} onSelectTask={onSelectTask} contextLabels={contextLabels} showCompleted={recentlyCompletedSales} defaultCollapsed />
          </div>
        </CollapsibleSection>

        {/* Work */}
        <CollapsibleSection label="Work" count={activeWork.length} color="#0D9488" defaultOpen={false}>
          <div className="ml-2 pl-2">
            <TaskBuckets tasks={workTasks} onSelectTask={onSelectTask} contextLabels={contextLabels} showCompleted={recentlyCompletedWork} defaultCollapsed />
          </div>
        </CollapsibleSection>

        {/* Stale — tasks not updated in 60+ days */}
        {staleTasks.length > 0 && (
          <CollapsibleSection label="Stale" count={staleTasks.length} icon={Clock} color="#F59E0B" defaultOpen={false} badge={`Not updated in ${STALE_DAYS}+ days`}>
            <div className="ml-2 border-l-2 border-amber-100 dark:border-amber-900/30 pl-2">
              {staleTasks.map(t => (
                <div key={t.id} className="group flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 rounded">
                  <TaskRow task={t} onSelect={onSelectTask} contextLabel={contextLabels.get(t.project_id)} />
                  <span className="text-[10px] text-amber-500 flex-shrink-0">{daysAgo(t.updated_at)}d ago</span>
                  <button
                    className="text-[10px] px-2 py-0.5 rounded text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await supabase.from("tasks").update({ archived_at: new Date().toISOString() }).eq("id", t.id);
                      toast.success("Archived");
                      queryClient.invalidateQueries({ queryKey: ["work"] });
                    }}
                  >
                    Archive
                  </button>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Archived — hidden by default */}
        {archivedTasks.length > 0 && (
          <CollapsibleSection label="Archived" count={archivedTasks.length} icon={X} color="#6B7280" defaultOpen={false}>
            <div className="ml-2 border-l-2 border-zinc-200 dark:border-zinc-800 pl-2">
              {archivedTasks.map(t => (
                <div key={t.id} className="group flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 rounded opacity-50 hover:opacity-100 transition-opacity">
                  <TaskRow task={t} onSelect={onSelectTask} contextLabel={contextLabels.get(t.project_id)} />
                  <button
                    className="text-[10px] px-2 py-0.5 rounded text-zinc-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 font-medium opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await supabase.from("tasks").update({ archived_at: null }).eq("id", t.id);
                      toast.success("Restored");
                      queryClient.invalidateQueries({ queryKey: ["work"] });
                    }}
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}
      </div>
      )}
    </div>
  );
}

// ─── NeedsDueDateRow — task row with inline date picker ───────────────────

function NeedsDueDateRow({ task, onSelect, contextLabel, onUpdated }: {
  task: TaskWithRelations;
  onSelect: (id: string) => void;
  contextLabel?: string;
  onUpdated: () => void;
}) {
  const [dateValue, setDateValue] = useState("");

  const handleSetDate = async () => {
    if (!dateValue) return;
    const { error } = await supabase.from("tasks").update({ due_date: dateValue }).eq("id", task.id);
    if (error) { toast.error(`Failed: ${error.message}`); return; }
    toast.success(`Due date set to ${formatShortDate(dateValue)}`);
    setDateValue("");
    onUpdated();
  };

  return (
    <div className="group flex items-center gap-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 rounded transition-colors">
      <div className="flex-1 min-w-0">
        <TaskRow task={task} onSelect={onSelect} contextLabel={contextLabel} />
      </div>
      <input
        type="date"
        value={dateValue}
        onChange={(e) => setDateValue(e.target.value)}
        className="text-[10px] px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 bg-transparent text-zinc-600 dark:text-zinc-400 w-28 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      />
      {dateValue && (
        <button
          onClick={handleSetDate}
          className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 font-medium flex-shrink-0"
        >
          Set
        </button>
      )}
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

// ─── Plans Banner — persistent planning horizons ────────────────────────

interface Plan {
  id: string;
  horizon: string;
  title: string;
  description: string | null;
  status: string;
  sort_order: number;
  starts_at: string;
  ends_at: string;
}

function PlansBanner() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  const [adding, setAdding] = useState<string | null>(null); // horizon being added to
  const [newTitle, setNewTitle] = useState("");

  const { data: plans = [] } = useQuery({
    queryKey: ["plans"],
    queryFn: async (): Promise<Plan[]> => {
      const { data } = await supabase
        .from("plans")
        .select("*")
        .eq("status", "active")
        .order("horizon")
        .order("sort_order");
      return (data ?? []) as Plan[];
    },
    staleTime: 60_000,
  });

  const monthPlans = plans.filter(p => p.horizon === "month");
  const weekPlans = plans.filter(p => p.horizon === "week");
  const dayPlans = plans.filter(p => p.horizon === "3_day");

  const today = new Date();
  const horizonDates: Record<string, { starts_at: string; ends_at: string }> = {
    month: {
      starts_at: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10),
      ends_at: new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10),
    },
    week: {
      starts_at: new Date(today.getTime() - today.getDay() * 86400000).toISOString().slice(0, 10),
      ends_at: new Date(today.getTime() + (6 - today.getDay()) * 86400000).toISOString().slice(0, 10),
    },
    "3_day": {
      starts_at: today.toISOString().slice(0, 10),
      ends_at: new Date(today.getTime() + 2 * 86400000).toISOString().slice(0, 10),
    },
  };

  const handleAdd = async (horizon: string) => {
    if (!newTitle.trim()) return;
    await supabase.from("plans").insert({
      horizon,
      title: newTitle.trim(),
      status: "active",
      sort_order: plans.filter(p => p.horizon === horizon).length,
      starts_at: horizonDates[horizon].starts_at,
      ends_at: horizonDates[horizon].ends_at,
      created_by: "mel-tv",
    });
    setNewTitle("");
    setAdding(null);
    queryClient.invalidateQueries({ queryKey: ["plans"] });
  };

  const handleComplete = async (id: string) => {
    await supabase.from("plans").update({ status: "completed" }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["plans"] });
  };

  const handleDrop = async (id: string) => {
    await supabase.from("plans").update({ status: "dropped" }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["plans"] });
  };

  const totalPlans = plans.length;

  const renderHorizon = (label: string, horizon: string, items: Plan[], color: string) => (
    <div className={`rounded-lg border border-${color}-200/30 dark:border-${color}-800/20 p-2.5`} style={{ borderColor: `${color}30` }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>{label}</span>
        <button
          onClick={() => { setAdding(adding === horizon ? null : horizon); setNewTitle(""); }}
          className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
        >+</button>
      </div>
      {items.length === 0 && adding !== horizon && (
        <div className="text-[10px] text-zinc-400 italic">No plans set</div>
      )}
      {items.map(p => (
        <div key={p.id} className="group flex items-center gap-1.5 py-0.5">
          <button onClick={() => handleComplete(p.id)} className="text-zinc-300 hover:text-emerald-500 transition-colors flex-shrink-0" title="Mark complete">
            <CheckCircle2 size={10} />
          </button>
          <span className="text-[11px] text-zinc-700 dark:text-zinc-300 flex-1">{p.title}</span>
          <button onClick={() => handleDrop(p.id)} className="text-zinc-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0" title="Drop">
            <X size={10} />
          </button>
        </div>
      ))}
      {adding === horizon && (
        <div className="flex items-center gap-1 mt-1">
          <input
            type="text"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleAdd(horizon); if (e.key === "Escape") setAdding(null); }}
            placeholder="Add a goal..."
            autoFocus
            className="flex-1 text-[11px] px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-0 outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
      )}
    </div>
  );

  return (
    <div className="flex-shrink-0 px-4 py-2 border-b border-zinc-100 dark:border-zinc-800/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full"
      >
        {expanded ? <ChevronDown size={10} className="text-zinc-400" /> : <ChevronRight size={10} className="text-zinc-400" />}
        <Target size={12} className="text-teal-500" />
        <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Plans</span>
        <span className="text-[10px] text-zinc-400">{totalPlans} active</span>
        {totalPlans === 0 && <span className="text-[10px] text-amber-500">Set your goals</span>}
      </button>
      {expanded && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          {renderHorizon("This Month", "month", monthPlans, "#3B82F6")}
          {renderHorizon("This Week", "week", weekPlans, "#F59E0B")}
          {renderHorizon("Next 3 Days", "3_day", dayPlans, "#10B981")}
        </div>
      )}
    </div>
  );
}

// ─── Triage Banner — shows last triage summary + triage button ──────────

function TriageBanner({ view, viewKey, tasks }: { view: "my_tasks" | "team"; viewKey?: string; tasks: TaskWithRelations[] }) {
  const effectiveViewKey = viewKey || view;
  const queryClient = useQueryClient();
  const triageMutation = useTaskTriage();
  const { addJob, updateJob } = useJobsStore();
  const [expanded, setExpanded] = useState(true);
  const [_editingPrompt, setEditingPrompt] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [promptModel, _setPromptModel] = useState("claude-haiku-4-5-20251001");
  const claudeRunStore = useClaudeRunStore();

  // Listen for Claude stream events and feed into claudeRunStore
  useEffect(() => {
    const unlisten = listen<{ run_id: string; event_type: string; content: string; metadata?: any }>("claude-stream", (event) => {
      if (!event.payload.run_id.startsWith("triage-")) return;
      const { run_id, event_type, content, metadata } = event.payload;
      if (event_type === "result") {
        claudeRunStore.completeRun(run_id, content, metadata?.is_error || false, metadata?.cost_usd || 0, metadata?.duration_ms || 0);
      } else {
        claudeRunStore.addEvent(run_id, { type: event_type, content, timestamp: Date.now() });
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  // Load triage config
  const { data: triageConfig } = useQuery({
    queryKey: ["triage_config"],
    queryFn: async () => {
      const { data } = await supabase.from("triage_config").select("*").eq("id", "default").limit(1);
      return data?.[0] || null;
    },
    staleTime: 300_000,
  });

  const _openPromptEditor = () => {
    setPromptText(triageConfig?.summary_system_prompt || "");
    _setPromptModel(triageConfig?.summary_model || "claude-haiku-4-5-20251001");
    setEditingPrompt(true);
  };

  const _savePrompt = async () => {
    await supabase.from("triage_config").upsert({
      id: "default",
      summary_system_prompt: promptText,
      summary_model: promptModel,
      updated_at: new Date().toISOString(),
    });
    queryClient.invalidateQueries({ queryKey: ["triage_config"] });
    setEditingPrompt(false);
    toast.success("Triage prompt updated");
  };
  // Suppress unused warnings — these are temporarily disabled features
  void _openPromptEditor; void _savePrompt;

  // Load last triage run
  const { data: lastRun } = useQuery({
    queryKey: ["triage_runs", effectiveViewKey],
    queryFn: async () => {
      const { data } = await supabase
        .from("triage_runs")
        .select("*")
        .eq("view", effectiveViewKey)
        .order("created_at", { ascending: false })
        .limit(1);
      return data?.[0] || null;
    },
    staleTime: 60_000,
  });

  const handleTriage = useCallback(async () => {
    const teamLabel = view === "team" ? "Team" : "My Tasks";
    const jobId = `triage-${view}-${Date.now()}`;
    addJob({ id: jobId, name: `Triage: ${teamLabel}`, status: "running", message: "Claude is analyzing..." });
    claudeRunStore.createRun({ id: jobId, name: `Triage: ${teamLabel}`, domainName: "", tableId: "" });

    // Build scope-specific instructions
    const assigneeNames = [...new Set(tasks.flatMap(t => (t.assignees || []).map(a => a.user?.name).filter(Boolean)))];
    // Only score tasks that haven't been triaged recently (> 24h ago)
    const untriaged = tasks.filter(t => !t.last_triaged_at || (Date.now() - new Date(t.last_triaged_at as string).getTime()) > 24 * 60 * 60 * 1000);
    const alreadyTriaged = tasks.filter(t => t.triage_action && t.last_triaged_at && (Date.now() - new Date(t.last_triaged_at as string).getTime()) <= 24 * 60 * 60 * 1000);
    const taskIds = (untriaged.length > 0 ? untriaged : tasks).slice(0, 200).map(t => t.id);
    // Build context of already-triaged tasks so Claude includes them in the summary
    const existingTriageContext = alreadyTriaged.length > 0
      ? `\n\nALREADY TRIAGED (include these in your summary and action cards, do NOT re-score them):\n${alreadyTriaged.slice(0, 100).map(t => `${t.id} | ${t.title} | ${(t as any).project?.name || "?"} | ${t.triage_action} | ${t.triage_score} | ${t.triage_reason || ""}`).join("\n")}`
      : "";

    const taskFilter = view === "team"
      ? `SCOPE: Team triage for the team: ${assigneeNames.join(", ") || "all team members"}.
IMPORTANT: Only recommend actions WITHIN this team. Do NOT suggest delegating to people outside this team. "delegate" means reassign between ${assigneeNames.join(", ")}.
Assess workload balance across these team members. Mention each person by name.
${untriaged.length < tasks.length ? `NOTE: ${tasks.length - untriaged.length} tasks were already triaged recently — only scoring ${taskIds.length} new/stale tasks.` : ""}
Task IDs to triage:\n${taskIds.join("\n")}`
      : `SCOPE: Individual triage for mel-tv (Melvin).
Focus on personal prioritization: what to do today, what to push back, what to kill.
${untriaged.length < tasks.length ? `NOTE: ${tasks.length - untriaged.length} tasks already triaged recently — only scoring ${taskIds.length} new/stale tasks.` : ""}
Task IDs to triage:\n${taskIds.join("\n")}`;

    const prompt = `You are a strategic task triage advisor. Use mcp__supabase__execute_sql to query the database and understand the full context.

STEP 1 — QUERY these tables:
- SELECT i.id, i.name, i.status, i.health FROM initiatives i WHERE i.status IN ('active','planned')
- SELECT p.id, p.name, p.project_type, p.status, c.display_name as company, c.stage FROM projects p LEFT JOIN crm_companies c ON c.id = p.company_id WHERE p.status = 'active'
- SELECT t.id, t.title, t.description, t.priority, t.due_date, ts.name as status, ts.type as status_type, p.name as project, c.display_name as company FROM tasks t LEFT JOIN task_statuses ts ON ts.id = t.status_id LEFT JOIN projects p ON p.id = t.project_id LEFT JOIN crm_companies c ON c.id = t.company_id WHERE ts.type != 'complete' AND t.updated_at > NOW() - INTERVAL '60 days' ORDER BY t.due_date ASC NULLS LAST
- SELECT ta.task_id, u.name FROM task_assignees ta JOIN users u ON u.id = ta.user_id
- SELECT horizon, title FROM plans WHERE status = 'active'

STEP 2 — For EACH active task, assign:
- action: do_now | do_this_week | defer | delegate | kill
- score: 0-100 (strategic urgency, not just due date)
- reason: 1 concise sentence with specific context (names, amounts, dates)

STEP 3 — Write summary with labeled sections separated by line breaks:
URGENT: [what needs action now, 1-2 sentences]
PLAN STATUS: [on track or drifting, 1 sentence]
DEFER/KILL: [what to cut, 1 sentence]
WORKLOAD: [capacity concerns, 1 sentence]

RULES:
- READ ONLY. Do NOT update, insert, or modify any data.
- Do NOT use update-task or any write tools.
- For deals: be aggressive about kill for cold deals, do_now for active engagement.
- Return ONLY valid JSON, no markdown code blocks:
{"summary":"URGENT: ...\\n\\nPLAN STATUS: ...\\n\\nDEFER/KILL: ...\\n\\nWORKLOAD: ...","tasks":[{"id":"uuid","title":"task name","project":"project name","action":"do_now","score":90,"reason":"..."}]}

${taskFilter}${existingTriageContext}`;

    try {
      const claudeResult = await invoke<{ result: string; is_error: boolean }>("claude_run", {
        runId: jobId,
        request: {
          prompt,
          allowed_tools: ["mcp__supabase__execute_sql"],
          model: "sonnet",
          max_budget_usd: 1.0,
        },
      });

      if (claudeResult.result) {
        // Note: don't check is_error — Claude sometimes flags code-block output as "error"
        // Parse Claude's structured JSON response
        let parsed: { summary?: string; tasks?: { id: string; action: string; score: number; reason: string }[] } = {};
        try {
          const raw = claudeResult.result.trim();
          // Try to find the JSON object — Claude might wrap it in text or code blocks
          let jsonStr = raw;
          // Strip markdown code blocks if present
          const codeMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (codeMatch) jsonStr = codeMatch[1].trim();
          const start = jsonStr.indexOf("{");
          const end = jsonStr.lastIndexOf("}");
          if (start >= 0 && end > start) {
            parsed = JSON.parse(jsonStr.slice(start, end + 1));
          }
          console.log(`[triage] Parsed ${parsed.tasks?.length || 0} tasks from Claude response`);
        } catch (e) {
          console.error("[triage] JSON parse failed:", e, "Raw:", claudeResult.result.slice(0, 500));
          toast.error("Triage JSON parse failed — check console");
        }

        const aiSummary = parsed.summary || claudeResult.result;
        const newScoredTasks = parsed.tasks || [];

        // Merge new scores with existing triage data for complete action cards
        const allScored = [
          ...newScoredTasks,
          ...alreadyTriaged.map(t => ({
            id: t.id, title: t.title, project: (t as any).project?.name || "",
            action: t.triage_action!, score: t.triage_score!, reason: t.triage_reason || "",
          })),
        ];
        // Deduplicate — new scores override existing
        const seenIds = new Set<string>();
        const scoredTasks = allScored.filter(t => { if (seenIds.has(t.id)) return false; seenIds.add(t.id); return true; });

        // Build action cards
        const counts: Record<string, number> = {};
        const actionLabels: Record<string, string> = { do_now: "Urgent", do_this_week: "This Week", defer: "Defer", delegate: "Delegate", kill: "Kill" };
        const topByAction: Record<string, { label: string; tasks: { title: string; project: string; score: number; reason: string }[] }> = {};
        for (const st of scoredTasks) counts[st.action] = (counts[st.action] || 0) + 1;
        for (const action of ["do_now", "do_this_week", "defer", "delegate", "kill"]) {
          const top = scoredTasks.filter(t => t.action === action).sort((a, b) => b.score - a.score).slice(0, 8)
            .map(t => {
              const task = tasks.find(tt => tt.id === t.id);
              return { title: (t as any).title || task?.title || t.id.slice(0, 8), project: (t as any).project || (task as any)?.project?.name || "", score: t.score, reason: t.reason };
            });
          if (top.length > 0) topByAction[action] = { label: actionLabels[action] || action, tasks: top };
        }

        // Save triage run IMMEDIATELY so UI updates fast
        const triageData = { view: effectiveViewKey, tasks_scored: scoredTasks.length, summary: aiSummary, details: { counts, topByAction }, created_by: "mel-tv" };
        const { error: insertErr } = await supabase.from("triage_runs").insert(triageData);
        if (insertErr) {
          toast.error(`Failed to save triage: ${insertErr.message}`);
        }
        updateJob(jobId, { status: "completed", message: `${scoredTasks.length} tasks triaged` });

        // Update UI immediately with the new data (don't wait for refetch)
        queryClient.setQueryData(["triage_runs", effectiveViewKey], triageData);
        setExpanded(true);
        toast.success(`Triage complete: ${scoredTasks.length} tasks scored`);

        // Write task scores in background (don't block UI)
        const activeTaskIds = new Set(tasks.map(t => t.id));
        const activeScoredTasks = scoredTasks.filter(t => activeTaskIds.has(t.id));
        const now = new Date().toISOString();
        // Batch update via SQL for speed
        if (activeScoredTasks.length > 0) {
          const cases = activeScoredTasks.map(t =>
            `WHEN '${t.id}' THEN ${t.score}`
          ).join(" ");
          const actionCases = activeScoredTasks.map(t =>
            `WHEN '${t.id}' THEN '${t.action}'`
          ).join(" ");
          const reasonCases = activeScoredTasks.map(t =>
            `WHEN '${t.id}' THEN '${t.reason.replace(/'/g, "''")}'`
          ).join(" ");
          const ids = activeScoredTasks.map(t => `'${t.id}'`).join(",");

          await supabase.rpc("execute_raw_sql" as any, { query: `
            UPDATE tasks SET
              triage_score = CASE id ${cases} END,
              triage_action = CASE id ${actionCases} END,
              triage_reason = CASE id ${reasonCases} END,
              last_triaged_at = '${now}'
            WHERE id IN (${ids})
          `}).then(({ error: rpcError }) => { if (rpcError) {
            // Fallback: individual updates if RPC not available
            activeScoredTasks.forEach(t => {
              supabase.from("tasks").update({
                triage_score: t.score, triage_action: t.action, triage_reason: t.reason, last_triaged_at: now,
              }).eq("id", t.id).then(() => {});
            });
          }});
        }

        // Background refetch to sync everything
        queryClient.invalidateQueries({ queryKey: ["work"] });
      } else {
        const errMsg = claudeResult?.result?.slice(0, 300) || "No result returned";
        updateJob(jobId, { status: "failed", message: `Triage failed: ${errMsg}` });
        toast.error(`Triage failed: ${errMsg}`);
      }
    } catch (err: any) {
      updateJob(jobId, { status: "failed", message: err?.message || String(err) });
    }
  }, [view, addJob, updateJob, queryClient, triageConfig, tasks, claudeRunStore]);

  const triaged = tasks.filter(t => t.triage_action);
  const untriaged = tasks.length - triaged.length;
  const timeAgo = lastRun?.created_at ? formatTimeAgo(new Date(lastRun.created_at)) : null;

  return (
    <div className="flex-shrink-0 px-4 py-2 border-b border-zinc-100 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/30">
      <div className="flex items-center gap-3">
        <Zap size={12} className="text-amber-500" />
        <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Triage</span>
        {timeAgo && (
          <span className="text-[10px] text-zinc-400">Last: {timeAgo}</span>
        )}
        {triaged.length > 0 && (
          <span className="text-[10px] text-zinc-400">{triaged.length} scored, {untriaged} unscored</span>
        )}
        <div className="flex-1" />
        {lastRun?.summary && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          >
            {expanded ? "Hide summary" : "Show summary"}
          </button>
        )}
        <button
          onClick={handleTriage}
          disabled={triageMutation.isPending}
          className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
            triageMutation.isPending
              ? "text-amber-500 bg-amber-50 dark:bg-amber-900/20 cursor-wait"
              : "text-amber-600 bg-amber-50 hover:bg-amber-100 dark:text-amber-400 dark:bg-amber-900/20 dark:hover:bg-amber-900/30"
          }`}
        >
          {triageMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
          {triageMutation.isPending ? "Scoring..." : "Triage"}
        </button>
      </div>
      {expanded && lastRun && (
        <div className="mt-2 space-y-3">
          {/* AI Strategic Summary */}
          {lastRun.summary && (
            <div className="bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200/30 dark:border-amber-800/20 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <Zap size={12} className="text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="text-[12px] text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-line"
                  dangerouslySetInnerHTML={{ __html: lastRun.summary
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\n/g, '<br/>')
                  }}
                />
              </div>
            </div>
          )}
          {/* Per-action breakdown */}
          {lastRun.details?.topByAction && (
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(lastRun.details.topByAction).map(([action, group]: [string, any]) => {
                const styles: Record<string, { border: string; bg: string; text: string }> = {
                  do_now: { border: "border-red-200/30 dark:border-red-800/20", bg: "bg-red-50/50 dark:bg-red-900/10", text: "text-red-500" },
                  do_this_week: { border: "border-amber-200/30 dark:border-amber-800/20", bg: "bg-amber-50/50 dark:bg-amber-900/10", text: "text-amber-500" },
                  defer: { border: "border-blue-200/30 dark:border-blue-800/20", bg: "bg-blue-50/50 dark:bg-blue-900/10", text: "text-blue-500" },
                  delegate: { border: "border-zinc-200/30 dark:border-zinc-700/30", bg: "bg-zinc-50/50 dark:bg-zinc-800/30", text: "text-zinc-500" },
                  kill: { border: "border-zinc-200/30 dark:border-zinc-700/30", bg: "bg-zinc-50/50 dark:bg-zinc-800/30", text: "text-zinc-400" },
                };
                const s = styles[action] || styles.kill;
                return (
                  <div key={action} className={`rounded-lg border ${s.border} ${s.bg} p-2.5`}>
                    <div className={`text-[10px] font-semibold ${s.text} mb-1.5`}>{group.label} ({group.tasks.length})</div>
                    {group.tasks.map((t: any, i: number) => (
                      <div key={i} className="text-[10px] text-zinc-500 dark:text-zinc-400 py-0.5 flex gap-1.5 items-baseline">
                        <span className={`font-mono font-medium ${s.text} flex-shrink-0 w-5 text-right`}>{t.score}</span>
                        <span className="flex-1 min-w-0">
                          <span className="text-zinc-700 dark:text-zinc-300">{t.title}</span>
                          {t.project && <span className="text-zinc-400 ml-1">· {t.project}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function StatusGroupedTasks({ tasks, onSelectTask, contextLabels, rowComponent }: {
  tasks: TaskWithRelations[];
  onSelectTask: (id: string) => void;
  contextLabels: Map<string, string>;
  rowComponent?: (task: TaskWithRelations) => React.ReactNode;
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
          {statusTasks.map(t => rowComponent ? rowComponent(t) : <TaskRow key={t.id} task={t} onSelect={onSelectTask} contextLabel={contextLabels.get(t.project_id)} />)}
        </div>
      ))}
    </div>
  );
}

function PersonSection({ user, tasks, onSelectTask, contextLabels, defaultOpen = false }: {
  user: { id: string; name: string } | null;
  tasks: TaskWithRelations[];
  onSelectTask: (id: string) => void;
  contextLabels: Map<string, string>;
  defaultOpen?: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(defaultOpen);
  const [showPersonTriage, setShowPersonTriage] = useState(false);
  const active = tasks.filter(t => t.status?.type !== "complete");

  // Load person's last triage
  const personTriageKey = user ? `person-${user.id}` : null;
  const { data: personTriage } = useQuery({
    queryKey: ["triage_runs", personTriageKey],
    queryFn: async () => {
      if (!personTriageKey) return null;
      const { data } = await supabase.from("triage_runs").select("*").eq("view", personTriageKey).order("created_at", { ascending: false }).limit(1);
      return data?.[0] || null;
    },
    enabled: !!personTriageKey,
    staleTime: 60_000,
  });
  const overdue = active.filter(t => isOverdue(t.due_date || ""));
  const dueToday = active.filter(t => isToday(t.due_date));
  const upcoming = active.filter(t => t.due_date && !isOverdue(t.due_date) && !isToday(t.due_date));
  const noDate = active.filter(t => !t.due_date);

  // Top tasks by triage score = their "Today" (currently unused)
  // const topTasks = active
  //   .filter(t => t.triage_action === "do_now" || (isOverdue(t.due_date || "") && (t.triage_score ?? 0) >= 60))
  //   .sort((a, b) => (b.triage_score ?? 0) - (a.triage_score ?? 0))
  //   .slice(0, 5);

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors rounded-lg"
      >
        {open ? <ChevronDown size={12} className="text-zinc-400" /> : <ChevronRight size={12} className="text-zinc-400" />}
        <div className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-xs font-medium text-zinc-600 dark:text-zinc-400">
          {user ? initials(user.name) : "?"}
        </div>
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{user?.name || "Unassigned"}</span>
        <span className="text-xs text-zinc-400 ml-auto">{active.length}</span>
        <div className="flex items-center gap-1">
          {overdue.length > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 dark:bg-red-900/20 font-medium">{overdue.length} overdue</span>}
          {dueToday.length > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 dark:bg-amber-900/20 font-medium">{dueToday.length} today</span>}
        </div>
        {/* Sync all to Notion */}
        {active.some(t => (t as any).notion_page_id) && (
          <span
            className="text-[9px] px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer transition-colors"
            title="Sync all tasks to Notion"
            onClick={async (e) => {
              e.stopPropagation();
              const notionTasks = active.filter(t => (t as any).notion_page_id);
              const jobId = `notion-push-${user?.name || "unassigned"}-${Date.now()}`;
              const jobStore = useJobsStore.getState();
              jobStore.addJob({ id: jobId, name: `Notion Push: ${user?.name || "Unassigned"}`, status: "running", message: `0/${notionTasks.length} tasks...` });
              let synced = 0;
              let failed = 0;
              const failures: string[] = [];
              for (const t of notionTasks) {
                try {
                  await invoke("notion_push_task", { taskId: t.id });
                  synced++;
                } catch (err: any) {
                  failed++;
                  failures.push(`${t.title?.slice(0, 40)}: ${err?.message || err}`);
                }
                jobStore.updateJob(jobId, { message: `${synced + failed}/${notionTasks.length} tasks (${synced} synced${failed ? `, ${failed} failed` : ""})` });
              }
              if (failures.length) console.error(`[Notion Push] ${user?.name} failures:\n${failures.join("\n")}`);
              jobStore.updateJob(jobId, {
                status: failed > 0 ? "failed" : "completed",
                message: `${synced} synced${failed ? `, ${failed} failed` : ""} of ${notionTasks.length} tasks${failures.length ? " — " + failures.join(" | ") : ""}`,
              });
            }}
          >
            ↑ Notion
          </span>
        )}
        {/* Per-person triage */}
        <span
          className="text-[9px] px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 cursor-pointer transition-colors"
          title={`Triage ${user?.name || "Unassigned"}'s tasks`}
          onClick={async (e) => {
            e.stopPropagation();
            const personName = user?.name || "Unassigned";
            const jobId = `triage-person-${user?.id || "unassigned"}-${Date.now()}`;
            const jobStore = useJobsStore.getState();
            const claudeStore = useClaudeRunStore.getState();
            jobStore.addJob({ id: jobId, name: `Triage: ${personName}`, status: "running", message: "Claude is analyzing..." });
            claudeStore.createRun({ id: jobId, name: `Triage: ${personName}`, domainName: "", tableId: "" });

            const personPrompt = `You are a strategic task triage advisor. Use mcp__supabase__execute_sql to query the database.

STEP 1 — QUERY:
- SELECT t.id, t.title, t.description, t.priority, t.due_date, ts.name as status, ts.type as status_type, p.name as project, p.project_type, c.display_name as company FROM tasks t LEFT JOIN task_statuses ts ON ts.id = t.status_id LEFT JOIN projects p ON p.id = t.project_id LEFT JOIN crm_companies c ON c.id = t.company_id WHERE ts.type != 'complete' AND t.updated_at > NOW() - INTERVAL '60 days' AND t.id IN (SELECT task_id FROM task_assignees WHERE user_id = '${user?.id}') ORDER BY t.due_date ASC NULLS LAST
- SELECT horizon, title FROM plans WHERE status = 'active'

SCOPE: Individual triage for ${personName}.
Focus on what ${personName} should prioritize: what to do now, what can wait, what's blocking them, any tasks that should be reassigned.

STEP 2 — For EACH task, assign: action (do_now|do_this_week|defer|delegate|kill), score (0-100), reason (1 sentence).

STEP 3 — Summary with labeled sections:
URGENT: [what ${personName} needs to do now]
THIS WEEK: [key focus areas]
DEFER/KILL: [what to cut]
WORKLOAD: [capacity assessment]

RULES: READ ONLY. No updates. Return ONLY JSON:
{"summary":"...","tasks":[{"id":"uuid","title":"...","project":"...","action":"...","score":0,"reason":"..."}]}`;

            try {
              const result = await invoke<{ result: string; is_error: boolean }>("claude_run", {
                runId: jobId,
                request: { prompt: personPrompt, allowed_tools: ["mcp__supabase__execute_sql"], model: "sonnet", max_budget_usd: 0.5 },
              });
              if (result.result) {
                let parsed: any = {};
                try {
                  const raw = result.result.trim();
                  let jsonStr = raw;
                  const codeMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
                  if (codeMatch) jsonStr = codeMatch[1].trim();
                  const s = jsonStr.indexOf("{"), en = jsonStr.lastIndexOf("}");
                  if (s >= 0 && en > s) parsed = JSON.parse(jsonStr.slice(s, en + 1));
                } catch {}
                const scoredTasks = parsed.tasks || [];
                const activeIds = new Set(active.map(t => t.id));
                const now = new Date().toISOString();
                scoredTasks.filter((t: any) => activeIds.has(t.id)).forEach((t: any) => {
                  supabase.from("tasks").update({ triage_score: t.score, triage_action: t.action, triage_reason: t.reason, last_triaged_at: now }).eq("id", t.id).then(() => {});
                });
                // Save per-person triage run
                const personView = `person-${user?.id}`;
                const personSummary = parsed.summary || "";
                await supabase.from("triage_runs").insert({ view: personView, tasks_scored: scoredTasks.length, summary: personSummary, details: { tasks: scoredTasks }, created_by: "mel-tv" });
                jobStore.updateJob(jobId, { status: "completed", message: `${scoredTasks.length} tasks triaged for ${personName}` });
                toast.success(`${personName}: ${scoredTasks.length} tasks triaged`);
                setShowPersonTriage(true);
                queryClient.invalidateQueries({ queryKey: ["work"] });
                queryClient.invalidateQueries({ queryKey: ["triage_runs", personView] });
              } else {
                jobStore.updateJob(jobId, { status: "failed", message: "No result" });
              }
            } catch (err: any) {
              jobStore.updateJob(jobId, { status: "failed", message: err?.message || String(err) });
            }
          }}
        >
          ⚡ Triage
        </span>
      </button>
      {open && (
        <div className="ml-5 border-l-2 border-zinc-100 dark:border-zinc-800 pl-2 pb-2">
          {/* Person triage summary */}
          {personTriage?.summary && (
            <div className="mb-2">
              <button onClick={() => setShowPersonTriage(!showPersonTriage)} className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-amber-500 hover:text-amber-600 transition-colors">
                <Zap size={10} />
                <span className="font-medium">Triage: {formatTimeAgo(new Date(personTriage.created_at))}</span>
                {showPersonTriage ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              </button>
              {showPersonTriage && (
                <div className="mx-2 p-2 rounded bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200/20 dark:border-amber-800/20 text-[11px] text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-line"
                  dangerouslySetInnerHTML={{ __html: personTriage.summary.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>') }}
                />
              )}
            </div>
          )}
          {/* Today card — overdue + due today combined */}
          {(overdue.length > 0 || dueToday.length > 0) ? (
            <div className="mb-2 mx-1 rounded-lg border border-red-200/30 dark:border-red-800/20 bg-red-50/30 dark:bg-red-900/5 p-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <AlertTriangle size={12} className="text-red-500" />
                <span className="text-[11px] font-semibold text-red-600 dark:text-red-400">Today</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-medium">{overdue.length + dueToday.length}</span>
              </div>
              <StatusGroupedTasks tasks={[...overdue, ...dueToday]} onSelectTask={onSelectTask} contextLabels={contextLabels} />
            </div>
          ) : (
            <div className="mb-2 mx-1 rounded-lg border border-emerald-200/20 dark:border-emerald-800/20 bg-emerald-50/30 dark:bg-emerald-900/5 p-2 flex items-center gap-2">
              <CheckCircle2 size={11} className="text-emerald-500" />
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400">All clear for today</span>
            </div>
          )}
          {/* Upcoming */}
          {upcoming.length > 0 && (
            <CollapsibleSection label="Upcoming" count={upcoming.length} icon={Calendar} color="#3B82F6" defaultOpen={false}>
              <StatusGroupedTasks tasks={upcoming} onSelectTask={onSelectTask} contextLabels={contextLabels} />
            </CollapsibleSection>
          )}
          {/* No Due Date */}
          {noDate.length > 0 && (
            <CollapsibleSection label="No Due Date" count={noDate.length} icon={Calendar} color="#9CA3AF" defaultOpen={false}>
              <StatusGroupedTasks tasks={noDate} onSelectTask={onSelectTask} contextLabels={contextLabels} />
            </CollapsibleSection>
          )}
          {active.length === 0 && <div className="px-3 py-2 text-xs text-zinc-400">No active tasks</div>}
          {active.length > 0 && upcoming.length === 0 && dueToday.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-2 mt-1 rounded bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200/30 dark:border-amber-800/20">
              <AlertTriangle size={12} className="text-amber-500 flex-shrink-0" />
              <span className="text-[11px] text-amber-600 dark:text-amber-400">No upcoming work planned — only overdue tasks remain</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TeamTasksView({ allTasks, users, onSelectTask, initiatives, initiativeLinks }: {
  allTasks: TaskWithRelations[];
  users: User[];
  onSelectTask: (id: string) => void;
  initiatives?: Initiative[];
  initiativeLinks?: InitiativeProjectLink[];
}) {
  const queryClient = useQueryClient();
  const { data: teams = [] } = useTeams();
  const claudeRunStore = useClaudeRunStore();
  const [includeNotion, setIncludeNotion] = useState(true);
  const [showStale, setShowStale] = useState(false);
  const [selectedPersonIds, setSelectedPersonIds] = useState<Set<string>>(new Set());

  // Listen for ALL triage Claude stream events (team + individual)
  useEffect(() => {
    const unlisten = listen<{ run_id: string; event_type: string; content: string; metadata?: any }>("claude-stream", (event) => {
      if (!event.payload.run_id.startsWith("triage-")) return;
      const { run_id, event_type, content, metadata } = event.payload;
      if (event_type === "result") {
        claudeRunStore.completeRun(run_id, content, metadata?.is_error || false, metadata?.cost_usd || 0, metadata?.duration_ms || 0);
      } else {
        claudeRunStore.addEvent(run_id, { type: event_type, content, timestamp: Date.now() });
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [teamDefaulted, setTeamDefaulted] = useState(false);
  const [showPersons, setShowPersons] = useState(false);

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
  const [teamTab, setTeamTab] = useState<"strategy" | "people">("strategy");

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

  // Group by person
  const grouped = useMemo(() => {
    const map = new Map<string | null, TaskWithRelations[]>();
    for (const t of tasks) {
      const assignees = t.assignees?.length ? t.assignees : [{ user: null as any }];
      for (const a of assignees) {
        const key = a.user?.id || null;
        const arr = map.get(key) || [];
        arr.push(t);
        map.set(key, arr);
      }
    }
    let entries = [...map.entries()];
    // Filter by selected persons
    if (selectedPersonIds.size > 0) {
      entries = entries.filter(([id]) => id !== null && selectedPersonIds.has(id));
    }
    // Build team order: Analyst → Customer Success → Engineering → Sales → unassigned
    const teamOrder = ["analyst", "customer success", "customer-success", "engineering", "sales"];
    const userTeamRank = new Map<string, number>();
    for (const team of teams) {
      const rank = teamOrder.findIndex(t => team.name.toLowerCase().includes(t) || team.slug?.toLowerCase().includes(t));
      for (const m of team.members) {
        const existing = userTeamRank.get(m.user_id);
        const r = rank === -1 ? 99 : rank;
        if (existing === undefined || r < existing) userTeamRank.set(m.user_id, r);
      }
    }

    // Sort: by team first, then by selected sort within each team
    entries.sort((a, b) => {
      if (a[0] === null) return 1;
      if (b[0] === null) return -1;

      // Primary: team order
      const aTeam = userTeamRank.get(a[0]!) ?? 98;
      const bTeam = userTeamRank.get(b[0]!) ?? 98;
      if (aTeam !== bTeam) return aTeam - bTeam;

      // Secondary: selected sort
      if (sortBy === "overdue") {
        const aOverdue = a[1].filter(t => isOverdue(t.due_date || "")).length;
        const bOverdue = b[1].filter(t => isOverdue(t.due_date || "")).length;
        if (bOverdue !== aOverdue) return bOverdue - aOverdue;
        return b[1].length - a[1].length;
      }
      if (sortBy === "name") {
        const aName = users.find(u => u.id === a[0])?.name || "zzz";
        const bName = users.find(u => u.id === b[0])?.name || "zzz";
        return aName.localeCompare(bName);
      }
      return b[1].length - a[1].length; // tasks
    });
    return entries;
  }, [tasks, selectedPersonIds, sortBy, users, teams]);

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
      <div className="flex-shrink-0 flex items-center gap-4 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50">
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
        <div className="flex-1" />
        <label className="flex items-center gap-1 text-[10px] text-zinc-400 cursor-pointer">
          <input type="checkbox" checked={showStale} onChange={(e) => setShowStale(e.target.checked)} className="rounded border-zinc-300 text-amber-600 focus:ring-amber-500 w-3 h-3" />
          Stale ({staleCount})
        </label>
        <label className="flex items-center gap-1 text-[10px] text-zinc-400 cursor-pointer">
          <input type="checkbox" checked={includeNotion} onChange={(e) => setIncludeNotion(e.target.checked)} className="rounded border-zinc-300 text-teal-600 focus:ring-teal-500 w-3 h-3" />
          Notion
        </label>
      </div>

      {/* Team + Person filter + sort */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border-b border-zinc-100 dark:border-zinc-800/50 flex-wrap">
        <button
          onClick={() => { setSelectedPersonIds(new Set()); setSelectedTeamId(null); }}
          className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors ${
            selectedPersonIds.size === 0 && !selectedTeamId ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-800" : "text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          }`}
        >All</button>
        {teams.map(team => (
          <button
            key={team.id}
            onClick={() => {
              if (selectedTeamId === team.id) {
                setSelectedTeamId(null);
                setSelectedPersonIds(new Set());
              } else {
                setSelectedTeamId(team.id);
                setSelectedPersonIds(new Set(team.members.map(m => m.user_id)));
              }
            }}
            className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors flex items-center gap-1 ${
              selectedTeamId === team.id ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 ring-1 ring-violet-300 dark:ring-violet-700" : "text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            {team.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />}
            {team.name}
            <span className="opacity-50">{team.members.length}</span>
          </button>
        ))}
        {teams.length > 0 && <span className="text-zinc-300 dark:text-zinc-700">|</span>}
        <button
          onClick={() => setShowPersons(!showPersons)}
          className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors flex items-center gap-1"
        >
          {showPersons ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          People
        </button>
        {showPersons ? (
          allPersons.map(([id, name]) => (
            <button
              key={id}
              onClick={() => {
                const next = new Set(selectedPersonIds);
                if (next.has(id)) next.delete(id); else next.add(id);
                setSelectedPersonIds(next);
                setSelectedTeamId(null);
              }}
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors flex items-center gap-1 ${
                selectedPersonIds.has(id) ? "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400" : "text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[8px] font-bold text-zinc-600 dark:text-zinc-400">
                {initials(name)}
              </span>
              {name}
            </button>
          ))
        ) : (
          /* Compact: just avatars */
          allPersons.map(([id, name]) => (
            <button
              key={id}
              onClick={() => {
                const next = new Set(selectedPersonIds);
                if (next.has(id)) next.delete(id); else next.add(id);
                setSelectedPersonIds(next);
                setSelectedTeamId(null);
              }}
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold transition-colors ${
                selectedPersonIds.has(id) ? "bg-teal-500 text-white ring-2 ring-teal-300 dark:ring-teal-700" : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-300 dark:hover:bg-zinc-600"
              }`}
              title={name}
            >
              {initials(name)}
            </button>
          ))
        )}
        <div className="flex-1" />
        <span className="text-[10px] text-zinc-400">Sort:</span>
        {(["overdue", "tasks", "name"] as const).map(s => (
          <button
            key={s}
            onClick={() => setSortBy(s)}
            className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${
              sortBy === s ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-800" : "text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            {s === "overdue" ? "Overdue" : s === "tasks" ? "Tasks" : "Name"}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 flex items-center gap-0 px-4 border-b border-zinc-100 dark:border-zinc-800/50">
        {(["strategy", "people"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setTeamTab(tab)}
            className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
              teamTab === tab
                ? "border-teal-500 text-teal-600 dark:text-teal-400"
                : "border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            }`}
          >
            {tab === "strategy" ? "Team" : "People"}
          </button>
        ))}
      </div>

      {/* Strategy Tab */}
      {teamTab === "strategy" && (
        <div className="flex-1 overflow-y-auto">
          <TriageBanner view="team" viewKey={selectedTeamId ? `team-${teams.find(t => t.id === selectedTeamId)?.slug || selectedTeamId}` : "team-all"} tasks={filteredTasks} />
        </div>
      )}

      {/* People Tab */}
      {teamTab === "people" && (
      <div className="flex-1 overflow-y-auto p-4">
        {/* Needs Attention — tasks missing due date or company */}
        {totalNoDate > 0 && (
          <CollapsibleSection label="Needs Due Date" count={totalNoDate} icon={AlertTriangle} color="#F59E0B" defaultOpen={false} badge="Assign due dates to these tasks">
            <StatusGroupedTasks
              tasks={filteredTasks.filter(t => !t.due_date).slice(0, 50)}
              onSelectTask={onSelectTask}
              contextLabels={contextLabels}
              rowComponent={(t) => <NeedsDueDateRow key={t.id} task={t} onSelect={onSelectTask} contextLabel={contextLabels.get(t.project_id)} onUpdated={() => queryClient.invalidateQueries({ queryKey: ["work"] })} />}
            />
          </CollapsibleSection>
        )}

        {grouped.map(([userId, userTasks]) => {
          const user = userId ? users.find(u => u.id === userId) || null : null;
          return (
            <PersonSection
              key={userId || "unassigned"}
              user={user ? { id: user.id, name: user.name } : null}
              tasks={userTasks}
              onSelectTask={onSelectTask}
              contextLabels={contextLabels}
              defaultOpen={userId !== null && userTasks.some(t => isOverdue(t.due_date || ""))}
            />
          );
        })}
        {grouped.length === 0 && (
          <div className="text-center py-12 text-sm text-zinc-400">No active tasks</div>
        )}
      </div>
      )}
    </div>
  );
}
