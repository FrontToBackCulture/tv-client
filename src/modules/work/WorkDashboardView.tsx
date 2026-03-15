// WorkViews: Dashboard View — tree (left) + detail (right) layout

import { useState, useMemo, useRef, useCallback } from "react";
import {
  ChevronDown, ChevronRight, Pencil, Search, ArrowUpDown,
  Target, TrendingUp, CheckCircle2, AlertTriangle, Trash2,
} from "lucide-react";
import type { TaskWithRelations, Project, Initiative } from "../../lib/work/types";
import {
  ProjectStatusLabels,
  ProjectStatusColors,
} from "../../lib/work/types";
import type { ProjectStatus } from "../../lib/work/types";
import { isOverdue } from "../../lib/date";
import { cn } from "../../lib/cn";
import { DEAL_STAGES } from "../../lib/crm/types";
import {
  HealthBadge, StatusBadge, ProgressBar, Stat,
} from "./workViewsShared";
import type { InitiativeProjectLink } from "./workViewsShared";
import { WorkspaceDetailView } from "../workspace/WorkspaceDetailView";

// Initiative detail pane (right panel)
function InitiativeDetailPane({ initiative, projects, onClose, onDeleted }: {
  initiative: Initiative | null;
  projects: Project[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});

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

  const fields = [
    { label: "Name", field: "name", value: initiative.name, type: "text" },
    { label: "Description", field: "description", value: initiative.description, type: "textarea" },
    { label: "Owner", field: "owner", value: initiative.owner, type: "text" },
    { label: "Status", field: "status", value: initiative.status, type: "select", options: [{ value: "planned", label: "Planned" }, { value: "active", label: "Active" }, { value: "completed", label: "Completed" }, { value: "paused", label: "Paused" }] },
    { label: "Health", field: "health", value: initiative.health, type: "select", options: [{ value: "on_track", label: "On Track" }, { value: "at_risk", label: "At Risk" }, { value: "off_track", label: "Off Track" }] },
    { label: "Target Date", field: "target_date", value: initiative.target_date, type: "date" },
    { label: "Color", field: "color", value: initiative.color, type: "text" },
  ];

  return (
    <div className="h-full overflow-y-auto p-6">
      <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-200 mb-1">{initiative.name}</h2>
      {initiative.description && <p className="text-xs text-zinc-500 mb-4">{initiative.description}</p>}

      <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Initiative Details</h3>
      <div className="space-y-1 text-xs max-w-lg">
        {fields.map(({ label, field, value, type, options }) => (
          <div key={field} className="grid grid-cols-[120px,1fr] gap-2 items-start">
            <span className="text-zinc-400 py-1">{label}</span>
            {editing[field] ? (
              type === "select" && options ? (
                <select
                  autoFocus
                  value={drafts[field] ?? String(value ?? "")}
                  onChange={(e) => { updateField(field, e.target.value || null); }}
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
                {value ? <span className="text-zinc-700 dark:text-zinc-300">{String(value)}</span> : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Linked projects */}
      <div className="mt-6">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Projects ({projects.length})</h3>
        <div className="space-y-1">
          {projects.map(p => (
            <div key={p.id} className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
              <div className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: p.color || "#6B7280" }} />
              <span className="truncate">{p.name}</span>
            </div>
          ))}
        </div>
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

export function DashboardView({
  projects, allTasks, initiatives, initiativeLinks, taskDealLinks, onEditInitiative, onUpdateProject, onInitiativeLinkChanged,
}: {
  projects: Project[];
  allTasks: TaskWithRelations[];
  initiatives: Initiative[];
  initiativeLinks: InitiativeProjectLink[];
  onEditInitiative?: (initiative: Initiative) => void;
  taskDealLinks?: { task_id: string; deal_id: string }[];
  onUpdateProject?: (id: string, updates: Record<string, any>) => void;
  onInitiativeLinkChanged?: (projectId: string, initiativeId: string | null) => Promise<void>;
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [allCollapsed, setAllCollapsed] = useState(false);

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
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedInitiativeId, setSelectedInitiativeId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ projectId: string; x: number; y: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "tasks" | "status">("name");
  const [sidebarWidth, setSidebarWidth] = useState(400);
  const dragging = useRef(false);

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
      if (t.crm_deal_id && t.crm_deal_id !== t.project_id) {
        const key2 = `${t.id}:${t.crm_deal_id}`;
        if (!counted.has(key2)) { addCount(t.crm_deal_id, t); counted.add(key2); }
      }
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
      return a.name.localeCompare(b.name);
    });
  }, [sortBy, projectTaskCounts]);

  const filterProjects = useCallback((list: Project[]) => {
    if (!searchQuery) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(p => p.name.toLowerCase().includes(q));
  }, [searchQuery]);

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
                className="w-full flex items-center gap-1.5 pl-6 pr-3 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
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
        className={`grid grid-cols-[1fr,55px,50px,70px] gap-1 items-center pr-2 py-1.5 cursor-pointer transition-colors group ${
          isSelected
            ? "bg-teal-50 dark:bg-teal-950/30"
            : "hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
        } ${isDimmed ? "opacity-50" : ""}`}
        style={{ paddingLeft: indentExtra ? "3.5rem" : "2rem" }}
      >
        {/* Name */}
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ backgroundColor: p.color || "#6B7280" }} />
          <span className={`text-[11px] truncate ${isSelected ? "text-teal-700 dark:text-teal-300 font-medium" : "text-zinc-700 dark:text-zinc-300"}`}>
            {p.name}
          </span>
        </div>

        {/* Type */}
        <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
          {editingTypeId === p.id ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setEditingTypeId(null)} />
              <div className="absolute mt-5 z-20 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg py-1 min-w-[100px]">
                {(["work", "deal", "workspace"] as const).map(t => (
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
                  : p.project_type === "workspace" ? "bg-purple-50 dark:bg-purple-900/30 text-purple-500"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400"
              }`}
            >{p.project_type || "work"}</button>
          )}
        </div>

        {/* Progress */}
        <div className="w-full">
          <ProgressBar completed={counts.completed} total={counts.total} color={p.color || "#0D7680"} />
        </div>

        {/* Status */}
        <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
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
      {/* Stats row */}
      <div className="flex-shrink-0 grid grid-cols-4 gap-3 p-4 border-b border-zinc-100 dark:border-zinc-800/50">
        <Stat label="Active Projects" value={activeProjectCount} icon={Target} color="#0D7680" />
        <Stat label="Total Tasks" value={totalTasks} icon={CheckCircle2} color="#3B82F6" />
        <Stat label="Overdue" value={overdueTasks} icon={AlertTriangle} color="#EF4444" />
        <Stat label="Completion" value={`${completionRate}%`} icon={TrendingUp} color="#10B981" />
      </div>

      {/* Body: tree (left) + detail (right) */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: Project tree */}
        <div className="flex-shrink-0 flex flex-col border-r border-zinc-100 dark:border-zinc-800/50" style={{ width: sidebarWidth }}>
          {/* Tree header */}
          <div className="flex-shrink-0 border-b border-zinc-100 dark:border-zinc-800/50">
            <div className="flex items-center gap-2 px-3 py-1.5">
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
                onClick={() => setSortBy(prev => prev === "name" ? "tasks" : prev === "tasks" ? "status" : "name")}
                className="flex items-center gap-0.5 text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors flex-shrink-0"
                title={`Sort by: ${sortBy}`}
              >
                <ArrowUpDown size={10} />
                {sortBy}
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
          {/* Initiative groups */}
          {initiatives.map(init => {
            const linkedProjectIds = initProjectMap.get(init.id) || [];
            const linkedProjects = sortProjects(filterProjects(
              linkedProjectIds
                .map(id => projectById.get(id))
                .filter((p): p is Project => !!p)
            ));
            const isExpanded = !collapsedGroups.has(init.id);

            return (
              <div key={init.id}>
                <div
                  className={cn(
                    "w-full flex items-center gap-1.5 px-3 py-2 transition-colors group cursor-pointer",
                    selectedInitiativeId === init.id && !selectedProjectId
                      ? "bg-teal-50 dark:bg-teal-950/30"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                  )}
                >
                  <button onClick={(e) => { e.stopPropagation(); toggleGroup(init.id); }} className="p-0.5 text-zinc-400 hover:text-zinc-600 flex-shrink-0">
                    {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                  </button>
                  <div className="flex items-center gap-1.5 min-w-0 flex-1" onClick={() => { setSelectedInitiativeId(init.id); setSelectedProjectId(null); }}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: init.color || "#0D7680" }} />
                    <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 truncate">{init.name}</span>
                    <span className="text-[9px] text-zinc-400 ml-0.5">{linkedProjects.length}</span>
                  </div>
                  <div className="ml-auto flex items-center gap-1 flex-shrink-0">
                    <HealthBadge health={init.health} />
                    <StatusBadge status={init.status} />
                    {onEditInitiative && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onEditInitiative(init); }}
                        className="p-0.5 rounded text-zinc-400 hover:text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity"
                      ><Pencil size={9} /></button>
                    )}
                  </div>
                </div>
                {isExpanded && renderProjectList(linkedProjects)}
              </div>
            );
          })}

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
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={onMouseDown}
          className="w-1 flex-shrink-0 cursor-col-resize hover:bg-teal-500/30 active:bg-teal-500/50 transition-colors"
        />

        {/* RIGHT: Project detail */}
        <div className="flex-1 overflow-hidden">
          {selectedProjectId ? (
            <WorkspaceDetailView
              workspaceId={selectedProjectId}
              onBack={() => { setSelectedProjectId(null); window.location.reload(); }}
              onUpdated={() => { window.location.reload(); }}
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
            {initiatives.map(init => {
              const isLinked = projectInitiativeMap.get(contextMenu.projectId)?.id === init.id;
              return (
                <button key={init.id}
                  onClick={async () => { await onInitiativeLinkChanged?.(contextMenu.projectId, init.id); setContextMenu(null); }}
                  className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 ${isLinked ? "bg-zinc-50 dark:bg-zinc-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-800"}`}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: init.color || "#0D7680" }} />
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
