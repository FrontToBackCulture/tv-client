// src/modules/library/DomainHealth.tsx
// Detailed health view for data models, workflows, dashboards, and queries

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  MinusCircle,
  Search,
  Database,
  Clock,
  LayoutDashboard,
  FileSearch,
} from "lucide-react";
import {
  useDomainData,
  TableHealth,
  WorkflowHealth,
  DashboardHealth,
  QueryHealth,
} from "../../hooks/useDomainData";
import { cn } from "../../lib/cn";

interface DomainHealthProps {
  domainPath: string;
  domainName: string;
}

type TabType = "data-model" | "workflows" | "dashboards" | "queries";
type FilterType = "all" | "healthy" | "warning" | "critical";

export function DomainHealth({ domainPath, domainName }: DomainHealthProps) {
  const { health, workflows, dashboards, queries, loading, error } = useDomainData(domainPath);
  const [activeTab, setActiveTab] = useState<TabType>("data-model");
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-pulse text-zinc-500">Loading health data...</div>
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

  // Filter tables
  const filteredTables = health?.tables.filter((t) => {
    if (search && !t.displayName.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (filter === "all") return true;
    const days = t.freshness.daysSinceUpdate;
    if (filter === "healthy") return days === null || days <= 3;
    if (filter === "warning") return days !== null && days > 3 && days <= 7;
    if (filter === "critical") return days !== null && days > 7;
    return true;
  }) ?? [];

  // Filter workflows
  const filteredWorkflows = workflows?.workflows.filter((w) => {
    if (search && !w.name.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (filter === "all") return true;
    if (filter === "healthy") return w.health.status.level === "healthy";
    if (filter === "warning") return w.health.status.level === "warning";
    if (filter === "critical") return w.health.status.level === "critical" || w.health.status.level === "skipped";
    return true;
  }) ?? [];

  // Filter dashboards
  const filteredDashboards = dashboards?.dashboards.filter((d) => {
    if (search && !d.name.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (filter === "all") return true;
    const level = d.health.status.level;
    if (filter === "healthy") return level === "critical" || level === "active"; // critical = essential/highly used
    if (filter === "warning") return level === "occasional" || level === "attention";
    if (filter === "critical") return level === "declining" || level === "unused";
    return true;
  }) ?? [];

  // Filter queries
  const filteredQueries = queries?.queries.filter((q) => {
    if (search && !q.name.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (filter === "all") return true;
    const level = q.health.status.level;
    if (filter === "healthy") return level === "essential" || level === "active";
    if (filter === "warning") return level === "at_risk";
    if (filter === "critical") return level === "orphaned" || level === "standalone";
    return true;
  }) ?? [];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800">
        <h2 className="text-lg font-semibold text-zinc-100">{domainName} Health</h2>

        {/* Tabs */}
        <div className="flex gap-1 mt-3">
          <TabButton
            active={activeTab === "data-model"}
            onClick={() => setActiveTab("data-model")}
            count={health?.tables.length ?? 0}
            icon={<Database size={14} />}
          >
            Data Model
          </TabButton>
          <TabButton
            active={activeTab === "workflows"}
            onClick={() => setActiveTab("workflows")}
            count={workflows?.workflows.length ?? 0}
            icon={<Clock size={14} />}
          >
            Workflows
          </TabButton>
          <TabButton
            active={activeTab === "dashboards"}
            onClick={() => setActiveTab("dashboards")}
            count={dashboards?.dashboards.length ?? 0}
            icon={<LayoutDashboard size={14} />}
          >
            Dashboards
          </TabButton>
          <TabButton
            active={activeTab === "queries"}
            onClick={() => setActiveTab("queries")}
            count={queries?.queries.length ?? 0}
            icon={<FileSearch size={14} />}
          >
            Queries
          </TabButton>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mt-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded pl-8 pr-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-teal-500"
            />
          </div>

          {/* Status filter */}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterType)}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-teal-500"
          >
            <option value="all">All</option>
            <option value="healthy">Healthy</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "data-model" && <TableList tables={filteredTables} />}
        {activeTab === "workflows" && <WorkflowList workflows={filteredWorkflows} />}
        {activeTab === "dashboards" && <DashboardList dashboards={filteredDashboards} />}
        {activeTab === "queries" && <QueryList queries={filteredQueries} />}
      </div>
    </div>
  );
}

// Tab button
function TabButton({
  active,
  onClick,
  count,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors",
        active
          ? "bg-zinc-700 text-zinc-100"
          : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
      )}
    >
      {icon}
      {children}
      <span className="ml-1 text-xs text-zinc-500">({count})</span>
    </button>
  );
}

// Status icon helper
function getStatusIcon(level: string) {
  switch (level) {
    case "healthy":
    case "critical": // Dashboard "critical" = essential/highly used
    case "essential":
    case "active":
      return <CheckCircle size={16} className="text-green-400" />;
    case "warning":
    case "occasional":
    case "attention":
    case "at_risk":
      return <AlertCircle size={16} className="text-yellow-400" />;
    case "stale":
    case "declining":
    case "orphaned":
      return <AlertTriangle size={16} className="text-red-400" />;
    case "skipped":
    case "unused":
    case "standalone":
    default:
      return <MinusCircle size={16} className="text-zinc-500" />;
  }
}

