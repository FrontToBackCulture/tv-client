// src/modules/console/ConsoleSidebar.tsx

import { cn } from "../../lib/cn";
import {
  TerminalSquare,
  Plus,
  X,
  FolderOpen,
  Home,
  GitBranch,
  Database,
} from "lucide-react";
import { useValDomains } from "../../hooks/useValSync";

export interface ConsoleTab {
  id: string;
  type: "terminal" | "sql";
  name: string;
  cwd?: string;
  domain?: string;
}

// Legacy export for backwards compatibility
export type TerminalTab = ConsoleTab;

interface ConsoleSidebarProps {
  tabs: ConsoleTab[];
  activeTabId: string | null;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  onNewTerminal: (cwd?: string) => void;
  onNewSqlConsole: (domain?: string) => void;
}

export function ConsoleSidebar({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onNewTerminal,
  onNewSqlConsole,
}: ConsoleSidebarProps) {
  const knowledgePath = import.meta.env.VITE_LOCAL_REPO_PATH || "";
  const { data: domains } = useValDomains();

  const quickPaths = [
    { name: "Home", path: "", icon: Home },
    { name: "Knowledge", path: knowledgePath, icon: FolderOpen },
    { name: "tv-desktop", path: `${knowledgePath}/../tv-desktop`, icon: GitBranch },
  ];

  const terminalTabs = tabs.filter((t) => t.type === "terminal");
  const sqlTabs = tabs.filter((t) => t.type === "sql");

  return (
    <div className="w-56 border-r border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-slate-200 dark:border-zinc-800">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">Console</h2>
      </div>

      {/* Tabs List */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* Terminal Tabs */}
        <div className="mb-4">
          <div className="flex items-center justify-between px-3 py-1">
            <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              Terminals
            </h3>
            <button
              onClick={() => onNewTerminal()}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 text-zinc-500"
              title="New terminal"
            >
              <Plus size={12} />
            </button>
          </div>
          {terminalTabs.length === 0 ? (
            <p className="px-3 py-2 text-xs text-zinc-500">No terminals open</p>
          ) : (
            terminalTabs.map((tab) => (
              <div
                key={tab.id}
                onClick={() => onTabSelect(tab.id)}
                className={cn(
                  "group flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors",
                  activeTabId === tab.id
                    ? "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
                    : "text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800"
                )}
              >
                <TerminalSquare size={14} />
                <span className="flex-1 truncate">{tab.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTabClose(tab.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-slate-200 dark:hover:bg-zinc-700"
                >
                  <X size={12} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* SQL Console Tabs */}
        <div className="mb-4">
          <div className="flex items-center justify-between px-3 py-1">
            <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              SQL Console
            </h3>
            <button
              onClick={() => onNewSqlConsole()}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 text-zinc-500"
              title="New SQL console"
            >
              <Plus size={12} />
            </button>
          </div>
          {sqlTabs.length === 0 ? (
            <p className="px-3 py-2 text-xs text-zinc-500">No SQL consoles open</p>
          ) : (
            sqlTabs.map((tab) => (
              <div
                key={tab.id}
                onClick={() => onTabSelect(tab.id)}
                className={cn(
                  "group flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors",
                  activeTabId === tab.id
                    ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400"
                    : "text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800"
                )}
              >
                <Database size={14} />
                <span className="flex-1 truncate">{tab.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTabClose(tab.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-slate-200 dark:hover:bg-zinc-700"
                >
                  <X size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="p-2 border-t border-slate-200 dark:border-zinc-800">
        {/* Quick Terminal Paths */}
        <h3 className="px-3 py-1 text-xs font-medium text-zinc-500 uppercase tracking-wider">
          Quick Terminal
        </h3>
        {quickPaths.map((item) => (
          <button
            key={item.name}
            onClick={() => onNewTerminal(item.path || undefined)}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <item.icon size={14} className="text-zinc-400" />
            <span>{item.name}</span>
          </button>
        ))}

        {/* Quick SQL Domains */}
        {domains && domains.length > 0 && (
          <>
            <h3 className="px-3 py-1 mt-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
              Quick SQL
            </h3>
            {domains.slice(0, 5).map((d) => (
              <button
                key={d.domain}
                onClick={() => onNewSqlConsole(d.domain)}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <Database size={14} className="text-indigo-400" />
                <span>{d.domain}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
