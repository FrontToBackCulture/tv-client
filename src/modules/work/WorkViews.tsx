// src/modules/work/WorkViews.tsx
// All Work module views: Inbox, Dashboard, Board, Tracker + shared components

import { useState, useMemo } from "react";
import {
  LayoutDashboard,
  X, Calendar, User, ChevronDown, Filter,
  Target, Clock, TrendingUp, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import {
  useStatuses, useTasks,
} from "../../hooks/useWork";
import { StatusIcon, PriorityBars } from "./StatusIcon";
import type {
  TaskWithRelations, TaskStatus, Project, Initiative, User as WorkUser,
} from "../../lib/work/types";
import {
  getTaskIdentifier,
  InitiativeHealthLabels, InitiativeHealthColors,
  ProjectHealthColors,
  InitiativeStatusLabels,
} from "../../lib/work/types";
import type { StatusType, InitiativeHealth, InitiativeStatus } from "../../lib/work/types";
import { formatDateShort as formatDate, isOverdue, daysSince } from "../../lib/date";

// ============================
// Types
// ============================
export type WorkView = "inbox" | "dashboard" | "board" | "tracker";

interface InitiativeProjectLink {
  initiative_id: string;
  project_id: string;
  sort_order: number;
}

// ============================
// Helpers
// ============================
function isThisWeek(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 7);
  return d >= now && d <= end;
}

