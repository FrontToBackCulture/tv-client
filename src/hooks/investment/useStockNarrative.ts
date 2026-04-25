// AI-generated narrative for a single symbol. The narrative combines the
// quant signal, recent news, analyst sentiment, and fundamentals into 3-4
// sentences via an edge function that calls Claude. Results are cached in
// the `stock_narratives` table and short-circuited when inputs haven't
// changed (inputs_hash match), so regenerating is cheap.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { investmentKeys } from "./keys";

export interface StockNarrative {
  symbol: string;
  narrative: string;
  summary: string | null;
  ai_buy_target: number | null;
  ai_fair_price: number | null;
  ai_trim_target: number | null;
  ai_confidence: "high" | "medium" | "low" | null;
  model: string;
  generated_at: string;
  updated_at: string;
}

const STALE_MS = 60 * 60 * 1000;

const narrativeKey = (symbol: string | null) =>
  [...investmentKeys.stock(symbol), "narrative"] as const;

export function useStockNarrative(symbol: string | null) {
  return useQuery({
    queryKey: narrativeKey(symbol),
    enabled: !!symbol,
    staleTime: STALE_MS,
    queryFn: async (): Promise<StockNarrative | null> => {
      const { data, error } = await supabase
        .from("stock_narratives")
        .select(
          "symbol, narrative, summary, ai_buy_target, ai_fair_price, ai_trim_target, ai_confidence, model, generated_at, updated_at",
        )
        .eq("symbol", symbol!)
        .maybeSingle();
      if (error) throw new Error(`Failed to load narrative: ${error.message}`);
      return (data as StockNarrative | null) ?? null;
    },
  });
}

export function useGenerateStockNarrative() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ symbol, force }: { symbol: string; force?: boolean }) => {
      const { data, error } = await supabase.functions.invoke("generate-stock-narrative", {
        body: { symbol, force: force ?? false },
      });
      if (error) throw new Error(`Generate failed: ${error.message}`);
      return data as { cached: boolean; row: StockNarrative };
    },
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: narrativeKey(vars.symbol) });
    },
  });
}
