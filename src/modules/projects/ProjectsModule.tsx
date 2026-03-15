// src/modules/projects/ProjectsModule.tsx
// Unified Projects module — combines Work, CRM deals, and Workspaces into one hub

import { useState, useCallback, useEffect, useRef } from "react";
import { usePersistedModuleView } from "../../hooks/usePersistedModuleView";
import {
  LayoutDashboard, Columns3, Building2,
  Plus, Target, FolderPlus,
} from "lucide-react";
import { Button } from "../../components/ui";
import { useQuery } from "@tanstack/react-query";
import { useProjects, useAllTasks, useInitiatives, useUsers, useUpdateProject } from "../../hooks/work";
import { supabase } from "../../lib/supabase";
import { usePipelineStats, useCRMRealtime } from "../../hooks/crm";
import { TaskDetailPanel } from "../work/TaskDetailPanel";
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
  useInitiativeProjects,
} from "../work/WorkViews";
import { ViewTab } from "../../components/ViewTab";
import { MetadataView } from "./MetadataView";
import { ProjectsGrid } from "./ProjectsGrid";
import { ProjectView } from "../work/WorkProjectView";
import { DealPipeline } from "../crm/DealPipeline";
import { DirectoryView } from "../crm/DirectoryView";
import { ClientsView } from "../crm/ClientsView";
import { ClosedDealsView } from "../crm/ClosedDealsView";
import { WorkspaceDetailView } from "../workspace/WorkspaceDetailView";
import { useViewContextStore } from "../../stores/viewContextStore";

type ProjectsView =
  | "all" | "inbox" | "dashboard" | "board" | "tracker" | "project"              // Work views
  | "pipeline" | "metadata" | "directory" | "clients" | "closed"                 // CRM views
  | "workspace-detail";                                                          // Workspace views

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

