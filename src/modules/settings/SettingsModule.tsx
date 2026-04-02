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
  Cloud,
  SlidersHorizontal,
  ListChecks,
  Mail,
  Linkedin,
  Activity,
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
import { NotionSyncConfigs } from "../notion/NotionSyncConfigs";
import { ProjectFieldsView } from "./ProjectFieldsView";
import { TaskFieldsView } from "./TaskFieldsView";
import { OutlookConnectionView } from "./OutlookConnectionView";
import { LinkedInConnectionView } from "./LinkedInConnectionView";
import { GA4ConnectionView } from "./GA4ConnectionView";
import { BackgroundSyncView } from "./BackgroundSyncView";

type SettingsViewId = "keys" | "val" | "outlook" | "linkedin" | "ga4" | "sync" | "folders" | "mcp" | "claude" | "bots" | "portal" | "team" | "notion" | "diagnostics" | "project-fields" | "task-fields" | "bg-sync";

interface SidebarItem {
  id: SettingsViewId;
  label: string;
  icon: LucideIcon;
}

interface SidebarGroup {
  label: string;
  items: SidebarItem[];
}

const baseSidebarGroups: SidebarGroup[] = [
  {
    label: "Connections",
    items: [
      { id: "keys", label: "API Keys", icon: Key },
      { id: "val", label: "VAL Credentials", icon: Database },
      { id: "mcp", label: "MCP Endpoints", icon: Globe },
      { id: "outlook", label: "Outlook", icon: Mail },
      { id: "linkedin", label: "LinkedIn", icon: Linkedin },
      { id: "ga4", label: "Google Analytics", icon: Activity },
    ],
  },
  {
    label: "Data",
    items: [
      { id: "sync", label: "Sync Paths", icon: RefreshCw },
      { id: "folders", label: "Folder Paths", icon: FolderOpen },
      { id: "notion", label: "Notion Sync", icon: Cloud },
      { id: "bg-sync", label: "Background Sync", icon: RefreshCw },
    ],
  },
  {
    label: "Platform",
    items: [
      { id: "claude", label: "Claude Code", icon: Cpu },
      { id: "bots", label: "Bots", icon: Bot },
      { id: "project-fields", label: "Project Fields", icon: SlidersHorizontal },
      { id: "task-fields", label: "Task Fields", icon: ListChecks },
      { id: "portal", label: "Portal", icon: Megaphone },
    ],
  },
  {
    label: "Admin",
    items: [
      { id: "team", label: "Team", icon: Users },
      { id: "diagnostics", label: "Diagnostics", icon: Stethoscope },
    ],
  },
];

export function SettingsModal() {
  const settingsOpen = useAppStore((s) => s.settingsOpen);
  const settingsView = useAppStore((s) => s.settingsView);
  const setSettingsView = useAppStore((s) => s.setSettingsView);
  const closeSettings = useAppStore((s) => s.closeSettings);
  const user = useAuth((s) => s.user);
  const isAdmin = useTeamConfigStore((s) => s.isAdmin);
  const showTeam = user ? isAdmin(user.login) : false;
  const sidebarGroups = baseSidebarGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.id !== "team" || showTeam),
  })).filter((group) => group.items.length > 0);
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
    const labels: Record<SettingsViewId, string> = { keys: "API Keys", val: "VAL Credentials", outlook: "Outlook", linkedin: "LinkedIn", ga4: "Google Analytics", sync: "Sync Paths", folders: "Folder Paths", mcp: "MCP Endpoints", claude: "Claude Code", bots: "Bots", "project-fields": "Project Fields", "task-fields": "Task Fields", portal: "Portal", notion: "Notion Sync", team: "Team", diagnostics: "Diagnostics", "bg-sync": "Background Sync" };
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
      <div className="relative max-w-6xl w-full mx-4 h-[80vh] bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700 shadow-xl overflow-hidden flex flex-col animate-modal-in">
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
          <aside className="w-48 flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-2 overflow-y-auto">
            <nav className="space-y-3">
              {sidebarGroups.map((group) => (
                <div key={group.label}>
                  <div className="px-3 py-1 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                    {group.label}
                  </div>
                  <div className="space-y-0.5 mt-0.5">
                    {group.items.map((item) => {
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
                          <Icon size={16} className="flex-shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </aside>

          {/* Content */}
          <div className="flex-1 overflow-auto">
            <div className={cn("mx-auto p-6", activeView === "notion" ? "max-w-4xl" : "max-w-2xl")}>
              {activeView === "keys" && <ApiKeysView />}
              {activeView === "val" && <ValCredentialsView />}
              {activeView === "outlook" && <OutlookConnectionView />}
              {activeView === "linkedin" && <LinkedInConnectionView />}
              {activeView === "ga4" && <GA4ConnectionView />}
              {activeView === "sync" && <SyncPathsView />}
              {activeView === "folders" && <FolderPathsView />}
              {activeView === "mcp" && <McpEndpointsView />}
              {activeView === "claude" && <ClaudeCodeSetupView />}
              {activeView === "bots" && <BotsPathView />}
              {activeView === "project-fields" && <ProjectFieldsView />}
              {activeView === "task-fields" && <TaskFieldsView />}
              {activeView === "portal" && <PortalSettingsView />}
              {activeView === "notion" && <NotionSyncConfigs />}
              {activeView === "bg-sync" && <BackgroundSyncView />}
              {activeView === "team" && <TeamView />}
              {activeView === "diagnostics" && <DiagnosticsView onNavigate={(view) => setActiveView(view as SettingsViewId)} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
