// src/modules/public-data/PublicDataModule.tsx
// Public Data module — manage and sync public datasets for tryval

import { useState, useEffect } from "react";
import { usePersistedModuleView } from "../../hooks/usePersistedModuleView";
import {
  Database,
  RefreshCw,
  Clock,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Loader2,
  Globe,
  Play,
  ChevronRight,
} from "lucide-react";
import { ViewTab } from "../../components/ViewTab";
import { useViewContextStore } from "../../stores/viewContextStore";
import { useSources, useSyncSource, useSyncAllP1, useClassifyJobs } from "../../hooks/public-data";
import { useIngestionLogs } from "../../hooks/public-data";
import type { DataSource, IngestionLog } from "../../lib/public-data/types";
import { STATUS_CONFIG, PRIORITY_LABELS, DOMAIN_LABELS, DATA_TYPE_LABELS } from "../../lib/public-data/types";

type ViewType = "sources" | "history";

export function PublicDataModule() {
  const [activeView, setActiveView] = usePersistedModuleView<ViewType>("public-data", "sources");
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  const setViewContext = useViewContextStore((s) => s.setView);
  useEffect(() => {
    setViewContext("public-data", activeView === "sources" ? "Data Sources" : "Sync History");
  }, [activeView, setViewContext]);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-4">
        <div className="flex">
          <ViewTab label="Sources" icon={Database} active={activeView === "sources"} onClick={() => setActiveView("sources")} />
          <ViewTab label="History" icon={Clock} active={activeView === "history"} onClick={() => setActiveView("history")} />
        </div>
        <SyncAllButton />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeView === "sources" && (
          <SourcesView selectedId={selectedSourceId} onSelect={setSelectedSourceId} />
        )}
        {activeView === "history" && <HistoryView />}
      </div>
    </div>
  );
}

// ─── Sync All Button ────────────────────────────────────

