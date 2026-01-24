// src/modules/library/DomainOverview.tsx
// Overview panel showing domain summary stats

import { Database, Workflow, AlertTriangle, CheckCircle } from "lucide-react";
import { useDomainData } from "../../hooks/useDomainData";
import { cn } from "../../lib/cn";

interface DomainOverviewProps {
  domainPath: string;
  domainName: string;
}

export function DomainOverview({ domainPath, domainName }: DomainOverviewProps) {
  const { health, workflows, loading, error } = useDomainData(domainPath);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-pulse text-zinc-500">Loading domain data...</div>
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

  if (!health && !workflows) {
    return (
      <div className="p-6 text-zinc-500">
        No health data available for this domain. Run health checks to generate data.
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-zinc-100">{domainName}</h2>
        <p className="text-sm text-zinc-500 mt-1">
          Last updated: {health?.timestamp ? new Date(health.timestamp).toLocaleString() : "Unknown"}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Tables */}
        <StatCard
          icon={<Database size={20} />}
          label="Tables"
          value={health?.totalTables ?? 0}
          subtitle={`${health?.transactionalTables ?? 0} transactional`}
          color="teal"
        />

        {/* Workflows */}
        <StatCard
          icon={<Workflow size={20} />}
          label="Workflows"
          value={workflows?.totalWorkflows ?? 0}
          subtitle={`${workflows?.analyzedWorkflows ?? 0} scheduled`}
          color="blue"
        />

        {/* Healthy */}
        <StatCard
          icon={<CheckCircle size={20} />}
          label="Healthy"
          value={healthyWorkflows}
          subtitle="workflows"
          color="green"
        />

        {/* Issues */}
        <StatCard
          icon={<AlertTriangle size={20} />}
          label="Issues"
          value={warningWorkflows + criticalWorkflows}
          subtitle={`${criticalWorkflows} critical`}
          color={criticalWorkflows > 0 ? "red" : warningWorkflows > 0 ? "yellow" : "green"}
        />
      </div>

      {/* Quick Health Summary */}
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
          <HealthRow
            label="Static Tables"
            status="healthy"
            detail={`${health?.staticTables ?? 0} configuration tables`}
          />
        </div>
      </div>

      {/* Recent Issues */}
      {(warningWorkflows > 0 || criticalWorkflows > 0) && (
        <div className="bg-zinc-900 rounded-lg p-4">
          <h3 className="text-sm font-medium text-zinc-300 mb-3">Recent Issues</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {workflows?.workflows
              .filter((w) => w.health.status.level === "critical" || w.health.status.level === "warning")
              .slice(0, 10)
              .map((workflow) => (
                <div
                  key={workflow.id}
                  className="flex items-start gap-2 text-sm"
                >
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

// Stat card component
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
      <p className="text-xs text-zinc-500 mt-1">{subtitle}</p>
    </div>
  );
}

// Health row component
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
