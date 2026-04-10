// src/modules/projects/ProjectsModule.tsx
// Unified Projects module — combines Work, CRM deals, and Workspaces into one hub

import { useState, useCallback, useEffect, useRef } from "react";
import { usePersistedModuleView } from "../../hooks/usePersistedModuleView";
import {
  LayoutDashboard, Columns3, Building2, BarChart3, Activity,
  Plus, Target, FolderPlus, User as UserIcon, Users, Layers,
  ChevronDown,
} from "lucide-react";
import { Button } from "../../components/ui";
import { useProjects, useAllTasks, useInitiatives, useUsers, useUpdateProject } from "../../hooks/work";
import { useCurrentUserId } from "../../hooks/work/useUsers";
import { supabase } from "../../lib/supabase";
import { usePipelineStats, useCRMRealtime } from "../../hooks/crm";
import { TaskDetailPanel } from "../work/TaskDetailPanel";
import { ResizablePanel } from "../../components/ResizablePanel";
import { TaskForm } from "../work/TaskForm";
import { InitiativeForm } from "../work/InitiativeForm";
import { ProjectForm } from "../work/ProjectForm";
import { CompanyDetailPanel } from "../crm/CompanyDetailPanel";
import { CompanyForm } from "../crm/CompanyForm";
import { Company, DealWithTaskInfo } from "../../lib/crm/types";
import {
  InboxView,
  DashboardView,
  BoardView,
  TrackerView,
  MyTasksView,
  BandwidthView,
  TeamTasksView,
  TriageContextView,
  useInitiativeProjects,
} from "../work/WorkViews";
import { ViewTab } from "../../components/ViewTab";
import { PageHeader } from "../../components/PageHeader";
import { MetadataView } from "./MetadataView";
import { ProjectsGrid } from "./ProjectsGrid";
import { ProjectView } from "../work/WorkProjectView";
import { DealPipeline } from "../crm/DealPipeline";
import { CrmDashboard } from "../crm/CrmDashboard";
import { DirectoryView } from "../crm/DirectoryView";
import { ClientsView } from "../crm/ClientsView";
import { ClosedDealsView } from "../crm/ClosedDealsView";

import { NotionSyncStatus } from "../notion/NotionSyncStatus";
import { WorkspaceDetailView } from "../workspace/WorkspaceDetailView";
import { useViewContextStore } from "../../stores/viewContextStore";
import { useNotificationNavStore } from "../../stores/notificationNavStore";

type ProjectsView =
  | "all" | "inbox" | "dashboard" | "board" | "tracker" | "project" | "my-tasks" | "team-tasks" | "capacity" | "triage-context"  // Work views
  | "crm-dashboard" | "pipeline" | "metadata" | "directory" | "clients" | "closed"  // CRM views

const CRM_DETAIL_PANEL_WIDTH_KEY = "tv-desktop-crm-detail-panel-width";

function getDetailPanelWidth(): number {
  if (typeof window === "undefined") return 50;
  const stored = localStorage.getItem(CRM_DETAIL_PANEL_WIDTH_KEY);
  return stored ? parseInt(stored, 10) : 50;
}

function setDetailPanelWidth(width: number): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(CRM_DETAIL_PANEL_WIDTH_KEY, String(width));
  }
}

