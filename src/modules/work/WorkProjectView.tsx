// WorkViews: Project Detail View — shows all tasks for a single project

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Calendar, User, MessageSquare, Search, X, Check, Folder, Sparkles, ChevronRight, ChevronDown, Plus, Upload,
} from "lucide-react";
import { useNotionPushTask } from "../../hooks/useNotion";
import { AutoAssignCompanyModal } from "./AutoAssignCompanyModal";
import { AutoAssignProjectModal } from "./AutoAssignProjectModal";
import { BackButton } from "../../components/BackButton";
import { DiscussionPanel } from "../../components/discussions/DiscussionPanel";
import { useDiscussionCount } from "../../hooks/useDiscussions";
import type { TaskWithRelations, Project, User as WorkUser } from "../../lib/work/types";
import type { StatusType } from "../../lib/work/types";
import { PriorityLabels } from "../../lib/work/types";
import { formatDateShort as formatDate, isOverdue } from "../../lib/date";
import {
  getUserName, ProgressBar, TaskRow,
} from "./workViewsShared";
import { StatusIcon, PriorityBars } from "./StatusIcon";
import { supabase } from "../../lib/supabase";
import { workKeys } from "../../hooks/work/keys";
import { useStatuses } from "../../hooks/work/useStatuses";
import { useCompanies } from "../../hooks/crm/useCompanies";
import { toast } from "../../stores/toastStore";

type GroupBy = "status" | "priority" | "assignee";

function FilterPopover({
  anchorRef, open, onClose, children, label, searchable,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode | ((search: string) => React.ReactNode);
  label: string;
  searchable?: boolean;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left });
    setSearch("");
  }, [open, anchorRef]);

  useEffect(() => {
    if (open && searchable) inputRef.current?.focus();
  }, [open, searchable]);

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
      className="fixed z-[9999] min-w-[200px] max-h-[320px] flex flex-col rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 shadow-lg overflow-hidden"
      style={{ top: pos.top, left: pos.left }}
      role="menu"
      aria-label={label}
    >
      {searchable && (
        <div className="p-1.5 border-b border-zinc-100 dark:border-zinc-700 flex-shrink-0">
          <input
            ref={inputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search...`}
            className="w-full text-xs px-2 py-1 rounded bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 outline-none focus:ring-1 focus:ring-teal-500/30"
          />
        </div>
      )}
      <div className="overflow-y-auto py-1">
        {typeof children === "function" ? children(search) : children}
      </div>
    </div>,
    document.body
  );
}

function FilterOption({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${selected ? "text-teal-600 dark:text-teal-400 font-medium" : "text-zinc-700 dark:text-zinc-300"}`}
    >
      {children}
      {selected && <Check size={12} className="ml-auto" />}
    </button>
  );
}

function toggleSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value); else next.add(value);
  return next;
}

