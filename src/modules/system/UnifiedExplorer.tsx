// src/modules/system/UnifiedExplorer.tsx
// Documentation explorer for MCP tools and Tauri commands

import { useState, useMemo } from "react";
import { Search, ChevronRight, ChevronDown, Loader2, RefreshCw, AlertCircle, Wrench, Terminal, ArrowLeft, Copy, Check, Play } from "lucide-react";
import { useUnifiedCapabilities, UnifiedCapability, CapabilityGroup } from "./hooks/useUnifiedCapabilities";
import { callMcpTool, PropertySchema } from "./hooks/useMcpTools";
import { ResponseViewer } from "./components/ResponseViewer";
import { cn } from "../../lib/cn";

// System availability badges
function SystemBadges({ capability }: { capability: UnifiedCapability }) {
  return (
    <div className="flex gap-1">
      {capability.mcp && (
        <span className="px-1 py-0.5 text-[9px] font-medium rounded bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400" title={`MCP: ${capability.mcp.toolName}`}>
          MCP
        </span>
      )}
      {capability.tauri && (
        <span className="px-1 py-0.5 text-[9px] font-medium rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400" title={`Tauri: ${capability.tauri.commandName}`}>
          Tauri
        </span>
      )}
    </div>
  );
}

interface UnifiedExplorerProps {
  selectedCapability: UnifiedCapability | null;
  onSelectCapability: (capability: UnifiedCapability | null) => void;
}

export function UnifiedExplorer({ selectedCapability, onSelectCapability }: UnifiedExplorerProps) {
  const { data: groups, counts, isLoading, error, refetch } = useUnifiedCapabilities();
  const [search, setSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["Work", "CRM", "Documents"]));
  const [systemFilter, setSystemFilter] = useState<"all" | "mcp" | "tauri">("all");

  // Filter capabilities by search and system
  const filteredGroups = useMemo(() => {
    if (!groups) return [];

    const searchLower = search.toLowerCase();

    return groups
      .map((group) => ({
        ...group,
        capabilities: group.capabilities.filter((cap) => {
          // Filter by system
          if (systemFilter === "mcp" && !cap.mcp) return false;
          if (systemFilter === "tauri" && !cap.tauri) return false;

          // Filter by search
          if (!search.trim()) return true;
          return (
            cap.name.toLowerCase().includes(searchLower) ||
            cap.description.toLowerCase().includes(searchLower) ||
            cap.mcp?.toolName.toLowerCase().includes(searchLower) ||
            cap.tauri?.commandName.toLowerCase().includes(searchLower)
          );
        }),
      }))
      .filter((group) => group.capabilities.length > 0);
  }, [groups, search, systemFilter]);

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

  return (
    <div className="h-full flex flex-col">
      {/* Search and filters */}
      <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search capabilities..."
            className="w-full pl-9 pr-8 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-teal-500"
          />
          <button
            onClick={() => refetch()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={12} />
          </button>
        </div>

        {/* System filter */}
        <div className="flex gap-1">
          <FilterButton active={systemFilter === "all"} onClick={() => setSystemFilter("all")}>
            All ({counts.total})
          </FilterButton>
          <FilterButton active={systemFilter === "mcp"} onClick={() => setSystemFilter("mcp")} color="teal">
            <Wrench size={10} /> MCP ({counts.mcp})
          </FilterButton>
          <FilterButton active={systemFilter === "tauri"} onClick={() => setSystemFilter("tauri")} color="purple">
            <Terminal size={10} /> Tauri ({counts.tauri})
          </FilterButton>
        </div>
      </div>

      {/* Capability list */}
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
                <p className="text-sm text-red-700 dark:text-red-400 font-medium">Failed to load capabilities</p>
                <p className="text-xs text-red-600 dark:text-red-500 mt-1">
                  {error instanceof Error ? error.message : "Unknown error"}
                </p>
              </div>
            </div>
          </div>
        )}

        {filteredGroups.length === 0 && search && !isLoading && (
          <div className="p-4 text-center">
            <p className="text-sm text-zinc-500">No capabilities match &ldquo;{search}&rdquo;</p>
          </div>
        )}

        {filteredGroups.map((group) => (
          <CapabilityGroupItem
            key={group.name}
            group={group}
            isExpanded={expandedGroups.has(group.name) || search.length > 0}
            onToggle={() => toggleGroup(group.name)}
            selectedCapability={selectedCapability}
            onSelectCapability={onSelectCapability}
          />
        ))}
      </div>
    </div>
  );
}

