// src/playground/WorkPlayground.tsx
// Work module playground — Dashboard, Board, Tracker, Inbox views

import { useState, useMemo } from "react";
import {
  LayoutDashboard, Columns3, AlertTriangle, Inbox,
  X, Calendar, User, ChevronDown,
  Clock,
} from "lucide-react";
import {
  useProjects, useAllTasks, useInitiatives,
  useStatuses, useTasks, useUsers,
} from "../hooks/work";
import { StatusIcon, PriorityBars } from "../modules/work/StatusIcon";
import type {
  TaskWithRelations, TaskStatus, Project, Initiative, User as WorkUser,
} from "../lib/work/types";
import {
  getTaskIdentifier,
  ProjectHealthColors,
  InitiativeHealthLabels,
} from "../lib/work/types";
import type { StatusType, InitiativeHealth } from "../lib/work/types";
import { formatDateShort as formatDate, isOverdue, daysSince } from "../lib/date";

import type { WorkView, InitiativeProjectLink } from "./workPlaygroundShared";
import {
  isThisWeek, initials, getUserName,
  useInitiativeProjects,
  ViewTab, HealthBadge, StatusBadge, ProgressBar, Stat,
  ScopeFilterBar, TaskRow,
} from "./workPlaygroundShared";
import { TaskQuickDetail } from "./WorkPlaygroundDetail";

// ============================
// Dashboard View
// ============================
function DashboardView({
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

  // Stats
  const activeProjects = projects.filter(p => p.status === "active").length;
  const totalTasks = allTasks.length;
  const overdueTasks = allTasks.filter(t =>
    isOverdue(t.due_date) && t.status?.type !== "completed" && t.status?.type !== "canceled"
  ).length;
  const completedTasks = allTasks.filter(t => t.status?.type === "completed").length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Initiative → project map
  const initProjectMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const link of initiativeLinks) {
      const arr = map.get(link.initiative_id) || [];
      arr.push(link.project_id);
      map.set(link.initiative_id, arr);
    }
    return map;
  }, [initiativeLinks]);

  // Project task counts
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

  // Tasks grouped by project_id
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
        <Stat label="Active Projects" value={activeProjects} icon={LayoutDashboard} color="#0D7680" />
        <Stat label="Total Tasks" value={totalTasks} icon={LayoutDashboard} color="#3B82F6" />
        <Stat label="Overdue" value={overdueTasks} icon={AlertTriangle} color="#EF4444" />
        <Stat label="Completion" value={`${completionRate}%`} icon={LayoutDashboard} color="#10B981" />
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
                  {/* Color bar */}
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
                              <span className="text-xs text-zinc-700 dark:text-zinc-300 flex-1 truncate" title={p.name}>{p.name}</span>
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
                {/* Color strip */}
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

// ============================
// Board View
// ============================
const BOARD_COLUMNS: { type: StatusType; label: string }[] = [
  { type: "backlog", label: "Backlog" },
  { type: "unstarted", label: "Todo" },
  { type: "started", label: "In Progress" },
  { type: "review", label: "In Review" },
  { type: "completed", label: "Done" },
];

