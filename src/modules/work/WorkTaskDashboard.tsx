// src/modules/work/WorkTaskDashboard.tsx
// My Tasks and Team Tasks dashboard views

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, Clock, Calendar, CheckCircle2, User as UserIcon, Users } from "lucide-react";
import type { TaskWithRelations, User, Initiative } from "../../lib/work/types";
import { isOverdue } from "../../lib/date";
import { TaskRow, Stat, initials } from "./workViewsShared";
import type { InitiativeProjectLink } from "./workViewsShared";

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

  const myTasks = useMemo(() => {
    if (!currentUserId) return [];
    return allTasks
      .filter(t => t.assignee_id === currentUserId)
      .filter(t => includeNotion || !(t as any).notion_page_id);
  }, [allTasks, currentUserId, includeNotion]);

  // Split into sales (deal) vs non-sales (work) tasks
  const salesTasks = useMemo(() => myTasks.filter(isSalesTask), [myTasks]);
  const workTasks = useMemo(() => myTasks.filter(t => !isSalesTask(t)), [myTasks]);

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
  const activeWork = workTasks.filter(t => t.status?.type !== "completed" && t.status?.type !== "canceled");
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
        <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
          <input type="checkbox" checked={includeNotion} onChange={(e) => setIncludeNotion(e.target.checked)} className="rounded border-zinc-300 text-teal-600 focus:ring-teal-500" />
          Include Notion
        </label>
      </div>

      {/* Task columns: Sales (left) vs Work (right) */}
      <div className="flex-1 overflow-hidden flex">
        {/* Sales column */}
        <div className="w-1/2 overflow-y-auto p-4 border-r border-zinc-100 dark:border-zinc-800/50">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Sales</span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-500">{activeSales.length}</span>
          </div>
          <TaskBuckets tasks={salesTasks} onSelectTask={onSelectTask} contextLabels={contextLabels} showCompleted={recentlyCompletedSales} />
        </div>

        {/* Work column */}
        <div className="w-1/2 overflow-y-auto p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Work</span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-teal-50 dark:bg-teal-900/20 text-teal-600">{activeWork.length}</span>
          </div>
          <TaskBuckets tasks={workTasks} onSelectTask={onSelectTask} contextLabels={contextLabels} showCompleted={recentlyCompletedWork} />
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
