// src/modules/system/SystemModule.tsx
// System module - Unified capability explorer for MCP, Tauri, and API

import { useState } from "react";
import { Book, Layers } from "lucide-react";
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
          <p className="text-xs text-zinc-500 mt-1">Unified Capability Explorer</p>
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
      <div className="text-center max-w-md px-4">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center">
          <Layers size={28} className="text-zinc-400" />
        </div>
        <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 mb-2">Unified Capability Explorer</h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
          Browse all capabilities across MCP Tools, Tauri Commands, and REST APIs in one place.
        </p>
        <div className="flex justify-center gap-4 text-xs text-zinc-500">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-teal-500" />
            MCP Tools
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-purple-500" />
            Tauri Commands
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            REST APIs
          </div>
        </div>
        <p className="text-xs text-zinc-400 mt-4">Select a capability from the sidebar to view documentation.</p>
      </div>
    </div>
  );
}
