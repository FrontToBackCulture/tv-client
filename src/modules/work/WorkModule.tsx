// src/modules/work/WorkModule.tsx
// Main Work module — tabbed layout with Inbox, Dashboard, Board, Tracker views

import { useState, useCallback, useEffect } from "react";
import { usePersistedModuleView } from "../../hooks/usePersistedModuleView";
import {
  LayoutDashboard, Columns3, AlertTriangle, Inbox, Plus, Target, Cloud, FolderPlus,
} from "lucide-react";
import { Button } from "../../components/ui";
import {
  useProjects, useAllTasks, useInitiatives, useUsers,
} from "../../hooks/work";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { TaskForm } from "./TaskForm";
import { InitiativeForm } from "./InitiativeForm";
import { ProjectForm } from "./ProjectForm";
import {
  type WorkView,
  ViewTab,
  InboxView,
  DashboardView,
  BoardView,
  TrackerView,
  useInitiativeProjects,
} from "./WorkViews";
import { ProjectView } from "./WorkProjectView";
import { useViewContextStore } from "../../stores/viewContextStore";
import { useNotificationNavStore } from "../../stores/notificationNavStore";
import { NotionSyncConfigs } from "../notion/NotionSyncConfigs";
import { NotionSyncStatus } from "../notion/NotionSyncStatus";

