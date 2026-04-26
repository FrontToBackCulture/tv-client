// src/modules/projects/ProjectsModule.tsx
// Projects module — Manage grid + Project detail view. Tasks and CRM live in
// their own top-level modules.

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useProjects, useAllTasks, useInitiatives, useUsers } from "../../hooks/work";
import { usePersistedModuleView } from "../../hooks/usePersistedModuleView";
import { TaskDetailPanel } from "../work/TaskDetailPanel";
import { ResizablePanel } from "../../components/ResizablePanel";
import { TaskForm } from "../work/TaskForm";
import { useInitiativeProjects } from "../work/WorkViews";
import { PageHeader } from "../../components/PageHeader";
import { StatsStrip } from "../../components/StatsStrip";
import { RecentChangesPanel } from "../../components/RecentChangesPanel";
import { ProjectsGrid } from "./ProjectsGrid";
import { NotionSyncStatus } from "../notion/NotionSyncStatus";
import { WorkspaceDetailView } from "../workspace/WorkspaceDetailView";
import { useViewContextStore } from "../../stores/viewContextStore";
import { useNotificationNavStore } from "../../stores/notificationNavStore";
import { useSelectedEntityStore } from "../../stores/selectedEntityStore";
import { InitiativeDetailPanel } from "./InitiativeDetailPanel";
import { timeAgoVerbose } from "../../lib/date";

type ProjectsView = "manage" | "project";

const VIEW_LABELS: Record<ProjectsView, string> = {
  manage: "Manage",
  project: "Project",
};

const VALID_VIEWS: ReadonlySet<ProjectsView> = new Set(["manage", "project"]);

