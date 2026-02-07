// src/modules/system/SystemModule.tsx
// System module - Documentation explorer for MCP tools and Tauri commands

import { useState } from "react";
import { Book, Wrench, Terminal } from "lucide-react";
import { UnifiedExplorer, UnifiedCapabilityDetail } from "./UnifiedExplorer";
import { UnifiedCapability } from "./hooks/useUnifiedCapabilities";

export function SystemModule() {
  const [selectedCapability, setSelectedCapability] = useState<UnifiedCapability | null>(null);

  return (
    <div className="h-full flex bg-slate-50 dark:bg-zinc-950">
      {/* Sidebar */}
      <aside className="w-72 flex-shrink-0 border-r border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Book size={20} className="text-teal-500" />
            <h1 className="font-semibold text-zinc-900 dark:text-zinc-100">System</h1>
          </div>
          <p className="text-xs text-zinc-500 mt-1">MCP Tools &amp; Tauri Commands</p>
        </div>

        {/* Explorer */}
        <div className="flex-1 overflow-hidden">
          <UnifiedExplorer
            selectedCapability={selectedCapability}
            onSelectCapability={setSelectedCapability}
          />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden bg-white dark:bg-zinc-950">
        {selectedCapability ? (
          <UnifiedCapabilityDetail
            capability={selectedCapability}
            onBack={() => setSelectedCapability(null)}
          />
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  );
}

// Empty state component
function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-sm px-4">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center">
          <Book size={24} className="text-zinc-400" />
        </div>
        <h3 className="text-base font-medium text-zinc-900 dark:text-zinc-100 mb-1">Capability Docs</h3>
        <p className="text-sm text-zinc-500 mb-5">
          Browse documentation for all MCP tools and Tauri commands.
        </p>
        <div className="flex justify-center gap-6 text-xs text-zinc-500">
          <div className="flex items-center gap-1.5">
            <Wrench size={12} className="text-teal-500" />
            MCP Tools
          </div>
          <div className="flex items-center gap-1.5">
            <Terminal size={12} className="text-purple-500" />
            Tauri Commands
          </div>
        </div>
        <p className="text-xs text-zinc-400 mt-5">Select a capability from the sidebar.</p>
      </div>
    </div>
  );
}