function SyncAllButton() {
  const syncAll = useSyncAllP1();

  return (
    <button
      onClick={() => syncAll.mutate()}
      disabled={syncAll.isPending}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-lg transition-colors"
    >
      {syncAll.isPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
      Sync All
    </button>
  );
}

// ─── Sources View ───────────────────────────────────────

function SourcesView({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) {
  const { data: sources = [], isLoading } = useSources();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-400">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  // Group by domain
  const grouped = sources.reduce<Record<string, DataSource[]>>((acc, s) => {
    (acc[s.domain] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="flex h-full">
      {/* Source list */}
      <div className="flex-1 overflow-y-auto">
        {Object.entries(grouped).map(([domain, domainSources]) => (
          <div key={domain}>
            <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800">
              {DOMAIN_LABELS[domain] || domain} — {domainSources.length} sources
            </div>
            {domainSources.map((source) => (
              <SourceRow
                key={source.id}
                source={source}
                selected={source.id === selectedId}
                onClick={() => onSelect(source.id === selectedId ? null : source.id)}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Detail panel */}
      {selectedId && (
        <SourceDetailPanel sourceId={selectedId} onClose={() => onSelect(null)} />
      )}
    </div>
  );
}

// ─── Source Row ──────────────────────────────────────────

function SourceRow({ source, selected, onClick }: { source: DataSource; selected: boolean; onClick: () => void }) {
  const syncSource = useSyncSource();
  const classify = useClassifyJobs();
  const isRunning = source.sync_status === "running" || syncSource.isPending;
  const isMcf = source.target_table?.includes("mcf_job_postings");

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 cursor-pointer transition-colors ${
        selected ? "bg-teal-50 dark:bg-teal-950/30" : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
      }`}
    >
      {/* Status icon */}
      <div className="flex-shrink-0">
        {source.sync_status === "success" && <CheckCircle2 size={16} className="text-green-500" />}
        {source.sync_status === "error" && <AlertCircle size={16} className="text-red-500" />}
        {source.sync_status === "running" && <Loader2 size={16} className="text-blue-500 animate-spin" />}
        {source.sync_status === "never" && <Globe size={16} className="text-zinc-400" />}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
            {source.name}
          </span>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
            {PRIORITY_LABELS[source.priority] || `P${source.priority}`}
          </span>
        </div>
        <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
          {source.description}
        </div>
      </div>

      {/* Data type pill */}
      <DataTypePill dataType={source.data_type} />

      {/* Stats */}
      <div className="flex-shrink-0 text-right">
        <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {source.row_count > 0 ? source.row_count.toLocaleString() : "—"}
        </div>
        <div className="text-[11px] text-zinc-400">
          {source.last_synced_at
            ? new Date(source.last_synced_at).toLocaleDateString("en-SG", { day: "numeric", month: "short" })
            : "never"}
        </div>
      </div>

      {/* Classify button (MCF only) */}
      {isMcf && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            classify.mutate();
          }}
          disabled={classify.isPending}
          className="flex-shrink-0 flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30 hover:bg-violet-100 dark:hover:bg-violet-900/40 disabled:opacity-50 rounded-md transition-colors"
          title="Classify jobs with AI"
        >
          {classify.isPending ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          Classify
        </button>
      )}

      {/* Sync button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          syncSource.mutate({ id: source.id, name: source.name });
        }}
        disabled={isRunning}
        className="flex-shrink-0 p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50 transition-colors"
        title="Sync now"
      >
        {isRunning ? (
          <Loader2 size={14} className="text-blue-500 animate-spin" />
        ) : (
          <RefreshCw size={14} className="text-zinc-400" />
        )}
      </button>

      <ChevronRight size={14} className="flex-shrink-0 text-zinc-300 dark:text-zinc-600" />
    </div>
  );
}

// ─── Source Detail Panel ────────────────────────────────

function SourceDetailPanel({ sourceId }: { sourceId: string; onClose?: () => void }) {
  const { data: sources = [] } = useSources();
  const source = sources.find((s) => s.id === sourceId);
  const { data: logs = [] } = useIngestionLogs(sourceId, 10);
  const syncSource = useSyncSource();

  if (!source) return null;

  return (
    <div className="w-[420px] flex-shrink-0 border-l border-zinc-200 dark:border-zinc-800 overflow-y-auto bg-white dark:bg-zinc-950">
      <div className="p-4 space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{source.name}</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{source.description}</p>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Rows" value={source.row_count > 0 ? source.row_count.toLocaleString() : "—"} />
          <StatCard label="Status" value={STATUS_CONFIG[source.sync_status]?.label || source.sync_status} />
          <StatCard label="Type" value={DATA_TYPE_LABELS[source.data_type] || source.data_type} />
          <StatCard label="Refresh" value={source.refresh_frequency} />
        </div>

        {/* Error display */}
        {source.sync_status === "error" && source.sync_error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
            <p className="text-xs text-red-700 dark:text-red-300 font-mono">{source.sync_error}</p>
          </div>
        )}

        {/* Sync button */}
        <button
          onClick={() => syncSource.mutate({ id: source.id, name: source.name })}
          disabled={syncSource.isPending || source.sync_status === "running"}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-lg transition-colors"
        >
          {syncSource.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Sync Now
        </button>

        {/* Config */}
        <div>
          <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Configuration</h3>
          <pre className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3 overflow-x-auto">
            {JSON.stringify(source.api_config, null, 2)}
          </pre>
        </div>

        {/* Recent syncs */}
        <div>
          <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Recent Syncs</h3>
          {logs.length === 0 ? (
            <p className="text-xs text-zinc-400">No sync history yet</p>
          ) : (
            <div className="space-y-1.5">
              {logs.map((log) => (
                <LogRow key={log.id} log={log} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900">
      <div className="text-[11px] text-zinc-400 dark:text-zinc-500">{label}</div>
      <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mt-0.5">{value}</div>
    </div>
  );
}

// ─── History View ───────────────────────────────────────

function HistoryView() {
  const { data: logs = [], isLoading } = useIngestionLogs(undefined, 50);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-400">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-zinc-400">
        <Clock size={32} className="mb-2" />
        <p className="text-sm">No sync history yet</p>
        <p className="text-xs mt-1">Run a sync from the Sources tab to get started</p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
          <tr>
            <th className="text-left px-4 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">Source</th>
            <th className="text-left px-4 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">Status</th>
            <th className="text-right px-4 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">Rows</th>
            <th className="text-right px-4 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">Duration</th>
            <th className="text-right px-4 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">When</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900">
              <td className="px-4 py-2 text-zinc-900 dark:text-zinc-100 font-medium">{log.source_id}</td>
              <td className="px-4 py-2">
                <StatusBadge status={log.status} />
              </td>
              <td className="px-4 py-2 text-right text-zinc-600 dark:text-zinc-400">
                {log.rows_upserted > 0 ? log.rows_upserted.toLocaleString() : "—"}
              </td>
              <td className="px-4 py-2 text-right text-zinc-600 dark:text-zinc-400">
                {log.duration_ms ? `${(log.duration_ms / 1000).toFixed(1)}s` : "—"}
              </td>
              <td className="px-4 py-2 text-right text-zinc-500 dark:text-zinc-400 text-xs">
                {new Date(log.started_at).toLocaleString("en-SG", {
                  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Shared Components ──────────────────────────────────

function LogRow({ log }: { log: IngestionLog }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 rounded bg-zinc-50 dark:bg-zinc-900">
      <div className="flex items-center gap-2">
        <StatusBadge status={log.status} />
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {log.rows_upserted > 0 ? `${log.rows_upserted.toLocaleString()} rows` : ""}
        </span>
      </div>
      <div className="text-[11px] text-zinc-400">
        {new Date(log.started_at).toLocaleString("en-SG", {
          day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
        })}
        {log.duration_ms ? ` (${(log.duration_ms / 1000).toFixed(1)}s)` : ""}
      </div>
    </div>
  );
}

function DataTypePill({ dataType }: { dataType: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    snapshot: { label: "Snapshot", cls: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400" },
    time_series_monthly: { label: "Monthly", cls: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" },
    time_series_quarterly: { label: "Quarterly", cls: "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400" },
    time_series_annual: { label: "Annual", cls: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" },
    realtime: { label: "Real-time", cls: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" },
  };
  const c = config[dataType] || { label: dataType, cls: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500" };

  return (
    <span className={`flex-shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${c.cls}`}>
      {c.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    success: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
    error: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
    running: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
  };

  return (
    <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${colors[status] || "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"}`}>
      {status}
    </span>
  );
}
