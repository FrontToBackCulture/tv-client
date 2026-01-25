// src/modules/work/WorkModule.tsx
// Main Work module container with sidebar, task list, and detail panel

import { useState, useCallback, useEffect, useRef } from "react";
import {
  useProjects,
  useTasks,
  useStatuses,
  useInitiatives,
} from "../../hooks/useWork";
import type { TaskWithRelations } from "../../lib/work/types";
import { WorkSidebar } from "./WorkSidebar";
import { TaskListView } from "./TaskListView";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { TaskForm } from "./TaskForm";
import { ProjectDetailView } from "./ProjectDetailView";
import { Loader2, List, Kanban, Plus, Search } from "lucide-react";

type ViewMode = "list" | "board";
type FilterMode = "all" | "active" | "backlog";

// Storage keys
const WORK_SIDEBAR_WIDTH_KEY = "tv-desktop-work-sidebar-width";
const WORK_VIEW_MODE_KEY = "tv-desktop-work-view-mode";

function getSidebarWidth(): number {
  if (typeof window === "undefined") return 220;
  const stored = localStorage.getItem(WORK_SIDEBAR_WIDTH_KEY);
  return stored ? parseInt(stored, 10) : 220;
}

function setSidebarWidth(width: number): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(WORK_SIDEBAR_WIDTH_KEY, String(width));
  }
}

function getViewMode(): ViewMode {
  if (typeof window === "undefined") return "list";
  return (localStorage.getItem(WORK_VIEW_MODE_KEY) as ViewMode) || "list";
}

function setViewModeStorage(mode: ViewMode): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(WORK_VIEW_MODE_KEY, mode);
  }
}

