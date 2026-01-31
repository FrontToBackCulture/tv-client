// src/modules/console/ConsoleModule.tsx

import { useState, useCallback } from "react";
import { Terminal } from "./Terminal";
import { SqlConsole } from "./SqlConsole";
import { ConsoleSidebar, ConsoleTab } from "./ConsoleSidebar";
import { TerminalSquare, Database } from "lucide-react";

export function ConsoleModule() {
  const [tabs, setTabs] = useState<ConsoleTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Create new terminal tab
  const handleNewTerminal = useCallback((cwd?: string) => {
    const id = `term-${Date.now()}`;
    const tabNumber = tabs.filter((t) => t.type === "terminal").length + 1;
    const newTab: ConsoleTab = {
      id,
      type: "terminal",
      name: `Terminal ${tabNumber}`,
      cwd: cwd || "",
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(id);
  }, [tabs]);

  // Create new SQL Console tab
  const handleNewSqlConsole = useCallback((domain?: string) => {
    const id = `sql-${Date.now()}`;
    const tabNumber = tabs.filter((t) => t.type === "sql").length + 1;
    const newTab: ConsoleTab = {
      id,
      type: "sql",
      name: domain ? `SQL: ${domain}` : `SQL Console ${tabNumber}`,
      domain,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(id);
  }, [tabs]);

  // Close tab
  const handleCloseTab = useCallback((id: string) => {
    setTabs((prev) => {
      const newTabs = prev.filter((t) => t.id !== id);
      // Select another tab if we closed the active one
      if (activeTabId === id && newTabs.length > 0) {
        setActiveTabId(newTabs[newTabs.length - 1].id);
      } else if (newTabs.length === 0) {
        setActiveTabId(null);
      }
      return newTabs;
    });
  }, [activeTabId]);

  // Select tab
  const handleSelectTab = useCallback((id: string) => {
    setActiveTabId(id);
  }, []);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="h-full flex bg-white dark:bg-zinc-950">
      {/* Sidebar */}
      <ConsoleSidebar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabSelect={handleSelectTab}
        onTabClose={handleCloseTab}
        onNewTerminal={handleNewTerminal}
        onNewSqlConsole={handleNewSqlConsole}
      />

      {/* Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab Bar */}
        {tabs.length > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleSelectTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  activeTabId === tab.id
                    ? "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
                }`}
              >
                {tab.type === "terminal" ? (
                  <TerminalSquare size={12} />
                ) : (
                  <Database size={12} />
                )}
                <span>{tab.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab ? (
            activeTab.type === "terminal" ? (
              <Terminal
                key={activeTab.id}
                id={activeTab.id}
                cwd={activeTab.cwd || undefined}
                onClose={() => handleCloseTab(activeTab.id)}
                isActive={activeTabId === activeTab.id}
              />
            ) : (
              <SqlConsole
                key={activeTab.id}
                initialDomain={activeTab.domain}
              />
            )
          ) : (
            <div className="h-full flex items-center justify-center bg-slate-50 dark:bg-zinc-950">
              <div className="text-center">
                <div className="flex justify-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center">
                    <TerminalSquare size={32} className="text-zinc-400" />
                  </div>
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center">
                    <Database size={32} className="text-zinc-400" />
                  </div>
                </div>
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                  Console
                </h2>
                <p className="text-zinc-500 mb-6">
                  Open a terminal or SQL console to get started
                </p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => handleNewTerminal()}
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
                  >
                    New Terminal
                  </button>
                  <button
                    onClick={() => handleNewSqlConsole()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                  >
                    SQL Console
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
