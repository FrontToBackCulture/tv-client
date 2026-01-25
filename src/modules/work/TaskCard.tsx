// src/modules/work/TaskCard.tsx
// Task card component for list and board views

import type { TaskWithRelations } from "../../lib/work/types";
import { getTaskIdentifier, PriorityLabels } from "../../lib/work/types";
import { StatusIcon, PriorityBars } from "./StatusIcon";
import { Calendar, User, Milestone as MilestoneIcon } from "lucide-react";

interface TaskCardProps {
  task: TaskWithRelations;
  onClick?: () => void;
  compact?: boolean;
}

export function TaskCard({ task, onClick, compact = false }: TaskCardProps) {
  const identifier = getTaskIdentifier(task);
  const statusType = task.status?.type || "unstarted";
  const statusColor = task.status?.color || "#6B7280";

  const isOverdue = task.due_date && new Date(task.due_date) < new Date() &&
    statusType !== "completed" && statusType !== "canceled";

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays === -1) return "Yesterday";
    if (diffDays < -1) return `${Math.abs(diffDays)}d ago`;
    if (diffDays <= 7) return `In ${diffDays}d`;

    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  if (compact) {
    return (
      <div
        onClick={onClick}
        className="group px-3 py-2 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-750 border border-slate-200 dark:border-zinc-700 rounded-md cursor-pointer transition-colors"
      >
        <div className="flex items-start gap-2">
          <div className="mt-0.5">
            <StatusIcon type={statusType} color={statusColor} size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-zinc-800 dark:text-zinc-200 line-clamp-2">{task.title}</p>
            <div className="flex items-center gap-2 mt-1.5 text-[11px] text-zinc-500">
              <span className="text-zinc-500 dark:text-zinc-600">{identifier}</span>
              {task.priority > 0 && <PriorityBars priority={task.priority} size={10} />}
              {task.assignee && (
                <span className="flex items-center gap-1">
                  <User size={10} />
                  {task.assignee.name?.split(" ")[0]}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className="group px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-zinc-900/50 border-b border-slate-200 dark:border-zinc-800 cursor-pointer transition-colors"
    >
      <div className="flex items-center gap-3">
        {/* Status */}
        <StatusIcon type={statusType} color={statusColor} size={18} />

        {/* Identifier */}
        <span className="text-xs text-zinc-500 dark:text-zinc-600 font-mono w-16 flex-shrink-0">
          {identifier}
        </span>

        {/* Title */}
        <span className="flex-1 text-sm text-zinc-800 dark:text-zinc-200 truncate">{task.title}</span>

        {/* Meta */}
        <div className="flex items-center gap-3 flex-shrink-0 text-xs">
          {/* Priority */}
          {task.priority > 0 && (
            <div title={PriorityLabels[task.priority as keyof typeof PriorityLabels]}>
              <PriorityBars priority={task.priority} size={12} />
            </div>
          )}

          {/* Labels */}
          {task.labels && task.labels.length > 0 && (
            <div className="flex gap-1">
              {task.labels.slice(0, 2).map(({ label }) => (
                <span
                  key={label.id}
                  className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                  style={{
                    backgroundColor: `${label.color}20`,
                    color: label.color,
                  }}
                >
                  {label.name}
                </span>
              ))}
              {task.labels.length > 2 && (
                <span className="text-zinc-500 dark:text-zinc-600">+{task.labels.length - 2}</span>
              )}
            </div>
          )}

          {/* Milestone */}
          {task.milestone && (
            <span className="flex items-center gap-1 text-zinc-500">
              <MilestoneIcon size={12} />
              <span className="max-w-[80px] truncate">{task.milestone.name}</span>
            </span>
          )}

          {/* Due date */}
          {task.due_date && (
            <span
              className={`flex items-center gap-1 ${
                isOverdue ? "text-red-500 dark:text-red-400" : "text-zinc-500"
              }`}
            >
              <Calendar size={12} />
              {formatDate(task.due_date)}
            </span>
          )}

          {/* Assignee */}
          {task.assignee && (
            <div className="flex items-center gap-1 text-zinc-500">
              {task.assignee.avatar_url ? (
                <img
                  src={task.assignee.avatar_url}
                  alt={task.assignee.name || ""}
                  className="w-5 h-5 rounded-full"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-slate-300 dark:bg-zinc-700 flex items-center justify-center text-[10px] text-zinc-500 dark:text-zinc-400">
                  {task.assignee.name?.[0]?.toUpperCase() || "?"}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