function BoardView({
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

  // Filter projects by initiative for the dropdown
  const filteredProjects = useMemo(() => {
    if (!filterInitiativeId) return projects;
    const linkedIds = new Set(
      initiativeLinks.filter(l => l.initiative_id === filterInitiativeId).map(l => l.project_id)
    );
    return projects.filter(p => linkedIds.has(p.id));
  }, [projects, initiativeLinks, filterInitiativeId]);

  // Auto-select first filtered project when initiative changes
  const effectiveProjectId = useMemo(() => {
    if (filterProjectId && filteredProjects.some(p => p.id === filterProjectId)) return filterProjectId;
    return filteredProjects[0]?.id || null;
  }, [filterProjectId, filteredProjects]);

  const { data: statuses = [] } = useStatuses(effectiveProjectId);
  const { data: tasks = [] } = useTasks(effectiveProjectId);

  // Group tasks by status type
  const tasksByStatusType = useMemo(() => {
    const map = new Map<string, TaskWithRelations[]>();
    for (const t of tasks) {
      const type = t.status?.type || "backlog";
      const arr = map.get(type) || [];
      arr.push(t);
      map.set(type, arr);
    }
    return map;
  }, [tasks]);

  return (
    <div className="flex flex-col h-full">
      <ScopeFilterBar
        initiatives={initiatives}
        projects={filteredProjects}
        selectedInitiativeId={filterInitiativeId}
        selectedProjectId={effectiveProjectId}
        onInitiativeChange={(id) => { setFilterInitiativeId(id); setFilterProjectId(null); }}
        onProjectChange={setFilterProjectId}
      />
      <div className="flex-1 flex gap-2 p-4 overflow-x-auto">
        {BOARD_COLUMNS.map(col => {
          const colTasks = tasksByStatusType.get(col.type) || [];
          const status = statuses.find((s: TaskStatus) => s.type === col.type);
          return (
            <div key={col.type} className="flex-1 min-w-[200px] max-w-[280px] flex flex-col">
              <div className="flex items-center gap-2 px-2 py-2 mb-2">
                {status && (
                  <StatusIcon type={status.type as StatusType} color={status.color || "#6B7280"} size={12} />
                )}
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{col.label}</span>
                <span className="text-[10px] text-zinc-400 tabular-nums">{colTasks.length}</span>
              </div>
              <div className="flex-1 space-y-1 overflow-y-auto">
                {colTasks.map(t => (
                  <button
                    key={t.id}
                    onClick={() => onSelectTask(t.id)}
                    className="w-full text-left p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <PriorityBars priority={t.priority || 0} size={10} />
                      <span className="text-[10px] text-zinc-400 tabular-nums">{getTaskIdentifier(t)}</span>
                    </div>
                    <div className="text-xs text-zinc-800 dark:text-zinc-200 line-clamp-2">{t.title}</div>
                    <div className="flex items-center justify-between mt-2">
                      {t.assignee?.name ? (
                        <div
                          className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[8px] font-medium text-zinc-600 dark:text-zinc-400"
                          title={t.assignee.name}
                        >
                          {initials(t.assignee.name)}
                        </div>
                      ) : <div />}
                      {t.due_date && (
                        <span className={`text-[10px] ${isOverdue(t.due_date) ? "text-red-500" : "text-zinc-400"}`}>
                          {formatDate(t.due_date)}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================
// Tracker View
// ============================
function TrackerSection({ title, count, color, defaultOpen = true, children }: {
  title: string; count: number; color: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{title}</span>
        </div>
        <span className="text-[10px] font-medium tabular-nums px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400">
          {count}
        </span>
      </button>
      {open && count > 0 && <div className="divide-y divide-zinc-100 dark:divide-zinc-800">{children}</div>}
    </div>
  );
}

function TrackerRow({ task, indicator, onSelect }: {
  task: TaskWithRelations; indicator: React.ReactNode; onSelect: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onSelect(task.id)}
      className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
    >
      <span
        className="w-2 h-2 rounded-sm flex-shrink-0"
        style={{ backgroundColor: task.project?.color || "#6B7280" }}
      />
      <span className="text-[10px] text-zinc-400 tabular-nums flex-shrink-0 w-16">{getTaskIdentifier(task)}</span>
      <span className="text-xs text-zinc-800 dark:text-zinc-200 flex-1 truncate" title={task.title}>{task.title}</span>
      {task.assignee?.name && (
        <div
          className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[8px] font-medium text-zinc-600 dark:text-zinc-400 flex-shrink-0"
          title={task.assignee.name}
        >
          {initials(task.assignee.name)}
        </div>
      )}
      <div className="flex-shrink-0">{indicator}</div>
    </button>
  );
}

function TrackerView({
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

  // Filter projects by initiative
  const filteredProjectIds = useMemo(() => {
    if (filterProjectId) return new Set([filterProjectId]);
    if (filterInitiativeId) {
      return new Set(
        initiativeLinks.filter(l => l.initiative_id === filterInitiativeId).map(l => l.project_id)
      );
    }
    return null; // no filter
  }, [filterInitiativeId, filterProjectId, initiativeLinks]);

  const filteredTasks = useMemo(() => {
    if (!filteredProjectIds) return allTasks;
    return allTasks.filter(t => filteredProjectIds.has(t.project_id));
  }, [allTasks, filteredProjectIds]);

  const filteredProjects = useMemo(() => {
    if (!filteredProjectIds) return projects;
    return projects.filter(p => filteredProjectIds.has(p.id));
  }, [projects, filteredProjectIds]);

  // Overdue tasks
  const overdueTasks = useMemo(() =>
    filteredTasks.filter(t =>
      isOverdue(t.due_date) && t.status?.type !== "completed" && t.status?.type !== "canceled"
    ).sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime()),
    [filteredTasks]
  );

  // Due this week
  const dueThisWeek = useMemo(() =>
    filteredTasks.filter(t =>
      t.due_date && isThisWeek(t.due_date) && !isOverdue(t.due_date) &&
      t.status?.type !== "completed" && t.status?.type !== "canceled"
    ),
    [filteredTasks]
  );

  // At-risk projects (>30% overdue)
  const atRiskProjects = useMemo(() => {
    return filteredProjects.filter(p => {
      const pTasks = filteredTasks.filter(t => t.project_id === p.id && t.status?.type !== "canceled");
      const overdueCount = pTasks.filter(t =>
        isOverdue(t.due_date) && t.status?.type !== "completed"
      ).length;
      return pTasks.length > 0 && (overdueCount / pTasks.length) > 0.3;
    });
  }, [filteredProjects, filteredTasks]);

  // Stalled tasks (in progress but no update in 7+ days)
  const stalledTasks = useMemo(() =>
    filteredTasks.filter(t =>
      t.status?.type === "started" && t.updated_at && daysSince(t.updated_at) >= 7
    ),
    [filteredTasks]
  );

  return (
    <div className="flex flex-col h-full">
      <ScopeFilterBar
        initiatives={initiatives}
        projects={filteredProjects}
        selectedInitiativeId={filterInitiativeId}
        selectedProjectId={filterProjectId}
        onInitiativeChange={(id) => { setFilterInitiativeId(id); setFilterProjectId(null); }}
        onProjectChange={setFilterProjectId}
      />
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <TrackerSection title="Overdue" count={overdueTasks.length} color="#EF4444">
        {overdueTasks.map(t => (
          <TrackerRow
            key={t.id}
            task={t}
            onSelect={onSelectTask}
            indicator={
              <span className="text-[10px] text-red-500 tabular-nums">
                {daysSince(t.due_date!)}d overdue
              </span>
            }
          />
        ))}
      </TrackerSection>

      <TrackerSection title="Due This Week" count={dueThisWeek.length} color="#F59E0B">
        {dueThisWeek.map(t => (
          <TrackerRow
            key={t.id}
            task={t}
            onSelect={onSelectTask}
            indicator={
              <span className="text-[10px] text-amber-500 tabular-nums">
                {formatDate(t.due_date!)}
              </span>
            }
          />
        ))}
      </TrackerSection>

      <TrackerSection title="At-Risk Projects" count={atRiskProjects.length} color="#F97316" defaultOpen={false}>
        {atRiskProjects.map(p => {
          const pTasks = filteredTasks.filter(t => t.project_id === p.id && t.status?.type !== "canceled");
          const overdueCount = pTasks.filter(t =>
            isOverdue(t.due_date) && t.status?.type !== "completed"
          ).length;
          return (
            <div key={p.id} className="px-4 py-2 flex items-center gap-3">
              <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: p.color || "#6B7280" }} />
              <span className="text-xs text-zinc-800 dark:text-zinc-200 flex-1 truncate" title={p.name}>{p.name}</span>
              <span className="text-[10px] text-orange-500 tabular-nums">{overdueCount}/{pTasks.length} overdue</span>
            </div>
          );
        })}
      </TrackerSection>

      <TrackerSection title="Stalled" count={stalledTasks.length} color="#6B7280" defaultOpen={false}>
        {stalledTasks.map(t => (
          <TrackerRow
            key={t.id}
            task={t}
            onSelect={onSelectTask}
            indicator={
              <span className="text-[10px] text-zinc-400 tabular-nums flex items-center gap-0.5">
                <Clock size={9} />
                {daysSince(t.updated_at!)}d idle
              </span>
            }
          />
        ))}
      </TrackerSection>

      {overdueTasks.length === 0 && dueThisWeek.length === 0 && atRiskProjects.length === 0 && stalledTasks.length === 0 && (
        <div className="text-center py-12 text-zinc-400 text-sm">
          All clear — nothing needs attention
        </div>
      )}
    </div>
    </div>
  );
}

// ============================
// Inbox View
// ============================
function InboxView({
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

  // Filter tasks by scope
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

  // Inbox: most immediate tasks, ranked by urgency
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
      if (daysUntil <= 7) return { text: `Due in ${daysUntil}d`, color: "text-zinc-500" };
    }
    const p = task.priority || 0;
    if (p === 1) return { text: "Urgent", color: "text-red-500" };
    if (p === 2) return { text: "High", color: "text-amber-500" };
    return { text: "Normal", color: "text-zinc-400" };
  };

  return (
    <div className="flex flex-col h-full">
      <ScopeFilterBar
        initiatives={initiatives}
        projects={projects}
        selectedInitiativeId={filterInitiativeId}
        selectedProjectId={filterProjectId}
        onInitiativeChange={(id) => { setFilterInitiativeId(id); setFilterProjectId(null); }}
        onProjectChange={setFilterProjectId}
      />
      <div className="flex-1 overflow-y-auto">
        {inboxTasks.length > 0 ? (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {inboxTasks.map(task => {
              const urgency = urgencyLabel(task);
              return (
                <button
                  key={task.id}
                  onClick={() => onSelectTask(task.id)}
                  className="w-full flex items-center gap-3 px-6 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
                >
                  {task.status && (
                    <StatusIcon type={task.status.type as StatusType} color={task.status.color || "#6B7280"} size={16} />
                  )}
                  <PriorityBars priority={task.priority || 0} size={12} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-900 dark:text-zinc-100 truncate" title={task.title}>{task.title}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-zinc-400 tabular-nums">{getTaskIdentifier(task)}</span>
                      {task.project?.name && (
                        <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: task.project.color || "#6B7280" }} />
                          {task.project.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {task.assignee?.name && (
                      <div
                        className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[9px] font-medium text-zinc-600 dark:text-zinc-400"
                        title={task.assignee.name}
                      >
                        {initials(task.assignee.name)}
                      </div>
                    )}
                    <span className={`text-[11px] font-medium ${urgency.color}`}>{urgency.text}</span>
                  </div>
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

// ============================
// Main Component
// ============================
export function WorkPlayground() {
  const [view, setView] = useState<WorkView>("inbox");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const { data: projects = [] } = useProjects();
  const { data: allTasks = [] } = useAllTasks();
  const { data: initiatives = [] } = useInitiatives();
  const { data: initiativeLinks = [] } = useInitiativeProjects();
  const { data: users = [] } = useUsers();

  const handleSelectTask = (id: string) => setSelectedTaskId(id);
  const handleViewChange = (v: WorkView) => {
    setView(v);
    setSelectedTaskId(null);
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* View tabs */}
      <div className="flex-shrink-0 flex items-center border-b border-zinc-100 dark:border-zinc-800/50 px-4">
        <ViewTab label="Inbox" icon={Inbox} active={view === "inbox"} onClick={() => handleViewChange("inbox")} />
        <ViewTab label="Dashboard" icon={LayoutDashboard} active={view === "dashboard"} onClick={() => handleViewChange("dashboard")} />
        <ViewTab label="Board" icon={Columns3} active={view === "board"} onClick={() => handleViewChange("board")} />
        <ViewTab label="Tracker" icon={AlertTriangle} active={view === "tracker"} onClick={() => handleViewChange("tracker")} />
      </div>

      {/* Content: view + optional detail panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: main view */}
        <div className={`flex flex-col overflow-hidden transition-all ${
          selectedTaskId ? "flex-1 border-r border-zinc-100 dark:border-zinc-800/50" : "flex-1"
        }`}>
          {view === "inbox" && (
            <InboxView
              allTasks={allTasks}
              projects={projects}
              initiatives={initiatives}
              initiativeLinks={initiativeLinks}
              onSelectTask={handleSelectTask}
            />
          )}
          {view === "dashboard" && (
            <DashboardView
              projects={projects}
              allTasks={allTasks}
              initiatives={initiatives}
              initiativeLinks={initiativeLinks}
              users={users}
              onSelectTask={handleSelectTask}
            />
          )}
          {view === "board" && (
            <BoardView
              projects={projects}
              initiatives={initiatives}
              initiativeLinks={initiativeLinks}
              onSelectTask={handleSelectTask}
            />
          )}
          {view === "tracker" && (
            <TrackerView
              allTasks={allTasks}
              projects={projects}
              initiatives={initiatives}
              initiativeLinks={initiativeLinks}
              onSelectTask={handleSelectTask}
            />
          )}
        </div>

        {/* Right: task detail panel */}
        {selectedTaskId && (
          <div className="w-[360px] flex-shrink-0">
            <TaskQuickDetail
              key={selectedTaskId}
              taskId={selectedTaskId}
              onClose={() => setSelectedTaskId(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
