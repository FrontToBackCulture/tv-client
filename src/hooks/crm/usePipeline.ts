// CRM Pipeline Stats hook
// Now queries from unified projects table (project_type='deal')

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { PipelineStats } from "../../lib/crm/types";
import { crmKeys } from "./keys";

export function usePipelineStats() {
  return useQuery({
    queryKey: crmKeys.pipeline(),
    queryFn: async (): Promise<PipelineStats> => {
      const { data: deals, error } = await supabase
        .from("projects")
        .select("deal_stage, deal_value")
        .eq("project_type", "deal")
        .is("archived_at", null)
        .in("deal_stage", [
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
        const stageDeals = (deals ?? []).filter((d) => d.deal_stage === stage);
        return {
          stage,
          count: stageDeals.length,
          value: stageDeals.reduce((sum, d) => sum + (d.deal_value || 0), 0),
        };
      });

      return {
        byStage,
        totalValue: (deals ?? []).reduce((sum, d) => sum + (d.deal_value || 0), 0),
        totalDeals: (deals ?? []).length,
      };
    },
  });
}
