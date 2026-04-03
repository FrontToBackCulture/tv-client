// ---------------------------------------------------------------------------
// WorkspaceSwitcher — compact dropdown in the StatusBar for switching workspaces
// ---------------------------------------------------------------------------

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { cn } from "../lib/cn";

export function WorkspaceSwitcher() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const selectWorkspace = useWorkspaceStore((s) => s.selectWorkspace);

  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const active = workspaces.find((w) => w.id === activeWorkspaceId);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  // Don't render if there's only one workspace
  if (workspaces.length <= 1) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
      >
        {active && (
          <span className="text-xs">{active.iconEmoji}</span>
        )}
        <span className="text-xs text-zinc-600 dark:text-zinc-400 max-w-[100px] truncate">
          {active?.displayName ?? "No workspace"}
        </span>
        <ChevronDown size={10} className="text-zinc-400" />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-56 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg overflow-hidden animate-modal-in z-50">
          <div className="px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800">
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
              Workspaces
            </span>
          </div>
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={async () => {
                if (ws.id === activeWorkspaceId) {
                  setOpen(false);
                  return;
                }
                setSwitching(true);
                setOpen(false);
                await selectWorkspace(ws.id);
                // If we get here (no reload), reset state
                setSwitching(false);
              }}
              disabled={switching}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors",
                ws.id === activeWorkspaceId && "bg-zinc-50 dark:bg-zinc-800/50",
              )}
            >
              <span className="text-base">{ws.iconEmoji}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-zinc-900 dark:text-white truncate">
                  {ws.displayName}
                </div>
              </div>
              {ws.id === activeWorkspaceId && (
                <div className="w-1.5 h-1.5 rounded-full bg-teal-500 flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}

      {switching && (
        <div className="fixed inset-0 z-50 bg-zinc-950/50 flex items-center justify-center">
          <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 shadow-xl text-center">
            <Loader2 size={24} className="mx-auto mb-2 text-teal-600 animate-spin" />
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Switching workspace...</p>
          </div>
        </div>
      )}
    </div>
  );
}
