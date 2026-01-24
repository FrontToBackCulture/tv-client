// src/modules/library/DomainOverview.tsx
// Overview panel showing domain summary stats with tabs

import { useState, useMemo } from "react";
import {
  Database,
  Workflow,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  Clock,
  FolderOpen,
} from "lucide-react";
import { useDomainData, SyncMetadata } from "../../hooks/useDomainData";
import { ViewerLayout, ViewerTab, DataSourcesTab } from "./ViewerLayout";
import { cn } from "../../lib/cn";

interface DomainOverviewProps {
  domainPath: string;
  domainName: string;
}

type TabType = "overview" | "history" | "sources";

export function DomainOverview({ domainPath, domainName }: DomainOverviewProps) {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const { health, workflows, syncMetadata, loading, error } = useDomainData(domainPath);

  // Define tabs
  const tabs: ViewerTab[] = useMemo(
    () => [
      {
        id: "overview",
        label: "Overview",
        icon: <BarChart3 size={14} />,
      },
      {
        id: "history",
        label: "History",
        icon: <Clock size={14} />,
        count: syncMetadata?.syncHistory?.length ?? 0,
      },
      {
        id: "sources",
        label: "Data Sources",
        icon: <FolderOpen size={14} />,
      },
    ],
    [syncMetadata]
  );

  // Data sources for this viewer
  const dataSources = useMemo(
    () => [
      { name: "Sync Metadata", path: `${domainPath}/sync-metadata.json`, description: "Sync timestamps and history" },
      { name: "Workflows", path: `${domainPath}/all_workflows.json`, description: "Workflow definitions from VAL API" },
      { name: "Dashboards", path: `${domainPath}/all_dashboards.json`, description: "Dashboard definitions from VAL API" },
      { name: "Queries", path: `${domainPath}/all_queries.json`, description: "Query definitions from VAL API" },
      { name: "Global Fields", path: `${domainPath}/all_global_fields.json`, description: "Global field definitions" },
      { name: "Calculated Fields", path: `${domainPath}/all_calculated_fields.json`, description: "Calculated field definitions" },
      { name: "Data Model Health", path: `${domainPath}/health-check-results.json`, description: "Data model health check results" },
      { name: "Workflow Health", path: `${domainPath}/workflow-health-results.json`, description: "Workflow health check results" },
      { name: "AI Config", path: `${domainPath}/CLAUDE.md`, description: "AI configuration for this domain" },
    ],
    [domainPath]
  );

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-pulse text-zinc-500">Loading domain data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-red-400 flex items-center gap-2">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <ViewerLayout
      title={`${domainName} Overview`}
      subtitle={`Last sync: ${syncMetadata?.lastFullSync ? new Date(syncMetadata.lastFullSync).toLocaleString() : "Never"}`}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as TabType)}
    >
      <div className="h-full overflow-y-auto p-6">
        {activeTab === "overview" && (
          <OverviewTabContent
            health={health}
            workflows={workflows}
            syncMetadata={syncMetadata}
          />
        )}
        {activeTab === "history" && (
          <HistoryTabContent syncMetadata={syncMetadata} />
        )}
        {activeTab === "sources" && (
          <DataSourcesTab sources={dataSources} basePath={domainPath} />
        )}
      </div>
    </ViewerLayout>
  );
}

