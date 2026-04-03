// Milestone-grouped task table: collapsible sections per milestone with progress
import { useState } from "react";
import {
  ChevronDown, ChevronRight, CheckCircle2, Circle,
  Milestone as MilestoneIcon, Trash2,
} from "lucide-react";
import { cn } from "../../lib/cn";
import {
  type StatusType, PriorityLabels, PriorityColors, Priority, getTaskIdentifier,
  type MilestoneWithProgress, type TaskWithRelations, type TaskStatus, type User,
} from "../../lib/work/types";

const STATUS_TYPE_COLORS: Record<StatusType, string> = {
  todo: "#9CA3AF", in_progress: "#F59E0B", complete: "#10B981",
};
const STATUS_TYPE_LABELS: Record<StatusType, string> = {
  todo: "To-do", in_progress: "In Progress", complete: "Complete",
};

type SortCol = "id" | "title" | "priority" | "assignee" | "milestone" | "due_date" | null;

interface Props {
  milestones: MilestoneWithProgress[];
  tasks: TaskWithRelations[];
  taskStatuses: TaskStatus[];
  taskUsers: User[];
  taskDetailId: string | null;
  onSelectTask: (id: string) => void;
  onContextMenu: (taskId: string, x: number, y: number) => void;
  onUpdateTask: (id: string, updates: Record<string, unknown>, assignee_ids?: string[]) => void;
  onDeleteMilestone?: (id: string) => void;
}

function sortTasks(tasks: TaskWithRelations[], col: SortCol, dir: "asc" | "desc"): TaskWithRelations[] {
  if (!col) {
    // Default sort: status order, then task number
    const order: Record<string, number> = { in_progress: 0, todo: 1, complete: 2 };
    return [...tasks].sort((a, b) => {
      const statusDiff = (order[a.status?.type || ""] ?? 5) - (order[b.status?.type || ""] ?? 5);
      if (statusDiff !== 0) return statusDiff;
      return (a.task_number ?? 0) - (b.task_number ?? 0);
    });
  }
  const d = dir === "asc" ? 1 : -1;
  return [...tasks].sort((a, b) => {
    let cmp = 0;
    switch (col) {
      case "id": cmp = (a.task_number ?? 0) - (b.task_number ?? 0); break;
      case "title": cmp = (a.title || "").localeCompare(b.title || ""); break;
      case "priority": cmp = (a.priority ?? 99) - (b.priority ?? 99); break;
      case "assignee": cmp = (a.assignees?.[0]?.user?.name || "").localeCompare(b.assignees?.[0]?.user?.name || ""); break;
      case "milestone": cmp = (a.milestone_id || "").localeCompare(b.milestone_id || ""); break;
      case "due_date": cmp = (a.due_date || "9999").localeCompare(b.due_date || "9999"); break;
    }
    return cmp !== 0 ? cmp * d : (a.task_number ?? 0) - (b.task_number ?? 0);
  });
}

