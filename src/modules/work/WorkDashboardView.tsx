// WorkViews: Dashboard View

import { useState, useMemo } from "react";
import {
  X, Calendar, User, ChevronDown,
  Target, TrendingUp, CheckCircle2, AlertTriangle,
} from "lucide-react";
import type { TaskWithRelations, Project, Initiative, User as WorkUser } from "../../lib/work/types";
import {
  ProjectHealthColors,
  InitiativeHealthLabels,
} from "../../lib/work/types";
import type { InitiativeHealth } from "../../lib/work/types";
import { formatDateShort as formatDate, isOverdue } from "../../lib/date";
import {
  getUserName,
  HealthBadge, StatusBadge, ProgressBar, Stat, TaskRow,
} from "./workViewsShared";
import type { InitiativeProjectLink } from "./workViewsShared";

export function DashboardView({
  projects, allTasks, initiatives, initiativeLinks, users, onSelectTask,
}: {
  projects: Project[];
  allTasks: TaskWithRelations[];
  initiatives: Initiative[];
  initiativeLinks: InitiativeProjectLink[];
  users: WorkUser[];
  onSelectTask: (id: string) => void;
}) {
  const [expandedInitiativeId, setExpandedInitiativeId] = useState<string | null>(null);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);

  const activeProjects = projects.filter(p => p.status === "active").length;
  const totalTasks = allTasks.length;
  const overdueTasks = allTasks.filter(t =>
    isOverdue(t.due_date) && t.status?.type !== "completed" && t.status?.type !== "canceled"
  ).length;
  const completedTasks = allTasks.filter(t => t.status?.type === "completed").length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const initProjectMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const link of initiativeLinks) {
      const arr = map.get(link.initiative_id) || [];
      arr.push(link.project_id);
      map.set(link.initiative_id, arr);
    }
    return map;
  }, [initiativeLinks]);

  const projectTaskCounts = useMemo(() => {
    const map = new Map<string, { total: number; completed: number }>();
    for (const t of allTasks) {
      const pid = t.project_id;
      const current = map.get(pid) || { total: 0, completed: 0 };
      current.total++;
      if (t.status?.type === "completed") current.completed++;
      map.set(pid, current);
    }
    return map;
  }, [allTasks]);

  const tasksByProject = useMemo(() => {
    const map = new Map<string, TaskWithRelations[]>();
    for (const t of allTasks) {
      const arr = map.get(t.project_id) || [];
      arr.push(t);
      map.set(t.project_id, arr);
    }
    return map;
  }, [allTasks]);

  const projectById = useMemo(() => {
    const map = new Map<string, Project>();
    for (const p of projects) map.set(p.id, p);
    return map;
  }, [projects]);

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Active Projects" value={activeProjects} icon={Target} color="#0D7680" />
        <Stat label="Total Tasks" value={totalTasks} icon={CheckCircle2} color="#3B82F6" />
        <Stat label="Overdue" value={overdueTasks} icon={AlertTriangle} color="#EF4444" />
        <Stat label="Completion" value={`${completionRate}%`} icon={TrendingUp} color="#10B981" />
      </div>

      {/* Initiatives */}
      {initiatives.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Initiatives</h3>
          <div className="space-y-3">
            {initiatives.map(init => {
              const linkedProjectIds = initProjectMap.get(init.id) || [];
              const linkedProjects = linkedProjectIds
                .map(id => projectById.get(id))
                .filter((p): p is Project => !!p);
              const isExpanded = expandedInitiativeId === init.id;

              return (
                <div key={init.id} className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                  <div className="h-1" style={{ backgroundColor: init.color || "#0D7680" }} />
                  <div
                    className="p-4 space-y-3 cursor-pointer hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50 transition-colors"
                    onClick={() => setExpandedInitiativeId(isExpanded ? null : init.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium text-sm text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                          {init.name}
                          <ChevronDown size={12} className={`text-zinc-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </div>
                        {init.description && (
                          <div className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{init.description}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <HealthBadge health={init.health} />
                        <StatusBadge status={init.status} />
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-zinc-500">
                      {init.owner && (
                        <span className="flex items-center gap-1">
                          <User size={11} />
                          {getUserName(users, init.owner)}
                        </span>
                      )}
                      {init.target_date && (
                        <span className="flex items-center gap-1">
                          <Calendar size={11} />
                          {formatDate(init.target_date)}
                        </span>
                      )}
                    </div>
                    {/* Linked projects summary */}
                    {!isExpanded && linkedProjects.length > 0 && (
                      <div className="space-y-1.5 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                        <div className="text-[10px] text-zinc-400 uppercase tracking-wide">Projects</div>
                        {linkedProjects.map(p => {
                          const counts = projectTaskCounts.get(p.id) || { total: 0, completed: 0 };
                          return (
                            <div key={p.id} className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: p.color || "#6B7280" }} />
                              <span className="text-xs text-zinc-700 dark:text-zinc-300 flex-1 truncate">{p.name}</span>
                              <div className="w-24">
                                <ProgressBar completed={counts.completed} total={counts.total} color={p.color || "#0D7680"} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {/* Expanded: tasks grouped by project */}
                  {isExpanded && linkedProjects.length > 0 && (
                    <div className="border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                      {linkedProjects.map(p => {
                        const tasks = tasksByProject.get(p.id) || [];
                        const activeTasks = tasks.filter(t => t.status?.type !== "canceled");
                        return (
                          <div key={p.id} className="border-b border-zinc-100 dark:border-zinc-800 last:border-b-0">
                            <div className="flex items-center gap-2 px-4 py-2">
                              <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: p.color || "#6B7280" }} />
                              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{p.name}</span>
                              <span className="text-[10px] text-zinc-400">{activeTasks.length} tasks</span>
                            </div>
                            <div className="pb-1">
                              {activeTasks.length > 0 ? (
                                activeTasks.map(t => <TaskRow key={t.id} task={t} onSelect={onSelectTask} />)
                              ) : (
                                <div className="text-[10px] text-zinc-400 text-center py-2">No tasks</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Projects grid */}
      <div>
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Projects</h3>
        <div className="grid grid-cols-3 gap-3">
          {projects.map(p => {
            const counts = projectTaskCounts.get(p.id) || { total: 0, completed: 0 };
            return (
              <div
                key={p.id}
                onClick={() => setExpandedProjectId(expandedProjectId === p.id ? null : p.id)}
                className={`rounded-lg border overflow-hidden hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors cursor-pointer ${
                  expandedProjectId === p.id
                    ? "border-teal-300 dark:border-teal-700 ring-1 ring-teal-200 dark:ring-teal-800"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <div className="h-[3px]" style={{ backgroundColor: p.color || "#6B7280" }} />
                <div className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 line-clamp-1">{p.name}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {p.health && (
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: ProjectHealthColors[p.health as InitiativeHealth] || "#6B7280" }}
                          title={InitiativeHealthLabels[p.health as InitiativeHealth] || ""}
                        />
                      )}
                      <StatusBadge status={p.status} />
                    </div>
                  </div>
                  <ProgressBar completed={counts.completed} total={counts.total} color={p.color || "#0D7680"} />
                  <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                    {p.lead && (
                      <span className="flex items-center gap-1">
                        <User size={10} />
                        {getUserName(users, p.lead)}
                      </span>
                    )}
                    {p.target_date && (
                      <span className="flex items-center gap-1">
                        <Calendar size={10} />
                        {formatDate(p.target_date)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Expanded project tasks */}
        {expandedProjectId && (() => {
          const p = projectById.get(expandedProjectId);
          const tasks = tasksByProject.get(expandedProjectId) || [];
          const activeTasks = tasks.filter(t => t.status?.type !== "canceled");
          if (!p) return null;
          return (
            <div className="mt-3 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-50 dark:bg-zinc-900">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: p.color || "#6B7280" }} />
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{p.name}</span>
                  <span className="text-[10px] text-zinc-400">{activeTasks.length} tasks</span>
                </div>
                <button
                  onClick={() => setExpandedProjectId(null)}
                  className="p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400"
                >
                  <X size={12} />
                </button>
              </div>
              <div className="max-h-[320px] overflow-y-auto py-1">
                {activeTasks.length > 0 ? (
                  activeTasks.map(t => <TaskRow key={t.id} task={t} onSelect={onSelectTask} />)
                ) : (
                  <div className="text-[10px] text-zinc-400 text-center py-4">No tasks in this project</div>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
