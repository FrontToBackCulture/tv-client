// src/modules/library/WorkflowDetails.tsx
// Detailed view for individual workflow folders

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Workflow, Clock, Database, Play, AlertTriangle, CheckCircle, ChevronDown, ChevronRight, FileJson, History, ExternalLink } from "lucide-react";
import { cn } from "../../lib/cn";

interface WorkflowDetailsProps {
  workflowPath: string;
  workflowName: string;
}

// Actual structure from workflow definition.json
interface WorkflowPlugin {
  name: string;
  pluginId?: string;
  params?: {
    sql_query?: string;
    source_tables?: string[];
    target?: {
      zone?: string;
      table?: string;
    };
    mapping?: Array<{
      source: string;
      target: string;
    }>;
    [key: string]: unknown;
  };
}

interface WorkflowExecution {
  status: string;
  started_at: string;
  completed_at?: string;
}

interface WorkflowDefinition {
  id: number;
  name: string;
  created_date?: string;
  updated_date?: string;
  priority?: number;
  status?: string | null;
  cron_expression?: string | null;
  tags?: string[];
  latest_run_status?: string;
  run_started_at?: string;
  run_completed_at?: string;
  last_five_executions?: WorkflowExecution[];
  deleted?: boolean;
  data?: {
    tags?: string[];
    queue?: string;
    description?: string;
    workflow?: {
      plugins?: WorkflowPlugin[];
    };
  };
}

type TabType = "details" | "history";

// Extract domain name from path for VAL URL
function extractDomainFromPath(path: string): string | null {
  const match = path.match(/\/domains\/(production|staging)\/([^/]+)/);
  return match ? match[2] : null;
}

// Build VAL URL for workflow
function getValUrl(path: string, workflowId: string): string | null {
  const domain = extractDomainFromPath(path);
  if (!domain) return null;
  return `https://${domain}.thinkval.io/workflows/${workflowId}`;
}

export function WorkflowDetails({ workflowPath, workflowName }: WorkflowDetailsProps) {
  const [activeTab, setActiveTab] = useState<TabType>("details");
  const [definition, setDefinition] = useState<WorkflowDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        // Load definition.json - contains everything including execution history
        try {
          const defPath = `${workflowPath}/definition.json`;
          const content = await invoke<string>("read_file", { path: defPath });
          setDefinition(JSON.parse(content));
        } catch {
          setDefinition(null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load workflow data");
      } finally {
        setLoading(false);
      }
    }

    if (workflowPath) {
      loadData();
    }
  }, [workflowPath]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-pulse text-zinc-500">Loading workflow details...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-red-400 flex items-center gap-2">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-zinc-800">
        <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-sm mb-1">
          <Workflow size={14} />
          <span>Workflow</span>
        </div>
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          {definition?.name || workflowName}
        </h2>
        {definition?.data?.description && (
          <p className="text-sm text-zinc-500 mt-1">{definition.data.description}</p>
        )}
        <p className="text-sm text-zinc-500 dark:text-zinc-600 font-mono mt-1">#{workflowName}</p>

        {/* Status badge */}
        {definition?.latest_run_status && (
          <div className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs mt-2",
            definition.latest_run_status === "completed" && "bg-green-500/20 text-green-500 dark:text-green-400",
            definition.latest_run_status === "failed" && "bg-red-500/20 text-red-500 dark:text-red-400",
            definition.latest_run_status === "running" && "bg-blue-500/20 text-blue-500 dark:text-blue-400"
          )}>
            {definition.latest_run_status === "completed" && <CheckCircle size={12} />}
            {definition.latest_run_status === "failed" && <AlertTriangle size={12} />}
            {definition.latest_run_status === "running" && <Play size={12} />}
            {definition.latest_run_status}
          </div>
        )}

        {/* Open in VAL & Schedule badge */}
        <div className="flex items-center gap-4 mt-3">
          {(() => {
            const valUrl = getValUrl(workflowPath, workflowName);
            return valUrl ? (
              <a
                href={valUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-sm rounded-md transition-colors"
              >
                <ExternalLink size={14} />
                Open in VAL
              </a>
            ) : null;
          })()}
          {definition?.cron_expression && (
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-blue-500 dark:text-blue-400" />
              <span className="text-sm text-blue-500 dark:text-blue-400">{definition.cron_expression}</span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          <TabButton active={activeTab === "details"} onClick={() => setActiveTab("details")}>
            Details
          </TabButton>
          <TabButton active={activeTab === "history"} onClick={() => setActiveTab("history")} disabled={!definition?.last_five_executions?.length}>
            History
          </TabButton>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "details" && <DetailsTab definition={definition} />}
        {activeTab === "history" && <HistoryTab definition={definition} />}
      </div>
    </div>
  );
}