export function MilestoneTaskGroups({
  milestones, tasks, taskStatuses, taskUsers,
  taskDetailId, onSelectTask, onContextMenu, onUpdateTask, onDeleteMilestone,
}: Props) {
  const currentMilestoneId = milestones.find(m => m.completedCount < m.taskCount)?.id ?? milestones[0]?.id ?? null;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const m of milestones) init[m.id] = m.id !== currentMilestoneId;
    return init;
  });
  const toggle = (id: string) => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));

  const [sortCol, setSortCol] = useState<SortCol>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const SortIndicator = ({ col }: { col: SortCol }) =>
    sortCol === col ? <span className="ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span> : null;

  const thClass = "text-left px-2 py-1.5 font-medium text-zinc-400 cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 select-none text-[11px]";

  // Group tasks by milestone_id
  const tasksByMilestone = new Map<string | null, TaskWithRelations[]>();
  for (const t of tasks) {
    const key = t.milestone_id ?? null;
    const g = tasksByMilestone.get(key) ?? [];
    g.push(t);
    tasksByMilestone.set(key, g);
  }
  const unassigned = tasksByMilestone.get(null) ?? [];

  const renderHeader = () => (
    <thead>
      <tr className="border-b border-zinc-100 dark:border-zinc-800">
        <th style={{ width: 36 }} />
        <th className={thClass} style={{ width: 72 }} onClick={() => handleSort("id")}>ID<SortIndicator col="id" /></th>
        <th className={thClass} onClick={() => handleSort("title")}>Title<SortIndicator col="title" /></th>
        <th className={thClass} style={{ width: 96 }} onClick={() => handleSort("priority")}>Priority<SortIndicator col="priority" /></th>
        <th className={thClass} style={{ width: 100 }} onClick={() => handleSort("assignee")}>Assignee<SortIndicator col="assignee" /></th>
        <th className={thClass} style={{ width: 120 }} onClick={() => handleSort("milestone")}>Milestone<SortIndicator col="milestone" /></th>
        <th className={thClass} style={{ width: 112 }} onClick={() => handleSort("due_date")}>Due Date<SortIndicator col="due_date" /></th>
      </tr>
    </thead>
  );

  const renderRow = (task: TaskWithRelations) => {
    const st = (task.status?.type as StatusType) ?? "todo";
    const sc = STATUS_TYPE_COLORS[st] || "#6B7280";
    const identifier = getTaskIdentifier(task);
    const pc = PriorityColors[task.priority as Priority] ?? "#6B7280";
    return (
      <tr
        key={task.id}
        onClick={() => onSelectTask(task.id)}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu(task.id, e.clientX, e.clientY); }}
        className={cn(
          "border-b border-zinc-100 dark:border-zinc-800 cursor-pointer transition-colors group",
          taskDetailId === task.id ? "bg-teal-50/50 dark:bg-teal-950/20" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/30",
        )}
      >
        <td className="px-3 py-1.5 relative" style={{ width: 36 }} onClick={(e) => e.stopPropagation()}>
          <div className="relative w-5 h-5">
            <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {st === "complete" ? <CheckCircle2 size={14} style={{ color: sc }} />
                : st === "in_progress" ? (
                  <svg width="14" height="14" viewBox="0 0 16 16">
                    <circle cx="8" cy="8" r="6.5" fill="none" stroke={sc} strokeWidth="1.5" />
                    <path d="M8 1.5 A6.5 6.5 0 0 1 8 14.5" fill={sc} />
                  </svg>
                ) : <Circle size={14} style={{ color: sc }} />}
            </span>
            <select
              value={task.status_id || ""}
              onChange={(e) => onUpdateTask(task.id, { status_id: e.target.value })}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              title={STATUS_TYPE_LABELS[st]}
            >
              {taskStatuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </td>
        <td className="px-2 py-1.5 text-zinc-400 font-mono text-[11px] whitespace-nowrap" style={{ width: 72 }}>{identifier}</td>
        <td className="px-2 py-1.5 text-zinc-700 dark:text-zinc-300 font-medium">
          <span>{task.title}</span>
        </td>
        <td className="px-2 py-1.5" style={{ width: 96 }} onClick={(e) => e.stopPropagation()}>
          <select
            value={task.priority ?? Priority.None}
            onChange={(e) => onUpdateTask(task.id, { priority: parseInt(e.target.value) })}
            className="appearance-none bg-transparent text-xs cursor-pointer border-0 outline-none px-1.5 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: `${pc}15`, color: pc }}
          >
            {Object.entries(PriorityLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </td>
        <td className="px-2 py-1.5" style={{ width: 100 }} onClick={(e) => e.stopPropagation()}>
          <select
            value={task.assignees?.[0]?.user?.id || ""}
            onChange={(e) => onUpdateTask(task.id, {}, e.target.value ? [e.target.value] : [])}
            className="appearance-none bg-transparent text-xs cursor-pointer border-0 outline-none text-zinc-600 dark:text-zinc-400 w-full truncate"
          >
            <option value="">—</option>
            {taskUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </td>
        <td className="px-2 py-1.5" style={{ width: 120 }} onClick={(e) => e.stopPropagation()}>
          <select
            value={task.milestone_id || ""}
            onChange={(e) => onUpdateTask(task.id, { milestone_id: e.target.value || null })}
            className="appearance-none bg-transparent text-xs cursor-pointer border-0 outline-none text-zinc-500 dark:text-zinc-400 w-full truncate"
          >
            <option value="">—</option>
            {milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </td>
        <td className="px-2 py-1.5" style={{ width: 112 }} onClick={(e) => e.stopPropagation()}>
          <input
            type="date"
            value={task.due_date?.split("T")[0] || ""}
            onChange={(e) => onUpdateTask(task.id, { due_date: e.target.value ? `${e.target.value}T00:00:00Z` : null })}
            className="bg-transparent text-xs cursor-pointer border-0 outline-none text-zinc-600 dark:text-zinc-400 w-full"
          />
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-2">
      {milestones.map((m) => {
        const mt = sortTasks(tasksByMilestone.get(m.id) ?? [], sortCol, sortDir);
        const isC = collapsed[m.id] ?? false;
        const isCur = m.id === currentMilestoneId;
        const done = m.taskCount > 0 && m.completedCount === m.taskCount;
        const pct = m.taskCount ? (m.completedCount / m.taskCount) * 100 : 0;
        return (
          <div key={m.id} className={cn("border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden group/ms", isCur && "ring-1 ring-teal-400/50")}>
            <button
              onClick={() => toggle(m.id)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors",
                isCur ? "bg-teal-50 dark:bg-teal-950/30 text-teal-800 dark:text-teal-300"
                  : done ? "bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400"
                  : "bg-zinc-50 dark:bg-zinc-900/50 text-zinc-600 dark:text-zinc-400",
              )}
            >
              {isC ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              <MilestoneIcon size={14} />
              <span className="font-semibold">{m.name}</span>
              {isCur && <span className="text-[10px] bg-teal-500 text-white px-1.5 py-0.5 rounded-full uppercase tracking-wider">Current</span>}
              {done && <CheckCircle2 size={12} className="text-emerald-500" />}
              <div className="ml-auto flex items-center gap-2">
                {onDeleteMilestone && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteMilestone(m.id); }}
                    className="opacity-0 group-hover/ms:opacity-100 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-950/30 text-zinc-400 hover:text-red-500 transition-all"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
                <div className="flex items-center gap-1.5 w-24">
                  <div className="flex-1 h-1.5 bg-zinc-200/50 dark:bg-zinc-700/50 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[10px] text-zinc-400 tabular-nums">{m.completedCount}/{m.taskCount}</span>
                </div>
              </div>
            </button>
            {!isC && mt.length > 0 && (
              <table className="w-full text-xs table-fixed">
                <colgroup><col style={{width:36}}/><col style={{width:72}}/><col/><col style={{width:96}}/><col style={{width:100}}/><col style={{width:120}}/><col style={{width:112}}/></colgroup>
                {renderHeader()}
                <tbody>{mt.map(renderRow)}</tbody>
              </table>
            )}
            {!isC && mt.length === 0 && (
              <div className="px-3 py-3 text-xs text-zinc-400 italic">No tasks in this phase</div>
            )}
          </div>
        );
      })}
      {unassigned.length > 0 && (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-3 py-2 text-xs font-medium bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 dark:text-zinc-400">
            Unassigned ({unassigned.length})
          </div>
          <table className="w-full text-xs table-fixed">
            <colgroup><col style={{width:36}}/><col style={{width:72}}/><col/><col style={{width:96}}/><col style={{width:100}}/><col style={{width:120}}/><col style={{width:112}}/></colgroup>
            {renderHeader()}
            <tbody>{sortTasks(unassigned, sortCol, sortDir).map(renderRow)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
