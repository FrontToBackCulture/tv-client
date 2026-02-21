// WorkViews: Tracker View

import { useState, useMemo, memo } from "react";
import { Calendar, Clock } from "lucide-react";
import type { TaskWithRelations, Project, Initiative } from "../../lib/work/types";
import { getTaskIdentifier } from "../../lib/work/types";
import { formatDateShort as formatDate, isOverdue, daysSince } from "../../lib/date";
import {
  isThisWeek, initials,
  ScopeFilterBar, HealthBadge, ProgressBar,
} from "./workViewsShared";
import type { InitiativeProjectLink } from "./workViewsShared";

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

const TrackerRow = memo(function TrackerRow({ task, indicator, onSelect }: {
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
});

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
