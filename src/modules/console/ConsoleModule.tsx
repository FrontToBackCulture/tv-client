// src/modules/console/ConsoleModule.tsx

import { useState, useCallback } from "react";
import { Terminal } from "./Terminal";
import { ConsoleSidebar, TerminalTab } from "./ConsoleSidebar";
import { TerminalSquare } from "lucide-react";

export function ConsoleModule() {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Create new terminal tab
  const handleNewTab = useCallback((cwd?: string) => {
    const id = `term-${Date.now()}`;
    const tabNumber = tabs.length + 1;
    const newTab: TerminalTab = {
      id,
      name: `Terminal ${tabNumber}`,
      cwd: cwd || "",
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(id);
  }, [tabs.length]);

  // Close terminal tab
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

  // Select terminal tab
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
        onNewTab={handleNewTab}
      />

      {/* Terminal Area */}
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
                <TerminalSquare size={12} />
                <span>{tab.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Terminal Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab ? (
            <Terminal
              key={activeTab.id}
              id={activeTab.id}
              cwd={activeTab.cwd || undefined}
              onClose={() => handleCloseTab(activeTab.id)}
              isActive={activeTabId === activeTab.id}
            />
          ) : (
            <div className="h-full flex items-center justify-center bg-slate-50 dark:bg-zinc-950">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center">
                  <TerminalSquare size={32} className="text-zinc-400" />
                </div>
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                  No Terminal Open
                </h2>
                <p className="text-zinc-500 mb-6">
                  Create a new terminal to get started
                </p>
                <button
                  onClick={() => handleNewTab()}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
                >
                  New Terminal
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
