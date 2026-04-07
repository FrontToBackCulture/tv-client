// src/shell/Shell.tsx

import { ReactNode, useEffect, useMemo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ActivityBar } from "./ActivityBar";
import { StatusBar } from "./StatusBar";
import { CommandPalette } from "./CommandPalette";
import { SidePanel } from "./SidePanel";
import { ModuleTabBar } from "./ModuleTabBar";
import { ModeTabs } from "./ModeTabs";

import { ModuleId, isSecondaryWindow } from "../stores/appStore";
import { useSidePanelStore } from "../stores/sidePanelStore";
import { useActivityBarStore } from "../stores/activityBarStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useWorkspaceAppearanceStore } from "../stores/workspaceAppearanceStore";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import { TaskDetailPanel } from "../modules/work/TaskDetailPanel";
import { WorkspaceDetailView } from "../modules/workspace/WorkspaceDetailView";
import { HelpHighlight } from "../components/help/HelpHighlight";
import { WhatsNewModal } from "./WhatsNewModal";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { ToastContainer } from "../components/ui/ToastContainer";

const moduleLabels: Record<ModuleId, string> = {
  home: "Home",
  library: "Library",
  projects: "Projects",
  metadata: "Metadata",
  work: "Work",
  inbox: "Inbox",
  calendar: "Calendar",
  chat: "Chat",
  crm: "CRM",
  domains: "Domains",
  analytics: "Analytics",
  product: "Product",
  gallery: "Gallery",
  skills: "Skills",
  portal: "Portal",
  scheduler: "Scheduler",
  repos: "Repos",
  email: "EDM",
  blog: "Blog",
  guides: "Guides",
  s3browser: "S3 Browser",
  prospecting: "Outbound",
  "public-data": "Public Data",
  referrals: "Referrals",
  investment: "Investment",
  "shared-inbox": "Shared Inboxes",
  settings: "Settings",
};

/** Parse `#rrggbb` (or `#rgb`) into an `"r, g, b"` triplet usable in
 *  `rgb(var(--x))`. Returns null for unrecognized input. */
function hexToRgbTriplet(hex: string): string | null {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

function TitleBar() {
  const mode = useActivityBarStore((s) => s.mode);
  const setMode = useActivityBarStore((s) => s.setMode);
  const accent = useWorkspaceAccent();

  return (
    <>
      {/* Workspace accent strip — 3px colored line at the very top. Helps
          distinguish which workspace this window is on at a glance. */}
      <div
        className="h-[3px] w-full flex-shrink-0"
        style={{ backgroundColor: accent }}
      />
      <div
        onMouseDown={() => getCurrentWindow().startDragging()}
        className="h-8 bg-zinc-100 dark:bg-zinc-900 border-b flex items-center select-none"
        style={{
          // Layer a workspace-color tint on top of the base background-color
          // (set by Tailwind). `backgroundImage` is independent of
          // `backgroundColor`, so this composites cleanly in both themes.
          backgroundImage: `linear-gradient(rgba(var(--workspace-accent-rgb), 0.22), rgba(var(--workspace-accent-rgb), 0.22))`,
          borderColor: `rgba(var(--workspace-accent-rgb), 0.35)`,
        }}
      >
        {/* Traffic lights space + sidebar toggle */}
        <div className="flex items-center flex-shrink-0 pl-[78px] pr-1 gap-1.5" onMouseDown={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMode(mode === "hidden" ? "expanded" : "hidden")}
            className="w-6 h-6 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60 transition-colors"
            title={mode === "hidden" ? "Show sidebar" : "Hide sidebar"}
          >
            {mode === "hidden" ? <PanelLeft size={14} /> : <PanelLeftClose size={14} />}
          </button>
        </div>
        {/* Mode switcher — narrows the sidebar + owns its own tab state */}
        <ModeTabs />
        {/* Module tabs (per-mode) */}
        <ModuleTabBar />
        {/* Spacer — draggable */}
        <div className="flex-1" />
      </div>
    </>
  );
}

/** Push the active workspace's accent color into CSS custom properties on
 *  the document root so any component can reference `--workspace-accent` or
 *  `--workspace-accent-rgb`. Lookup order: local override (Settings →
 *  Appearance) → workspace.color from the gateway → VAL teal fallback.
 *  Returns the resolved accent for inline styles. */
function useWorkspaceAccent(): string {
  const activeId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const workspace = useWorkspaceStore((s) =>
    s.workspaces.find((w) => w.id === s.activeWorkspaceId) ?? null,
  );
  const override = useWorkspaceAppearanceStore((s) =>
    activeId ? s.colorOverrides[activeId] : undefined,
  );
  const accent = override || workspace?.color || "#14b8a6";

  useEffect(() => {
    const root = document.documentElement;
    const rgb = hexToRgbTriplet(accent) ?? "20, 184, 166";
    root.style.setProperty("--workspace-accent", accent);
    root.style.setProperty("--workspace-accent-rgb", rgb);
  }, [accent]);

  return accent;
}

function PendingProjectView() {
  const pendingProjectId = useActivityBarStore((s) => s.pendingProjectId);
  const clearPendingProject = useActivityBarStore((s) => s.clearPendingProject);

  if (!pendingProjectId) return null;

  return (
    <div className="absolute inset-0 z-40 bg-zinc-50 dark:bg-zinc-950 overflow-hidden flex flex-col">
      <WorkspaceDetailView
        workspaceId={pendingProjectId}
        onBack={clearPendingProject}
        onUpdated={() => {}}
        onCreateTask={() => {}}
      />
    </div>
  );
}

function PendingTaskView() {
  const pendingTaskId = useActivityBarStore((s) => s.pendingTaskId);
  const clearPendingTask = useActivityBarStore((s) => s.clearPendingTask);

  if (!pendingTaskId) return null;

  return (
    <div className="absolute inset-0 z-40 bg-zinc-50 dark:bg-zinc-950 overflow-hidden flex flex-col">
      <TaskDetailPanel
        taskId={pendingTaskId}
        onClose={clearPendingTask}
      />
    </div>
  );
}

interface ShellProps {
  activeModule: ModuleId;
  onModuleChange: (module: ModuleId) => void;
  children: ReactNode;
}

export function Shell({ activeModule, onModuleChange, children }: ShellProps) {
  const sidePanelOpen = useSidePanelStore((s) => s.isOpen);
  const sidePanelVisible = sidePanelOpen && activeModule !== "library";
  const secondary = useMemo(() => isSecondaryWindow(), []);


  // Update OS-level window title when module changes (secondary windows)
  useEffect(() => {
    if (secondary) {
      getCurrentWindow().setTitle(`TV Desktop — ${moduleLabels[activeModule]}`);
    }
  }, [activeModule, secondary]);

  return (
    <div className="h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950 bg-noise text-zinc-900 dark:text-zinc-100">
      {/* Draggable title bar region for macOS with module tabs */}
      <TitleBar />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Activity bar (narrow icon strip) */}
        <ActivityBar
          activeModule={activeModule}
          onModuleChange={onModuleChange}
        />

        {/* Module content */}
        <div className="flex-1 overflow-hidden min-w-0 relative" data-module-content>
          <PendingProjectView />
          <PendingTaskView />
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>

        {/* Side document panel (hidden in Library which has its own viewer) */}
        {sidePanelVisible && <SidePanel />}
      </div>

      {/* Status bar */}
      <StatusBar />

      {/* Overlays */}
      <ToastContainer />
      <CommandPalette />
      <WhatsNewModal />
      <HelpHighlight />
    </div>
  );
}