function initials(name: string | undefined | null): string {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function getUserName(users: WorkUser[], userId: string | null): string {
  if (!userId) return "";
  return users.find(u => u.id === userId)?.name || "";
}

// ============================
// Hook: initiative_projects junction
// ============================
export function useInitiativeProjects() {
  return useQuery({
    queryKey: ["work", "initiative_projects"],
    queryFn: async (): Promise<InitiativeProjectLink[]> => {
      const { data, error } = await supabase
        .from("initiative_projects")
        .select("initiative_id, project_id, sort_order")
        .order("sort_order");
      if (error) throw new Error(`Failed to fetch initiative_projects: ${error.message}`);
      return data ?? [];
    },
  });
}

// ============================
// Shared UI
// ============================
export function ViewTab({ label, icon: Icon, active, onClick, "data-help-id": helpId }: {
  label: string; icon: typeof LayoutDashboard; active: boolean; onClick: () => void; "data-help-id"?: string;
}) {
  return (
    <button
      onClick={onClick}
      data-help-id={helpId}
      className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
        active
          ? "border-teal-600 text-teal-700 dark:text-teal-400 dark:border-teal-500"
          : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      }`}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}

function HealthBadge({ health }: { health: string | null }) {
  if (!health) return null;
  const label = InitiativeHealthLabels[health as InitiativeHealth] || health;
  const color = InitiativeHealthColors[health as InitiativeHealth] || "#6B7280";
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
      style={{ backgroundColor: `${color}20`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const label = InitiativeStatusLabels[status as InitiativeStatus] || status;
  return (
    <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
      {label}
    </span>
  );
}

function ProgressBar({ completed, total, color = "#0D7680" }: { completed: number; total: number; color?: string }) {
  const pct = total > 0 ? (completed / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] text-zinc-500 tabular-nums">{completed}/{total}</span>
    </div>
  );
}

function Stat({ label, value, icon: Icon, color }: {
  label: string; value: string | number; icon: typeof Target; color: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
      <div className="p-1.5 rounded" style={{ backgroundColor: `${color}15` }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div>
        <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{value}</div>
        <div className="text-[10px] text-zinc-500 uppercase tracking-wide">{label}</div>
      </div>
    </div>
  );
}

// ============================
// ScopeFilterBar
// ============================
export function ScopeFilterBar({
  initiatives, projects,
  selectedInitiativeId, selectedProjectId,
  onInitiativeChange, onProjectChange,
}: {
  initiatives: Initiative[];
  projects: Project[];
  selectedInitiativeId: string | null;
  selectedProjectId: string | null;
  onInitiativeChange: (id: string | null) => void;
  onProjectChange: (id: string | null) => void;
}) {
  const [initDdOpen, setInitDdOpen] = useState(false);
  const [projDdOpen, setProjDdOpen] = useState(false);
  const selectedInitiative = initiatives.find(i => i.id === selectedInitiativeId);
  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const hasFilter = !!selectedInitiativeId || !!selectedProjectId;

  return (
    <div className="flex-shrink-0 flex items-center gap-2 px-6 py-3 border-b border-zinc-100 dark:border-zinc-800/50">
      <Filter size={12} className="text-zinc-400" />
      <span className="text-[10px] text-zinc-400 uppercase tracking-wide">Scope:</span>

      {/* Initiative filter */}
      <div className="relative">
        <button
          onClick={() => { setInitDdOpen(!initDdOpen); setProjDdOpen(false); }}
          className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
            selectedInitiativeId
              ? "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          }`}
        >
          {selectedInitiative?.name || "Initiative"}
          <ChevronDown size={10} />
        </button>
        {initDdOpen && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700 shadow-lg py-1 min-w-[180px]">
            <button
              onClick={() => { onInitiativeChange(null); onProjectChange(null); setInitDdOpen(false); }}
              className="w-full px-3 py-1.5 text-xs text-left text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              All initiatives
            </button>
            {initiatives.map(i => (
              <button
                key={i.id}
                onClick={() => { onInitiativeChange(i.id); onProjectChange(null); setInitDdOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                  i.id === selectedInitiativeId ? "bg-zinc-50 dark:bg-zinc-800" : ""
                }`}
              >
                <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: i.color || "#0D7680" }} />
                <span className="truncate">{i.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Project filter */}
      <div className="relative">
        <button
          onClick={() => { setProjDdOpen(!projDdOpen); setInitDdOpen(false); }}
          className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
            selectedProjectId
              ? "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          }`}
        >
          {selectedProject ? (
            <>
              <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: selectedProject.color || "#6B7280" }} />
              {selectedProject.name}
            </>
          ) : "Project"}
          <ChevronDown size={10} />
        </button>
        {projDdOpen && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700 shadow-lg py-1 min-w-[180px]">
            <button
              onClick={() => { onProjectChange(null); setProjDdOpen(false); }}
              className="w-full px-3 py-1.5 text-xs text-left text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              All projects
            </button>
            {projects.map(p => (
              <button
                key={p.id}
                onClick={() => { onProjectChange(p.id); setProjDdOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                  p.id === selectedProjectId ? "bg-zinc-50 dark:bg-zinc-800" : ""
                }`}
              >
                <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: p.color || "#6B7280" }} />
                <span className="truncate">{p.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {hasFilter && (
        <button
          onClick={() => { onInitiativeChange(null); onProjectChange(null); }}
          className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          Clear
        </button>
      )}
    </div>
  );
}

// ============================
// TaskRow (shared)
// ============================
function TaskRow({ task, onSelect }: { task: TaskWithRelations; onSelect: (id: string) => void }) {
  return (
    <button
      onClick={() => onSelect(task.id)}
      className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors rounded"
    >
      {task.status && (
        <StatusIcon type={task.status.type as StatusType} color={task.status.color || "#6B7280"} size={14} />
      )}
      <PriorityBars priority={task.priority || 0} size={11} />
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
      {task.due_date && (
        <span className={`text-[10px] flex-shrink-0 ${isOverdue(task.due_date) ? "text-red-500" : "text-zinc-400"}`}>
          {formatDate(task.due_date)}
        </span>
      )}
    </button>
  );
}

// ============================
// Inbox View
// ============================
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

// ============================
// Dashboard View
// ============================
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
      <span className="text-xs text-zinc-800 dark:text-zinc-200 flex-1 truncate">{task.title}</span>
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

export function TrackerView({
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

  const filteredTasks = useMemo(() => {
    if (!filteredProjectIds) return allTasks;
    return allTasks.filter(t => filteredProjectIds.has(t.project_id));
  }, [allTasks, filteredProjectIds]);

  const filteredProjects = useMemo(() => {
    if (!filteredProjectIds) return projects;
    return projects.filter(p => filteredProjectIds.has(p.id));
  }, [projects, filteredProjectIds]);

  const overdueTasks = useMemo(() =>
    filteredTasks.filter(t =>
      isOverdue(t.due_date) && t.status?.type !== "completed" && t.status?.type !== "canceled"
    ).sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime()),
  [filteredTasks]);

  const dueThisWeek = useMemo(() =>
    filteredTasks.filter(t =>
      t.due_date && !isOverdue(t.due_date) && isThisWeek(t.due_date) &&
      t.status?.type !== "completed" && t.status?.type !== "canceled"
    ).sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime()),
  [filteredTasks]);

  const atRiskProjects = useMemo(() =>
    filteredProjects.filter(p => p.health === "at_risk" || p.health === "off_track"),
  [filteredProjects]);

  const projectTaskCounts = useMemo(() => {
    const map = new Map<string, { total: number; completed: number }>();
    for (const t of filteredTasks) {
      const pid = t.project_id;
      const current = map.get(pid) || { total: 0, completed: 0 };
      current.total++;
      if (t.status?.type === "completed") current.completed++;
      map.set(pid, current);
    }
    return map;
  }, [filteredTasks]);

  const stalledTasks = useMemo(() =>
    filteredTasks.filter(t =>
      t.status?.type === "started" && t.updated_at && daysSince(t.updated_at) >= 7
    ).sort((a, b) => daysSince(b.updated_at!) - daysSince(a.updated_at!)),
  [filteredTasks]);

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
                <span className="text-[10px] text-amber-500 tabular-nums flex items-center gap-0.5">
                  <Calendar size={9} />
                  {formatDate(t.due_date!)}
                </span>
              }
            />
          ))}
        </TrackerSection>

        <TrackerSection title="At-Risk Projects" count={atRiskProjects.length} color="#F59E0B">
          {atRiskProjects.map(p => {
            const counts = projectTaskCounts.get(p.id) || { total: 0, completed: 0 };
            return (
              <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: p.color || "#6B7280" }} />
                <span className="text-xs text-zinc-800 dark:text-zinc-200 flex-1">{p.name}</span>
                <HealthBadge health={p.health} />
                <div className="w-20">
                  <ProgressBar completed={counts.completed} total={counts.total} color={p.color || "#0D7680"} />
                </div>
              </div>
            );
          })}
        </TrackerSection>

        <TrackerSection title="Stalled" count={stalledTasks.length} color="#6B7280" defaultOpen={stalledTasks.length > 0}>
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