// Overview tab content
function OverviewTabContent({
  health,
  workflows,
  syncMetadata,
}: {
  health: ReturnType<typeof useDomainData>["health"];
  workflows: ReturnType<typeof useDomainData>["workflows"];
  syncMetadata: SyncMetadata | null;
}) {
  if (!health && !workflows && !syncMetadata) {
    return (
      <div className="text-zinc-500 py-8 text-center">
        No data available for this domain. Run sync to generate data.
      </div>
    );
  }

  // Calculate workflow health stats
  const healthyWorkflows = workflows?.workflows.filter(
    (w) => w.health.status.level === "healthy"
  ).length ?? 0;
  const warningWorkflows = workflows?.workflows.filter(
    (w) => w.health.status.level === "warning"
  ).length ?? 0;
  const criticalWorkflows = workflows?.workflows.filter(
    (w) => w.health.status.level === "critical"
  ).length ?? 0;

  // Calculate table freshness stats
  const staleTables = health?.tables.filter(
    (t) => t.freshness.daysSinceUpdate !== null && t.freshness.daysSinceUpdate > 7
  ).length ?? 0;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Database size={20} />}
          label="Tables"
          value={health?.totalTables ?? syncMetadata?.artifacts.tables.count ?? 0}
          subtitle={health ? `${health.transactionalTables} transactional` : ""}
          color="teal"
        />
        <StatCard
          icon={<Workflow size={20} />}
          label="Workflows"
          value={workflows?.totalWorkflows ?? syncMetadata?.artifacts.workflows.count ?? 0}
          subtitle={workflows ? `${workflows.analyzedWorkflows} scheduled` : ""}
          color="blue"
        />
        <StatCard
          icon={<CheckCircle size={20} />}
          label="Healthy"
          value={healthyWorkflows}
          subtitle="workflows"
          color="green"
        />
        <StatCard
          icon={<AlertTriangle size={20} />}
          label="Issues"
          value={warningWorkflows + criticalWorkflows}
          subtitle={criticalWorkflows > 0 ? `${criticalWorkflows} critical` : "none critical"}
          color={criticalWorkflows > 0 ? "red" : warningWorkflows > 0 ? "yellow" : "green"}
        />
      </div>

      {/* Artifacts Summary */}
      {syncMetadata && (
        <div className="bg-zinc-900 rounded-lg p-4">
          <h3 className="text-sm font-medium text-zinc-300 mb-3">Artifacts Synced</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <ArtifactStat label="Tables" data={syncMetadata.artifacts.tables} />
            <ArtifactStat label="Workflows" data={syncMetadata.artifacts.workflows} />
            <ArtifactStat label="Queries" data={syncMetadata.artifacts.queries} />
            <ArtifactStat label="Dashboards" data={syncMetadata.artifacts.dashboards} />
            <ArtifactStat label="Fields" data={syncMetadata.artifacts.fields} />
          </div>
        </div>
      )}

      {/* Quick Health Summary */}
      {(health || workflows) && (
        <div className="bg-zinc-900 rounded-lg p-4">
          <h3 className="text-sm font-medium text-zinc-300 mb-3">Health Summary</h3>
          <div className="space-y-2">
            <HealthRow
              label="Table Freshness"
              status={staleTables === 0 ? "healthy" : staleTables < 5 ? "warning" : "critical"}
              detail={staleTables === 0 ? "All tables up to date" : `${staleTables} tables stale (>7 days)`}
            />
            <HealthRow
              label="Workflow Execution"
              status={criticalWorkflows === 0 ? (warningWorkflows === 0 ? "healthy" : "warning") : "critical"}
              detail={
                criticalWorkflows > 0
                  ? `${criticalWorkflows} workflows failing`
                  : warningWorkflows > 0
                    ? `${warningWorkflows} workflows with warnings`
                    : "All workflows healthy"
              }
            />
            {health && (
              <HealthRow
                label="Static Tables"
                status="healthy"
                detail={`${health.staticTables} configuration tables`}
              />
            )}
          </div>
        </div>
      )}

      {/* Recent Issues */}
      {(warningWorkflows > 0 || criticalWorkflows > 0) && workflows && (
        <div className="bg-zinc-900 rounded-lg p-4">
          <h3 className="text-sm font-medium text-zinc-300 mb-3">Recent Issues</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {workflows.workflows
              .filter((w) => w.health.status.level === "critical" || w.health.status.level === "warning")
              .slice(0, 10)
              .map((workflow) => (
                <div key={workflow.id} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5">{workflow.health.status.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-zinc-300 truncate">{workflow.name}</p>
                    <p className="text-zinc-500 text-xs">{workflow.health.status.description}</p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// History tab content
function HistoryTabContent({ syncMetadata }: { syncMetadata: SyncMetadata | null }) {
  if (!syncMetadata?.syncHistory || syncMetadata.syncHistory.length === 0) {
    return (
      <div className="text-zinc-500 py-8 text-center">
        No sync history available.
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <div className="bg-zinc-900 rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-zinc-800 border-b border-zinc-700">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
            Recent Sync History
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">Time</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">Details</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">Count</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {syncMetadata.syncHistory.slice(0, 20).map((entry, index) => (
                <tr key={index} className="border-b border-zinc-800/50 hover:bg-zinc-800/50">
                  <td className="px-4 py-3 text-zinc-400">{formatRelativeTime(entry.timestamp)}</td>
                  <td className="px-4 py-3 text-zinc-200 font-medium">{entry.type}</td>
                  <td className="px-4 py-3 text-zinc-400">
                    {entry.artifactType || entry.extractionType || entry.generationType || "-"}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{entry.count ?? "-"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={entry.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Helper components
function StatCard({
  icon,
  label,
  value,
  subtitle,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  subtitle: string;
  color: "teal" | "blue" | "green" | "yellow" | "red";
}) {
  const colorClasses = {
    teal: "text-teal-400 bg-teal-400/10",
    blue: "text-blue-400 bg-blue-400/10",
    green: "text-green-400 bg-green-400/10",
    yellow: "text-yellow-400 bg-yellow-400/10",
    red: "text-red-400 bg-red-400/10",
  };

  return (
    <div className="bg-zinc-900 rounded-lg p-4">
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-3", colorClasses[color])}>
        {icon}
      </div>
      <p className="text-2xl font-semibold text-zinc-100">{value}</p>
      <p className="text-sm text-zinc-400">{label}</p>
      {subtitle && <p className="text-xs text-zinc-500 mt-1">{subtitle}</p>}
    </div>
  );
}

function ArtifactStat({ label, data }: { label: string; data: { count: number; lastSync: string | null; status: string } }) {
  return (
    <div className="text-center">
      <p className="text-lg font-semibold text-zinc-100">{data.count}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}

function HealthRow({
  label,
  status,
  detail,
}: {
  label: string;
  status: "healthy" | "warning" | "critical";
  detail: string;
}) {
  const statusColors = {
    healthy: "bg-green-400",
    warning: "bg-yellow-400",
    critical: "bg-red-400",
  };

  return (
    <div className="flex items-center gap-3">
      <div className={cn("w-2 h-2 rounded-full", statusColors[status])} />
      <div className="flex-1">
        <span className="text-sm text-zinc-300">{label}</span>
        <span className="text-sm text-zinc-500 ml-2">— {detail}</span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const statusClasses: Record<string, string> = {
    success: "bg-green-400/10 text-green-400",
    partial: "bg-yellow-400/10 text-yellow-400",
    failed: "bg-red-400/10 text-red-400",
    never: "bg-zinc-400/10 text-zinc-400",
  };

  return (
    <span className={cn(
      "px-2 py-0.5 rounded text-xs font-medium",
      statusClasses[status] || statusClasses.never
    )}>
      {status}
    </span>
  );
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) {
    return diffMins <= 1 ? "Just now" : `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
}
