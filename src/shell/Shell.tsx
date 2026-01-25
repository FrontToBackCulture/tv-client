// src/shell/Shell.tsx

import { ReactNode } from "react";
import { ActivityBar } from "./ActivityBar";
import { StatusBar } from "./StatusBar";
import { CommandPalette } from "./CommandPalette";
import { ModuleId } from "../stores/appStore";

interface ShellProps {
  activeModule: ModuleId;
  onModuleChange: (module: ModuleId) => void;
  children: ReactNode;
}

export function Shell({ activeModule, onModuleChange, children }: ShellProps) {
  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 select-none">
      {/* Draggable title bar region for macOS */}
      <div
        data-tauri-drag-region
        className="h-8 bg-slate-100 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 flex items-center"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* Leave space for macOS traffic lights (close/minimize/fullscreen) */}
        <div className="w-20 flex-shrink-0" />
        {/* Title - centered, non-draggable text doesn't block drag */}
        <div className="flex-1 flex justify-center">
          <span
            className="text-xs text-zinc-500 pointer-events-none"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            TV Desktop
          </span>
        </div>
        <div className="w-20 flex-shrink-0" />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Activity bar (narrow icon strip) */}
        <ActivityBar
          activeModule={activeModule}
          onModuleChange={onModuleChange}
        />

        {/* Module content */}
        <div className="flex-1 overflow-hidden">{children}</div>
      </div>

      {/* Status bar */}
      <StatusBar />

      {/* Overlays */}
      <CommandPalette />
    </div>
  );
}
