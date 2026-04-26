// src/modules/settings/SettingsModule.tsx

import { useState, useEffect } from "react";
import {
  RefreshCw,
  Bot,
  Database,
  LucideIcon,
  Megaphone,
  Stethoscope,
  Users,
  FolderOpen,
  SlidersHorizontal,
  ListChecks,
  Plug,
  Palette,
  Inbox,
} from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { useViewContextStore } from "../../stores/viewContextStore";
import { useAuth } from "../../stores/authStore";
import { useTeamConfigStore } from "../../stores/teamConfigStore";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/PageHeader";

import { BotsPathView } from "./BotsPathView";
import { ValCredentialsView } from "./ValCredentialsView";
import { SyncPathsView } from "./SyncPathsView";
import { PortalSettingsView } from "./PortalSettingsView";
import { DiagnosticsView } from "./DiagnosticsView";
import { TeamView } from "./TeamView";
import { FolderPathsView } from "./FolderPathsView";
import { ProjectFieldsView } from "./ProjectFieldsView";
import { TaskFieldsView } from "./TaskFieldsView";
import { BackgroundSyncView } from "./BackgroundSyncView";
import { AppearanceView } from "./AppearanceView";
import { IntegrationsView, INTEGRATION_IDS, type ConnectorId } from "./IntegrationsView";
import { SharedInboxSettingsView } from "./SharedInboxSettingsView";

type SettingsViewId =
  | "integrations"
  | "val"
  | "sync"
  | "folders"
  | "bg-sync"
  | "bots"
  | "project-fields"
  | "task-fields"
  | "portal"
  | "appearance"
  | "shared-inboxes"
  | "team"
  | "diagnostics";

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
      { id: "integrations", label: "Integrations", icon: Plug },
      { id: "val", label: "VAL Credentials", icon: Database },
    ],
  },
  {
    label: "Data",
    items: [
      { id: "sync", label: "Sync Paths", icon: RefreshCw },
      { id: "folders", label: "Folder Paths", icon: FolderOpen },
      { id: "bg-sync", label: "Background Sync", icon: RefreshCw },
    ],
  },
  {
    label: "Platform",
    items: [
      { id: "bots", label: "Bots", icon: Bot },
      { id: "project-fields", label: "Project Fields", icon: SlidersHorizontal },
      { id: "task-fields", label: "Task Fields", icon: ListChecks },
      { id: "portal", label: "Portal", icon: Megaphone },
    ],
  },
  {
    label: "Personal",
    items: [
      { id: "appearance", label: "Appearance", icon: Palette },
    ],
  },
  {
    label: "Admin",
    items: [
      { id: "shared-inboxes", label: "Shared Inboxes", icon: Inbox },
      { id: "team", label: "Team", icon: Users },
      { id: "diagnostics", label: "Diagnostics", icon: Stethoscope },
    ],
  },
];

export function SettingsModule() {
  const settingsView = useAppStore((s) => s.settingsView);
  const setSettingsView = useAppStore((s) => s.setSettingsView);
  const user = useAuth((s) => s.user);
  const isAdmin = useTeamConfigStore((s) => s.isAdmin);
  const showTeam = user ? isAdmin(user.login) : false;
  const sidebarGroups = baseSidebarGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => (item.id !== "team" && item.id !== "shared-inboxes") || showTeam),
  })).filter((group) => group.items.length > 0);

  const [activeView, setActiveView] = useState<SettingsViewId>("integrations");
  // Sub-selection within the Integrations hub — used by deep-links from
  // Inbox/Calendar/SetupWizard/StatusBar to jump straight to a specific
  // connector's detail panel.
  const [initialConnectorId, setInitialConnectorId] = useState<ConnectorId | null>(null);

  // Consume deep-link hint from appStore.
  // Legacy per-connector ids (outlook, ga4, notion, mcp, claude, etc.) and
  // the old "keys" id both route into the Integrations hub.
  useEffect(() => {
    if (!settingsView) return;
    if (settingsView === "keys") {
      setActiveView("integrations");
      setInitialConnectorId(null);
    } else if (INTEGRATION_IDS.has(settingsView)) {
      setActiveView("integrations");
      setInitialConnectorId(settingsView as ConnectorId);
    } else {
      setActiveView(settingsView as SettingsViewId);
      setInitialConnectorId(null);
    }
    setSettingsView(null);
  }, [settingsView, setSettingsView]);

  // Report view context for help bot
  const setViewContext = useViewContextStore((s) => s.setView);
  useEffect(() => {
    const labels: Record<SettingsViewId, string> = {
      integrations: "Integrations",
      val: "VAL Credentials",
      sync: "Sync Paths",
      folders: "Folder Paths",
      "bg-sync": "Background Sync",
      bots: "Bots",
      "project-fields": "Project Fields",
      "task-fields": "Task Fields",
      portal: "Portal",
      appearance: "Appearance",
      "shared-inboxes": "Shared Inboxes",
      team: "Team",
      diagnostics: "Diagnostics",
    };
    setViewContext(activeView, labels[activeView]);
  }, [activeView, setViewContext]);

  return (
    <div className="h-full flex flex-col">
      <PageHeader description="API keys, credentials, sync paths, and platform configuration." />

      {/* Body: sidebar + content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-2 overflow-y-auto">
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
                        onClick={() => {
                          setActiveView(item.id);
                          if (item.id !== "integrations") setInitialConnectorId(null);
                        }}
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
          <div className={cn("mx-auto p-6", activeView === "integrations" ? "max-w-4xl" : "max-w-3xl")}>
            {activeView === "integrations" && (
              <IntegrationsView
                initialConnectorId={initialConnectorId}
                onBackToList={() => setInitialConnectorId(null)}
              />
            )}
            {activeView === "val" && <ValCredentialsView />}
            {activeView === "sync" && <SyncPathsView />}
            {activeView === "folders" && <FolderPathsView />}
            {activeView === "bg-sync" && <BackgroundSyncView />}
            {activeView === "bots" && <BotsPathView />}
            {activeView === "project-fields" && <ProjectFieldsView />}
            {activeView === "task-fields" && <TaskFieldsView />}
            {activeView === "portal" && <PortalSettingsView />}
            {activeView === "appearance" && <AppearanceView />}
            {activeView === "shared-inboxes" && <SharedInboxSettingsView />}
            {activeView === "team" && <TeamView />}
            {activeView === "diagnostics" && (
              <DiagnosticsView
                onNavigate={(view) => {
                  if (view === "keys") {
                    setActiveView("integrations");
                    setInitialConnectorId(null);
                  } else if (INTEGRATION_IDS.has(view)) {
                    setActiveView("integrations");
                    setInitialConnectorId(view as ConnectorId);
                  } else {
                    setActiveView(view as SettingsViewId);
                    setInitialConnectorId(null);
                  }
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
