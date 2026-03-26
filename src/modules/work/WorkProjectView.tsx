// WorkViews: Project Detail View — shows all tasks for a single project

import { useMemo, useState } from "react";
import {
  ArrowLeft, Calendar, User, MessageSquare,
} from "lucide-react";
import { DiscussionPanel } from "../../components/discussions/DiscussionPanel";
import { useDiscussionCount } from "../../hooks/useDiscussions";
import type { TaskWithRelations, Project, User as WorkUser } from "../../lib/work/types";
import type { StatusType } from "../../lib/work/types";
import { formatDateShort as formatDate, isOverdue } from "../../lib/date";
import {
  getUserName, ProgressBar, TaskRow,
} from "./workViewsShared";
import { StatusIcon } from "./StatusIcon";

type GroupBy = "status" | "priority" | "assignee";

export function ProjectView({
  project, allTasks, users, onSelectTask, onBack, onCreateTask: _onCreateTask,
}: {
  project: Project;
  allTasks: TaskWithRelations[];
  users: WorkUser[];
  onSelectTask: (id: string) => void;
  onBack: () => void;
  onCreateTask?: () => void;
}) {
  const [groupBy, setGroupBy] = useState<GroupBy>("status");
  const [showDiscussions, setShowDiscussions] = useState(false);
  const { data: discussionCount } = useDiscussionCount("project", project.id);

  const projectTasks = useMemo(
    () => allTasks.filter(t => t.project_id === project.id),
    [allTasks, project.id]
  );

  const completed = projectTasks.filter(t => t.status?.type === "completed").length;
  const overdue = projectTasks.filter(t =>
    isOverdue(t.due_date) && t.status?.type !== "completed" && t.status?.type !== "canceled"
  ).length;

  // Group tasks
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; color?: string; statusType?: string; tasks: TaskWithRelations[] }>();

    for (const t of projectTasks) {
      let key: string;
      let label: string;
      let color: string | undefined;
      let statusType: string | undefined;

      if (groupBy === "status") {
        key = t.status?.id || "none";
        label = t.status?.name || "No Status";
        color = t.status?.color || "#6B7280";
        statusType = t.status?.type;
      } else if (groupBy === "priority") {
        const p = t.priority || 0;
        const labels: Record<number, string> = { 1: "Urgent", 2: "High", 3: "Medium", 4: "Low", 0: "None" };
        key = String(p);
        label = labels[p] || "None";
      } else {
        key = t.assignees?.[0]?.user?.id || "unassigned";
        label = t.assignees?.[0]?.user?.name || "Unassigned";
      }

      const group = map.get(key) || { label, color, statusType, tasks: [] };
      group.tasks.push(t);
      map.set(key, group);
    }

    // Sort groups
    const entries = Array.from(map.entries());
    if (groupBy === "status") {
      // Keep status order: unstarted → started → completed → canceled
      const typeOrder: Record<string, number> = { backlog: 0, unstarted: 1, started: 2, completed: 3, canceled: 4 };
      entries.sort((a, b) => (typeOrder[a[1].statusType || ""] ?? 5) - (typeOrder[b[1].statusType || ""] ?? 5));
    } else if (groupBy === "priority") {
      entries.sort((a, b) => Number(a[0]) - Number(b[0]));
    } else {
      entries.sort((a, b) => a[1].label.localeCompare(b[1].label));
    }

    return entries;
  }, [projectTasks, groupBy]);

  return (
    <div className="h-full flex flex-col">
      {/* Project header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/50">
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={onBack}
            className="p-1 -ml-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: project.color || "#6B7280" }} />
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{project.name}</h2>
        </div>
        <div className="flex items-center gap-6 ml-8">
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <span>{projectTasks.length} tasks</span>
            <span>{completed} completed</span>
            {overdue > 0 && <span className="text-red-500 font-medium">{overdue} overdue</span>}
            {project.lead && (
              <span className="flex items-center gap-1">
                <User size={10} />
                {getUserName(users, project.lead)}
              </span>
            )}
            {project.target_date && (
              <span className="flex items-center gap-1">
                <Calendar size={10} />
                {formatDate(project.target_date)}
              </span>
            )}
          </div>
          <div className="w-40">
            <ProgressBar completed={completed} total={projectTasks.length} color={project.color || "#0D7680"} />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-xs text-zinc-400">Group:</span>
            {(["status", "priority", "assignee"] as GroupBy[]).map(g => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                  groupBy === g
                    ? "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                {g.charAt(0).toUpperCase() + g.slice(1)}
              </button>
            ))}
            <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1" />
            <button
              onClick={() => setShowDiscussions(!showDiscussions)}
              className={`relative p-1 rounded transition-colors ${
                showDiscussions
                  ? "text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950"
                  : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
              title="Discussion"
            >
              <MessageSquare size={14} />
              {(discussionCount ?? 0) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[12px] h-[12px] flex items-center justify-center text-[8px] font-bold bg-teal-600 text-white rounded-full px-0.5">
                  {discussionCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Task list + optional discussion sidebar */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {groups.length === 0 && (
            <div className="text-center py-12 text-zinc-400 text-sm">No tasks in this project</div>
          )}
          {groups.map(([key, group]) => (
            <div key={key}>
              <div className="sticky top-0 z-10 flex items-center gap-2 px-6 py-2 bg-zinc-50/90 dark:bg-zinc-900/90 backdrop-blur-sm border-b border-zinc-100 dark:border-zinc-800/50">
                {groupBy === "status" && group.statusType && (
                  <StatusIcon type={group.statusType as StatusType} color={group.color || "#6B7280"} size={13} />
                )}
                <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">{group.label}</span>
                <span className="text-xs text-zinc-400">{group.tasks.length}</span>
              </div>
              <div className="px-3 py-0.5">
                {group.tasks.map(t => <TaskRow key={t.id} task={t} onSelect={onSelectTask} />)}
              </div>
            </div>
          ))}
        </div>
        {showDiscussions && (
          <div className="w-[320px] flex-shrink-0">
            <DiscussionPanel
              entityType="project"
              entityId={project.id}
              onClose={() => setShowDiscussions(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
