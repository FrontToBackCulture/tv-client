// WorkViews: Dashboard View — tree (left) + detail (right) layout

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "../../stores/toastStore";
import { useInitiativeEmails } from "../../hooks/email/useEntityEmails";
import { Mail } from "lucide-react";
import {
  ChevronDown, ChevronRight, Pencil, Search, ArrowUpDown,
  Target, TrendingUp, CheckCircle2, AlertTriangle, Trash2,
  PanelLeftClose, PanelLeftOpen, EyeOff, Eye, GripVertical,
} from "lucide-react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { TaskWithRelations, Project, Initiative } from "../../lib/work/types";
import {
  ProjectStatusLabels,
  ProjectStatusColors,
  PriorityColors,
  Priority,
} from "../../lib/work/types";
import type { ProjectStatus } from "../../lib/work/types";
import { ProjectHealthColors } from "../../lib/work/types";
import { isOverdue } from "../../lib/date";
import { cn } from "../../lib/cn";
import { DEAL_STAGES } from "../../lib/crm/types";
import {
  HealthBadge, StatusBadge, ProgressBar, Stat, getInitiativeColor,
} from "./workViewsShared";
import type { InitiativeProjectLink } from "./workViewsShared";
import { WorkspaceDetailView } from "../workspace/WorkspaceDetailView";
import { useUsers } from "../../hooks/work/useUsers";

