// Hook: NAV time series, optionally filtered to a single account.
//
// `useLatestNav` returns the most recent row per account by default. When
// `accountId` is specified, returns only that account's latest row. Overview
// totals and per-account breakdowns both use this hook; the page decides how
// to aggregate based on selection.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { investmentKeys } from "./keys";

export interface IbkrNavRow {
  as_of_date: string;
  account_id: string;
  base_currency: string;
  nav_base: number;
  cash_base: number | null;
  stock_base: number | null;
  options_base: number | null;
  other_base: number | null;
}

export function useLatestNav(accountId: string | null = null) {
  return useQuery({
    queryKey: investmentKeys.navLatest(accountId),
    queryFn: async (): Promise<IbkrNavRow[]> => {
      // Find the most recent as_of_date (scoped if account is set)
      let latestQuery = supabase
        .from("ibkr_nav_history")
        .select("as_of_date")
        .order("as_of_date", { ascending: false })
        .limit(1);
      if (accountId) latestQuery = latestQuery.eq("account_id", accountId);

      const { data: latest, error: latestErr } = await latestQuery;
      if (latestErr) throw new Error(`Failed to find latest NAV: ${latestErr.message}`);
      if (!latest || latest.length === 0) return [];

      const asOfDate = latest[0].as_of_date;

      let rowsQuery = supabase
        .from("ibkr_nav_history")
        .select(
          "as_of_date,account_id,base_currency,nav_base,cash_base,stock_base,options_base,other_base",
        )
        .eq("as_of_date", asOfDate);
      if (accountId) rowsQuery = rowsQuery.eq("account_id", accountId);

      const { data, error } = await rowsQuery;

      if (error) throw new Error(`Failed to fetch NAV: ${error.message}`);
      return (data ?? []) as IbkrNavRow[];
    },
  });
}

export function useNavHistory(accountId: string | null = null) {
  return useQuery({
    queryKey: investmentKeys.navHistory(accountId),
    queryFn: async (): Promise<IbkrNavRow[]> => {
      let q = supabase
        .from("ibkr_nav_history")
        .select(
          "as_of_date,account_id,base_currency,nav_base,cash_base,stock_base,options_base,other_base",
        );
      if (accountId) q = q.eq("account_id", accountId);
      const { data, error } = await q
        .order("as_of_date", { ascending: true })
        .limit(2000);

      if (error) throw new Error(`Failed to fetch NAV history: ${error.message}`);
      return (data ?? []) as IbkrNavRow[];
    },
  });
}
