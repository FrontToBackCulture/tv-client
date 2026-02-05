// src/modules/system/ToolExplorer.tsx
// MCP tool listing with grouping and search

import { useState, useMemo } from "react";
import { Search, ChevronRight, ChevronDown, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { useMcpToolsGrouped, McpTool, ToolGroup } from "./hooks/useMcpTools";
import { cn } from "../../lib/cn";

interface ToolExplorerProps {
  selectedTool: McpTool | null;
  onSelectTool: (tool: McpTool) => void;
}

export function ToolExplorer({ selectedTool, onSelectTool }: ToolExplorerProps) {
  const { data: groups, isLoading, error, refetch } = useMcpToolsGrouped();
  const [search, setSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["Work", "CRM"]));

  // Filter tools by search
  const filteredGroups = useMemo(() => {
    if (!groups) return [];
    if (!search.trim()) return groups;

    const searchLower = search.toLowerCase();
    return groups
      .map((group) => ({
        ...group,
        tools: group.tools.filter(
          (tool) =>
            tool.name.toLowerCase().includes(searchLower) ||
            tool.description.toLowerCase().includes(searchLower)
        ),
      }))
      .filter((group) => group.tools.length > 0);
  }, [groups, search]);

  const toggleGroup = (name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  // Total tool count
  const totalTools = groups?.reduce((sum, g) => sum + g.tools.length, 0) || 0;

  return (
    <div className="h-full flex flex-col">
      {/* Search */}
      <div className="px-3 py-2 border-b border-slate-200 dark:border-zinc-800">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tools..."
            className="w-full pl-9 pr-8 py-1.5 text-sm border border-slate-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
          <button
            onClick={() => refetch()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-400 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={12} />
          </button>
        </div>
        {!isLoading && !error && (
          <p className="text-[10px] text-zinc-400 mt-1.5">
            {totalTools} tools
          </p>
        )}
      </div>

      {/* Tool list */}
      <div className="flex-1 overflow-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={24} className="animate-spin text-zinc-400" />
          </div>
        )}

        {error && (
          <div className="p-4">
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-red-700 dark:text-red-400 font-medium">
                  Failed to load tools
                </p>
                <p className="text-xs text-red-600 dark:text-red-500 mt-1">
                  {error instanceof Error ? error.message : "Unknown error"}
                </p>
                <p className="text-xs text-zinc-500 mt-2">
                  Make sure the MCP server is running on port 23816.
                </p>
              </div>
            </div>
          </div>
        )}

        {filteredGroups && filteredGroups.length === 0 && search && (
          <div className="p-4 text-center">
            <p className="text-sm text-zinc-500">No tools match "{search}"</p>
          </div>
        )}

        {filteredGroups?.map((group) => (
          <ToolGroupItem
            key={group.name}
            group={group}
            isExpanded={expandedGroups.has(group.name) || search.length > 0}
            onToggle={() => toggleGroup(group.name)}
            selectedTool={selectedTool}
            onSelectTool={onSelectTool}
          />
        ))}
      </div>
    </div>
  );
}

// Collapsible group
function ToolGroupItem({
  group,
  isExpanded,
  onToggle,
  selectedTool,
  onSelectTool,
}: {
  group: ToolGroup;
  isExpanded: boolean;
  onToggle: () => void;
  selectedTool: McpTool | null;
  onSelectTool: (tool: McpTool) => void;
}) {
  return (
    <div className="border-b border-slate-200 dark:border-zinc-800 last:border-b-0">
      {/* Group header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-2 hover:bg-slate-50 dark:hover:bg-zinc-900/50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown size={14} className="text-zinc-400" />
        ) : (
          <ChevronRight size={14} className="text-zinc-400" />
        )}
        <span className="flex-1 text-left text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {group.name}
        </span>
        <span className="text-xs text-zinc-400 bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
          {group.tools.length}
        </span>
      </button>

      {/* Tools list */}
      {isExpanded && (
        <div className="pb-1">
          {group.tools.map((tool) => (
            <button
              key={tool.name}
              onClick={() => onSelectTool(tool)}
              className={cn(
                "w-full text-left px-4 py-1.5 pl-9 transition-colors",
                selectedTool?.name === tool.name
                  ? "bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-900/50"
              )}
            >
              <span className="text-sm font-mono truncate block">{tool.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
