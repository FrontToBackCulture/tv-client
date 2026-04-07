// Run History panel — table-based view below the canvas with expandable rows

import { useState, useMemo } from "react";
import { ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import { useRunSteps } from "@/hooks/scheduler";
import type { JobRun, RunStep } from "@/hooks/scheduler";
import { cn } from "@/lib/cn";

interface Props {
  runs: JobRun[];
  isLoading: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
}

export function RunHistoryPanel({ runs, isLoading, isOpen = true, onToggle }: Props) {
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6 text-xs text-zinc-400">
        Loading runs...
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0 bg-white dark:bg-zinc-950">
      {/* Header — always visible, acts as toggle */}
      <div
        onClick={onToggle}
        className={cn(
          "flex items-center justify-between px-4 py-2 shrink-0",
          isOpen && "border-b border-zinc-200 dark:border-zinc-800",
          onToggle && "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/50",
        )}
      >
        <div className="flex items-center gap-2">
          {onToggle && (
            isOpen
              ? <ChevronDown size={12} className="text-zinc-400" />
              : <ChevronUp size={12} className="text-zinc-400" />
          )}
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Run History
          </span>
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full">
            {runs.length} runs
          </span>
        </div>
      </div>

      {/* Table — hidden when collapsed */}
      {isOpen && <div className="flex-1 overflow-y-auto">
        {runs.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-xs text-zinc-400">
            No runs recorded yet
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-900/50 sticky top-0 z-10">
                <th className="w-[30px] px-3 py-1.5" />
                <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-3 py-1.5">Status</th>
                <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-3 py-1.5">Started (SGT)</th>
                <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-3 py-1.5">Duration</th>
                <th className="text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-3 py-1.5">Cost</th>
                <th className="text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-3 py-1.5">Tokens</th>
                <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-3 py-1.5">Output</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const isExpanded = expandedRunId === run.id;
                return (
                  <RunRow
                    key={run.id}
                    run={run}
                    isExpanded={isExpanded}
                    onToggle={() => setExpandedRunId(isExpanded ? null : run.id)}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>}
    </div>
  );
}

// --- Run Row ---

function RunRow({ run, isExpanded, onToggle }: { run: JobRun; isExpanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={cn(
          "cursor-pointer transition-colors border-b border-zinc-100 dark:border-zinc-800/50",
          isExpanded
            ? "bg-zinc-50 dark:bg-zinc-900/50"
            : "hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 even:bg-zinc-50/30 dark:even:bg-zinc-900/20",
        )}
      >
        <td className="px-3 py-[7px] text-zinc-400 text-[10px]">
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </td>
        <td className="px-3 py-[7px]">
          <RunStatusBadge status={run.status} />
        </td>
        <td className="px-3 py-[7px] text-[11px] font-mono text-zinc-700 dark:text-zinc-300">
          {new Date(run.started_at).toLocaleString("en-SG", {
            timeZone: "Asia/Singapore",
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          })}
        </td>
        <td className="px-3 py-[7px] text-[11px] font-mono text-zinc-700 dark:text-zinc-300">
          {run.duration_secs != null ? formatDuration(run.duration_secs) : "—"}
        </td>
        <td className="px-3 py-[7px] text-[11px] font-mono text-zinc-500 text-right">
          {run.cost_usd != null ? `$${run.cost_usd.toFixed(2)}` : "—"}
        </td>
        <td className="px-3 py-[7px] text-[11px] font-mono text-zinc-500 text-right">
          {run.input_tokens != null
            ? formatTokens(run.input_tokens + (run.output_tokens ?? 0) + (run.cache_read_tokens ?? 0))
            : "—"}
        </td>
        <td className="px-3 py-[7px]">
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 max-w-[260px] truncate block">
            {run.output_preview || run.error || "(no output)"}
          </span>
        </td>
      </tr>

      {/* Expanded detail */}
      {isExpanded && (
        <tr className="bg-zinc-50/80 dark:bg-zinc-900/40 border-b border-zinc-200 dark:border-zinc-800">
          <td colSpan={7} className="p-0">
            <RunDetail run={run} />
          </td>
        </tr>
      )}
    </>
  );
}

// --- Run Detail (expanded) ---

function RunDetail({ run }: { run: JobRun }) {
  const [activeTab, setActiveTab] = useState<"output" | "error" | "steps">(
    run.error ? "error" : "output",
  );
  const { data: steps = [] } = useRunSteps(run.id);

  const tabs = useMemo(() => {
    const t: Array<{ key: "output" | "error" | "steps"; label: string }> = [
      { key: "output", label: "Output" },
    ];
    if (run.error) t.push({ key: "error", label: "Error" });
    t.push({ key: "steps", label: `Steps (${run.num_turns ?? steps.length})` });
    return t;
  }, [run.error, run.num_turns, steps.length]);

  return (
    <div className="px-4 py-3">
      {/* Tabs */}
      <div className="flex gap-0 border-b border-zinc-200 dark:border-zinc-800 mb-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider border-b-2 transition-colors",
              activeTab === tab.key
                ? "text-teal-600 dark:text-teal-400 border-teal-500"
                : "text-zinc-400 dark:text-zinc-500 border-transparent hover:text-zinc-600 dark:hover:text-zinc-300",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Stat pills */}
      <div className="flex gap-2 mb-3">
        {run.num_turns != null && <StatPill label="Turns" value={String(run.num_turns)} />}
        {run.input_tokens != null && <StatPill label="Input" value={formatTokens(run.input_tokens)} />}
        {run.output_tokens != null && <StatPill label="Output" value={formatTokens(run.output_tokens)} />}
        {run.cache_read_tokens != null && run.cache_read_tokens > 0 && (
          <StatPill label="Cache" value={formatTokens(run.cache_read_tokens)} />
        )}
      </div>

      {/* Tab content */}
      {activeTab === "error" && run.error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/15 border border-red-200 dark:border-red-800/50 rounded-md mb-3">
          <pre className="text-[11px] text-red-600 dark:text-red-400 font-mono whitespace-pre-wrap leading-relaxed">
            {run.error}
          </pre>
        </div>
      )}

      {activeTab === "output" && (
        <div className="p-3 bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-md max-h-[180px] overflow-y-auto">
          <pre className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed">
            {run.output || "(no output)"}
          </pre>
        </div>
      )}

      {activeTab === "steps" && (
        <StepsTable steps={steps} />
      )}
    </div>
  );
}

