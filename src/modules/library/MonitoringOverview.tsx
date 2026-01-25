// src/modules/library/MonitoringOverview.tsx
// Overview of workflow monitoring data - executions, errors, and status

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Activity, AlertTriangle, Clock, Calendar, TrendingUp, XCircle } from "lucide-react";
import { cn } from "../../lib/cn";

interface MonitoringOverviewProps {
  monitoringPath: string;
  domainName: string;
}

interface ExecutionSummary {
  date: string;
  totalExecutions: number;
  successful: number;
  failed: number;
  avgDuration?: number;
}

interface RecentError {
  workflowId: string;
  workflowName: string;
  timestamp: string;
  error: string;
}

interface MonitoringData {
  lastUpdated?: string;
  summary?: {
    totalWorkflows: number;
    activeWorkflows: number;
    executionsToday: number;
    errorsToday: number;
  };
  recentExecutions?: ExecutionSummary[];
  recentErrors?: RecentError[];
}

export function MonitoringOverview({ monitoringPath, domainName }: MonitoringOverviewProps) {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        // Try to load monitoring summary
        try {
          const summaryPath = `${monitoringPath}/monitoring-summary.json`;
          const content = await invoke<string>("read_file", { path: summaryPath });
          setData(JSON.parse(content));
        } catch {
          // Try to load from individual files
          const monitoringData: MonitoringData = {};

          // Check for execution logs
          try {
            const entries = await invoke<Array<{ name: string; path: string; is_dir: boolean }>>(
              "list_directory",
              { path: monitoringPath }
            );

            // Look for dated folders or execution files
            const executionFiles = entries.filter(
              (e) => e.name.endsWith(".json") && !e.name.startsWith(".")
            );

            if (executionFiles.length > 0) {
              monitoringData.summary = {
                totalWorkflows: 0,
                activeWorkflows: 0,
                executionsToday: executionFiles.length,
                errorsToday: 0,
              };
            }
          } catch {
            // No monitoring data
          }

          setData(Object.keys(monitoringData).length > 0 ? monitoringData : null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load monitoring data");
      } finally {
        setLoading(false);
      }
    }

    if (monitoringPath) {
      loadData();
    }
  }, [monitoringPath]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-pulse text-zinc-500">Loading monitoring data...</div>
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

  if (!data) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-sm mb-4">
          <Activity size={14} />
          <span>{domainName}</span>
        </div>
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Monitoring</h2>
        <div className="text-center text-zinc-500 py-8">
          <Activity size={32} className="mx-auto mb-3 opacity-50" />
          <p>No monitoring data available</p>
          <p className="text-sm mt-1">Run workflow monitoring sync to populate data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-zinc-800">
        <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-sm mb-1">
          <Activity size={14} />
          <span>{domainName}</span>
        </div>
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Monitoring</h2>
        {data.lastUpdated && (
          <p className="text-sm text-zinc-500 mt-1">Last updated: {data.lastUpdated}</p>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Summary stats */}
        {data.summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={<Activity size={16} />}
              label="Total Workflows"
              value={data.summary.totalWorkflows}
              color="blue"
            />
            <StatCard
              icon={<TrendingUp size={16} />}
              label="Active"
              value={data.summary.activeWorkflows}
              color="green"
            />
            <StatCard
              icon={<Clock size={16} />}
              label="Executions Today"
              value={data.summary.executionsToday}
              color="teal"
            />
            <StatCard
              icon={<XCircle size={16} />}
              label="Errors Today"
              value={data.summary.errorsToday}
              color={data.summary.errorsToday > 0 ? "red" : "zinc"}
            />
          </div>
        )}

        {/* Recent executions */}
        {data.recentExecutions && data.recentExecutions.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2">
              <Calendar size={14} />
              Recent Execution History
            </h3>
            <div className="bg-white dark:bg-zinc-900 rounded-lg overflow-hidden border border-slate-200 dark:border-transparent">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-zinc-800">
                    <th className="text-left px-3 py-2 text-zinc-500 dark:text-zinc-400 font-medium">Date</th>
                    <th className="text-right px-3 py-2 text-zinc-500 dark:text-zinc-400 font-medium">Total</th>
                    <th className="text-right px-3 py-2 text-zinc-500 dark:text-zinc-400 font-medium">Success</th>
                    <th className="text-right px-3 py-2 text-zinc-500 dark:text-zinc-400 font-medium">Failed</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentExecutions.map((exec, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-zinc-800/50 last:border-0">
                      <td className="px-3 py-2 text-zinc-800 dark:text-zinc-200">{exec.date}</td>
                      <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400 text-right">{exec.totalExecutions}</td>
                      <td className="px-3 py-2 text-green-500 dark:text-green-400 text-right">{exec.successful}</td>
                      <td className={cn(
                        "px-3 py-2 text-right",
                        exec.failed > 0 ? "text-red-500 dark:text-red-400" : "text-zinc-500"
                      )}>
                        {exec.failed}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Recent errors */}
        {data.recentErrors && data.recentErrors.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2">
              <AlertTriangle size={14} className="text-red-500 dark:text-red-400" />
              Recent Errors
            </h3>
            <div className="space-y-2">
              {data.recentErrors.map((err, i) => (
                <div key={i} className="bg-white dark:bg-zinc-900 rounded-lg p-3 border-l-2 border-red-500/50">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-zinc-800 dark:text-zinc-200">{err.workflowName}</span>
                    <span className="text-xs text-zinc-500">{err.timestamp}</span>
                  </div>
                  <p className="text-xs text-red-500 dark:text-red-400 truncate">{err.error}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Stat card component
function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: "blue" | "green" | "teal" | "red" | "zinc";
}) {
  const colorClasses = {
    blue: "text-blue-500 dark:text-blue-400",
    green: "text-green-500 dark:text-green-400",
    teal: "text-teal-500 dark:text-teal-400",
    red: "text-red-500 dark:text-red-400",
    zinc: "text-zinc-500 dark:text-zinc-400",
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg p-4 border border-slate-200 dark:border-transparent">
      <div className={cn("flex items-center gap-2 mb-2", colorClasses[color])}>
        {icon}
        <span className="text-xs text-zinc-500">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  );
}
