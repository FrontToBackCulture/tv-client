// src/modules/work/WorkTaskDashboard.tsx
// My Tasks and Team Tasks dashboard views

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, Clock, Calendar, CheckCircle2, User as UserIcon, Users, Loader2, Zap, Terminal, X, Target, ArrowRight } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { TaskWithRelations, User, Initiative } from "../../lib/work/types";
import { getTaskIdentifier } from "../../lib/work/types";
import { isOverdue } from "../../lib/date";
import { StatusIcon, PriorityBars } from "./StatusIcon";
import { TaskRow, Stat, initials } from "./workViewsShared";
import type { InitiativeProjectLink } from "./workViewsShared";
import { toast } from "../../stores/toastStore";
import { useJobsStore } from "../../stores/jobsStore";

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
    mutationFn: async ({ model }: { model?: string } = {}) => {
      const result = await invoke<TaskTriageResult>("work_task_triage", {
        model: model ?? "sonnet",
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
  if (t.status?.type === "completed" || t.status?.type === "canceled") return "done";
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
        <div className="ml-2 border-l-2 border-zinc-100 dark:border-zinc-800 pl-2">
          {tasks.map(t => <TaskRow key={t.id} task={t} onSelect={onSelectTask} contextLabel={contextLabels?.get(t.project_id)} />)}
        </div>
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

function DoTodayRow({ task, onSelect, contextLabel, onDeferred, onReject }: {
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
          className="text-xs text-zinc-400 tabular-nums flex-shrink-0 w-14 cursor-pointer hover:text-teal-500 dark:hover:text-teal-400 transition-colors"
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
      {/* Action row — defer or keep */}
      <div className="flex items-center gap-2 px-3 pb-1.5 text-[10px]">
        {reason && <span className="text-zinc-500 dark:text-zinc-400 flex-1 truncate">{reason}</span>}
        {!reason && <span className="flex-1" />}
        <button
          onClick={handleDefer}
          disabled={deferring}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20 font-medium transition-colors flex-shrink-0"
        >
          <ArrowRight size={10} />
          {deferring ? "Moving..." : `Defer to ${formatShortDate(deferDate)}`}
        </button>
        {onReject && (
          <button
            onClick={onReject}
            className="px-2 py-0.5 rounded text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-medium transition-colors flex-shrink-0"
          >
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
  const active = tasks.filter(t => t.status?.type !== "completed" && t.status?.type !== "canceled");
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

// ─── MyTasksView ──────────────────────────────────────────────────────────

export function MyTasksView({ allTasks, users: _users, currentUserId, onSelectTask, initiatives, initiativeLinks }: {
  allTasks: TaskWithRelations[];
  users: User[];
  currentUserId: string | null;
  onSelectTask: (id: string) => void;
  initiatives?: Initiative[];
  initiativeLinks?: InitiativeProjectLink[];
}) {
  const [includeNotion, setIncludeNotion] = useState(false);
  const [showTriageLog, setShowTriageLog] = useState(false);
  const triageMutation = useTaskTriage();
  useTriageEnrichment();
  const queryClient = useQueryClient();
  const { data: priorities } = useQuery({
    queryKey: ["work", "priorities"],
    queryFn: () => invoke<{ task_ids?: string[]; reasons?: string[]; last_confirmed?: string }>("work_get_priorities"),
    staleTime: 60_000,
  });
  const [reprioritising, setReprioritising] = useState(false);
  const handleReprioritise = useCallback(async () => {
    setReprioritising(true);
    try {
      await invoke("work_reprioritise");
      await queryClient.invalidateQueries({ queryKey: ["work", "priorities"] });
      toast.success("Priorities updated");
    } catch (err) {
      toast.error(`Reprioritise failed: ${err}`);
    } finally {
      setReprioritising(false);
    }
  }, [queryClient]);
  const { logs: triageLogs, phase: triagePhase, clearLogs } = useTriageProgress(triageMutation.isPending || showTriageLog);
  const logEndRef = useRef<HTMLDivElement>(null);
  const { addJob, updateJob } = useJobsStore();
  const triageJobId = useRef<string | null>(null);

  // Auto-scroll log to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [triageLogs.length]);

  const handleTriage = useCallback(() => {
    const jobId = `triage-${Date.now()}`;
    triageJobId.current = jobId;
    clearLogs();
    setShowTriageLog(true);
    addJob({ id: jobId, name: "Task Triage", status: "running", message: "Scoring tasks..." });
    const toastId = toast.loading("Triaging tasks...");

    triageMutation.mutate(
      { model: "sonnet" },
      {
        onSuccess: (result) => {
          if (result.success && result.proposals.length > 0) {
            updateJob(jobId, { status: "completed", message: `${result.proposals.length} tasks scored` });
            toast.update(toastId, { type: "success", message: `${result.proposals.length} tasks scored and prioritized`, duration: 4000 });
            // Scores are written to DB by the backend — refresh task data
            queryClient.invalidateQueries({ queryKey: ["work"] });
            setShowTriageLog(false);
          } else {
            updateJob(jobId, { status: "failed", message: result.error || "No proposals" });
            toast.update(toastId, { type: "error", message: result.error || "Triage produced no proposals", duration: 5000 });
          }
        },
        onError: (err) => {
          updateJob(jobId, { status: "failed", message: String(err) });
          toast.update(toastId, { type: "error", message: `Triage failed: ${err}`, duration: 5000 });
        },
      }
    );
  }, [triageMutation, addJob, updateJob, clearLogs]);


  // visibleProposals is computed after salesTasks below

  const myTasks = useMemo(() => {
    if (!currentUserId) return [];
    return allTasks
      .filter(t => (t.assignees || []).some(a => a.user?.id === currentUserId))
      .filter(t => includeNotion || !(t as any).notion_page_id);
  }, [allTasks, currentUserId, includeNotion]);

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


  // TODAY task sequence — direct ID lookup, no fuzzy matching
  const todayTaskSequence = useMemo(() => {
    if (!priorities?.task_ids?.length) return [];
    const taskMap = new Map(myTasks.map(t => [t.id, t]));
    return priorities.task_ids
      .map((id, i) => ({
        task: taskMap.get(id) || null,
        reason: priorities.reasons?.[i] || null,
      }))
      .filter(item => item.task && item.task.status?.type !== "completed" && item.task.status?.type !== "canceled");
  }, [priorities?.task_ids, priorities?.reasons, myTasks]);

  // Suggested Defer — overdue + due today tasks, sorted by score
  const [rejectedDeferIds, setRejectedDeferIds] = useState<Set<string>>(new Set());
  const suggestedDeferTasks = useMemo(() => {
    return myTasks
      .filter(t => t.status?.type !== "completed" && t.status?.type !== "canceled")
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
      t.status?.type !== "completed" && t.status?.type !== "canceled" && !t.due_date
    );
  }, [myTasks]);

  const activeTasks = myTasks.filter(t => t.status?.type !== "completed" && t.status?.type !== "canceled");
  const activeSales = salesTasks.filter(t => t.status?.type !== "completed" && t.status?.type !== "canceled");

  // (triage summary shown via proposals Focus panel)
  const activeWork = workTasks.filter(t => t.status?.type !== "completed" && t.status?.type !== "canceled");

  // (triage summary is now shown via proposals panel)
  const allBuckets = useMemo(() => bucketTasks(myTasks), [myTasks]);
  const recentlyCompleted = allBuckets.done.filter(t => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return t.updated_at && new Date(t.updated_at).getTime() > weekAgo;
  });
  const recentlyCompletedSales = recentlyCompleted.filter(isSalesTask);
  const recentlyCompletedWork = recentlyCompleted.filter(t => !isSalesTask(t));

  if (!currentUserId) {
    return <div className="flex items-center justify-center h-full text-sm text-zinc-400">No user profile found</div>;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Stats */}
      <div className="flex-shrink-0 grid grid-cols-4 gap-3 p-4 border-b border-zinc-100 dark:border-zinc-800/50">
        <Stat label="Active Tasks" value={activeTasks.length} icon={UserIcon} color="#0D7680" />
        <Stat label="Overdue" value={allBuckets.overdue.length} icon={AlertTriangle} color={allBuckets.overdue.length > 0 ? "#EF4444" : "#9CA3AF"} />
        <Stat label="Due Today" value={allBuckets.today.length} icon={Clock} color={allBuckets.today.length > 0 ? "#F59E0B" : "#9CA3AF"} />
        <Stat label="Done This Week" value={recentlyCompleted.length} icon={CheckCircle2} color="#10B981" />
      </div>

      {/* Today's Priorities */}
      <div className="flex-shrink-0 px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800/50 bg-gradient-to-r from-emerald-50/50 to-transparent dark:from-emerald-900/10">
        <div className="flex items-start gap-2">
          <Target size={13} className="text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Today</span>
              {priorities?.last_confirmed && (
                <span className="text-[10px] text-zinc-400" title="Last confirmed">
                  confirmed {priorities.last_confirmed}
                </span>
              )}
              <button
                onClick={handleReprioritise}
                disabled={reprioritising}
                className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors ${
                  reprioritising
                    ? "text-amber-500 bg-amber-50 dark:bg-amber-900/20 cursor-wait"
                    : "text-emerald-600 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
                }`}
                title="Re-assess today's priorities using AI"
              >
                {reprioritising ? "Thinking..." : "Reprioritise"}
              </button>
            </div>
            {todayTaskSequence.length > 0 ? (
              <div className="flex flex-col">
                {todayTaskSequence.map((item, i) => (
                  <div key={item.task!.id} className="border-b border-emerald-100/50 dark:border-emerald-900/20 last:border-b-0">
                    <div className="flex items-center gap-2 py-0.5">
                      <span className="text-emerald-500 font-medium text-xs flex-shrink-0 w-4 text-right">{i + 1}.</span>
                      <TaskRow task={item.task!} onSelect={onSelectTask} contextLabel={contextLabels.get(item.task!.project_id)} />
                    </div>
                    {(item.reason || item.task!.triage_reason) && (
                      <div className="pl-7 pb-1.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                        {item.reason || item.task!.triage_reason}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-zinc-400 py-1">Click Reprioritise to set today's tasks</div>
            )}
          </div>
        </div>
      </div>

      {/* Toolbar — Triage + Include Notion, no header */}
      <div className="flex items-center justify-end px-4 py-1.5 border-b border-zinc-100 dark:border-zinc-800/50">
        <div className="flex items-center gap-3">
          <button
            title={triageMutation.isPending ? "Triaging tasks... (Claude is running)" : "Triage tasks — AI-score and prioritize"}
            onClick={triageMutation.isPending ? undefined : handleTriage}
            disabled={triageMutation.isPending}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              triageMutation.isPending
                ? "text-amber-500 bg-amber-50 dark:bg-amber-900/20 cursor-wait"
                : "text-zinc-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:text-amber-400 dark:hover:bg-amber-900/20"
            }`}
          >
            {triageMutation.isPending
              ? <Loader2 size={14} className="animate-spin" />
              : <Zap size={14} />
            }
            {triageMutation.isPending ? "Triaging..." : "Triage"}
          </button>
          <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
            <input type="checkbox" checked={includeNotion} onChange={(e) => setIncludeNotion(e.target.checked)} className="rounded border-zinc-300 text-teal-600 focus:ring-teal-500" />
            Include Notion
          </label>
        </div>
      </div>

      {/* Triage Log Panel */}
      {showTriageLog && triageLogs.length > 0 && (
        <div className="flex-shrink-0 border-b border-zinc-100 dark:border-zinc-800/50">
          <div className="flex items-center justify-between px-4 py-1.5 bg-zinc-50 dark:bg-zinc-900/50">
            <div className="flex items-center gap-2">
              <Terminal size={12} className="text-zinc-400" />
              <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Triage Log</span>
              {triageMutation.isPending && (
                <Loader2 size={10} className="animate-spin text-amber-500" />
              )}
              {triagePhase === "complete" && (
                <span className="text-[10px] text-emerald-500 font-medium">Done</span>
              )}
              {triagePhase === "error" && (
                <span className="text-[10px] text-red-500 font-medium">Failed</span>
              )}
            </div>
            <button
              onClick={() => { setShowTriageLog(false); clearLogs(); }}
              className="p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            >
              <X size={12} />
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto px-4 py-2 font-mono text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400 bg-zinc-50/50 dark:bg-zinc-900/30">
            {triageLogs.map((line, i) => (
              <div key={i} className="py-0.5">{line}</div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {/* Main content: single scrollable column */}
      <div className="flex-1 overflow-y-auto p-4">

        {/* Suggested Defer */}
        {suggestedDeferTasks.length > 0 && (
          <CollapsibleSection label="Suggested Defer" count={suggestedDeferTasks.length} icon={Calendar} color="#3B82F6" badge="Defer or keep each task's due date">
            <div className="ml-2 border-l-2 border-blue-100 dark:border-blue-900/30 pl-2">
              {suggestedDeferTasks.map(t => (
                <DoTodayRow
                  key={t.id}
                  task={t}
                  onSelect={onSelectTask}
                  contextLabel={contextLabels.get(t.project_id)}
                  onDeferred={() => { queryClient.invalidateQueries({ queryKey: ["work"] }); queryClient.refetchQueries({ queryKey: ["work", "tasks"] }); }}
                  onReject={() => setRejectedDeferIds(prev => new Set(prev).add(t.id))}
                />
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* No Due Date */}
        {noDueDateTasks.length > 0 && (
          <CollapsibleSection label="No Due Date" count={noDueDateTasks.length} icon={Calendar} color="#9CA3AF" defaultOpen={false}>
            <div className="ml-2 border-l-2 border-zinc-100 dark:border-zinc-800 pl-2">
              {noDueDateTasks.map(t => <TaskRow key={t.id} task={t} onSelect={onSelectTask} contextLabel={contextLabels.get(t.project_id)} />)}
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
      </div>
    </div>
  );
}

// ─── TeamTasksView ────────────────────────────────────────────────────────

function AssigneeSection({ user, tasks, onSelectTask }: {
  user: { id: string; name: string } | null;
  tasks: TaskWithRelations[];
  onSelectTask: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const active = tasks.filter(t => t.status?.type !== "completed" && t.status?.type !== "canceled");
  const overdue = active.filter(t => isOverdue(t.due_date));
  const inProgress = active.filter(t => t.status?.type === "started" || t.status?.type === "review");
  const todo = active.filter(t => t.status?.type === "unstarted" || t.status?.type === "backlog");

  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors rounded-lg"
      >
        {open ? <ChevronDown size={12} className="text-zinc-400" /> : <ChevronRight size={12} className="text-zinc-400" />}
        <div className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-xs font-medium text-zinc-600 dark:text-zinc-400">
          {user ? initials(user.name) : "?"}
        </div>
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{user?.name || "Unassigned"}</span>
        <span className="text-xs text-zinc-400 ml-auto">{active.length} active</span>
        {/* Status pills */}
        <div className="flex items-center gap-1">
          {overdue.length > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 dark:bg-red-900/20 font-medium">{overdue.length} overdue</span>}
          {inProgress.length > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 dark:bg-amber-900/20 font-medium">{inProgress.length} active</span>}
          {todo.length > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-500 dark:bg-blue-900/20 font-medium">{todo.length} todo</span>}
        </div>
      </button>
      {open && (
        <div className="ml-5 border-l-2 border-zinc-100 dark:border-zinc-800 pl-2">
          {active.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99) || new Date(a.due_date || "9999").getTime() - new Date(b.due_date || "9999").getTime()).map(t => (
            <TaskRow key={t.id} task={t} onSelect={onSelectTask} />
          ))}
        </div>
      )}
    </div>
  );
}

export function TeamTasksView({ allTasks, users, onSelectTask }: {
  allTasks: TaskWithRelations[];
  users: User[];
  onSelectTask: (id: string) => void;
}) {
  const [includeNotion, setIncludeNotion] = useState(false);

  const tasks = useMemo(() => {
    return allTasks
      .filter(t => t.status?.type !== "completed" && t.status?.type !== "canceled")
      .filter(t => includeNotion || !(t as any).notion_page_id);
  }, [allTasks, includeNotion]);

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
    // Sort by task count descending
    return [...map.entries()].sort((a, b) => {
      if (a[0] === null) return 1; // unassigned last
      if (b[0] === null) return -1;
      return b[1].length - a[1].length;
    });
  }, [tasks]);

  const totalActive = tasks.length;
  const totalOverdue = tasks.filter(t => isOverdue(t.due_date)).length;
  const assigneeCount = grouped.filter(([id]) => id !== null).length;

  return (
    <div className="h-full flex flex-col">
      {/* Stats */}
      <div className="flex-shrink-0 grid grid-cols-3 gap-3 p-4 border-b border-zinc-100 dark:border-zinc-800/50">
        <Stat label="Team Members" value={assigneeCount} icon={Users} color="#0D7680" />
        <Stat label="Active Tasks" value={totalActive} icon={CheckCircle2} color="#3B82F6" />
        <Stat label="Overdue" value={totalOverdue} icon={AlertTriangle} color={totalOverdue > 0 ? "#EF4444" : "#9CA3AF"} />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50">
        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Team Tasks</span>
        <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
          <input type="checkbox" checked={includeNotion} onChange={(e) => setIncludeNotion(e.target.checked)} className="rounded border-zinc-300 text-teal-600 focus:ring-teal-500" />
          Include Notion
        </label>
      </div>

      {/* Assignee sections */}
      <div className="flex-1 overflow-y-auto p-4">
        {grouped.map(([userId, userTasks]) => {
          const user = userId ? users.find(u => u.id === userId) || null : null;
          return <AssigneeSection key={userId || "unassigned"} user={user ? { id: user.id, name: user.name } : null} tasks={userTasks} onSelectTask={onSelectTask} />;
        })}
        {grouped.length === 0 && (
          <div className="text-center py-12 text-sm text-zinc-400">No active tasks</div>
        )}
      </div>
    </div>
  );
}
