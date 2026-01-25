// src/modules/console/ConsoleSidebar.tsx

import { cn } from "../../lib/cn";
import {
  TerminalSquare,
  Plus,
  X,
  FolderOpen,
  Home,
  GitBranch,
} from "lucide-react";

export interface TerminalTab {
  id: string;
  name: string;
  cwd: string;
}

interface ConsoleSidebarProps {
  tabs: TerminalTab[];
  activeTabId: string | null;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  onNewTab: (cwd?: string) => void;
}

export function ConsoleSidebar({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onNewTab,
}: ConsoleSidebarProps) {
  const knowledgePath = import.meta.env.VITE_LOCAL_REPO_PATH || "";

  const quickPaths = [
    { name: "Home", path: "", icon: Home },
    { name: "Knowledge", path: knowledgePath, icon: FolderOpen },
    { name: "tv-desktop", path: `${knowledgePath}/../tv-desktop`, icon: GitBranch },
  ];

  return (
    <div className="w-56 border-r border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-slate-200 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">Console</h2>
          <button
            onClick={() => onNewTab()}
            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 text-zinc-500"
            title="New terminal"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Terminal Tabs */}
      <div className="flex-1 overflow-y-auto p-2">
        <h3 className="px-3 py-1 text-xs font-medium text-zinc-500 uppercase tracking-wider">
          Terminals
        </h3>
        {tabs.length === 0 ? (
          <p className="px-3 py-2 text-sm text-zinc-500">No terminals open</p>
        ) : (
          tabs.map((tab) => (
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

      {/* Quick Open */}
      <div className="p-2 border-t border-slate-200 dark:border-zinc-800">
        <h3 className="px-3 py-1 text-xs font-medium text-zinc-500 uppercase tracking-wider">
          Quick Open
        </h3>
        {quickPaths.map((item) => (
          <button
            key={item.name}
            onClick={() => onNewTab(item.path || undefined)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <item.icon size={14} className="text-zinc-400" />
            <span>{item.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
