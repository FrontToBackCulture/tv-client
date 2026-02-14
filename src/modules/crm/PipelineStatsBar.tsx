// src/modules/crm/PipelineStatsBar.tsx
// Pipeline stats header bar

import { PipelineStats, DEAL_STAGES } from "../../lib/crm/types";
import { RefreshCw } from "lucide-react";

interface PipelineStatsBarProps {
  stats: PipelineStats | null | undefined;
  loading?: boolean;
  onRefresh?: () => void;
}

export function PipelineStatsBar({ stats, loading, onRefresh }: PipelineStatsBarProps) {
  if (loading) {
    return (
      <div className="p-4 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="animate-pulse flex gap-4">
          <div className="h-14 w-28 bg-slate-200 dark:bg-zinc-800 rounded" />
          <div className="h-14 w-28 bg-slate-200 dark:bg-zinc-800 rounded" />
          <div className="h-14 w-28 bg-slate-200 dark:bg-zinc-800 rounded" />
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const totalValue = stats.totalValue ?? 0;
  const totalDeals = stats.totalDeals ?? 0;
  const byStage = stats.byStage ?? [];

  // Calculate weighted pipeline value
  const weightedValue = byStage.reduce((sum, stage) => {
    const stageConfig = DEAL_STAGES.find((s) => s.value === stage.stage);
    return sum + (stage.value ?? 0) * (stageConfig?.weight ?? 0);
  }, 0);

  const stageColors: Record<string, string> = {
    qualified: "bg-zinc-500",
    proposal: "bg-blue-500",
    negotiation: "bg-yellow-500",
    pilot: "bg-purple-500",
    lead: "bg-gray-500",
    prospect: "bg-slate-500",
  };

  return (
    <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Pipeline Overview</h2>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              title="Refresh data"
            >
              <RefreshCw size={14} />
            </button>
          )}
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-teal-600 dark:text-teal-400">
            ${weightedValue.toLocaleString()}
            <span className="text-sm font-normal text-zinc-400 ml-1.5">weighted</span>
          </p>
          <p className="text-xs text-zinc-500">
            ${totalValue.toLocaleString()} total · {totalDeals} deals
          </p>
        </div>
      </div>

      {/* Pipeline bar */}
      <div className="h-3 bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden flex">
        {byStage.map((stage) => {
          const percentage = totalValue > 0 ? ((stage.value ?? 0) / totalValue) * 100 : 0;
          if (percentage === 0) return null;

          return (
            <div
              key={stage.stage}
              className={`${stageColors[stage.stage] || "bg-zinc-600"} transition-all`}
              style={{ width: `${percentage}%` }}
              title={`${
                DEAL_STAGES.find((s) => s.value === stage.stage)?.label
              }: $${(stage.value ?? 0).toLocaleString()} (${stage.count ?? 0} deals)`}
            />
          );
        })}
      </div>

      {/* Stage breakdown */}
      <div className="flex gap-4 mt-3 flex-wrap">
        {byStage.map((stage) => {
          const stageConfig = DEAL_STAGES.find((s) => s.value === stage.stage);
          if (!stageConfig) return null;
          return (
            <div key={stage.stage} className="flex items-center gap-2">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  stageColors[stage.stage] || "bg-zinc-600"
                }`}
              />
              <div>
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  {stageConfig.label}
                  <span className="text-[10px] text-zinc-400 ml-1">{Math.round((stageConfig.weight ?? 0) * 100)}%</span>
                </p>
                <p className="text-[11px] text-zinc-500">
                  {stage.count ?? 0} · ${(stage.value ?? 0).toLocaleString()}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