export function WorkModule() {
  const [view, setView] = usePersistedModuleView<WorkView>("work", "inbox");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showInitiativeForm, setShowInitiativeForm] = useState(false);
  const [editingInitiative, setEditingInitiative] = useState<any>(null);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);
  const [createTaskProjectId, setCreateTaskProjectId] = useState<string | undefined>();

  // Report view context for help bot
  const setViewContext = useViewContextStore((s) => s.setView);
  useEffect(() => {
    const labels: Record<WorkView, string> = { inbox: "My Tasks", dashboard: "Dashboard", board: "Board", tracker: "Tracker", notion: "Notion Sync", project: "Project" };
    setViewContext(view, labels[view]);
  }, [view, setViewContext]);

  // Handle notification navigation
  const navTarget = useNotificationNavStore((s) => s.target);
  const clearNavTarget = useNotificationNavStore((s) => s.clearTarget);
  useEffect(() => {
    if (!navTarget) return;
    if (navTarget.entityType === "task") {
      setSelectedTaskId(navTarget.entityId);
      clearNavTarget();
    } else if (navTarget.entityType === "project") {
      setSelectedProjectId(navTarget.entityId);
      setView("project");
      clearNavTarget();
    }
  }, [navTarget, clearNavTarget]);

  // Data fetching
  const { data: projects = [], refetch: refetchProjects } = useProjects();
  const { data: allTasks = [], refetch: refetchTasks } = useAllTasks();
  const { data: initiatives = [], refetch: refetchInitiatives } = useInitiatives();
  const { data: initiativeLinks = [], refetch: refetchInitiativeLinks } = useInitiativeProjects();
  const { data: users = [] } = useUsers();

  const selectedProject = selectedProjectId ? projects.find(p => p.id === selectedProjectId) : undefined;

  const handleSelectTask = useCallback((id: string) => setSelectedTaskId(id), []);

  const handleViewChange = useCallback((v: WorkView) => {
    setView(v);
    setSelectedTaskId(null);
    if (v !== "project") setSelectedProjectId(null);
  }, []);


  const handleBackFromProject = useCallback(() => {
    setView("dashboard");
    setSelectedProjectId(null);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedTaskId(null);
  }, []);

  const handleTaskUpdated = useCallback(() => {
    refetchTasks();
  }, [refetchTasks]);

  const handleTaskDeleted = useCallback(() => {
    setSelectedTaskId(null);
    refetchTasks();
  }, [refetchTasks]);

  const handleCreateTask = useCallback(() => {
    // If on project view, default to that project
    const defaultProject = selectedProjectId
      ? projects.find(p => p.id === selectedProjectId)
      : projects.find(p => p.status === "active") || projects[0];
    setCreateTaskProjectId(defaultProject?.id);
    setShowTaskForm(true);
  }, [projects, selectedProjectId]);

  const handleTaskSaved = useCallback(() => {
    setShowTaskForm(false);
    setCreateTaskProjectId(undefined);
    refetchTasks();
    refetchProjects();
  }, [refetchTasks, refetchProjects]);

  const handleInitiativeSaved = useCallback(() => {
    setShowInitiativeForm(false);
    setEditingInitiative(null);
    refetchInitiatives();
    refetchInitiativeLinks();
  }, [refetchInitiatives, refetchInitiativeLinks]);

  const handleEditInitiative = useCallback((initiative: any) => {
    setEditingInitiative(initiative);
    setShowInitiativeForm(true);
  }, []);

  const handleProjectSaved = useCallback(() => {
    setShowProjectForm(false);
    setEditingProject(null);
    refetchProjects();
    refetchTasks();
  }, [refetchProjects, refetchTasks]);

  // Don't show the "Project" tab in the tab bar — it's navigated to contextually
  const showProjectView = view === "project" && selectedProject;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Tab bar with new task button */}
      <div className="flex-shrink-0 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/50 px-4">
        <div className="flex items-center">
          <ViewTab label="Inbox" icon={Inbox} active={view === "inbox"} onClick={() => handleViewChange("inbox")} data-help-id="work-tab-inbox" />
          <ViewTab label="Dashboard" icon={LayoutDashboard} active={view === "dashboard" || view === "project"} onClick={() => handleViewChange("dashboard")} data-help-id="work-tab-dashboard" />
          <ViewTab label="Board" icon={Columns3} active={view === "board"} onClick={() => handleViewChange("board")} data-help-id="work-tab-board" />
          <ViewTab label="Tracker" icon={AlertTriangle} active={view === "tracker"} onClick={() => handleViewChange("tracker")} data-help-id="work-tab-tracker" />
          <ViewTab label="Notion" icon={Cloud} active={view === "notion"} onClick={() => handleViewChange("notion")} data-help-id="work-tab-notion" />
        </div>
        <div className="flex items-center gap-2">
          <NotionSyncStatus />
          <Button
            onClick={() => setShowInitiativeForm(true)}
            data-help-id="work-new-initiative"
            icon={Target}
            variant="ghost"
          >
            New Initiative
          </Button>
          <Button
            onClick={() => setShowProjectForm(true)}
            icon={FolderPlus}
            variant="ghost"
          >
            New Project
          </Button>
          <Button
            onClick={handleCreateTask}
            disabled={projects.length === 0}
            data-help-id="work-new-task"
            icon={Plus}
          >
            New Task
          </Button>
        </div>
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
              onEditInitiative={handleEditInitiative}
            />
          )}
          {showProjectView && (
            <ProjectView
              project={selectedProject}
              allTasks={allTasks}
              users={users}
              onSelectTask={handleSelectTask}
              onBack={handleBackFromProject}
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
          {view === "notion" && (
            <NotionSyncConfigs />
          )}
        </div>

        {/* Right: task detail panel (production version with full editing) */}
        {selectedTaskId && (
          <div className="w-[400px] flex-shrink-0">
            <TaskDetailPanel
              key={selectedTaskId}
              taskId={selectedTaskId}
              onClose={handleCloseDetail}
              onUpdated={handleTaskUpdated}
              onDeleted={handleTaskDeleted}
            />
          </div>
        )}
      </div>

      {/* Task form modal */}
      {showTaskForm && createTaskProjectId && (
        <TaskForm
          projectId={createTaskProjectId}
          onClose={() => {
            setShowTaskForm(false);
            setCreateTaskProjectId(undefined);
          }}
          onSaved={handleTaskSaved}
        />
      )}

      {/* Initiative form modal */}
      {showInitiativeForm && (
        <InitiativeForm
          initiative={editingInitiative || undefined}
          initiativeLinks={initiativeLinks}
          onClose={() => {
            setShowInitiativeForm(false);
            setEditingInitiative(null);
          }}
          onSaved={handleInitiativeSaved}
        />
      )}

      {/* Project form modal */}
      {showProjectForm && (
        <ProjectForm
          project={editingProject || undefined}
          onClose={() => {
            setShowProjectForm(false);
            setEditingProject(null);
          }}
          onSaved={handleProjectSaved}
        />
      )}
    </div>
  );
}