export function WorkModule() {
  // State
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedInitiativeId, setSelectedInitiativeId] = useState<string | null>(null);
  const [showProjectDetail, setShowProjectDetail] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [createTaskStatusId, setCreateTaskStatusId] = useState<string | undefined>();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Sidebar resizing
  const [sidebarWidth, setSidebarWidthState] = useState(220);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(220);

  // Load persisted state on mount
  useEffect(() => {
    setSidebarWidthState(getSidebarWidth());
    setViewMode(getViewMode());
  }, []);

  // Handle sidebar resize
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = sidebarWidth;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const deltaX = e.clientX - startXRef.current;
      const newWidth = startWidthRef.current + deltaX;
      const clampedWidth = Math.max(180, Math.min(320, newWidth));
      setSidebarWidthState(clampedWidth);
      setSidebarWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
      }
    };

    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  // Data fetching
  const { data: projects = [], isLoading: projectsLoading } = useProjects();
  const { data: initiatives = [] } = useInitiatives();
  const {
    data: tasks = [],
    isLoading: tasksLoading,
    refetch: refetchTasks,
  } = useTasks(selectedProjectId);
  const { data: statuses = [] } = useStatuses(selectedProjectId);

  // Auto-select first project
  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      // Try to find inbox first
      const inbox = projects.find(
        (p) => p.slug === "inbox" || p.name.toLowerCase() === "inbox"
      );
      setSelectedProjectId(inbox?.id || projects[0].id);
    }
  }, [projects, selectedProjectId]);

  // Get current project
  const currentProject = projects.find((p) => p.id === selectedProjectId);

  // Filter tasks by search
  const filteredTasks = tasks.filter((task) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      task.title.toLowerCase().includes(query) ||
      task.description?.toLowerCase().includes(query)
    );
  });

  // Handlers
  const handleProjectSelect = useCallback((projectId: string | null) => {
    setSelectedProjectId(projectId);
    setSelectedInitiativeId(null);
    setSelectedTaskId(null);
    setShowProjectDetail(true);
  }, []);

  const handleInitiativeSelect = useCallback((initiativeId: string | null) => {
    setSelectedInitiativeId(initiativeId);
    setSelectedProjectId(null);
    setSelectedTaskId(null);
    setShowProjectDetail(false);
  }, []);

  const handleBackFromProject = useCallback(() => {
    setShowProjectDetail(false);
  }, []);

  const handleTaskClick = useCallback((task: TaskWithRelations) => {
    setSelectedTaskId(task.id);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedTaskId(null);
  }, []);

  const handleCreateTask = useCallback((statusId?: string) => {
    setCreateTaskStatusId(statusId);
    setShowTaskForm(true);
  }, []);

  const handleTaskSaved = useCallback(() => {
    setShowTaskForm(false);
    setCreateTaskStatusId(undefined);
    refetchTasks();
  }, [refetchTasks]);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    setViewModeStorage(mode);
  }, []);

  const isLoading = projectsLoading || (selectedProjectId && tasksLoading);

  return (
    <div className="h-full flex bg-slate-50 dark:bg-zinc-950">
      {/* Sidebar with resize handle */}
      <aside
        className="relative flex-shrink-0 border-r border-slate-200 dark:border-zinc-800"
        style={{
          width: sidebarWidth,
          transition: isResizing ? "none" : "width 200ms",
        }}
      >
        <WorkSidebar
          projects={projects}
          initiatives={initiatives}
          selectedProjectId={selectedProjectId}
          selectedInitiativeId={selectedInitiativeId}
          onProjectSelect={handleProjectSelect}
          onInitiativeSelect={handleInitiativeSelect}
        />

        {/* Resize Handle */}
        <div
          onMouseDown={handleMouseDown}
          className="absolute top-0 -right-1 w-3 h-full cursor-col-resize group z-50"
        >
          <div
            className={`absolute left-1 w-0.5 h-full transition-all ${
              isResizing
                ? "bg-teal-500 w-1"
                : "bg-transparent group-hover:bg-teal-500/60"
            }`}
          />
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Show ProjectDetailView when a project is selected */}
        {showProjectDetail && currentProject ? (
          <ProjectDetailView
            project={currentProject}
            initiatives={initiatives}
            onBack={handleBackFromProject}
            onRefresh={() => {
              refetchTasks();
            }}
            onDelete={() => {
              setSelectedProjectId(null);
              setShowProjectDetail(false);
            }}
          />
        ) : (
          <>
            {/* Header bar */}
            <div className="flex-shrink-0 px-4 py-3 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-200">
                  {currentProject?.name || "Tasks"}
                </h2>
                {currentProject?.identifier_prefix && (
                  <span className="text-xs text-zinc-500 dark:text-zinc-600 font-mono">
                    {currentProject.identifier_prefix}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                {/* Search */}
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-600"
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search tasks..."
                    className="w-48 pl-8 pr-3 py-1.5 text-sm border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-500 dark:placeholder-zinc-600 focus:outline-none focus:border-teal-500"
                  />
                </div>

                {/* Filter tabs */}
                <div className="flex border border-slate-300 dark:border-zinc-700 rounded-md overflow-hidden">
                  {(["all", "active", "backlog"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setFilterMode(mode)}
                      className={`px-3 py-1 text-xs font-medium transition-colors ${
                        filterMode === mode
                          ? "bg-teal-600 text-white"
                          : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-700"
                      }`}
                    >
                      {mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </button>
                  ))}
                </div>

                {/* View toggle */}
                <div className="flex border border-slate-300 dark:border-zinc-700 rounded-md overflow-hidden">
                  <button
                    onClick={() => handleViewModeChange("list")}
                    className={`p-1.5 transition-colors ${
                      viewMode === "list"
                        ? "bg-teal-600 text-white"
                        : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-700"
                    }`}
                    title="List view"
                  >
                    <List size={16} />
                  </button>
                  <button
                    onClick={() => handleViewModeChange("board")}
                    className={`p-1.5 transition-colors ${
                      viewMode === "board"
                        ? "bg-teal-600 text-white"
                        : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-700"
                    }`}
                    title="Board view"
                  >
                    <Kanban size={16} />
                  </button>
                </div>

                {/* New task button */}
                <button
                  onClick={() => handleCreateTask()}
                  disabled={!selectedProjectId}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-teal-600 text-white rounded-md hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus size={16} />
                  New Task
                </button>
              </div>
            </div>

            {/* Content area */}
            <div className="flex-1 flex overflow-hidden">
              {/* Task list */}
              <div
                className={`${
                  selectedTaskId ? "w-1/2 border-r border-slate-200 dark:border-zinc-800" : "flex-1"
                } overflow-hidden flex flex-col`}
              >
                {isLoading ? (
                  <div className="flex-1 flex items-center justify-center">
                    <Loader2 size={24} className="text-zinc-400 dark:text-zinc-600 animate-spin" />
                  </div>
                ) : !selectedProjectId ? (
                  <div className="flex-1 flex items-center justify-center text-zinc-500">
                    Select a project to view tasks
                  </div>
                ) : filteredTasks.length === 0 && searchQuery ? (
                  <div className="flex-1 flex items-center justify-center text-zinc-500">
                    No tasks match "{searchQuery}"
                  </div>
                ) : (
                  <TaskListView
                    tasks={filteredTasks}
                    statuses={statuses}
                    onTaskClick={handleTaskClick}
                    onCreateTask={handleCreateTask}
                    filterMode={filterMode}
                  />
                )}
              </div>

              {/* Task detail panel */}
              {selectedTaskId && (
                <div className="w-1/2 overflow-hidden">
                  <TaskDetailPanel
                    taskId={selectedTaskId}
                    onClose={handleCloseDetail}
                    onUpdated={refetchTasks}
                    onDeleted={() => {
                      setSelectedTaskId(null);
                      refetchTasks();
                    }}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Task form modal */}
      {showTaskForm && selectedProjectId && (
        <TaskForm
          projectId={selectedProjectId}
          defaultStatusId={createTaskStatusId}
          onClose={() => {
            setShowTaskForm(false);
            setCreateTaskStatusId(undefined);
          }}
          onSaved={handleTaskSaved}
        />
      )}
    </div>
  );
}
