// WorkViews: Shared types, helpers, hooks, and UI components

import { useState, useCallback, useRef, useEffect, memo } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown, Filter,
  Target,
  Check,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { workKeys } from "../../hooks/work/keys";
import { StatusIcon, PriorityBars } from "./StatusIcon";
import { toast } from "../../stores/toastStore";
import type {
  TaskWithRelations, Project, Initiative, User as WorkUser,
} from "../../lib/work/types";
import type { TeamWithMembers } from "../../hooks/work/useTeams";
import {
  getTaskIdentifier,
  PriorityLabels,
  InitiativeHealthLabels, InitiativeHealthColors,
  InitiativeStatusLabels,
  ProjectStatusColors, ProjectStatusLabels,
} from "../../lib/work/types";
import type { StatusType, InitiativeHealth, InitiativeStatus, ProjectStatus } from "../../lib/work/types";
import { isOverdue } from "../../lib/date";

// ============================
// Types
// ============================
export const INITIATIVE_COLORS = [
  "#0D7680", // teal
  "#6366F1", // indigo
  "#D97706", // amber
  "#DC2626", // red
  "#059669", // emerald
  "#7C3AED", // violet
  "#DB2777", // pink
  "#2563EB", // blue
  "#CA8A04", // yellow
  "#9333EA", // purple
  "#0891B2", // cyan
  "#EA580C", // orange
];

export function getInitiativeColor(init: { color?: string | null }, index: number): string {
  return init.color || INITIATIVE_COLORS[index % INITIATIVE_COLORS.length];
}

export type WorkView = "inbox" | "dashboard" | "board" | "tracker" | "notion" | "project";

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
    queryKey: workKeys.initiativeProjects(),
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
// ViewTab is now in components/ViewTab.tsx — re-export for backward compat
export { ViewTab } from "../../components/ViewTab";

