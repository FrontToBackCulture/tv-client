// src/modules/work/ProjectDetailView.tsx
// Project detail view with Overview/Tasks tabs and Properties sidebar (matches tv-app)

import { useState, useEffect, useRef, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Project, TaskWithRelations, Milestone, Initiative } from "../../lib/work/types";
import { useTasks, useStatuses, useMilestones } from "../../hooks/useWork";
import { supabase } from "../../lib/supabase";
import { TaskDetailPanel } from "./TaskDetailPanel";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  ClipboardList,
  Filter,
  ListFilter,
  Plus,
  Trash2,
  Calendar,
  Check,
  AlertTriangle,
  XCircle,
  Rocket,
  Loader2,
} from "lucide-react";

interface ProjectDetailViewProps {
  project: Project;
  initiatives: Initiative[];
  onBack: () => void;
  onRefresh: () => void;
  onDelete?: () => void;
}

type TabType = "overview" | "tasks";

const HEALTH_OPTIONS = [
  { value: "on_track", label: "On Track", icon: Check, color: "text-green-500 bg-green-500/10" },
  { value: "at_risk", label: "At Risk", icon: AlertTriangle, color: "text-yellow-500 bg-yellow-500/10" },
  { value: "off_track", label: "Off Track", icon: XCircle, color: "text-red-500 bg-red-500/10" },
];

const STATUS_OPTIONS = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
];

const PRIORITY_OPTIONS = [
  { value: 0, label: "None" },
  { value: 1, label: "Urgent" },
  { value: 2, label: "High" },
  { value: 3, label: "Medium" },
  { value: 4, label: "Low" },
];

