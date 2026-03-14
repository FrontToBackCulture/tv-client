// src/modules/settings/SettingsModule.tsx

import { useState, useEffect, useCallback } from "react";
import {
  Settings,
  Key,
  RefreshCw,
  Bot,
  Database,
  LucideIcon,
  Globe,
  Cpu,
  Megaphone,
  X,
  Stethoscope,
  Users,
  FolderOpen,
} from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { useViewContextStore } from "../../stores/viewContextStore";
import { useAuth } from "../../stores/authStore";
import { useTeamConfigStore } from "../../stores/teamConfigStore";
import { cn } from "../../lib/cn";
import { IconButton } from "../../components/ui";

import { ApiKeysView } from "./ApiKeysView";
import { BotsPathView } from "./BotsPathView";
import { ValCredentialsView } from "./ValCredentialsView";
import { SyncPathsView } from "./SyncPathsView";
import { McpEndpointsView } from "./McpEndpointsView";
import { ClaudeCodeSetupView } from "./ClaudeCodeSetupView";
import { PortalSettingsView } from "./PortalSettingsView";
import { DiagnosticsView } from "./DiagnosticsView";
import { TeamView } from "./TeamView";
import { FolderPathsView } from "./FolderPathsView";

type SettingsViewId = "keys" | "val" | "sync" | "folders" | "mcp" | "claude" | "bots" | "portal" | "team" | "diagnostics";

interface SidebarItem {
  id: SettingsViewId;
  label: string;
  icon: LucideIcon;
}

const baseSidebarItems: SidebarItem[] = [
  { id: "keys", label: "API Keys", icon: Key },
  { id: "val", label: "VAL Credentials", icon: Database },
  { id: "sync", label: "Sync Paths", icon: RefreshCw },
  { id: "folders", label: "Folder Paths", icon: FolderOpen },
  { id: "mcp", label: "MCP Endpoints", icon: Globe },
  { id: "claude", label: "Claude Code", icon: Cpu },
  { id: "bots", label: "Bots", icon: Bot },
  { id: "portal", label: "Portal", icon: Megaphone },
  { id: "team", label: "Team", icon: Users },
  { id: "diagnostics", label: "Diagnostics", icon: Stethoscope },
];

export function SettingsModal() {
  const settingsOpen = useAppStore((s) => s.settingsOpen);
  const settingsView = useAppStore((s) => s.settingsView);
  const setSettingsView = useAppStore((s) => s.setSettingsView);
  const closeSettings = useAppStore((s) => s.closeSettings);
  const user = useAuth((s) => s.user);
  const isAdmin = useTeamConfigStore((s) => s.isAdmin);
  const showTeam = user ? isAdmin(user.login) : false;
  const sidebarItems = baseSidebarItems.filter(
    (item) => item.id !== "team" || showTeam
  );
  const [activeView, setActiveView] = useState<SettingsViewId>(
    (settingsView as SettingsViewId) || "keys"
  );

  // Consume deep-link from appStore (e.g., StatusBar click)
  useEffect(() => {
    if (settingsView) {
      setActiveView(settingsView as SettingsViewId);
      setSettingsView(null); // Clear after consuming
    }
  }, [settingsView, setSettingsView]);

  // Reset to default view when modal opens without a specific view
  useEffect(() => {
    if (settingsOpen && !settingsView) {
      // keep current activeView (don't reset)
    }
  }, [settingsOpen, settingsView]);

  // Escape key to close
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && settingsOpen) {
        e.preventDefault();
        e.stopPropagation();
        closeSettings();
      }
    },
    [settingsOpen, closeSettings]
  );

  useEffect(() => {
    if (settingsOpen) {
      window.addEventListener("keydown", handleKeyDown, true);
      return () => window.removeEventListener("keydown", handleKeyDown, true);
    }
  }, [settingsOpen, handleKeyDown]);

  // Report view context for help bot
  const setViewContext = useViewContextStore((s) => s.setView);
  useEffect(() => {
    if (!settingsOpen) return;
    const labels: Record<SettingsViewId, string> = { keys: "API Keys", val: "VAL Credentials", sync: "Sync Paths", folders: "Folder Paths", mcp: "MCP Endpoints", claude: "Claude Code", bots: "Bots", portal: "Portal", team: "Team", diagnostics: "Diagnostics" };
    setViewContext(activeView, labels[activeView]);
  }, [activeView, setViewContext, settingsOpen]);

  if (!settingsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={closeSettings}
      />

      {/* Modal */}
      <div className="relative max-w-5xl w-full mx-4 h-[75vh] bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700 shadow-xl overflow-hidden flex flex-col animate-modal-in">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Settings size={16} className="text-zinc-500" />
            <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
              Settings
            </span>
          </div>
          <IconButton icon={X} label="Close settings" onClick={closeSettings} />
        </div>

        {/* Body: sidebar + content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <aside className="w-44 flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-2">
            <nav className="space-y-0.5">
              {sidebarItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveView(item.id)}
                    data-help-id={`settings-nav-${item.id}`}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors",
                      isActive
                        ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                        : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
                    )}
                  >
                    <Icon size={16} />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Content */}
          <div className="flex-1 overflow-auto">
            <div className="max-w-2xl mx-auto p-6">
              {activeView === "keys" && <ApiKeysView />}
              {activeView === "val" && <ValCredentialsView />}
              {activeView === "sync" && <SyncPathsView />}
              {activeView === "folders" && <FolderPathsView />}
              {activeView === "mcp" && <McpEndpointsView />}
              {activeView === "claude" && <ClaudeCodeSetupView />}
              {activeView === "bots" && <BotsPathView />}
              {activeView === "portal" && <PortalSettingsView />}
              {activeView === "team" && <TeamView />}
              {activeView === "diagnostics" && <DiagnosticsView onNavigate={(view) => setActiveView(view as SettingsViewId)} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
