// src/modules/library/WorkflowsList.tsx
// List view for workflows folder showing all workflows with execution status

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Workflow, Search, AlertTriangle, CheckCircle, Clock, ChevronRight, Play } from "lucide-react";

interface WorkflowsListProps {
  workflowsPath: string;
  domainName: string;
  onWorkflowSelect?: (workflowPath: string, workflowName: string) => void;
}

interface WorkflowEntry {
  id: string;
  workflowName: string;
  displayName: string;
  path: string;
  hasDefinition: boolean;
  isScheduled: boolean;
  schedule?: string;
  status?: "healthy" | "warning" | "error" | "unknown";
  lastRun?: string;
  lastStatus?: "success" | "failed" | "running";
}

interface WorkflowHealthData {
  workflows?: Array<{
    id: string;
    name: string;
    schedule?: string;
    status?: string;
    lastRun?: string;
    lastStatus?: string;
  }>;
}

export function WorkflowsList({ workflowsPath, domainName, onWorkflowSelect }: WorkflowsListProps) {
  const [workflows, setWorkflows] = useState<WorkflowEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "scheduled" | "manual">("all");

  useEffect(() => {
    async function loadWorkflows() {
      setLoading(true);
      setError(null);

      try {
        // List workflow directories
        const entries = await invoke<Array<{ name: string; path: string; is_dir: boolean }>>(
          "list_directory",
          { path: workflowsPath }
        );

        const workflowDirs = entries.filter(
          (e) => e.is_dir && e.name.startsWith("workflow_")
        );

        // Try to load health data
        let healthData: WorkflowHealthData | null = null;
        try {
          const domainPath = workflowsPath.replace(/\/workflows$/, "");
          const healthPath = `${domainPath}/workflow-health-results.json`;
          const healthContent = await invoke<string>("read_file", { path: healthPath });
          healthData = JSON.parse(healthContent);
        } catch {
          // Health data not available
        }

        // Build workflow entries
        const workflowEntries: WorkflowEntry[] = await Promise.all(
          workflowDirs.map(async (dir) => {
            const workflowPath = dir.path;
            const workflowId = dir.name.replace(/^workflow_/, "");

            let displayName = workflowId;
            let hasDefinition = false;
            let isScheduled = false;
            let schedule: string | undefined;

            try {
              const defContent = await invoke<string>("read_file", {
                path: `${workflowPath}/definition.json`,
              });
              const def = JSON.parse(defContent);
              hasDefinition = true;
              displayName = def.name || def.displayName || workflowId;
              isScheduled = !!def.schedule || !!def.cron;
              schedule = def.schedule || def.cron;
            } catch {
              // No definition
            }

            // Find health status
            let status: "healthy" | "warning" | "error" | "unknown" = "unknown";
            let lastRun: string | undefined;
            let lastStatus: "success" | "failed" | "running" | undefined;

            if (healthData?.workflows) {
              const healthEntry = healthData.workflows.find(
                (w) => w.id === workflowId || w.name === displayName
              );
              if (healthEntry) {
                status = healthEntry.status === "healthy" ? "healthy" :
                         healthEntry.status === "warning" ? "warning" :
                         healthEntry.status === "error" ? "error" : "unknown";
                lastRun = healthEntry.lastRun;
                lastStatus = healthEntry.lastStatus as "success" | "failed" | "running" | undefined;
              }
            }

            return {
              id: workflowId,
              workflowName: workflowId,
              displayName,
              path: workflowPath,
              hasDefinition,
              isScheduled,
              schedule,
              status,
              lastRun,
              lastStatus,
            };
          })
        );

        // Sort by display name
        workflowEntries.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setWorkflows(workflowEntries);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load workflows");
      } finally {
        setLoading(false);
      }
    }

    if (workflowsPath) {
      loadWorkflows();
    }
  }, [workflowsPath]);

  // Filter workflows
  const filteredWorkflows = workflows.filter((wf) => {
    const matchesSearch =
      wf.displayName.toLowerCase().includes(search.toLowerCase()) ||
      wf.workflowName.toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      filterStatus === "all" ||
      (filterStatus === "scheduled" && wf.isScheduled) ||
      (filterStatus === "manual" && !wf.isScheduled);
    return matchesSearch && matchesFilter;
  });

  // Stats
  const scheduledCount = workflows.filter((w) => w.isScheduled).length;
  const healthyCount = workflows.filter((w) => w.status === "healthy").length;
  const errorCount = workflows.filter((w) => w.status === "error").length;

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-pulse text-zinc-500">Loading workflows...</div>
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
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
          <Workflow size={14} />
          <span>{domainName}</span>
        </div>
        <h2 className="text-xl font-semibold text-zinc-100">Workflows</h2>
        <p className="text-sm text-zinc-500 mt-1">{workflows.length} workflows</p>

        {/* Stats */}
        <div className="flex gap-4 mt-4">
          <div className="flex items-center gap-1.5 text-sm">
            <Clock size={14} className="text-blue-400" />
            <span className="text-zinc-400">{scheduledCount} scheduled</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <CheckCircle size={14} className="text-green-400" />
            <span className="text-zinc-400">{healthyCount} healthy</span>
          </div>
          {errorCount > 0 && (
            <div className="flex items-center gap-1.5 text-sm">
              <AlertTriangle size={14} className="text-red-400" />
              <span className="text-zinc-400">{errorCount} errors</span>
            </div>
          )}
        </div>

        {/* Search and filter */}
        <div className="flex gap-2 mt-4">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search workflows..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded pl-8 pr-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-teal-500"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as "all" | "scheduled" | "manual")}
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-teal-500"
          >
            <option value="all">All</option>
            <option value="scheduled">Scheduled</option>
            <option value="manual">Manual</option>
          </select>
        </div>
      </div>

      {/* Workflow list */}
      <div className="flex-1 overflow-y-auto">
        {filteredWorkflows.map((workflow) => (
          <button
            key={workflow.id}
            onClick={() => onWorkflowSelect?.(workflow.path, workflow.workflowName)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/50 border-b border-zinc-800/50 text-left"
          >
            <WorkflowStatusIcon status={workflow.status} lastStatus={workflow.lastStatus} />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-zinc-200 truncate">{workflow.displayName}</div>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="font-mono">#{workflow.workflowName}</span>
                {workflow.isScheduled && (
                  <>
                    <span>•</span>
                    <span className="text-blue-400">{workflow.schedule}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {workflow.lastRun && (
                <span className="text-xs text-zinc-500">{workflow.lastRun}</span>
              )}
              <ChevronRight size={14} className="text-zinc-600" />
            </div>
          </button>
        ))}

        {filteredWorkflows.length === 0 && (
          <div className="p-8 text-center text-zinc-500">
            {search ? "No workflows match your search" : "No workflows found"}
          </div>
        )}
      </div>
    </div>
  );
}

// Workflow status icon
function WorkflowStatusIcon({
  status,
  lastStatus
}: {
  status?: "healthy" | "warning" | "error" | "unknown";
  lastStatus?: "success" | "failed" | "running";
}) {
  if (lastStatus === "running") {
    return <Play size={16} className="text-blue-400 flex-shrink-0 animate-pulse" />;
  }

  switch (status) {
    case "healthy":
      return <CheckCircle size={16} className="text-green-400 flex-shrink-0" />;
    case "warning":
      return <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />;
    case "error":
      return <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />;
    default:
      return <Workflow size={16} className="text-zinc-500 flex-shrink-0" />;
  }
}
