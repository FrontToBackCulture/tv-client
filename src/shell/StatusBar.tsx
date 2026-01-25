// src/shell/StatusBar.tsx

import { useAppStore } from "../stores/appStore";
import { cn } from "../lib/cn";
import { Sun, Moon } from "lucide-react";

export function StatusBar() {
  const { syncStatus, theme, toggleTheme } = useAppStore();

  return (
    <div className="h-6 bg-slate-100 dark:bg-zinc-900 border-t border-slate-200 dark:border-zinc-800 flex items-center px-3 text-xs text-zinc-500">
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

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 transition-colors"
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? (
            <>
              <Moon size={12} className="text-zinc-400" />
              <span className="text-zinc-400">Dark</span>
            </>
          ) : (
            <>
              <Sun size={12} className="text-amber-500" />
              <span className="text-zinc-600">Light</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
