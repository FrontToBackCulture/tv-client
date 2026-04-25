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

export interface PostAccrualInput {
  description: string;
  amount: number;
  currency?: string;
  expense_account_qbo_id: string;
  liability_account_qbo_id: string;
  entity_qbo_id?: string;
  entity_type?: "Vendor" | "Customer" | "Employee";
  accrual_date: string;    // ISO — last day of prior month
  reversal_date: string;   // ISO — first day of clicked month
  doc_prefix: string;      // up to ~10 chars
}

export interface PostAccrualResult {
  accrual: { success: boolean; qbo_id?: string; doc_number: string; error?: string };
  reversal: { success: boolean; qbo_id?: string; doc_number: string; error?: string };
}

/**
 * Posts a matched accrual + reversal JE pair to QBO and triggers a
 * journal_entries sync so the Expense Review grid reflects the change.
 */
export function usePostAccrual() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: PostAccrualInput): Promise<PostAccrualResult> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke("qbo-post-accrual", {
        body: { ...input, triggered_by: "tv-client" },
      });
      if (error) throw new Error(`Accrual post failed: ${error.message}`);
      const result = data as PostAccrualResult;
      if (!result.accrual.success) throw new Error(result.accrual.error ?? "Accrual leg failed");
      if (!result.reversal.success) {
        throw new Error(
          `Reversal leg failed — accrual ${result.accrual.qbo_id} was posted. ${result.reversal.error ?? ""}`,
        );
      }
      return result;
    },
    onSuccess: async () => {
      // Pull the two new JEs into our mirror so they show up in the grid.
      const supabase = getSupabaseClient();
      await supabase.functions.invoke("qbo-sync", { body: { entity: "journal_entries", triggered_by: "post-accrual" } });
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
