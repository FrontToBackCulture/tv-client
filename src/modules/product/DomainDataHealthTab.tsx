// src/modules/product/DomainDataHealthTab.tsx
// Data health matrix — outlet × source freshness grid

import { useMemo, useState } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { cn } from "../../lib/cn";
import { useDataHealth, type OutletCoverage, type SourceResult } from "../../hooks/val-sync/useDataHealth";
import { EmptyState } from "../../components/EmptyState";
import { formatRelativeShort } from "./domainDetailShared";

interface DomainDataHealthTabProps {
  domainName: string;
  globalPath: string;
  entitiesPath: string | null;
}

const FRESHNESS_COLORS = {
  green: "text-green-500",
  amber: "text-amber-500",
  red: "text-red-500",
} as const;

const FRESHNESS_BG = {
  green: "bg-green-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
} as const;

export function DomainDataHealthTab({ domainName, globalPath, entitiesPath }: DomainDataHealthTabProps) {
  const {
    results,
    tables,
    thresholds,
    entityLabel,
    isLoading,
    isFetching,
    lastFetchedAt,
    refetchAll,
  } = useDataHealth(domainName, globalPath, entitiesPath, true);

  const [hoveredCell, setHoveredCell] = useState<{ outlet: string; tableId: string } | null>(null);

  // Build matrix: unique outlets across all sources
  const { outlets, matrix } = useMemo(() => {
    const outletSet = new Set<string>();
    for (const source of results) {
      for (const o of source.outlets) outletSet.add(o.entity);
    }
    const outlets = [...outletSet].sort();

    const matrix: Record<string, Record<string, OutletCoverage>> = {};
    for (const outlet of outlets) {
      matrix[outlet] = {};
      for (const source of results) {
        const match = source.outlets.find((o) => o.entity === outlet);
        if (match) matrix[outlet][source.table_id] = match;
      }
    }

    return { outlets, matrix };
  }, [results]);

  // Build a lookup: table_id → SourceResult (loaded or not)
  const resultMap = useMemo(() => {
    const map: Record<string, SourceResult | undefined> = {};
    for (const r of results) map[r.table_id] = r;
    return map;
  }, [results]);

  // Scanning entity schemas — nothing to show yet
  if (isLoading && tables.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-zinc-400" />
        <span className="ml-2 text-sm text-zinc-400">Scanning entity schemas...</span>
      </div>
    );
  }

  if (!isLoading && tables.length === 0) {
    return (
      <EmptyState
        message="No entities tagged for health monitoring. Tag a field with 'health-entity' in the Data Model schema and set a freshness column."
        className="py-8"
      />
    );
  }

  const lastChecked = lastFetchedAt ? new Date(lastFetchedAt).toISOString() : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Data Health</h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Freshness by {entityLabel.toLowerCase()} across {tables.length} source{tables.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastChecked && (
            <span className="text-[10px] text-zinc-400">
              {formatRelativeShort(lastChecked)}
            </span>
          )}
          <button
            onClick={refetchAll}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={cn(isFetching && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error sources */}
      {results.filter((r) => r.error).map((r) => (
        <div key={r.table_id} className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
          <span className="font-medium">{r.label}:</span> {r.error}
        </div>
      ))}

      {/* Matrix table — shows immediately with table headers, data loads progressively */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th className="text-left px-3 py-2 text-zinc-500 font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10 min-w-[160px]">
                {entityLabel}
              </th>
              {tables.map((table) => (
                <th key={table.table_id} className="text-left px-3 py-2 text-zinc-500 font-medium whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    {table.label}
                    {!resultMap[table.table_id] && (
                      <Loader2 size={10} className="animate-spin text-zinc-400" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {outlets.length > 0 ? (
              outlets.map((outlet, rowIdx) => (
                <tr key={outlet} className="border-b border-zinc-100 dark:border-zinc-800/50 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                  <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300 font-mono sticky left-0 bg-white dark:bg-zinc-950 z-10">
                    {outlet}
                  </td>
                  {tables.map((source) => {
                    const sourceResult = resultMap[source.table_id];
                    // Source still loading
                    if (!sourceResult) {
                      return (
                        <td key={source.table_id} className="px-3 py-2">
                          <div className="h-4 w-32 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
                        </td>
                      );
                    }
                    // Source errored
                    if (sourceResult.error) {
                      return (
                        <td key={source.table_id} className="px-3 py-2 text-zinc-300 dark:text-zinc-600">—</td>
                      );
                    }
                    const cell = matrix[outlet]?.[source.table_id];
                    const isHovered = hoveredCell?.outlet === outlet && hoveredCell?.tableId === source.table_id;
                    const tooltipBelow = rowIdx < 2;

                    if (!cell) {
                      return (
                        <td key={source.table_id} className="px-3 py-2 text-zinc-300 dark:text-zinc-600">
                          —
                        </td>
                      );
                    }

                    return (
                      <td
                        key={source.table_id}
                        className="px-3 py-2 relative"
                        onMouseEnter={() => setHoveredCell({ outlet, tableId: source.table_id })}
                        onMouseLeave={() => setHoveredCell(null)}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className={cn("inline-block w-1.5 h-1.5 rounded-full flex-shrink-0", FRESHNESS_BG[cell.freshness])} />
                          <span className="text-zinc-400">{formatDate(cell.earliest)}</span>
                          <span className="text-zinc-400">{"→"}</span>
                          <span className={cn("text-zinc-700 dark:text-zinc-300", cell.freshness === "red" && "text-red-600 dark:text-red-400")}>
                            {formatDate(cell.latest)}
                          </span>
                          <span className={cn("text-[10px] ml-1",
                            cell.cadence_status === "ok" ? "text-zinc-400" :
                            cell.cadence_status === "warning" ? "text-amber-500" : "text-red-500"
                          )}>
                            {cell.recent_per_week}/{cell.avg_per_week} d/wk
                          </span>
                        </div>

                        {/* Tooltip */}
                        {isHovered && (
                          <div className={cn(
                            "absolute left-1/2 -translate-x-1/2 px-3 py-2 rounded-lg bg-zinc-800 dark:bg-zinc-700 text-white text-[10px] whitespace-nowrap z-20 shadow-lg pointer-events-none",
                            tooltipBelow ? "top-full mt-2" : "bottom-full mb-2"
                          )}>
                            <div className="space-y-0.5">
                              <div>Historical: {cell.avg_per_week} days/wk ({cell.day_count}d total)</div>
                              <div>Last 4 wks: {cell.recent_per_week} days/wk ({cell.recent_days}d)</div>
                              {cell.cadence_status !== "ok" && (
                                <div className={cell.cadence_status === "drop" ? "text-red-400" : "text-amber-400"}>
                                  {cell.cadence_status === "drop" ? "Significant drop in cadence" : "Cadence below normal"}
                                </div>
                              )}
                              <div className={FRESHNESS_COLORS[cell.freshness]}>
                                {cell.days_stale === 0 ? "Up to date" : `${cell.days_stale}d stale`}
                              </div>
                            </div>
                            {/* Arrow */}
                            <div className={cn(
                              "absolute left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-transparent",
                              tooltipBelow
                                ? "bottom-full border-b-4 border-b-zinc-800 dark:border-b-zinc-700"
                                : "top-full border-t-4 border-t-zinc-800 dark:border-t-zinc-700"
                            )} />
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            ) : (
              // Placeholder rows while data is loading
              results.length === 0 && !isLoading ? (
                <tr>
                  <td colSpan={tables.length + 1} className="px-3 py-8 text-center text-zinc-400 text-xs">
                    No entity data found in monitored tables
                  </td>
                </tr>
              ) : (
                // Shimmer rows while waiting for first results
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800/50 last:border-0">
                    <td className="px-3 py-2 sticky left-0 bg-white dark:bg-zinc-950 z-10">
                      <div className="h-4 w-24 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
                    </td>
                    {tables.map((source) => (
                      <td key={source.table_id} className="px-3 py-2">
                        <div className="h-4 w-32 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              )
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      {outlets.length > 0 && (
        <div className="flex items-center gap-4 text-[10px] text-zinc-400">
          <div className="flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" />
            {"≤"}{thresholds.green_days}d
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
            {thresholds.green_days + 1}{"–"}{thresholds.amber_days}d
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
            {">"}{thresholds.amber_days}d
          </div>
        </div>
      )}
    </div>
  );
}

/** Format ISO date to short display with year (e.g. "Feb 22 '25") */
function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const day = d.getDate();
  const year = String(d.getFullYear()).slice(2);
  return `${month} ${day} '${year}`;
}