export function ProjectDetailView({
  project,
  initiatives: _initiatives,
  onBack,
  onRefresh,
  onDelete,
}: ProjectDetailViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);
  const [creatingInMilestone, setCreatingInMilestone] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [showCreateMilestone, setShowCreateMilestone] = useState(false);
  const [newMilestoneName, setNewMilestoneName] = useState("");
  const [newMilestoneDate, setNewMilestoneDate] = useState("");
  const [updateContent, setUpdateContent] = useState("");
  const [panelWidth, setPanelWidth] = useState(280);
  const [isResizing, setIsResizing] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const milestoneInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Data fetching
  const { data: tasks = [], isLoading: tasksLoading, refetch: refetchTasks } = useTasks(project.id);
  const { data: statuses = [] } = useStatuses(project.id);
  const { data: milestones = [], refetch: refetchMilestones } = useMilestones(project.id);

  // Note: Initiative linking would require fetching initiative_projects junction table
  // For now, we'll skip showing initiatives (would need a separate query)
  // TODO: Add initiative linking when needed
  const linkedInitiative = useMemo((): Initiative | null => {
    // Would need to query initiative_projects junction table
    return null;
  }, []);

  // Group tasks by milestone
  const tasksByMilestone = useMemo(() => {
    const groups = new Map<string | null, TaskWithRelations[]>();
    for (const m of milestones) {
      groups.set(m.id, []);
    }
    groups.set(null, []);
    for (const task of tasks) {
      const milestoneId = task.milestone_id ?? null;
      if (!groups.has(milestoneId)) groups.set(milestoneId, []);
      groups.get(milestoneId)!.push(task);
    }
    return groups;
  }, [tasks, milestones]);

  // Progress stats
  const progressStats = useMemo(() => {
    const total = tasks.length;
    const started = tasks.filter((t) => t.status?.type === "started").length;
    const completed = tasks.filter((t) => t.status?.type === "completed").length;
    return { total, started, completed };
  }, [tasks]);

  // Expand first milestone by default
  useEffect(() => {
    if (milestones.length > 0 && expandedGroups.size === 0) {
      const firstWithTasks = milestones.find((m) => (tasksByMilestone.get(m.id)?.length ?? 0) > 0);
      if (firstWithTasks) {
        setExpandedGroups(new Set([firstWithTasks.id]));
      } else if (milestones.length > 0) {
        setExpandedGroups(new Set([milestones[0].id]));
      }
    }
  }, [milestones, tasksByMilestone, expandedGroups.size]);

  // Focus input when creating
  useEffect(() => {
    if (creatingInMilestone && inputRef.current) inputRef.current.focus();
  }, [creatingInMilestone]);

  useEffect(() => {
    if (showCreateMilestone && milestoneInputRef.current) milestoneInputRef.current.focus();
  }, [showCreateMilestone]);

  // Panel resize
  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      setPanelWidth(Math.max(200, Math.min(400, newWidth)));
    };
    const handleMouseUp = () => setIsResizing(false);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  // Update project mutation
  const updateProjectMutation = useMutation({
    mutationFn: async (updates: Partial<Project>) => {
      const { error } = await supabase.from("projects").update(updates).eq("id", project.id);
      if (error) throw error;
    },
    onSuccess: () => {
      onRefresh();
      queryClient.invalidateQueries({ queryKey: ["work"] });
    },
  });

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: async (data: { title: string; milestone_id: string | null }) => {
      const defaultStatus = statuses.find((s) => s.type === "unstarted") || statuses[0];
      if (!defaultStatus) throw new Error("No status found");
      const { error } = await supabase.from("tasks").insert({
        title: data.title,
        project_id: project.id,
        status_id: defaultStatus.id,
        milestone_id: data.milestone_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewTaskTitle("");
      setCreatingInMilestone(null);
      refetchTasks();
      refetchMilestones();
    },
  });

  // Create milestone mutation
  const createMilestoneMutation = useMutation({
    mutationFn: async (data: { name: string; target_date: string | null }) => {
      const { error } = await supabase.from("milestones").insert({
        project_id: project.id,
        name: data.name,
        target_date: data.target_date || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setShowCreateMilestone(false);
      setNewMilestoneName("");
      setNewMilestoneDate("");
      refetchMilestones();
    },
  });

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  const handleAddClick = (e: React.MouseEvent, milestoneId: string | null) => {
    e.stopPropagation();
    const key = milestoneId ?? "no-milestone";
    setExpandedGroups((prev) => new Set([...prev, key]));
    setCreatingInMilestone(key);
    setNewTaskTitle("");
  };

  const getMilestoneProgress = (milestoneId: string) => {
    const milestoneTasks = tasksByMilestone.get(milestoneId) ?? [];
    const completed = milestoneTasks.filter((t) => t.status?.type === "completed").length;
    const total = milestoneTasks.length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, percent };
  };

  const currentHealth = HEALTH_OPTIONS.find((h) => h.value === project.health) || HEALTH_OPTIONS[0];

  // If task is selected, show task detail
  if (selectedTask) {
    return (
      <TaskDetailPanel
        taskId={selectedTask.id}
        onClose={() => setSelectedTask(null)}
        onUpdated={() => {
          refetchTasks();
          refetchMilestones();
        }}
        onDeleted={() => {
          setSelectedTask(null);
          refetchTasks();
          refetchMilestones();
        }}
      />
    );
  }

  return (
    <div className="flex h-full bg-slate-50 dark:bg-zinc-950">
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header with back, breadcrumb, and tabs */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-zinc-800">
          <button
            onClick={onBack}
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <ChevronLeft size={20} className="text-zinc-500" />
          </button>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-zinc-500">Projects</span>
            <span className="text-zinc-400 dark:text-zinc-600">/</span>
            <span className="font-medium text-zinc-800 dark:text-zinc-200">{project.name}</span>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 ml-6">
            <button
              onClick={() => setActiveTab("overview")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                activeTab === "overview"
                  ? "bg-slate-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-900"
              }`}
            >
              <FileText size={16} />
              Overview
            </button>
            <button
              onClick={() => setActiveTab("tasks")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                activeTab === "tasks"
                  ? "bg-slate-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-900"
              }`}
            >
              <ClipboardList size={16} />
              Tasks
              {tasksLoading ? (
                <span className="w-4 h-3 bg-slate-300 dark:bg-zinc-700 rounded animate-pulse" />
              ) : (
                <span className="text-xs text-zinc-500">{tasks.length}</span>
              )}
            </button>
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === "overview" ? (
            <OverviewTab
              project={project}
              milestones={milestones}
              getMilestoneProgress={getMilestoneProgress}
              linkedInitiative={linkedInitiative}
              updateContent={updateContent}
              setUpdateContent={setUpdateContent}
              onUpdateProperty={(field, value) => updateProjectMutation.mutate({ [field]: value } as Partial<Project>)}
              showCreateMilestone={showCreateMilestone}
              setShowCreateMilestone={setShowCreateMilestone}
              newMilestoneName={newMilestoneName}
              setNewMilestoneName={setNewMilestoneName}
              newMilestoneDate={newMilestoneDate}
              setNewMilestoneDate={setNewMilestoneDate}
              handleCreateMilestone={() => {
                if (newMilestoneName.trim()) {
                  createMilestoneMutation.mutate({
                    name: newMilestoneName.trim(),
                    target_date: newMilestoneDate || null,
                  });
                }
              }}
              isCreatingMilestone={createMilestoneMutation.isPending}
              milestoneInputRef={milestoneInputRef}
            />
          ) : (
            <TasksTab
              tasksLoading={tasksLoading}
              milestones={milestones}
              tasksByMilestone={tasksByMilestone}
              expandedGroups={expandedGroups}
              toggleGroup={toggleGroup}
              getMilestoneProgress={getMilestoneProgress}
              creatingInMilestone={creatingInMilestone}
              newTaskTitle={newTaskTitle}
              isCreating={createTaskMutation.isPending}
              inputRef={inputRef}
              handleAddClick={handleAddClick}
              setNewTaskTitle={setNewTaskTitle}
              handleCreateTask={(milestoneId) => {
                if (newTaskTitle.trim()) {
                  createTaskMutation.mutate({
                    title: newTaskTitle.trim(),
                    milestone_id: milestoneId === "no-milestone" ? null : milestoneId,
                  });
                }
              }}
              setCreatingInMilestone={setCreatingInMilestone}
              onTaskClick={setSelectedTask}
              showCreateMilestone={showCreateMilestone}
              setShowCreateMilestone={setShowCreateMilestone}
              newMilestoneName={newMilestoneName}
              setNewMilestoneName={setNewMilestoneName}
              handleCreateMilestone={() => {
                if (newMilestoneName.trim()) {
                  createMilestoneMutation.mutate({
                    name: newMilestoneName.trim(),
                    target_date: null,
                  });
                }
              }}
              isCreatingMilestone={createMilestoneMutation.isPending}
              tasks={tasks}
              project={project}
            />
          )}
        </div>
      </div>

      {/* Resize handle */}
      <div
        className="w-1 cursor-col-resize hover:bg-teal-500/30 active:bg-teal-500/50 transition-colors flex-shrink-0"
        onMouseDown={() => setIsResizing(true)}
      />

      {/* Properties panel */}
      <div
        className="border-l border-slate-200 dark:border-zinc-800 overflow-y-auto flex-shrink-0 bg-white dark:bg-zinc-950"
        style={{ width: panelWidth }}
      >
        <div className="p-4">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            Properties
          </h3>

          <div className="space-y-3">
            {/* Status */}
            <PropertyField label="Status">
              <select
                value={project.status || "planned"}
                onChange={(e) => updateProjectMutation.mutate({ status: e.target.value as Project["status"] })}
                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-teal-500"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </PropertyField>

            {/* Priority */}
            <PropertyField label="Priority">
              <select
                value={project.priority ?? 0}
                onChange={(e) => updateProjectMutation.mutate({ priority: Number(e.target.value) as Project["priority"] })}
                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-teal-500"
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </PropertyField>

            {/* Health */}
            <PropertyField label="Health">
              <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs ${currentHealth.color}`}>
                <currentHealth.icon size={12} />
                {currentHealth.label}
              </div>
            </PropertyField>

            {/* Target date */}
            <PropertyField label="Target date">
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={project.target_date || ""}
                  onChange={(e) => updateProjectMutation.mutate({ target_date: e.target.value || null })}
                  className="flex-1 px-2 py-1.5 text-sm border border-slate-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-teal-500"
                />
                <Calendar size={14} className="text-zinc-500" />
              </div>
            </PropertyField>

            {/* Lead */}
            <PropertyField label="Lead">
              <p className="text-sm text-zinc-600 dark:text-zinc-400 py-1">{project.lead || "No lead"}</p>
            </PropertyField>

            {/* Initiative */}
            <PropertyField label="Initiatives">
              {linkedInitiative ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-purple-500/20 text-purple-500 dark:text-purple-400">
                  <Rocket size={12} />
                  {linkedInitiative.name}
                </span>
              ) : (
                <p className="text-sm text-zinc-500 py-1">None</p>
              )}
            </PropertyField>
          </div>

          {/* Milestones */}
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mt-6 mb-3">
            Milestones
          </h3>
          <div className="space-y-2">
            {milestones.map((m) => {
              const prog = getMilestoneProgress(m.id);
              return (
                <div key={m.id} className="flex items-center gap-2 text-xs">
                  <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  <span className="text-zinc-700 dark:text-zinc-300 truncate flex-1">{m.name}</span>
                  <span className="text-zinc-500 dark:text-zinc-600">{prog.percent}%</span>
                </div>
              );
            })}
            {milestones.length === 0 && (
              <p className="text-xs text-zinc-500 dark:text-zinc-600">No milestones</p>
            )}
          </div>

          {/* Progress */}
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mt-6 mb-3">
            Progress
          </h3>
          <div className="grid grid-cols-3 gap-2 text-center mb-3">
            <div>
              <p className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">{progressStats.total}</p>
              <p className="text-[10px] text-zinc-500">Scope</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-amber-500 dark:text-amber-400">{progressStats.started}</p>
              <p className="text-[10px] text-zinc-500">Started</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-green-500 dark:text-green-400">{progressStats.completed}</p>
              <p className="text-[10px] text-zinc-500">Completed</p>
            </div>
          </div>
          {progressStats.total > 0 && (
            <>
              <div className="h-2 bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-500 transition-all"
                  style={{ width: `${Math.round((progressStats.completed / progressStats.total) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-zinc-500 text-right mt-1">
                {progressStats.completed}/{progressStats.total}
              </p>
            </>
          )}

          {/* Delete */}
          <button
            onClick={onDelete}
            className="w-full mt-8 flex items-center justify-center gap-2 px-3 py-2 text-sm text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/10 rounded transition-colors"
          >
            <Trash2 size={14} />
            Delete project
          </button>
        </div>
      </div>
    </div>
  );
}

