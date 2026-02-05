// src/modules/system/TauriCommandExplorer.tsx
// Tauri command documentation (internal invoke() calls)
// Commands are auto-generated from main.rs - run `node scripts/generate-commands.js` to update

import { useState, useMemo } from "react";
import { Search, ChevronRight, ChevronDown, ArrowLeft, Copy, Check } from "lucide-react";
import { cn } from "../../lib/cn";

// Import generated commands
import generatedData from "./generated/tauri-commands.json";

// Tauri command definition
export interface TauriCommand {
  name: string;
  module: string;
}

// Module display names
const MODULE_LABELS: Record<string, string> = {
  auth: "Auth",
  crm: "CRM",
  files: "Files",
  outlook: "Outlook",
  root: "Core",
  search: "Search",
  settings: "Settings",
  terminal: "Terminal",
  tools: "Tools",
  val_sync: "VAL Sync",
  work: "Work",
};

// Group commands by module
interface CommandGroup {
  name: string;
  module: string;
  commands: TauriCommand[];
}

function groupCommands(commands: TauriCommand[]): CommandGroup[] {
  const groupMap = new Map<string, TauriCommand[]>();

  commands.forEach((cmd) => {
    const existing = groupMap.get(cmd.module) || [];
    existing.push(cmd);
    groupMap.set(cmd.module, existing);
  });

  const sortOrder = ["files", "search", "auth", "settings", "terminal", "tools", "work", "crm", "val_sync", "outlook", "root"];

  return sortOrder
    .filter((module) => groupMap.has(module))
    .map((module) => ({
      name: MODULE_LABELS[module] || module,
      module,
      commands: groupMap.get(module)!.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

interface TauriCommandExplorerProps {
  selectedCommand: TauriCommand | null;
  onSelectCommand: (command: TauriCommand | null) => void;
}

export function TauriCommandExplorer({ selectedCommand, onSelectCommand }: TauriCommandExplorerProps) {
  const [search, setSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["work", "crm"]));

  const commands = generatedData.commands as TauriCommand[];
  const groups = useMemo(() => groupCommands(commands), [commands]);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;

    const searchLower = search.toLowerCase();
    return groups
      .map((group) => ({
        ...group,
        commands: group.commands.filter((cmd) => cmd.name.toLowerCase().includes(searchLower)),
      }))
      .filter((group) => group.commands.length > 0);
  }, [groups, search]);

  const toggleGroup = (module: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(module)) {
        next.delete(module);
      } else {
        next.add(module);
      }
      return next;
    });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Search */}
      <div className="px-3 py-2 border-b border-slate-200 dark:border-zinc-800">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search commands..."
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
        </div>
        <p className="text-[10px] text-zinc-400 mt-1.5">{commands.length} commands</p>
      </div>

      {/* Command list */}
      <div className="flex-1 overflow-auto">
        {filteredGroups.map((group) => (
          <div key={group.module} className="border-b border-slate-200 dark:border-zinc-800 last:border-b-0">
            <button
              onClick={() => toggleGroup(group.module)}
              className="w-full flex items-center gap-2 px-4 py-2 hover:bg-slate-50 dark:hover:bg-zinc-900/50 transition-colors"
            >
              {expandedGroups.has(group.module) || search.length > 0 ? (
                <ChevronDown size={14} className="text-zinc-400" />
              ) : (
                <ChevronRight size={14} className="text-zinc-400" />
              )}
              <span className="flex-1 text-left text-sm font-medium text-zinc-900 dark:text-zinc-100">{group.name}</span>
              <span className="text-xs text-zinc-400 bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                {group.commands.length}
              </span>
            </button>

            {(expandedGroups.has(group.module) || search.length > 0) && (
              <div className="pb-1">
                {group.commands.map((cmd) => (
                  <button
                    key={cmd.name}
                    onClick={() => onSelectCommand(cmd)}
                    className={cn(
                      "w-full text-left px-4 py-1.5 pl-9 transition-colors",
                      selectedCommand?.name === cmd.name
                        ? "bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400"
                        : "text-zinc-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-900/50"
                    )}
                  >
                    <span className="text-sm font-mono truncate block">{cmd.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Command detail view
export function TauriCommandDetail({ command, onBack }: { command: TauriCommand; onBack: () => void }) {
  const [copied, setCopied] = useState(false);

  const invokeSnippet = `import { invoke } from "@tauri-apps/api/core";

const result = await invoke("${command.name}", {
  // parameters here
});`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(invokeSnippet);
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
          <h2 className="font-mono text-lg font-semibold text-zinc-900 dark:text-zinc-100 truncate">{command.name}</h2>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Module */}
        <section>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2 uppercase tracking-wide">Module</h3>
          <span className="px-2 py-1 text-sm rounded bg-slate-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
            {MODULE_LABELS[command.module] || command.module}
          </span>
        </section>

        {/* Usage */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wide">Usage</h3>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded transition-colors"
            >
              {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="p-3 bg-slate-900 dark:bg-zinc-900 rounded-lg text-sm font-mono text-slate-300 overflow-x-auto">
            {invokeSnippet}
          </pre>
        </section>

        {/* Note */}
        <section className="p-4 bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800 rounded-lg">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            <strong className="text-zinc-700 dark:text-zinc-300">Note:</strong> Tauri commands are internal to tv-client. They
            are called from the React frontend via <code className="px-1 bg-slate-200 dark:bg-zinc-700 rounded">invoke()</code>{" "}
            and are also used by MCP tools. See the Rust source in{" "}
            <code className="px-1 bg-slate-200 dark:bg-zinc-700 rounded">src-tauri/src/commands/</code> for parameter types.
          </p>
        </section>

        {/* Auto-generated notice */}
        <section className="text-xs text-zinc-400">
          <p>
            Auto-generated from <code>main.rs</code>. Run <code>node scripts/generate-commands.js</code> to update.
          </p>
          <p className="mt-1">Generated: {new Date(generatedData.generated).toLocaleString()}</p>
        </section>
      </div>
    </div>
  );
}
