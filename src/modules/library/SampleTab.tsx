// TableDetailPreview: SampleTab + SampleDataGrid

import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import { useAppStore } from "../../stores/appStore";
import { Loader2, Table, Tag } from "lucide-react";
import { cn } from "../../lib/cn";
import type { TableSample } from "./tableDetailTypes";
import { formatRelativeTimeShort } from "./tableDetailTypes";

function SampleDataGrid({ sample }: { sample: TableSample }) {
  const theme = useAppStore((s) => s.theme);
  const rowData = sample.rows || [];

  const columnNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (sample.columns) {
      for (const col of sample.columns) {
        map[col.column] = col.name || col.column;
      }
    }
    return map;
  }, [sample.columns]);

  const columnDefs = useMemo<ColDef[]>(() => {
    if (!rowData.length) return [];
    const columns = Object.keys(rowData[0]);
    return columns.map((col) => ({
      field: col,
      headerName: columnNameMap[col] || col,
      headerTooltip: col,
      minWidth: 100,
      flex: 1,
      resizable: true,
      sortable: true,
      filter: true,
      valueFormatter: (params: { value: unknown }) => {
        if (params.value === null || params.value === undefined) return "-";
        if (typeof params.value === "object") return JSON.stringify(params.value);
        return String(params.value);
      },
    }));
  }, [rowData, columnNameMap]);

  const defaultColDef = useMemo<ColDef>(() => ({
    resizable: true,
    sortable: true,
  }), []);

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="p-3 border-b border-zinc-200 dark:border-zinc-800">
        <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
          Sample Data ({rowData.length} rows, {columnDefs.length} columns)
        </h4>
        {sample.meta?.orderBy && (
          <p className="text-[10px] text-zinc-400 mt-0.5">
            Ordered by: <span className="font-mono">{sample.meta.orderBy}</span> DESC
          </p>
        )}
      </div>
      <div
        style={{ height: 400 }}
        className={`w-full ${theme === "dark" ? "ag-theme-alpine-dark" : "ag-theme-alpine"}`}
      >
        <AgGridReact
          theme="legacy"
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          suppressRowClickSelection={true}
          animateRows={false}
        />
      </div>
    </div>
  );
}

export function SampleTab({
  sample,
  onGenerate,
  isGenerating,
  onFetchCategorical,
  isFetchingCategorical,
}: {
  sample: TableSample | null;
  onGenerate?: () => void;
  isGenerating?: boolean;
  onFetchCategorical?: () => void;
  isFetchingCategorical?: boolean;
}) {
  const hasData = sample?.rows?.length;
  const lastSampled = formatRelativeTimeShort(sample?.meta?.sampledAt);

  return (
    <div className="p-4 space-y-4">
      {/* Generate button header */}
      {(onGenerate || onFetchCategorical) && (
        <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
          <div className="text-xs text-zinc-500">
            {hasData ? "Refresh data from VAL" : "Fetch data from VAL"}
            {lastSampled && (
              <span className="ml-2 text-zinc-400">
                • Sample fetched {lastSampled}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onGenerate && (
              <button
                onClick={onGenerate}
                disabled={isGenerating || isFetchingCategorical}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors",
                  isGenerating
                    ? "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
                    : "bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50"
                )}
              >
                {isGenerating ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Table size={12} />
                )}
                {isGenerating ? "Fetching..." : "Fetch Sample"}
              </button>
            )}
            {onFetchCategorical && (
              <button
                onClick={onFetchCategorical}
                disabled={isGenerating || isFetchingCategorical}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors",
                  isFetchingCategorical
                    ? "bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400"
                    : "bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-50"
                )}
                title="Fetch distinct categorical values from full table data"
              >
                {isFetchingCategorical ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Tag size={12} />
                )}
                {isFetchingCategorical ? "Fetching..." : "Fetch Categorical"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasData && (
        <div className="text-center text-zinc-500 py-8">
          <Table size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">No sample data available.</p>
          <p className="text-xs mt-1">Click "Fetch Sample" to load from VAL.</p>
        </div>
      )}

      {/* Query error */}
      {sample?.meta?.queryError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-xs text-red-600 dark:text-red-400">
          <span className="font-medium">Query Error:</span> {sample.meta.queryError}
        </div>
      )}

      {/* Total row count */}
      {hasData && sample?.meta?.totalRowCount !== undefined && (
        <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3 border border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">Total Rows in Table</span>
            <span className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">
              {sample.meta.totalRowCount.toLocaleString()}
            </span>
          </div>
          <div className="text-[10px] text-zinc-400 mt-1">
            Showing {sample.meta.rowCount || 0} sample rows
          </div>
        </div>
      )}

      {/* Categorical columns */}
      {sample?.columnStats && (() => {
        const categorical = Object.entries(sample.columnStats)
          .filter(([, stats]) => stats.isCategorical && stats.distinctValues)
          .sort(([, a], [, b]) => (a.displayName || "").localeCompare(b.displayName || ""));

        if (categorical.length === 0) return null;

        return (
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <div className="p-3 border-b border-zinc-200 dark:border-zinc-800">
              <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Categorical Columns ({categorical.length})
              </h4>
              <p className="text-[10px] text-zinc-400 mt-0.5">
                Columns with limited distinct values
              </p>
            </div>
            <div className="p-3 space-y-2 max-h-[200px] overflow-y-auto">
              {categorical.map(([colName, stats]) => (
                <div key={colName} className="text-xs">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {stats.displayName || colName}
                  </span>
                  <span className="text-zinc-400 ml-1">({stats.distinctCount})</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {stats.distinctValues?.slice(0, 10).map((val, i) => (
                      <span
                        key={i}
                        className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded text-[10px]"
                      >
                        {val || "(empty)"}
                      </span>
                    ))}
                    {(stats.distinctValues?.length || 0) > 10 && (
                      <span className="px-1.5 py-0.5 text-zinc-400 text-[10px]">
                        +{(stats.distinctValues?.length || 0) - 10} more
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Sample data AG Grid */}
      {hasData && <SampleDataGrid sample={sample} />}
    </div>
  );
}