// Tab button
function TabButton({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-3 py-1.5 text-sm rounded-md transition-colors",
        disabled
          ? "text-zinc-400 dark:text-zinc-600 cursor-not-allowed"
          : active
            ? "bg-slate-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
            : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800"
      )}
    >
      {children}
    </button>
  );
}

// Details tab
function DetailsTab({ definition }: { definition: WorkflowDefinition | null }) {
  const [expandedPlugins, setExpandedPlugins] = useState<Set<number>>(new Set([0]));

  if (!definition) {
    return <div className="text-zinc-500">No definition data available</div>;
  }

  const plugins = definition.data?.workflow?.plugins || [];

  // Collect all source tables from plugins
  const allTables = new Set<string>();
  plugins.forEach(plugin => {
    plugin.params?.source_tables?.forEach(t => allTables.add(t));
  });

  const togglePlugin = (index: number) => {
    const newExpanded = new Set(expandedPlugins);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedPlugins(newExpanded);
  };

  return (
    <div className="space-y-6">
      {/* Description */}
      {definition.data?.description && (
        <div className="bg-white dark:bg-zinc-900 rounded-lg p-4 border border-slate-200 dark:border-transparent">
          <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Description</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{definition.data.description}</p>
        </div>
      )}

      {/* Tags */}
      {definition.tags && definition.tags.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">Tags</h3>
          <div className="flex flex-wrap gap-2">
            {definition.tags.map((tag, i) => (
              <span
                key={i}
                className="px-2 py-1 bg-slate-100 dark:bg-zinc-800 rounded text-xs text-zinc-700 dark:text-zinc-300"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tables used */}
      {allTables.size > 0 && (
        <div>
          <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2">
            <Database size={14} />
            Source Tables ({allTables.size})
          </h3>
          <div className="flex flex-wrap gap-2">
            {Array.from(allTables).map((table, i) => (
              <span
                key={i}
                className="px-2 py-1 bg-slate-100 dark:bg-zinc-800 rounded text-xs text-zinc-700 dark:text-zinc-300 font-mono"
              >
                {table}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Plugins/Steps */}
      {plugins.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2">
            <FileJson size={14} />
            Plugins ({plugins.length})
          </h3>
          <div className="space-y-2">
            {plugins.map((plugin, i) => (
              <div key={i} className="bg-white dark:bg-zinc-900 rounded-lg overflow-hidden border border-slate-200 dark:border-transparent">
                <button
                  onClick={() => togglePlugin(i)}
                  className="w-full flex items-center gap-2 p-3 text-left hover:bg-slate-50 dark:hover:bg-zinc-800/50"
                >
                  {expandedPlugins.has(i) ? (
                    <ChevronDown size={14} className="text-zinc-500" />
                  ) : (
                    <ChevronRight size={14} className="text-zinc-500" />
                  )}
                  <span className="text-xs text-zinc-500 dark:text-zinc-600 font-mono w-6">{i + 1}</span>
                  <span className="text-sm text-zinc-800 dark:text-zinc-200 flex-1">
                    {plugin.name}
                  </span>
                  {plugin.params?.target?.table && (
                    <span className="text-xs text-zinc-500 bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 rounded font-mono">
                      → {plugin.params.target.table}
                    </span>
                  )}
                </button>
                {expandedPlugins.has(i) && (
                  <div className="px-3 pb-3 pt-0 space-y-3">
                    {/* Mapping */}
                    {plugin.params?.mapping && plugin.params.mapping.length > 0 && (
                      <div>
                        <span className="text-xs text-zinc-500">Column Mapping ({plugin.params.mapping.length})</span>
                        <div className="mt-1 max-h-32 overflow-y-auto">
                          {plugin.params.mapping.slice(0, 5).map((m, j) => (
                            <div key={j} className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                              {m.source} → {m.target}
                            </div>
                          ))}
                          {plugin.params.mapping.length > 5 && (
                            <div className="text-xs text-zinc-500">
                              ... and {plugin.params.mapping.length - 5} more
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {/* SQL Query (truncated) */}
                    {plugin.params?.sql_query && (
                      <div>
                        <span className="text-xs text-zinc-500">SQL Query</span>
                        <pre className="text-xs text-zinc-600 dark:text-zinc-400 bg-slate-50 dark:bg-zinc-950 rounded p-2 mt-1 overflow-x-auto max-h-40 overflow-y-auto">
                          {plugin.params.sql_query.substring(0, 500)}
                          {plugin.params.sql_query.length > 500 && "..."}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="bg-white dark:bg-zinc-900 rounded-lg p-4 border border-slate-200 dark:border-transparent">
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">Metadata</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-zinc-500">Workflow ID: </span>
            <span className="text-zinc-700 dark:text-zinc-300">{definition.id}</span>
          </div>
          {definition.priority !== undefined && (
            <div>
              <span className="text-zinc-500">Priority: </span>
              <span className="text-zinc-700 dark:text-zinc-300">{definition.priority}</span>
            </div>
          )}
          {definition.updated_date && (
            <div>
              <span className="text-zinc-500">Last Updated: </span>
              <span className="text-zinc-700 dark:text-zinc-300">{new Date(definition.updated_date).toLocaleDateString()}</span>
            </div>
          )}
          {definition.run_completed_at && (
            <div>
              <span className="text-zinc-500">Last Run: </span>
              <span className="text-zinc-700 dark:text-zinc-300">{new Date(definition.run_completed_at).toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// History tab - uses last_five_executions from definition
function HistoryTab({ definition }: { definition: WorkflowDefinition | null }) {
  const executions = definition?.last_five_executions || [];

  if (executions.length === 0) {
    return <div className="text-zinc-500">No execution history available</div>;
  }

  return (
    <div>
      <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2">
        <History size={14} />
        Recent Executions ({executions.length})
      </h3>
      <div className="space-y-2">
        {executions.map((exec, i) => {
          const startTime = exec.started_at ? new Date(exec.started_at) : null;
          const endTime = exec.completed_at ? new Date(exec.completed_at) : null;
          const duration = startTime && endTime ? endTime.getTime() - startTime.getTime() : null;

          return (
            <div
              key={i}
              className="bg-white dark:bg-zinc-900 rounded-lg p-3 flex items-center gap-3 border border-slate-200 dark:border-transparent"
            >
              <ExecutionStatusIcon status={exec.status} />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-zinc-800 dark:text-zinc-200">
                  {startTime ? startTime.toLocaleString() : "-"}
                </div>
                {duration && (
                  <div className="text-xs text-zinc-500">
                    Duration: {formatDuration(duration)}
                  </div>
                )}
              </div>
              <span className={cn(
                "text-xs px-2 py-0.5 rounded",
                exec.status === "completed" && "bg-green-500/20 text-green-500 dark:text-green-400",
                exec.status === "failed" && "bg-red-500/20 text-red-500 dark:text-red-400",
                exec.status === "running" && "bg-blue-500/20 text-blue-500 dark:text-blue-400"
              )}>
                {exec.status}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Execution status icon
function ExecutionStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
    case "success":
      return <CheckCircle size={16} className="text-green-500 dark:text-green-400 flex-shrink-0" />;
    case "failed":
      return <AlertTriangle size={16} className="text-red-500 dark:text-red-400 flex-shrink-0" />;
    case "running":
      return <Play size={16} className="text-blue-500 dark:text-blue-400 flex-shrink-0 animate-pulse" />;
    default:
      return <Clock size={16} className="text-zinc-500 dark:text-zinc-400 flex-shrink-0" />;
  }
}

// Format duration in ms to human readable
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}
