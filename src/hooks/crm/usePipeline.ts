// CRM Pipeline Stats hook
// Derives stats from the same `useDealsWithTasks` cache the rest of the
// CRM module already consumes — eliminates the duplicate `projects` fetch
// that previously ran in parallel on every CRM mount.

import { useMemo } from "react";
import type { PipelineStats } from "../../lib/crm/types";
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

export function usePipelineStats() {
  const dealsQuery = useDealsWithTasks();

  const data: PipelineStats | undefined = useMemo(() => {
    if (!dealsQuery.data) return undefined;
    const active = dealsQuery.data.filter(
      (d) => d.stage && ACTIVE_STAGES.includes(d.stage)
    );
    const byStage = ACTIVE_STAGES.map((stage) => {
      const stageDeals = active.filter((d) => d.stage === stage);
      return {
        stage,
        count: stageDeals.length,
        value: stageDeals.reduce((sum, d) => sum + (d.value || 0), 0),
      };
    });
    return {
      byStage,
      totalValue: active.reduce((sum, d) => sum + (d.value || 0), 0),
      totalDeals: active.length,
    };
  }, [dealsQuery.data]);

  return {
    data,
    isLoading: dealsQuery.isLoading,
    error: dealsQuery.error,
    refetch: dealsQuery.refetch,
  };
}
