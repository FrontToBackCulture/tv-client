// src/shell/Shell.tsx

import { ReactNode, useEffect, useMemo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ActivityBar } from "./ActivityBar";
import { StatusBar } from "./StatusBar";
import { CommandPalette } from "./CommandPalette";
import { SidePanel } from "./SidePanel";

import { ModuleId, isSecondaryWindow } from "../stores/appStore";
import { useSidePanelStore } from "../stores/sidePanelStore";

const moduleLabels: Record<ModuleId, string> = {
  library: "Library",
  work: "Work",
  inbox: "Inbox",
  crm: "CRM",
  product: "Product",
  bot: "Bots",
  system: "System",
  settings: "Settings",
};

interface ShellProps {
  activeModule: ModuleId;
  onModuleChange: (module: ModuleId) => void;
  children: ReactNode;
}

export function Shell({ activeModule, onModuleChange, children }: ShellProps) {
  const sidePanelOpen = useSidePanelStore((s) => s.isOpen);
  const sidePanelVisible = sidePanelOpen && activeModule !== "library";
  const secondary = useMemo(() => isSecondaryWindow(), []);

  const titleText = secondary
    ? `TV Desktop — ${moduleLabels[activeModule]}`
    : "TV Desktop";

  // Update OS-level window title when module changes (secondary windows)
  useEffect(() => {
    if (secondary) {
      getCurrentWindow().setTitle(`TV Desktop — ${moduleLabels[activeModule]}`);
    }
  }, [activeModule, secondary]);

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 select-none">
      {/* Draggable title bar region for macOS */}
      <div
        onMouseDown={() => getCurrentWindow().startDragging()}
        className="h-10 bg-slate-100 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 flex items-center"
      >
        {/* Leave space for macOS traffic lights (close/minimize/fullscreen) */}
        <div className="w-20 flex-shrink-0" />
        {/* Title - centered */}
        <div className="flex-1 flex justify-center pointer-events-none">
          <span className="text-xs text-zinc-500">{titleText}</span>
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
        <div className="flex-1 overflow-hidden min-w-0 relative">
          {children}
        </div>

        {/* Side document panel (hidden in Library which has its own viewer) */}
        {sidePanelVisible && <SidePanel />}
      </div>

      {/* Status bar */}
      <StatusBar />

      {/* Overlays */}
      <CommandPalette />
    </div>
  );
}
