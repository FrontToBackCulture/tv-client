// src/modules/library/ValUsage.tsx
// VAL Usage analytics viewer showing page sessions and usage patterns

import { useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  RefreshCw,
  Loader2,
  AlertCircle,
  Calendar,
  Users,
  Eye,
  Monitor,
  FolderOpen,
} from "lucide-react";
import { ViewerLayout, ViewerTab, DataSourcesTab } from "./ViewerLayout";
import { cn } from "../../lib/cn";

interface ValUsageProps {
  domainPath: string;
  domainName: string;
}

interface PageSession {
  pagePath: string;
  uniqueUsers: number;
  sessions: number;
  pageViews: number;
}

interface PageSessionData {
  syncedAt: string;
  domain: string;
  dateRange: {
    from: string;
    to: string;
  };
  summary: {
    totalDays: number;
    totalSessions: number;
    totalPageViews: number;
    uniquePages: number;
    uniqueUsers: number;
  };
  pagesByType: Record<string, PageSession[]>;
}

type TabType = "usage" | "sources";

// Map raw page types to user-friendly categories
function mapPageTypeToCategory(rawType: string): string {
  const mapping: Record<string, string> = {
    dashboard_home: "Dashboards",
    dashboard_private: "Dashboards",
    dashboard_public: "Dashboards",
    admin: "Admin",
    table_view: "Workspace",
    workspace_home: "Workspace",
    chat: "Chat",
    login: "Other",
    other: "Other",
  };
  return mapping[rawType] || "Other";
}

function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    Dashboards: "#3b82f6",
    Admin: "#ef4444",
    Workspace: "#10b981",
    Chat: "#8b5cf6",
    Other: "#6b7280",
  };
  return colors[category] || "#6b7280";
}

function extractDisplayName(pagePath: string, pageType: string): string {
  // Try to extract dashboard ID
  const dashMatch = pagePath.match(/\/dashboard\/(?:private|public)\/(\d+)/);
  if (dashMatch) return `Dashboard #${dashMatch[1]}`;

  // Try to extract table name
  const tableMatch = pagePath.match(/\/(custom_tbl_[^/]+)/);
  if (tableMatch) return tableMatch[1].replace(/^custom_tbl_\d+_/, "Table ");

  // Handle specific page types
  if (pageType === "admin") {
    const adminMatch = pagePath.match(/\/admin\/([^/]+)/);
    return adminMatch ? `Admin: ${adminMatch[1]}` : "Admin";
  }
  if (pageType === "dashboard_home") return "Dashboard Home";
  if (pageType === "workspace_home") return "Workspace Home";
  if (pageType === "login") return "Login";

  // Extract the last meaningful segment
  const segments = pagePath.split("/").filter(Boolean);
  return segments[segments.length - 1] || pagePath;
}

