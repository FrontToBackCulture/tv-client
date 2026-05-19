// CRM Pipeline Stats hook
// Derives stats from the same `useDealsWithTasks` cache the rest of the
// CRM module already consumes — eliminates the duplicate `projects` fetch
// that previously ran in parallel on every CRM mount.

import { useMemo } from "react";
import type { Deal, PipelineStats } from "../../lib/crm/types";
import { DEAL_STAGES, dealEffectiveValue } from "../../lib/crm/types";
import { useDealsWithTasks } from "./useDeals";

const ACTIVE_STAGES = [
  "target",
  "prospect",
  "lead",
  "qualified",
  "pilot",
  "proposal",
  "negotiation",
];

const STAGE_WEIGHT: Record<string, number> = Object.fromEntries(
  DEAL_STAGES.map((s) => [s.value, s.weight ?? 0])
);

export function usePipelineStats() {
  const dealsQuery = useDealsWithTasks();

  const data: PipelineStats | undefined = useMemo(() => {
    if (!dealsQuery.data) return undefined;
    const active = dealsQuery.data.filter(
      (d) => d.stage && ACTIVE_STAGES.includes(d.stage)
    );

    let totalDeals = 0;
    let totalValue = 0;
    let totalMrr = 0;
    let totalArr = 0;
    let totalSetupFee = 0;
    let totalY1 = 0;
    let weightedValue = 0;
    let weightedMrr = 0;
    let weightedArr = 0;
    let weightedSetupFee = 0;
    let weightedY1 = 0;

    const byStage = ACTIVE_STAGES.map((stage) => {
      const stageDeals: Deal[] = active.filter((d) => d.stage === stage);
      const count = stageDeals.length;
      // value = COALESCE(year1Total, value) so legacy deals (deal_value only) stay counted.
      const value = stageDeals.reduce((s, d) => s + (dealEffectiveValue(d) ?? 0), 0);
      const mrr = stageDeals.reduce((s, d) => s + (d.mrr ?? 0), 0);
      const arr = stageDeals.reduce((s, d) => s + (d.arr ?? 0), 0);
      const setupFee = stageDeals.reduce((s, d) => s + (d.setupFee ?? 0), 0);
      const y1Total = stageDeals.reduce((s, d) => s + (d.year1Total ?? 0), 0);

      const w = STAGE_WEIGHT[stage] ?? 0;
      totalDeals += count;
      totalValue += value;
      totalMrr += mrr;
      totalArr += arr;
      totalSetupFee += setupFee;
      totalY1 += y1Total;
      weightedValue += value * w;
      weightedMrr += mrr * w;
      weightedArr += arr * w;
      weightedSetupFee += setupFee * w;
      weightedY1 += y1Total * w;

      return { stage, count, value, mrr, arr, setupFee, y1Total };
    });

    return {
      byStage,
      totalDeals,
      totalValue,
      totalMrr,
      totalArr,
      totalSetupFee,
      totalY1,
      weightedValue,
      weightedMrr,
      weightedArr,
      weightedSetupFee,
      weightedY1,
    };
  }, [dealsQuery.data]);

  return {
    data,
    isLoading: dealsQuery.isLoading,
    error: dealsQuery.error,
    refetch: dealsQuery.refetch,
  };
}