// Table list
function TableList({ tables }: { tables: TableHealth[] }) {
  if (tables.length === 0) {
    return (
      <div className="text-center text-zinc-500 py-8">
        No tables match the current filter
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tables.map((table) => (
        <TableCard key={table.id} table={table} />
      ))}
    </div>
  );
}

// Table card
function TableCard({ table }: { table: TableHealth }) {
  const days = table.freshness.daysSinceUpdate;
  const status =
    days === null
      ? "skipped"
      : days <= 3
        ? "healthy"
        : days <= 7
          ? "warning"
          : "critical";

  return (
    <div className="bg-zinc-900 rounded-lg p-3">
      <div className="flex items-start gap-2">
        <div className="mt-0.5">{getStatusIcon(status)}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-200 font-medium truncate">{table.displayName}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{table.path}</p>

          <div className="flex gap-4 mt-2 text-xs text-zinc-400">
            <span>Rows: {table.stats.rowCount}</span>
            <span>Type: {table.tableType}</span>
            {days !== null && (
              <span className={days > 7 ? "text-red-400" : days > 3 ? "text-yellow-400" : ""}>
                Updated: {days}d ago
              </span>
            )}
          </div>

          {table.dependencies.length > 0 && (
            <p className="text-xs text-zinc-500 mt-1">
              Used by {table.dependencies.length} workflow(s)
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Workflow list
function WorkflowList({ workflows }: { workflows: WorkflowHealth[] }) {
  if (workflows.length === 0) {
    return (
      <div className="text-center text-zinc-500 py-8">
        No workflows match the current filter
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {workflows.map((workflow) => (
        <WorkflowCard key={workflow.id} workflow={workflow} />
      ))}
    </div>
  );
}

// Workflow card
function WorkflowCard({ workflow }: { workflow: WorkflowHealth }) {
  return (
    <div className="bg-zinc-900 rounded-lg p-3">
      <div className="flex items-start gap-2">
        <div className="mt-0.5">
          {getStatusIcon(workflow.health.status.level)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-200 font-medium truncate">{workflow.name}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{workflow.health.status.description}</p>

          <div className="flex gap-4 mt-2 text-xs text-zinc-400">
            <span>
              Runs: {workflow.successfulExecutions}/{workflow.totalExecutions}
            </span>
            {workflow.lastRun && (
              <span>
                Last: {new Date(workflow.lastRun.date).toLocaleDateString()}
              </span>
            )}
            {workflow.cronExpression && (
              <span className="text-zinc-500">
                Cron: {workflow.cronExpression}
              </span>
            )}
          </div>

          {workflow.health.issues.length > 0 && (
            <div className="mt-2 space-y-1">
              {workflow.health.issues.map((issue, i) => (
                <p key={i} className="text-xs text-yellow-400/80">
                  • {issue}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Dashboard list
function DashboardList({ dashboards }: { dashboards: DashboardHealth[] }) {
  if (dashboards.length === 0) {
    return (
      <div className="text-center text-zinc-500 py-8">
        No dashboards match the current filter
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {dashboards.map((dashboard) => (
        <DashboardCard key={dashboard.id} dashboard={dashboard} />
      ))}
    </div>
  );
}

// Dashboard card
function DashboardCard({ dashboard }: { dashboard: DashboardHealth }) {
  return (
    <div className="bg-zinc-900 rounded-lg p-3">
      <div className="flex items-start gap-2">
        <div className="mt-0.5">
          {getStatusIcon(dashboard.health.status.level)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-200 font-medium truncate">{dashboard.name}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{dashboard.health.status.description}</p>

          <div className="flex gap-4 mt-2 text-xs text-zinc-400">
            <span>Category: {dashboard.category}</span>
            <span>Sessions: {dashboard.metrics.totalSessions}</span>
            <span>Users: {dashboard.metrics.uniqueUsers}</span>
            {dashboard.metrics.lastSession && (
              <span>
                Last: {new Date(dashboard.metrics.lastSession).toLocaleDateString()}
              </span>
            )}
          </div>

          {dashboard.health.issues.length > 0 && (
            <div className="mt-2 space-y-1">
              {dashboard.health.issues.map((issue, i) => (
                <p key={i} className="text-xs text-yellow-400/80">
                  • {issue}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Query list
function QueryList({ queries }: { queries: QueryHealth[] }) {
  if (queries.length === 0) {
    return (
      <div className="text-center text-zinc-500 py-8">
        No queries match the current filter
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {queries.map((query) => (
        <QueryCard key={query.id} query={query} />
      ))}
    </div>
  );
}

// Query card
function QueryCard({ query }: { query: QueryHealth }) {
  return (
    <div className="bg-zinc-900 rounded-lg p-3">
      <div className="flex items-start gap-2">
        <div className="mt-0.5">
          {getStatusIcon(query.health.status.level)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-200 font-medium truncate">{query.name}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{query.health.status.description}</p>

          <div className="flex gap-4 mt-2 text-xs text-zinc-400">
            <span>ID: {query.id}</span>
            <span>Dashboards: {query.dashboardCount}</span>
            {query.dashboards.length > 0 && (
              <span className="truncate">
                In: {query.dashboards.map(d => d.name).join(", ")}
              </span>
            )}
          </div>

          {query.health.issues.length > 0 && (
            <div className="mt-2 space-y-1">
              {query.health.issues.map((issue, i) => (
                <p key={i} className="text-xs text-yellow-400/80">
                  • {issue}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