// Filter button component
function FilterButton({
  active,
  onClick,
  children,
  color,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  color?: "teal" | "purple";
}) {
  const colorClasses = {
    teal: active ? "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 border-teal-300 dark:border-teal-700" : "",
    purple: active ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-300 dark:border-purple-700" : "",
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded border transition-colors",
        active && !color && "bg-zinc-200 dark:bg-zinc-700 border-zinc-300 dark:border-zinc-600",
        color && colorClasses[color],
        !active && "border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      )}
    >
      {children}
    </button>
  );
}

// Collapsible group
function CapabilityGroupItem({
  group,
  isExpanded,
  onToggle,
  selectedCapability,
  onSelectCapability,
}: {
  group: CapabilityGroup;
  isExpanded: boolean;
  onToggle: () => void;
  selectedCapability: UnifiedCapability | null;
  onSelectCapability: (capability: UnifiedCapability | null) => void;
}) {
  return (
    <div className="border-b border-zinc-200 dark:border-zinc-800 last:border-b-0">
      {/* Group header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown size={14} className="text-zinc-400" />
        ) : (
          <ChevronRight size={14} className="text-zinc-400" />
        )}
        <span className="flex-1 text-left text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {group.name}
        </span>
        <span className="text-xs text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
          {group.capabilities.length}
        </span>
      </button>

      {/* Capabilities list */}
      {isExpanded && (
        <div className="pb-1">
          {group.capabilities.map((cap) => (
            <button
              key={cap.id}
              onClick={() => onSelectCapability(cap)}
              className={cn(
                "w-full text-left px-4 py-1.5 pl-9 transition-colors",
                selectedCapability?.id === cap.id
                  ? "bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm truncate">{cap.name}</span>
                <SystemBadges capability={cap} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Capability detail view
export function UnifiedCapabilityDetail({
  capability,
  onBack,
}: {
  capability: UnifiedCapability;
  onBack: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors"
          title="Back to list"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 truncate">{capability.name}</h2>
          <p className="text-xs text-zinc-500">{capability.category}</p>
        </div>
        <SystemBadges capability={capability} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Description */}
        {capability.description && (
          <section>
            <h3 className="text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wide">Description</h3>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{capability.description}</p>
          </section>
        )}

        {/* MCP Tool Details */}
        {capability.mcp && (
          <McpToolSection tool={capability.mcp.tool} onCopy={handleCopy} copied={copied} />
        )}

        {/* Tauri Command Details */}
        {capability.tauri && (
          <TauriCommandSection command={capability.tauri} onCopy={handleCopy} copied={copied} />
        )}
      </div>
    </div>
  );
}

// MCP Tool section
function McpToolSection({
  tool,
  onCopy,
  copied,
}: {
  tool: { name: string; description: string; inputSchema: { properties?: Record<string, PropertySchema>; required?: string[] } };
  onCopy: (text: string) => void;
  copied: boolean;
}) {
  const [args, setArgs] = useState<Record<string, unknown>>({});
  const [response, setResponse] = useState<{ content: unknown; isError?: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleExecute = async () => {
    setIsLoading(true);
    setResponse(null);
    try {
      const result = await callMcpTool(tool.name, args);
      setResponse(result);
    } catch (error) {
      setResponse({ content: { error: error instanceof Error ? error.message : "Unknown error" }, isError: true });
    } finally {
      setIsLoading(false);
    }
  };

  const snippet = `// MCP Tool Call
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "${tool.name}",
    "arguments": ${JSON.stringify(args, null, 4).replace(/^/gm, "    ").trim()}
  },
  "id": 1
}`;

  const hasParams = tool.inputSchema.properties && Object.keys(tool.inputSchema.properties).length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-zinc-200 dark:border-zinc-800">
        <Wrench size={14} className="text-teal-500" />
        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">MCP Tool</span>
      </div>

      <div>
        <span className="text-[10px] font-medium text-zinc-400 uppercase">Tool Name</span>
        <code className="block mt-1 px-3 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-sm font-mono text-teal-600 dark:text-teal-400">
          {tool.name}
        </code>
      </div>

      {/* Parameters */}
      {hasParams && (
        <div>
          <span className="text-[10px] font-medium text-zinc-400 uppercase">Parameters</span>
          <div className="mt-1 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-left">
                <tr>
                  <th className="px-3 py-1.5 text-[10px] font-medium text-zinc-500 uppercase">Name</th>
                  <th className="px-3 py-1.5 text-[10px] font-medium text-zinc-500 uppercase">Type</th>
                  <th className="px-3 py-1.5 text-[10px] font-medium text-zinc-500 uppercase">Req</th>
                  <th className="px-3 py-1.5 text-[10px] font-medium text-zinc-500 uppercase">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {Object.entries(tool.inputSchema.properties!).map(([name, schema]) => (
                  <tr key={name} className="bg-white dark:bg-zinc-950">
                    <td className="px-3 py-1.5 font-mono text-xs text-teal-600 dark:text-teal-400">{name}</td>
                    <td className="px-3 py-1.5">
                      <span className="px-1.5 py-0.5 text-[10px] rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                        {schema.type}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      {tool.inputSchema.required?.includes(name) ? (
                        <span className="text-red-500">Yes</span>
                      ) : (
                        <span className="text-zinc-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-zinc-500 max-w-xs truncate">{schema.description || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Try it */}
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50 dark:bg-zinc-900">
          <Play size={14} className="text-teal-500" />
          <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Try It</span>
        </div>
        <div className="p-3 bg-white dark:bg-zinc-950 space-y-3">
          {hasParams && Object.entries(tool.inputSchema.properties!).map(([name, schema]) => (
            <div key={name}>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                {name}
                {tool.inputSchema.required?.includes(name) && <span className="text-red-500 ml-0.5">*</span>}
              </label>
              <input
                type={schema.type === "number" || schema.type === "integer" ? "number" : "text"}
                value={(args[name] as string) || ""}
                onChange={(e) => setArgs((prev) => ({ ...prev, [name]: schema.type === "number" || schema.type === "integer" ? Number(e.target.value) : e.target.value }))}
                className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                placeholder={schema.description}
              />
            </div>
          ))}
          <button
            onClick={handleExecute}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-50 transition-colors"
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {isLoading ? "Calling..." : "Call Tool"}
          </button>

          {response && (
            <div className="mt-3">
              <ResponseViewer response={response.content} isError={response.isError} />
            </div>
          )}
        </div>
      </div>

      {/* Code snippet */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-medium text-zinc-400 uppercase">JSON-RPC</span>
          <button
            onClick={() => onCopy(snippet)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="p-3 bg-zinc-900 dark:bg-zinc-900 rounded-lg text-xs font-mono text-zinc-300 overflow-x-auto">
          {snippet}
        </pre>
      </div>
    </div>
  );
}

// Tauri Command section
function TauriCommandSection({
  command,
  onCopy,
  copied,
}: {
  command: { commandName: string; module: string };
  onCopy: (text: string) => void;
  copied: boolean;
}) {
  const snippet = `import { invoke } from "@tauri-apps/api/core";

const result = await invoke("${command.commandName}", {
  // parameters here
});`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-zinc-200 dark:border-zinc-800">
        <Terminal size={14} className="text-purple-500" />
        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Tauri Command</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <span className="text-[10px] font-medium text-zinc-400 uppercase">Command</span>
          <code className="block mt-1 px-3 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-sm font-mono text-purple-600 dark:text-purple-400">
            {command.commandName}
          </code>
        </div>
        <div>
          <span className="text-[10px] font-medium text-zinc-400 uppercase">Module</span>
          <div className="mt-1 px-3 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-sm text-zinc-700 dark:text-zinc-300">
            {command.module}
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-medium text-zinc-400 uppercase">TypeScript</span>
          <button
            onClick={() => onCopy(snippet)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="p-3 bg-zinc-900 dark:bg-zinc-900 rounded-lg text-xs font-mono text-zinc-300 overflow-x-auto">
          {snippet}
        </pre>
      </div>
    </div>
  );
}
