// src/modules/work/TaskListView.tsx
// Task list grouped by status

import { useState, useMemo } from "react";
import type { TaskWithRelations, TaskStatus } from "../../lib/work/types";
import { TaskCard } from "./TaskCard";
import { StatusIcon } from "./StatusIcon";
import { ChevronRight, Plus } from "lucide-react";

interface TaskListViewProps {
  tasks: TaskWithRelations[];
  statuses: TaskStatus[];
  onTaskClick: (task: TaskWithRelations) => void;
  onCreateTask?: (statusId: string) => void;
  filterMode?: "all" | "active" | "backlog";
}

interface StatusGroup {
  status: TaskStatus;
  tasks: TaskWithRelations[];
}

export function TaskListView({
  tasks,
  statuses,
  onTaskClick,
  onCreateTask,
  filterMode = "all",
}: TaskListViewProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Group tasks by status
  const groups = useMemo(() => {
    const grouped: StatusGroup[] = [];

    // Filter statuses based on mode
    const filteredStatuses = statuses.filter((status) => {
      if (filterMode === "active") {
        return !["backlog", "completed", "canceled"].includes(status.type);
      }
      if (filterMode === "backlog") {
        return status.type === "backlog";
      }
      return true;
    });

    for (const status of filteredStatuses) {
      const statusTasks = tasks.filter((t) => t.status_id === status.id);
      grouped.push({ status, tasks: statusTasks });
    }

    return grouped;
  }, [tasks, statuses, filterMode]);

  const toggleGroup = (statusId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(statusId)) {
        next.delete(statusId);
      } else {
        next.add(statusId);
      }
      return next;
    });
  };

  if (statuses.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-600 dark:text-zinc-500">
        No statuses configured
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {groups.map(({ status, tasks: statusTasks }) => {
        const isCollapsed = collapsedGroups.has(status.id);

        return (
          <div key={status.id} className="border-b border-slate-200 dark:border-zinc-800 last:border-b-0">
            {/* Group header */}
            <div
              className="sticky top-0 z-10 bg-slate-50 dark:bg-zinc-950 border-b border-slate-200 dark:border-zinc-800"
            >
              <button
                onClick={() => toggleGroup(status.id)}
                className="w-full px-4 py-2 flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-zinc-900/50 transition-colors"
              >
                <ChevronRight
                  size={14}
                  className={`text-zinc-500 transition-transform ${
                    isCollapsed ? "" : "rotate-90"
                  }`}
                />
                <StatusIcon
                  type={status.type}
                  color={status.color || "#6B7280"}
                  size={16}
                />
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  {status.name}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-600 ml-1">
                  {statusTasks.length}
                </span>

                {/* Add task button */}
                {onCreateTask && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateTask(status.id);
                    }}
                    className="ml-auto p-1 text-zinc-500 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-400 rounded opacity-0 group-hover:opacity-100 hover:bg-slate-200 dark:hover:bg-zinc-800 transition-all"
                  >
                    <Plus size={14} />
                  </button>
                )}
              </button>
            </div>

            {/* Tasks */}
            {!isCollapsed && (
              <div>
                {statusTasks.length === 0 ? (
                  <div className="px-4 py-6 text-center text-zinc-500 dark:text-zinc-600 text-sm">
                    No tasks
                  </div>
                ) : (
                  statusTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onClick={() => onTaskClick(task)}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
