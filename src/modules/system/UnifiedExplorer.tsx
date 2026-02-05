// src/modules/system/UnifiedExplorer.tsx
// Unified capability explorer showing MCP, Tauri, and API availability

import { useState, useMemo } from "react";
import { Search, ChevronRight, ChevronDown, Loader2, RefreshCw, AlertCircle, Wrench, Terminal, Globe, ArrowLeft, Copy, Check, Play, Key } from "lucide-react";
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
      {capability.api && (
        <span className="px-1 py-0.5 text-[9px] font-medium rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" title={`API: ${capability.api.endpoint.method} ${capability.api.endpoint.path}`}>
          API
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
  const [systemFilter, setSystemFilter] = useState<"all" | "mcp" | "tauri" | "api">("all");

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
          if (systemFilter === "api" && !cap.api) return false;

          // Filter by search
          if (!search.trim()) return true;
          return (
            cap.name.toLowerCase().includes(searchLower) ||
            cap.description.toLowerCase().includes(searchLower) ||
            cap.mcp?.toolName.toLowerCase().includes(searchLower) ||
            cap.tauri?.commandName.toLowerCase().includes(searchLower) ||
            cap.api?.endpoint.path.toLowerCase().includes(searchLower)
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
      <div className="px-3 py-2 border-b border-slate-200 dark:border-zinc-800 space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search capabilities..."
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
          <FilterButton active={systemFilter === "api"} onClick={() => setSystemFilter("api")} color="blue">
            <Globe size={10} /> API ({counts.api})
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
            <p className="text-sm text-zinc-500">No capabilities match "{search}"</p>
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
  color?: "teal" | "purple" | "blue";
}) {
  const colorClasses = {
    teal: active ? "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 border-teal-300 dark:border-teal-700" : "",
    purple: active ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-300 dark:border-purple-700" : "",
    blue: active ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-700" : "",
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded border transition-colors",
        active && !color && "bg-slate-200 dark:bg-zinc-700 border-slate-300 dark:border-zinc-600",
        color && colorClasses[color],
        !active && "border-slate-200 dark:border-zinc-700 text-zinc-500 hover:bg-slate-100 dark:hover:bg-zinc-800"
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
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-900/50"
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
  const [activeTab, setActiveTab] = useState<"mcp" | "tauri" | "api">(
    capability.mcp ? "mcp" : capability.tauri ? "tauri" : "api"
  );
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
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors"
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

      {/* System tabs */}
      <div className="flex border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/50">
        {capability.mcp && (
          <TabButton active={activeTab === "mcp"} onClick={() => setActiveTab("mcp")} color="teal">
            <Wrench size={14} /> MCP Tool
          </TabButton>
        )}
        {capability.tauri && (
          <TabButton active={activeTab === "tauri"} onClick={() => setActiveTab("tauri")} color="purple">
            <Terminal size={14} /> Tauri Command
          </TabButton>
        )}
        {capability.api && (
          <TabButton active={activeTab === "api"} onClick={() => setActiveTab("api")} color="blue">
            <Globe size={14} /> REST API
          </TabButton>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Description */}
        {capability.description && (
          <section>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2 uppercase tracking-wide">Description</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{capability.description}</p>
          </section>
        )}

        {/* MCP Tool Details */}
        {activeTab === "mcp" && capability.mcp && (
          <McpToolSection tool={capability.mcp.tool} onCopy={handleCopy} copied={copied} />
        )}

        {/* Tauri Command Details */}
        {activeTab === "tauri" && capability.tauri && (
          <TauriCommandSection command={capability.tauri} onCopy={handleCopy} copied={copied} />
        )}

        {/* API Endpoint Details */}
        {activeTab === "api" && capability.api && (
          <ApiEndpointSection endpoint={capability.api.endpoint} onCopy={handleCopy} copied={copied} />
        )}
      </div>
    </div>
  );
}

// Tab button
function TabButton({
  active,
  onClick,
  children,
  color,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  color: "teal" | "purple" | "blue";
}) {
  const colorClasses = {
    teal: active ? "border-teal-500 text-teal-700 dark:text-teal-400" : "",
    purple: active ? "border-purple-500 text-purple-700 dark:text-purple-400" : "",
    blue: active ? "border-blue-500 text-blue-700 dark:text-blue-400" : "",
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors",
        active ? colorClasses[color] : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      )}
    >
      {children}
    </button>
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

  return (
    <>
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wide">Tool Name</h3>
        </div>
        <code className="block px-3 py-2 bg-slate-100 dark:bg-zinc-800 rounded-lg text-sm font-mono text-teal-600 dark:text-teal-400">
          {tool.name}
        </code>
      </section>

      {/* Parameters */}
      {tool.inputSchema.properties && Object.keys(tool.inputSchema.properties).length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2 uppercase tracking-wide">Parameters</h3>
          <div className="border border-slate-200 dark:border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-zinc-900 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400">Name</th>
                  <th className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400">Type</th>
                  <th className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400">Required</th>
                  <th className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                {Object.entries(tool.inputSchema.properties).map(([name, schema]) => (
                  <tr key={name} className="bg-white dark:bg-zinc-950">
                    <td className="px-3 py-2 font-mono text-teal-600 dark:text-teal-400">{name}</td>
                    <td className="px-3 py-2">
                      <span className="px-1.5 py-0.5 text-xs rounded bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                        {schema.type}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {tool.inputSchema.required?.includes(name) ? (
                        <span className="text-red-500 font-medium">Yes</span>
                      ) : (
                        <span className="text-zinc-400">No</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{schema.description || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Try it */}
      <section className="border border-slate-200 dark:border-zinc-800 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-zinc-900">
          <div className="flex items-center gap-2">
            <Play size={16} className="text-teal-500" />
            <span className="font-medium text-zinc-900 dark:text-zinc-100">Try It</span>
          </div>
        </div>
        <div className="p-4 bg-white dark:bg-zinc-950 space-y-4">
          {tool.inputSchema.properties && Object.entries(tool.inputSchema.properties).map(([name, schema]) => (
            <div key={name}>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                {name}
                {tool.inputSchema.required?.includes(name) && <span className="text-red-500 ml-1">*</span>}
              </label>
              <input
                type={schema.type === "number" || schema.type === "integer" ? "number" : "text"}
                value={(args[name] as string) || ""}
                onChange={(e) => setArgs((prev) => ({ ...prev, [name]: schema.type === "number" || schema.type === "integer" ? Number(e.target.value) : e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                placeholder={schema.description}
              />
            </div>
          ))}
          <button
            onClick={handleExecute}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-50 transition-colors"
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {isLoading ? "Calling..." : "Call Tool"}
          </button>

          {response && (
            <div className="mt-4">
              <ResponseViewer response={response.content} isError={response.isError} />
            </div>
          )}
        </div>
      </section>

      {/* Code snippet */}
      <section>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-zinc-500 uppercase">JSON-RPC</span>
          <button
            onClick={() => onCopy(snippet)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="p-3 bg-slate-900 dark:bg-zinc-900 rounded-lg text-sm font-mono text-slate-300 overflow-x-auto">
          {snippet}
        </pre>
      </section>
    </>
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
    <>
      <section>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2 uppercase tracking-wide">Command Name</h3>
        <code className="block px-3 py-2 bg-slate-100 dark:bg-zinc-800 rounded-lg text-sm font-mono text-purple-600 dark:text-purple-400">
          {command.commandName}
        </code>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2 uppercase tracking-wide">Module</h3>
        <span className="px-2 py-1 text-sm rounded bg-slate-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
          {command.module}
        </span>
      </section>

      <section>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-zinc-500 uppercase">TypeScript</span>
          <button
            onClick={() => onCopy(snippet)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="p-3 bg-slate-900 dark:bg-zinc-900 rounded-lg text-sm font-mono text-slate-300 overflow-x-auto">
          {snippet}
        </pre>
      </section>

      <section className="p-4 bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800 rounded-lg">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <strong className="text-zinc-700 dark:text-zinc-300">Note:</strong> Tauri commands are internal to tv-client.
          They are called from the React frontend via <code className="px-1 bg-slate-200 dark:bg-zinc-700 rounded">invoke()</code>.
          See the Rust source in <code className="px-1 bg-slate-200 dark:bg-zinc-700 rounded">src-tauri/src/commands/</code> for parameter types.
        </p>
      </section>
    </>
  );
}

// API Endpoint section
function ApiEndpointSection({
  endpoint,
  onCopy,
  copied,
}: {
  endpoint: { method: string; path: string; description: string; requiresAuth: boolean; parameters?: { name: string; type: string; required: boolean; description: string }[] };
  onCopy: (text: string) => void;
  copied: boolean;
}) {
  const curlSnippet = `curl -X ${endpoint.method} "http://localhost:3000${endpoint.path}"${endpoint.requiresAuth ? ' \\\n  -H "Authorization: Bearer <API_KEY>"' : ""}`;

  return (
    <>
      <section>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2 uppercase tracking-wide">Endpoint</h3>
        <div className="flex items-center gap-2">
          <MethodBadge method={endpoint.method} />
          <code className="px-3 py-2 bg-slate-100 dark:bg-zinc-800 rounded-lg text-sm font-mono text-blue-600 dark:text-blue-400">
            {endpoint.path}
          </code>
        </div>
        {endpoint.requiresAuth && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-600 dark:text-amber-400">
            <Key size={12} />
            Requires authentication
          </div>
        )}
      </section>

      {endpoint.parameters && endpoint.parameters.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2 uppercase tracking-wide">Parameters</h3>
          <div className="border border-slate-200 dark:border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-zinc-900 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400">Name</th>
                  <th className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400">Type</th>
                  <th className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400">Required</th>
                  <th className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                {endpoint.parameters.map((param) => (
                  <tr key={param.name} className="bg-white dark:bg-zinc-950">
                    <td className="px-3 py-2 font-mono text-blue-600 dark:text-blue-400">{param.name}</td>
                    <td className="px-3 py-2">
                      <span className="px-1.5 py-0.5 text-xs rounded bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                        {param.type}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {param.required ? (
                        <span className="text-red-500 font-medium">Yes</span>
                      ) : (
                        <span className="text-zinc-400">No</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{param.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-zinc-500 uppercase">curl</span>
          <button
            onClick={() => onCopy(curlSnippet)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="p-3 bg-slate-900 dark:bg-zinc-900 rounded-lg text-sm font-mono text-slate-300 overflow-x-auto">
          {curlSnippet}
        </pre>
      </section>

      <section className="p-4 bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800 rounded-lg">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <strong className="text-zinc-700 dark:text-zinc-300">Note:</strong> REST APIs are served by tv-api on port 3000.
          Make sure tv-api is running separately to use these endpoints.
        </p>
      </section>
    </>
  );
}

// Method badge
function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
    POST: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
    PUT: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
    DELETE: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
  };

  return (
    <span className={cn("px-1.5 py-0.5 text-xs font-medium rounded", colors[method] || "bg-slate-100 dark:bg-zinc-800 text-zinc-600")}>
      {method}
    </span>
  );
}
