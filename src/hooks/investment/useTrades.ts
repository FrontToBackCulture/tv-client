// Hook: trade history, optionally filtered to a single account.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { investmentKeys } from "./keys";

export interface IbkrTrade {
  trade_id: string;
  trade_date: string;
  settle_date: string | null;
  account_id: string;
  conid: string | null;
  symbol: string;
  asset_class: string | null;
  description: string | null;
  currency: string | null;
  side: string | null;
  quantity: number | null;
  price: number | null;
  proceeds: number | null;
  commission: number | null;
  net_cash: number | null;
  fx_rate_to_base: number | null;
}

export function useTrades(accountId: string | null = null) {
  return useQuery({
    queryKey: investmentKeys.tradesList(accountId),
    queryFn: async (): Promise<IbkrTrade[]> => {
      let q = supabase
        .from("ibkr_trades")
        .select(
          "trade_id,trade_date,settle_date,account_id,conid,symbol,asset_class,description,currency,side,quantity,price,proceeds,commission,net_cash,fx_rate_to_base",
        );
      if (accountId) q = q.eq("account_id", accountId);
      const { data, error } = await q
        .order("trade_date", { ascending: false })
        .limit(5000);

      if (error) throw new Error(`Failed to fetch trades: ${error.message}`);
      return (data ?? []) as IbkrTrade[];
    },
  });
}
