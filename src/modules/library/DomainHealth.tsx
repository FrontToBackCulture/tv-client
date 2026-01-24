// src/modules/library/DomainHealth.tsx
// Detailed health view for tables and workflows

import { useState } from "react";
import { AlertTriangle, CheckCircle, AlertCircle, MinusCircle, Search } from "lucide-react";
import { useDomainData, TableHealth, WorkflowHealth } from "../../hooks/useDomainData";
import { cn } from "../../lib/cn";

interface DomainHealthProps {
  domainPath: string;
  domainName: string;
}

type TabType = "tables" | "workflows";
type FilterType = "all" | "healthy" | "warning" | "critical";

export function DomainHealth({ domainPath, domainName }: DomainHealthProps) {
  const { health, workflows, loading, error } = useDomainData(domainPath);
  const [activeTab, setActiveTab] = useState<TabType>("workflows");
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

  // Filter workflows
  const filteredWorkflows = workflows?.workflows.filter((w) => {
    // Search filter
    if (search && !w.name.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    // Status filter
    if (filter === "all") return true;
    if (filter === "healthy") return w.health.status.level === "healthy";
    if (filter === "warning") return w.health.status.level === "warning";
    if (filter === "critical") return w.health.status.level === "critical";
    return true;
  }) ?? [];

  // Filter tables
  const filteredTables = health?.tables.filter((t) => {
    // Search filter
    if (search && !t.displayName.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    // Status filter based on freshness
    if (filter === "all") return true;
    const days = t.freshness.daysSinceUpdate;
    if (filter === "healthy") return days === null || days <= 3;
    if (filter === "warning") return days !== null && days > 3 && days <= 7;
    if (filter === "critical") return days !== null && days > 7;
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
            active={activeTab === "workflows"}
            onClick={() => setActiveTab("workflows")}
            count={workflows?.workflows.length ?? 0}
          >
            Workflows
          </TabButton>
          <TabButton
            active={activeTab === "tables"}
            onClick={() => setActiveTab("tables")}
            count={health?.tables.length ?? 0}
          >
            Tables
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
        {activeTab === "workflows" ? (
          <WorkflowList workflows={filteredWorkflows} />
        ) : (
          <TableList tables={filteredTables} />
        )}
      </div>
    </div>
  );
}

// Tab button
function TabButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 text-sm rounded-md transition-colors",
        active
          ? "bg-zinc-700 text-zinc-100"
          : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
      )}
    >
      {children}
      <span className="ml-1.5 text-xs text-zinc-500">({count})</span>
    </button>
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
  const statusIcon = {
    healthy: <CheckCircle size={16} className="text-green-400" />,
    warning: <AlertCircle size={16} className="text-yellow-400" />,
    critical: <AlertTriangle size={16} className="text-red-400" />,
    skipped: <MinusCircle size={16} className="text-zinc-500" />,
  };

  return (
    <div className="bg-zinc-900 rounded-lg p-3">
      <div className="flex items-start gap-2">
        <div className="mt-0.5">
          {statusIcon[workflow.health.status.level]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-200 font-medium truncate">{workflow.name}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{workflow.health.status.description}</p>

          {/* Stats row */}
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

          {/* Issues */}
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

  const statusIcon = {
    healthy: <CheckCircle size={16} className="text-green-400" />,
    warning: <AlertCircle size={16} className="text-yellow-400" />,
    critical: <AlertTriangle size={16} className="text-red-400" />,
    skipped: <MinusCircle size={16} className="text-zinc-500" />,
  };

  return (
    <div className="bg-zinc-900 rounded-lg p-3">
      <div className="flex items-start gap-2">
        <div className="mt-0.5">{statusIcon[status]}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-200 font-medium truncate">{table.displayName}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{table.path}</p>

          {/* Stats row */}
          <div className="flex gap-4 mt-2 text-xs text-zinc-400">
            <span>Rows: {table.stats.rowCount}</span>
            <span>Type: {table.tableType}</span>
            {days !== null && (
              <span className={days > 7 ? "text-red-400" : days > 3 ? "text-yellow-400" : ""}>
                Updated: {days}d ago
              </span>
            )}
          </div>

          {/* Dependencies */}
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
