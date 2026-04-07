import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Play, Clock, Terminal, Hash, Loader2,
  CheckCircle, XCircle, FileText, ChevronDown, ChevronRight, Pencil, Puzzle, Square,
} from "lucide-react";
import type { SchedulerJob, JobRun, RunStep } from "../../hooks/scheduler";
import { useRunningJobsStore, useRunSteps } from "../../hooks/scheduler";
import { cn } from "../../lib/cn";
import { Button } from "../../components/ui";
import { BackButton } from "../../components/BackButton";

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
  const isRunning = !!runningInfo || job.last_run_status === "running";

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
      <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{job.name}</h3>
          {isRunning ? (
            <div className="flex items-center gap-2">
              <RunningIndicator startedAt={runningInfo?.startedAt} step={runningInfo?.step} />
              {onStopJob && runningInfo?.runId && (
                <Button
                  variant="danger"
                  icon={Square}
                  onClick={() => onStopJob(runningInfo.runId)}
                  className="[&_svg]:fill-current"
                >
                  Stop
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              {onEdit && (
                <Button variant="secondary" icon={Pencil} onClick={() => onEdit(job)}>
                  Edit
                </Button>
              )}
              <Button icon={Play} onClick={() => onRunNow(job.id)}>
                Run Now
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className={cn(
            "px-1.5 py-0.5 text-xs font-medium rounded-full",
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
      <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 p-3 space-y-2">
        <div className="flex items-start gap-2">
          <Clock size={12} className="text-zinc-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Schedule</p>
            <p className="text-xs text-zinc-500 font-mono">{job.cron_expression ?? "ad-hoc"}</p>
          </div>
        </div>
        {job.skill_refs && job.skill_refs.length > 0 && (
          <div className="flex items-start gap-2">
            <Puzzle size={12} className="text-zinc-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Skills</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {job.skill_refs.map((r) => r.title).join(" · ")}
              </p>
            </div>
          </div>
        )}
        <div className="flex items-start gap-2">
          <Terminal size={12} className="text-zinc-400 mt-0.5 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Prompt</p>
            <pre className="text-xs text-zinc-500 whitespace-pre-wrap break-words font-sans max-h-40 overflow-y-auto mt-0.5 p-2 bg-zinc-50 dark:bg-zinc-900/50 rounded-md">{job.skill_prompt}</pre>
          </div>
        </div>
        {job.allowed_tools.length > 0 && (
          <div className="flex items-start gap-2">
            <Hash size={12} className="text-zinc-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Tools ({job.allowed_tools.length})</p>
              <p className="text-xs text-zinc-500 font-mono truncate">{job.allowed_tools.slice(0, 3).join(", ")}{job.allowed_tools.length > 3 ? ` +${job.allowed_tools.length - 3} more` : ""}</p>
            </div>
          </div>
        )}
        <div className="flex items-start gap-2">
          <FileText size={12} className="text-zinc-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">HTML Report</p>
            <p className="text-xs text-zinc-500">{job.generate_report ? "Saved to S3" : "Off"}</p>
          </div>
        </div>
        </div>
      </div>

      {/* Recent Runs */}
      <div className="px-4 py-3 flex-1">
        <h4 className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">Recent Runs</h4>
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
                      {new Date(run.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {new Date(run.started_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-zinc-400">
                  {run.trigger === "scheduled" ? "auto" : "manual"}
                </span>
                {run.duration_secs != null && (
                  <span className="text-xs text-zinc-400 tabular-nums">
                    {formatDuration(run.duration_secs)}
                  </span>
                )}
                {run.input_tokens != null && run.output_tokens != null && (
                  <span className="text-xs text-zinc-400 tabular-nums" title={`In: ${formatTokens(run.input_tokens)} Out: ${formatTokens(run.output_tokens)}`}>
                    {formatTokens(run.input_tokens + run.output_tokens + (run.cache_read_tokens ?? 0))} tok
                  </span>
                )}
                {run.cost_usd != null && run.cost_usd > 0 && (
                  <span className="text-xs text-zinc-400 tabular-nums">
                    ${run.cost_usd.toFixed(2)}
                  </span>
                )}
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
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <BackButton onClick={onBack} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <RunStatusIcon status={run.status} />
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {new Date(run.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              {" "}
              {new Date(run.started_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-zinc-400">{run.trigger}</span>
            {run.duration_secs != null && (
              <span className="text-xs text-zinc-400">{formatDuration(run.duration_secs)}</span>
            )}
            {run.num_turns != null && (
              <span className="text-xs text-zinc-400">{run.num_turns} turns</span>
            )}
            {run.input_tokens != null && (
              <span className="text-xs text-zinc-400">
                {formatTokens(run.input_tokens)} in / {formatTokens(run.output_tokens ?? 0)} out
                {run.cache_read_tokens ? ` / ${formatTokens(run.cache_read_tokens)} cached` : ""}
              </span>
            )}
            {run.cost_usd != null && run.cost_usd > 0 && (
              <span className="text-xs text-zinc-400">${run.cost_usd.toFixed(4)}</span>
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
        {run.num_turns != null && run.num_turns > 0 && (
          <div className="border-b border-zinc-100 dark:border-zinc-800">
            <button
              onClick={() => setShowSteps(!showSteps)}
              className="w-full flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            >
              {showSteps ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Steps ({run.num_turns} turns)
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
              prose-code:text-xs prose-pre:text-xs prose-pre:bg-zinc-50 dark:prose-pre:bg-zinc-900/50
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
        <p className="text-xs text-zinc-400">No step data available</p>
      </div>
    );
  }

  return (
    <div className="px-4 pb-2 overflow-x-auto">
      <table className="w-full text-xs">
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
            <tr key={step.turn_number} className="border-t border-zinc-50 dark:border-zinc-800/30">
              <td className="pr-2 py-1 text-zinc-400 tabular-nums">{step.turn_number}</td>
              <td className="pr-2 py-1 tabular-nums text-zinc-600 dark:text-zinc-400">
                {formatTokens(step.output_tokens)}
              </td>
              <td className="pr-2 py-1 tabular-nums text-zinc-600 dark:text-zinc-400">
                {step.cache_creation_tokens > 0 ? formatTokens(step.cache_creation_tokens) : "-"}
              </td>
              <td className="py-1 text-zinc-500">
                {step.tool_details.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {step.tool_details.map((td, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-xs max-w-[200px] truncate"
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
        <span className="text-xs text-blue-500 dark:text-blue-400/70 pr-1">{step}</span>
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
