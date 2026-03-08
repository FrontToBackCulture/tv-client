// src/modules/workspace/WorkspaceModule.tsx
// Workspace module — collaboration workspaces with sessions, artifacts, and context

import { useState, useCallback, useEffect } from "react";
import { FolderOpen } from "lucide-react";
import { useWorkspaces } from "../../hooks/workspace";
import { WorkspaceListView } from "./WorkspaceListView";
import { WorkspaceDetailView } from "./WorkspaceDetailView";
import { useViewContextStore } from "../../stores/viewContextStore";

type StatusFilter = "all" | "open" | "in_progress" | "done" | "paused";

export function WorkspaceModule() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const setViewContext = useViewContextStore((s) => s.setView);
  useEffect(() => {
    setViewContext(selectedId ? "detail" : "list", selectedId ? "Workspace Detail" : "Workspaces");
  }, [selectedId, setViewContext]);

  const filters = statusFilter === "all" ? undefined : { status: statusFilter };
  const { data: workspaces = [], refetch } = useWorkspaces(filters);

  const handleSelect = useCallback((id: string) => setSelectedId(id), []);
  const handleBack = useCallback(() => setSelectedId(null), []);
  const handleUpdated = useCallback(() => { refetch(); }, [refetch]);

  if (selectedId) {
    return (
      <WorkspaceDetailView
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
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="text-xs border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
          >
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
            <option value="paused">Paused</option>
          </select>
        </div>
      </div>

      {/* List */}
      <WorkspaceListView workspaces={workspaces} onSelect={handleSelect} />
    </div>
  );
}