// --- Steps Table ---

function StepsTable({ steps }: { steps: RunStep[] }) {
  if (steps.length === 0) {
    return <div className="text-xs text-zinc-400 py-4 text-center">No step data available</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="text-left text-[9px] font-semibold uppercase tracking-wider text-zinc-400 px-2.5 py-1 border-b border-zinc-200 dark:border-zinc-800">#</th>
            <th className="text-left text-[9px] font-semibold uppercase tracking-wider text-zinc-400 px-2.5 py-1 border-b border-zinc-200 dark:border-zinc-800">Tools</th>
            <th className="text-right text-[9px] font-semibold uppercase tracking-wider text-zinc-400 px-2.5 py-1 border-b border-zinc-200 dark:border-zinc-800">In</th>
            <th className="text-right text-[9px] font-semibold uppercase tracking-wider text-zinc-400 px-2.5 py-1 border-b border-zinc-200 dark:border-zinc-800">Out</th>
            <th className="text-left text-[9px] font-semibold uppercase tracking-wider text-zinc-400 px-2.5 py-1 border-b border-zinc-200 dark:border-zinc-800">Reason</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step) => (
            <tr key={step.turn_number} className="border-b border-zinc-100 dark:border-zinc-800/50">
              <td className="px-2.5 py-1 text-[11px] font-mono text-zinc-500">{step.turn_number}</td>
              <td className="px-2.5 py-1">
                <div className="flex gap-1 flex-wrap">
                  {(step.tool_details?.length ? step.tool_details : step.tools.map((t) => ({ name: t, target: "" }))).map((td, i) => (
                    <span key={i} className="text-[10px] font-mono">
                      <span className="text-teal-600 dark:text-teal-400 font-medium">{td.name}</span>
                      {td.target && (
                        <span className="text-zinc-400 dark:text-zinc-500 ml-1 max-w-[200px] truncate inline-block align-bottom">
                          {td.target}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-2.5 py-1 text-[10px] font-mono text-zinc-400 text-right">
                {formatTokens(step.input_tokens)}
              </td>
              <td className="px-2.5 py-1 text-[10px] font-mono text-zinc-400 text-right">
                {formatTokens(step.output_tokens)}
              </td>
              <td className="px-2.5 py-1 text-[10px] font-mono text-zinc-400">
                {step.stop_reason}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Shared components ---

function RunStatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 text-[11px] font-semibold",
      status === "success" && "text-emerald-500",
      status === "failed" && "text-red-500",
      status === "running" && "text-blue-500",
    )}>
      <span className={cn(
        "w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] text-white shrink-0",
        status === "success" && "bg-emerald-500",
        status === "failed" && "bg-red-500",
        status === "running" && "bg-blue-500",
      )}>
        {status === "success" ? "\u2713" : status === "failed" ? "\u2715" : "\u2022"}
      </span>
      {status === "success" ? "OK" : status === "failed" ? "Failed" : "Running"}
    </span>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-[10px]">
      <span className="text-zinc-400 dark:text-zinc-500 font-medium">{label}</span>
      <span className="text-zinc-900 dark:text-zinc-100 font-bold font-mono text-[11px]">{value}</span>
    </div>
  );
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
