// src/modules/library/TableDetails.tsx
// Detailed view for individual table folders

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Database, Table, Sparkles, FileJson, AlertTriangle, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { cn } from "../../lib/cn";

interface TableDetailsProps {
  tablePath: string;
  tableName: string;
}

// Actual structure from definition_details.json
interface TableDefinition {
  meta: {
    tableName: string;
    displayName: string;
    space?: string;
    zone?: string;
    tableType?: string;
    dataSource?: string;
  };
  health?: {
    score: number;
    status: string;
    rowCount?: string;
    freshnessColumn?: string | null;
    daysSinceUpdate?: number | null;
    issues?: string[];
  };
  columns?: {
    system?: Array<{
      name: string;
      column: string;
      type: string;
    }>;
    data?: Array<{
      name: string;
      column: string;
      type: string;
    }>;
  };
}

interface TableAnalysis {
  classification?: {
    dataType: string;
    suggestedName?: string;
  };
  summary?: {
    short: string;
    full: string;
  };
  useCases?: {
    operational?: string[];
    strategic?: string[];
  };
}

interface TableSample {
  sampleData?: Array<Record<string, unknown>>;
  rowCount?: number;
}

type TabType = "details" | "sample" | "analysis";

// Extract domain name from path for VAL URL
function extractDomainFromPath(path: string): string | null {
  const match = path.match(/\/domains\/(production|staging)\/([^/]+)/);
  return match ? match[2] : null;
}

// Build VAL URL for table
function getValUrl(path: string, tableId: string): string | null {
  const domain = extractDomainFromPath(path);
  if (!domain) return null;
  return `https://${domain}.thinkval.io/data-models/${tableId}`;
}

export function TableDetails({ tablePath, tableName }: TableDetailsProps) {
  const [activeTab, setActiveTab] = useState<TabType>("details");
  const [definition, setDefinition] = useState<TableDefinition | null>(null);
  const [analysis, setAnalysis] = useState<TableAnalysis | null>(null);
  const [sample, setSample] = useState<TableSample | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        // Load definition_details.json
        try {
          const detailsPath = `${tablePath}/definition_details.json`;
          const content = await invoke<string>("read_file", { path: detailsPath });
          setDefinition(JSON.parse(content));
        } catch {
          // Try definition.json as fallback
          try {
            const defPath = `${tablePath}/definition.json`;
            const content = await invoke<string>("read_file", { path: defPath });
            setDefinition(JSON.parse(content));
          } catch {
            setDefinition(null);
          }
        }

        // Load definition_analysis.json
        try {
          const analysisPath = `${tablePath}/definition_analysis.json`;
          const content = await invoke<string>("read_file", { path: analysisPath });
          setAnalysis(JSON.parse(content));
        } catch {
          setAnalysis(null);
        }

        // Load definition_sample.json
        try {
          const samplePath = `${tablePath}/definition_sample.json`;
          const content = await invoke<string>("read_file", { path: samplePath });
          setSample(JSON.parse(content));
        } catch {
          setSample(null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load table data");
      } finally {
        setLoading(false);
      }
    }

    if (tablePath) {
      loadData();
    }
  }, [tablePath]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-pulse text-zinc-500">Loading table details...</div>
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
          <Database size={14} />
          {definition?.meta?.space && <span>{definition.meta.space}</span>}
          {definition?.meta?.zone && <span>› {definition.meta.zone}</span>}
        </div>
        <h2 className="text-xl font-semibold text-zinc-100">
          {definition?.meta?.displayName || tableName}
        </h2>
        <p className="text-sm text-zinc-500 font-mono mt-1">
          {definition?.meta?.tableName || tableName}
        </p>

        {/* Open in VAL */}
        {(() => {
          const valUrl = getValUrl(tablePath, tableName);
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

        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          <TabButton active={activeTab === "details"} onClick={() => setActiveTab("details")}>
            Details
          </TabButton>
          <TabButton active={activeTab === "sample"} onClick={() => setActiveTab("sample")} disabled={!sample}>
            Sample Data
          </TabButton>
          <TabButton active={activeTab === "analysis"} onClick={() => setActiveTab("analysis")} disabled={!analysis}>
            AI Analysis
          </TabButton>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "details" && <DetailsTab definition={definition} />}
        {activeTab === "sample" && <SampleTab sample={sample} />}
        {activeTab === "analysis" && <AnalysisTab analysis={analysis} />}
      </div>
    </div>
  );
}

// Tab button
function TabButton({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-3 py-1.5 text-sm rounded-md transition-colors",
        disabled
          ? "text-zinc-600 cursor-not-allowed"
          : active
            ? "bg-zinc-700 text-zinc-100"
            : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
      )}
    >
      {children}
    </button>
  );
}