export function ProjectsModule() {
  const [rawView, setView] = usePersistedModuleView<ProjectsView>("projects", "manage");
  // Stale persisted values from prior versions (e.g. "browse", "pipeline") fall back to Manage.
  const view: ProjectsView = VALID_VIEWS.has(rawView) ? rawView : "manage";
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectIdState] = useState<string | null>(() => {
    try { return localStorage.getItem("tv-client-projects-selected") || null; } catch { return null; }
  });
  const setSelectedProjectId = useCallback((id: string | null) => {
    setSelectedProjectIdState(id);
    try {
      if (id) localStorage.setItem("tv-client-projects-selected", id);
      else localStorage.removeItem("tv-client-projects-selected");
    } catch { /* ignore */ }
  }, []);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [createTaskProjectId, setCreateTaskProjectId] = useState<string | undefined>();
  const [manageSelectedId, setManageSelectedId] = useState<string | null>(null);
  const [manageDetailWidth, setManageDetailWidth] = useState(450);
  const manageDragging = useRef(false);
  const [showChanges, setShowChanges] = useState(false);

  const setViewContext = useViewContextStore((s) => s.setView);
  useEffect(() => {
    setViewContext(view, VIEW_LABELS[view]);
  }, [view, setViewContext]);

  const { data: projects = [], refetch: refetchProjects } = useProjects();
  const { data: allProjects = [], refetch: refetchAllProjects } = useProjects("all");
  const { data: allTasks = [], refetch: refetchTasks } = useAllTasks();
  const { data: initiatives = [] } = useInitiatives();
  const { data: initiativeLinks = [] } = useInitiativeProjects();
  useUsers();

  // Open a task or project when navigated from a notification or chat entity card
  const navTarget = useNotificationNavStore((s) => s.target);
  const clearNavTarget = useNotificationNavStore((s) => s.clearTarget);
  const [manageSelectedInitiativeId, setManageSelectedInitiativeId] = useState<string | null>(null);
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
  }, [navTarget, clearNavTarget, setView, setSelectedProjectId]);

  const selectedProject = selectedProjectId
    ? (allProjects.find(p => p.id === selectedProjectId) || projects.find(p => p.id === selectedProjectId))
    : undefined;

  // Sync to global selection store so Cmd+J chat modal knows the focus.
  // Three possible selection sources in this module:
  //   1. Full-screen project view → selectedProjectId
  //   2. Manage view side-panel project → manageSelectedId
  //   3. Manage view side-panel initiative → manageSelectedInitiativeId
  // Deal-vs-project distinction resolved by the fetcher at render time.
  const setGlobalSelected = useSelectedEntityStore((s) => s.setSelected);
  useEffect(() => {
    const projectId =
      (view === "project" && selectedProjectId) || manageSelectedId || null;
    if (projectId) {
      setGlobalSelected({ type: "project", id: projectId });
    } else if (manageSelectedInitiativeId) {
      setGlobalSelected({ type: "initiative", id: manageSelectedInitiativeId });
    } else {
      setGlobalSelected(null);
    }
    return () => setGlobalSelected(null);
  }, [view, selectedProjectId, manageSelectedId, manageSelectedInitiativeId, setGlobalSelected]);

  // If the persisted project no longer exists once projects load, fall back to Manage
  useEffect(() => {
    if (view === "project" && selectedProjectId && allProjects.length > 0 && !selectedProject) {
      setSelectedProjectId(null);
      setView("manage");
    }
  }, [view, selectedProjectId, selectedProject, allProjects.length, setSelectedProjectId, setView]);

  const handleBackFromProject = useCallback(() => {
    setView("manage");
    setSelectedProjectId(null);
  }, [setView, setSelectedProjectId]);

  const handleCloseTaskDetail = useCallback(() => setSelectedTaskId(null), []);
  const handleTaskUpdated = useCallback(() => refetchTasks(), [refetchTasks]);
  const handleTaskDeleted = useCallback(() => {
    setSelectedTaskId(null);
    refetchTasks();
  }, [refetchTasks]);

  const handleTaskSaved = useCallback(() => {
    setShowTaskForm(false);
    setCreateTaskProjectId(undefined);
    refetchTasks();
    refetchProjects();
  }, [refetchTasks, refetchProjects]);

  const showProjectView = view === "project" && selectedProject;
  const taskListClass = selectedTaskId ? "flex-1 border-r border-zinc-100 dark:border-zinc-800" : "flex-1";

  const lastActivity = useMemo(() => {
    let max = 0;
    for (const p of allProjects) {
      const ts = p.updated_at ? new Date(p.updated_at).getTime() : 0;
      if (ts > max) max = ts;
    }
    return max > 0 ? `Last activity ${timeAgoVerbose(new Date(max).toISOString())}` : undefined;
  }, [allProjects]);

  const projectStats = useMemo(() => {
    const total = allProjects.length;
    const active = allProjects.filter((p) => p.status === "active").length;
    const planned = allProjects.filter((p) => p.status === "planned").length;
    const paused = allProjects.filter((p) => p.status === "paused").length;
    const atRisk = allProjects.filter((p) => (p as any).health === "at_risk" || (p as any).health === "off_track").length;
    return { total, active, planned, paused, atRisk };
  }, [allProjects]);

  const projectNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of allProjects) map[p.id] = p.name;
    return map;
  }, [allProjects]);

  const initiativeMap = useMemo(() => {
    const initiativeById = new Map<string, string>();
    for (const i of initiatives) initiativeById.set(i.id, i.name);
    const projectToInitiative = new Map<string, string>();
    for (const link of initiativeLinks) {
      const name = initiativeById.get(link.initiative_id);
      if (!name) continue;
      const existing = projectToInitiative.get(link.project_id);
      projectToInitiative.set(link.project_id, existing ? `${existing}, ${name}` : name);
    }
    return projectToInitiative;
  }, [initiatives, initiativeLinks]);

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        description={lastActivity}
        actions={<NotionSyncStatus />}
      />

      {view !== "project" && (
        <StatsStrip stats={[
          { value: projectStats.total, label: <>total<br/>projects</>, color: "blue" },
          { value: projectStats.active, label: <>active</>, color: "emerald" },
          { value: projectStats.planned, label: <>planned</>, color: "zinc" },
          { value: projectStats.paused, label: <>paused</>, color: projectStats.paused > 0 ? "amber" : "zinc" },
          { value: projectStats.atRisk, label: <>at risk /<br/>off track</>, color: projectStats.atRisk > 0 ? "red" : "zinc" },
        ]} />
      )}

      <div className="flex-1 flex overflow-hidden relative">
        {view === "manage" && (
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 overflow-hidden">
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
                  const map = new Map<string, { name: string; stage: string | null; referred_by: string | null }>();
                  for (const p of allProjects) {
                    if (p.company_id && (p as any).company?.name) {
                      map.set(p.company_id, {
                        name: (p as any).company.name,
                        stage: (p as any).company.stage,
                        referred_by: (p as any).company.referred_by ?? null,
                      });
                    }
                  }
                  return map;
                })()}
                initiativeMap={initiativeMap}
                onSelectProject={(id) => { setManageSelectedInitiativeId(null); setManageSelectedId(id); }}
                onSelectInitiative={(name) => {
                  const init = initiatives.find((i) => i.name === name);
                  if (!init) return;
                  setManageSelectedId(null);
                  setManageSelectedInitiativeId(init.id);
                }}
                onToggleChanges={() => setShowChanges((v) => !v)}
                showChanges={showChanges}
              />
            </div>
            <RecentChangesPanel
              open={showChanges}
              onClose={() => setShowChanges(false)}
              table="project_changes"
              queryKey={["project_changes_recent"]}
              fieldLabels={{ name: "Name", description: "Description", status: "Status", health: "Health", priority: "Priority", lead_id: "Lead", target_date: "Target Date", deal_stage: "Deal Stage", deal_value: "Deal Value", deal_expected_close: "Expected Close", company_id: "Company", archived_at: "Archived" }}
              titleFor={(c) => projectNames[c.project_id] || c.project_id?.slice(0, 8)}
            />
            {manageSelectedId && (
              <>
                <div
                  className="w-1 flex-shrink-0 cursor-col-resize hover:bg-teal-500/30 active:bg-teal-500/50 transition-colors"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    manageDragging.current = true;
                    const startX = e.clientX;
                    const startW = manageDetailWidth;
                    const move = (ev: MouseEvent) => {
                      if (manageDragging.current) setManageDetailWidth(Math.min(900, Math.max(300, startW - (ev.clientX - startX))));
                    };
                    const up = () => {
                      manageDragging.current = false;
                      document.removeEventListener("mousemove", move);
                      document.removeEventListener("mouseup", up);
                    };
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
                    onExpandProject={(id) => {
                      setManageSelectedId(null);
                      setSelectedProjectId(id);
                      setView("project");
                    }}
                  />
                </div>
              </>
            )}
            {manageSelectedInitiativeId && !manageSelectedId && (
              <>
                <div
                  className="w-1 flex-shrink-0 cursor-col-resize hover:bg-teal-500/30 active:bg-teal-500/50 transition-colors"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    manageDragging.current = true;
                    const startX = e.clientX;
                    const startW = manageDetailWidth;
                    const move = (ev: MouseEvent) => {
                      if (manageDragging.current) setManageDetailWidth(Math.min(900, Math.max(300, startW - (ev.clientX - startX))));
                    };
                    const up = () => {
                      manageDragging.current = false;
                      document.removeEventListener("mousemove", move);
                      document.removeEventListener("mouseup", up);
                    };
                    document.addEventListener("mousemove", move);
                    document.addEventListener("mouseup", up);
                  }}
                />
                <div className="flex-shrink-0 overflow-hidden border-l border-zinc-200 dark:border-zinc-800" style={{ width: manageDetailWidth }}>
                  <InitiativeDetailPanel
                    key={manageSelectedInitiativeId}
                    initiativeId={manageSelectedInitiativeId}
                    onClose={() => setManageSelectedInitiativeId(null)}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {showProjectView && (
          <div className={`flex flex-col overflow-hidden ${taskListClass}`}>
            <WorkspaceDetailView
              key={selectedProject.id}
              workspaceId={selectedProject.id}
              onBack={handleBackFromProject}
              onUpdated={() => { refetchAllProjects(); refetchTasks(); }}
              onCreateTask={() => {
                setCreateTaskProjectId(selectedProject.id);
                setShowTaskForm(true);
              }}
            />
          </div>
        )}

        {selectedTaskId && (
          <ResizablePanel>
            <TaskDetailPanel key={selectedTaskId} taskId={selectedTaskId} onClose={handleCloseTaskDetail} onUpdated={handleTaskUpdated} onDeleted={handleTaskDeleted} />
          </ResizablePanel>
        )}
      </div>

      {showTaskForm && createTaskProjectId && (
        <TaskForm projectId={createTaskProjectId} onClose={() => { setShowTaskForm(false); setCreateTaskProjectId(undefined); }} onSaved={handleTaskSaved} />
      )}
    </div>
  );
}
