// Per-symbol hooks backed by the typed fmp_* projection tables. The raw
// fmp_cache JSONB remains the source of truth; these tables are populated
// by the sync alongside the cache (see src-tauri/src/commands/fmp/projections.rs).
//
// All hooks are scoped by `symbol`. React Query keys live under
// investmentKeys.stock(symbol, subKey) so the cache is disjoint per ticker.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { investmentKeys } from "./keys";

export interface StockProfile {
  symbol: string;
  exchange: string | null;
  company_name: string | null;
  industry: string | null;
  sector: string | null;
  country: string | null;
  currency: string | null;
  ceo: string | null;
  website: string | null;
  description: string | null;
  market_cap: number | null;
  price: number | null;
  beta: number | null;
  last_dividend: number | null;
  image_url: string | null;
  ipo_date: string | null;
  fetched_at: string;
}

export interface PriceBar {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  adj_close: number | null;
  volume: number | null;
}

export interface RatiosYearRow {
  fiscal_year: number;
  pe_ratio: number | null;
  price_to_book: number | null;
  price_to_sales: number | null;
  ev_to_ebitda: number | null;
  gross_profit_margin: number | null;
  operating_profit_margin: number | null;
  net_profit_margin: number | null;
  return_on_equity: number | null;
  return_on_assets: number | null;
  debt_to_equity: number | null;
  dividend_yield: number | null;
  payout_ratio: number | null;
}

export interface KeyMetricsYearRow {
  fiscal_year: number;
  market_cap: number | null;
  enterprise_value: number | null;
  pe_ratio: number | null;
  pb_ratio: number | null;
  ev_to_ebitda: number | null;
  earnings_yield: number | null;
  free_cash_flow_yield: number | null;
  book_value_per_share: number | null;
  free_cash_flow_per_share: number | null;
  dividend_yield: number | null;
  roic: number | null;
  roe: number | null;
}

export interface IncomeYearRow {
  fiscal_year: number;
  revenue: number | null;
  gross_profit: number | null;
  operating_income: number | null;
  net_income: number | null;
  ebitda: number | null;
  eps: number | null;
  eps_diluted: number | null;
}

export interface IncomeQuarterRow {
  fiscal_date: string;
  period: string | null;
  revenue: number | null;
  gross_profit: number | null;
  operating_income: number | null;
  net_income: number | null;
  ebitda: number | null;
  eps: number | null;
}

const STALE_MS = 60 * 60 * 1000;

export function useStockProfile(symbol: string | null) {
  return useQuery({
    queryKey: investmentKeys.stockProfile(symbol),
    enabled: !!symbol,
    staleTime: STALE_MS,
    queryFn: async (): Promise<StockProfile | null> => {
      const { data, error } = await supabase
        .from("fmp_profiles")
        .select("*")
        .eq("symbol", symbol!)
        .maybeSingle();
      if (error) throw new Error(`Failed to load profile: ${error.message}`);
      return (data as StockProfile | null) ?? null;
    },
  });
}

/**
 * Daily price bars for a symbol. `years` limits the window; default 5y to
 * give valuation trend charts enough history without pulling decades.
 */
export function useStockPrices(symbol: string | null, years = 5) {
  return useQuery({
    queryKey: investmentKeys.stockPrices(symbol, years),
    enabled: !!symbol,
    staleTime: STALE_MS,
    queryFn: async (): Promise<PriceBar[]> => {
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - years);
      const cutoffIso = cutoff.toISOString().slice(0, 10);

      // PostgREST caps responses at 1000 rows by default. 5y of daily bars is
      // ~1260 rows, so we'd truncate the newest ~year if we didn't fetch
      // descending and limit explicitly. Fetch newest-first with a generous
      // cap, then reverse for left→right charts.
      const { data, error } = await supabase
        .from("fmp_prices_daily")
        .select("date,open,high,low,close,adj_close,volume")
        .eq("symbol", symbol!)
        .gte("date", cutoffIso)
        .order("date", { ascending: false })
        .limit(years * 260 + 20);
      if (error) throw new Error(`Failed to load prices: ${error.message}`);
      return ((data ?? []) as PriceBar[]).slice().reverse();
    },
  });
}

export function useStockRatios(symbol: string | null) {
  return useQuery({
    queryKey: investmentKeys.stockRatios(symbol),
    enabled: !!symbol,
    staleTime: STALE_MS,
    queryFn: async (): Promise<RatiosYearRow[]> => {
      const { data, error } = await supabase
        .from("fmp_ratios_annual")
        .select(
          "fiscal_year,pe_ratio,price_to_book,price_to_sales,ev_to_ebitda,gross_profit_margin,operating_profit_margin,net_profit_margin,return_on_equity,return_on_assets,debt_to_equity,dividend_yield,payout_ratio",
        )
        .eq("symbol", symbol!)
        .order("fiscal_year", { ascending: true });
      if (error) throw new Error(`Failed to load ratios: ${error.message}`);
      return (data ?? []) as RatiosYearRow[];
    },
  });
}

export function useStockKeyMetrics(symbol: string | null) {
  return useQuery({
    queryKey: investmentKeys.stockKeyMetrics(symbol),
    enabled: !!symbol,
    staleTime: STALE_MS,
    queryFn: async (): Promise<KeyMetricsYearRow[]> => {
      const { data, error } = await supabase
        .from("fmp_key_metrics_annual")
        .select(
          "fiscal_year,market_cap,enterprise_value,pe_ratio,pb_ratio,ev_to_ebitda,earnings_yield,free_cash_flow_yield,book_value_per_share,free_cash_flow_per_share,dividend_yield,roic,roe",
        )
        .eq("symbol", symbol!)
        .order("fiscal_year", { ascending: true });
      if (error) throw new Error(`Failed to load key metrics: ${error.message}`);
      return (data ?? []) as KeyMetricsYearRow[];
    },
  });
}

export function useStockIncomeAnnual(symbol: string | null) {
  return useQuery({
    queryKey: investmentKeys.stockIncomeAnnual(symbol),
    enabled: !!symbol,
    staleTime: STALE_MS,
    queryFn: async (): Promise<IncomeYearRow[]> => {
      const { data, error } = await supabase
        .from("fmp_income_annual")
        .select(
          "fiscal_year,revenue,gross_profit,operating_income,net_income,ebitda,eps,eps_diluted",
        )
        .eq("symbol", symbol!)
        .order("fiscal_year", { ascending: true });
      if (error) throw new Error(`Failed to load income: ${error.message}`);
      return (data ?? []) as IncomeYearRow[];
    },
  });
}

export function useStockIncomeQuarterly(symbol: string | null, quarters = 12) {
  return useQuery({
    queryKey: investmentKeys.stockIncomeQuarterly(symbol, quarters),
    enabled: !!symbol,
    staleTime: STALE_MS,
    queryFn: async (): Promise<IncomeQuarterRow[]> => {
      const { data, error } = await supabase
        .from("fmp_income_quarter")
        .select("fiscal_date,period,revenue,gross_profit,operating_income,net_income,ebitda,eps")
        .eq("symbol", symbol!)
        .order("fiscal_date", { ascending: false })
        .limit(quarters);
      if (error) throw new Error(`Failed to load quarterly income: ${error.message}`);
      // Reverse so charts render left→right by time.
      return ((data ?? []) as IncomeQuarterRow[]).slice().reverse();
    },
  });
}