export function ProjectView({
  project, allTasks, users, onSelectTask, onBack, onCreateTask,
}: {
  project: Project;
  allTasks: TaskWithRelations[];
  users: WorkUser[];
  onSelectTask: (id: string) => void;
  onBack: () => void;
  onCreateTask?: () => void;
}) {
  const [groupBy, setGroupBy] = useState<GroupBy>("status");
  const [groupOverrides, setGroupOverrides] = useState<Map<string, boolean>>(new Map());
  const DEFAULT_HIDDEN = ["Backlog", "Done", "Won't Do", "Monitor", "Archived"];
  const [hiddenStatuses, setHiddenStatuses] = useState<Set<string>>(() => new Set(DEFAULT_HIDDEN));
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [activeTab, setActiveTab] = useState<"tasks" | "discussion">("tasks");
  const { data: discussionCount } = useDiscussionCount("project", project.id);
  const { data: allStatuses = [] } = useStatuses();
  const { data: allCompanies = [] } = useCompanies();
  const queryClient = useQueryClient();

  // Auto-assign modals
  const [autoAssignOpen, setAutoAssignOpen] = useState(false);
  const [autoAssignProjectOpen, setAutoAssignProjectOpen] = useState(false);

  // Bulk selection
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const selectedTaskIdsArray = useMemo(() => Array.from(selectedTaskIds), [selectedTaskIds]);
  const lastSelectedId = useRef<string | null>(null);
  const [bulkMenuPos, setBulkMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [bulkProjectSearch, setBulkProjectSearch] = useState("");
  const [bulkProjectList, setBulkProjectList] = useState<Array<{ id: string; name: string; color: string | null }>>([]);
  const [bulkMoving, setBulkMoving] = useState(false);
  const [bulkSyncing, setBulkSyncing] = useState(false);
  const notionPush = useNotionPushTask();

  const bulkSyncToNotion = useCallback(async () => {
    const ids = Array.from(selectedTaskIds);
    if (ids.length === 0) return;
    setBulkSyncing(true);
    let ok = 0, fail = 0;
    const concurrency = 3;
    const queue = [...ids];
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (queue.length) {
        const id = queue.shift()!;
        try { await notionPush.mutateAsync(id); ok++; }
        catch (e: any) { fail++; console.error("[bulk notion push]", id, e?.message || e); }
      }
    }));
    setBulkSyncing(false);
    if (fail === 0) toast.success(`Synced ${ok} task${ok > 1 ? "s" : ""} to Notion`);
    else toast.error(`Synced ${ok}, failed ${fail}. See console.`);
  }, [selectedTaskIds, notionPush]);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [priorityFilter, setPriorityFilter] = useState<Set<number>>(new Set());
  const [assigneeFilter, setAssigneeFilter] = useState<Set<string>>(new Set());
  const [companyFilter, setCompanyFilter] = useState<Set<string>>(new Set());
  const [openFilter, setOpenFilter] = useState<null | "status" | "priority" | "assignee" | "company">(null);
  const statusBtnRef = useRef<HTMLButtonElement>(null);
  const priorityBtnRef = useRef<HTMLButtonElement>(null);
  const assigneeBtnRef = useRef<HTMLButtonElement>(null);
  const companyBtnRef = useRef<HTMLButtonElement>(null);

  const projectTasks = useMemo(
    () => allTasks.filter(t => t.project_id === project.id),
    [allTasks, project.id]
  );

  // Derive filter options from the project's tasks
  const statusOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; type: string; color: string | null }>();
    for (const t of projectTasks) {
      if (t.status && !map.has(t.status.id)) {
        map.set(t.status.id, { id: t.status.id, name: t.status.name, type: t.status.type, color: t.status.color });
      }
    }
    const typeOrder: Record<string, number> = { todo: 0, in_progress: 1, complete: 2 };
    return Array.from(map.values()).sort((a, b) => (typeOrder[a.type] ?? 5) - (typeOrder[b.type] ?? 5) || a.name.localeCompare(b.name));
  }, [projectTasks]);

  const assigneeOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    let hasUnassigned = false;
    for (const t of projectTasks) {
      if (!t.assignees?.length) { hasUnassigned = true; continue; }
      for (const a of t.assignees) {
        if (a.user && !map.has(a.user.id)) map.set(a.user.id, { id: a.user.id, name: a.user.name });
      }
    }
    const list = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    if (hasUnassigned) list.push({ id: "__unassigned", name: "Unassigned" });
    return list;
  }, [projectTasks]);

  const companyOptions = useMemo(() => {
    const taskCounts = new Map<string, number>();
    for (const t of projectTasks) {
      if (t.company?.id) taskCounts.set(t.company.id, (taskCounts.get(t.company.id) || 0) + 1);
    }
    const list = allCompanies
      .filter(c => taskCounts.has(c.id))
      .map(c => ({ id: c.id, name: (c as any).display_name || c.name, count: taskCounts.get(c.id)! }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const hasNone = projectTasks.some(t => !t.company);
    if (hasNone) list.push({ id: "__none", name: "No company", count: 0 });
    return list;
  }, [projectTasks, allCompanies]);

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projectTasks.filter(t => {
      if (statusFilter.size && (!t.status || !statusFilter.has(t.status.id))) return false;
      if (priorityFilter.size && !priorityFilter.has(t.priority || 0)) return false;
      if (assigneeFilter.size) {
        const ids = t.assignees?.map(a => a.user?.id).filter(Boolean) as string[] | undefined;
        const wantsUnassigned = assigneeFilter.has("__unassigned");
        const hasMatch = ids?.some(id => assigneeFilter.has(id)) ?? false;
        if (!(hasMatch || (wantsUnassigned && (!ids || ids.length === 0)))) return false;
      }
      if (companyFilter.size) {
        if (t.company) {
          if (!companyFilter.has(t.company.id)) return false;
        } else if (!companyFilter.has("__none")) return false;
      }
      if (q) {
        const hay = `${t.title || ""} ${t.id || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [projectTasks, search, statusFilter, priorityFilter, assigneeFilter, companyFilter]);

  const activeFilterCount =
    statusFilter.size + priorityFilter.size + assigneeFilter.size + companyFilter.size + (search.trim() ? 1 : 0);

  const clearAllFilters = () => {
    setSearch("");
    setStatusFilter(new Set());
    setPriorityFilter(new Set());
    setAssigneeFilter(new Set());
    setCompanyFilter(new Set());
  };

  const toggleTaskSelection = useCallback((taskId: string, shift: boolean) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (shift && lastSelectedId.current) {
        // Range select across filtered tasks in current display order
        const ordered = filteredTasks.map(t => t.id);
        const a = ordered.indexOf(lastSelectedId.current);
        const b = ordered.indexOf(taskId);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) next.add(ordered[i]);
        } else {
          if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
        }
      } else {
        if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      }
      return next;
    });
    lastSelectedId.current = taskId;
  }, [filteredTasks]);

  const toggleSelectAll = useCallback(() => {
    setSelectedTaskIds(prev => {
      const ids = filteredTasks.map(t => t.id);
      const allSelected = ids.length > 0 && ids.every(id => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      }
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }, [filteredTasks]);

  // Fetch projects when the bulk picker opens
  useEffect(() => {
    if (!bulkMenuPos || bulkProjectList.length > 0) return;
    supabase.from("projects").select("id, name, color").eq("status", "active").order("name")
      .then(({ data }) => { if (data) setBulkProjectList(data); });
  }, [bulkMenuPos, bulkProjectList.length]);

  const bulkMoveToProject = useCallback(async (targetProjectId: string, targetName: string) => {
    if (selectedTaskIds.size === 0) return;
    const ids = Array.from(selectedTaskIds);
    setBulkMoving(true);
    setBulkMenuPos(null);
    setBulkProjectSearch("");
    try {
      // Optimistic cache update so rows disappear from the current view immediately
      const target = bulkProjectList.find(p => p.id === targetProjectId);
      const targetRelation = target ? { id: target.id, name: target.name, color: target.color } : null;
      queryClient.setQueriesData<TaskWithRelations[]>({ queryKey: workKeys.tasks() }, (old) =>
        Array.isArray(old)
          ? old.map(t => selectedTaskIds.has(t.id) ? { ...t, project_id: targetProjectId, project: targetRelation as any } : t)
          : old
      );

      // Persist in chunks of 200 to avoid URI-too-long
      const CHUNK = 200;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const { error } = await supabase.from("tasks").update({ project_id: targetProjectId }).in("id", chunk);
        if (error) {
          queryClient.invalidateQueries({ queryKey: ["work"] });
          throw error;
        }
      }
      toast.success(`Moved ${ids.length} task${ids.length > 1 ? "s" : ""} to ${targetName}`);
      setSelectedTaskIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["work"] });
    } catch (err: any) {
      toast.error(`Move failed: ${err?.message || err}`);
    } finally {
      setBulkMoving(false);
    }
  }, [selectedTaskIds, bulkProjectList, queryClient]);

  const completed = projectTasks.filter(t => t.status?.type === "complete").length;
  const overdue = projectTasks.filter(t =>
    isOverdue(t.due_date) && t.status?.type !== "complete"
  ).length;

  // Group tasks
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; color?: string; statusType?: string; tasks: TaskWithRelations[] }>();

    for (const t of filteredTasks) {
      let key: string;
      let label: string;
      let color: string | undefined;
      let statusType: string | undefined;

      if (groupBy === "status") {
        key = t.status?.id || "none";
        label = t.status?.name || "No Status";
        color = t.status?.color || "#6B7280";
        statusType = t.status?.type;
      } else if (groupBy === "priority") {
        const p = t.priority || 0;
        const labels: Record<number, string> = { 1: "Urgent", 2: "High", 3: "Medium", 4: "Low", 0: "None" };
        key = String(p);
        label = labels[p] || "None";
      } else {
        key = t.assignees?.[0]?.user?.id || "unassigned";
        label = t.assignees?.[0]?.user?.name || "Unassigned";
      }

      const group = map.get(key) || { label, color, statusType, tasks: [] };
      group.tasks.push(t);
      map.set(key, group);
    }

    // Sort groups, hide inactive statuses when grouped by status
    const STATUS_SORT: Record<string, number> = {
      "Ready to Deploy": 0, "Blocked": 1, "Waiting": 2, "Ready for Test": 3,
      "In Review": 4, "In Progress": 5, "Up Next": 6, "On Hold": 7, "New": 8,
      "Backlog": 9, "Done": 10, "Won't Do": 11, "Monitor": 12, "Archived": 13,
    };
    let entries = Array.from(map.entries());
    if (groupBy === "status") {
      entries = entries.filter(([, g]) => !hiddenStatuses.has(g.label));
      entries.sort((a, b) => (STATUS_SORT[a[1].label] ?? 99) - (STATUS_SORT[b[1].label] ?? 99));
    } else if (groupBy === "priority") {
      entries.sort((a, b) => Number(a[0]) - Number(b[0]));
    } else {
      entries.sort((a, b) => a[1].label.localeCompare(b[1].label));
    }

    return entries;
  }, [filteredTasks, groupBy, hiddenStatuses]);

  return (
    <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* Header — mirrors TaskDetailPanel chrome */}
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0 overflow-hidden">
          <BackButton onClick={onBack} />
          <Folder size={16} className="text-zinc-400 flex-shrink-0" />
          {project.identifier_prefix && (
            <span className="text-sm text-zinc-500 font-mono">{project.identifier_prefix}</span>
          )}
          <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: project.color || "#6B7280" }} />
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{project.name}</h2>
          <div className="flex items-center gap-3 text-xs text-zinc-500 flex-shrink-0 ml-1">
            <span>
              {activeFilterCount > 0 ? `${filteredTasks.length} of ${projectTasks.length}` : `${projectTasks.length} tasks`}
            </span>
            <span>{completed} done</span>
            {overdue > 0 && <span className="text-red-500 font-medium">{overdue} overdue</span>}
            {project.lead && (
              <span className="inline-flex items-center gap-1">
                <User size={10} />
                {getUserName(users, project.lead)}
              </span>
            )}
            {project.target_date && (
              <span className="inline-flex items-center gap-1">
                <Calendar size={10} />
                {formatDate(project.target_date)}
              </span>
            )}
          </div>
          <div className="w-32 flex-shrink-0">
            <ProgressBar completed={completed} total={projectTasks.length} color={project.color || "#0D7680"} />
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {onCreateTask && (
            <button
              onClick={onCreateTask}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/30 transition-colors"
            >
              <Plus size={12} /> New Task
            </button>
          )}
        </div>
      </div>

      {/* Tab bar — mirrors TaskDetailPanel pill style */}
      <div className="flex-shrink-0 flex items-center gap-1 px-4 py-1.5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
        {([
          { key: "tasks" as const, label: "Tasks", icon: Folder, badge: projectTasks.length },
          { key: "discussion" as const, label: "Discussion", icon: MessageSquare, badge: discussionCount },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
            }`}
          >
            <tab.icon size={13} />
            {tab.label}
            {(tab.badge ?? 0) > 0 && (
              <span className="text-[10px] font-medium bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 px-1.5 py-0.5 rounded-full">
                {tab.badge}
              </span>
            )}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-zinc-400">Group:</span>
          {(["status", "priority", "assignee"] as GroupBy[]).map(g => (
            <button
              key={g}
              onClick={() => { setGroupBy(g); setGroupOverrides(new Map()); }}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                groupBy === g
                  ? "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              }`}
            >
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
          <div className="relative">
            <button
              onClick={() => setShowStatusPicker(v => !v)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                hiddenStatuses.size > 0
                  ? "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  : "bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400"
              }`}
            >
              {hiddenStatuses.size > 0 ? `${hiddenStatuses.size} hidden` : "All visible"}
            </button>
            {showStatusPicker && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowStatusPicker(false)} />
                <div className="absolute right-0 top-full mt-1 z-40 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg py-1 min-w-[180px]">
                  {allStatuses.map((s) => {
                    const isHidden = hiddenStatuses.has(s.name);
                    const count = filteredTasks.filter(t => t.status?.id === s.id).length;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setHiddenStatuses(prev => {
                          const next = new Set(prev);
                          next.has(s.name) ? next.delete(s.name) : next.add(s.name);
                          return next;
                        })}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                      >
                        <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${isHidden ? "border-zinc-300 dark:border-zinc-600" : "border-teal-500 bg-teal-500"}`}>
                          {!isHidden && <Check size={10} className="text-white" />}
                        </span>
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color || "#6B7280" }} />
                        <span className={isHidden ? "text-zinc-400" : "text-zinc-700 dark:text-zinc-300"}>{s.name}</span>
                        <span className="ml-auto text-[10px] text-zinc-400">{count}</span>
                      </button>
                    );
                  })}
                  <div className="border-t border-zinc-100 dark:border-zinc-800 mt-1 pt-1 px-3 py-1 flex gap-2">
                    <button onClick={() => setHiddenStatuses(new Set())} className="text-[10px] text-teal-600 hover:text-teal-700 dark:text-teal-400 font-medium">Show all</button>
                    <button onClick={() => setHiddenStatuses(new Set(DEFAULT_HIDDEN))} className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 font-medium">Reset</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {activeTab === "tasks" && (<>
      {/* Filter toolbar */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <input
          type="checkbox"
          checked={filteredTasks.length > 0 && filteredTasks.every(t => selectedTaskIds.has(t.id))}
          ref={(el) => {
            if (el) {
              el.indeterminate =
                selectedTaskIds.size > 0 &&
                !filteredTasks.every(t => selectedTaskIds.has(t.id));
            }
          }}
          onChange={toggleSelectAll}
          className="w-3 h-3 rounded cursor-pointer accent-teal-500"
          title="Select all visible tasks"
          aria-label="Select all visible tasks"
        />
        <div className="relative flex-1 max-w-[320px]">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks by title or ID..."
            className="w-full text-xs pl-7 pr-7 py-1.5 rounded-md bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 outline-none focus:ring-2 focus:ring-teal-500/30 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Status filter */}
        <button
          ref={statusBtnRef}
          onClick={() => setOpenFilter(openFilter === "status" ? null : "status")}
          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
            statusFilter.size > 0
              ? "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
              : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
          }`}
        >
          Status{statusFilter.size > 0 ? ` (${statusFilter.size})` : ""}
        </button>
        <FilterPopover anchorRef={statusBtnRef} open={openFilter === "status"} onClose={() => setOpenFilter(null)} label="Status filter" searchable>
          {(search: string) => {
            const filtered = statusOptions.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
            return filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-zinc-400">No matches</div>
            ) : filtered.map(s => (
              <FilterOption key={s.id} selected={statusFilter.has(s.id)} onClick={() => setStatusFilter(prev => toggleSet(prev, s.id))}>
                <StatusIcon type={s.type as StatusType} color={s.color || "#6B7280"} size={12} />
                {s.name}
              </FilterOption>
            ));
          }}
        </FilterPopover>

        {/* Priority filter */}
        <button
          ref={priorityBtnRef}
          onClick={() => setOpenFilter(openFilter === "priority" ? null : "priority")}
          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
            priorityFilter.size > 0
              ? "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
              : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
          }`}
        >
          Priority{priorityFilter.size > 0 ? ` (${priorityFilter.size})` : ""}
        </button>
        <FilterPopover anchorRef={priorityBtnRef} open={openFilter === "priority"} onClose={() => setOpenFilter(null)} label="Priority filter" searchable>
          {(search: string) => Object.entries(PriorityLabels).filter(([, label]) => label.toLowerCase().includes(search.toLowerCase())).map(([value, label]) => (
            <FilterOption key={value} selected={priorityFilter.has(Number(value))} onClick={() => setPriorityFilter(prev => toggleSet(prev, Number(value)))}>
              <PriorityBars priority={Number(value)} size={10} />
              {label}
            </FilterOption>
          ))}
        </FilterPopover>

        {/* Assignee filter */}
        <button
          ref={assigneeBtnRef}
          onClick={() => setOpenFilter(openFilter === "assignee" ? null : "assignee")}
          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
            assigneeFilter.size > 0
              ? "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
              : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
          }`}
        >
          Assignee{assigneeFilter.size > 0 ? ` (${assigneeFilter.size})` : ""}
        </button>
        <FilterPopover anchorRef={assigneeBtnRef} open={openFilter === "assignee"} onClose={() => setOpenFilter(null)} label="Assignee filter" searchable>
          {(search: string) => {
            const filtered = assigneeOptions.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));
            return filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-zinc-400">No matches</div>
            ) : filtered.map(a => (
              <FilterOption key={a.id} selected={assigneeFilter.has(a.id)} onClick={() => setAssigneeFilter(prev => toggleSet(prev, a.id))}>
                {a.name}
              </FilterOption>
            ));
          }}
        </FilterPopover>

        {/* Company filter */}
        <button
          ref={companyBtnRef}
          onClick={() => setOpenFilter(openFilter === "company" ? null : "company")}
          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
            companyFilter.size > 0
              ? "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
              : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
          }`}
        >
          Company{companyFilter.size > 0 ? ` (${companyFilter.size})` : ""}
        </button>
        <FilterPopover anchorRef={companyBtnRef} open={openFilter === "company"} onClose={() => setOpenFilter(null)} label="Company filter" searchable>
          {(search: string) => {
            const filtered = companyOptions.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
            return filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-zinc-400">No matches</div>
            ) : filtered.map(c => (
              <FilterOption key={c.id} selected={companyFilter.has(c.id)} onClick={() => setCompanyFilter(prev => toggleSet(prev, c.id))}>
                {c.name} <span className="ml-auto text-[10px] text-zinc-400">{c.count}</span>
              </FilterOption>
            ));
          }}
        </FilterPopover>

        {activeFilterCount > 0 && (
          <button
            onClick={clearAllFilters}
            className="px-2 py-1 rounded text-xs text-zinc-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Task list */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {/* Column headers */}
          <div
            className="sticky top-0 z-20 grid items-center gap-x-2.5 px-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-[10px] font-medium text-zinc-400 uppercase tracking-wider"
            style={{ gridTemplateColumns: "14px 16px 80px 1fr 60px 70px 80px 80px 60px 60px" }}
          >
            <span />
            <span />
            <span>ID</span>
            <span>Title</span>
            <span>Priority</span>
            <span className="text-center">Assignee</span>
            <span>Due Date</span>
            <span>Company</span>
            <span>Created</span>
            <span>Updated</span>
          </div>
          {groups.length === 0 && (
            <div className="text-center py-12 text-zinc-400 text-sm">
              {activeFilterCount > 0 ? "No tasks match the current filters" : "No tasks in this project"}
            </div>
          )}
          {groups.map(([key, group]) => {
            const isCollapsed = groupOverrides.get(key) ?? false;
            return (
            <div key={key}>
              <button
                onClick={() => setGroupOverrides(prev => {
                  const next = new Map(prev);
                  next.set(key, !isCollapsed);
                  return next;
                })}
                className="sticky top-0 z-10 w-full flex items-center gap-2 px-3 py-2 bg-zinc-50/90 dark:bg-zinc-900/90 backdrop-blur-sm border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-100/90 dark:hover:bg-zinc-800/90 transition-colors cursor-pointer"
              >
                {isCollapsed ? <ChevronRight size={12} className="text-zinc-400 flex-shrink-0" /> : <ChevronDown size={12} className="text-zinc-400 flex-shrink-0" />}
                {groupBy === "status" && group.statusType && (
                  <StatusIcon type={group.statusType as StatusType} color={group.color || "#6B7280"} size={13} />
                )}
                <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">{group.label}</span>
                <span className="text-xs text-zinc-400">{group.tasks.length}</span>
              </button>
              {!isCollapsed && group.tasks.map(t => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onSelect={onSelectTask}
                  selectable
                  selected={selectedTaskIds.has(t.id)}
                  onToggleSelect={toggleTaskSelection}
                  projectScoped
                />
              ))}
            </div>
            );
          })}
        </div>
      </div>
      </>)}

      {activeTab === "discussion" && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <DiscussionPanel entityType="project" entityId={project.id} />
        </div>
      )}

      <AutoAssignCompanyModal
        taskIds={selectedTaskIdsArray}
        open={autoAssignOpen}
        onClose={() => setAutoAssignOpen(false)}
        onApplied={() => {
          queryClient.invalidateQueries({ queryKey: ["work"] });
          setSelectedTaskIds(new Set());
        }}
      />

      <AutoAssignProjectModal
        taskIds={selectedTaskIdsArray}
        currentProjectId={project.id}
        open={autoAssignProjectOpen}
        onClose={() => setAutoAssignProjectOpen(false)}
        onApplied={() => {
          queryClient.invalidateQueries({ queryKey: ["work"] });
          setSelectedTaskIds(new Set());
        }}
      />

      {/* Bulk selection action bar */}
      {selectedTaskIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-zinc-900 dark:bg-zinc-800 text-white rounded-lg shadow-lg px-4 py-2.5 flex items-center gap-3 text-xs">
          <span className="font-medium">
            {selectedTaskIds.size} task{selectedTaskIds.size > 1 ? "s" : ""} selected
          </span>
          <div className="w-px h-4 bg-zinc-700" />
          <button
            onClick={(e) => { setBulkMenuPos({ x: e.clientX, y: e.clientY - 320 }); setBulkProjectSearch(""); }}
            disabled={bulkMoving}
            className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-60 transition-colors font-medium flex items-center gap-1.5"
          >
            <Folder size={12} /> Move to Project
          </button>
          <button
            onClick={() => setAutoAssignOpen(true)}
            disabled={bulkMoving}
            className="px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 disabled:opacity-60 transition-colors font-medium flex items-center gap-1.5"
            title="Use Haiku to match blank-company tasks in this selection to CRM companies"
          >
            <Sparkles size={12} /> Auto-assign Company
          </button>
          <button
            onClick={() => setAutoAssignProjectOpen(true)}
            disabled={bulkMoving}
            className="px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 disabled:opacity-60 transition-colors font-medium flex items-center gap-1.5"
            title="Use Haiku to suggest a better project for the selected tasks"
          >
            <Sparkles size={12} /> Auto-assign Project
          </button>
          <button
            onClick={bulkSyncToNotion}
            disabled={bulkSyncing || bulkMoving}
            className="px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 disabled:opacity-60 transition-colors font-medium flex items-center gap-1.5"
            title="Push selected tasks to Notion"
          >
            <Upload size={12} /> {bulkSyncing ? "Syncing..." : "Sync to Notion"}
          </button>
          <button
            onClick={() => setSelectedTaskIds(new Set())}
            className="px-2 py-1.5 rounded-lg hover:bg-zinc-700 transition-colors text-zinc-400 hover:text-white"
            aria-label="Clear selection"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Bulk move project picker */}
      {bulkMenuPos && createPortal(
        <>
          <div
            className="fixed inset-0 z-50"
            onClick={() => { setBulkMenuPos(null); setBulkProjectSearch(""); }}
          />
          <div
            className="fixed z-[60] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg min-w-[280px] max-h-[320px] flex flex-col overflow-hidden"
            style={{
              left: Math.min(bulkMenuPos.x, window.innerWidth - 300),
              top: Math.max(40, bulkMenuPos.y),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
              <Folder size={12} className="text-teal-600" />
              <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                Move {selectedTaskIds.size} task{selectedTaskIds.size > 1 ? "s" : ""} to...
              </span>
            </div>
            <div className="px-2 py-2">
              <input
                type="text"
                value={bulkProjectSearch}
                onChange={(e) => setBulkProjectSearch(e.target.value)}
                placeholder="Search projects..."
                className="text-xs w-full border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1 bg-zinc-50 dark:bg-zinc-800 outline-none"
                autoFocus
              />
            </div>
            <div className="overflow-y-auto flex-1">
              {bulkProjectList.length === 0 ? (
                <div className="px-3 py-3 text-xs text-zinc-400">Loading…</div>
              ) : (
                bulkProjectList
                  .filter(p => !bulkProjectSearch || p.name.toLowerCase().includes(bulkProjectSearch.toLowerCase()))
                  .slice(0, 50)
                  .map(p => {
                    const isCurrent = p.id === project.id;
                    return (
                      <button
                        key={p.id}
                        disabled={bulkMoving || isCurrent}
                        onClick={() => bulkMoveToProject(p.id, p.name)}
                        className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 ${
                          bulkMoving ? "opacity-50 cursor-wait" :
                          isCurrent ? "bg-zinc-50 dark:bg-zinc-800 opacity-60 cursor-not-allowed" :
                          "hover:bg-zinc-50 dark:hover:bg-zinc-800"
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ backgroundColor: p.color || "#6B7280" }} />
                        <span className={`truncate ${isCurrent ? "font-medium text-teal-600" : "text-zinc-700 dark:text-zinc-300"}`}>
                          {p.name}{isCurrent ? " (current)" : ""}
                        </span>
                      </button>
                    );
                  })
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