// Details tab
function DetailsTab({ definition }: { definition: TableDefinition | null }) {
  const [showAllColumns, setShowAllColumns] = useState(false);

  if (!definition) {
    return <div className="text-zinc-500">No definition data available</div>;
  }

  // Combine system and data columns
  const allColumns = [
    ...(definition.columns?.data || []),
    ...(definition.columns?.system || []),
  ];
  const displayedColumns = showAllColumns ? allColumns : allColumns.slice(0, 20);

  return (
    <div className="space-y-6">
      {/* Health status */}
      {definition.health && (
        <div className="bg-zinc-900 rounded-lg p-4">
          <h3 className="text-sm font-medium text-zinc-300 mb-3">Health Status</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <span className="text-xs text-zinc-500">Score</span>
              <p className={cn(
                "text-lg font-semibold",
                (definition.health.score ?? 0) >= 80 ? "text-green-400" :
                (definition.health.score ?? 0) >= 50 ? "text-yellow-400" : "text-red-400"
              )}>{definition.health.score ?? "-"}%</p>
            </div>
            <div>
              <span className="text-xs text-zinc-500">Row Count</span>
              <p className="text-sm text-zinc-200">{definition.health.rowCount || "-"}</p>
            </div>
            <div>
              <span className="text-xs text-zinc-500">Data Source</span>
              <p className="text-sm text-zinc-200">{definition.meta?.dataSource || "-"}</p>
            </div>
          </div>
          {definition.health.status && (
            <p className="text-xs text-zinc-500 mt-2">{definition.health.status}</p>
          )}
        </div>
      )}

      {/* Columns */}
      {allColumns.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
            <Table size={14} />
            Columns ({allColumns.length})
          </h3>
          <div className="bg-zinc-900 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-3 py-2 text-zinc-400 font-medium">Name</th>
                  <th className="text-left px-3 py-2 text-zinc-400 font-medium">Column</th>
                  <th className="text-left px-3 py-2 text-zinc-400 font-medium">Type</th>
                </tr>
              </thead>
              <tbody>
                {displayedColumns.map((col, i) => (
                  <tr key={i} className="border-b border-zinc-800/50 last:border-0">
                    <td className="px-3 py-2 text-zinc-200 text-xs">{col.name}</td>
                    <td className="px-3 py-2 text-zinc-400 font-mono text-xs">{col.column}</td>
                    <td className="px-3 py-2 text-zinc-500 text-xs">{col.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {allColumns.length > 20 && (
              <button
                onClick={() => setShowAllColumns(!showAllColumns)}
                className="w-full px-3 py-2 text-xs text-teal-400 hover:bg-zinc-800 flex items-center justify-center gap-1"
              >
                {showAllColumns ? (
                  <>
                    <ChevronDown size={12} />
                    Show less
                  </>
                ) : (
                  <>
                    <ChevronRight size={12} />
                    Show all {allColumns.length} columns
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Sample tab
function SampleTab({ sample }: { sample: TableSample | null }) {
  if (!sample || !sample.sampleData || sample.sampleData.length === 0) {
    return <div className="text-zinc-500">No sample data available</div>;
  }

  const data = sample.sampleData;
  const columns = Object.keys(data[0]);

  return (
    <div>
      <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
        <FileJson size={14} />
        Sample Records ({data.length} rows)
      </h3>
      <div className="bg-zinc-900 rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800">
              {columns.slice(0, 8).map((col) => (
                <th key={col} className="text-left px-2 py-2 text-zinc-400 font-medium whitespace-nowrap">
                  {col}
                </th>
              ))}
              {columns.length > 8 && (
                <th className="text-left px-2 py-2 text-zinc-500">+{columns.length - 8} more</th>
              )}
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 10).map((row, i) => (
              <tr key={i} className="border-b border-zinc-800/50 last:border-0">
                {columns.slice(0, 8).map((col) => (
                  <td key={col} className="px-2 py-2 text-zinc-300 max-w-[200px] truncate">
                    {String(row[col] ?? "-")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Analysis tab
function AnalysisTab({ analysis }: { analysis: TableAnalysis | null }) {
  if (!analysis) {
    return <div className="text-zinc-500">No AI analysis available. Run table analysis to generate.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Classification */}
      {analysis.classification && (
        <div className="bg-zinc-900 rounded-lg p-4">
          <h3 className="text-sm font-medium text-zinc-300 mb-2 flex items-center gap-2">
            <Sparkles size={14} className="text-teal-400" />
            Classification
          </h3>
          <div className="flex gap-4">
            <div>
              <span className="text-xs text-zinc-500">Data Type</span>
              <p className="text-sm text-zinc-200">{analysis.classification.dataType}</p>
            </div>
            {analysis.classification.suggestedName && (
              <div>
                <span className="text-xs text-zinc-500">Suggested Name</span>
                <p className="text-sm text-zinc-200">{analysis.classification.suggestedName}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Summary */}
      {analysis.summary && (
        <div className="bg-zinc-900 rounded-lg p-4">
          <h3 className="text-sm font-medium text-zinc-300 mb-2">Summary</h3>
          <p className="text-sm text-zinc-400 leading-relaxed">{analysis.summary.full || analysis.summary.short}</p>
        </div>
      )}

      {/* Use Cases */}
      {analysis.useCases && (
        <div className="bg-zinc-900 rounded-lg p-4">
          <h3 className="text-sm font-medium text-zinc-300 mb-3">Use Cases</h3>
          <div className="grid md:grid-cols-2 gap-4">
            {analysis.useCases.operational && analysis.useCases.operational.length > 0 && (
              <div>
                <span className="text-xs text-zinc-500 uppercase tracking-wider">Operational</span>
                <ul className="mt-2 space-y-1">
                  {analysis.useCases.operational.map((uc, i) => (
                    <li key={i} className="text-sm text-zinc-400">• {uc}</li>
                  ))}
                </ul>
              </div>
            )}
            {analysis.useCases.strategic && analysis.useCases.strategic.length > 0 && (
              <div>
                <span className="text-xs text-zinc-500 uppercase tracking-wider">Strategic</span>
                <ul className="mt-2 space-y-1">
                  {analysis.useCases.strategic.map((uc, i) => (
                    <li key={i} className="text-sm text-zinc-400">• {uc}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
