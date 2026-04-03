// ---------------------------------------------------------------------------
// WorkspacePicker — full-screen workspace selection (post-login, pre-app)
// ---------------------------------------------------------------------------

import { getCurrentWindow } from "@tauri-apps/api/window";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import type { Workspace } from "../stores/workspaceStore";

interface Props {
  workspaces: Workspace[];
  onSelect: (workspaceId: string) => Promise<void>;
}

export function WorkspacePicker({ workspaces, onSelect }: Props) {
  const [selecting, setSelecting] = useState<string | null>(null);

  const handleSelect = async (ws: Workspace) => {
    setSelecting(ws.id);
    await onSelect(ws.id);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-zinc-50 via-zinc-100 to-zinc-200 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-800">
      {/* Draggable title bar */}
      <div
        data-tauri-drag-region
        className="h-10 flex-shrink-0 flex items-center"
        onMouseDown={() => getCurrentWindow().startDragging()}
      >
        <div className="w-20 flex-shrink-0" />
        <div className="flex-1 flex justify-center pointer-events-none">
          <span className="text-xs text-zinc-500">TV Desktop</span>
        </div>
        <div className="w-20 flex-shrink-0" />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white">
              Choose a workspace
            </h1>
            <p className="mt-2 text-zinc-500 dark:text-zinc-400 text-sm">
              Each workspace has its own data and settings
            </p>
          </div>

          <div className="space-y-3">
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => handleSelect(ws)}
                disabled={selecting !== null}
                className="w-full flex items-center gap-4 p-4 rounded-lg border border-zinc-200/50 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 transition-all text-left disabled:opacity-60"
              >
                {/* Icon */}
                <div
                  className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                  style={{ backgroundColor: ws.color + "15" }}
                >
                  {ws.iconEmoji}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-zinc-900 dark:text-white">
                    {ws.displayName}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {ws.role === "owner" ? "Owner" : ws.role === "admin" ? "Admin" : "Member"}
                  </div>
                </div>

                {/* Loading indicator */}
                {selecting === ws.id && (
                  <Loader2 size={18} className="text-teal-600 animate-spin flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
