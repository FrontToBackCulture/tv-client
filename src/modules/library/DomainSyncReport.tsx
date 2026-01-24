// src/modules/library/DomainSyncReport.tsx
// Multi-tab sync report viewer for domains

import React, { useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  RefreshCw,
  Database,
  Loader2,
  BarChart3,
  Table,
  Code,
  LayoutDashboard,
  FileCode,
  Workflow,
  ArrowUpDown,
} from "lucide-react";
import { cn } from "../../lib/cn";

// Types
interface ArtifactStatus {
  count: number;
  lastSync: string;
  status: "success" | "warning" | "error" | "neutral";
}

interface GenerationStatus {
  count: number;
  lastGenerated: string;
  status: "success" | "warning" | "error" | "neutral";
}

interface DomainData {
  name: string;
  environment: string;
  path: string;
  summary: {
    totalArtifacts: number;
    totalExtractions: number;
    totalGenerated: number;
  };
  artifacts: Record<string, ArtifactStatus>;
  generations: Record<string, GenerationStatus>;
  syncDate?: string | null;
  audit?: {
    totalLocal: number;
    totalRemote: number;
    totalStale: number;
  };
}

interface GenerationStat {
  total: number;
  withDetails: number;
  withExplanations: number;
  detailsPct: number;
  explanationsPct: number;
}

interface ReportData {
  generatedAt: string;
  generationStats: Record<string, GenerationStat>;
  domains: DomainData[];
}

interface DomainSyncReportProps {
  basePath: string;
}

type TabId = "overview" | "generation" | "table" | "sources";
type SortField = "name" | "totalArtifacts" | "lastSync";

// Format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getStatusBg(status: string): string {
  switch (status) {
    case "success": return "bg-green-500/20 border-green-500/30";
    case "warning": return "bg-amber-500/20 border-amber-500/30";
    case "error": return "bg-red-500/20 border-red-500/30";
    default: return "bg-zinc-500/20 border-zinc-500/30";
  }
}