// Collapsible tab group — shows group label when collapsed, individual tabs when expanded
// Auto-expands when the active view is in this group
function TabGroup({ label, tabs, activeView, onSelect }: {
  label: string;
  tabs: { label: string; icon: import("lucide-react").LucideIcon; view: ProjectsView; subView?: string }[];
  activeView: ProjectsView;
  onSelect: (view: ProjectsView, subView?: string) => void;
}) {
  const hasActiveTab = tabs.some(t => t.view === activeView);
  const [manualExpand, setManualExpand] = useState<boolean | null>(null);
  const expanded = manualExpand ?? hasActiveTab;

  // Reset manual override when active tab changes into/out of this group
  useEffect(() => { setManualExpand(null); }, [hasActiveTab]);

  if (expanded) {
    return (
      <div className="flex items-center h-full">
        {/* Collapse handle — group label */}
        <button
          onClick={() => setManualExpand(false)}
          className="text-[9px] font-semibold uppercase tracking-[0.06em] text-zinc-400 dark:text-zinc-500 hover:text-zinc-500 dark:hover:text-zinc-400 px-1.5 h-full flex items-center transition-colors cursor-pointer select-none"
          title={`Collapse ${label}`}
        >
          {label}
        </button>
        {tabs.map(tab => (
          <ViewTab
            key={tab.view + (tab.subView || "")}
            label={tab.label}
            icon={tab.icon}
            active={tab.view === activeView}
            onClick={() => onSelect(tab.view, tab.subView)}
          />
        ))}
      </div>
    );
  }

  // Collapsed — show just the group label as a clickable pill
  const activeTab = tabs.find(t => t.view === activeView);
  return (
    <button
      onClick={() => setManualExpand(true)}
      className={`flex items-center gap-1 px-2.5 py-1 h-full text-[11px] font-medium transition-colors border-b-2 cursor-pointer select-none ${
        activeTab
          ? "border-teal-600 text-teal-700 dark:text-teal-400 dark:border-teal-500"
          : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
      }`}
      title={`Expand ${label}: ${tabs.map(t => t.label).join(", ")}`}
    >
      {activeTab ? (
        <>
          <activeTab.icon size={13} />
          {activeTab.label}
        </>
      ) : (
        <span className="text-[10px] font-semibold uppercase tracking-[0.04em]">{label}</span>
      )}
      <ChevronDown size={10} className="opacity-40" />
    </button>
  );
}

