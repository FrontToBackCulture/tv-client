// src/shell/StatusBar.tsx

import { useAppStore } from "../stores/appStore";
import { cn } from "../lib/cn";

export function StatusBar() {
  const { syncStatus } = useAppStore();

  return (
    <div className="h-6 bg-zinc-900 border-t border-zinc-800 flex items-center px-3 text-xs text-zinc-500">
      <div className="flex items-center gap-4">
        <span>TV Desktop v0.1.0</span>
        {syncStatus !== "idle" && (
          <span className="flex items-center gap-1">
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                syncStatus === "syncing" && "bg-yellow-500 animate-pulse",
                syncStatus === "synced" && "bg-green-500",
                syncStatus === "error" && "bg-red-500"
              )}
            />
            {syncStatus === "syncing" && "Syncing..."}
            {syncStatus === "synced" && "Synced"}
            {syncStatus === "error" && "Sync error"}
          </span>
        )}
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-4">
        <span>⌘K for commands</span>
      </div>
    </div>
  );
}
