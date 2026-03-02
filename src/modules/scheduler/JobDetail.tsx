import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Play, Clock, Terminal, Hash, Slack, Loader2, ArrowLeft,
  CheckCircle, XCircle, FileText, ChevronDown, ChevronRight, Pencil, Puzzle, Square,
} from "lucide-react";
import type { SchedulerJob, JobRun, RunStep } from "../../hooks/scheduler";
import { useRunningJobsStore, useRunSteps } from "../../hooks/scheduler";
import { cn } from "../../lib/cn";

interface JobDetailProps {
  job: SchedulerJob;
  runs: JobRun[];
  onRunNow: (id: string) => void;
  onEdit?: (job: SchedulerJob) => void;
  onStopJob?: (runId: string) => void;
}

export function JobDetail({ job, runs, onRunNow, onEdit, onStopJob }: JobDetailProps) {
  const [selectedRun, setSelectedRun] = useState<JobRun | null>(null);
  const runningInfo = useRunningJobsStore((s) => s.runningJobs[job.id]);
  const isRunning = !!runningInfo || job.lastRunStatus === "running";

  // When a new run completes, auto-select it
  useEffect(() => {
    if (!isRunning && runs.length > 0 && !selectedRun) {
      // Don't auto-select, let user click
    }
  }, [isRunning, runs]);

  // Show run output viewer
  if (selectedRun) {
    return <RunOutputViewer run={selectedRun} onBack={() => setSelectedRun(null)} />;
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{job.name}</h3>
          {isRunning ? (
            <div className="flex items-center gap-2">
              <RunningIndicator startedAt={runningInfo?.startedAt} step={runningInfo?.step} />
              {onStopJob && runningInfo?.runId && (
                <button
                  onClick={() => onStopJob(runningInfo.runId)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <Square size={10} className="fill-current" />
                  Stop
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              {onEdit && (
                <button
                  onClick={() => onEdit(job)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  <Pencil size={12} />
                  Edit
                </button>
              )}
              <button
                onClick={() => onRunNow(job.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-teal-600 text-white rounded-md hover:bg-teal-500 transition-colors"
              >
                <Play size={12} />
                Run Now
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className={cn(
            "px-1.5 py-0.5 text-[10px] font-medium rounded-full",
            job.enabled
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
              : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
          )}>
            {job.enabled ? "Enabled" : "Disabled"}
          </span>
          <span className="text-xs text-zinc-400">{job.model}</span>
        </div>
      </div>

      {/* Config */}
      <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50 space-y-2">
        <div className="flex items-start gap-2">
          <Clock size={14} className="text-zinc-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Schedule</p>
            <p className="text-xs text-zinc-500 font-mono">{job.cronExpression}</p>
          </div>
        </div>
        {job.skillRefs && job.skillRefs.length > 0 && (
          <div className="flex items-start gap-2">
            <Puzzle size={14} className="text-zinc-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Skills</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {job.skillRefs.map((r) => r.title).join(" · ")}
              </p>
            </div>
          </div>
        )}
        <div className="flex items-start gap-2">
          <Terminal size={14} className="text-zinc-400 mt-0.5 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Prompt</p>
            <pre className="text-xs text-zinc-500 whitespace-pre-wrap break-words font-sans max-h-40 overflow-y-auto mt-0.5 p-2 bg-zinc-50 dark:bg-zinc-900/50 rounded-md">{job.skillPrompt}</pre>
          </div>
        </div>
        {job.allowedTools.length > 0 && (
          <div className="flex items-start gap-2">
            <Hash size={14} className="text-zinc-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Tools ({job.allowedTools.length})</p>
              <p className="text-xs text-zinc-500 font-mono truncate">{job.allowedTools.slice(0, 3).join(", ")}{job.allowedTools.length > 3 ? ` +${job.allowedTools.length - 3} more` : ""}</p>
            </div>
          </div>
        )}
        {job.slackChannelName && (
          <div className="flex items-start gap-2">
            <Slack size={14} className="text-zinc-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Slack</p>
              <p className="text-xs text-zinc-500">{job.slackChannelName}</p>
            </div>
          </div>
        )}
        <div className="flex items-start gap-2">
          <FileText size={14} className="text-zinc-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">HTML Report</p>
            <p className="text-xs text-zinc-500">{job.generateReport ? "Saved to S3" : "Off"}</p>
          </div>
        </div>
      </div>

      {/* Recent Runs */}
      <div className="px-4 py-3 flex-1">
        <h4 className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-2">Recent Runs</h4>
        {runs.length === 0 && !isRunning ? (
          <p className="text-xs text-zinc-400">No runs yet — click Run Now to test</p>
        ) : (
          <div className="space-y-1">
            {runs.map((run) => (
              <button
                key={run.id}
                onClick={() => setSelectedRun(run)}
                className="w-full flex items-center gap-2 px-2 py-2 text-left rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group"
              >
                <RunStatusIcon status={run.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-zinc-700 dark:text-zinc-300">
                      {new Date(run.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {new Date(run.startedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] text-zinc-400">
                  {run.trigger === "scheduled" ? "auto" : "manual"}
                </span>
                {run.durationSecs != null && (
                  <span className="text-[10px] text-zinc-400 tabular-nums">
                    {formatDuration(run.durationSecs)}
                  </span>
                )}
                {run.inputTokens != null && run.outputTokens != null && (
                  <span className="text-[10px] text-zinc-400 tabular-nums" title={`In: ${formatTokens(run.inputTokens)} Out: ${formatTokens(run.outputTokens)}`}>
                    {formatTokens(run.inputTokens + run.outputTokens + (run.cacheReadTokens ?? 0))} tok
                  </span>
                )}
                {run.costUsd != null && run.costUsd > 0 && (
                  <span className="text-[10px] text-zinc-400 tabular-nums">
                    ${run.costUsd.toFixed(2)}
                  </span>
                )}
                {run.slackPosted && <Slack size={10} className="text-zinc-300" />}
                <FileText size={12} className="text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Full run output viewer */
function RunOutputViewer({ run, onBack }: { run: JobRun; onBack: () => void }) {
  const [showSteps, setShowSteps] = useState(false);
  const { data: steps } = useRunSteps(showSteps ? run.id : null);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50">
        <button onClick={onBack} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <RunStatusIcon status={run.status} />
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {new Date(run.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              {" "}
              {new Date(run.startedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[10px] text-zinc-400">{run.trigger}</span>
            {run.durationSecs != null && (
              <span className="text-[10px] text-zinc-400">{formatDuration(run.durationSecs)}</span>
            )}
            {run.numTurns != null && (
              <span className="text-[10px] text-zinc-400">{run.numTurns} turns</span>
            )}
            {run.inputTokens != null && (
              <span className="text-[10px] text-zinc-400">
                {formatTokens(run.inputTokens)} in / {formatTokens(run.outputTokens ?? 0)} out
                {run.cacheReadTokens ? ` / ${formatTokens(run.cacheReadTokens)} cached` : ""}
              </span>
            )}
            {run.costUsd != null && run.costUsd > 0 && (
              <span className="text-[10px] text-zinc-400">${run.costUsd.toFixed(4)}</span>
            )}
            {run.slackPosted && (
              <span className="text-[10px] text-emerald-500">Slack posted</span>
            )}
          </div>
        </div>
      </div>

      {/* Error banner */}
      {run.error && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-900/30">
          <p className="text-xs text-red-600 dark:text-red-400 font-mono whitespace-pre-wrap">{run.error}</p>
        </div>
      )}

      {/* Scrollable content area: steps + output */}
      <div className="flex-1 overflow-y-auto">
        {/* Steps breakdown (collapsible) */}
        {run.numTurns != null && run.numTurns > 0 && (
          <div className="border-b border-zinc-100 dark:border-zinc-800/50">
            <button
              onClick={() => setShowSteps(!showSteps)}
              className="w-full flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            >
              {showSteps ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Steps ({run.numTurns} turns)
            </button>
            {showSteps && steps && <StepsTable steps={steps} />}
          </div>
        )}

        {/* Output */}
        <div className="p-4">
          {run.output ? (
            <div className="prose prose-sm prose-zinc dark:prose-invert max-w-none
              prose-headings:text-sm prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
              prose-p:text-xs prose-p:my-1 prose-li:text-xs
              prose-table:text-xs prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1
              prose-th:bg-zinc-50 dark:prose-th:bg-zinc-800/50
              prose-code:text-[11px] prose-pre:text-[11px] prose-pre:bg-zinc-50 dark:prose-pre:bg-zinc-900/50
            ">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{run.output}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-xs text-zinc-400">(no output)</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Per-turn steps table */
function StepsTable({ steps }: { steps: RunStep[] }) {
  if (steps.length === 0) {
    return (
      <div className="px-4 pb-2">
        <p className="text-[10px] text-zinc-400">No step data available</p>
      </div>
    );
  }

  return (
    <div className="px-4 pb-2 overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-left text-zinc-400">
            <th className="pr-2 py-1 font-medium">Turn</th>
            <th className="pr-2 py-1 font-medium" title="Tokens generated by Claude in this turn">Output tokens</th>
            <th className="pr-2 py-1 font-medium" title="New tokens added to context from tool results (the main cost driver)">New context</th>
            <th className="pr-2 py-1 font-medium">Tools called</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step) => (
            <tr key={step.turnNumber} className="border-t border-zinc-50 dark:border-zinc-800/30">
              <td className="pr-2 py-1 text-zinc-400 tabular-nums">{step.turnNumber}</td>
              <td className="pr-2 py-1 tabular-nums text-zinc-600 dark:text-zinc-400">
                {formatTokens(step.outputTokens)}
              </td>
              <td className="pr-2 py-1 tabular-nums text-zinc-600 dark:text-zinc-400">
                {step.cacheCreationTokens > 0 ? formatTokens(step.cacheCreationTokens) : "-"}
              </td>
              <td className="py-1 text-zinc-500">
                {step.toolDetails.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {step.toolDetails.map((td, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-[10px] max-w-[200px] truncate"
                        title={td.target ? `${td.name}: ${td.target}` : td.name}
                      >
                        <span className="font-medium text-zinc-600 dark:text-zinc-300">{shortenToolName(td.name)}</span>
                        {td.target && (
                          <span className="text-zinc-400 truncate">{td.target}</span>
                        )}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-zinc-400 italic">text only</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function shortenToolName(name: string): string {
  if (name.startsWith("mcp__")) {
    const parts = name.split("__");
    return parts.length >= 3 ? parts.slice(2).join("__") : name;
  }
  return name;
}

/** Running indicator with elapsed timer and current step */
function RunningIndicator({ startedAt, step }: { startedAt?: number; step?: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-md">
        <Loader2 size={12} className="animate-spin" />
        Running{startedAt ? ` ${formatDuration(elapsed)}` : "..."}
      </div>
      {step && (
        <span className="text-[10px] text-blue-500 dark:text-blue-400/70 pr-1">{step}</span>
      )}
    </div>
  );
}

function RunStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "success":
      return <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" />;
    case "failed":
      return <XCircle size={14} className="text-red-500 flex-shrink-0" />;
    case "running":
      return <Loader2 size={14} className="text-blue-500 animate-spin flex-shrink-0" />;
    default:
      return <Clock size={14} className="text-zinc-400 flex-shrink-0" />;
  }
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}
