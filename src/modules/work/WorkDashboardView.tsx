// WorkViews: Dashboard View — high-level overview

import { useState, useMemo } from "react";
import {
  Calendar, User, ChevronDown, ChevronRight, Pencil,
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
  projects, allTasks, initiatives, initiativeLinks, users, onSelectTask, onEditInitiative, onEditProject, onSelectProject,
}: {
  projects: Project[];
  allTasks: TaskWithRelations[];
  initiatives: Initiative[];
  initiativeLinks: InitiativeProjectLink[];
  users: WorkUser[];
  onSelectTask: (id: string) => void;
  onEditInitiative?: (initiative: Initiative) => void;
  onEditProject?: (project: Project) => void;
  onSelectProject?: (projectId: string) => void;
}) {
  const [expandedInitiativeId, setExpandedInitiativeId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const activeProjectCount = projects.filter(p => p.status === "active").length;
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
    const map = new Map<string, { total: number; completed: number; overdue: number }>();
    for (const t of allTasks) {
      const pid = t.project_id;
      const current = map.get(pid) || { total: 0, completed: 0, overdue: 0 };
      current.total++;
      if (t.status?.type === "completed") current.completed++;
      if (isOverdue(t.due_date) && t.status?.type !== "completed" && t.status?.type !== "canceled") current.overdue++;
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

  // Split and sort projects
  const { activeProjects, completedProjects } = useMemo(() => {
    const active: Project[] = [];
    const completed: Project[] = [];
    for (const p of projects) {
      if (p.status === "completed" || p.status === "cancelled") {
        completed.push(p);
      } else {
        active.push(p);
      }
    }
    active.sort((a, b) => {
      const ca = projectTaskCounts.get(a.id)?.total || 0;
      const cb = projectTaskCounts.get(b.id)?.total || 0;
      if (cb !== ca) return cb - ca;
      return a.name.localeCompare(b.name);
    });
    return { activeProjects: active, completedProjects: completed };
  }, [projects, projectTaskCounts]);

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Active Projects" value={activeProjectCount} icon={Target} color="#0D7680" />
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
                <div key={init.id} className="group rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
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
                        {onEditInitiative && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onEditInitiative(init); }}
                            className="p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Edit initiative"
                          >
                            <Pencil size={12} />
                          </button>
                        )}
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
                        <div className="text-xs text-zinc-400 uppercase tracking-wide">Projects</div>
                        {linkedProjects.map(p => {
                          const counts = projectTaskCounts.get(p.id) || { total: 0, completed: 0, overdue: 0 };
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
                              <span className="text-xs text-zinc-400">{activeTasks.length} tasks</span>
                            </div>
                            <div className="pb-1">
                              {activeTasks.length > 0 ? (
                                activeTasks.map(t => <TaskRow key={t.id} task={t} onSelect={onSelectTask} />)
                              ) : (
                                <div className="text-xs text-zinc-400 text-center py-2">No tasks</div>
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

      {/* Projects — compact table */}
      <div>
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Projects</h3>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr,80px,100px,60px,80px] gap-2 px-4 py-2 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-400 font-medium uppercase tracking-wide border-b border-zinc-100 dark:border-zinc-800">
            <span>Name</span>
            <span className="text-right">Progress</span>
            <span className="text-center">Status</span>
            <span className="text-right">Tasks</span>
            <span className="text-right">Overdue</span>
          </div>
          {/* Active projects */}
          {activeProjects.map(p => {
            const counts = projectTaskCounts.get(p.id) || { total: 0, completed: 0, overdue: 0 };
            const pct = counts.total > 0 ? Math.round((counts.completed / counts.total) * 100) : 0;
            return (
              <div
                key={p.id}
                onClick={() => onSelectProject?.(p.id)}
                className="grid grid-cols-[1fr,80px,100px,60px,80px] gap-2 items-center px-4 py-2.5 border-b border-zinc-50 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: p.color || "#6B7280" }} />
                  <span className="text-sm text-zinc-900 dark:text-zinc-100 truncate">{p.name}</span>
                  {p.lead && (
                    <span className="text-xs text-zinc-400 flex-shrink-0 hidden group-hover:inline">{getUserName(users, p.lead)}</span>
                  )}
                  {onEditProject && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onEditProject(p); }}
                      className="p-0.5 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    >
                      <Pencil size={11} />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5 justify-end">
                  <div className="w-12 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: p.color || "#0D7680" }} />
                  </div>
                  <span className="text-xs text-zinc-400 tabular-nums w-7 text-right">{pct}%</span>
                </div>
                <div className="flex justify-center">
                  {p.health && (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                      style={{
                        backgroundColor: `${ProjectHealthColors[p.health as InitiativeHealth] || "#6B7280"}15`,
                        color: ProjectHealthColors[p.health as InitiativeHealth] || "#6B7280",
                      }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ProjectHealthColors[p.health as InitiativeHealth] || "#6B7280" }} />
                      {InitiativeHealthLabels[p.health as InitiativeHealth] || p.health}
                    </span>
                  )}
                </div>
                <span className="text-xs text-zinc-500 tabular-nums text-right">
                  {counts.completed}/{counts.total}
                </span>
                <span className={`text-xs tabular-nums text-right ${counts.overdue > 0 ? "text-red-500 font-medium" : "text-zinc-400"}`}>
                  {counts.overdue > 0 ? counts.overdue : "—"}
                </span>
              </div>
            );
          })}

          {/* Completed projects toggle */}
          {completedProjects.length > 0 && (
            <>
              <button
                onClick={() => setShowCompleted(!showCompleted)}
                className="w-full flex items-center gap-1.5 px-4 py-2 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
              >
                {showCompleted ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                <span>{completedProjects.length} completed</span>
              </button>
              {showCompleted && completedProjects.map(p => {
                const counts = projectTaskCounts.get(p.id) || { total: 0, completed: 0, overdue: 0 };
                const pct = counts.total > 0 ? Math.round((counts.completed / counts.total) * 100) : 0;
                return (
                  <div
                    key={p.id}
                    onClick={() => onSelectProject?.(p.id)}
                    className="grid grid-cols-[1fr,80px,100px,60px,80px] gap-2 items-center px-4 py-2 border-b border-zinc-50 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 cursor-pointer transition-colors opacity-50"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: p.color || "#6B7280" }} />
                      <span className="text-sm text-zinc-900 dark:text-zinc-100 truncate">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 justify-end">
                      <span className="text-xs text-zinc-400 tabular-nums">{pct}%</span>
                    </div>
                    <div />
                    <span className="text-xs text-zinc-500 tabular-nums text-right">{counts.completed}/{counts.total}</span>
                    <span className="text-xs text-zinc-400 text-right">—</span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
