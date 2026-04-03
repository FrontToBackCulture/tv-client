// Empty state when no automation is selected

import { Zap } from "lucide-react";

export function EmptyCanvasState() {
  return (
    <div className="flex-1 flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="text-center">
        <Zap size={32} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-3" />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Select an automation to view its workflow</p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Or create a new one from the sidebar</p>
      </div>
    </div>
  );
}
