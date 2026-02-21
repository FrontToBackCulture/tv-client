// CRM Pipeline Stats hook

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { PipelineStats } from "../../lib/crm/types";
import { crmKeys } from "./keys";

export function usePipelineStats() {
  return useQuery({
    queryKey: crmKeys.pipeline(),
    queryFn: async (): Promise<PipelineStats> => {
      const { data: deals, error } = await supabase
        .from("crm_deals")
        .select("*")
        .in("stage", [
          "target",
          "prospect",
          "lead",
          "qualified",
          "pilot",
          "proposal",
          "negotiation",
        ]);

      if (error) throw new Error(`Failed to fetch deals: ${error.message}`);

      const byStage = [
        "target",
        "prospect",
        "lead",
        "qualified",
        "pilot",
        "proposal",
        "negotiation",
      ].map((stage) => {
        const stageDeals = (deals ?? []).filter((d) => d.stage === stage);
        return {
          stage,
          count: stageDeals.length,
          value: stageDeals.reduce((sum, d) => sum + (d.value || 0), 0),
        };
      });

      return {
        byStage,
        totalValue: (deals ?? []).reduce((sum, d) => sum + (d.value || 0), 0),
        totalDeals: (deals ?? []).length,
      };
    },
  });
}
