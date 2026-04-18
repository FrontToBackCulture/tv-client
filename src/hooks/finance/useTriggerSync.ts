import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient } from "../../lib/supabase";
import { financeKeys } from "./keys";
import type { QboEntity } from "../../lib/finance/types";

/**
 * Invokes the `qbo-sync` edge function against the active workspace's Supabase.
 * Active workspace = mgmt → function lives at tvymlwsdiowajlyeokyf.
 */
export function useTriggerSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entity: QboEntity = "all") => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke("qbo-sync", {
        body: { entity, triggered_by: "manual" },
      });
      if (error) throw new Error(`Sync failed: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.all });
    },
  });
}

export function useTriggerReportsSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke("qbo-sync-reports", { body: {} });
      if (error) throw new Error(`Reports sync failed: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.all });
    },
  });
}

export interface CustomReportPeriod {
  label: string;      // cache key, e.g. "fy_2024" or "custom_2024-01-01_2024-06-30"
  start: string;      // YYYY-MM-DD (ignored for point-in-time reports)
  end: string;
}

/**
 * Fetch-and-cache a report for a specific period. Used by the Reports UI when
 * the user picks a fiscal year or custom range that isn't in the default
 * snapshot set.
 */
export function useFetchReportPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { reports: string[]; period: CustomReportPeriod }) => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke("qbo-sync-reports", {
        body: { reports: args.reports, periods: [args.period] },
      });
      if (error) throw new Error(`Report fetch failed: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.all });
    },
  });
}