export function ProjectsModule() {
  const [view, setView] = usePersistedModuleView<ProjectsView>("projects", "inbox");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
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
      all: "All Projects", inbox: "My Tasks", dashboard: "Dashboard", board: "Board",
      tracker: "Tracker", project: "Project",
      pipeline: "Pipeline", metadata: "Metadata", directory: "Directory", clients: "Clients", closed: "Closed Deals",
      "workspace-detail": "Workspace Detail",
    };
    setViewContext(view, labels[view]);
  }, [view, setViewContext]);

  // Enable CRM real-time updates
  useCRMRealtime();

  const updateProjectMutation = useUpdateProject();

  // Data fetching — Work (filtered to work type for board/inbox/tracker)
  const { data: projects = [], refetch: refetchProjects } = useProjects();
  // All projects across all types (for "All" view)
  const { data: allProjects = [], refetch: refetchAllProjects } = useProjects("all");
  const { data: allTasks = [], refetch: refetchTasks } = useAllTasks();
  const { data: initiatives = [], refetch: refetchInitiatives } = useInitiatives();
  const { data: initiativeLinks = [], refetch: refetchInitiativeLinks } = useInitiativeProjects();
  const { data: users = [] } = useUsers();

  // Data fetching — CRM
  const pipelineStatsQuery = usePipelineStats();

  // Data fetching — Task-Deal junction links
  const { data: taskDealLinks = [] } = useQuery({
    queryKey: ["task-deal-links"],
    queryFn: async () => {
      const { data } = await supabase.from("task_deal_links").select("task_id, deal_id");
      return (data ?? []) as { task_id: string; deal_id: string }[];
    },
  });

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
    setSelectedWorkspaceId(null);
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
    refetchAllProjects();
    refetchTasks();
  }, [refetchProjects, refetchAllProjects, refetchTasks]);

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

  // Workspace handlers
  const handleBackFromWorkspace = useCallback(() => {
    setSelectedWorkspaceId(null);
    setView("all");
  }, []);

  // ---- Determine which section is active ----
  const isWorkView = ["all", "inbox", "dashboard", "board", "tracker", "project"].includes(view);
  const isCrmView = ["pipeline", "directory", "clients", "closed"].includes(view);

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

  // ---- Full-screen workspace detail ----
  if (view === "workspace-detail" && selectedWorkspaceId) {
    return (
      <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
        <WorkspaceDetailView
          workspaceId={selectedWorkspaceId}
          onBack={handleBackFromWorkspace}
          onUpdated={() => {}}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-3 pb-1">
        <p className="text-xs text-zinc-400">
          {view === "pipeline"
            ? "Track deals through pipeline stages — drag cards between columns to update deal progress."
            : allSubView === "manage"
            ? "Full grid view of all projects — sort, filter, group, and bulk edit. Use Layouts to save custom views."
            : "Browse projects grouped by initiative — expand to see tasks, click to open project details."}
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex-shrink-0 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/50 px-4">
        <div className="flex items-center overflow-x-auto">
          {/* Work section */}
          <ViewTab label="Browse" icon={LayoutDashboard} active={view === "all" && allSubView === "browse"} onClick={() => { handleViewChange("all"); setAllSubView("browse"); }} />
          <ViewTab label="Manage" icon={Columns3} active={view === "all" && allSubView === "manage"} onClick={() => { handleViewChange("all"); setAllSubView("manage"); }} />

          {/* Separator */}
          <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />

          <ViewTab label="CRM Pipeline" icon={Building2} active={view === "pipeline"} onClick={() => handleViewChange("pipeline")} />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {isWorkView && (
            <>
              <Button onClick={() => setShowInitiativeForm(true)} icon={Target} variant="ghost">New Initiative</Button>
              <Button onClick={() => setShowProjectForm(true)} icon={FolderPlus} variant="ghost">New Project</Button>
              <Button onClick={handleCreateTask} disabled={projects.length === 0} icon={Plus}>New Task</Button>
            </>
          )}

        </div>
      </div>

      {/* Content area */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden">
        {/* ---- All Projects View ---- */}
        {view === "all" && allSubView === "browse" && (
          <div className="flex-1 overflow-hidden">
            <DashboardView
              projects={allProjects} allTasks={allTasks} initiatives={initiatives} initiativeLinks={initiativeLinks}
              taskDealLinks={taskDealLinks} onEditInitiative={handleEditInitiative}
              onUpdateProject={handleUpdateProject}
              onInitiativeLinkChanged={handleInitiativeLinkChanged}
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
                    if (t.status?.type === "completed") c.completed++;
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
                    workspaceId={manageSelectedId}
                    onBack={() => setManageSelectedId(null)}
                    onUpdated={() => { refetchAllProjects(); }}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* ---- Work Views ---- */}
        {view === "inbox" && (
          <div className={`flex flex-col overflow-hidden ${selectedTaskId ? "flex-1 border-r border-zinc-100 dark:border-zinc-800/50" : "flex-1"}`}>
            <InboxView allTasks={allTasks} projects={projects} initiatives={initiatives} initiativeLinks={initiativeLinks} onSelectTask={handleSelectTask} />
          </div>
        )}
        {showProjectView && (
          <div className={`flex flex-col overflow-hidden ${selectedTaskId ? "flex-1 border-r border-zinc-100 dark:border-zinc-800/50" : "flex-1"}`}>
            <ProjectView project={selectedProject} allTasks={allTasks} users={users} onSelectTask={handleSelectTask} onBack={handleBackFromProject} />
          </div>
        )}
        {view === "board" && (
          <div className={`flex flex-col overflow-hidden ${selectedTaskId ? "flex-1 border-r border-zinc-100 dark:border-zinc-800/50" : "flex-1"}`}>
            <BoardView projects={projects} initiatives={initiatives} initiativeLinks={initiativeLinks} onSelectTask={handleSelectTask} />
          </div>
        )}
        {view === "tracker" && (
          <div className={`flex flex-col overflow-hidden ${selectedTaskId ? "flex-1 border-r border-zinc-100 dark:border-zinc-800/50" : "flex-1"}`}>
            <TrackerView allTasks={allTasks} projects={projects} initiatives={initiatives} initiativeLinks={initiativeLinks} onSelectTask={handleSelectTask} />
          </div>
        )}
        {/* ---- CRM Views ---- */}
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
          <div className="w-[400px] flex-shrink-0">
            <TaskDetailPanel key={selectedTaskId} taskId={selectedTaskId} onClose={handleCloseTaskDetail} onUpdated={handleTaskUpdated} onDeleted={handleTaskDeleted} />
          </div>
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
