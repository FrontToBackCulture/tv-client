// src/modules/work/WorkModule.tsx
// Tasks module — My Tasks and Team views.

import { useMemo, useState, useCallback, useEffect } from "react";
import { User as UserIcon, Users } from "lucide-react";
import { useAllTasks, useInitiatives, useUsers } from "../../hooks/work";
import { useCurrentUserId } from "../../hooks/work/useUsers";
import { timeAgoVerbose } from "../../lib/date";
import { usePersistedModuleView } from "../../hooks/usePersistedModuleView";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { ResizablePanel } from "../../components/ResizablePanel";
import {
  MyTasksView,
  TeamTasksView,
  useInitiativeProjects,
} from "./WorkViews";
import { ViewTab } from "../../components/ViewTab";
import { PageHeader } from "../../components/PageHeader";
import { useViewContextStore } from "../../stores/viewContextStore";
import { useNotificationNavStore } from "../../stores/notificationNavStore";
import { useSelectedEntityStore } from "../../stores/selectedEntityStore";

type TasksView = "my-tasks" | "team-tasks";

const VIEW_LABELS: Record<TasksView, string> = {
  "my-tasks": "My Tasks",
  "team-tasks": "Team",
};


export function WorkModule() {
  const [view, setView] = usePersistedModuleView<TasksView>("tasks", "my-tasks");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const setViewContext = useViewContextStore((s) => s.setView);
  useEffect(() => {
    setViewContext(view, VIEW_LABELS[view]);
  }, [view, setViewContext]);

  // Sync to global selection store so Cmd+J chat modal knows the focus.
  const setGlobalSelected = useSelectedEntityStore((s) => s.setSelected);
  useEffect(() => {
    setGlobalSelected(selectedTaskId ? { type: "task", id: selectedTaskId } : null);
    return () => setGlobalSelected(null);
  }, [selectedTaskId, setGlobalSelected]);

  const { data: allTasks = [], refetch: refetchTasks } = useAllTasks();
  const { data: initiatives = [] } = useInitiatives();
  const { data: initiativeLinks = [] } = useInitiativeProjects();
  const { data: users = [] } = useUsers();
  const currentUserId = useCurrentUserId();

  // Open a task when navigated from a notification or chat entity card
  const navTarget = useNotificationNavStore((s) => s.target);
  const clearNavTarget = useNotificationNavStore((s) => s.clearTarget);
  useEffect(() => {
    if (!navTarget || navTarget.entityType !== "task") return;
    setSelectedTaskId(navTarget.entityId);
    clearNavTarget();
  }, [navTarget, clearNavTarget]);

  const handleViewChange = useCallback((v: TasksView) => {
    setView(v);
    setSelectedTaskId(null);
  }, [setView]);

  const handleSelectTask = useCallback((id: string) => setSelectedTaskId(id), []);
  const handleCloseTaskDetail = useCallback(() => setSelectedTaskId(null), []);
  const handleTaskUpdated = useCallback(() => refetchTasks(), [refetchTasks]);
  const handleTaskDeleted = useCallback(() => {
    setSelectedTaskId(null);
    refetchTasks();
  }, [refetchTasks]);

  const taskListClass = selectedTaskId ? "flex-1 border-r border-zinc-100 dark:border-zinc-800" : "flex-1";

  const lastActivity = useMemo(() => {
    let max = 0;
    for (const t of allTasks) {
      const ts = t.updated_at ? new Date(t.updated_at).getTime() : 0;
      if (ts > max) max = ts;
    }
    return max > 0 ? `Last activity ${timeAgoVerbose(new Date(max).toISOString())}` : undefined;
  }, [allTasks]);

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        description={lastActivity}
        tabs={<>
          <ViewTab label="My Tasks" icon={UserIcon} active={view === "my-tasks"} onClick={() => handleViewChange("my-tasks")} />
          <ViewTab label="Team" icon={Users} active={view === "team-tasks"} onClick={() => handleViewChange("team-tasks")} />
        </>}
      />

      <div className="flex-1 flex overflow-hidden relative">
        {view === "my-tasks" && (
          <div className={`flex flex-col overflow-hidden ${taskListClass}`}>
            <MyTasksView allTasks={allTasks} users={users} currentUserId={currentUserId} onSelectTask={handleSelectTask} initiatives={initiatives} initiativeLinks={initiativeLinks} />
          </div>
        )}
        {view === "team-tasks" && (
          <div className={`flex flex-col overflow-hidden ${taskListClass}`}>
            <TeamTasksView allTasks={allTasks} users={users} onSelectTask={handleSelectTask} initiatives={initiatives} initiativeLinks={initiativeLinks} />
          </div>
        )}

        {selectedTaskId && (
          <ResizablePanel>
            <TaskDetailPanel key={selectedTaskId} taskId={selectedTaskId} onClose={handleCloseTaskDetail} onUpdated={handleTaskUpdated} onDeleted={handleTaskDeleted} />
          </ResizablePanel>
        )}
      </div>
    </div>
  );
}
