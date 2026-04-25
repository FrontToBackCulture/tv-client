import { useQuery } from "@tanstack/react-query";
import { getSupabaseClient } from "../../lib/supabase";
import { financeKeys } from "./keys";

/**
 * Generic paged-list hook for the qbo_* mirror tables. Orders by the given
 * column; callers can supply a filter for 'active only' etc.
 */
function useQboList<T>(
  table: string,
  order: { column: string; ascending?: boolean } = { column: "synced_at", ascending: false },
  filter?: (q: any) => any,
) {
  return useQuery({
    queryKey: [...financeKeys.all, table, order, filter?.toString()],
    queryFn: async (): Promise<T[]> => {
      const supabase = getSupabaseClient();
      let q = supabase.from(table).select("*").order(order.column, { ascending: order.ascending ?? false });
      if (filter) q = filter(q);
      const { data, error } = await q.limit(500);
      if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`);
      return (data ?? []) as T[];
    },
  });
}

export function useQboAccounts() {
  return useQboList<any>("qbo_accounts", { column: "name", ascending: true });
}

export function useQboCustomers() {
  return useQboList<any>("qbo_customers", { column: "display_name", ascending: true });
}

export function useQboVendors() {
  return useQboList<any>("qbo_vendors", { column: "display_name", ascending: true });
}

export function useQboInvoices() {
  return useQboList<any>("qbo_invoices", { column: "txn_date", ascending: false });
}

export function useQboBills() {
  return useQboList<any>("qbo_bills", { column: "txn_date", ascending: false });
}

export function useQboEstimates() {
  return useQboList<any>("qbo_estimates", { column: "txn_date", ascending: false });
}

export function useQboJournalEntries() {
  return useQboList<any>("qbo_journal_entries", { column: "txn_date", ascending: false });
}
