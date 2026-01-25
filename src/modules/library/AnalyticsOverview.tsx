// src/modules/library/AnalyticsOverview.tsx
// Overview of domain analytics - usage stats, trends, and insights

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TrendingUp, Users, Database, BarChart2, AlertTriangle, ArrowUp, ArrowDown, Minus, Clock, Eye } from "lucide-react";
import { cn } from "../../lib/cn";

interface AnalyticsOverviewProps {
  analyticsPath: string;
  domainName: string;
}

interface UsageTrend {
  period: string;
  queries: number;
  dashboardViews: number;
  uniqueUsers: number;
}

interface TopItem {
  name: string;
  count: number;
  trend?: "up" | "down" | "flat";
}

interface AnalyticsData {
  lastUpdated?: string;
  summary?: {
    totalQueries: number;
    totalDashboardViews: number;
    uniqueUsers: number;
    dataVolumeMB: number;
  };
  trends?: {
    queriesChange: number;
    viewsChange: number;
    usersChange: number;
  };
  usageHistory?: UsageTrend[];
  topQueries?: TopItem[];
  topDashboards?: TopItem[];
  topTables?: TopItem[];
}

export function AnalyticsOverview({ analyticsPath, domainName }: AnalyticsOverviewProps) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        // Try to load analytics summary
        try {
          const summaryPath = `${analyticsPath}/analytics-summary.json`;
          const content = await invoke<string>("read_file", { path: summaryPath });
          setData(JSON.parse(content));
        } catch {
          // Try alternative file names
          try {
            const altPath = `${analyticsPath}/usage-stats.json`;
            const content = await invoke<string>("read_file", { path: altPath });
            setData(JSON.parse(content));
          } catch {
            // No analytics data found
            setData(null);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load analytics data");
      } finally {
        setLoading(false);
      }
    }

    if (analyticsPath) {
      loadData();
    }
  }, [analyticsPath]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-pulse text-zinc-500">Loading analytics data...</div>
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
          <TrendingUp size={14} />
          <span>{domainName}</span>
        </div>
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Analytics</h2>
        <div className="text-center text-zinc-500 py-8">
          <TrendingUp size={32} className="mx-auto mb-3 opacity-50" />
          <p>No analytics data available</p>
          <p className="text-sm mt-1">Analytics data will appear here when available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-zinc-800">
        <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-sm mb-1">
          <TrendingUp size={14} />
          <span>{domainName}</span>
        </div>
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Analytics</h2>
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
              icon={<Database size={16} />}
              label="Total Queries"
              value={formatNumber(data.summary.totalQueries)}
              trend={data.trends?.queriesChange}
              color="blue"
            />
            <StatCard
              icon={<Eye size={16} />}
              label="Dashboard Views"
              value={formatNumber(data.summary.totalDashboardViews)}
              trend={data.trends?.viewsChange}
              color="purple"
            />
            <StatCard
              icon={<Users size={16} />}
              label="Unique Users"
              value={formatNumber(data.summary.uniqueUsers)}
              trend={data.trends?.usersChange}
              color="green"
            />
            <StatCard
              icon={<BarChart2 size={16} />}
              label="Data Volume"
              value={formatDataSize(data.summary.dataVolumeMB)}
              color="teal"
            />
          </div>
        )}

        {/* Usage history */}
        {data.usageHistory && data.usageHistory.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2">
              <Clock size={14} />
              Usage History
            </h3>
            <div className="bg-white dark:bg-zinc-900 rounded-lg overflow-hidden border border-slate-200 dark:border-transparent">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-zinc-800">
                    <th className="text-left px-3 py-2 text-zinc-500 dark:text-zinc-400 font-medium">Period</th>
                    <th className="text-right px-3 py-2 text-zinc-500 dark:text-zinc-400 font-medium">Queries</th>
                    <th className="text-right px-3 py-2 text-zinc-500 dark:text-zinc-400 font-medium">Views</th>
                    <th className="text-right px-3 py-2 text-zinc-500 dark:text-zinc-400 font-medium">Users</th>
                  </tr>
                </thead>
                <tbody>
                  {data.usageHistory.map((row, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-zinc-800/50 last:border-0">
                      <td className="px-3 py-2 text-zinc-800 dark:text-zinc-200">{row.period}</td>
                      <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400 text-right">{formatNumber(row.queries)}</td>
                      <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400 text-right">{formatNumber(row.dashboardViews)}</td>
                      <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400 text-right">{row.uniqueUsers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Top items grid */}
        <div className="grid md:grid-cols-3 gap-4">
          {/* Top queries */}
          {data.topQueries && data.topQueries.length > 0 && (
            <TopItemsList title="Top Queries" items={data.topQueries} icon={<Database size={14} />} />
          )}

          {/* Top dashboards */}
          {data.topDashboards && data.topDashboards.length > 0 && (
            <TopItemsList title="Top Dashboards" items={data.topDashboards} icon={<BarChart2 size={14} />} />
          )}

          {/* Top tables */}
          {data.topTables && data.topTables.length > 0 && (
            <TopItemsList title="Most Used Tables" items={data.topTables} icon={<Database size={14} />} />
          )}
        </div>
      </div>
    </div>
  );
}

// Stat card with optional trend
function StatCard({
  icon,
  label,
  value,
  trend,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  trend?: number;
  color: "blue" | "purple" | "green" | "teal";
}) {
  const colorClasses = {
    blue: "text-blue-500 dark:text-blue-400",
    purple: "text-purple-500 dark:text-purple-400",
    green: "text-green-500 dark:text-green-400",
    teal: "text-teal-500 dark:text-teal-400",
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg p-4 border border-slate-200 dark:border-transparent">
      <div className={cn("flex items-center gap-2 mb-2", colorClasses[color])}>
        {icon}
        <span className="text-xs text-zinc-500">{label}</span>
      </div>
      <div className="flex items-end justify-between">
        <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{value}</p>
        {trend !== undefined && (
          <TrendIndicator value={trend} />
        )}
      </div>
    </div>
  );
}

// Trend indicator
function TrendIndicator({ value }: { value: number }) {
  if (value > 0) {
    return (
      <span className="flex items-center gap-0.5 text-xs text-green-500 dark:text-green-400">
        <ArrowUp size={12} />
        {value}%
      </span>
    );
  } else if (value < 0) {
    return (
      <span className="flex items-center gap-0.5 text-xs text-red-500 dark:text-red-400">
        <ArrowDown size={12} />
        {Math.abs(value)}%
      </span>
    );
  }
  return (
    <span className="flex items-center gap-0.5 text-xs text-zinc-500">
      <Minus size={12} />
      0%
    </span>
  );
}

// Top items list
function TopItemsList({
  title,
  items,
  icon,
}: {
  title: string;
  items: TopItem[];
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg p-4 border border-slate-200 dark:border-transparent">
      <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2">
        {icon}
        {title}
      </h4>
      <div className="space-y-2">
        {items.slice(0, 5).map((item, i) => (
          <div key={i} className="flex items-center justify-between">
            <span className="text-sm text-zinc-500 dark:text-zinc-400 truncate flex-1">{item.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">{formatNumber(item.count)}</span>
              {item.trend && (
                <span className={cn(
                  "text-xs",
                  item.trend === "up" && "text-green-500 dark:text-green-400",
                  item.trend === "down" && "text-red-500 dark:text-red-400",
                  item.trend === "flat" && "text-zinc-500"
                )}>
                  {item.trend === "up" && <ArrowUp size={10} />}
                  {item.trend === "down" && <ArrowDown size={10} />}
                  {item.trend === "flat" && <Minus size={10} />}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Format large numbers
function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

// Format data size
function formatDataSize(mb: number): string {
  if (mb >= 1000) return `${(mb / 1000).toFixed(1)} GB`;
  return `${mb} MB`;
}