export function HealthBadge({ health }: { health: string | null }) {
  if (!health) return null;
  const label = InitiativeHealthLabels[health as InitiativeHealth] || health;
  const color = InitiativeHealthColors[health as InitiativeHealth] || "#6B7280";
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium"
      style={{ backgroundColor: `${color}20`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

export function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const label = ProjectStatusLabels[status as ProjectStatus] || InitiativeStatusLabels[status as InitiativeStatus] || status;
  const color = ProjectStatusColors[status as ProjectStatus] || "#6B7280";
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[9px] font-medium"
      style={{ color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
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
      <span className="text-[9px] text-zinc-500 tabular-nums">{completed}/{total}</span>
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
        <div className="text-xs text-zinc-500 uppercase tracking-wide">{label}</div>
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
  teams, selectedTeamId, onTeamChange,
}: {
  initiatives: Initiative[];
  projects: Project[];
  selectedInitiativeId: string | null;
  selectedProjectId: string | null;
  onInitiativeChange: (id: string | null) => void;
  onProjectChange: (id: string | null) => void;
  teams?: TeamWithMembers[];
  selectedTeamId?: string | null;
  onTeamChange?: (id: string | null) => void;
}) {
  const [initDdOpen, setInitDdOpen] = useState(false);
  const [projDdOpen, setProjDdOpen] = useState(false);
  const [teamDdOpen, setTeamDdOpen] = useState(false);
  const selectedInitiative = initiatives.find(i => i.id === selectedInitiativeId);
  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const selectedTeam = teams?.find(t => t.id === selectedTeamId);
  const hasFilter = !!selectedInitiativeId || !!selectedProjectId || !!selectedTeamId;

  const closeAll = () => { setInitDdOpen(false); setProjDdOpen(false); setTeamDdOpen(false); };

  return (
    <div className="flex-shrink-0 flex items-center gap-2 px-6 py-3 border-b border-zinc-100 dark:border-zinc-800">
      <Filter size={12} className="text-zinc-400" />
      <span className="text-xs text-zinc-400 uppercase tracking-wide">Scope:</span>

      {/* Initiative filter */}
      <div className="relative">
        <button
          onClick={() => { const next = !initDdOpen; closeAll(); setInitDdOpen(next); }}
          className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
            selectedInitiativeId
              ? "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          }`}
        >
          {selectedInitiative?.name || "Initiative"}
          <ChevronDown size={10} />
        </button>
        {initDdOpen && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-lg py-1 min-w-[180px]">
            <button
              onClick={() => { onInitiativeChange(null); onProjectChange(null); setInitDdOpen(false); }}
              className="w-full px-3 py-1.5 text-xs text-left text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              All initiatives
            </button>
            {initiatives.map((i, idx) => (
              <button
                key={i.id}
                onClick={() => { onInitiativeChange(i.id); onProjectChange(null); setInitDdOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                  i.id === selectedInitiativeId ? "bg-zinc-50 dark:bg-zinc-800" : ""
                }`}
              >
                <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: getInitiativeColor(i, idx) }} />
                <span className="truncate">{i.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Project filter */}
      <div className="relative">
        <button
          onClick={() => { const next = !projDdOpen; closeAll(); setProjDdOpen(next); }}
          className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
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
          <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-lg py-1 min-w-[180px]">
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

      {/* Team filter */}
      {teams && onTeamChange && (
        <div className="relative">
          <button
            onClick={() => { const next = !teamDdOpen; closeAll(); setTeamDdOpen(next); }}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
              selectedTeamId
                ? "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            {selectedTeam ? (
              <>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: selectedTeam.color }} />
                {selectedTeam.name}
              </>
            ) : "Team"}
            <ChevronDown size={10} />
          </button>
          {teamDdOpen && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-lg py-1 min-w-[180px]">
              <button
                onClick={() => { onTeamChange(null); setTeamDdOpen(false); }}
                className="w-full px-3 py-1.5 text-xs text-left text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                All teams
              </button>
              {teams.map(t => (
                <button
                  key={t.id}
                  onClick={() => { onTeamChange(t.id); setTeamDdOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                    t.id === selectedTeamId ? "bg-zinc-50 dark:bg-zinc-800" : ""
                  }`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                  <span className="truncate">{t.name}</span>
                  <span className="text-zinc-400 ml-auto">{t.members.length}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {hasFilter && (
        <button
          onClick={() => { onInitiativeChange(null); onProjectChange(null); onTeamChange?.(null); }}
          className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          Clear
        </button>
      )}
    </div>
  );
}

// ============================
// InlineDropdown (portal-based popover for inline editing in task rows)
// ============================
function InlineDropdown({ anchorRef, open, onClose, children }: {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const left = Math.min(rect.left, window.innerWidth - 200);
    setPos({ top: rect.bottom + 4, left });
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open, onClose, anchorRef]);

  if (!open) return null;
  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999] py-1 min-w-[140px] max-h-[240px] overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 shadow-lg"
      style={{ top: pos.top, left: pos.left }}
    >
      {children}
    </div>,
    document.body
  );
}

function DropdownItem({ selected, onClick, children }: { selected?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${selected ? "text-teal-600 dark:text-teal-400 font-medium" : "text-zinc-700 dark:text-zinc-300"}`}
    >
      {children}
      {selected && <Check size={12} className="ml-auto" />}
    </button>
  );
}

// ============================
// TaskRow (shared)
// ============================
export const TaskRow = memo(function TaskRow({ task, onSelect, contextLabel, selectable, selected, onToggleSelect, projectScoped }: {
  task: TaskWithRelations;
  onSelect: (id: string) => void;
  contextLabel?: string;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string, shift: boolean) => void;
  projectScoped?: boolean;
}) {
  const queryClient = useQueryClient();
  const [completing, setCompleting] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [statusList, setStatusList] = useState<Array<{ id: string; name: string; type: string; color: string | null }>>([]);
  const [companyList, setCompanyList] = useState<Array<{ id: string; name: string; display_name: string | null }>>([]);
  const [companySearch, setCompanySearch] = useState("");
  const [userList, setUserList] = useState<Array<{ id: string; name: string }>>([]);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [projectList, setProjectList] = useState<Array<{ id: string; name: string; color: string | null }>>([]);
  const [projectSearch, setProjectSearch] = useState("");
  const statusRef = useRef<HTMLSpanElement>(null);
  const priorityRef = useRef<HTMLSpanElement>(null);
  const companyRef = useRef<HTMLSpanElement>(null);
  const assigneeRef = useRef<HTMLDivElement>(null);

  // Fetch statuses when dropdown opens
  useEffect(() => {
    if (!statusOpen || statusList.length > 0) return;
    supabase.from("task_statuses").select("id, name, type, color").order("sort_order")
      .then(({ data }) => { if (data) setStatusList(data); });
  }, [statusOpen, statusList.length]);

  // Fetch companies from Notion sync value_map (only mapped companies)
  useEffect(() => {
    if (!companyOpen || companyList.length > 0) return;
    (async () => {
      // Get company IDs from Notion sync config value_map
      const { data: configs } = await supabase.from("notion_sync_configs").select("field_mapping").eq("enabled", true).limit(1);
      const valueMap = configs?.[0]?.field_mapping?.company_id?.value_map;
      if (valueMap && typeof valueMap === "object") {
        const ids = [...new Set(Object.values(valueMap) as string[])];
        const { data } = await supabase.from("crm_companies").select("id, name, display_name").in("id", ids).order("name");
        if (data) setCompanyList(data);
      } else {
        // Fallback: all companies
        const { data } = await supabase.from("crm_companies").select("id, name, display_name").order("name").limit(100);
        if (data) setCompanyList(data);
      }
    })();
  }, [companyOpen, companyList.length]);

  // Fetch users when dropdown opens
  useEffect(() => {
    if (!assigneeOpen || userList.length > 0) return;
    supabase.from("users").select("id, name").order("name")
      .then(({ data }) => { if (data) setUserList(data); });
  }, [assigneeOpen, userList.length]);

  // Fetch projects when context menu opens
  useEffect(() => {
    if (!contextMenuPos || projectList.length > 0) return;
    supabase.from("projects").select("id, name, color").eq("status", "active").order("name")
      .then(({ data }) => { if (data) setProjectList(data); });
  }, [contextMenuPos, projectList.length]);

  // Debounced Notion auto-push — fires 1.5s after last inline edit if task is linked to Notion.
  const notionSyncTimerRef = useRef<number | null>(null);
  const scheduleNotionSync = useCallback(() => {
    if (!task.notion_page_id) return;
    if (notionSyncTimerRef.current) window.clearTimeout(notionSyncTimerRef.current);
    notionSyncTimerRef.current = window.setTimeout(async () => {
      notionSyncTimerRef.current = null;
      try { await invoke("notion_push_task", { taskId: task.id }); }
      catch (err: any) { console.error("[notion auto-sync]", task.id, err?.message || err); }
    }, 1500);
  }, [task.id, task.notion_page_id]);

  useEffect(() => () => {
    if (notionSyncTimerRef.current) window.clearTimeout(notionSyncTimerRef.current);
  }, []);

  // Optimistic update helper — patches cache instantly, syncs to DB in background, verifies after
  const optimisticUpdate = useCallback(async (updates: Record<string, any>, label: string) => {
    // 1. Patch cache instantly (only task-level fields, not joined relations)
    const taskFields: Record<string, any> = {};
    const relationFields: Record<string, any> = {};
    for (const [k, v] of Object.entries(updates)) {
      if (["status", "company", "contact", "project", "assignees"].includes(k)) {
        relationFields[k] = v;
      } else {
        taskFields[k] = v;
      }
    }
    const patcher = (old: TaskWithRelations[] | undefined) =>
      Array.isArray(old) ? old.map(t => t.id === task.id ? { ...t, ...taskFields, ...relationFields } as TaskWithRelations : t) : old;
    queryClient.setQueriesData<TaskWithRelations[]>({ queryKey: workKeys.tasks() }, patcher);

    // 2. Save to DB — only send actual DB columns (not joined relations)
    const { error } = await supabase.from("tasks").update(taskFields).eq("id", task.id);
    if (error) {
      toast.error(`${label} failed: ${error.message}`);
      queryClient.invalidateQueries({ queryKey: ["work"] }); // Rollback on error
      return;
    }

    // 3. Background verify — refetch after 3s to ensure consistency
    setTimeout(() => queryClient.invalidateQueries({ queryKey: ["work"] }), 3000);

    // 4. Schedule debounced push to Notion if the task is linked
    scheduleNotionSync();
  }, [task.id, queryClient, scheduleNotionSync]);

  const handleStatusChange = useCallback(async (statusId: string) => {
    setStatusOpen(false);
    setCompleting(true);
    const status = statusList.find(s => s.id === statusId);
    const clearTriage = status?.type === "complete" ? { triage_action: null, triage_score: null, triage_reason: null } : {};
    await optimisticUpdate(
      { status_id: statusId, ...clearTriage, ...(status ? { status: { id: statusId, name: status.name, type: status.type, color: status.color } } : {}) },
      "Status update"
    );
    setCompleting(false);
  }, [task.id, statusList, optimisticUpdate]);

  const handleCompanyChange = useCallback(async (companyId: string | null) => {
    setCompanyOpen(false);
    const company = companyId ? companyList.find(c => c.id === companyId) : null;
    await optimisticUpdate(
      { company_id: companyId, company: company ? { id: company.id, name: company.name, display_name: company.display_name } : null },
      "Company update"
    );
  }, [task.id, companyList, optimisticUpdate]);

  const handlePriorityChange = useCallback(async (priority: number) => {
    setPriorityOpen(false);
    await optimisticUpdate({ priority }, "Priority update");
  }, [task.id, optimisticUpdate]);

  const handleProjectChange = useCallback(async (projectId: string) => {
    setContextMenuPos(null);
    setProjectSearch("");
    if (projectId === task.project_id) return;
    const p = projectList.find(x => x.id === projectId);
    await optimisticUpdate(
      { project_id: projectId, project: p ? { id: p.id, name: p.name, color: p.color } : null },
      "Project update"
    );
  }, [task.id, task.project_id, projectList, optimisticUpdate]);

  const handleAssigneeChange = useCallback(async (userId: string) => {
    setAssigneeOpen(false);
    try {
      // Replace all assignees with the selected user
      await supabase.from("task_assignees").delete().eq("task_id", task.id);
      const { error } = await supabase.from("task_assignees").insert({ task_id: task.id, user_id: userId });
      if (error) throw error;
      toast.success("Assignee updated");
      queryClient.invalidateQueries({ queryKey: ["work"] });
    } catch (err) {
      toast.error(`Assignee update failed: ${err}`);
    }
  }, [task.id, queryClient]);

  return (
    <div
      onClick={() => onSelect(task.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenuPos({ x: e.clientX, y: e.clientY });
      }}
      className={`w-full grid items-center gap-x-2.5 px-3 py-1.5 text-left transition-colors rounded cursor-pointer ${
        selected
          ? "bg-teal-50/60 dark:bg-teal-900/15 hover:bg-teal-50 dark:hover:bg-teal-900/25"
          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
      }`}
      style={{ gridTemplateColumns: projectScoped
        ? (selectable ? "14px 16px 80px 1fr 60px 70px 80px 80px 60px 60px" : "16px 80px 1fr 60px 70px 80px 80px 60px 60px")
        : (selectable ? "14px 16px 14px 80px 16px 200px 1fr 80px 100px 50px 80px" : "16px 14px 80px 16px 200px 1fr 80px 100px 50px 80px")
      }}
    >
      {/* Selection checkbox */}
      {selectable && (
        <input type="checkbox" checked={!!selected} onClick={(e) => { e.stopPropagation(); onToggleSelect?.(task.id, (e as any).shiftKey === true); }} onChange={() => {}} className="w-3 h-3 rounded cursor-pointer accent-teal-500" aria-label="Select task" />
      )}
      {/* Status */}
      {task.status ? (
        <span ref={statusRef} onClick={(e) => { e.stopPropagation(); setStatusOpen(!statusOpen); }} className={`flex-shrink-0 cursor-pointer hover:scale-125 transition-transform ${completing ? "animate-pulse" : ""}`} title="Click to change status">
          <StatusIcon type={task.status.type as StatusType} color={task.status.color || "#6B7280"} size={14} />
        </span>
      ) : <span />}
      {/* Priority (inline for default, after title for projectScoped) */}
      {!projectScoped && (
        <span ref={priorityRef} onClick={(e) => { e.stopPropagation(); setPriorityOpen(!priorityOpen); }} className="cursor-pointer hover:scale-125 transition-transform" title="Click to change priority">
          <PriorityBars priority={task.priority || 0} size={11} />
        </span>
      )}
      {/* Identifier */}
      <span className="text-xs text-zinc-400 tabular-nums whitespace-nowrap cursor-pointer hover:text-teal-500 dark:hover:text-teal-400 transition-colors truncate" title={`Click to copy: ${task.id}`} onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(task.id); toast.success("Task ID copied"); }}>
        {getTaskIdentifier(task)}
      </span>
      {/* Notion icon (hidden in projectScoped) */}
      {!projectScoped && ((task as any).notion_page_id ? (() => {
        const lp = (task as any).last_pushed_at ? new Date((task as any).last_pushed_at).toLocaleString() : "never";
        const lu = (task as any).last_pulled_at ? new Date((task as any).last_pulled_at).toLocaleString() : "never";
        return (
        <span className={`cursor-pointer ${(task as any).source === "notion" ? "text-zinc-600 dark:text-zinc-400" : "text-teal-500 dark:text-teal-400"} hover:text-blue-500 dark:hover:text-blue-400 transition-colors`} title={`Click to sync to Notion\nLast pushed: ${lp}\nLast pulled: ${lu}`} onClick={async (e) => { e.stopPropagation(); try { await invoke("notion_push_task", { taskId: task.id }); toast.success("Synced to Notion"); } catch (err: any) { toast.error(`Sync failed: ${err?.message || err}`); } }}>
          <svg width="12" height="12" viewBox="0 0 100 100" fill="currentColor"><path d="M6.6 12.6c5.1 4.1 7 3.8 16.5 3.1l59.7-3.6c2 0 .3-2-.3-2.2L73.2 3.5c-2.7-2.2-6.5-4.6-13.5-4L8 3.2C4 3.5 3.1 5.6 4.8 7.3zm17.1 14.3v62.7c0 3.4 1.7 4.7 5.5 4.5l65.7-3.8c3.8-.2 4.3-2.6 4.3-5.4V22.6c0-2.8-1.1-4.3-3.5-4l-68.6 4c-2.7.2-3.4 1.5-3.4 4.3zM82 29c.4 1.8 0 3.5-1.8 3.7l-3.2.6v46.3c-2.8 1.5-5.3 2.3-7.5 2.3-3.4 0-4.3-1.1-6.8-4.1L42.3 46.2v30.7l6.6 1.5s0 3.5-4.8 3.5l-13.3.8c-.4-.8 0-2.7 1.3-3l3.5-1V38.3l-4.8-.4c-.4-1.8.6-4.4 3.5-4.6l14.3-.9 21.2 32.5V37l-5.5-.6c-.4-2.2 1.2-3.7 3.2-3.9z"/></svg>
        </span>
        );
      })() : <span />)}
      {/* Project context (default mode only) */}
      {!projectScoped && (
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium truncate" title={contextLabel || ""}>{contextLabel || ""}</span>
      )}
      {/* Title */}
      <span className="text-xs text-zinc-800 dark:text-zinc-200 truncate pr-2">{task.title}</span>
      {/* Triage badges (default mode only) */}
      {!projectScoped && <span className="text-right truncate flex items-center gap-1 justify-end">
        {(task as any).triage_context_matches?.length > 0 && (task as any).triage_context_matches.slice(0, 3).map((cm: any) => (
          <span key={cm.context_id} className={`text-[9px] px-1 py-0.5 rounded font-medium whitespace-nowrap ${cm.level === "customer" ? "bg-teal-500/10 text-teal-400" : cm.level === "product" ? "bg-purple-500/10 text-purple-400" : cm.level === "team" ? "bg-amber-500/10 text-amber-400" : cm.level === "individual" ? "bg-blue-500/10 text-blue-400" : "bg-zinc-500/10 text-zinc-400"}`} title={`${cm.level}: ${cm.text}`}>{cm.context_name.length > 10 ? cm.context_name.slice(0, 10) + "…" : cm.context_name}{cm.boost > 0 ? ` +${cm.boost}` : cm.boost < 0 ? ` ${cm.boost}` : ""}</span>
        ))}
        {task.triage_action && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${task.triage_action === "do_now" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : task.triage_action === "do_this_week" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : task.triage_action === "defer" ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" : task.triage_action === "delegate" ? "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400" : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"}`} title={task.triage_reason || `Score: ${task.triage_score}`}>
            {task.triage_action === "do_now" ? "Now" : task.triage_action === "do_this_week" ? "This Wk" : task.triage_action === "defer" ? "Defer" : task.triage_action === "delegate" ? "Delegate" : "Kill"}
            {task.triage_score != null && <span className="ml-1 opacity-60">{task.triage_score}</span>}
          </span>
        )}
      </span>}
      {/* Priority (projectScoped: after title) */}
      {projectScoped && (
        <span ref={priorityRef} onClick={(e) => { e.stopPropagation(); setPriorityOpen(!priorityOpen); }} className="cursor-pointer hover:scale-125 transition-transform flex items-center" title="Click to change priority">
          <PriorityBars priority={task.priority || 0} size={11} />
        </span>
      )}
      {/* Assignee(s) */}
      <div ref={assigneeRef} className="flex items-center justify-self-center cursor-pointer hover:opacity-80 transition-all" title={task.assignees?.length ? task.assignees.map(a => a.user?.name).filter(Boolean).join(", ") + " — click to change" : "Click to assign"} onClick={(e) => { e.stopPropagation(); setAssigneeOpen(!assigneeOpen); }}>
        {(task.assignees?.length || 0) > 0 ? task.assignees!.slice(0, 3).map((a, i) => (
          <div key={a.user?.id || i} className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[10px] font-medium text-zinc-600 dark:text-zinc-400 ring-1 ring-white dark:ring-zinc-950" style={{ marginLeft: i > 0 ? -6 : 0, zIndex: 3 - i }}>{a.user?.name ? initials(a.user.name) : "?"}</div>
        )) : (
          <div className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[10px] font-medium text-zinc-600 dark:text-zinc-400">?</div>
        )}
      </div>
      {/* Due date */}
      <label className="relative block w-full cursor-pointer" onClick={(e) => e.stopPropagation()}>
        <span className={`text-xs tabular-nums ${task.due_date && isOverdue(task.due_date) && task.status?.type !== "complete" ? "text-red-500" : "text-zinc-400"} hover:text-zinc-600 dark:hover:text-zinc-300`}>
          {task.due_date ? new Date(task.due_date).toLocaleDateString("en-SG", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—"}
        </span>
        <input type="date" value={task.due_date?.slice(0, 10) || ""} onChange={async (e) => { const val = e.target.value || null; await optimisticUpdate({ due_date: val, triage_action: null, triage_score: null, triage_reason: null }, "Due date update"); if (val && !isOverdue(val) && val !== new Date().toISOString().slice(0, 10)) { toast.success("Due date updated — task moved to Upcoming"); } }} className="absolute inset-0 opacity-0 cursor-pointer w-full" style={{ colorScheme: "dark" }} />
      </label>
      {/* Company */}
      <span ref={companyRef} className="text-[10px] text-zinc-400 truncate cursor-pointer hover:text-teal-500 dark:hover:text-teal-400 transition-colors" title="Click to change company" onClick={(e) => { e.stopPropagation(); setCompanyOpen(!companyOpen); }}>
        {task.company?.display_name || task.company?.name || "—"}
      </span>
      {/* Created + Updated (projectScoped only) */}
      {projectScoped && (
        <span className="text-[10px] text-zinc-400 tabular-nums" title={task.created_at ? new Date(task.created_at).toLocaleString("en-SG", { timeZone: "Asia/Singapore" }) : ""}>
          {task.created_at ? new Date(task.created_at).toLocaleDateString("en-SG", { day: "2-digit", month: "short" }) : ""}
        </span>
      )}
      {projectScoped && (
        <span className="text-[10px] text-zinc-400 tabular-nums" title={task.updated_at ? new Date(task.updated_at).toLocaleString("en-SG", { timeZone: "Asia/Singapore" }) : ""}>
          {task.updated_at ? new Date(task.updated_at).toLocaleDateString("en-SG", { day: "2-digit", month: "short" }) : ""}
        </span>
      )}

      {/* Inline dropdowns */}
      <InlineDropdown anchorRef={statusRef} open={statusOpen} onClose={() => setStatusOpen(false)}>
        {(() => {
          const typeLabels: Record<string, string> = { todo: "To-do", in_progress: "In Progress", complete: "Complete" };
          const typeOrder = ["todo", "in_progress", "complete"];
          const grouped = statusList.reduce<Record<string, typeof statusList>>((acc, s) => {
            (acc[s.type] ??= []).push(s);
            return acc;
          }, {});
          return typeOrder.filter(t => grouped[t]?.length).map(type => (
            <div key={type}>
              {Object.keys(grouped).length > 3 || statusList.length > 10 ? (
                <div className="px-3 pt-2 pb-1 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                  {typeLabels[type] || type}
                </div>
              ) : null}
              {grouped[type].map(s => (
                <DropdownItem key={s.id} selected={s.id === task.status_id} onClick={() => handleStatusChange(s.id)}>
                  <StatusIcon type={s.type as StatusType} color={s.color || "#6B7280"} size={12} />
                  {s.name}
                </DropdownItem>
              ))}
            </div>
          ));
        })()}
      </InlineDropdown>

      <InlineDropdown anchorRef={priorityRef} open={priorityOpen} onClose={() => setPriorityOpen(false)}>
        {Object.entries(PriorityLabels).map(([value, label]) => (
          <DropdownItem key={value} selected={(task.priority ?? 0) === Number(value)} onClick={() => handlePriorityChange(Number(value))}>
            <PriorityBars priority={Number(value)} size={10} />
            {label}
          </DropdownItem>
        ))}
      </InlineDropdown>

      <InlineDropdown anchorRef={companyRef} open={companyOpen} onClose={() => { setCompanyOpen(false); setCompanySearch(""); }}>
        <div className="px-2 py-1.5 sticky top-0 bg-zinc-800 z-10">
          <input
            type="text"
            value={companySearch}
            onChange={(e) => setCompanySearch(e.target.value)}
            placeholder="Search..."
            autoFocus
            className="w-full text-xs px-2 py-1 rounded bg-zinc-700 text-zinc-200 border border-zinc-600 outline-none focus:ring-2 focus:ring-teal-500/30 placeholder-zinc-500"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
        <DropdownItem selected={!task.company} onClick={() => handleCompanyChange(null)}>
          No company
        </DropdownItem>
        {companyList
          .filter(c => !companySearch || (c.display_name || c.name).toLowerCase().includes(companySearch.toLowerCase()))
          .map(c => (
          <DropdownItem key={c.id} selected={c.id === task.company?.id} onClick={() => handleCompanyChange(c.id)}>
            {c.display_name || c.name}
          </DropdownItem>
        ))}
      </InlineDropdown>

      <InlineDropdown anchorRef={assigneeRef} open={assigneeOpen} onClose={() => setAssigneeOpen(false)}>
        {userList.map(u => (
          <DropdownItem key={u.id} selected={task.assignees?.some(a => a.user?.id === u.id)} onClick={() => handleAssigneeChange(u.id)}>
            <div className="w-4 h-4 rounded-full bg-zinc-200 dark:bg-zinc-600 flex items-center justify-center text-[8px] font-medium">
              {initials(u.name)}
            </div>
            {u.name}
          </DropdownItem>
        ))}
      </InlineDropdown>

      {contextMenuPos && createPortal(
        <>
          <div
            className="fixed inset-0 z-[9998]"
            onClick={() => { setContextMenuPos(null); setProjectSearch(""); }}
            onContextMenu={(e) => { e.preventDefault(); setContextMenuPos(null); setProjectSearch(""); }}
          />
          <div
            className="fixed z-[9999] py-1 min-w-[220px] max-h-[320px] overflow-hidden flex flex-col rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 shadow-lg"
            style={{
              top: Math.min(contextMenuPos.y, window.innerHeight - 340),
              left: Math.min(contextMenuPos.x, window.innerWidth - 240),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1.5 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-700">
              Move to project
            </div>
            <div className="px-2 py-1.5 sticky top-0 bg-white dark:bg-zinc-800 z-10">
              <input
                type="text"
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                placeholder="Search projects..."
                autoFocus
                className="w-full text-xs px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-600 outline-none focus:ring-2 focus:ring-teal-500/30 placeholder-zinc-400"
              />
            </div>
            <div className="overflow-y-auto flex-1">
              {projectList.length === 0 ? (
                <div className="px-3 py-3 text-xs text-zinc-400">Loading…</div>
              ) : (
                projectList
                  .filter(p => !projectSearch || p.name.toLowerCase().includes(projectSearch.toLowerCase()))
                  .map(p => (
                    <DropdownItem key={p.id} selected={p.id === task.project_id} onClick={() => handleProjectChange(p.id)}>
                      <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: p.color || "#6B7280" }} />
                      <span className="truncate">{p.name}</span>
                    </DropdownItem>
                  ))
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
});
