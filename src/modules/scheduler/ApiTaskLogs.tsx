import { useState } from "react";
import { CheckCircle, XCircle, Loader2, Slack } from "lucide-react";
import { useApiTaskLogs } from "../../hooks/scheduler";
import { cn } from "../../lib/cn";
import { SectionLoading } from "../../components/ui";

export function ApiTaskLogs() {
  const { data: logs = [], isLoading } = useApiTaskLogs();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return <SectionLoading className="flex-1" />;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-zinc-400">
            No API task logs yet
          </div>
        ) : (
          logs.map((log) => {
            const isExpanded = expandedId === log.id;
            return (
              <div key={log.id} className="border-b border-zinc-100 dark:border-zinc-800/50">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  <StatusIcon status={log.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {log.skill_name}
                      </span>
                      <StatusBadge status={log.status} />
                      <Slack size={12} className="text-zinc-400 flex-shrink-0" />
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-zinc-400">
                        {new Date(log.started_at).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}
                      </span>
                      {log.duration_secs != null && (
                        <span className="text-xs text-zinc-400">
                          {formatDuration(log.duration_secs)}
                        </span>
                      )}
                      <span className="text-xs text-zinc-400">
                        by @{log.triggered_by}
                      </span>
                    </div>
                  </div>
                </button>

                {isExpanded && log.error && (
                  <div className="px-4 pb-3">
                    <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-md">
                      <p className="text-xs text-red-600 dark:text-red-400 font-mono whitespace-pre-wrap">
                        {log.error}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />;
    case "failed":
      return <XCircle size={16} className="text-red-500 flex-shrink-0" />;
    case "running":
      return <Loader2 size={16} className="text-blue-500 animate-spin flex-shrink-0" />;
    default:
      return null;
  }
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "px-1.5 py-0.5 text-xs font-medium rounded-full",
        status === "completed" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
        status === "failed" && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
        status === "running" && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      )}
    >
      {status}
    </span>
  );
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}
