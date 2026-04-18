import { useState } from "react";
import { useQboConnection, useRecentSyncRuns, useTriggerSync, useTriggerReportsSync } from "../../hooks/finance";
import { RefreshCw, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { cn } from "../../lib/cn";

function formatDuration(started: string, completed: string | null): string {
  if (!completed) return "running…";
  const ms = new Date(completed).getTime() - new Date(started).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 1000)}s`;
}

export function SyncPanel() {
  const { data: connection } = useQboConnection();
  const { data: runs = [] } = useRecentSyncRuns(15);
  const triggerSync = useTriggerSync();
  const triggerReports = useTriggerReportsSync();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!connection) return null;

  const handleSync = async () => {
    setErrorMsg(null);
    try {
      await triggerSync.mutateAsync("all");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handleReports = async () => {
    setErrorMsg(null);
    try {
      await triggerReports.mutateAsync();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-900">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Sync</h3>
        <div className="flex gap-2">
          <button
            onClick={handleSync}
            disabled={triggerSync.isPending}
            className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-400 rounded-lg inline-flex items-center gap-1.5"
          >
            <RefreshCw size={12} className={triggerSync.isPending ? "animate-spin" : ""} />
            {triggerSync.isPending ? "Syncing…" : "Sync entities"}
          </button>
          <button
            onClick={handleReports}
            disabled={triggerReports.isPending}
            className="px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5"
          >
            <RefreshCw size={12} className={triggerReports.isPending ? "animate-spin" : ""} />
            {triggerReports.isPending ? "Refreshing…" : "Refresh reports"}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="mt-3 p-2 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded">
          {errorMsg}
        </div>
      )}

      <div className="mt-4">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400 mb-2">Recent runs</div>
        {runs.length === 0 ? (
          <div className="text-xs text-zinc-500">No sync runs yet.</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-zinc-100 dark:border-zinc-800">
                <th className="pb-1.5 font-medium">Entity</th>
                <th className="pb-1.5 font-medium">Status</th>
                <th className="pb-1.5 font-medium">Records</th>
                <th className="pb-1.5 font-medium">Duration</th>
                <th className="pb-1.5 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-zinc-50 dark:border-zinc-800/50">
                  <td className="py-1.5 font-mono text-zinc-700 dark:text-zinc-300">{r.entity_type}</td>
                  <td className="py-1.5">
                    <span className={cn(
                      "inline-flex items-center gap-1",
                      r.status === "ok" && "text-emerald-600",
                      r.status === "failed" && "text-red-600",
                      r.status === "running" && "text-blue-600",
                    )}>
                      {r.status === "ok" && <CheckCircle2 size={10} />}
                      {r.status === "failed" && <AlertTriangle size={10} />}
                      {r.status === "running" && <Clock size={10} />}
                      {r.status}
                    </span>
                  </td>
                  <td className="py-1.5 text-zinc-700 dark:text-zinc-300">{r.records_processed ?? "—"}</td>
                  <td className="py-1.5 text-zinc-500">{formatDuration(r.started_at, r.completed_at)}</td>
                  <td className="py-1.5 text-zinc-500">{new Date(r.started_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
