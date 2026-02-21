// WorkViews: Inbox View

import { useState, useMemo } from "react";
import { StatusIcon, PriorityBars } from "./StatusIcon";
import type { TaskWithRelations, Project, Initiative } from "../../lib/work/types";
import { getTaskIdentifier } from "../../lib/work/types";
import type { StatusType } from "../../lib/work/types";
import { formatDateShort as formatDate, isOverdue, daysSince } from "../../lib/date";
import { initials, ScopeFilterBar } from "./workViewsShared";
import type { InitiativeProjectLink } from "./workViewsShared";

export function InboxView({
  allTasks, projects, initiatives, initiativeLinks, onSelectTask,
}: {
  allTasks: TaskWithRelations[];
  projects: Project[];
  initiatives: Initiative[];
  initiativeLinks: InitiativeProjectLink[];
  onSelectTask: (id: string) => void;
}) {
  const [filterInitiativeId, setFilterInitiativeId] = useState<string | null>(null);
  const [filterProjectId, setFilterProjectId] = useState<string | null>(null);

  const filteredProjectIds = useMemo(() => {
    if (filterProjectId) return new Set([filterProjectId]);
    if (filterInitiativeId) {
      return new Set(
        initiativeLinks.filter(l => l.initiative_id === filterInitiativeId).map(l => l.project_id)
      );
    }
    return null;
  }, [filterInitiativeId, filterProjectId, initiativeLinks]);

  const scopedTasks = useMemo(() => {
    if (!filteredProjectIds) return allTasks;
    return allTasks.filter(t => filteredProjectIds.has(t.project_id));
  }, [allTasks, filteredProjectIds]);

  const inboxTasks = useMemo(() => {
    const active = scopedTasks.filter(t =>
      t.status?.type !== "completed" && t.status?.type !== "canceled"
    );

    const scored = active.map(t => {
      let score = 0;
      const priority = t.priority || 0;

      if (isOverdue(t.due_date)) {
        score += 100 + daysSince(t.due_date!) * 2;
      }

      if (t.due_date && !isOverdue(t.due_date)) {
        const daysUntil = Math.floor((new Date(t.due_date).getTime() - Date.now()) / 86400000);
        if (daysUntil <= 1) score += 80;
        else if (daysUntil <= 3) score += 50;
        else if (daysUntil <= 7) score += 30;
      }

      if (priority === 1) score += 40;
      else if (priority === 2) score += 25;
      else if (priority === 3) score += 10;

      if (t.status?.type === "started") score += 5;

      return { task: t, score };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(s => s.task);
  }, [scopedTasks]);

  const urgencyLabel = (task: TaskWithRelations): { text: string; color: string } => {
    if (isOverdue(task.due_date)) {
      return { text: `${daysSince(task.due_date!)}d overdue`, color: "text-red-500" };
    }
    if (task.due_date) {
      const daysUntil = Math.floor((new Date(task.due_date).getTime() - Date.now()) / 86400000);
      if (daysUntil <= 0) return { text: "Due today", color: "text-red-500" };
      if (daysUntil === 1) return { text: "Due tomorrow", color: "text-amber-500" };
      if (daysUntil <= 3) return { text: `Due in ${daysUntil}d`, color: "text-amber-500" };
      if (daysUntil <= 7) return { text: formatDate(task.due_date), color: "text-zinc-500" };
    }
    if (task.priority === 1) return { text: "Urgent", color: "text-red-500" };
    if (task.priority === 2) return { text: "High priority", color: "text-amber-500" };
    return { text: "Medium", color: "text-zinc-400" };
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <ScopeFilterBar
        initiatives={initiatives}
        projects={projects}
        selectedInitiativeId={filterInitiativeId}
        selectedProjectId={filterProjectId}
        onInitiativeChange={setFilterInitiativeId}
        onProjectChange={setFilterProjectId}
      />
      <div className="flex-shrink-0 px-6 pt-4 pb-2">
        <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">What needs your attention</div>
        <div className="text-xs text-zinc-500 mt-0.5">{inboxTasks.length} items ranked by urgency</div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {inboxTasks.length > 0 ? (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
            {inboxTasks.map((task, idx) => {
              const urgency = urgencyLabel(task);
              return (
                <button
                  key={task.id}
                  onClick={() => onSelectTask(task.id)}
                  className="w-full flex items-center gap-3 px-6 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
                >
                  <span className="text-[10px] text-zinc-300 dark:text-zinc-600 tabular-nums w-5 text-right flex-shrink-0">
                    {idx + 1}
                  </span>
                  {task.status && (
                    <StatusIcon type={task.status.type as StatusType} color={task.status.color || "#6B7280"} size={14} />
                  )}
                  <PriorityBars priority={task.priority || 0} size={11} />
                  <span
                    className="w-2 h-2 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: task.project?.color || "#6B7280" }}
                    title={task.project?.name || ""}
                  />
                  <span className="text-[10px] text-zinc-400 tabular-nums flex-shrink-0 w-14">{getTaskIdentifier(task)}</span>
                  <span className="text-xs text-zinc-800 dark:text-zinc-200 flex-1 truncate">{task.title}</span>
                  {task.assignee?.name && (
                    <div
                      className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[8px] font-medium text-zinc-600 dark:text-zinc-400 flex-shrink-0"
                      title={task.assignee.name}
                    >
                      {initials(task.assignee.name)}
                    </div>
                  )}
                  <span className={`text-[10px] flex-shrink-0 tabular-nums ${urgency.color}`}>
                    {urgency.text}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-zinc-400 text-sm">
            All clear — nothing urgent
          </div>
        )}
      </div>
    </div>
  );
}
