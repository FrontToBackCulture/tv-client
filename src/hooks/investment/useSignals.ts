// Investment signals hook — reads from the v_investment_signals view and
// optionally restricts to symbols in the latest IBKR positions snapshot so
// stale tickers (sold positions) don't pollute the Signals page.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { investmentKeys } from "./keys";

export interface InvestmentSignal {
  symbol: string;
  company_name: string | null;
  sector: string | null;
  industry: string | null;
  currency: string | null;
  current_price: number | null;
  price_as_of: string | null;
  market_cap: number | null;
  eps_ttm: number | null;
  pe_current: number | null;
  pe_p20: number | null;
  pe_p50: number | null;
  pe_p80: number | null;
  pe_history_years: number | null;
  pb_p20: number | null;
  pb_p50: number | null;
  pb_p80: number | null;
  ps_p20: number | null;
  ps_p50: number | null;
  ps_p80: number | null;
  ps_history_years: number | null;
  ps_current: number | null;
  price_p20: number | null;
  price_p50: number | null;
  price_p80: number | null;
  price_history_days: number | null;
  method: "pe" | "ps" | "price-range" | null;
  buy_target_price: number | null;
  fair_price: number | null;
  trim_target_price: number | null;
  revenue: number | null;
  prev_revenue: number | null;
  revenue_yoy: number | null;
  pe_band: "cheap" | "fair" | "expensive" | "unknown";
  revenue_trend: "growing" | "shrinking" | "unknown";
  signal: "buy" | "hold" | "trim";
}

/**
 * Signals for current holdings only. `heldSymbols` is the unique list from
 * the latest ibkr_positions snapshot (pass from caller who already has it)
 * — the view has no dependency on positions so we filter client-side.
 */
export function useInvestmentSignals(heldSymbols: string[] | null) {
  return useQuery({
    queryKey: investmentKeys.signals(heldSymbols ?? []),
    enabled: heldSymbols !== null,
    queryFn: async (): Promise<InvestmentSignal[]> => {
      if (!heldSymbols || heldSymbols.length === 0) return [];
      const { data, error } = await supabase
        .from("v_investment_signals")
        .select("*")
        .in("symbol", heldSymbols);
      if (error) throw new Error(`Failed to load signals: ${error.message}`);
      return (data ?? []) as InvestmentSignal[];
    },
  });
}
