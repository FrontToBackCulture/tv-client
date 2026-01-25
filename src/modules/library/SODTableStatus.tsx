// src/modules/library/SODTableStatus.tsx
// SOD (Start of Day) Table Status viewer showing table calculation status

import { useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import {
  Database,
  AlertCircle,
  Loader2,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Search,
  FolderOpen,
  BarChart3,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { ViewerLayout, ViewerTab, DataSourcesTab } from "./ViewerLayout";

interface FileEntry {
  name: string;
  path: string;
  is_directory: boolean;
  size: number;
  modified: string | null;
}

interface SODTableEntry {
  table_name: string;
  table_id: string;
  status: string;
  queued: string;
  started: string | null;
  completed: string | null;
  errored: string | null;
  error_message: string | null;
}

interface SODTableFile {
  data: SODTableEntry[];
}

interface DomainSODData {
  domain: string;
  date: string;
  tables: SODTableEntry[];
  summary: {
    total: number;
    completed: number;
    pending: number;
    started: number;
    errored: number;
  };
}

interface SODTableStatusProps {
  basePath: string;
}

type TabType = "report" | "sources";

function formatTime(timestamp: string | null): string {
  if (!timestamp) return "-";
  try {
    // Format: "2025-12-14 03:20:47" or ISO format
    const parts = timestamp.split(" ");
    if (parts.length === 2) {
      const timeParts = parts[1].split(":");
      if (timeParts.length >= 2) {
        return `${timeParts[0]}:${timeParts[1]}`;
      }
    }
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "-";
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function StatusBadge({ status }: { status: string }) {
  const lowerStatus = status.toLowerCase();

  if (lowerStatus === "completed") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
        <CheckCircle size={12} />
        Completed
      </span>
    );
  }

  if (lowerStatus === "started") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400">
        <Loader2 size={12} className="animate-spin" />
        In Progress
      </span>
    );
  }

  if (lowerStatus === "errored") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
        <XCircle size={12} />
        Errored
      </span>
    );
  }

  // Pending
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
      <Clock size={12} />
      Pending
    </span>
  );
}