export function ValUsage({ domainPath, domainName }: ValUsageProps) {
  const [activeTab, setActiveTab] = useState<TabType>("usage");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Load usage data
  const { data: usageData, isLoading, isError, refetch } = useQuery({
    queryKey: ["val-usage", domainPath],
    queryFn: async () => {
      // List analytics folder
      const analyticsPath = `${domainPath}/analytics`;
      const entries = await invoke<Array<{ name: string; path: string; is_directory: boolean }>>("list_directory", { path: analyticsPath });
      const files = entries.map(e => e.name);

      // Find most recent page_sessions file
      const sessionFiles = files
        .filter((f) => f.startsWith("page_sessions_") && f.endsWith(".json"))
        .sort()
        .reverse();

      if (sessionFiles.length === 0) {
        throw new Error("No usage data found. Run 'Sync Dashboard Usage' to generate data.");
      }

      const latestFile = sessionFiles[0];
      const filePath = `${analyticsPath}/${latestFile}`;
      const content = await invoke<string>("read_file", { path: filePath });
      return JSON.parse(content) as PageSessionData;
    },
  });

  // Process all pages with categories
  const allPages = useMemo(() => {
    if (!usageData?.pagesByType) return [];

    const pages: Array<PageSession & { type: string; category: string; displayName: string }> = [];
    for (const [pageType, pageList] of Object.entries(usageData.pagesByType)) {
      const category = mapPageTypeToCategory(pageType);
      for (const page of pageList) {
        pages.push({
          ...page,
          type: pageType,
          category,
          displayName: extractDisplayName(page.pagePath, pageType),
        });
      }
    }
    return pages.sort((a, b) => b.sessions - a.sessions);
  }, [usageData]);

  // Filter pages by category
  const filteredPages = useMemo(() => {
    if (categoryFilter === "all") return allPages;
    return allPages.filter((p) => p.category === categoryFilter);
  }, [allPages, categoryFilter]);

  // Calculate category distribution
  const categoryStats = useMemo(() => {
    const stats: Record<string, { sessions: number; pageViews: number; count: number }> = {};
    for (const page of allPages) {
      if (!stats[page.category]) {
        stats[page.category] = { sessions: 0, pageViews: 0, count: 0 };
      }
      stats[page.category].sessions += page.sessions;
      stats[page.category].pageViews += page.pageViews;
      stats[page.category].count += 1;
    }
    return Object.entries(stats)
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.sessions - a.sessions);
  }, [allPages]);

  // Define tabs
  const tabs: ViewerTab[] = useMemo(
    () => [
      {
        id: "usage",
        label: "Usage",
        icon: <BarChart3 size={14} />,
        count: allPages.length,
      },
      {
        id: "sources",
        label: "Data Sources",
        icon: <FolderOpen size={14} />,
      },
    ],
    [allPages.length]
  );

  // Data sources
  const dataSources = useMemo(
    () => [
      {
        name: "Page Sessions",
        path: `${domainPath}/analytics`,
        description: "VAL usage analytics data (page_sessions_*.json)",
      },
    ],
    [domainPath]
  );

  // Actions
  const headerActions = (
    <button
      onClick={() => refetch()}
      className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-zinc-300 transition-colors"
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
          <p className="text-sm text-zinc-500">Loading usage data...</p>
        </div>
      </div>
    );
  }

  if (isError || !usageData) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={32} className="mx-auto mb-3 text-zinc-600" />
          <p className="text-sm text-zinc-500">No usage data available</p>
          <p className="text-xs text-zinc-600 mt-1">
            Run &quot;Sync Dashboard Usage&quot; to generate data
          </p>
        </div>
      </div>
    );
  }

  return (
    <ViewerLayout
      title={`${domainName} VAL Usage`}
      subtitle={`Synced: ${new Date(usageData.syncedAt).toLocaleString()}`}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as TabType)}
      actions={headerActions}
    >
      {activeTab === "usage" && (
        <div className="h-full overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                icon={<Monitor size={20} />}
                label="Total Sessions"
                value={usageData.summary.totalSessions}
                color="teal"
              />
              <StatCard
                icon={<Eye size={20} />}
                label="Page Views"
                value={usageData.summary.totalPageViews}
                color="blue"
              />
              <StatCard
                icon={<BarChart3 size={20} />}
                label="Unique Pages"
                value={usageData.summary.uniquePages}
                color="purple"
              />
              <StatCard
                icon={<Users size={20} />}
                label="Unique Users"
                value={usageData.summary.uniqueUsers}
                color="green"
              />
            </div>

            {/* Category Distribution */}
            <div className="bg-zinc-900 rounded-xl p-4">
              <h3 className="text-sm font-medium text-zinc-300 mb-4">Usage by Category</h3>
              <div className="space-y-3">
                {categoryStats.map((item) => (
                  <div key={item.category} className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: getCategoryColor(item.category) }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-zinc-300">
                          {item.category}
                        </span>
                        <span className="text-xs text-zinc-500">{item.count} pages</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-zinc-500">
                        <span>{item.sessions.toLocaleString()} sessions</span>
                        <span>{item.pageViews.toLocaleString()} views</span>
                      </div>
                      <div className="mt-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${(item.sessions / usageData.summary.totalSessions) * 100}%`,
                            backgroundColor: getCategoryColor(item.category),
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* All Pages Table */}
            <div className="bg-zinc-900 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-zinc-500" />
                  <span className="font-medium text-zinc-200">All Tracked Pages</span>
                  <span className="text-xs text-zinc-500">
                    ({filteredPages.length} of {allPages.length})
                  </span>
                </div>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-2 py-1 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300"
                >
                  <option value="all">All Categories</option>
                  <option value="Dashboards">Dashboards</option>
                  <option value="Workspace">Workspace</option>
                  <option value="Admin">Admin</option>
                  <option value="Chat">Chat</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-zinc-800">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500 uppercase">
                        Page
                      </th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500 uppercase">
                        Category
                      </th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-zinc-500 uppercase">
                        Sessions
                      </th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-zinc-500 uppercase">
                        Views
                      </th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-zinc-500 uppercase">
                        Users
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {filteredPages.map((page, idx) => (
                      <tr key={idx} className="hover:bg-zinc-800/50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-zinc-200 truncate max-w-xs">
                            {page.displayName}
                          </div>
                          <div className="text-xs text-zinc-500 truncate max-w-xs">
                            {page.pagePath}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                            style={{
                              backgroundColor: `${getCategoryColor(page.category)}20`,
                              color: getCategoryColor(page.category),
                            }}
                          >
                            {page.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-zinc-300">
                          {page.sessions.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-zinc-300">
                          {page.pageViews.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-zinc-300">
                          {page.uniqueUsers.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
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
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: "teal" | "blue" | "green" | "purple";
}) {
  const colorClasses = {
    teal: "text-teal-400 bg-teal-400/10",
    blue: "text-blue-400 bg-blue-400/10",
    green: "text-green-400 bg-green-400/10",
    purple: "text-purple-400 bg-purple-400/10",
  };

  return (
    <div className="bg-zinc-900 rounded-lg p-4">
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-3", colorClasses[color])}>
        {icon}
      </div>
      <p className="text-2xl font-semibold text-zinc-100">{value.toLocaleString()}</p>
      <p className="text-sm text-zinc-400">{label}</p>
    </div>
  );
}
