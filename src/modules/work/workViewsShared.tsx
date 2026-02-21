// WorkViews: Shared types, helpers, hooks, and UI components

import { useState, memo } from "react";
import {
  LayoutDashboard,
  ChevronDown, Filter,
  Target,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { StatusIcon, PriorityBars } from "./StatusIcon";
import type {
  TaskWithRelations, Project, Initiative, User as WorkUser,
} from "../../lib/work/types";
import {
  getTaskIdentifier,
  InitiativeHealthLabels, InitiativeHealthColors,
  InitiativeStatusLabels,
} from "../../lib/work/types";
import type { StatusType, InitiativeHealth, InitiativeStatus } from "../../lib/work/types";
import { formatDateShort as formatDate, isOverdue } from "../../lib/date";

// ============================
// Types
// ============================
export type WorkView = "inbox" | "dashboard" | "board" | "tracker";

export interface InitiativeProjectLink {
  initiative_id: string;
  project_id: string;
  sort_order: number;
}

// ============================
// Helpers
// ============================
export function isThisWeek(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 7);
  return d >= now && d <= end;
}

export function initials(name: string | undefined | null): string {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

export function getUserName(users: WorkUser[], userId: string | null): string {
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

export function HealthBadge({ health }: { health: string | null }) {
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

export function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const label = InitiativeStatusLabels[status as InitiativeStatus] || status;
  return (
    <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
      {label}
    </span>
  );
}

export function ProgressBar({ completed, total, color = "#0D7680" }: { completed: number; total: number; color?: string }) {
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

export function Stat({ label, value, icon: Icon, color }: {
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
export const TaskRow = memo(function TaskRow({ task, onSelect }: { task: TaskWithRelations; onSelect: (id: string) => void }) {
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
});