// Tab Navigation
function TabNavigation({ activeTab, onTabChange }: { activeTab: TabId; onTabChange: (tab: TabId) => void }) {
  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <LayoutDashboard size={14} /> },
    { id: "generation", label: "Generation Progress", icon: <BarChart3 size={14} /> },
    { id: "table", label: "Details Table", icon: <Table size={14} /> },
    { id: "sources", label: "Data Sources", icon: <Code size={14} /> },
  ];

  return (
    <div className="flex items-center gap-1 bg-zinc-900 rounded-lg p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors",
            activeTab === tab.id
              ? "bg-zinc-800 text-zinc-100"
              : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

// Overview Tab
function OverviewTab({ data }: { data: ReportData }) {
  const groupedByEnv = useMemo(() => {
    const groups: Record<string, DomainData[]> = {};
    for (const domain of data.domains) {
      const env = domain.environment || "production";
      if (!groups[env]) groups[env] = [];
      groups[env].push(domain);
    }
    return groups;
  }, [data.domains]);

  const envOrder = ["production", "demo", "templates"];

  return (
    <div className="space-y-8">
      {envOrder.map((env) => {
        const domains = groupedByEnv[env];
        if (!domains?.length) return null;

        return (
          <div key={env}>
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
              {env} ({domains.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {domains.map((domain) => (
                <div
                  key={domain.name}
                  className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Database size={16} className="text-teal-400" />
                      <span className="font-medium text-zinc-200">{domain.name}</span>
                    </div>
                    <span className="text-xs text-zinc-500">
                      {domain.summary.totalArtifacts} artifacts
                    </span>
                  </div>

                  {/* Artifact badges */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {Object.entries(domain.artifacts).map(([type, artifact]) => (
                      <span
                        key={type}
                        className={cn(
                          "px-2 py-0.5 text-xs rounded border",
                          getStatusBg(artifact.status)
                        )}
                        title={`${type}: ${artifact.count} (${artifact.lastSync})`}
                      >
                        {type}: {artifact.count}
                      </span>
                    ))}
                  </div>

                  {/* Summary stats */}
                  <div className="flex items-center gap-4 text-xs text-zinc-500">
                    <span>
                      <span className="text-teal-400">{domain.summary.totalExtractions}</span> extracted
                    </span>
                    <span>
                      <span className="text-green-400">{domain.summary.totalGenerated}</span> generated
                    </span>
                    {domain.audit?.totalStale ? (
                      <span>
                        <span className="text-amber-400">{domain.audit.totalStale}</span> stale
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Generation Progress Tab
function GenerationTab({ data }: { data: ReportData }) {
  const artifactTypes = ["queries", "workflows", "dashboards", "tables"];

  return (
    <div className="space-y-8">
      {/* Overall progress cards */}
      <div>
        <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
          Overall Generation Progress
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {artifactTypes.map((type) => {
            const stats = data.generationStats[type];
            if (!stats) return null;

            return (
              <div
                key={type}
                className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl"
              >
                <div className="flex items-center gap-2 mb-3">
                  {type === "queries" && <FileCode size={16} className="text-blue-400" />}
                  {type === "workflows" && <Workflow size={16} className="text-purple-400" />}
                  {type === "dashboards" && <LayoutDashboard size={16} className="text-amber-400" />}
                  {type === "tables" && <Database size={16} className="text-green-400" />}
                  <span className="font-medium text-zinc-200 capitalize">{type}</span>
                  <span className="text-xs text-zinc-500 ml-auto">{stats.total} total</span>
                </div>

                {/* Details progress */}
                <div className="mb-2">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-zinc-400">Details</span>
                    <span className="text-zinc-300">{stats.detailsPct}%</span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-500 transition-all"
                      style={{ width: `${stats.detailsPct}%` }}
                    />
                  </div>
                </div>

                {/* Explanations progress */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-zinc-400">Explanations</span>
                    <span className="text-zinc-300">{stats.explanationsPct}%</span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 transition-all"
                      style={{ width: `${stats.explanationsPct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-domain generation table */}
      <div>
        <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
          Per-Domain Generation Status
        </h3>
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">
                  Domain
                </th>
                {artifactTypes.map((type) => (
                  <th key={type} className="text-center text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3" colSpan={2}>
                    {type}
                  </th>
                ))}
              </tr>
              <tr className="border-b border-zinc-800 bg-zinc-900/50">
                <th className="px-4 py-2" />
                {artifactTypes.map((type) => (
                  <React.Fragment key={type}>
                    <th className="text-center text-xs text-zinc-600 px-2 py-2">Details</th>
                    <th className="text-center text-xs text-zinc-600 px-2 py-2">Expl.</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.domains
                .filter(d => d.environment === "production")
                .map((domain, idx) => (
                <tr
                  key={domain.name}
                  className={cn(
                    "border-b border-zinc-800/50 last:border-0",
                    idx % 2 === 0 ? "bg-zinc-900" : "bg-zinc-900/50"
                  )}
                >
                  <td className="px-4 py-3 text-sm text-zinc-200">{domain.name}</td>
                  {artifactTypes.map((type) => {
                    const detailsKey = `${type.slice(0, -1)} Details`;
                    const explKey = `${type.slice(0, -1)} Explanations`;
                    const details = domain.generations[detailsKey];
                    const expl = domain.generations[explKey];

                    return (
                      <React.Fragment key={type}>
                        <td className="text-center px-2 py-3">
                          <span className={cn("text-sm", details?.count ? "text-zinc-300" : "text-zinc-600")}>
                            {details?.count || 0}
                          </span>
                        </td>
                        <td className="text-center px-2 py-3">
                          <span className={cn("text-sm", expl?.count ? "text-zinc-300" : "text-zinc-600")}>
                            {expl?.count || 0}
                          </span>
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Details Table Tab
function DetailsTableTab({ data }: { data: ReportData }) {
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [envFilter, setEnvFilter] = useState<string>("all");

  const sortedDomains = useMemo(() => {
    let filtered = data.domains;
    if (envFilter !== "all") {
      filtered = filtered.filter(d => d.environment === envFilter);
    }

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "totalArtifacts":
          cmp = a.summary.totalArtifacts - b.summary.totalArtifacts;
          break;
        case "lastSync":
          // Simple string compare for relative time
          cmp = (a.artifacts.tables?.lastSync || "").localeCompare(b.artifacts.tables?.lastSync || "");
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [data.domains, sortField, sortAsc, envFilter]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const environments = [...new Set(data.domains.map(d => d.environment))];

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-4 mb-4">
        <select
          value={envFilter}
          onChange={(e) => setEnvFilter(e.target.value)}
          className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-300"
        >
          <option value="all">All Environments</option>
          {environments.map((env) => (
            <option key={env} value={env}>{env}</option>
          ))}
        </select>
        <span className="text-sm text-zinc-500">
          {sortedDomains.length} domains
        </span>
      </div>

      {/* Table */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b border-zinc-800">
              <th
                className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3 cursor-pointer hover:text-zinc-300"
                onClick={() => toggleSort("name")}
              >
                <div className="flex items-center gap-1">
                  Domain
                  <ArrowUpDown size={12} />
                </div>
              </th>
              <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">
                Env
              </th>
              <th className="text-right text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">
                Fields
              </th>
              <th className="text-right text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">
                Queries
              </th>
              <th className="text-right text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">
                Workflows
              </th>
              <th className="text-right text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">
                Dashboards
              </th>
              <th className="text-right text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">
                Tables
              </th>
              <th
                className="text-right text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3 cursor-pointer hover:text-zinc-300"
                onClick={() => toggleSort("totalArtifacts")}
              >
                <div className="flex items-center justify-end gap-1">
                  Total
                  <ArrowUpDown size={12} />
                </div>
              </th>
              <th className="text-right text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">
                Generated
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedDomains.map((domain, idx) => (
              <tr
                key={domain.name}
                className={cn(
                  "border-b border-zinc-800/50 last:border-0",
                  idx % 2 === 0 ? "bg-zinc-900" : "bg-zinc-900/50"
                )}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Database size={14} className="text-teal-400" />
                    <span className="text-sm text-zinc-200">{domain.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded",
                    domain.environment === "production" ? "bg-green-900/30 text-green-400" :
                    domain.environment === "demo" ? "bg-blue-900/30 text-blue-400" :
                    "bg-zinc-800 text-zinc-400"
                  )}>
                    {domain.environment}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-sm text-zinc-400">
                  {domain.artifacts.fields?.count || 0}
                </td>
                <td className="px-4 py-3 text-right text-sm text-zinc-400">
                  {domain.artifacts.queries?.count || 0}
                </td>
                <td className="px-4 py-3 text-right text-sm text-zinc-400">
                  {domain.artifacts.workflows?.count || 0}
                </td>
                <td className="px-4 py-3 text-right text-sm text-zinc-400">
                  {domain.artifacts.dashboards?.count || 0}
                </td>
                <td className="px-4 py-3 text-right text-sm text-zinc-400">
                  {domain.artifacts.tables?.count || 0}
                </td>
                <td className="px-4 py-3 text-right text-sm text-zinc-200 font-medium">
                  {domain.summary.totalArtifacts}
                </td>
                <td className="px-4 py-3 text-right text-sm text-green-400">
                  {domain.summary.totalGenerated}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Data Sources Tab
function DataSourcesTab({ basePath, reportPath, auditPath }: { basePath: string; reportPath: string; auditPath: string }) {
  const sources = [
    {
      tab: "Overview",
      file: "sync-report.json",
      path: reportPath,
      description: "Domain sync status, artifact counts, and extraction summaries",
    },
    {
      tab: "Generation Progress",
      file: "sync-report.json",
      path: reportPath,
      description: "Generation statistics for details and explanations per artifact type",
    },
    {
      tab: "Details Table",
      file: "sync-report.json + all-audit-results.json",
      path: `${reportPath} + ${auditPath}`,
      description: "Combined domain data with audit results for stale artifact detection",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
          Data Sources by Tab
        </h3>
        <div className="space-y-3">
          {sources.map((source) => (
            <div
              key={source.tab}
              className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl"
            >
              <div className="flex items-start justify-between mb-2">
                <span className="font-medium text-zinc-200">{source.tab}</span>
                <code className="text-xs px-2 py-1 bg-zinc-800 rounded text-teal-400">
                  {source.file}
                </code>
              </div>
              <p className="text-sm text-zinc-500 mb-2">{source.description}</p>
              <code className="text-xs text-zinc-600 break-all">{source.path}</code>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
          File Locations
        </h3>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div>
            <div className="text-xs text-zinc-500 mb-1">sync-report.json</div>
            <code className="text-sm text-zinc-300 break-all">{reportPath}</code>
          </div>
          <div>
            <div className="text-xs text-zinc-500 mb-1">all-audit-results.json</div>
            <code className="text-sm text-zinc-300 break-all">{auditPath}</code>
          </div>
          <div>
            <div className="text-xs text-zinc-500 mb-1">Base Path</div>
            <code className="text-sm text-zinc-300 break-all">{basePath}</code>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DomainSyncReport({ basePath }: DomainSyncReportProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  // Determine file paths
  const reportPath = useMemo(() => {
    // Go up from production/demo folder to domains folder
    const domainsPath = basePath.replace(/\/(production|demo|templates)$/, "");
    return `${domainsPath}/sync-report.json`;
  }, [basePath]);

  const auditPath = useMemo(() => {
    const domainsPath = basePath.replace(/\/(production|demo|templates)$/, "");
    return `${domainsPath}/all-audit-results.json`;
  }, [basePath]);

  // Load sync report
  const { data: reportData, isLoading, isError, refetch } = useQuery({
    queryKey: ["sync-report", reportPath],
    queryFn: async () => {
      const content = await invoke<string>("read_file", { path: reportPath });
      return JSON.parse(content) as ReportData;
    },
  });

  // Load audit data (optional)
  const { data: auditData } = useQuery({
    queryKey: ["audit-results", auditPath],
    queryFn: async () => {
      try {
        const content = await invoke<string>("read_file", { path: auditPath });
        return JSON.parse(content);
      } catch {
        return null;
      }
    },
  });

  // Merge audit data into report
  const mergedData = useMemo(() => {
    if (!reportData) return null;
    if (!auditData?.domains) return reportData;

    const auditMap = new Map<string, DomainData['audit']>(
      auditData.domains.map((d: { name: string; totalLocal?: number; totalRemote?: number; totalStale?: number }) => [d.name, d as DomainData['audit']])
    );
    return {
      ...reportData,
      domains: reportData.domains.map((domain) => ({
        ...domain,
        audit: auditMap.get(domain.name),
      })),
    };
  }, [reportData, auditData]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={32} className="mx-auto mb-3 text-zinc-600 animate-spin" />
          <p className="text-sm text-zinc-500">Loading sync report...</p>
        </div>
      </div>
    );
  }

  if (isError || !mergedData) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={32} className="mx-auto mb-3 text-red-500" />
          <p className="text-sm text-red-400">Failed to load sync report</p>
          <p className="text-xs text-zinc-500 mt-1">
            Could not find sync-report.json
          </p>
          <code className="text-xs text-zinc-600 mt-2 block">{reportPath}</code>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-100 mb-1">
              Domain Sync Report
            </h1>
            <p className="text-sm text-zinc-500">
              Generated: {formatRelativeTime(mergedData.generatedAt)}
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-zinc-300 transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6">
          <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
        </div>

        {/* Tab Content */}
        {activeTab === "overview" && <OverviewTab data={mergedData} />}
        {activeTab === "generation" && <GenerationTab data={mergedData} />}
        {activeTab === "table" && <DetailsTableTab data={mergedData} />}
        {activeTab === "sources" && (
          <DataSourcesTab
            basePath={basePath}
            reportPath={reportPath}
            auditPath={auditPath}
          />
        )}
      </div>
    </div>
  );
}
