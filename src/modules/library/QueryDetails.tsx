// src/modules/library/QueryDetails.tsx
// Detailed view for individual query folders

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileCode, Database, AlertTriangle, Copy, Check, ExternalLink } from "lucide-react";

interface QueryDetailsProps {
  queryPath: string;
  queryName: string;
}

// Actual structure from query definition.json
interface QueryFilter {
  mode?: string;
  field?: string;
  operand?: string | string[];
  operator?: {
    type: string;
    value: string;
  };
}

interface QueryDefinition {
  id: number;
  temp_id?: number;
  seq_id?: number;
  name: string;
  category?: string;
  created_by?: number;
  created_date?: string;
  updated_date?: string;
  updated_by?: number;
  datasource?: {
    dsid?: number;
    basicInfo?: {
      desc?: string;
      name?: string;
      type?: string;
    };
    queryInfo?: {
      tableInfo?: {
        id?: string;
        name?: string;
        fields?: string[];
        sourceType?: string;
      };
      filterInfo?: Array<{
        rowId?: string;
        filters?: QueryFilter[];
      }>;
      groupingInfo?: Array<{
        field?: string;
        dataType?: string;
        dateGroup?: string;
      }>;
      aggregationInfo?: Array<{
        field?: string;
        aggField?: string;
        aggregate?: string;
      }>;
    };
  };
}

// Extract domain name from path for VAL URL
function extractDomainFromPath(path: string): string | null {
  const match = path.match(/\/domains\/(production|staging)\/([^/]+)/);
  return match ? match[2] : null;
}

// Build VAL URL for query
function getValUrl(path: string, queryId: string): string | null {
  const domain = extractDomainFromPath(path);
  if (!domain) return null;
  return `https://${domain}.thinkval.io/queries/${queryId}`;
}

export function QueryDetails({ queryPath, queryName }: QueryDetailsProps) {
  const [definition, setDefinition] = useState<QueryDefinition | null>(null);
  const [sqlContent, setSqlContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        // Load definition.json
        try {
          const defPath = `${queryPath}/definition.json`;
          const content = await invoke<string>("read_file", { path: defPath });
          const def = JSON.parse(content);
          setDefinition(def);

          // SQL might be in definition
          if (def.sql) {
            setSqlContent(def.sql);
          }
        } catch {
          setDefinition(null);
        }

        // Try to load SQL file if not in definition
        if (!sqlContent) {
          try {
            const sqlPath = `${queryPath}/query.sql`;
            const content = await invoke<string>("read_file", { path: sqlPath });
            setSqlContent(content);
          } catch {
            // No separate SQL file
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load query data");
      } finally {
        setLoading(false);
      }
    }

    if (queryPath) {
      loadData();
    }
  }, [queryPath]);

  const handleCopy = async () => {
    if (sqlContent) {
      await navigator.clipboard.writeText(sqlContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-pulse text-zinc-500">Loading query details...</div>
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
          <FileCode size={14} />
          <span>Query</span>
        </div>
        <h2 className="text-xl font-semibold text-zinc-100">
          {definition?.name || queryName}
        </h2>
        {definition?.datasource?.basicInfo?.desc && (
          <p className="text-sm text-zinc-500 mt-1">{definition.datasource.basicInfo.desc}</p>
        )}
        {definition?.category && (
          <span className="inline-block mt-1 px-2 py-0.5 bg-zinc-800 rounded text-xs text-zinc-400">
            {definition.category}
          </span>
        )}

        {/* Open in VAL */}
        {(() => {
          const valUrl = getValUrl(queryPath, queryName);
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
        {/* Source Table */}
        {definition?.datasource?.queryInfo?.tableInfo && (
          <div className="bg-zinc-900 rounded-lg p-4">
            <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
              <Database size={14} />
              Source Table
            </h3>
            <div className="space-y-2">
              <div>
                <span className="text-xs text-zinc-500">Table Name: </span>
                <span className="text-sm text-zinc-200">{definition.datasource.queryInfo.tableInfo.name}</span>
              </div>
              <div>
                <span className="text-xs text-zinc-500">Table ID: </span>
                <span className="text-sm text-zinc-300 font-mono">{definition.datasource.queryInfo.tableInfo.id}</span>
              </div>
              {definition.datasource.queryInfo.tableInfo.sourceType && (
                <div>
                  <span className="text-xs text-zinc-500">Type: </span>
                  <span className="text-sm text-zinc-400">{definition.datasource.queryInfo.tableInfo.sourceType}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Fields */}
        {definition?.datasource?.queryInfo?.tableInfo?.fields && definition.datasource.queryInfo.tableInfo.fields.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-zinc-300 mb-3">
              Fields ({definition.datasource.queryInfo.tableInfo.fields.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {definition.datasource.queryInfo.tableInfo.fields.map((field, i) => (
                <span
                  key={i}
                  className="px-2 py-1 bg-zinc-800 rounded text-xs text-zinc-300 font-mono"
                >
                  {field}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Grouping */}
        {definition?.datasource?.queryInfo?.groupingInfo && definition.datasource.queryInfo.groupingInfo.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-zinc-300 mb-3">
              Grouping ({definition.datasource.queryInfo.groupingInfo.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {definition.datasource.queryInfo.groupingInfo.map((g, i) => (
                <span
                  key={i}
                  className="px-2 py-1 bg-zinc-800 rounded text-xs text-zinc-300"
                >
                  <span className="font-mono">{g.field}</span>
                  {g.dataType && <span className="text-zinc-500 ml-1">({g.dataType})</span>}
                  {g.dateGroup && <span className="text-teal-400 ml-1">• {g.dateGroup}</span>}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Aggregations */}
        {definition?.datasource?.queryInfo?.aggregationInfo && definition.datasource.queryInfo.aggregationInfo.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-zinc-300 mb-3">
              Aggregations ({definition.datasource.queryInfo.aggregationInfo.length})
            </h3>
            <div className="bg-zinc-900 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left px-3 py-2 text-zinc-400 font-medium">Field</th>
                    <th className="text-left px-3 py-2 text-zinc-400 font-medium">Function</th>
                    <th className="text-left px-3 py-2 text-zinc-400 font-medium">Output</th>
                  </tr>
                </thead>
                <tbody>
                  {definition.datasource.queryInfo.aggregationInfo.map((agg, i) => (
                    <tr key={i} className="border-b border-zinc-800/50 last:border-0">
                      <td className="px-3 py-2 text-zinc-200 font-mono text-xs">{agg.field}</td>
                      <td className="px-3 py-2 text-teal-400 text-xs">{agg.aggregate}</td>
                      <td className="px-3 py-2 text-zinc-400 font-mono text-xs">{agg.aggField}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SQL file if exists */}
        {sqlContent && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-zinc-300">SQL File</h3>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded"
              >
                {copied ? (
                  <>
                    <Check size={12} className="text-green-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy size={12} />
                    Copy
                  </>
                )}
              </button>
            </div>
            <pre className="bg-zinc-900 rounded-lg p-4 text-xs text-zinc-300 font-mono overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto">
              {sqlContent}
            </pre>
          </div>
        )}

        {/* Metadata */}
        {definition && (
          <div className="bg-zinc-900 rounded-lg p-4">
            <h3 className="text-sm font-medium text-zinc-300 mb-3">Metadata</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-zinc-500">Query ID: </span>
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

        {!definition && !sqlContent && (
          <div className="text-center text-zinc-500 py-8">
            <FileCode size={32} className="mx-auto mb-3 opacity-50" />
            <p>No query definition found</p>
          </div>
        )}
      </div>
    </div>
  );
}
