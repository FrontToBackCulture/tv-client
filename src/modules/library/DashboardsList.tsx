// src/modules/library/DashboardsList.tsx
// List view for dashboards folder showing all dashboards

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LayoutDashboard, Search, AlertTriangle, ChevronRight, Eye } from "lucide-react";

interface DashboardsListProps {
  dashboardsPath: string;
  domainName: string;
  onDashboardSelect?: (dashboardPath: string, dashboardName: string) => void;
}

interface DashboardEntry {
  id: string;
  name: string;
  displayName: string;
  path: string;
  hasDefinition: boolean;
  description?: string;
  viewCount?: number;
  lastViewed?: string;
}

export function DashboardsList({ dashboardsPath, domainName, onDashboardSelect }: DashboardsListProps) {
  const [dashboards, setDashboards] = useState<DashboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function loadDashboards() {
      setLoading(true);
      setError(null);

      try {
        // List dashboard directories
        const entries = await invoke<Array<{ name: string; path: string; is_dir: boolean }>>(
          "list_directory",
          { path: dashboardsPath }
        );

        const dashboardDirs = entries.filter((e) => e.is_dir && !e.name.startsWith("."));

        // Build dashboard entries
        const dashboardEntries: DashboardEntry[] = await Promise.all(
          dashboardDirs.map(async (dir) => {
            const dashboardPath = dir.path;
            const dashboardId = dir.name;

            let displayName = dashboardId;
            let hasDefinition = false;
            let description: string | undefined;

            try {
              const defContent = await invoke<string>("read_file", {
                path: `${dashboardPath}/definition.json`,
              });
              const def = JSON.parse(defContent);
              hasDefinition = true;
              displayName = def.name || def.displayName || dashboardId;
              description = def.description;
            } catch {
              // No definition
            }

            return {
              id: dashboardId,
              name: dashboardId,
              displayName,
              path: dashboardPath,
              hasDefinition,
              description,
            };
          })
        );

        // Sort by display name
        dashboardEntries.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setDashboards(dashboardEntries);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load dashboards");
      } finally {
        setLoading(false);
      }
    }

    if (dashboardsPath) {
      loadDashboards();
    }
  }, [dashboardsPath]);

  // Filter dashboards
  const filteredDashboards = dashboards.filter((db) =>
    db.displayName.toLowerCase().includes(search.toLowerCase()) ||
    db.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-pulse text-zinc-500">Loading dashboards...</div>
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
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
          <LayoutDashboard size={14} />
          <span>{domainName}</span>
        </div>
        <h2 className="text-xl font-semibold text-zinc-100">Dashboards</h2>
        <p className="text-sm text-zinc-500 mt-1">{dashboards.length} dashboards</p>

        {/* Search */}
        <div className="relative mt-4">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search dashboards..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded pl-8 pr-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-teal-500"
          />
        </div>
      </div>

      {/* Dashboard list */}
      <div className="flex-1 overflow-y-auto">
        {filteredDashboards.map((dashboard) => (
          <button
            key={dashboard.id}
            onClick={() => onDashboardSelect?.(dashboard.path, dashboard.name)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/50 border-b border-zinc-800/50 text-left"
          >
            <LayoutDashboard size={16} className="text-purple-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-zinc-200 truncate">{dashboard.displayName}</div>
              {dashboard.description && (
                <div className="text-xs text-zinc-500 truncate">{dashboard.description}</div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {dashboard.viewCount !== undefined && (
                <span className="flex items-center gap-1 text-xs text-zinc-500">
                  <Eye size={12} />
                  {dashboard.viewCount}
                </span>
              )}
              <ChevronRight size={14} className="text-zinc-600" />
            </div>
          </button>
        ))}

        {filteredDashboards.length === 0 && (
          <div className="p-8 text-center text-zinc-500">
            {search ? "No dashboards match your search" : "No dashboards found"}
          </div>
        )}
      </div>
    </div>
  );
}
