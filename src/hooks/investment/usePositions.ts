// Hook: latest positions snapshot, optionally filtered to a single account.
//
// `accountId = null` → all accounts consolidated. Supplying a specific
// account ID scopes both the "latest snapshot date" lookup AND the row fetch
// to that account, so different accounts synced at different times don't
// interfere with each other's snapshot selection.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { investmentKeys } from "./keys";

export interface IbkrPosition {
  snapshot_date: string;
  account_id: string;
  conid: string;
  symbol: string;
  asset_class: string | null;
  description: string | null;
  currency: string | null;
  quantity: number | null;
  mark_price: number | null;
  position_value: number | null;
  cost_basis: number | null;
  unrealized_pnl: number | null;
  realized_pnl: number | null;
  fx_rate_to_base: number | null;
}

export function useLatestPositions(accountId: string | null = null) {
  return useQuery({
    queryKey: investmentKeys.positionsLatest(accountId),
    queryFn: async (): Promise<IbkrPosition[]> => {
      // Find the most recent snapshot_date (scoped to the account if set)
      let latestQuery = supabase
        .from("ibkr_positions")
        .select("snapshot_date")
        .order("snapshot_date", { ascending: false })
        .limit(1);
      if (accountId) latestQuery = latestQuery.eq("account_id", accountId);

      const { data: latest, error: latestErr } = await latestQuery;
      if (latestErr) throw new Error(`Failed to find latest snapshot: ${latestErr.message}`);
      if (!latest || latest.length === 0) return [];

      const snapshotDate = latest[0].snapshot_date;

      let rowsQuery = supabase
        .from("ibkr_positions")
        .select(
          "snapshot_date,account_id,conid,symbol,asset_class,description,currency,quantity,mark_price,position_value,cost_basis,unrealized_pnl,realized_pnl,fx_rate_to_base",
        )
        .eq("snapshot_date", snapshotDate);
      if (accountId) rowsQuery = rowsQuery.eq("account_id", accountId);

      const { data, error } = await rowsQuery.order("position_value", {
        ascending: false,
        nullsFirst: false,
      });

      if (error) throw new Error(`Failed to fetch positions: ${error.message}`);
      return (data ?? []) as IbkrPosition[];
    },
  });
}
