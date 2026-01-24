// src/modules/library/DashboardDetails.tsx
// Detailed view for individual dashboard folders

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LayoutDashboard, BarChart2, PieChart, LineChart, Table, AlertTriangle, ExternalLink, ChevronDown, ChevronRight } from "lucide-react";

interface DashboardDetailsProps {
  dashboardPath: string;
  dashboardName: string;
}

// Actual widget structure from dashboard definition.json
interface DashboardWidget {
  id: string;
  name: string;
  grid?: {
    h: number;
    w: number;
    x: number;
    y: number;
  };
  style?: Record<string, unknown>;
  settings?: {
    layout?: Record<string, unknown>;
    encoding?: {
      [key: string]: unknown;
    };
  };
}

// Actual dashboard structure from definition.json
interface DashboardDefinition {
  id: number;
  temp_id?: number;
  seq_id?: number;
  name: string;
  category?: string;
  created_by?: number;
  created_date?: string;
  updated_date?: string;
  updated_by?: number;
  widgets?: DashboardWidget[];
}

// Extract domain name from path for VAL URL
function extractDomainFromPath(path: string): string | null {
  const match = path.match(/\/domains\/(production|staging)\/([^/]+)/);
  return match ? match[2] : null;
}

// Build VAL URL for dashboard
function getValUrl(path: string, dashboardId: string): string | null {
  const domain = extractDomainFromPath(path);
  if (!domain) return null;
  return `https://${domain}.thinkval.io/dashboards/${dashboardId}`;
}

export function DashboardDetails({ dashboardPath, dashboardName }: DashboardDetailsProps) {
  const [definition, setDefinition] = useState<DashboardDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedWidgets, setExpandedWidgets] = useState<Set<number>>(new Set());

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        // Load definition.json
        try {
          const defPath = `${dashboardPath}/definition.json`;
          const content = await invoke<string>("read_file", { path: defPath });
          setDefinition(JSON.parse(content));
        } catch {
          setDefinition(null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    }

    if (dashboardPath) {
      loadData();
    }
  }, [dashboardPath]);

  const toggleWidget = (index: number) => {
    const newExpanded = new Set(expandedWidgets);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedWidgets(newExpanded);
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-pulse text-zinc-500">Loading dashboard details...</div>
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
          <span>Dashboard</span>
        </div>
        <h2 className="text-xl font-semibold text-zinc-100">
          {definition?.name || dashboardName}
        </h2>
        {definition?.category && (
          <span className="inline-block mt-1 px-2 py-0.5 bg-zinc-800 rounded text-xs text-zinc-400">
            {definition.category}
          </span>
        )}

        {/* Open in VAL button */}
        {(() => {
          const valUrl = getValUrl(dashboardPath, dashboardName);
          return valUrl ? (
            <a
              href={valUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-sm rounded-md transition-colors"
            >
              <ExternalLink size={14} />
              Open in VAL
            </a>
          ) : null;
        })()}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Stats row */}
        {definition && (
          <div className="grid grid-cols-2 gap-4">
            <StatBox
              label="Widgets"
              value={definition.widgets?.length || 0}
              icon={<BarChart2 size={16} />}
            />
            <StatBox
              label="Dashboard ID"
              value={definition.id}
              icon={<LayoutDashboard size={16} />}
            />
          </div>
        )}

        {/* Widgets */}
        {definition?.widgets && definition.widgets.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
              <BarChart2 size={14} />
              Widgets ({definition.widgets.length})
            </h3>
            <div className="space-y-2">
              {definition.widgets.map((widget, i) => (
                <div key={widget.id || i} className="bg-zinc-900 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleWidget(i)}
                    className="w-full flex items-center gap-2 p-3 text-left hover:bg-zinc-800/50"
                  >
                    {expandedWidgets.has(i) ? (
                      <ChevronDown size={14} className="text-zinc-500" />
                    ) : (
                      <ChevronRight size={14} className="text-zinc-500" />
                    )}
                    <WidgetIcon type={widget.name} />
                    <span className="text-sm text-zinc-200 flex-1">
                      {widget.name || `Widget ${i + 1}`}
                    </span>
                    {widget.grid && (
                      <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">
                        {widget.grid.w}x{widget.grid.h}
                      </span>
                    )}
                  </button>
                  {expandedWidgets.has(i) && (
                    <div className="px-3 pb-3 pt-0 space-y-2">
                      {widget.grid && (
                        <div className="text-xs">
                          <span className="text-zinc-500">Position: </span>
                          <span className="text-zinc-300">({widget.grid.x}, {widget.grid.y})</span>
                          <span className="text-zinc-500 ml-3">Size: </span>
                          <span className="text-zinc-300">{widget.grid.w} x {widget.grid.h}</span>
                        </div>
                      )}
                      {widget.settings && (
                        <div>
                          <span className="text-xs text-zinc-500">Settings:</span>
                          <pre className="text-xs text-zinc-400 bg-zinc-950 rounded p-2 mt-1 overflow-x-auto max-h-40 overflow-y-auto">
                            {JSON.stringify(widget.settings, null, 2).substring(0, 500)}
                            {JSON.stringify(widget.settings).length > 500 && "..."}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        {definition && (
          <div className="bg-zinc-900 rounded-lg p-4">
            <h3 className="text-sm font-medium text-zinc-300 mb-3">Metadata</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-zinc-500">Dashboard ID: </span>
                <span className="text-zinc-300">{definition.id}</span>
              </div>
              {definition.created_date && (
                <div>
                  <span className="text-zinc-500">Created: </span>
                  <span className="text-zinc-300">{new Date(definition.created_date).toLocaleDateString()}</span>
                </div>
              )}
              {definition.updated_date && (
                <div>
                  <span className="text-zinc-500">Last modified: </span>
                  <span className="text-zinc-300">{new Date(definition.updated_date).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {!definition && (
          <div className="text-center text-zinc-500 py-8">
            <LayoutDashboard size={32} className="mx-auto mb-3 opacity-50" />
            <p>No dashboard definition found</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Stat box component
function StatBox({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-zinc-900 rounded-lg p-4">
      <div className="flex items-center gap-2 text-zinc-400 mb-2">
        {icon}
        <span className="text-xs text-zinc-500">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-zinc-100">{value}</p>
    </div>
  );
}

// Widget icon based on name
function WidgetIcon({ type }: { type?: string }) {
  const iconClass = "text-zinc-500 flex-shrink-0";
  const name = type?.toLowerCase() || "";

  if (name.includes("table") || name.includes("grid")) {
    return <Table size={14} className={iconClass} />;
  }
  if (name.includes("pie") || name.includes("donut")) {
    return <PieChart size={14} className={iconClass} />;
  }
  if (name.includes("line") || name.includes("trend")) {
    return <LineChart size={14} className={iconClass} />;
  }
  if (name.includes("bar") || name.includes("chart")) {
    return <BarChart2 size={14} className={iconClass} />;
  }
  return <BarChart2 size={14} className={iconClass} />;
}

