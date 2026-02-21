// src/modules/settings/SettingsModule.tsx

import { useState, useEffect } from "react";
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
} from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { useViewContextStore } from "../../stores/viewContextStore";
import { cn } from "../../lib/cn";

import { ApiKeysView } from "./ApiKeysView";
import { BotsPathView } from "./BotsPathView";
import { ValCredentialsView } from "./ValCredentialsView";
import { SyncPathsView } from "./SyncPathsView";
import { McpEndpointsView } from "./McpEndpointsView";
import { ClaudeCodeSetupView } from "./ClaudeCodeSetupView";
import { PortalSettingsView } from "./PortalSettingsView";

type SettingsViewId = "keys" | "val" | "sync" | "mcp" | "claude" | "bots" | "portal";

interface SidebarItem {
  id: SettingsViewId;
  label: string;
  icon: LucideIcon;
}

const sidebarItems: SidebarItem[] = [
  { id: "keys", label: "API Keys", icon: Key },
  { id: "val", label: "VAL Credentials", icon: Database },
  { id: "sync", label: "Sync Paths", icon: RefreshCw },
  { id: "mcp", label: "MCP Endpoints", icon: Globe },
  { id: "claude", label: "Claude Code", icon: Cpu },
  { id: "bots", label: "Bots", icon: Bot },
  { id: "portal", label: "Portal", icon: Megaphone },
];

export function SettingsModule() {
  const { settingsView, setSettingsView } = useAppStore();
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

  // Report view context for help bot
  const setViewContext = useViewContextStore((s) => s.setView);
  useEffect(() => {
    const labels: Record<SettingsViewId, string> = { keys: "API Keys", val: "VAL Credentials", sync: "Sync Paths", mcp: "MCP Endpoints", claude: "Claude Code", bots: "Bots", portal: "Portal" };
    setViewContext(activeView, labels[activeView]);
  }, [activeView, setViewContext]);

  return (
    <div className="h-full flex bg-zinc-50 dark:bg-zinc-950">
      {/* Sidebar */}
      <aside className="w-48 flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3">
        <div className="flex items-center gap-2 px-2 py-3 mb-2">
          <Settings size={18} className="text-zinc-500" />
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            Settings
          </span>
        </div>

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
                  "w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors",
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
        <div className="max-w-3xl mx-auto p-6">
          {activeView === "keys" && <ApiKeysView />}
          {activeView === "val" && <ValCredentialsView />}
          {activeView === "sync" && <SyncPathsView />}
          {activeView === "mcp" && <McpEndpointsView />}
          {activeView === "claude" && <ClaudeCodeSetupView />}
          {activeView === "bots" && <BotsPathView />}
          {activeView === "portal" && <PortalSettingsView />}
        </div>
      </div>
    </div>
  );
}
