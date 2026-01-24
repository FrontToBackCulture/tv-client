// src/modules/library/DomainLineage.tsx
// Lineage view showing table dependencies and workflow relationships

import { useState, useMemo } from "react";
import {
  GitBranch,
  Database,
  Workflow,
  Search,
  ChevronRight,
  ChevronDown,
  FolderOpen,
} from "lucide-react";
import { useDomainData, TableHealth } from "../../hooks/useDomainData";
import { ViewerLayout, ViewerTab, DataSourcesTab } from "./ViewerLayout";
import { cn } from "../../lib/cn";

interface DomainLineageProps {
  domainPath: string;
  domainName: string;
}

type TabType = "lineage" | "sources";

export function DomainLineage({ domainPath, domainName }: DomainLineageProps) {
  const { health, loading, error } = useDomainData(domainPath);
  const [activeTab, setActiveTab] = useState<TabType>("lineage");
  const [search, setSearch] = useState("");
  const [selectedTable, setSelectedTable] = useState<TableHealth | null>(null);

  // Filter tables with dependencies
  const tablesWithDeps = health?.tables.filter((t) => t.dependencies.length > 0) ?? [];

  // Define tabs
  const tabs: ViewerTab[] = useMemo(
    () => [
      {
        id: "lineage",
        label: "Lineage",
        icon: <GitBranch size={14} />,
        count: tablesWithDeps.length,
      },
      {
        id: "sources",
        label: "Data Sources",
        icon: <FolderOpen size={14} />,
      },
    ],
    [tablesWithDeps.length]
  );

  // Data sources for this viewer
  const dataSources = useMemo(
    () => [
      {
        name: "Data Model Health",
        path: `${domainPath}/health-check-results.json`,
        description: "Table freshness, dependencies, and row counts",
      },
    ],
    [domainPath]
  );

  // Search filter actions
  const filtersUI = activeTab === "lineage" && (
    <div className="relative">
      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
      <input
        type="text"
        placeholder="Search tables..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-48 bg-zinc-800 border border-zinc-700 rounded pl-8 pr-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-teal-500"
      />
    </div>
  );

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-pulse text-zinc-500">Loading lineage data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-red-400 flex items-center gap-2">
          <GitBranch size={16} />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!health) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500">
        No lineage data available. Run health check with dependency scanning enabled.
      </div>
    );
  }

  // Filter by search
  const filteredTables = tablesWithDeps.filter(
    (t) =>
      t.displayName.toLowerCase().includes(search.toLowerCase()) ||
      t.tableName.toLowerCase().includes(search.toLowerCase())
  );

  // Group tables by space/zone
  const groupedBySpace = groupTablesBySpace(filteredTables);

  return (
    <ViewerLayout
      title={`${domainName} Lineage`}
      subtitle="Table dependencies and workflow relationships"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as TabType)}
      actions={filtersUI}
    >
      {activeTab === "lineage" && (
        <div className="h-full flex">
          {/* Table list */}
          <div className="w-80 border-r border-zinc-800 flex flex-col overflow-hidden">
            <div className="px-4 py-2 border-b border-zinc-800 text-xs text-zinc-500">
              {tablesWithDeps.length} tables with dependencies
            </div>

            {/* Table list */}
            <div className="flex-1 overflow-y-auto">
              {Object.entries(groupedBySpace).map(([space, tables]) => (
                <SpaceGroup
                  key={space}
                  space={space}
                  tables={tables}
                  selectedTable={selectedTable}
                  onSelectTable={setSelectedTable}
                />
              ))}
            </div>
          </div>

          {/* Dependency detail */}
          <div className="flex-1 overflow-y-auto">
            {selectedTable ? (
              <TableDependencyDetail table={selectedTable} />
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-500">
                <div className="text-center">
                  <GitBranch size={32} className="mx-auto mb-2 opacity-50" />
                  <p>Select a table to view its dependencies</p>
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

// Group tables by space
function groupTablesBySpace(tables: TableHealth[]): Record<string, TableHealth[]> {
  const groups: Record<string, TableHealth[]> = {};

  for (const table of tables) {
    const space = table.space || "Other";
    if (!groups[space]) {
      groups[space] = [];
    }
    groups[space].push(table);
  }

  return groups;
}

// Space group component
function SpaceGroup({
  space,
  tables,
  selectedTable,
  onSelectTable,
}: {
  space: string;
  tables: TableHealth[];
  selectedTable: TableHealth | null;
  onSelectTable: (table: TableHealth) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-800/50"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {space}
        <span className="text-zinc-600">({tables.length})</span>
      </button>

      {expanded && (
        <div>
          {tables.map((table) => (
            <button
              key={table.id}
              onClick={() => onSelectTable(table)}
              className={cn(
                "w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-zinc-800/50",
                selectedTable?.id === table.id
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-300"
              )}
            >
              <Database size={14} className="text-zinc-500 flex-shrink-0" />
              <span className="truncate">{table.displayName}</span>
              <span className="ml-auto text-xs text-zinc-600">
                {table.dependencies.length}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Table dependency detail
function TableDependencyDetail({ table }: { table: TableHealth }) {
  // Group dependencies by type
  const workflows = table.dependencies.filter((d) => d.type === "workflow");
  const queries = table.dependencies.filter((d) => d.type === "query");
  const dashboards = table.dependencies.filter((d) => d.type === "dashboard");

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
          <Database size={14} />
          {table.space} &gt; {table.zone}
        </div>
        <h3 className="text-xl font-semibold text-zinc-100">{table.displayName}</h3>
        <p className="text-sm text-zinc-500 font-mono mt-1">{table.tableName}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatBox label="Workflows" count={workflows.length} icon={<Workflow size={16} />} />
        <StatBox label="Queries" count={queries.length} icon={<Database size={16} />} />
        <StatBox label="Dashboards" count={dashboards.length} icon={<GitBranch size={16} />} />
      </div>

      {/* Dependency lists */}
      {workflows.length > 0 && (
        <DependencySection title="Workflows" items={workflows} />
      )}
      {queries.length > 0 && (
        <DependencySection title="Queries" items={queries} />
      )}
      {dashboards.length > 0 && (
        <DependencySection title="Dashboards" items={dashboards} />
      )}

      {table.dependencies.length === 0 && (
        <div className="text-center text-zinc-500 py-8">
          No dependencies found for this table
        </div>
      )}
    </div>
  );
}

// Stat box
function StatBox({
  label,
  count,
  icon,
}: {
  label: string;
  count: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-zinc-900 rounded-lg p-4">
      <div className="flex items-center gap-2 text-zinc-400 mb-2">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-zinc-100">{count}</p>
    </div>
  );
}

// Dependency section
function DependencySection({
  title,
  items,
}: {
  title: string;
  items: Array<{ type: string; id: string; name: string }>;
}) {
  return (
    <div className="mb-6">
      <h4 className="text-sm font-medium text-zinc-300 mb-3">{title}</h4>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="bg-zinc-900 rounded-lg px-3 py-2 flex items-center gap-2"
          >
            <Workflow size={14} className="text-zinc-500" />
            <span className="text-sm text-zinc-300 truncate">{item.name}</span>
            <span className="ml-auto text-xs text-zinc-600">#{item.id}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