// Property field wrapper
function PropertyField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <label className="text-sm text-zinc-500 w-20 flex-shrink-0 pt-1.5">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );
}

// Overview Tab
interface OverviewTabProps {
  project: Project;
  milestones: Milestone[];
  getMilestoneProgress: (id: string) => { completed: number; total: number; percent: number };
  linkedInitiative: Initiative | null;
  updateContent: string;
  setUpdateContent: (s: string) => void;
  onUpdateProperty: (field: string, value: unknown) => void;
  showCreateMilestone: boolean;
  setShowCreateMilestone: (b: boolean) => void;
  newMilestoneName: string;
  setNewMilestoneName: (s: string) => void;
  newMilestoneDate: string;
  setNewMilestoneDate: (s: string) => void;
  handleCreateMilestone: () => void;
  isCreatingMilestone: boolean;
  milestoneInputRef: React.RefObject<HTMLInputElement>;
}

function OverviewTab({
  project,
  milestones,
  getMilestoneProgress,
  linkedInitiative,
  updateContent,
  setUpdateContent,
  onUpdateProperty,
  showCreateMilestone,
  setShowCreateMilestone,
  newMilestoneName,
  setNewMilestoneName,
  newMilestoneDate,
  setNewMilestoneDate,
  handleCreateMilestone,
  isCreatingMilestone,
  milestoneInputRef,
}: OverviewTabProps) {
  const currentHealth = HEALTH_OPTIONS.find((h) => h.value === project.health) || HEALTH_OPTIONS[0];
  const currentStatus = STATUS_OPTIONS.find((s) => s.value === project.status) || STATUS_OPTIONS[0];
  const currentPriority = PRIORITY_OPTIONS.find((p) => p.value === project.priority) || PRIORITY_OPTIONS[0];

  return (
    <div className="p-6">
      {/* Project header */}
      <div className="mb-6">
        <div
          className="w-14 h-14 rounded-lg flex items-center justify-center text-xl font-semibold text-white mb-4"
          style={{ backgroundColor: project.color || "#0D7680" }}
        >
          {project.name.charAt(0).toUpperCase()}
        </div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">{project.name}</h1>
        <p className="text-sm text-zinc-500">{project.summary || "Add a summary..."}</p>

        {/* Status badges */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
            currentStatus.value === "active" ? "bg-green-500/20 text-green-500 dark:text-green-400" :
            currentStatus.value === "paused" ? "bg-yellow-500/20 text-yellow-500 dark:text-yellow-400" :
            currentStatus.value === "completed" ? "bg-blue-500/20 text-blue-500 dark:text-blue-400" :
            "bg-slate-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              currentStatus.value === "active" ? "bg-green-500" :
              currentStatus.value === "paused" ? "bg-yellow-500" :
              currentStatus.value === "completed" ? "bg-blue-500" :
              "bg-zinc-500"
            }`} />
            Status {currentStatus.label}
          </span>
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
            Priority {currentPriority.label}
          </span>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${currentHealth.color}`}>
            <currentHealth.icon size={12} />
            Health {currentHealth.label}
          </span>
          {linkedInitiative && (
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-500 dark:text-purple-400">
              <Rocket size={10} className="inline mr-1" />
              {linkedInitiative.name}
            </span>
          )}
        </div>
      </div>

      {/* Health update */}
      <div className="mb-6 p-4 bg-slate-100 dark:bg-zinc-900/50 rounded-lg border border-slate-200 dark:border-zinc-800">
        <div className="flex items-center gap-2 mb-3">
          {HEALTH_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => onUpdateProperty("health", option.value)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                project.health === option.value
                  ? option.color + " ring-1 ring-current"
                  : "bg-slate-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-slate-300 dark:hover:bg-zinc-700"
              }`}
            >
              <option.icon size={14} />
              {option.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={updateContent}
          onChange={(e) => setUpdateContent(e.target.value)}
          placeholder="Write a project update..."
          className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-teal-500"
        />
      </div>

      {/* Description */}
      <div className="mb-6">
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Description</h3>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">{project.description || "No description yet."}</p>
      </div>

      {/* Milestones */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Milestones</h3>
          <button
            onClick={() => setShowCreateMilestone(true)}
            className="p-1 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            <Plus size={16} />
          </button>
        </div>

        {showCreateMilestone && (
          <div className="mb-3 p-3 bg-slate-100 dark:bg-zinc-800/50 rounded-lg border border-slate-200 dark:border-zinc-700">
            <div className="flex gap-2 mb-2">
              <input
                ref={milestoneInputRef}
                type="text"
                value={newMilestoneName}
                onChange={(e) => setNewMilestoneName(e.target.value)}
                placeholder="Milestone name"
                className="flex-1 px-3 py-1.5 text-sm border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-teal-500"
                onKeyDown={(e) => e.key === "Enter" && handleCreateMilestone()}
              />
              <input
                type="date"
                value={newMilestoneDate}
                onChange={(e) => setNewMilestoneDate(e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowCreateMilestone(false); setNewMilestoneName(""); setNewMilestoneDate(""); }}
                className="px-3 py-1 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateMilestone}
                disabled={!newMilestoneName.trim() || isCreatingMilestone}
                className="px-3 py-1 text-xs bg-teal-600 text-white rounded hover:bg-teal-500 disabled:opacity-50 transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {milestones.map((milestone) => {
            const prog = getMilestoneProgress(milestone.id);
            return (
              <div
                key={milestone.id}
                className="flex items-center justify-between px-4 py-3 bg-slate-100 dark:bg-zinc-900/50 rounded-lg border border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-rose-500" />
                  <div>
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{milestone.name}</p>
                    {milestone.target_date && (
                      <p className="text-xs text-zinc-500">
                        {new Date(milestone.target_date).toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    )}
                  </div>
                </div>
                <span className="text-xs text-zinc-500">
                  {prog.percent}% of {prog.total}
                </span>
              </div>
            );
          })}
          {milestones.length === 0 && !showCreateMilestone && (
            <p className="text-sm text-zinc-500 dark:text-zinc-600 text-center py-4">No milestones yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

// Tasks Tab
interface TasksTabProps {
  tasksLoading: boolean;
  milestones: Milestone[];
  tasksByMilestone: Map<string | null, TaskWithRelations[]>;
  expandedGroups: Set<string>;
  toggleGroup: (key: string) => void;
  getMilestoneProgress: (id: string) => { completed: number; total: number; percent: number };
  creatingInMilestone: string | null;
  newTaskTitle: string;
  isCreating: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  handleAddClick: (e: React.MouseEvent, milestoneId: string | null) => void;
  setNewTaskTitle: (s: string) => void;
  handleCreateTask: (milestoneId: string | null) => void;
  setCreatingInMilestone: (s: string | null) => void;
  onTaskClick: (task: TaskWithRelations) => void;
  showCreateMilestone: boolean;
  setShowCreateMilestone: (b: boolean) => void;
  newMilestoneName: string;
  setNewMilestoneName: (s: string) => void;
  handleCreateMilestone: () => void;
  isCreatingMilestone: boolean;
  tasks: TaskWithRelations[];
  project: Project;
}

function TasksTab({
  tasksLoading,
  milestones,
  tasksByMilestone,
  expandedGroups,
  toggleGroup,
  getMilestoneProgress,
  creatingInMilestone,
  newTaskTitle,
  isCreating,
  inputRef,
  handleAddClick,
  setNewTaskTitle,
  handleCreateTask,
  setCreatingInMilestone,
  onTaskClick,
  showCreateMilestone,
  setShowCreateMilestone,
  newMilestoneName,
  setNewMilestoneName,
  handleCreateMilestone,
  isCreatingMilestone,
  tasks,
  project,
}: TasksTabProps) {
  if (tasksLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 size={20} className="text-zinc-400 dark:text-zinc-500 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-zinc-800">
        <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-500 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">
          <Filter size={16} />
          Filter
        </button>
        <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-500 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg border border-slate-300 dark:border-zinc-700 transition-colors">
          <ListFilter size={16} />
          Display
        </button>
      </div>

      {/* Tasks list grouped by milestone */}
      <div className="divide-y divide-slate-200 dark:divide-zinc-800">
        {milestones.map((milestone) => {
          const milestoneTasks = tasksByMilestone.get(milestone.id) ?? [];
          const isExpanded = expandedGroups.has(milestone.id);
          const progress = getMilestoneProgress(milestone.id);
          const isCreatingHere = creatingInMilestone === milestone.id;

          return (
            <MilestoneGroup
              key={milestone.id}
              milestone={milestone}
              tasks={milestoneTasks}
              isExpanded={isExpanded}
              progress={progress}
              isCreatingHere={isCreatingHere}
              newTaskTitle={newTaskTitle}
              isCreating={isCreating}
              inputRef={inputRef}
              onToggle={() => toggleGroup(milestone.id)}
              onAddClick={(e) => handleAddClick(e, milestone.id)}
              onNewTaskTitleChange={setNewTaskTitle}
              onCreateTask={() => handleCreateTask(milestone.id)}
              onCancelCreate={() => { setCreatingInMilestone(null); setNewTaskTitle(""); }}
              onTaskClick={onTaskClick}
              project={project}
            />
          );
        })}

        {/* No milestone group */}
        {((tasksByMilestone.get(null)?.length ?? 0) > 0 || milestones.length === 0) && (
          <MilestoneGroup
            key="no-milestone"
            milestone={null}
            tasks={tasksByMilestone.get(null) ?? []}
            isExpanded={expandedGroups.has("no-milestone")}
            progress={{ completed: 0, total: tasksByMilestone.get(null)?.length ?? 0, percent: 0 }}
            isCreatingHere={creatingInMilestone === "no-milestone"}
            newTaskTitle={newTaskTitle}
            isCreating={isCreating}
            inputRef={inputRef}
            onToggle={() => toggleGroup("no-milestone")}
            onAddClick={(e) => handleAddClick(e, null)}
            onNewTaskTitleChange={setNewTaskTitle}
            onCreateTask={() => handleCreateTask(null)}
            onCancelCreate={() => { setCreatingInMilestone(null); setNewTaskTitle(""); }}
            onTaskClick={onTaskClick}
            project={project}
          />
        )}

        {/* Add milestone */}
        <div className="px-4 py-2">
          {showCreateMilestone ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newMilestoneName}
                onChange={(e) => setNewMilestoneName(e.target.value)}
                placeholder="Milestone name"
                className="flex-1 px-3 py-1.5 text-sm border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-teal-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateMilestone();
                  if (e.key === "Escape") { setShowCreateMilestone(false); setNewMilestoneName(""); }
                }}
              />
              <button
                onClick={handleCreateMilestone}
                disabled={!newMilestoneName.trim() || isCreatingMilestone}
                className="px-3 py-1.5 text-xs bg-teal-600 text-white rounded hover:bg-teal-500 disabled:opacity-50"
              >
                Add
              </button>
              <button
                onClick={() => { setShowCreateMilestone(false); setNewMilestoneName(""); }}
                className="px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-700 rounded"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowCreateMilestone(true)}
              className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            >
              <Plus size={16} />
              Add milestone
            </button>
          )}
        </div>
      </div>

      {/* Task count footer */}
      <div className="px-4 py-3 text-center text-sm text-zinc-500 border-t border-slate-200 dark:border-zinc-800">
        {tasks.length} tasks
      </div>
    </div>
  );
}

// Milestone Group component
interface MilestoneGroupProps {
  milestone: Milestone | null;
  tasks: TaskWithRelations[];
  isExpanded: boolean;
  progress: { completed: number; total: number; percent: number };
  isCreatingHere: boolean;
  newTaskTitle: string;
  isCreating: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  onToggle: () => void;
  onAddClick: (e: React.MouseEvent) => void;
  onNewTaskTitleChange: (s: string) => void;
  onCreateTask: () => void;
  onCancelCreate: () => void;
  onTaskClick: (task: TaskWithRelations) => void;
  project: Project;
}

function MilestoneGroup({
  milestone,
  tasks,
  isExpanded,
  progress,
  isCreatingHere,
  newTaskTitle,
  isCreating,
  inputRef,
  onToggle,
  onAddClick,
  onNewTaskTitleChange,
  onCreateTask,
  onCancelCreate,
  onTaskClick,
  project,
}: MilestoneGroupProps) {
  return (
    <div>
      {/* Milestone header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-2 hover:bg-slate-100 dark:hover:bg-zinc-900/50 transition-colors group"
      >
        <ChevronRight
          size={16}
          className={`text-zinc-500 transition-transform ${isExpanded ? "rotate-90" : ""}`}
        />
        <div className="w-2 h-2 rounded-full bg-rose-500" />
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {milestone?.name || "No milestone"}
        </span>
        <span className="text-xs text-zinc-500">
          {progress.completed} / {progress.total}
        </span>
        {milestone?.target_date && (
          <span className="text-xs text-zinc-500 ml-auto">
            {new Date(milestone.target_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        )}
        <button
          onClick={onAddClick}
          className="p-1 text-zinc-500 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Plus size={14} />
        </button>
      </button>

      {/* Tasks */}
      {isExpanded && (
        <div>
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              project={project}
              onTaskClick={onTaskClick}
            />
          ))}

          {/* Create task input */}
          {isCreatingHere && (
            <div className="flex items-center gap-2 px-4 py-2 pl-10">
              <input
                ref={inputRef}
                type="text"
                value={newTaskTitle}
                onChange={(e) => onNewTaskTitleChange(e.target.value)}
                placeholder="Task title..."
                className="flex-1 px-3 py-1.5 text-sm border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-teal-500"
                onKeyDown={(e) => {
                  if (e.key === "Enter") onCreateTask();
                  if (e.key === "Escape") onCancelCreate();
                }}
              />
              <button
                onClick={onCreateTask}
                disabled={!newTaskTitle.trim() || isCreating}
                className="px-3 py-1.5 text-xs bg-teal-600 text-white rounded hover:bg-teal-500 disabled:opacity-50"
              >
                Add
              </button>
              <button
                onClick={onCancelCreate}
                className="px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-700 rounded"
              >
                Cancel
              </button>
            </div>
          )}

          {tasks.length === 0 && !isCreatingHere && (
            <div className="px-4 py-4 pl-10 text-sm text-zinc-500 dark:text-zinc-600">No tasks</div>
          )}
        </div>
      )}
    </div>
  );
}

// Task Row component (matches tv-app's TaskRow)
interface TaskRowProps {
  task: TaskWithRelations;
  project: Project;
  onTaskClick: (task: TaskWithRelations) => void;
}

function TaskRow({ task, project, onTaskClick }: TaskRowProps) {
  const taskId = `${project.identifier_prefix || "TASK"}-${task.task_number}`;

  const isOverdue = useMemo(() => {
    if (!task.due_date) return false;
    if (task.status?.type === "completed" || task.status?.type === "canceled") return false;
    const dueDate = new Date(task.due_date);
    dueDate.setHours(23, 59, 59, 999);
    return dueDate < new Date();
  }, [task.due_date, task.status?.type]);

  return (
    <button
      onClick={() => onTaskClick(task)}
      className="flex items-center gap-3 px-4 py-2 pl-10 hover:bg-slate-100 dark:hover:bg-zinc-800/50 transition-colors w-full text-left"
    >
      {/* Priority indicator */}
      <PriorityIcon priority={task.priority || 0} />

      {/* Task ID */}
      <span className="text-xs text-zinc-500 font-mono w-16 flex-shrink-0">{taskId}</span>

      {/* Status icon */}
      <StatusIcon type={task.status?.type || "unstarted"} />

      {/* Title */}
      <span className="text-sm text-zinc-800 dark:text-zinc-200 truncate flex-1">{task.title}</span>

      {/* Due date */}
      {task.due_date && (
        <div className={`flex items-center gap-1 text-xs flex-shrink-0 ${
          isOverdue ? "text-red-500 dark:text-red-400 font-medium" : "text-zinc-500"
        }`}>
          <Calendar size={12} />
          {new Date(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          {isOverdue && <span className="text-[10px] uppercase">Overdue</span>}
        </div>
      )}

      {/* Assignee */}
      {task.assignee && (
        <div
          className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-medium flex-shrink-0"
          title={task.assignee.name || "Assigned"}
        >
          {getInitials(task.assignee.name)}
        </div>
      )}
    </button>
  );
}

// Priority Icon
function PriorityIcon({ priority }: { priority: number }) {
  if (!priority || priority === 0) return <div className="w-4 h-4 flex-shrink-0" />;

  const colors: Record<number, string> = {
    1: "#EF4444", // Urgent
    2: "#F59E0B", // High
    3: "#3B82F6", // Medium
    4: "#9CA3AF", // Low
  };
  const color = colors[priority] || "#9CA3AF";

  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="10" width="2.5" height="4" rx="0.5" fill={priority >= 4 ? color : "#374151"} />
      <rect x="6.5" y="7" width="2.5" height="7" rx="0.5" fill={priority >= 3 ? color : "#374151"} />
      <rect x="10" y="4" width="2.5" height="10" rx="0.5" fill={priority >= 2 ? color : "#374151"} />
    </svg>
  );
}

// Status Icon
function StatusIcon({ type }: { type: string }) {
  const colors: Record<string, string> = {
    backlog: "border-zinc-600",
    unstarted: "border-zinc-500",
    started: "border-amber-500 bg-amber-500/20",
    review: "border-purple-500 bg-purple-500/20",
    completed: "border-green-500 bg-green-500",
    canceled: "border-zinc-600 bg-zinc-600",
  };

  const colorClass = colors[type] || colors.unstarted;

  return (
    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${colorClass}`}>
      {type === "completed" && (
        <Check size={10} className="text-white m-auto" />
      )}
    </div>
  );
}

// Helper function
function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";
}