export function ProjectsModule() {
  const [view, setView] = usePersistedModuleView<ProjectsView>("projects", "inbox");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showInitiativeForm, setShowInitiativeForm] = useState(false);
  const [editingInitiative, setEditingInitiative] = useState<any>(null);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);
  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | undefined>(undefined);
  const [createTaskProjectId, setCreateTaskProjectId] = useState<string | undefined>();
  const [allSubView, setAllSubView] = useState<"browse" | "manage">("browse");
  const [manageSelectedId, setManageSelectedId] = useState<string | null>(null);
  const [manageDetailWidth, setManageDetailWidth] = useState(450);
  const manageDragging = useRef(false);

  // Report view context for help bot
  const setViewContext = useViewContextStore((s) => s.setView);
  useEffect(() => {
    const labels: Record<ProjectsView, string> = {
      all: "All Projects", inbox: "My Tasks", dashboard: "Dashboard", board: "Board", "my-tasks": "My Tasks", "team-tasks": "Team", capacity: "Capacity", "triage-context": "Triage Context",
      tracker: "Tracker", project: "Project",
      "crm-dashboard": "CRM Dashboard", pipeline: "Pipeline", metadata: "Metadata", directory: "Directory", clients: "Clients", closed: "Closed Deals",
    };
    setViewContext(view, labels[view]);
  }, [view, setViewContext]);

  // CRM real-time handled by global useRealtimeSync() in App.tsx

  const updateProjectMutation = useUpdateProject();

  // Data fetching — Work (filtered to work type for board/inbox/tracker)
  const { data: projects = [], refetch: refetchProjects } = useProjects();
  // All projects across all types (for "All" view)
  const { data: allProjects = [], refetch: refetchAllProjects } = useProjects("all");
  const { data: allTasks = [], isLoading: tasksLoading, refetch: refetchTasks } = useAllTasks();
  const { data: initiatives = [], refetch: refetchInitiatives } = useInitiatives();
  const { data: initiativeLinks = [], refetch: refetchInitiativeLinks } = useInitiativeProjects();
  const { data: users = [] } = useUsers();
  const currentUserId = useCurrentUserId();

  // Pick up pending project from sidebar/task detail

  // Handle notification/chat navigation — open entity when navigated from notification bell or chat entity card
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
    } else if (navTarget.entityType === "crm_company" || navTarget.entityType === "crm_deal") {
      setSelectedCompanyId(navTarget.entityId);
      clearNavTarget();
    }
  }, [navTarget, clearNavTarget, setView]);

  // Data fetching — CRM (+ real-time sync for bot/external updates)
  useCRMRealtime();
  const pipelineStatsQuery = usePipelineStats();

  // Task-Deal links (deprecated — tasks link to deal-projects via project_id now)
  const taskDealLinks: { task_id: string; deal_id: string }[] = [];

  // Detail panel resizing (CRM views)
  const [detailPanelWidth, setDetailPanelWidthState] = useState(50);
  const [isResizingDetail, setIsResizingDetail] = useState(false);
  const detailStartXRef = useRef(0);
  const detailStartWidthRef = useRef(50);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDetailPanelWidthState(getDetailPanelWidth());
  }, []);

  const handleDetailMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingDetail(true);
    detailStartXRef.current = e.clientX;
    detailStartWidthRef.current = detailPanelWidth;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingDetail && containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const deltaX = e.clientX - detailStartXRef.current;
        const deltaPercent = (deltaX / containerWidth) * 100;
        const newWidth = detailStartWidthRef.current - deltaPercent;
        const clampedWidth = Math.max(25, Math.min(75, newWidth));
        setDetailPanelWidthState(clampedWidth);
        setDetailPanelWidth(clampedWidth);
      }
    };
    const handleMouseUp = () => {
      if (isResizingDetail) setIsResizingDetail(false);
    };
    if (isResizingDetail) {
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
  }, [isResizingDetail]);

  const selectedProject = selectedProjectId
    ? (allProjects.find(p => p.id === selectedProjectId) || projects.find(p => p.id === selectedProjectId))
    : undefined;

  // ---- Handlers ----

  const handleViewChange = useCallback((v: ProjectsView) => {
    setView(v);
    setSelectedTaskId(null);
    setSelectedCompanyId(null);
    if (v !== "project") setSelectedProjectId(null);
  }, []);

  const handleSelectTask = useCallback((id: string) => setSelectedTaskId(id), []);


  const handleBackFromProject = useCallback(() => {
    setView("all");
    setSelectedProjectId(null);
  }, []);

  const handleCloseTaskDetail = useCallback(() => setSelectedTaskId(null), []);

  const handleTaskUpdated = useCallback(() => refetchTasks(), [refetchTasks]);

  const handleTaskDeleted = useCallback(() => {
    setSelectedTaskId(null);
    refetchTasks();
  }, [refetchTasks]);

  const handleCreateTask = useCallback(() => {
    const defaultProject = selectedProjectId
      ? allProjects.find(p => p.id === selectedProjectId)
      : allProjects.find(p => p.status === "active") || allProjects[0];
    setCreateTaskProjectId(defaultProject?.id);
    setShowTaskForm(true);
  }, [allProjects, selectedProjectId]);

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
    refetchAllProjects();
    refetchTasks();
    refetchInitiativeLinks();
  }, [refetchProjects, refetchAllProjects, refetchTasks, refetchInitiativeLinks]);

  // Inline update handlers
  const handleUpdateProject = useCallback((id: string, updates: Record<string, any>) => {
    updateProjectMutation.mutate({ id, updates });
    refetchProjects();
    refetchAllProjects();
  }, [updateProjectMutation, refetchProjects, refetchAllProjects]);

  const handleInitiativeLinkChanged = useCallback(async (projectId: string, initiativeId: string | null) => {
    await supabase.from("initiative_projects").delete().eq("project_id", projectId);
    if (initiativeId) {
      await supabase.from("initiative_projects").insert({ initiative_id: initiativeId, project_id: projectId });
    }
    refetchInitiativeLinks();
  }, [refetchInitiativeLinks]);

  // CRM handlers
  const handleSelectCompany = useCallback((id: string | null) => setSelectedCompanyId(id), []);
  const handleDealClick = useCallback((deal: DealWithTaskInfo) => setSelectedCompanyId(deal.company_id), []);
  const handleNewCompany = useCallback(() => {
    setEditingCompany(undefined);
    setShowCompanyForm(true);
  }, []);
  const handleCompanySaved = useCallback(() => {
    setShowCompanyForm(false);
    setEditingCompany(undefined);
    pipelineStatsQuery.refetch();
  }, [pipelineStatsQuery]);
  const handleCloseCompanyDetail = useCallback(() => setSelectedCompanyId(null), []);

  // ---- Determine which section is active ----
  const isWorkView = ["all", "inbox", "dashboard", "board", "tracker", "project", "my-tasks", "team-tasks", "capacity", "triage-context"].includes(view);
  const isCrmView = ["crm-dashboard", "pipeline", "directory", "clients", "closed"].includes(view);

  const showProjectView = view === "project" && selectedProject;

  // Company detail panel (shared across CRM views)
  const companyDetailPanel = selectedCompanyId && isCrmView && (
    <div
      className="relative overflow-hidden border-l border-zinc-200 dark:border-zinc-800"
      style={{
        flex: `0 0 ${detailPanelWidth}%`,
        transition: isResizingDetail ? "none" : "flex 200ms",
      }}
    >
      <div
        onMouseDown={handleDetailMouseDown}
        className="absolute top-0 -left-1 w-3 h-full cursor-col-resize group z-50"
      >
        <div className={`absolute right-1 w-0.5 h-full transition-all ${isResizingDetail ? "bg-teal-500 w-1" : "bg-transparent group-hover:bg-teal-500/60"}`} />
      </div>
      <CompanyDetailPanel
        companyId={selectedCompanyId}
        onClose={handleCloseCompanyDetail}
        onCompanyUpdated={() => pipelineStatsQuery.refetch()}
        onCompanyDeleted={() => {
          setSelectedCompanyId(null);
          pipelineStatsQuery.refetch();
        }}
      />
    </div>
  );

  // Don't block the entire module on tasks loading — let views render and show tasks as they arrive

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      <PageHeader
        description={
          view === "crm-dashboard"
            ? "Pipeline overview — action queue, stage summary, and upcoming closes at a glance."
            : view === "pipeline"
            ? "Track deals through pipeline stages — drag cards between columns to update deal progress."
            : allSubView === "manage"
            ? "Full grid view of all projects — sort, filter, group, and bulk edit. Use Layouts to save custom views."
            : "Browse projects grouped by initiative — expand to see tasks, click to open project details."
        }
        tabs={<>
          <TabGroup
            label="Projects"
            tabs={[
              { label: "Browse", icon: LayoutDashboard, view: "all" as ProjectsView, subView: "browse" },
              { label: "Manage", icon: Columns3, view: "all" as ProjectsView, subView: "manage" },
            ]}
            activeView={view}
            onSelect={(v, sub) => { handleViewChange(v); if (sub) setAllSubView(sub as any); }}
          />
          <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />
          <TabGroup
            label="Tasks"
            tabs={[
              { label: "My Tasks", icon: UserIcon, view: "my-tasks" as ProjectsView },
              { label: "Team", icon: Users, view: "team-tasks" as ProjectsView },
              { label: "Capacity", icon: Activity, view: "capacity" as ProjectsView },
              { label: "Context", icon: Layers, view: "triage-context" as ProjectsView },
            ]}
            activeView={view}
            onSelect={(v) => handleViewChange(v)}
          />
          <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />
          <TabGroup
            label="CRM"
            tabs={[
              { label: "Dashboard", icon: BarChart3, view: "crm-dashboard" as ProjectsView },
              { label: "Pipeline", icon: Building2, view: "pipeline" as ProjectsView },
            ]}
            activeView={view}
            onSelect={(v) => handleViewChange(v)}
          />
        </>}
        actions={isWorkView ? <>
          <NotionSyncStatus />
          <Button onClick={() => setShowInitiativeForm(true)} icon={Target} variant="ghost">New Initiative</Button>
          <Button onClick={() => setShowProjectForm(true)} icon={FolderPlus} variant="ghost">New Project</Button>
          <Button onClick={handleCreateTask} disabled={projects.length === 0} icon={Plus}>New Task</Button>
        </> : undefined}
      />

      {/* Content area */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden relative">
        {/* ---- All Projects View ---- */}
        {view === "all" && allSubView === "browse" && (
          <div className="flex-1 overflow-hidden">
            <DashboardView
              projects={allProjects} allTasks={allTasks} initiatives={initiatives} initiativeLinks={initiativeLinks}
              taskDealLinks={taskDealLinks} onEditInitiative={handleEditInitiative}
              onUpdateProject={handleUpdateProject}
              onInitiativeLinkChanged={handleInitiativeLinkChanged}
              onCreateTask={(projectId) => {
                setCreateTaskProjectId(projectId);
                setShowTaskForm(true);
              }}
            />
          </div>
        )}
        {view === "all" && allSubView === "manage" && (
          <div className="flex-1 flex overflow-hidden">
            <div className={manageSelectedId ? "flex-1 overflow-hidden" : "flex-1 overflow-hidden"}>
              <ProjectsGrid
                projects={allProjects}
                taskCounts={(() => {
                  const map = new Map<string, { total: number; completed: number; overdue: number }>();
                  for (const t of allTasks) {
                    const c = map.get(t.project_id) || { total: 0, completed: 0, overdue: 0 };
                    c.total++;
                    if (t.status?.type === "complete") c.completed++;
                    map.set(t.project_id, c);
                  }
                  return map;
                })()}
                companyMap={(() => {
                  const map = new Map<string, { name: string; stage: string | null }>();
                  for (const p of allProjects) {
                    if (p.company_id && (p as any).company?.name) {
                      map.set(p.company_id, { name: (p as any).company.name, stage: (p as any).company.stage });
                    }
                  }
                  return map;
                })()}
                onSelectProject={(id) => setManageSelectedId(id)}
              />
            </div>
            {manageSelectedId && (
              <>
                <div className="w-1 flex-shrink-0 cursor-col-resize hover:bg-teal-500/30 active:bg-teal-500/50 transition-colors"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    manageDragging.current = true;
                    const startX = e.clientX;
                    const startW = manageDetailWidth;
                    const move = (ev: MouseEvent) => { if (manageDragging.current) setManageDetailWidth(Math.min(900, Math.max(300, startW - (ev.clientX - startX)))); };
                    const up = () => { manageDragging.current = false; document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
                    document.addEventListener("mousemove", move);
                    document.addEventListener("mouseup", up);
                  }}
                />
                <div className="flex-shrink-0 overflow-hidden border-l border-zinc-200 dark:border-zinc-800" style={{ width: manageDetailWidth }}>
                  <WorkspaceDetailView
                    key={manageSelectedId}
                    workspaceId={manageSelectedId}
                    onBack={() => setManageSelectedId(null)}
                    onUpdated={() => { refetchAllProjects(); refetchTasks(); }}
                    onCreateTask={() => {
                      setCreateTaskProjectId(manageSelectedId);
                      setShowTaskForm(true);
                    }}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* ---- Work Views ---- */}
        {view === "inbox" && (
          <div className={`flex flex-col overflow-hidden ${selectedTaskId ? "flex-1 border-r border-zinc-100 dark:border-zinc-800" : "flex-1"}`}>
            <InboxView allTasks={allTasks} projects={projects} initiatives={initiatives} initiativeLinks={initiativeLinks} onSelectTask={handleSelectTask} isLoading={tasksLoading} />
          </div>
        )}
        {view === "my-tasks" && (
          <div className={`flex flex-col overflow-hidden ${selectedTaskId ? "flex-1 border-r border-zinc-100 dark:border-zinc-800" : "flex-1"}`}>
            <MyTasksView allTasks={allTasks} users={users} currentUserId={currentUserId} onSelectTask={handleSelectTask} initiatives={initiatives} initiativeLinks={initiativeLinks} />
          </div>
        )}
        {view === "team-tasks" && (
          <div className={`flex flex-col overflow-hidden ${selectedTaskId ? "flex-1 border-r border-zinc-100 dark:border-zinc-800" : "flex-1"}`}>
            <TeamTasksView allTasks={allTasks} users={users} onSelectTask={handleSelectTask} initiatives={initiatives} initiativeLinks={initiativeLinks} />
          </div>
        )}
        {view === "capacity" && (
          <div className={`flex flex-col overflow-hidden ${selectedTaskId ? "flex-1 border-r border-zinc-100 dark:border-zinc-800" : "flex-1"}`}>
            <BandwidthView allTasks={allTasks} users={users} onSelectTask={handleSelectTask} initiatives={initiatives} initiativeLinks={initiativeLinks} />
          </div>
        )}
        {view === "triage-context" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <TriageContextView />
          </div>
        )}
        {showProjectView && (
          <div className={`flex flex-col overflow-hidden ${selectedTaskId ? "flex-1 border-r border-zinc-100 dark:border-zinc-800" : "flex-1"}`}>
            <ProjectView project={selectedProject} allTasks={allTasks} users={users} onSelectTask={handleSelectTask} onBack={handleBackFromProject} onCreateTask={handleCreateTask} />
          </div>
        )}
        {view === "board" && (
          <div className={`flex flex-col overflow-hidden ${selectedTaskId ? "flex-1 border-r border-zinc-100 dark:border-zinc-800" : "flex-1"}`}>
            <BoardView projects={projects} initiatives={initiatives} initiativeLinks={initiativeLinks} onSelectTask={handleSelectTask} />
          </div>
        )}
        {view === "tracker" && (
          <div className={`flex flex-col overflow-hidden ${selectedTaskId ? "flex-1 border-r border-zinc-100 dark:border-zinc-800" : "flex-1"}`}>
            <TrackerView allTasks={allTasks} projects={projects} initiatives={initiatives} initiativeLinks={initiativeLinks} onSelectTask={handleSelectTask} />
          </div>
        )}
        {/* ---- CRM Views ---- */}
        {view === "crm-dashboard" && (
          <>
            <div className="overflow-hidden" style={{ flex: selectedCompanyId ? `0 0 ${100 - detailPanelWidth}%` : "1 1 auto", transition: isResizingDetail ? "none" : "flex 200ms" }}>
              <CrmDashboard onDealClick={handleDealClick} />
            </div>
            {companyDetailPanel}
          </>
        )}
        {view === "pipeline" && (
          <>
            <div className="overflow-hidden" style={{ flex: selectedCompanyId ? `0 0 ${100 - detailPanelWidth}%` : "1 1 auto", transition: isResizingDetail ? "none" : "flex 200ms" }}>
              <DealPipeline onRefresh={() => pipelineStatsQuery.refetch()} onDealClick={handleDealClick} />
            </div>
            {companyDetailPanel}
          </>
        )}
        {view === "metadata" && (
          <div className="flex-1 overflow-hidden">
            <MetadataView />
          </div>
        )}
        {view === "directory" && (
          <>
            <div className="flex flex-col overflow-hidden" style={{ flex: selectedCompanyId ? `0 0 ${100 - detailPanelWidth}%` : "1 1 auto", transition: isResizingDetail ? "none" : "flex 200ms" }}>
              <DirectoryView selectedId={selectedCompanyId} onSelect={handleSelectCompany} onNewCompany={handleNewCompany} />
            </div>
            {companyDetailPanel}
          </>
        )}
        {view === "clients" && (
          <>
            <div className="flex flex-col overflow-hidden" style={{ flex: selectedCompanyId ? `0 0 ${100 - detailPanelWidth}%` : "1 1 auto", transition: isResizingDetail ? "none" : "flex 200ms" }}>
              <ClientsView selectedId={selectedCompanyId} onSelect={handleSelectCompany} />
            </div>
            {companyDetailPanel}
          </>
        )}
        {view === "closed" && (
          <>
            <div className="flex flex-col overflow-hidden" style={{ flex: selectedCompanyId ? `0 0 ${100 - detailPanelWidth}%` : "1 1 auto", transition: isResizingDetail ? "none" : "flex 200ms" }}>
              <ClosedDealsView selectedId={selectedCompanyId} onSelect={handleSelectCompany} />
            </div>
            {companyDetailPanel}
          </>
        )}


        {/* ---- Task detail panel (Work views only) ---- */}
        {selectedTaskId && isWorkView && (
          <ResizablePanel>
            <TaskDetailPanel key={selectedTaskId} taskId={selectedTaskId} onClose={handleCloseTaskDetail} onUpdated={handleTaskUpdated} onDeleted={handleTaskDeleted} />
          </ResizablePanel>
        )}
      </div>

      {/* Modals */}
      {showTaskForm && createTaskProjectId && (
        <TaskForm projectId={createTaskProjectId} onClose={() => { setShowTaskForm(false); setCreateTaskProjectId(undefined); }} onSaved={handleTaskSaved} />
      )}
      {showInitiativeForm && (
        <InitiativeForm initiative={editingInitiative || undefined} initiativeLinks={initiativeLinks} onClose={() => { setShowInitiativeForm(false); setEditingInitiative(null); }} onSaved={handleInitiativeSaved} />
      )}
      {showProjectForm && (
        <ProjectForm project={editingProject || undefined} onClose={() => { setShowProjectForm(false); setEditingProject(null); }} onSaved={handleProjectSaved} />
      )}
      {showCompanyForm && (
        <CompanyForm company={editingCompany} onClose={() => { setShowCompanyForm(false); setEditingCompany(undefined); }} onSaved={handleCompanySaved} />
      )}
    </div>
  );
}
