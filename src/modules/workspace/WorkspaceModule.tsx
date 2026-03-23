// src/modules/workspace/WorkspaceModule.tsx
// Workspace module — collaboration workspaces with sessions, artifacts, and context

import { useState, useCallback, useEffect } from "react";
import { FolderOpen, LayoutGrid, Columns3 } from "lucide-react";
import { usePersistedModuleView } from "../../hooks/usePersistedModuleView";
import { cn } from "../../lib/cn";
import { useWorkspaces, useUpdateWorkspace } from "../../hooks/workspace";
import { WorkspaceListView } from "./WorkspaceListView";
import { WorkspaceBoardView } from "./WorkspaceBoardView";
import { WorkspaceDetailView } from "./WorkspaceDetailView";
import { useViewContextStore } from "../../stores/viewContextStore";

type StatusFilter = "all" | "open" | "active" | "in_progress" | "done" | "paused";
type ViewMode = "grid" | "board";

export function WorkspaceModule() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [viewMode, setViewMode] = usePersistedModuleView<ViewMode>("workspace", "board");

  const setViewContext = useViewContextStore((s) => s.setView);
  useEffect(() => {
    setViewContext(selectedId ? "detail" : "list", selectedId ? "Workspace Detail" : "Workspaces");
  }, [selectedId, setViewContext]);

  // Board view always loads all workspaces (groups by status); grid respects filter
  const filters = viewMode === "board" || statusFilter === "all" ? undefined : { status: statusFilter };
  const { data: workspaces = [], refetch } = useWorkspaces(filters);

  const updateWorkspace = useUpdateWorkspace();

  const handleSelect = useCallback((id: string) => setSelectedId(id), []);
  const handleBack = useCallback(() => setSelectedId(null), []);
  const handleUpdated = useCallback(() => { refetch(); }, [refetch]);
  const handleStatusChange = useCallback(
    (id: string, status: string) => {
      updateWorkspace.mutate({ id, updates: { status } });
    },
    [updateWorkspace]
  );

  if (selectedId) {
    return (
      <WorkspaceDetailView
        key={selectedId}
        workspaceId={selectedId}
        onBack={handleBack}
        onUpdated={handleUpdated}
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/50 px-4 h-11">
        <div className="flex items-center gap-2">
          <FolderOpen size={16} className="text-zinc-400" />
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Workspaces</span>
          <span className="text-xs text-zinc-400 ml-1">{workspaces.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center border border-zinc-200 dark:border-zinc-700 rounded overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-1 transition-colors",
                viewMode === "grid"
                  ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                  : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-400"
              )}
              title="Grid view"
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => setViewMode("board")}
              className={cn(
                "p-1 transition-colors",
                viewMode === "board"
                  ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                  : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-400"
              )}
              title="Board view"
            >
              <Columns3 size={14} />
            </button>
          </div>

          {/* Status filter — only shown in grid mode */}
          {viewMode === "grid" && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="text-xs border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
              <option value="paused">Paused</option>
            </select>
          )}
        </div>
      </div>

      {/* Content */}
      {viewMode === "board" ? (
        <WorkspaceBoardView workspaces={workspaces} onSelect={handleSelect} onStatusChange={handleStatusChange} />
      ) : (
        <WorkspaceListView workspaces={workspaces} onSelect={handleSelect} />
      )}
    </div>
  );
}