// Initiative detail pane (right panel)
function InitiativeDetailPane({ initiative, projects, onClose, onDeleted }: {
  initiative: Initiative | null;
  projects: Project[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const { data: users = [] } = useUsers();
  const projectIds = useMemo(() => projects.map(p => p.id), [projects]);
  const { data: initiativeEmails = [], isLoading: emailsLoading } = useInitiativeEmails(initiative?.id ?? null, projectIds);

  if (!initiative) return <div className="h-full flex items-center justify-center text-zinc-400">Initiative not found</div>;

  const updateField = async (field: string, value: any) => {
    const { supabase } = await import("../../lib/supabase");
    await supabase.from("initiatives").update({ [field]: value, updated_at: new Date().toISOString() }).eq("id", initiative.id);
    setEditing({});
    onClose(); // triggers re-render with fresh data
  };

  const deleteInitiative = async () => {
    if (!confirm(`Delete initiative "${initiative.name}"? Projects will be unlinked but not deleted.`)) return;
    const { supabase } = await import("../../lib/supabase");
    await supabase.from("initiative_projects").delete().eq("initiative_id", initiative.id);
    await supabase.from("initiatives").delete().eq("id", initiative.id);
    onDeleted();
  };

  // Compute status/health/target from projects
  const activeProjects = projects.filter(p => p.status === "active");
  const completedProjects = projects.filter(p => p.status === "completed");
  const computedStatus = projects.length === 0 ? "planned"
    : completedProjects.length === projects.length ? "completed"
    : activeProjects.length > 0 ? "active" : "planned";
  const atRiskProjects = projects.filter(p => p.health === "at_risk" || p.health === "off_track");
  const computedHealth = atRiskProjects.length > 0 ? (projects.some(p => p.health === "off_track") ? "off_track" : "at_risk") : "on_track";
  const targetDates = projects.map(p => (p as any).deal_expected_close || (p as any).target_date).filter(Boolean).sort();
  const latestTarget = targetDates.length > 0 ? targetDates[targetDates.length - 1] : null;

  const healthColors: Record<string, string> = { on_track: "#10B981", at_risk: "#F59E0B", off_track: "#EF4444" };
  const healthLabels: Record<string, string> = { on_track: "On Track", at_risk: "At Risk", off_track: "Off Track" };
  const statusLabels: Record<string, string> = { planned: "Planned", active: "Active", completed: "Completed", paused: "Paused" };

  const fields = [
    { label: "Name", field: "name", value: initiative.name, type: "text" },
    { label: "Description", field: "description", value: initiative.description, type: "textarea" },
    { label: "Owner", field: "owner_id", value: initiative.owner_id, type: "select", options: users.map(u => ({ value: u.id, label: u.name })), displayValue: users.find(u => u.id === initiative.owner_id)?.name || initiative.owner },
    { label: "Color", field: "color", value: initiative.color, type: "text" },
  ];

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-200">{initiative.name}</h2>
        <button
          onClick={() => { navigator.clipboard.writeText(initiative.id); toast.success("Initiative ID copied"); }}
          className="font-mono text-[10px] text-zinc-300 dark:text-zinc-600 hover:text-teal-500 dark:hover:text-teal-400 transition-colors cursor-pointer"
          title={initiative.id}
        >
          {initiative.id.slice(0, 8)}
        </button>
      </div>
      {initiative.description && <p className="text-xs text-zinc-500 mb-4">{initiative.description}</p>}

      <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Initiative Details</h3>
      <div className="space-y-1 text-xs max-w-lg">
        {fields.map(({ label, field, value, type, options, displayValue }: any) => (
          <div key={field} className="grid grid-cols-[120px,1fr] gap-2 items-start">
            <span className="text-zinc-400 py-1">{label}</span>
            {editing[field] ? (
              type === "select" && options ? (
                <select
                  autoFocus
                  value={drafts[field] ?? String(value ?? "")}
                  onChange={async (e) => {
                    if (field === "owner_id") {
                      const user = users.find((u: any) => u.id === e.target.value);
                      const { supabase } = await import("../../lib/supabase");
                      await supabase.from("initiatives").update({ owner_id: e.target.value || null, owner: user?.name || null, updated_at: new Date().toISOString() }).eq("id", initiative!.id);
                      setEditing({});
                      onClose();
                    } else {
                      updateField(field, e.target.value || null);
                    }
                  }}
                  onBlur={() => setEditing({})}
                  className="text-xs border border-teal-400 rounded px-1.5 py-1 bg-white dark:bg-zinc-900 outline-none"
                >
                  <option value="">—</option>
                  {options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : type === "textarea" ? (
                <textarea
                  autoFocus
                  value={drafts[field] ?? String(value ?? "")}
                  onChange={(e) => setDrafts({ ...drafts, [field]: e.target.value })}
                  onBlur={() => { updateField(field, drafts[field] || null); }}
                  onKeyDown={(e) => { if (e.key === "Escape") setEditing({}); }}
                  rows={3}
                  className="text-xs border border-teal-400 rounded px-1.5 py-1 bg-white dark:bg-zinc-900 outline-none resize-none"
                />
              ) : (
                <input
                  autoFocus
                  type={type === "date" ? "date" : "text"}
                  value={drafts[field] ?? String(value ?? "")}
                  onChange={(e) => setDrafts({ ...drafts, [field]: e.target.value })}
                  onBlur={() => { updateField(field, drafts[field] || null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") updateField(field, drafts[field] || null); if (e.key === "Escape") setEditing({}); }}
                  className="text-xs border border-teal-400 rounded px-1.5 py-1 bg-white dark:bg-zinc-900 outline-none"
                />
              )
            ) : (
              <button
                onClick={() => { setDrafts({ [field]: String(value ?? "") }); setEditing({ [field]: true }); }}
                className="text-left w-full min-h-[20px] cursor-pointer hover:bg-teal-50 dark:hover:bg-teal-950/20 rounded px-1.5 py-0.5 -mx-1 transition-colors border border-transparent hover:border-teal-200 dark:hover:border-teal-800"
              >
                {(displayValue || value) ? <span className="text-zinc-700 dark:text-zinc-300">{displayValue || String(value)}</span> : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
              </button>
            )}
          </div>
        ))}

        {/* Computed fields (read-only) */}
        <div className="grid grid-cols-[120px,1fr] gap-2 items-start">
          <span className="text-zinc-400 py-1">Status</span>
          <span className={`py-1 px-2 rounded-full text-[10px] font-medium inline-block w-fit ${
            computedStatus === "active" ? "bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400"
            : computedStatus === "completed" ? "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400"
            : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
          }`}>{statusLabels[computedStatus] || computedStatus}</span>
        </div>
        <div className="grid grid-cols-[120px,1fr] gap-2 items-start">
          <span className="text-zinc-400 py-1">Health</span>
          <span className="py-1 flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: healthColors[computedHealth] }} />
            <span className="text-zinc-700 dark:text-zinc-300">{healthLabels[computedHealth]}</span>
            {atRiskProjects.length > 0 && <span className="text-zinc-400 text-[10px]">({atRiskProjects.length} project{atRiskProjects.length > 1 ? "s" : ""})</span>}
          </span>
        </div>
        <div className="grid grid-cols-[120px,1fr] gap-2 items-start">
          <span className="text-zinc-400 py-1">Target Date</span>
          <span className="text-zinc-700 dark:text-zinc-300 py-1">{latestTarget ? new Date(latestTarget).toLocaleDateString() : "—"}</span>
        </div>
      </div>

      {/* Linked projects — sorted by deal stage, with status badges */}
      <div className="mt-6">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Projects ({projects.length})</h3>
        <div className="space-y-0.5">
          {[...projects]
            .sort((a, b) => {
              const stageOrder = ["won", "negotiation", "proposal", "pilot", "qualified", "lead", "prospect", "target"];
              const ai = stageOrder.indexOf((a as any).deal_stage || "");
              const bi = stageOrder.indexOf((b as any).deal_stage || "");
              if (ai !== bi) return ai - bi;
              return (a.name || "").localeCompare(b.name || "");
            })
            .map(p => {
              const stage = (p as any).deal_stage;
              const stageLabel = DEAL_STAGES.find(s => s.value === stage)?.label;
              return (
                <div key={p.id} className="flex items-center gap-2 text-xs py-1 px-1 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                  <div className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ backgroundColor: p.color || "#6B7280" }} />
                  <span className="text-zinc-700 dark:text-zinc-300 flex-1 min-w-0 truncate">{p.name}</span>
                  {stageLabel && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 flex-shrink-0">{stageLabel}</span>
                  )}
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                    p.status === "active" ? "bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400"
                    : p.status === "completed" ? "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800"
                  }`}>{p.status}</span>
                </div>
              );
            })}
        </div>
      </div>

      {/* Emails — rolled up from all projects */}
      <div className="mt-6">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Mail size={12} />
          Emails ({initiativeEmails.length})
        </h3>
        {emailsLoading ? (
          <p className="text-xs text-zinc-400">Loading emails...</p>
        ) : initiativeEmails.length === 0 ? (
          <p className="text-xs text-zinc-400">No emails linked to projects in this initiative.</p>
        ) : (
          <div className="space-y-0.5 max-h-[300px] overflow-y-auto">
            {initiativeEmails.map((email) => {
              const projectName = projects.find(p => p.id === email.entity_id)?.name;
              return (
                <div key={email.id} className="flex items-start gap-2 text-xs py-1.5 px-2 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800/30 group">
                  <Mail size={11} className="text-zinc-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-zinc-700 dark:text-zinc-300 truncate font-medium">{email.subject || "(no subject)"}</div>
                    <div className="flex items-center gap-2 text-[10px] text-zinc-400 mt-0.5">
                      <span>{email.from_name || email.from_email}</span>
                      {email.received_at && <span>{new Date(email.received_at).toLocaleDateString()}</span>}
                      {projectName && (
                        <span className="px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">{projectName}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete */}
      <div className="mt-8 pt-4 border-t border-zinc-100 dark:border-zinc-800">
        <button
          onClick={deleteInitiative}
          className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 rounded px-2 py-1.5 transition-colors"
        >
          <Trash2 size={12} />
          Delete Initiative
        </button>
      </div>
    </div>
  );
}

// Sortable initiative row for drag-and-drop reordering
function SortableInitiativeRow({
  init, initIndex, isExpanded, isSelected, derivedStatus, activeCount,
  onToggle, onSelect, onEdit, children,
}: {
  init: Initiative;
  initIndex: number;
  isExpanded: boolean;
  isSelected: boolean;
  derivedStatus: string;
  activeCount: number;
  onToggle: () => void;
  onSelect: () => void;
  onEdit?: () => void;
  children?: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: init.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={cn(
          "w-full flex items-center gap-1.5 pl-1 pr-0 py-2 transition-colors group cursor-pointer",
          isSelected
            ? "bg-teal-50 dark:bg-teal-950/30"
            : "hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
        )}
      >
        <button
          {...attributes}
          {...listeners}
          className="p-0.5 text-zinc-300 hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 cursor-grab active:cursor-grabbing"
          title="Drag to reorder"
        >
          <GripVertical size={12} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onToggle(); }} className="p-0.5 text-zinc-400 hover:text-zinc-600 flex-shrink-0">
          {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        </button>
        <div className="flex items-center gap-1.5 min-w-0 flex-1" onClick={onSelect}>
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: getInitiativeColor(init, initIndex) }} />
          <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 truncate">{init.name}</span>
          <span className="text-[9px] text-zinc-400 ml-0.5">{activeCount}</span>
        </div>
        <div className="ml-auto flex items-center flex-shrink-0">
          {onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="p-0.5 rounded text-zinc-400 hover:text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity mr-1"
            ><Pencil size={9} /></button>
          )}
        </div>
        <div className="w-[70px] flex justify-end flex-shrink-0 mr-2">
          <StatusBadge status={derivedStatus} />
        </div>
      </div>
      {children}
    </div>
  );
}

export function DashboardView({
  projects, allTasks, initiatives, initiativeLinks, taskDealLinks, onEditInitiative, onUpdateProject, onInitiativeLinkChanged, onCreateTask,
}: {
  projects: Project[];
  allTasks: TaskWithRelations[];
  initiatives: Initiative[];
  initiativeLinks: InitiativeProjectLink[];
  onEditInitiative?: (initiative: Initiative) => void;
  taskDealLinks?: { task_id: string; deal_id: string }[];
  onUpdateProject?: (id: string, updates: Record<string, any>) => void;
  onInitiativeLinkChanged?: (projectId: string, initiativeId: string | null) => Promise<void>;
  onCreateTask?: (projectId: string) => void;
}) {
  // Persist selected project across refreshes
  const SELECTED_PROJECT_KEY = "tv-dashboard-selected-project";

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    // Start with all collapsed — will be reconciled when initiatives load
    const allIds = new Set<string>();
    for (const init of initiatives) allIds.add(init.id);
    allIds.add("__unassigned");
    return allIds;
  });
  const [allCollapsed, setAllCollapsed] = useState(true);
  const hasInitializedCollapse = useRef(false);

  // When initiatives load (async), ensure all groups start collapsed
  useEffect(() => {
    if (initiatives.length === 0 || hasInitializedCollapse.current) return;
    hasInitializedCollapse.current = true;
    const allIds = new Set<string>();
    for (const init of initiatives) allIds.add(init.id);
    allIds.add("__unassigned");
    setCollapsedGroups(allIds);
    setAllCollapsed(true);
  }, [initiatives]);

  const toggleCollapseAll = () => {
    if (allCollapsed) {
      // Expand all
      setCollapsedGroups(new Set());
      setAllCollapsed(false);
    } else {
      // Collapse all — collect all group IDs
      const allIds = new Set<string>();
      for (const init of initiatives) allIds.add(init.id);
      allIds.add("__unassigned");
      setCollapsedGroups(allIds);
      setAllCollapsed(true);
    }
  };
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectIdRaw] = useState<string | null>(() => {
    try { return localStorage.getItem(SELECTED_PROJECT_KEY) || null; } catch { return null; }
  });
  const setSelectedProjectId = useCallback((id: string | null) => {
    setSelectedProjectIdRaw(id);
    try {
      if (id) localStorage.setItem(SELECTED_PROJECT_KEY, id);
      else localStorage.removeItem(SELECTED_PROJECT_KEY);
    } catch {}
  }, []);
  const [selectedInitiativeId, setSelectedInitiativeId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ projectId: string; x: number; y: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [hideCompleted, setHideCompleted] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "tasks" | "status" | "target">("name");
  const [sidebarWidth, setSidebarWidthRaw] = useState(() => {
    try { return parseInt(localStorage.getItem("tv-dashboard-sidebar-width") || "400", 10); } catch { return 400; }
  });
  const setSidebarWidth = useCallback((w: number | ((prev: number) => number)) => {
    setSidebarWidthRaw(prev => {
      const next = typeof w === "function" ? w(prev) : w;
      try { localStorage.setItem("tv-dashboard-sidebar-width", String(next)); } catch {}
      return next;
    });
  }, []);
  const [sidebarCollapsed, setSidebarCollapsedRaw] = useState(() => {
    try { return localStorage.getItem("tv-dashboard-sidebar-collapsed") === "true"; } catch { return false; }
  });
  const setSidebarCollapsed = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    setSidebarCollapsedRaw(prev => {
      const next = typeof v === "function" ? v(prev) : v;
      try { localStorage.setItem("tv-dashboard-sidebar-collapsed", String(next)); } catch {}
      return next;
    });
  }, []);
  const dragging = useRef(false);

  // Initiative reorder (drag-and-drop)
  const queryClient = useQueryClient();

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleInitiativeDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = initiatives.findIndex(i => i.id === active.id);
    const newIndex = initiatives.findIndex(i => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(initiatives, oldIndex, newIndex);

    // Optimistic update
    queryClient.setQueryData(["work", "initiatives"], reordered);

    // Persist all sort_order values
    const { supabase } = await import("../../lib/supabase");
    await Promise.all(
      reordered.map((init, idx) =>
        supabase.from("initiatives").update({ sort_order: idx }).eq("id", init.id)
      )
    );
    queryClient.invalidateQueries({ queryKey: ["work", "initiatives"] });
  }, [initiatives, queryClient]);

  const toggleGroup = (id: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startW = sidebarWidth;
    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      setSidebarWidth(Math.min(800, Math.max(280, startW + ev.clientX - startX)));
    };
    const onMouseUp = () => {
      dragging.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [sidebarWidth]);

  const activeProjects = projects.filter(p => p.status === "active");
  const activeProjectIds = new Set(activeProjects.map(p => p.id));
  const activeProjectCount = activeProjects.length;
  // Only count tasks from active projects, split by notion vs manual
  const activeTasks = allTasks.filter(t => activeProjectIds.has(t.project_id));
  const manualTasks = activeTasks.filter(t => !(t as any).notion_page_id);
  const notionTasks = activeTasks.filter(t => !!(t as any).notion_page_id);
  const totalTasks = manualTasks.length;
  const overdueTasks = manualTasks.filter(t =>
    isOverdue(t.due_date) && t.status?.type !== "completed" && t.status?.type !== "canceled"
  ).length;
  const completedTasks = manualTasks.filter(t => t.status?.type === "completed").length;
  const inProgressTasks = manualTasks.filter(t => t.status?.type === "started" || t.status?.type === "review").length;
  const todoTasks = manualTasks.filter(t => t.status?.type === "unstarted" || t.status?.type === "backlog").length;
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
    const addCount = (pid: string, t: TaskWithRelations) => {
      const current = map.get(pid) || { total: 0, completed: 0, overdue: 0 };
      current.total++;
      if (t.status?.type === "completed") current.completed++;
      if (isOverdue(t.due_date) && t.status?.type !== "completed" && t.status?.type !== "canceled") current.overdue++;
      map.set(pid, current);
    };
    const counted = new Set<string>();
    for (const t of allTasks) {
      const key1 = `${t.id}:${t.project_id}`;
      if (!counted.has(key1)) { addCount(t.project_id, t); counted.add(key1); }
    }
    if (taskDealLinks) {
      const taskMap = new Map(allTasks.map(t => [t.id, t]));
      for (const link of taskDealLinks) {
        const t = taskMap.get(link.task_id);
        if (t) {
          const key = `${t.id}:${link.deal_id}`;
          if (!counted.has(key)) { addCount(link.deal_id, t); counted.add(key); }
        }
      }
    }
    return map;
  }, [allTasks, taskDealLinks]);

  const projectById = useMemo(() => {
    const map = new Map<string, Project>();
    for (const p of projects) map.set(p.id, p);
    return map;
  }, [projects]);

  const projectInitiativeMap = useMemo(() => {
    const map = new Map<string, Initiative>();
    for (const link of initiativeLinks) {
      const init = initiatives.find(i => i.id === link.initiative_id);
      if (init) map.set(link.project_id, init);
    }
    return map;
  }, [initiativeLinks, initiatives]);

  const sortProjects = useCallback((list: Project[]) => {
    return [...list].sort((a, b) => {
      // Active projects always float to top
      const aActive = a.status === "active" ? 0 : 1;
      const bActive = b.status === "active" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;

      // Within same active/inactive group, apply chosen sort
      if (sortBy === "tasks") {
        const ca = projectTaskCounts.get(a.id)?.total || 0;
        const cb = projectTaskCounts.get(b.id)?.total || 0;
        if (cb !== ca) return cb - ca;
      } else if (sortBy === "status") {
        const order: Record<string, number> = { active: 0, planned: 1, paused: 2, completed: 3 };
        const sa = order[a.status || ""] ?? 4;
        const sb = order[b.status || ""] ?? 4;
        if (sa !== sb) return sa - sb;
      }

      // Sort by target_date (latest date first, nulls last)
      const aDate = a.target_date ? new Date(a.target_date).getTime() : 0;
      const bDate = b.target_date ? new Date(b.target_date).getTime() : 0;
      if (aDate !== bDate) {
        if (!aDate) return 1;  // no date → bottom
        if (!bDate) return -1;
        return bDate - aDate;  // latest date first
      }

      return a.name.localeCompare(b.name);
    });
  }, [sortBy, projectTaskCounts]);

  const filterProjects = useCallback((list: Project[]) => {
    let filtered = list;
    if (hideCompleted) filtered = filtered.filter(p => p.status !== "completed");
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p => p.name.toLowerCase().includes(q));
    }
    return filtered;
  }, [searchQuery, hideCompleted]);

  const unassignedProjects = useMemo(() => {
    return sortProjects(filterProjects(projects.filter(p => !projectInitiativeMap.has(p.id))));
  }, [projects, projectInitiativeMap, sortProjects, filterProjects]);

  // Stage order for deal sub-grouping
  const stageOrder = DEAL_STAGES.map(s => s.value);

  // Render a list of projects, sub-grouping deals by stage
  const renderProjectList = (projectList: Project[]) => {
    const deals = projectList.filter(p => p.project_type === "deal");
    const nonDeals = projectList.filter(p => p.project_type !== "deal");

    // Group deals by stage
    const stageGroups = new Map<string, Project[]>();
    for (const d of deals) {
      const stage = d.deal_stage || "unknown";
      const arr = stageGroups.get(stage) || [];
      arr.push(d);
      stageGroups.set(stage, arr);
    }

    // Sort stage groups by pipeline order
    const sortedStages = [...stageGroups.entries()].sort((a, b) => {
      const ia = stageOrder.indexOf(a[0] as any);
      const ib = stageOrder.indexOf(b[0] as any);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    return (
      <>
        {/* Non-deal projects first (flat) */}
        {nonDeals.map(p => renderProjectRow(p))}

        {/* Deal projects grouped by stage */}
        {sortedStages.map(([stage, stageProjects]) => {
          const stageInfo = DEAL_STAGES.find(s => s.value === stage);
          const isStageExpanded = !collapsedGroups.has(`stage-${stage}`);

          return (
            <div key={`stage-${stage}`}>
              <button
                onClick={() => toggleGroup(`stage-${stage}`)}
                className="w-full flex items-center gap-1.5 pr-3 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
                style={{ paddingLeft: "2rem" }}
              >
                {isStageExpanded ? <ChevronDown size={9} className="text-zinc-400" /> : <ChevronRight size={9} className="text-zinc-400" />}
                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">{stageInfo?.label || stage}</span>
                <span className="text-[9px] text-zinc-400">{stageProjects.length}</span>
              </button>
              {isStageExpanded && stageProjects.map(p => renderProjectRow(p, true))}
            </div>
          );
        })}
      </>
    );
  };

  // Render a project row in the tree
  const renderProjectRow = (p: Project, indentExtra = false) => {
    const counts = projectTaskCounts.get(p.id) || { total: 0, completed: 0, overdue: 0 };
    const isSelected = selectedProjectId === p.id;
    const isDimmed = p.status === "completed" || p.status === "paused";

    return (
      <div
        key={p.id}
        onClick={() => { setSelectedProjectId(p.id); setSelectedInitiativeId(null); }}
        onContextMenu={(e) => { e.preventDefault(); setContextMenu({ projectId: p.id, x: e.clientX, y: e.clientY }); }}
        className={`grid grid-cols-[1fr,55px,30px,50px,70px] gap-1 items-center pr-2 py-1.5 cursor-pointer transition-colors group ${
          isSelected
            ? "bg-teal-50 dark:bg-teal-950/30"
            : "hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
        } ${isDimmed ? "opacity-50" : ""}`}
        style={{ paddingLeft: indentExtra ? "3rem" : "2.5rem" }}
      >
        {/* Name + Health + Priority */}
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-3 flex items-center justify-center flex-shrink-0">
            {p.health && p.health !== "on_track" ? (
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: (ProjectHealthColors as any)[p.health],
                  boxShadow: `0 0 0 2px white, 0 0 0 3px ${(ProjectHealthColors as any)[p.health]}`,
                }}
                title={p.health.replace("_", " ")}
              />
            ) : (
              <div className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: p.color || "#6B7280" }} />
            )}
          </div>
          <span className={`text-[11px] truncate ${isSelected ? "text-teal-700 dark:text-teal-300 font-medium" : "text-zinc-700 dark:text-zinc-300"}`}>
            {p.name}
          </span>
          {p.priority != null && p.priority > 0 && p.priority <= 2 && (
            <span
              className="text-[9px] px-1 py-px rounded font-semibold flex-shrink-0 leading-tight"
              style={{
                color: PriorityColors[p.priority as Priority],
                backgroundColor: `${PriorityColors[p.priority as Priority]}15`,
              }}
              title={`Priority: ${Priority[p.priority] || p.priority}`}
            >
              {p.priority === 1 ? "URGENT" : "HIGH"}
            </span>
          )}
        </div>

        {/* Type */}
        <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
          {editingTypeId === p.id ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setEditingTypeId(null)} />
              <div className="absolute mt-5 z-20 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg py-1 min-w-[100px]">
                {(["work", "deal"] as const).map(t => (
                  <button key={t} onClick={() => { onUpdateProject?.(p.id, { project_type: t }); setEditingTypeId(null); }}
                    className={`w-full text-left px-3 py-1 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 ${(p.project_type || "work") === t ? "font-medium text-teal-600" : ""}`}
                  >{t}</button>
                ))}
              </div>
            </>
          ) : (
            <button onClick={() => setEditingTypeId(p.id)}
              className={`text-[8px] px-1 py-0 rounded-full font-semibold uppercase tracking-wider ${
                p.project_type === "deal" ? "bg-blue-50 dark:bg-blue-900/30 text-blue-500"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400"
              }`}
            >{p.project_type || "work"}</button>
          )}
        </div>

        {/* Days in Stage */}
        <span className={`text-[9px] tabular-nums text-right ${
          p.deal_stage_changed_at ? (() => {
            const d = Math.floor((Date.now() - new Date(p.deal_stage_changed_at).getTime()) / (1000 * 60 * 60 * 24));
            return d > 30 ? "text-red-500" : d > 14 ? "text-amber-500" : "text-zinc-400";
          })() : ""
        }`} title={p.deal_stage_changed_at ? "Days in current stage" : undefined}>
          {p.deal_stage_changed_at ? `${Math.floor((Date.now() - new Date(p.deal_stage_changed_at).getTime()) / (1000 * 60 * 60 * 24))}d` : ""}
        </span>

        {/* Progress */}
        <div className="w-full">
          <ProgressBar completed={counts.completed} total={counts.total} color={p.color || "#0D7680"} />
        </div>

        {/* Status */}
        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          {editingStatusId === p.id ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setEditingStatusId(null)} />
              <div className="absolute mt-5 z-20 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg py-1 min-w-[110px]">
                {(["planned", "active", "completed", "paused"] as ProjectStatus[]).map(s => (
                  <button key={s} onClick={() => { onUpdateProject?.(p.id, { status: s }); setEditingStatusId(null); }}
                    className={`w-full text-left px-3 py-1 text-xs flex items-center gap-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 ${p.status === s ? "font-medium" : ""}`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ProjectStatusColors[s] }} />
                    <span style={{ color: p.status === s ? ProjectStatusColors[s] : undefined }}>{ProjectStatusLabels[s]}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <button onClick={() => setEditingStatusId(p.id)}
              className="inline-flex items-center gap-0.5 text-[9px] font-medium"
              style={{ color: ProjectStatusColors[p.status as ProjectStatus] || "#6B7280" }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ProjectStatusColors[p.status as ProjectStatus] || "#6B7280" }} />
              {ProjectStatusLabels[p.status as ProjectStatus] || p.status || "—"}
            </button>
          )}
        </div>

      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Stats row — scoped to active projects, manual tasks only (excludes Notion-synced) */}
      <div className="flex-shrink-0 grid grid-cols-5 gap-3 p-4 border-b border-zinc-100 dark:border-zinc-800/50">
        <Stat label="Active Projects" value={activeProjectCount} icon={Target} color="#0D7680" />
        <Stat label={`${todoTasks} todo · ${inProgressTasks} in progress`} value={totalTasks} icon={CheckCircle2} color="#3B82F6" />
        <Stat label="Overdue" value={overdueTasks} icon={AlertTriangle} color={overdueTasks > 0 ? "#EF4444" : "#9CA3AF"} />
        <Stat label={`${completedTasks} completed`} value={`${completionRate}%`} icon={TrendingUp} color="#10B981" />
        <Stat label="Notion Tasks (excluded)" value={notionTasks.length} icon={CheckCircle2} color="#9CA3AF" />
      </div>

      {/* Body: tree (left) + detail (right) */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: Project tree */}
        <div className="flex-shrink-0 flex flex-col border-r border-zinc-100 dark:border-zinc-800/50 transition-all duration-200" style={{ width: sidebarCollapsed ? 40 : sidebarWidth }}>
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center py-2">
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="p-1.5 rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                title="Expand panel"
              >
                <PanelLeftOpen size={14} />
              </button>
            </div>
          ) : (
          <>
          {/* Tree header */}
          <div className="flex-shrink-0 border-b border-zinc-100 dark:border-zinc-800/50">
            <div className="flex items-center gap-2 px-3 py-1.5">
              {/* Collapse panel */}
              <button
                onClick={() => setSidebarCollapsed(true)}
                className="p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors flex-shrink-0"
                title="Collapse panel"
              >
                <PanelLeftClose size={12} />
              </button>
              {/* Search */}
              <div className="flex items-center gap-1 flex-1 bg-zinc-50 dark:bg-zinc-900 rounded px-2 py-1">
                <Search size={11} className="text-zinc-400 flex-shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search projects..."
                  className="text-[11px] bg-transparent border-none outline-none w-full text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400"
                />
              </div>
              {/* Sort */}
              <button
                onClick={() => setSortBy(prev => prev === "name" ? "target" : prev === "target" ? "tasks" : prev === "tasks" ? "status" : "name")}
                className="flex items-center gap-0.5 text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors flex-shrink-0"
                title={`Sort by: ${sortBy}`}
              >
                <ArrowUpDown size={10} />
                {{ name: "name", target: "target date", tasks: "tasks", status: "status" }[sortBy]}
              </button>
              {/* Hide completed */}
              <button
                onClick={() => setHideCompleted(prev => !prev)}
                className={cn(
                  "flex items-center gap-1 text-[10px] transition-colors flex-shrink-0 px-1.5 py-0.5 rounded",
                  hideCompleted
                    ? "text-teal-600 bg-teal-50 dark:text-teal-400 dark:bg-teal-950/40"
                    : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                )}
                title={hideCompleted ? "Show completed projects" : "Hide completed projects"}
              >
                {hideCompleted ? <EyeOff size={10} /> : <Eye size={10} />}
                {hideCompleted ? "Hidden" : "Done"}
              </button>
              {/* Collapse all */}
              <button
                onClick={toggleCollapseAll}
                className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors flex-shrink-0"
              >
                {allCollapsed ? "Expand" : "Collapse"}
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
          {/* Initiative groups (drag-and-drop reorderable) */}
          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleInitiativeDragEnd}>
            <SortableContext items={initiatives.map(i => i.id)} strategy={verticalListSortingStrategy}>
              {initiatives.map((init, initIndex) => {
                const linkedProjectIds = initProjectMap.get(init.id) || [];
                const allLinkedProjects = linkedProjectIds
                  .map(id => projectById.get(id))
                  .filter((p): p is Project => !!p);
                const linkedProjects = sortProjects(filterProjects(allLinkedProjects));
                const isExpanded = !collapsedGroups.has(init.id);

                // Derive initiative status from child projects
                const derivedStatus = (() => {
                  if (allLinkedProjects.length === 0) return "planned";
                  if (allLinkedProjects.every(p => p.status === "completed")) return "completed";
                  if (allLinkedProjects.some(p => p.status === "active" || p.status === "started")) return "active";
                  if (allLinkedProjects.every(p => p.status === "paused")) return "paused";
                  return "planned";
                })();

                // Hide initiative when filtering completed and no visible projects remain
                if (hideCompleted && linkedProjects.length === 0) return null;

                return (
                  <SortableInitiativeRow
                    key={init.id}
                    init={init}
                    initIndex={initIndex}
                    isExpanded={isExpanded}
                    isSelected={selectedInitiativeId === init.id && !selectedProjectId}
                    derivedStatus={derivedStatus}
                    activeCount={allLinkedProjects.filter(p => p.status === "active").length}
                    onToggle={() => toggleGroup(init.id)}
                    onSelect={() => { setSelectedInitiativeId(init.id); setSelectedProjectId(null); }}
                    onEdit={onEditInitiative ? () => onEditInitiative(init) : undefined}
                  >
                    {isExpanded && renderProjectList(linkedProjects)}
                  </SortableInitiativeRow>
                );
              })}
            </SortableContext>
          </DndContext>

          {/* Unassigned */}
          {unassignedProjects.length > 0 && (
            <div>
              <button
                onClick={() => toggleGroup("__unassigned")}
                className="w-full flex items-center gap-1.5 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors border-t border-zinc-100 dark:border-zinc-800/50"
              >
                {!collapsedGroups.has("__unassigned") ? <ChevronDown size={10} className="text-zinc-400" /> : <ChevronRight size={10} className="text-zinc-400" />}
                <span className="w-2 h-2 rounded-full bg-zinc-300 flex-shrink-0" />
                <span className="text-xs font-semibold text-zinc-500">Unassigned</span>
                <span className="text-[9px] text-zinc-400 ml-0.5">{unassignedProjects.length}</span>
              </button>
              {!collapsedGroups.has("__unassigned") && renderProjectList(unassignedProjects)}
            </div>
          )}
          </div>
          </>
          )}
        </div>

        {/* Resize handle */}
        {!sidebarCollapsed && (
        <div
          onMouseDown={onMouseDown}
          className="w-1 flex-shrink-0 cursor-col-resize hover:bg-teal-500/30 active:bg-teal-500/50 transition-colors"
        />
        )}

        {/* RIGHT: Project detail */}
        <div className="flex-1 overflow-hidden">
          {selectedProjectId ? (
            <WorkspaceDetailView
              workspaceId={selectedProjectId}
              onBack={() => setSelectedProjectId(null)}
              onUpdated={() => {}}
              onCreateTask={onCreateTask ? () => onCreateTask(selectedProjectId) : undefined}
              onNavigateToProject={(id) => setSelectedProjectId(id)}
            />
          ) : selectedInitiativeId ? (
            <InitiativeDetailPane
              initiative={initiatives.find(i => i.id === selectedInitiativeId) || null}
              projects={(() => {
                const ids = initProjectMap.get(selectedInitiativeId) || [];
                return ids.map(id => projectById.get(id)).filter((p): p is Project => !!p);
              })()}
              onClose={() => setSelectedInitiativeId(null)}
              onDeleted={() => { setSelectedInitiativeId(null); }}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-zinc-400 text-sm">
              Select a project or initiative to view details
            </div>
          )}
        </div>
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
          <div
            className="fixed z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-1 min-w-[180px] max-h-[300px] overflow-y-auto"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 200),
              top: contextMenu.y + 300 > window.innerHeight ? contextMenu.y - Math.min(300, (initiatives.length + 2) * 32) : contextMenu.y,
            }}
          >
            <div className="px-3 py-1.5 text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">Move to Initiative</div>
            <button
              onClick={async () => { await onInitiativeLinkChanged?.(contextMenu.projectId, null); setContextMenu(null); }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-500 flex items-center gap-2"
            >
              <span className="w-2 h-2 rounded-full bg-zinc-300 flex-shrink-0" />
              Unassigned
            </button>
            {initiatives.map((init, initIndex) => {
              const isLinked = projectInitiativeMap.get(contextMenu.projectId)?.id === init.id;
              return (
                <button key={init.id}
                  onClick={async () => { await onInitiativeLinkChanged?.(contextMenu.projectId, init.id); setContextMenu(null); }}
                  className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 ${isLinked ? "bg-zinc-50 dark:bg-zinc-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-800"}`}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: getInitiativeColor(init, initIndex) }} />
                  <span className={isLinked ? "font-medium text-teal-600" : ""}>{init.name}</span>
                  {isLinked && <CheckCircle2 size={11} className="ml-auto text-teal-500" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
