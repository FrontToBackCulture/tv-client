// src/modules/library/DomainAudit.tsx
// Artifact Audit viewer showing sync status between local and remote artifacts

import { useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle,
  AlertTriangle,
  Database,
  LayoutDashboard,
  FileSearch,
  Clock,
  FolderOpen,
  RefreshCw,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { ViewerLayout, ViewerTab, DataSourcesTab } from "./ViewerLayout";
import { cn } from "../../lib/cn";

interface DomainAuditProps {
  domainPath: string;
  domainName: string;
}

interface AuditArtifactType {
  localCount: number;
  remoteCount: number;
  staleCount: number;
  currentCount: number;
  staleArtifacts: Array<{
    id: string | number;
    name: string;
    reason?: string;
  }>;
}

interface AuditResults {
  success: boolean;
  domain: string;
  globalPath: string;
  timestamp: string;
  summary: {
    totalLocal: number;
    totalRemote: number;
    totalStale: number;
    totalCurrent: number;
  };
  byType: {
    queries: AuditArtifactType;
    dashboards: AuditArtifactType;
    workflows: AuditArtifactType;
    tables: AuditArtifactType;
  };
}

type TabType = "audit" | "sources";

export function DomainAudit({ domainPath, domainName }: DomainAuditProps) {
  const [activeTab, setActiveTab] = useState<TabType>("audit");

  // Load audit results
  const { data: audit, isLoading, isError, refetch } = useQuery({
    queryKey: ["domain-audit", domainPath],
    queryFn: async () => {
      const auditPath = `${domainPath}/audit-results.json`;
      const content = await invoke<string>("read_file", { path: auditPath });
      return JSON.parse(content) as AuditResults;
    },
  });

  // Calculate totals
  const totalStale = audit?.summary.totalStale ?? 0;
  const isHealthy = totalStale === 0;

  // Define tabs
  const tabs: ViewerTab[] = useMemo(
    () => [
      {
        id: "audit",
        label: "Audit",
        icon: isHealthy ? <CheckCircle size={14} /> : <AlertTriangle size={14} />,
        count: totalStale > 0 ? totalStale : undefined,
      },
      {
        id: "sources",
        label: "Data Sources",
        icon: <FolderOpen size={14} />,
      },
    ],
    [isHealthy, totalStale]
  );

  // Data sources
  const dataSources = useMemo(
    () => [
      {
        name: "Audit Results",
        path: `${domainPath}/audit-results.json`,
        description: "Artifact sync status comparison between local and remote",
      },
    ],
    [domainPath]
  );

  // Actions
  const headerActions = (
    <button
      onClick={() => refetch()}
      className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded-lg text-sm text-zinc-700 dark:text-zinc-300 transition-colors"
    >
      <RefreshCw size={14} />
      Refresh
    </button>
  );

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={32} className="mx-auto mb-3 text-zinc-600 animate-spin" />
          <p className="text-sm text-zinc-500">Loading audit data...</p>
        </div>
      </div>
    );
  }

  if (isError || !audit) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={32} className="mx-auto mb-3 text-zinc-400 dark:text-zinc-600" />
          <p className="text-sm text-zinc-600 dark:text-zinc-500">No audit data available</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-600 mt-1">
            Run artifact audit to generate data
          </p>
        </div>
      </div>
    );
  }

  return (
    <ViewerLayout
      title={`${domainName} Artifact Audit`}
      subtitle={`Last audit: ${new Date(audit.timestamp).toLocaleString()}`}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as TabType)}
      actions={headerActions}
    >
      {activeTab === "audit" && (
        <div className="h-full overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Overall Status */}
            <div
              className={cn(
                "rounded-xl p-6 border",
                isHealthy
                  ? "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800"
                  : "bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800"
              )}
            >
              <div className="flex items-center gap-4">
                {isHealthy ? (
                  <CheckCircle size={32} className="text-green-500 dark:text-green-400" />
                ) : (
                  <AlertTriangle size={32} className="text-yellow-500 dark:text-yellow-400" />
                )}
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    {isHealthy ? "All Artifacts in Sync" : `${totalStale} Stale Artifacts`}
                  </h2>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {audit.summary.totalCurrent} of {audit.summary.totalLocal} artifacts are current
                  </p>
                </div>
              </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-4 gap-4">
              <StatCard
                label="Total Local"
                value={audit.summary.totalLocal}
                icon={<Database size={16} />}
              />
              <StatCard
                label="Total Remote"
                value={audit.summary.totalRemote}
                icon={<Database size={16} />}
              />
              <StatCard
                label="Current"
                value={audit.summary.totalCurrent}
                icon={<CheckCircle size={16} />}
                color="green"
              />
              <StatCard
                label="Stale"
                value={audit.summary.totalStale}
                icon={<AlertTriangle size={16} />}
                color={audit.summary.totalStale > 0 ? "yellow" : "zinc"}
              />
            </div>

            {/* By Type Breakdown */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Artifacts by Type</h3>
              <div className="grid grid-cols-2 gap-4">
                <ArtifactTypeCard
                  type="Queries"
                  icon={<FileSearch size={20} />}
                  data={audit.byType.queries}
                />
                <ArtifactTypeCard
                  type="Dashboards"
                  icon={<LayoutDashboard size={20} />}
                  data={audit.byType.dashboards}
                />
                <ArtifactTypeCard
                  type="Workflows"
                  icon={<Clock size={20} />}
                  data={audit.byType.workflows}
                />
                <ArtifactTypeCard
                  type="Tables"
                  icon={<Database size={20} />}
                  data={audit.byType.tables}
                />
              </div>
            </div>

            {/* Stale Artifacts List */}
            {totalStale > 0 && (
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-800 flex items-center gap-2">
                  <AlertTriangle size={16} className="text-yellow-500 dark:text-yellow-400" />
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">Stale Artifacts</span>
                </div>
                <div className="divide-y divide-slate-200 dark:divide-zinc-800 max-h-64 overflow-y-auto">
                  {Object.entries(audit.byType).map(([type, data]) =>
                    data.staleArtifacts.map((artifact) => (
                      <div
                        key={`${type}-${artifact.id}`}
                        className="px-4 py-3 flex items-center gap-3"
                      >
                        <span className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 uppercase">
                          {type}
                        </span>
                        <span className="text-sm text-zinc-800 dark:text-zinc-200 flex-1 truncate">
                          {artifact.name}
                        </span>
                        {artifact.reason && (
                          <span className="text-xs text-zinc-500">
                            {artifact.reason}
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "sources" && (
        <DataSourcesTab sources={dataSources} basePath={domainPath} />
      )}
    </ViewerLayout>
  );
}

function StatCard({
  label,
  value,
  icon,
  color = "zinc",
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color?: "zinc" | "green" | "yellow" | "red";
}) {
  const colorClasses = {
    zinc: "text-zinc-500 dark:text-zinc-400",
    green: "text-green-500 dark:text-green-400",
    yellow: "text-yellow-500 dark:text-yellow-400",
    red: "text-red-500 dark:text-red-400",
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg p-4 border border-slate-200 dark:border-transparent">
      <div className="flex items-center gap-2 text-zinc-500 mb-2">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className={cn("text-2xl font-semibold", colorClasses[color])}>{value}</p>
    </div>
  );
}

function ArtifactTypeCard({
  type,
  icon,
  data,
}: {
  type: string;
  icon: React.ReactNode;
  data: AuditArtifactType;
}) {
  const isHealthy = data.staleCount === 0;
  const percentage = data.localCount > 0
    ? Math.round((data.currentCount / data.localCount) * 100)
    : 100;

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg p-4 border border-slate-200 dark:border-transparent">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
          {icon}
          <span className="font-medium">{type}</span>
        </div>
        {isHealthy ? (
          <CheckCircle size={16} className="text-green-500 dark:text-green-400" />
        ) : (
          <AlertTriangle size={16} className="text-yellow-500 dark:text-yellow-400" />
        )}
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-zinc-500">Local / Remote</span>
          <span className="text-zinc-700 dark:text-zinc-300">
            {data.localCount} / {data.remoteCount}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-zinc-500">Current</span>
          <span className="text-green-500 dark:text-green-400">{data.currentCount}</span>
        </div>
        {data.staleCount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Stale</span>
            <span className="text-yellow-500 dark:text-yellow-400">{data.staleCount}</span>
          </div>
        )}

        {/* Progress bar */}
        <div className="mt-3">
          <div className="h-2 bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                isHealthy ? "bg-green-500" : "bg-yellow-500"
              )}
              style={{ width: `${percentage}%` }}
            />
          </div>
          <p className="text-xs text-zinc-500 mt-1">{percentage}% current</p>
        </div>
      </div>
    </div>
  );
}
