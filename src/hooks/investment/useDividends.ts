// Hook: dividend payments, optionally filtered to a single account.
//
// Reads the `ibkr_dividends` view which pre-filters ibkr_cash_transactions to
// dividend-related types (`Dividends`, `Payment In Lieu Of Dividends`).

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { investmentKeys } from "./keys";

export interface IbkrDividend {
  transaction_id: string;
  settle_date: string;
  account_id: string;
  currency: string;
  symbol: string | null;
  description: string | null;
  amount: number;
  fx_rate_to_base: number | null;
}

export function useDividends(accountId: string | null = null) {
  return useQuery({
    queryKey: investmentKeys.dividends(accountId),
    queryFn: async (): Promise<IbkrDividend[]> => {
      let q = supabase
        .from("ibkr_dividends")
        .select(
          "transaction_id,settle_date,account_id,currency,symbol,description,amount,fx_rate_to_base",
        );
      if (accountId) q = q.eq("account_id", accountId);
      const { data, error } = await q
        .order("settle_date", { ascending: false })
        .limit(5000);

      if (error) throw new Error(`Failed to fetch dividends: ${error.message}`);
      return (data ?? []) as IbkrDividend[];
    },
  });
}
