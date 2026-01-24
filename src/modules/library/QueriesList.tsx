// src/modules/library/QueriesList.tsx
// List view for queries folder showing all saved queries

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search, AlertTriangle, ChevronRight, FileCode, Database } from "lucide-react";

interface QueriesListProps {
  queriesPath: string;
  domainName: string;
  onQuerySelect?: (queryPath: string, queryName: string) => void;
}

interface QueryEntry {
  id: string;
  name: string;
  displayName: string;
  path: string;
  hasDefinition: boolean;
  description?: string;
  tables?: string[];
  queryType?: string;
}

export function QueriesList({ queriesPath, domainName, onQuerySelect }: QueriesListProps) {
  const [queries, setQueries] = useState<QueryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function loadQueries() {
      setLoading(true);
      setError(null);

      try {
        // List query directories
        const entries = await invoke<Array<{ name: string; path: string; is_dir: boolean }>>(
          "list_directory",
          { path: queriesPath }
        );

        const queryDirs = entries.filter((e) => e.is_dir && !e.name.startsWith("."));

        // Build query entries
        const queryEntries: QueryEntry[] = await Promise.all(
          queryDirs.map(async (dir) => {
            const queryPath = dir.path;
            const queryId = dir.name;

            let displayName = queryId;
            let hasDefinition = false;
            let description: string | undefined;
            let tables: string[] | undefined;
            let queryType: string | undefined;

            try {
              const defContent = await invoke<string>("read_file", {
                path: `${queryPath}/definition.json`,
              });
              const def = JSON.parse(defContent);
              hasDefinition = true;
              displayName = def.name || def.displayName || queryId;
              description = def.description;
              tables = def.tables;
              queryType = def.type;
            } catch {
              // No definition
            }

            return {
              id: queryId,
              name: queryId,
              displayName,
              path: queryPath,
              hasDefinition,
              description,
              tables,
              queryType,
            };
          })
        );

        // Sort by display name
        queryEntries.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setQueries(queryEntries);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load queries");
      } finally {
        setLoading(false);
      }
    }

    if (queriesPath) {
      loadQueries();
    }
  }, [queriesPath]);

  // Filter queries
  const filteredQueries = queries.filter((q) =>
    q.displayName.toLowerCase().includes(search.toLowerCase()) ||
    q.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-pulse text-zinc-500">Loading queries...</div>
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
          <span>{domainName}</span>
        </div>
        <h2 className="text-xl font-semibold text-zinc-100">Queries</h2>
        <p className="text-sm text-zinc-500 mt-1">{queries.length} saved queries</p>

        {/* Search */}
        <div className="relative mt-4">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search queries..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded pl-8 pr-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-teal-500"
          />
        </div>
      </div>

      {/* Query list */}
      <div className="flex-1 overflow-y-auto">
        {filteredQueries.map((query) => (
          <button
            key={query.id}
            onClick={() => onQuerySelect?.(query.path, query.name)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/50 border-b border-zinc-800/50 text-left"
          >
            <FileCode size={16} className="text-yellow-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-zinc-200 truncate">{query.displayName}</div>
              {query.description && (
                <div className="text-xs text-zinc-500 truncate">{query.description}</div>
              )}
              {query.tables && query.tables.length > 0 && (
                <div className="flex items-center gap-1 mt-1">
                  <Database size={10} className="text-zinc-600" />
                  <span className="text-xs text-zinc-600">{query.tables.length} tables</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {query.queryType && (
                <span className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                  {query.queryType}
                </span>
              )}
              <ChevronRight size={14} className="text-zinc-600" />
            </div>
          </button>
        ))}

        {filteredQueries.length === 0 && (
          <div className="p-8 text-center text-zinc-500">
            {search ? "No queries match your search" : "No queries found"}
          </div>
        )}
      </div>
    </div>
  );
}
