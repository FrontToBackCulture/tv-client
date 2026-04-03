import { useState } from "react";
import { Clock, CheckCircle, XCircle, Loader2, Slack } from "lucide-react";
import { BackButton } from "../../components/BackButton";
import type { JobRun } from "../../hooks/scheduler";
import { cn } from "../../lib/cn";
import { SectionLoading } from "../../components/ui";

interface RunHistoryProps {
  runs: JobRun[];
  isLoading: boolean;
  onBack?: () => void;
  title?: string;
}

export function RunHistory({ runs, isLoading, onBack, title }: RunHistoryProps) {
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  if (isLoading) {
    return <SectionLoading className="flex-1" />;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      {(onBack || title) && (
        <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
          {onBack && (
            <BackButton onClick={onBack} />
          )}
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {title ?? "Run History"}
          </h3>
        </div>
      )}

      {/* Runs list */}
      <div className="flex-1 overflow-y-auto">
        {runs.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-zinc-400">
            No runs recorded yet
          </div>
        ) : (
          runs.map((run) => {
            const isExpanded = expandedRunId === run.id;
            return (
              <div key={run.id} className="border-b border-zinc-100 dark:border-zinc-800">
                <button
                  onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  <RunStatusIcon status={run.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {run.job_name}
                      </span>
                      <span className={cn(
                        "px-1.5 py-0.5 text-xs font-medium rounded-full",
                        run.trigger === "scheduled"
                          ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      )}>
                        {run.trigger}
                      </span>
                      {run.slack_posted && <Slack size={12} className="text-zinc-400" />}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-zinc-400">
                        {new Date(run.started_at).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}
                      </span>
                      {run.duration_secs != null && (
                        <span className="text-xs text-zinc-400">
                          {formatDuration(run.duration_secs)}
                        </span>
                      )}
                      {run.input_tokens != null && run.output_tokens != null && (
                        <span className="text-xs text-zinc-400">
                          {formatTokens(run.input_tokens + run.output_tokens + (run.cache_read_tokens ?? 0))} tokens
                        </span>
                      )}
                      {run.cost_usd != null && run.cost_usd > 0 && (
                        <span className="text-xs text-zinc-400">
                          ${run.cost_usd.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                {/* Expanded output */}
                {isExpanded && (
                  <div className="px-4 pb-3">
                    {run.error && (
                      <div className="mb-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-md">
                        <p className="text-xs text-red-600 dark:text-red-400 font-mono whitespace-pre-wrap">
                          {run.error}
                        </p>
                      </div>
                    )}
                    <div className="p-2 bg-zinc-50 dark:bg-zinc-800 rounded-md max-h-80 overflow-y-auto">
                      <pre className="text-xs text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap font-mono">
                        {run.output || "(no output)"}
                      </pre>
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

function RunStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "success":
      return <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />;
    case "failed":
      return <XCircle size={16} className="text-red-500 flex-shrink-0" />;
    case "running":
      return <Loader2 size={16} className="text-blue-500 animate-spin flex-shrink-0" />;
    default:
      return <Clock size={16} className="text-zinc-400 flex-shrink-0" />;
  }
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}
