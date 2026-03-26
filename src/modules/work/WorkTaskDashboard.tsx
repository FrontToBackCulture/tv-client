// src/modules/work/WorkTaskDashboard.tsx
// My Tasks and Team Tasks dashboard views

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, Clock, Calendar, CheckCircle2, User as UserIcon, Users, Loader2, Zap, Terminal, X, Check } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TaskWithRelations, User, Initiative } from "../../lib/work/types";
import { isOverdue } from "../../lib/date";
import { TaskRow, Stat, initials } from "./workViewsShared";
import type { InitiativeProjectLink } from "./workViewsShared";
import { toast } from "../../stores/toastStore";
import { useJobsStore } from "../../stores/jobsStore";

// ─── Task Triage Types & Hooks ───────────────────────────────────────────

interface TriageProposal {
  task_id: string;
  title: string;
  project: string;
  item_type: "task" | "deal";
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

// ─── TaskBuckets (renders overdue/today/upcoming/no_date for a set of tasks) ─

function TaskBuckets({ tasks, onSelectTask, contextLabels, showCompleted }: {
  tasks: TaskWithRelations[];
  onSelectTask: (id: string) => void;
  contextLabels?: Map<string, string>;
  showCompleted?: TaskWithRelations[];
}) {
  const buckets = useMemo(() => bucketTasks(tasks), [tasks]);
  const active = tasks.filter(t => t.status?.type !== "completed" && t.status?.type !== "canceled");

  return (
    <>
      <TaskBucket label="Overdue" tasks={buckets.overdue} icon={AlertTriangle} color="#EF4444" onSelectTask={onSelectTask} contextLabels={contextLabels} />
      <TaskBucket label="Due Today" tasks={buckets.today} icon={Clock} color="#F59E0B" onSelectTask={onSelectTask} contextLabels={contextLabels} />
      <TaskBucket label="Upcoming" tasks={buckets.upcoming} icon={Calendar} color="#3B82F6" onSelectTask={onSelectTask} contextLabels={contextLabels} />
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

export function MyTasksView({ allTasks, users, currentUserId, onSelectTask, initiatives, initiativeLinks }: {
  allTasks: TaskWithRelations[];
  users: User[];
  currentUserId: string | null;
  onSelectTask: (id: string) => void;
  initiatives?: Initiative[];
  initiativeLinks?: InitiativeProjectLink[];
}) {
  const [includeNotion, setIncludeNotion] = useState(false);
  const [showTriageLog, setShowTriageLog] = useState(false);
  const [proposals, setProposals] = useState<TriageProposal[]>([]);
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [focusFilter, setFocusFilter] = useState<string | null>(null); // null = all, or "do_now" / "do_this_week" / "defer" / "deal"
  const triageMutation = useTaskTriage();
  const applyMutation = useMutation({
    mutationFn: async (p: TriageProposal) => invoke("work_apply_triage", {
      taskId: p.task_id, triageScore: p.triage_score, triageAction: p.triage_action, triageReason: p.triage_reason,
    }),
  });
  useTriageEnrichment();
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
    setProposals([]);
    addJob({ id: jobId, name: "Task Triage", status: "running", message: "Scoring tasks..." });
    const toastId = toast.loading("Triaging tasks...");

    triageMutation.mutate(
      { model: "sonnet" },
      {
        onSuccess: (result) => {
          if (result.success && result.proposals.length > 0) {
            updateJob(jobId, { status: "completed", message: `${result.proposals.length} proposals ready` });
            toast.update(toastId, { type: "success", message: `${result.proposals.length} triage proposals ready for review`, duration: 4000 });
            setProposals(result.proposals);
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

  const handleAccept = useCallback((p: TriageProposal) => {
    if (p.item_type === "task") {
      applyMutation.mutate(p);
    }
    setAcceptedIds(prev => new Set(prev).add(p.task_id));
  }, [applyMutation]);

  const handleDismiss = useCallback((id: string) => {
    setDismissedIds(prev => new Set(prev).add(id));
  }, []);

  const handleAcceptAll = useCallback(() => {
    const pending = proposals.filter(p => !acceptedIds.has(p.task_id) && !dismissedIds.has(p.task_id));
    pending.forEach(p => handleAccept(p));
  }, [proposals, acceptedIds, dismissedIds, handleAccept]);

  // visibleProposals is computed after salesTasks below

  const myTasks = useMemo(() => {
    if (!currentUserId) return [];
    return allTasks
      .filter(t => t.assignee_id === currentUserId)
      .filter(t => includeNotion || !(t as any).notion_page_id);
  }, [allTasks, currentUserId, includeNotion]);

  // Split into sales (deal) vs non-sales (work) tasks
  const salesTasks = useMemo(() => myTasks.filter(isSalesTask), [myTasks]);
  const workTasks = useMemo(() => myTasks.filter(t => !isSalesTask(t)), [myTasks]);

  // Filter proposals for Focus panel
  const salesProjectNames = useMemo(() => new Set(
    salesTasks.map(t => t.project?.name).filter(Boolean)
  ), [salesTasks]);

  const visibleProposals = useMemo(() =>
    proposals.filter(p => !dismissedIds.has(p.task_id)).filter(p => {
      if (!focusFilter) return true;
      if (focusFilter === "deal") return p.item_type === "deal";
      if (focusFilter === "sales") return p.item_type === "deal" || salesProjectNames.has(p.project);
      if (focusFilter === "work") return p.item_type === "task" && !salesProjectNames.has(p.project);
      return p.triage_action === focusFilter;
    }),
  [proposals, dismissedIds, focusFilter, salesProjectNames]);

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

  const currentUser = users.find(u => u.id === currentUserId);

  return (
    <div className="h-full flex flex-col">
      {/* Stats */}
      <div className="flex-shrink-0 grid grid-cols-4 gap-3 p-4 border-b border-zinc-100 dark:border-zinc-800/50">
        <Stat label="Active Tasks" value={activeTasks.length} icon={UserIcon} color="#0D7680" />
        <Stat label="Overdue" value={allBuckets.overdue.length} icon={AlertTriangle} color={allBuckets.overdue.length > 0 ? "#EF4444" : "#9CA3AF"} />
        <Stat label="Due Today" value={allBuckets.today.length} icon={Clock} color={allBuckets.today.length > 0 ? "#F59E0B" : "#9CA3AF"} />
        <Stat label="Done This Week" value={recentlyCompleted.length} icon={CheckCircle2} color="#10B981" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50">
        <div className="flex items-center gap-2">
          {currentUser && (
            <div className="w-6 h-6 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center text-xs font-medium text-teal-700 dark:text-teal-400">
              {initials(currentUser.name)}
            </div>
          )}
          <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{currentUser?.name || "My"} Tasks</span>
        </div>
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

      {/* Main content: Focus (left) + Sales/Work (right) when triage active, otherwise Sales/Work full width */}
      <div className="flex-1 overflow-hidden flex">

        {/* Focus Panel — left column when proposals exist */}
        {proposals.length > 0 && (
          <div className="w-1/2 flex flex-col border-r border-zinc-100 dark:border-zinc-800/50">
            {/* Focus header with clickable filter pills */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 dark:border-zinc-800/50 bg-gradient-to-r from-amber-50/50 to-transparent dark:from-amber-900/10">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Zap size={11} className="text-amber-500" />
                <button onClick={() => setFocusFilter(null)}
                  className={`text-[9px] px-1.5 py-0.5 rounded font-semibold transition-colors ${!focusFilter ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-800" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}>
                  All {proposals.filter(p => !dismissedIds.has(p.task_id)).length}
                </button>
                {(["do_now", "do_this_week", "defer"] as const).map(action => {
                  const count = proposals.filter(p => !dismissedIds.has(p.task_id) && p.triage_action === action).length;
                  if (count === 0) return null;
                  const s = ACTION_STYLES[action];
                  return (
                    <button key={action} onClick={() => setFocusFilter(focusFilter === action ? null : action)}
                      className={`text-[9px] px-1.5 py-0.5 rounded font-semibold transition-colors ${focusFilter === action ? `${s.bg} ${s.text} ring-1 ring-current` : `${s.bg} ${s.text} opacity-70 hover:opacity-100`}`}>
                      {s.label} {count}
                    </button>
                  );
                })}
                {proposals.some(p => p.item_type === "deal" && !dismissedIds.has(p.task_id)) && (
                  <button onClick={() => setFocusFilter(focusFilter === "deal" ? null : "deal")}
                    className={`text-[9px] px-1.5 py-0.5 rounded font-semibold transition-colors ${focusFilter === "deal" ? "bg-purple-100 text-purple-600 ring-1 ring-current dark:bg-purple-900/30 dark:text-purple-400" : "bg-purple-100 text-purple-600 opacity-70 hover:opacity-100 dark:bg-purple-900/30 dark:text-purple-400"}`}>
                    Deals {proposals.filter(p => p.item_type === "deal" && !dismissedIds.has(p.task_id)).length}
                  </button>
                )}
                <span className="text-zinc-300 dark:text-zinc-700">|</span>
                <button onClick={() => setFocusFilter(focusFilter === "sales" ? null : "sales")}
                  className={`text-[9px] px-1.5 py-0.5 rounded font-semibold transition-colors ${focusFilter === "sales" ? "bg-blue-100 text-blue-600 ring-1 ring-current dark:bg-blue-900/30 dark:text-blue-400" : "text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}>
                  Sales
                </button>
                <button onClick={() => setFocusFilter(focusFilter === "work" ? null : "work")}
                  className={`text-[9px] px-1.5 py-0.5 rounded font-semibold transition-colors ${focusFilter === "work" ? "bg-teal-100 text-teal-600 ring-1 ring-current dark:bg-teal-900/30 dark:text-teal-400" : "text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}>
                  Work
                </button>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={handleAcceptAll} className="text-[9px] px-1.5 py-0.5 rounded font-medium text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20 transition-colors">
                  Accept All
                </button>
                <button onClick={() => { setProposals([]); setFocusFilter(null); }} className="p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 transition-colors">
                  <X size={10} />
                </button>
              </div>
            </div>

            {/* Triage Log (collapsed into Focus panel) */}
            {showTriageLog && triageLogs.length > 0 && (
              <div className="px-3 py-1.5 bg-zinc-50/50 dark:bg-zinc-900/30 border-b border-zinc-100 dark:border-zinc-800/50 max-h-20 overflow-y-auto">
                <div className="font-mono text-[10px] text-zinc-400">
                  {triageLogs.slice(-3).map((line, i) => <div key={i}>{line}</div>)}
                  <div ref={logEndRef} />
                </div>
              </div>
            )}

            {/* Proposal list */}
            <div className="flex-1 overflow-y-auto">
              {visibleProposals.map((p) => {
                const accepted = acceptedIds.has(p.task_id);
                const style = ACTION_STYLES[p.triage_action] || ACTION_STYLES.defer;
                const isOverdue = p.days_overdue != null && p.days_overdue > 0;
                const isDeal = p.item_type === "deal";
                return (
                  <div key={p.task_id} className={`group border-b border-zinc-100 dark:border-zinc-800/30 px-3 py-2.5 ${accepted ? "opacity-30" : "hover:bg-zinc-50/80 dark:hover:bg-zinc-800/20"} transition-colors`}>
                    {/* Row 1: badge + title + accept/dismiss */}
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${style.bg} ${style.text}`}>
                        {style.label} {p.triage_score}
                      </span>
                      {isDeal && <span className="text-[8px] px-1 py-0.5 rounded bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 font-bold flex-shrink-0">DEAL</span>}
                      <span className="text-xs text-zinc-800 dark:text-zinc-200 font-medium flex-1 truncate cursor-pointer" onClick={() => !isDeal && onSelectTask(p.task_id)}>
                        {p.title}
                      </span>
                      {!accepted ? (
                        <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleAccept(p)} title="Accept" className="p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-zinc-400 hover:text-emerald-600 transition-colors">
                            <Check size={12} />
                          </button>
                          <button onClick={() => handleDismiss(p.task_id)} title="Dismiss" className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-600 transition-colors">
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <Check size={12} className="text-emerald-500 flex-shrink-0" />
                      )}
                    </div>
                    {/* Row 2: project + structured metadata */}
                    <div className="flex items-center gap-2 mt-1 text-[10px]">
                      <span className="text-zinc-400 truncate">{p.project}</span>
                      {p.due_date && (
                        <span className={isOverdue ? "text-red-500 font-medium" : "text-zinc-400"}>
                          Due: {p.due_date}{isOverdue ? ` (${p.days_overdue}d overdue)` : ""}
                        </span>
                      )}
                      {isDeal && p.deal_stage && (
                        <span className="text-purple-500">Stage: {p.deal_stage}</span>
                      )}
                      {isDeal && p.deal_value != null && p.deal_value > 0 && (
                        <span className="text-zinc-500">${(p.deal_value / 1000).toFixed(0)}K</span>
                      )}
                      {p.days_stale != null && (
                        <span className={p.days_stale > 14 ? "text-red-500 font-medium" : p.days_stale > 7 ? "text-amber-500" : "text-zinc-400"}>
                          {p.days_stale}d stale
                        </span>
                      )}
                    </div>
                    {/* Row 3: reason + suggested due date */}
                    <div className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                      {p.triage_reason}
                      {p.suggested_due_date && (
                        <span className="ml-2 text-blue-500 font-medium">Move to: {p.suggested_due_date}</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {visibleProposals.length === 0 && (
                <div className="text-center py-8 text-xs text-zinc-400">No items match this filter</div>
              )}
            </div>
          </div>
        )}

        {/* Sales + Work: side-by-side normally, stacked when Focus is open */}
        <div className={`${proposals.length > 0 ? "w-1/2 flex flex-col" : "w-full flex"} overflow-hidden`}>
          {/* Sales */}
          <div className={`${proposals.length > 0 ? "flex-1" : "w-1/2"} overflow-y-auto p-4 border-r border-zinc-100 dark:border-zinc-800/50 ${proposals.length > 0 ? "border-b" : ""}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Sales</span>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-500">{activeSales.length}</span>
            </div>
            <TaskBuckets tasks={salesTasks} onSelectTask={onSelectTask} contextLabels={contextLabels} showCompleted={recentlyCompletedSales} />
          </div>
          {/* Work */}
          <div className={`${proposals.length > 0 ? "flex-1" : "w-1/2"} overflow-y-auto p-4`}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Work</span>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-teal-50 dark:bg-teal-900/20 text-teal-600">{activeWork.length}</span>
            </div>
            <TaskBuckets tasks={workTasks} onSelectTask={onSelectTask} contextLabels={contextLabels} showCompleted={recentlyCompletedWork} />
          </div>
        </div>
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
      const key = t.assignee_id || null;
      const arr = map.get(key) || [];
      arr.push(t);
      map.set(key, arr);
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
