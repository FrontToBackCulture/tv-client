// WorkPlayground: TaskQuickDetail panel

import { X, Calendar } from "lucide-react";
import { useTask } from "../hooks/work";
import { StatusIcon, PriorityBars } from "../modules/work/StatusIcon";
import type { StatusType } from "../lib/work/types";
import { PriorityLabels } from "../lib/work/types";
import { formatDateShort as formatDate, isOverdue } from "../lib/date";
import { initials } from "./workPlaygroundShared";

export function TaskQuickDetail({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const { data: task, isLoading } = useTask(taskId);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-400 text-xs">
        Loading...
      </div>
    );
  }

  if (!task) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-400 text-xs">
        Task not found
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col border-l border-zinc-100 dark:border-zinc-800/50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50">
        <div className="flex items-center gap-2 min-w-0">
          {task.status && (
            <StatusIcon type={task.status.type as StatusType} color={task.status.color || "#6B7280"} size={16} />
          )}
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{task.title}</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Status + Priority */}
        <div className="flex items-center gap-3">
          {task.status && (
            <div className="flex items-center gap-1.5">
              <StatusIcon type={task.status.type as StatusType} color={task.status.color || "#6B7280"} size={14} />
              <span className="text-xs text-zinc-700 dark:text-zinc-300">{task.status.name}</span>
            </div>
          )}
          {task.priority !== null && task.priority !== undefined && task.priority > 0 && (
            <div className="flex items-center gap-1.5">
              <PriorityBars priority={task.priority} size={12} />
              <span className="text-xs text-zinc-500">{PriorityLabels[task.priority as keyof typeof PriorityLabels]}</span>
            </div>
          )}
        </div>

        {/* Description */}
        {task.description && (
          <div className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap">
            {task.description}
          </div>
        )}

        {/* Fields */}
        <div className="space-y-2.5">
          {task.assignee?.name && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-400 uppercase tracking-wide w-16">Assignee</span>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[8px] font-medium text-zinc-600 dark:text-zinc-400">
                  {initials(task.assignee.name)}
                </div>
                <span className="text-xs text-zinc-700 dark:text-zinc-300">{task.assignee.name}</span>
              </div>
            </div>
          )}
          {task.due_date && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-400 uppercase tracking-wide w-16">Due</span>
              <span className={`text-xs flex items-center gap-1 ${isOverdue(task.due_date) ? "text-red-500" : "text-zinc-700 dark:text-zinc-300"}`}>
                <Calendar size={11} />
                {formatDate(task.due_date)}
                {isOverdue(task.due_date) && " (overdue)"}
              </span>
            </div>
          )}
          {task.milestone && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-400 uppercase tracking-wide w-16">Milestone</span>
              <span className="text-xs text-zinc-700 dark:text-zinc-300">{task.milestone.name}</span>
            </div>
          )}
          {task.project?.name && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-400 uppercase tracking-wide w-16">Project</span>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: task.project.color || "#6B7280" }} />
                <span className="text-xs text-zinc-700 dark:text-zinc-300">{task.project.name}</span>
              </div>
            </div>
          )}
          {task.labels && task.labels.length > 0 && (
            <div className="flex items-start gap-2">
              <span className="text-[10px] text-zinc-400 uppercase tracking-wide w-16 pt-0.5">Labels</span>
              <div className="flex flex-wrap gap-1">
                {task.labels.map(({ label }) => (
                  <span
                    key={label.id}
                    className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium"
                    style={{
                      backgroundColor: `${label.color || "#6B7280"}20`,
                      color: label.color || "#6B7280",
                    }}
                  >
                    {label.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Activity */}
        {task.activity && task.activity.length > 0 && (
          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <div className="text-[10px] text-zinc-400 uppercase tracking-wide mb-2">Recent Activity</div>
            <div className="space-y-2">
              {task.activity.slice(0, 5).map(a => (
                <div key={a.id} className="flex items-start gap-2">
                  <div className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600 mt-1.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2">
                      {a.action}{a.old_value ? `: ${String(a.old_value)} → ${String(a.new_value || "—")}` : ""}
                    </div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">
                      {a.created_at ? formatDate(a.created_at) : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
