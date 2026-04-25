// Hooks backed by the raw fmp_cache JSONB rather than typed projections.
// These endpoints have looser, more churning schemas (news headlines, analyst
// consensus, ratings), so we keep them in JSONB and extract the fields we
// need at read time. No projection table = no migration churn when FMP
// renames a field.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { investmentKeys } from "./keys";

export interface NewsItem {
  title: string;
  url: string;
  site: string | null;
  published_at: string;
  image: string | null;
  text: string | null;
}

export interface AnalystSnapshot {
  target_high: number | null;
  target_low: number | null;
  target_median: number | null;
  target_mean: number | null;
  target_count: number | null;
  consensus: string | null;
  strong_buy: number | null;
  buy: number | null;
  hold: number | null;
  sell: number | null;
  strong_sell: number | null;
  rating: string | null;
  rating_score: number | null;
}

const STALE_MS = 60 * 60 * 1000;

async function readCacheRow(symbol: string, endpoint: string): Promise<unknown> {
  const { data, error } = await supabase
    .from("fmp_cache")
    .select("data")
    .eq("symbol", symbol)
    .eq("endpoint", endpoint)
    .maybeSingle();
  if (error) throw new Error(`Failed to load ${endpoint}: ${error.message}`);
  return (data as { data: unknown } | null)?.data ?? null;
}

// Best-effort number coercion — FMP mixes numeric and string fields.
function n(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const parsed = parseFloat(v);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function s(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function useStockNews(symbol: string | null, limit = 10) {
  return useQuery({
    queryKey: [...investmentKeys.stockNews(symbol), limit],
    enabled: !!symbol,
    staleTime: STALE_MS,
    queryFn: async (): Promise<NewsItem[]> => {
      const raw = await readCacheRow(symbol!, "stock-news");
      if (!Array.isArray(raw)) return [];
      return raw
        .map((item): NewsItem | null => {
          if (!item || typeof item !== "object") return null;
          const e = item as Record<string, unknown>;
          const title = s(e.title);
          const url = s(e.url);
          const published = s(e.publishedDate) ?? s(e.date);
          if (!title || !url || !published) return null;
          return {
            title,
            url,
            site: s(e.site) ?? s(e.publisher),
            published_at: published,
            image: s(e.image),
            text: s(e.text),
          };
        })
        .filter((x): x is NewsItem => x !== null)
        .sort((a, b) => b.published_at.localeCompare(a.published_at))
        .slice(0, limit);
    },
  });
}

/**
 * Merges `price-target-consensus`, `stock-grades-summary`, and
 * `ratings-snapshot` into one flat shape. Any individual endpoint can be
 * missing — fields default to null so the UI can show what's available.
 */
export function useStockAnalyst(symbol: string | null) {
  return useQuery({
    queryKey: investmentKeys.stockAnalyst(symbol),
    enabled: !!symbol,
    staleTime: STALE_MS,
    queryFn: async (): Promise<AnalystSnapshot> => {
      const [targetRaw, gradesRaw, ratingRaw] = await Promise.all([
        readCacheRow(symbol!, "price-target-consensus"),
        readCacheRow(symbol!, "stock-grades-summary"),
        readCacheRow(symbol!, "ratings-snapshot"),
      ]);

      // FMP endpoints often return a single-element array.
      const first = (x: unknown): Record<string, unknown> | null => {
        if (Array.isArray(x) && x.length > 0 && typeof x[0] === "object") {
          return x[0] as Record<string, unknown>;
        }
        if (x && typeof x === "object" && !Array.isArray(x)) {
          return x as Record<string, unknown>;
        }
        return null;
      };

      const t = first(targetRaw) ?? {};
      const g = first(gradesRaw) ?? {};
      const r = first(ratingRaw) ?? {};

      const buy = n(g.buy);
      const strongBuy = n(g.strongBuy);
      const hold = n(g.hold);
      const sell = n(g.sell);
      const strongSell = n(g.strongSell);
      const totalGrades = [buy, strongBuy, hold, sell, strongSell]
        .map((v) => v ?? 0)
        .reduce((a, b) => a + b, 0);

      return {
        target_high: n(t.targetHigh),
        target_low: n(t.targetLow),
        target_median: n(t.targetMedian) ?? n(t.targetConsensus),
        target_mean: n(t.targetMean) ?? n(t.targetAvg),
        target_count: n(t.numberOfAnalysts),
        consensus: s(g.consensus),
        strong_buy: strongBuy,
        buy,
        hold,
        sell,
        strong_sell: strongSell,
        rating: s(r.rating),
        rating_score: n(r.overallScore),
        ...(totalGrades > 0 ? {} : {}),
      } satisfies AnalystSnapshot;
    },
  });
}