export function SODTableStatus({ basePath }: SODTableStatusProps) {
  const [selectedDomain, setSelectedDomain] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentDate, setCurrentDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [activeTab, setActiveTab] = useState<TabType>("report");

  // Determine the production path
  // Handle both domain-root (/production) and single domain (/production/abaavo) paths
  const productionPath = useMemo(() => {
    if (basePath.endsWith("/production")) {
      // Already at production root
      return basePath;
    }
    // Check if we're inside a domain folder under production
    const productionIndex = basePath.indexOf("/production/");
    if (productionIndex !== -1) {
      // Extract path up to and including /production
      return basePath.substring(0, productionIndex + "/production".length);
    }
    // Fallback: append /production
    return `${basePath}/production`;
  }, [basePath]);

  // Load SOD status data from all domains
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["sod-status", productionPath, currentDate],
    queryFn: async () => {
      // List all domains
      const entries = await invoke<FileEntry[]>("list_directory", { path: productionPath });

      const domainData: DomainSODData[] = [];

      for (const entry of entries) {
        // Only process directories, skip _ prefixed
        if (!entry.is_directory || entry.name.startsWith("_")) continue;

        // Check for SOD status file for the selected date
        const sodFilePath = `${productionPath}/${entry.name}/monitoring/${currentDate}/sod_tables_status_${currentDate}.json`;

        try {
          const content = await invoke<string>("read_file", { path: sodFilePath });
          const parsed: SODTableFile = JSON.parse(content);

          if (parsed.data && Array.isArray(parsed.data) && parsed.data.length > 0) {
            // Calculate summary
            const tables = parsed.data;
            const summary = {
              total: tables.length,
              completed: tables.filter((t) => t.status.toLowerCase() === "completed").length,
              pending: tables.filter((t) =>
                t.status.toLowerCase() === "pending" ||
                t.status.toLowerCase() === "pending sod"
              ).length,
              started: tables.filter((t) => t.status.toLowerCase() === "started").length,
              errored: tables.filter((t) => t.status.toLowerCase() === "errored").length,
            };

            domainData.push({
              domain: entry.name,
              date: currentDate,
              tables,
              summary,
            });
          }
        } catch (err) {
          // Domain might not have SOD data for this date, skip silently
          console.log(`Skipping ${entry.name}: no SOD data for ${currentDate}`);
        }
      }

      // Sort by domain name
      domainData.sort((a, b) => a.domain.localeCompare(b.domain));

      return {
        generatedAt: new Date().toISOString(),
        date: currentDate,
        domains: domainData,
      };
    },
  });

  // Date navigation
  const goToPreviousDay = () => {
    const current = new Date(currentDate);
    current.setDate(current.getDate() - 1);
    setCurrentDate(current.toISOString().split("T")[0]);
  };

  const goToNextDay = () => {
    const current = new Date(currentDate);
    current.setDate(current.getDate() + 1);
    setCurrentDate(current.toISOString().split("T")[0]);
  };

  const goToToday = () => {
    setCurrentDate(new Date().toISOString().split("T")[0]);
  };

  const isToday = currentDate === new Date().toISOString().split("T")[0];

  // Calculate totals across all domains
  const totals = useMemo(() => {
    if (!data) return { total: 0, completed: 0, pending: 0, started: 0, errored: 0 };

    return data.domains.reduce(
      (acc, d) => ({
        total: acc.total + d.summary.total,
        completed: acc.completed + d.summary.completed,
        pending: acc.pending + d.summary.pending,
        started: acc.started + d.summary.started,
        errored: acc.errored + d.summary.errored,
      }),
      { total: 0, completed: 0, pending: 0, started: 0, errored: 0 }
    );
  }, [data]);

  // Filtered tables
  const filteredTables = useMemo(() => {
    if (!data) return [];

    let tables: (SODTableEntry & { domain: string })[] = [];

    for (const d of data.domains) {
      if (selectedDomain !== "all" && d.domain !== selectedDomain) continue;

      for (const t of d.tables) {
        tables.push({ ...t, domain: d.domain });
      }
    }

    // Status filter
    if (filterStatus !== "all") {
      tables = tables.filter((t) => {
        const s = t.status.toLowerCase();
        if (filterStatus === "completed") return s === "completed";
        if (filterStatus === "pending") return s === "pending" || s === "pending sod";
        if (filterStatus === "started") return s === "started";
        if (filterStatus === "errored") return s === "errored";
        return true;
      });
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      tables = tables.filter(
        (t) =>
          t.table_name.toLowerCase().includes(query) ||
          t.table_id.toLowerCase().includes(query)
      );
    }

    return tables;
  }, [data, selectedDomain, filterStatus, searchQuery]);

  // Define tabs
  const tabs: ViewerTab[] = useMemo(
    () => [
      {
        id: "report",
        label: "Report",
        icon: <BarChart3 size={14} />,
        count: totals.total,
      },
      {
        id: "sources",
        label: "Data Sources",
        icon: <FolderOpen size={14} />,
      },
    ],
    [totals.total]
  );

  // Data sources for the shared DataSourcesTab
  const dataSources = useMemo(() => {
    if (!data) return [];
    return data.domains.map((d) => ({
      name: d.domain,
      path: `${productionPath}/${d.domain}/monitoring/${currentDate}/sod_tables_status_${currentDate}.json`,
      description: `${d.summary.completed}/${d.tables.length} tables completed`,
    }));
  }, [data, productionPath, currentDate]);

  // Actions for header
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
          <p className="text-sm text-zinc-500">Loading SOD status...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={32} className="mx-auto mb-3 text-red-500" />
          <p className="text-sm text-red-500 dark:text-red-400">Failed to load SOD status</p>
          <p className="text-xs text-zinc-600 dark:text-zinc-500 mt-1">
            Could not read domain folders
          </p>
          <code className="text-xs text-zinc-500 dark:text-zinc-600 mt-2 block">{productionPath}</code>
        </div>
      </div>
    );
  }

  const hasData = data && data.domains.length > 0;

  return (
    <ViewerLayout
      title="SOD Table Status"
      subtitle="Start of Day table calculation status"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as TabType)}
      actions={headerActions}
    >
      {activeTab === "sources" && (
        <DataSourcesTab sources={dataSources} basePath={productionPath} />
      )}

      {activeTab === "report" && (
        <div className="h-full overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto">
            {/* Date Navigator */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center gap-1 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-2 py-1">
                <button
                  onClick={goToPreviousDay}
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded transition-colors"
                  title="Previous day"
                >
                  <ChevronLeft size={16} className="text-zinc-500 dark:text-zinc-400" />
                </button>
                <div className="flex items-center gap-2 px-3">
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 min-w-[100px] text-center">
                    {formatDate(currentDate)}
                  </span>
                  {isToday && (
                    <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded">
                      Today
                    </span>
                  )}
                </div>
                <button
                  onClick={goToNextDay}
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded transition-colors"
                  title="Next day"
                >
                  <ChevronRight size={16} className="text-zinc-500 dark:text-zinc-400" />
                </button>
              </div>
              {!isToday && (
                <button
                  onClick={goToToday}
                  className="px-3 py-1.5 text-sm font-medium text-teal-600 dark:text-teal-400 hover:bg-teal-500/10 dark:hover:bg-teal-500/10 rounded-lg transition-colors"
                >
                  Today
                </button>
              )}
            </div>

            {!hasData ? (
              <div className="text-center py-12 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800">
                <Database size={32} className="mx-auto mb-3 text-zinc-400 dark:text-zinc-600" />
                <p className="text-sm text-zinc-600 dark:text-zinc-500">No SOD data for {formatDate(currentDate)}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-600 mt-1">
                  SOD tables are calculated by specific domains. Try selecting a different date.
                </p>
              </div>
            ) : (
              <>
                {/* Stats cards */}
                <div className="grid grid-cols-5 gap-3 mb-6">
                  <button
                    onClick={() => setFilterStatus("all")}
                    className={cn(
                      "bg-white dark:bg-zinc-900 border rounded-xl p-4 text-left transition-all hover:border-slate-400 dark:hover:border-zinc-600",
                      filterStatus === "all" ? "border-slate-400 dark:border-zinc-500" : "border-slate-200 dark:border-zinc-800"
                    )}
                  >
                    <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{totals.total}</div>
                    <div className="text-xs text-zinc-500">Total Tables</div>
                  </button>
                  <button
                    onClick={() => setFilterStatus("completed")}
                    className={cn(
                      "bg-white dark:bg-zinc-900 border rounded-xl p-4 text-left transition-all hover:border-green-500 dark:hover:border-green-600",
                      filterStatus === "completed" ? "border-green-500" : "border-slate-200 dark:border-zinc-800"
                    )}
                  >
                    <div className="text-2xl font-bold text-green-500 dark:text-green-400">{totals.completed}</div>
                    <div className="text-xs text-green-600/70 dark:text-green-400/70">Completed</div>
                  </button>
                  <button
                    onClick={() => setFilterStatus("pending")}
                    className={cn(
                      "bg-white dark:bg-zinc-900 border rounded-xl p-4 text-left transition-all hover:border-slate-400 dark:hover:border-zinc-500",
                      filterStatus === "pending" ? "border-slate-400 dark:border-zinc-400" : "border-slate-200 dark:border-zinc-800"
                    )}
                  >
                    <div className="text-2xl font-bold text-zinc-500 dark:text-zinc-400">{totals.pending}</div>
                    <div className="text-xs text-zinc-500">Pending</div>
                  </button>
                  <button
                    onClick={() => setFilterStatus("started")}
                    className={cn(
                      "bg-white dark:bg-zinc-900 border rounded-xl p-4 text-left transition-all hover:border-teal-500 dark:hover:border-teal-600",
                      filterStatus === "started" ? "border-teal-500" : "border-slate-200 dark:border-zinc-800"
                    )}
                  >
                    <div className="text-2xl font-bold text-teal-500 dark:text-teal-400">{totals.started}</div>
                    <div className="text-xs text-teal-600/70 dark:text-teal-400/70">In Progress</div>
                  </button>
                  <button
                    onClick={() => setFilterStatus("errored")}
                    className={cn(
                      "bg-white dark:bg-zinc-900 border rounded-xl p-4 text-left transition-all hover:border-red-500 dark:hover:border-red-600",
                      filterStatus === "errored" ? "border-red-500" : "border-slate-200 dark:border-zinc-800"
                    )}
                  >
                    <div className="text-2xl font-bold text-red-500 dark:text-red-400">{totals.errored}</div>
                    <div className="text-xs text-red-600/70 dark:text-red-400/70">Errored</div>
                  </button>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-4 mb-4">
                  <select
                    value={selectedDomain}
                    onChange={(e) => setSelectedDomain(e.target.value)}
                    className="px-3 py-1.5 text-sm bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-lg text-zinc-700 dark:text-zinc-300"
                  >
                    <option value="all">All Domains ({data.domains.length})</option>
                    {data.domains.map((d) => (
                      <option key={d.domain} value={d.domain}>
                        {d.domain} ({d.tables.length})
                      </option>
                    ))}
                  </select>

                  <div className="relative flex-1 max-w-md">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                      type="text"
                      placeholder="Search tables..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 text-sm bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-lg text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 dark:placeholder-zinc-600"
                    />
                  </div>

                  <span className="text-sm text-zinc-600 dark:text-zinc-500">
                    {filteredTables.length} tables
                  </span>
                </div>

                {/* Table */}
                {filteredTables.length === 0 ? (
                  <div className="text-center py-12 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800">
                    <Search size={32} className="mx-auto mb-3 text-zinc-400 dark:text-zinc-600" />
                    <p className="text-sm text-zinc-600 dark:text-zinc-500">No tables match your filters</p>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[800px]">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-zinc-800">
                            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                              Domain
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                              Table Name
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                              Status
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                              Queued
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                              Started
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                              Completed
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                              Error
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                          {filteredTables.map((table, idx) => (
                            <tr
                              key={`${table.domain}-${table.table_id}-${idx}`}
                              className={cn(
                                "hover:bg-slate-50 dark:hover:bg-zinc-800/50",
                                idx % 2 === 0 ? "bg-white dark:bg-zinc-900" : "bg-slate-50 dark:bg-zinc-900/50"
                              )}
                            >
                              <td className="px-4 py-3 text-sm">
                                <span className="px-2 py-1 text-xs font-medium bg-slate-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded">
                                  {table.domain}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm">
                                <span className="text-zinc-800 dark:text-zinc-200 font-medium">
                                  {table.table_name}
                                </span>
                                <div className="text-xs text-zinc-500">{table.table_id}</div>
                              </td>
                              <td className="px-4 py-3 text-sm">
                                <StatusBadge status={table.status} />
                              </td>
                              <td className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
                                {formatTime(table.queued)}
                              </td>
                              <td className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
                                {formatTime(table.started)}
                              </td>
                              <td className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
                                {formatTime(table.completed)}
                              </td>
                              <td className="px-4 py-3 text-sm text-red-500 dark:text-red-400 max-w-xs truncate" title={table.error_message || ""}>
                                {table.error_message || "-"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </ViewerLayout>
  );
}
