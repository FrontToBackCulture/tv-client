// src/modules/workspace/WorkspaceListView.tsx
// List of all workspaces as cards

import { FolderOpen, Clock, MessageSquare, Paperclip } from "lucide-react";
import { cn } from "../../lib/cn";
import type { WorkspaceWithCounts } from "../../hooks/workspace/useWorkspaces";
import { WORKSPACE_STATUS_COLORS } from "../../lib/workspace/types";

interface Props {
  workspaces: WorkspaceWithCounts[];
  onSelect: (id: string) => void;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-SG", { month: "short", day: "numeric" });
}

function StatusDot({ status }: { status: string }) {
  const color = WORKSPACE_STATUS_COLORS[status] || "#6B7280";
  return (
    <span
      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
      style={{ backgroundColor: color }}
      title={status.replace("_", " ")}
    />
  );
}

export function WorkspaceListView({ workspaces, onSelect }: Props) {
  if (workspaces.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-400 dark:text-zinc-600">
        <div className="text-center">
          <FolderOpen size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">No workspaces yet</p>
          <p className="text-xs mt-1">Start a collaboration session in Claude Code to create one</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {workspaces.map((ws) => (
          <button
            key={ws.id}
            onClick={() => onSelect(ws.id)}
            className={cn(
              "text-left p-4 rounded-lg border border-zinc-200 dark:border-zinc-800",
              "hover:border-teal-300 dark:hover:border-teal-700 hover:bg-zinc-50 dark:hover:bg-zinc-900/50",
              "transition-colors group"
            )}
          >
            {/* Title + status */}
            <div className="flex items-center gap-2 mb-1">
              <StatusDot status={ws.status} />
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate flex-1">
                {ws.title}
              </span>
            </div>

            {/* Description */}
            {ws.description && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 mb-2">
                {ws.description}
              </p>
            )}

            {/* Meta row */}
            <div className="flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-500">
              <span className="flex items-center gap-1">
                <Clock size={11} />
                {formatDate(ws.updated_at)}
              </span>
              <span>{ws.owner}</span>
              <span className="ml-auto flex items-center gap-2">
                {ws.session_count > 0 && (
                  <span className="flex items-center gap-0.5" title={`${ws.session_count} session${ws.session_count !== 1 ? "s" : ""}`}>
                    <MessageSquare size={10} />
                    {ws.session_count}
                  </span>
                )}
                {ws.artifact_count > 0 && (
                  <span className="flex items-center gap-0.5" title={`${ws.artifact_count} artifact${ws.artifact_count !== 1 ? "s" : ""}`}>
                    <Paperclip size={10} />
                    {ws.artifact_count}
                  </span>
                )}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
