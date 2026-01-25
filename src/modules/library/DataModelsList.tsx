// src/modules/library/DataModelsList.tsx
// List view for data_models folder showing all tables with health status

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Database, Search, AlertTriangle, CheckCircle, Clock, ChevronRight } from "lucide-react";

interface DataModelsListProps {
  dataModelsPath: string;
  domainName: string;
  onTableSelect?: (tablePath: string, tableName: string) => void;
}

interface TableEntry {
  id: string;
  tableName: string;
  displayName: string;
  space?: string;
  zone?: string;
  path: string;
  hasDetails: boolean;
  hasAnalysis: boolean;
  hasSample: boolean;
  freshnessStatus?: "fresh" | "stale" | "unknown";
  lastUpdated?: string;
}

interface HealthData {
  tables?: Array<{
    id: string;
    tableName: string;
    displayName: string;
    space?: string;
    zone?: string;
    freshnessStatus?: string;
    lastDataDate?: string;
  }>;
}

export function DataModelsList({ dataModelsPath, domainName, onTableSelect }: DataModelsListProps) {
  const [tables, setTables] = useState<TableEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "fresh" | "stale">("all");

  useEffect(() => {
    async function loadTables() {
      setLoading(true);
      setError(null);

      try {
        // List table directories
        const entries = await invoke<Array<{ name: string; path: string; is_dir: boolean }>>(
          "list_directory",
          { path: dataModelsPath }
        );

        const tableDirs = entries.filter(
          (e) => e.is_dir && e.name.startsWith("table_")
        );

        // Try to load health data for status info
        let healthData: HealthData | null = null;
        try {
          const domainPath = dataModelsPath.replace(/\/data_models$/, "");
          const healthPath = `${domainPath}/data-model-health.json`;
          const healthContent = await invoke<string>("read_file", { path: healthPath });
          healthData = JSON.parse(healthContent);
        } catch {
          // Health data not available
        }

        // Build table entries
        const tableEntries: TableEntry[] = await Promise.all(
          tableDirs.map(async (dir) => {
            const tablePath = dir.path;
            const tableName = dir.name.replace(/^table_/, "");

            // Check what files exist
            let hasDetails = false;
            let hasAnalysis = false;
            let hasSample = false;
            let displayName = tableName;
            let space: string | undefined;
            let zone: string | undefined;

            try {
              const detailsContent = await invoke<string>("read_file", {
                path: `${tablePath}/definition_details.json`,
              });
              const details = JSON.parse(detailsContent);
              hasDetails = true;
              displayName = details.displayName || tableName;
              space = details.space;
              zone = details.zone;
            } catch {
              // Try definition.json as fallback
              try {
                const defContent = await invoke<string>("read_file", {
                  path: `${tablePath}/definition.json`,
                });
                const def = JSON.parse(defContent);
                displayName = def.displayName || tableName;
                space = def.space;
                zone = def.zone;
              } catch {
                // No definition files
              }
            }

            try {
              await invoke<string>("read_file", {
                path: `${tablePath}/definition_analysis.json`,
              });
              hasAnalysis = true;
            } catch {
              // No analysis
            }

            try {
              await invoke<string>("read_file", {
                path: `${tablePath}/definition_sample.json`,
              });
              hasSample = true;
            } catch {
              // No sample
            }

            // Find health status from health data
            let freshnessStatus: "fresh" | "stale" | "unknown" = "unknown";
            let lastUpdated: string | undefined;
            if (healthData?.tables) {
              const healthEntry = healthData.tables.find(
                (t) => t.tableName === tableName || t.id === tableName
              );
              if (healthEntry) {
                freshnessStatus = healthEntry.freshnessStatus === "fresh" ? "fresh" :
                                  healthEntry.freshnessStatus === "stale" ? "stale" : "unknown";
                lastUpdated = healthEntry.lastDataDate;
              }
            }

            return {
              id: tableName,
              tableName,
              displayName,
              space,
              zone,
              path: tablePath,
              hasDetails,
              hasAnalysis,
              hasSample,
              freshnessStatus,
              lastUpdated,
            };
          })
        );

        // Sort by display name
        tableEntries.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setTables(tableEntries);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load tables");
      } finally {
        setLoading(false);
      }
    }

    if (dataModelsPath) {
      loadTables();
    }
  }, [dataModelsPath]);

  // Filter tables
  const filteredTables = tables.filter((table) => {
    const matchesSearch =
      table.displayName.toLowerCase().includes(search.toLowerCase()) ||
      table.tableName.toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      filterStatus === "all" ||
      (filterStatus === "fresh" && table.freshnessStatus === "fresh") ||
      (filterStatus === "stale" && table.freshnessStatus === "stale");
    return matchesSearch && matchesFilter;
  });

  // Group by space
  const groupedBySpace = groupTablesBySpace(filteredTables);

  // Stats
  const freshCount = tables.filter((t) => t.freshnessStatus === "fresh").length;
  const staleCount = tables.filter((t) => t.freshnessStatus === "stale").length;

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-pulse text-zinc-500">Loading tables...</div>
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
          <Database size={14} />
          <span>{domainName}</span>
        </div>
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Data Models</h2>
        <p className="text-sm text-zinc-500 mt-1">{tables.length} tables</p>

        {/* Stats */}
        <div className="flex gap-4 mt-4">
          <div className="flex items-center gap-1.5 text-sm">
            <CheckCircle size={14} className="text-green-500 dark:text-green-400" />
            <span className="text-zinc-500 dark:text-zinc-400">{freshCount} fresh</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <AlertTriangle size={14} className="text-amber-500 dark:text-amber-400" />
            <span className="text-zinc-500 dark:text-zinc-400">{staleCount} stale</span>
          </div>
        </div>

        {/* Search and filter */}
        <div className="flex gap-2 mt-4">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search tables..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded pl-8 pr-3 py-1.5 text-sm text-zinc-800 dark:text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-teal-500"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as "all" | "fresh" | "stale")}
            className="bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-teal-500"
          >
            <option value="all">All</option>
            <option value="fresh">Fresh</option>
            <option value="stale">Stale</option>
          </select>
        </div>
      </div>

      {/* Table list */}
      <div className="flex-1 overflow-y-auto">
        {Object.entries(groupedBySpace).map(([space, spaceTables]) => (
          <div key={space}>
            <div className="px-4 py-2 text-xs font-medium text-zinc-500 bg-slate-100 dark:bg-zinc-900/50 sticky top-0">
              {space} ({spaceTables.length})
            </div>
            {spaceTables.map((table) => (
              <button
                key={table.id}
                onClick={() => onTableSelect?.(table.path, table.tableName)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-100 dark:hover:bg-zinc-800/50 border-b border-slate-100 dark:border-zinc-800/50 text-left"
              >
                <StatusIcon status={table.freshnessStatus} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-zinc-800 dark:text-zinc-200 truncate">{table.displayName}</div>
                  <div className="text-xs text-zinc-500 font-mono truncate">{table.tableName}</div>
                </div>
                <div className="flex items-center gap-2">
                  {table.hasAnalysis && (
                    <span className="text-xs text-teal-600 dark:text-teal-400 bg-teal-500/10 px-1.5 py-0.5 rounded">
                      AI
                    </span>
                  )}
                  {table.lastUpdated && (
                    <span className="text-xs text-zinc-500">{table.lastUpdated}</span>
                  )}
                  <ChevronRight size={14} className="text-zinc-400 dark:text-zinc-600" />
                </div>
              </button>
            ))}
          </div>
        ))}

        {filteredTables.length === 0 && (
          <div className="p-8 text-center text-zinc-500">
            {search ? "No tables match your search" : "No tables found"}
          </div>
        )}
      </div>
    </div>
  );
}

// Group tables by space
function groupTablesBySpace(tables: TableEntry[]): Record<string, TableEntry[]> {
  const groups: Record<string, TableEntry[]> = {};

  for (const table of tables) {
    const space = table.space || "Other";
    if (!groups[space]) {
      groups[space] = [];
    }
    groups[space].push(table);
  }

  return groups;
}

// Status icon component
function StatusIcon({ status }: { status?: "fresh" | "stale" | "unknown" }) {
  switch (status) {
    case "fresh":
      return <CheckCircle size={16} className="text-green-400 flex-shrink-0" />;
    case "stale":
      return <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />;
    default:
      return <Clock size={16} className="text-zinc-500 flex-shrink-0" />;
  }
}
