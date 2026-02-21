// WorkViews: Board View

import { useState, useMemo } from "react";
import { Calendar } from "lucide-react";
import {
  useStatuses, useTasks,
} from "../../hooks/work";
import { StatusIcon, PriorityBars } from "./StatusIcon";
import type { TaskWithRelations, TaskStatus, Project, Initiative } from "../../lib/work/types";
import { getTaskIdentifier } from "../../lib/work/types";
import type { StatusType } from "../../lib/work/types";
import { formatDateShort as formatDate, isOverdue } from "../../lib/date";
import { initials, ScopeFilterBar } from "./workViewsShared";
import type { InitiativeProjectLink } from "./workViewsShared";

const BOARD_COLUMNS: { type: StatusType; label: string }[] = [
  { type: "backlog", label: "Backlog" },
  { type: "unstarted", label: "Todo" },
  { type: "started", label: "In Progress" },
  { type: "review", label: "In Review" },
  { type: "completed", label: "Done" },
];

export function BoardView({
  projects, initiatives, initiativeLinks, onSelectTask,
}: {
  projects: Project[];
  initiatives: Initiative[];
  initiativeLinks: InitiativeProjectLink[];
  onSelectTask: (id: string) => void;
}) {
  const [filterInitiativeId, setFilterInitiativeId] = useState<string | null>(null);
  const [filterProjectId, setFilterProjectId] = useState<string | null>(
    () => projects.find(p => p.status === "active")?.id || projects[0]?.id || null
  );

  const filteredProjects = useMemo(() => {
    if (!filterInitiativeId) return projects;
    const linkedIds = new Set(
      initiativeLinks.filter(l => l.initiative_id === filterInitiativeId).map(l => l.project_id)
    );
    return projects.filter(p => linkedIds.has(p.id));
  }, [projects, initiativeLinks, filterInitiativeId]);

  const effectiveProjectId = useMemo(() => {
    if (filterProjectId && filteredProjects.some(p => p.id === filterProjectId)) return filterProjectId;
    return filteredProjects[0]?.id || null;
  }, [filterProjectId, filteredProjects]);

  const { data: statuses = [] } = useStatuses(effectiveProjectId);
  const { data: tasks = [] } = useTasks(effectiveProjectId);

  const statusesByType = useMemo(() => {
    const map = new Map<StatusType, TaskStatus[]>();
    for (const s of statuses) {
      const arr = map.get(s.type as StatusType) || [];
      arr.push(s);
      map.set(s.type as StatusType, arr);
    }
    return map;
  }, [statuses]);

  const tasksByStatusType = useMemo(() => {
    const map = new Map<StatusType, TaskWithRelations[]>();
    for (const t of tasks) {
      const type = (t.status?.type || "backlog") as StatusType;
      const arr = map.get(type) || [];
      arr.push(t);
      map.set(type, arr);
    }
    return map;
  }, [tasks]);

  return (
    <div className="h-full flex flex-col">
      <ScopeFilterBar
        initiatives={initiatives}
        projects={filteredProjects}
        selectedInitiativeId={filterInitiativeId}
        selectedProjectId={effectiveProjectId}
        onInitiativeChange={setFilterInitiativeId}
        onProjectChange={setFilterProjectId}
      />

      <div className="flex-1 flex gap-0 overflow-x-auto p-4">
        {BOARD_COLUMNS.map(col => {
          const colStatuses = statusesByType.get(col.type) || [];
          const colTasks = tasksByStatusType.get(col.type) || [];
          const colColor = colStatuses[0]?.color || "#6B7280";

          return (
            <div key={col.type} className="flex-1 min-w-[220px] max-w-[280px] flex flex-col mr-3 last:mr-0">
              <div className="flex-shrink-0 mb-2">
                <div className="h-0.5 rounded-full mb-2" style={{ backgroundColor: colColor }} />
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-1.5">
                    <StatusIcon type={col.type} color={colColor} size={14} />
                    <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{col.label}</span>
                  </div>
                  <span className="text-[10px] text-zinc-400 tabular-nums">{colTasks.length}</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2">
                {colTasks.map(task => (
                  <div
                    key={task.id}
                    onClick={() => onSelectTask(task.id)}
                    className="p-2.5 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors cursor-pointer"
                  >
                    <div className="flex items-start gap-1.5">
                      <div className="pt-0.5 flex-shrink-0">
                        <PriorityBars priority={task.priority || 0} size={12} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] text-zinc-400 tabular-nums">{getTaskIdentifier(task)}</div>
                        <div className="text-xs text-zinc-800 dark:text-zinc-200 line-clamp-2 leading-relaxed mt-0.5">
                          {task.title}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      {task.assignee?.name ? (
                        <div
                          className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[8px] font-medium text-zinc-600 dark:text-zinc-400"
                          title={task.assignee.name}
                        >
                          {initials(task.assignee.name)}
                        </div>
                      ) : (
                        <div />
                      )}
                      {task.due_date && (
                        <span className={`text-[10px] flex items-center gap-0.5 ${
                          isOverdue(task.due_date) ? "text-red-500" : "text-zinc-400"
                        }`}>
                          <Calendar size={9} />
                          {formatDate(task.due_date)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {colTasks.length === 0 && (
                  <div className="text-[10px] text-zinc-400 text-center py-4">No tasks</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
