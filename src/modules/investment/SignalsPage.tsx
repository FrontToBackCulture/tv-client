// Signals — adaptive buy/hold/trim cards for current holdings.
//
// One card per held symbol. Signal logic lives in v_investment_signals with
// a PE → PS → price-range fallback ladder; see the view file for detail.
// Cards are sorted buy → trim → hold, then alphabetical.
//
// Click a symbol to drill into StockDetailPage.

import { useMemo } from "react";
import { ArrowUp, ArrowDown, Minus, TrendingUp, TrendingDown, Sparkles, Loader2, RefreshCcw } from "lucide-react";
import { useQueries } from "@tanstack/react-query";
import {
  useLatestPositions,
  useInvestmentSignals,
  useGenerateStockNarrative,
  investmentKeys,
  type InvestmentSignal,
} from "../../hooks/investment";
import { supabase } from "../../lib/supabase";
import { SectionLoading, ErrorBanner } from "../../components/ui";

interface SignalsPageProps {
  onSelectSymbol?: (symbol: string) => void;
}

function formatMoney(n: number | null | undefined, currency = "USD"): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatPct(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

function formatRatio(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(1);
}

export function SignalsPage({ onSelectSymbol }: SignalsPageProps) {
  const positions = useLatestPositions(null);

  const heldSymbols = useMemo(() => {
    if (!positions.data) return null;
    const unique = new Set<string>();
    for (const p of positions.data) {
      if (p.asset_class !== "STK") continue;
      unique.add(p.symbol);
    }
    return Array.from(unique);
  }, [positions.data]);

  const signals = useInvestmentSignals(heldSymbols);

  // Batch-fetch full narratives for all held symbols (summary + full prose +
  // AI's own price targets). Same cache key as useStockNarrative on the
  // detail page, so detail regenerations update cards in place.
  const narrativeQueries = useQueries({
    queries: (heldSymbols ?? []).map((symbol) => ({
      queryKey: [...investmentKeys.stock(symbol), "narrative"] as const,
      staleTime: 60 * 60 * 1000,
      queryFn: async () => {
        const { data } = await supabase
          .from("stock_narratives")
          .select(
            "symbol, narrative, summary, ai_buy_target, ai_fair_price, ai_trim_target, ai_confidence, generated_at",
          )
          .eq("symbol", symbol)
          .maybeSingle();
        return data as NarrativeRow | null;
      },
    })),
  });

  const narrativeBySymbol = useMemo(() => {
    const map = new Map<string, NarrativeRow>();
    narrativeQueries.forEach((q, i) => {
      const sym = heldSymbols?.[i];
      if (sym && q.data) map.set(sym, q.data);
    });
    return map;
  }, [narrativeQueries, heldSymbols]);

  // Aggregate current positions per symbol (sum across IBKR accounts so one
  // card reflects total holding regardless of where it lives).
  const positionBySymbol = useMemo(() => {
    const map = new Map<string, { shares: number; avg_cost: number | null; market_value: number | null }>();
    for (const p of positions.data ?? []) {
      if (p.asset_class !== "STK") continue;
      const qty = p.quantity ?? 0;
      const pAvgCost = p.cost_basis != null && qty !== 0 ? p.cost_basis / qty : null;
      const pMarketValue = p.position_value;
      const existing = map.get(p.symbol);
      if (existing) {
        const totalShares = existing.shares + qty;
        const weighted =
          existing.avg_cost != null && pAvgCost != null
            ? (existing.avg_cost * existing.shares + pAvgCost * qty) / (totalShares || 1)
            : (existing.avg_cost ?? pAvgCost);
        map.set(p.symbol, {
          shares: totalShares,
          avg_cost: weighted,
          market_value: (existing.market_value ?? 0) + (pMarketValue ?? 0),
        });
      } else {
        map.set(p.symbol, {
          shares: qty,
          avg_cost: pAvgCost,
          market_value: pMarketValue,
        });
      }
    }
    return map;
  }, [positions.data]);

  if (positions.isLoading || signals.isLoading) return <SectionLoading className="flex-1" />;
  if (positions.error) return <ErrorBanner message={String(positions.error)} />;
  if (signals.error) return <ErrorBanner message={String(signals.error)} />;

  const rows = (signals.data ?? []).slice().sort((a, b) => {
    const order: Record<string, number> = { buy: 0, trim: 1, hold: 2 };
    const sa = order[a.signal] ?? 3;
    const sb = order[b.signal] ?? 3;
    if (sa !== sb) return sa - sb;
    return a.symbol.localeCompare(b.symbol);
  });

  const counts = rows.reduce(
    (acc, r) => {
      acc[r.signal] = (acc[r.signal] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="p-6 space-y-4">
      <div>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Signals</h1>
          <GenerateAllButton rows={rows} narrativeBySymbol={narrativeBySymbol} />
        </div>
        <div className="mt-2 flex items-center gap-4 text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">{rows.length} holdings</span>
          <Pill tone="buy" count={counts.buy ?? 0} label="buy" />
          <Pill tone="trim" count={counts.trim ?? 0} label="trim" />
          <Pill tone="hold" count={counts.hold ?? 0} label="hold" />
        </div>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-3 max-w-2xl leading-relaxed">
          Per-symbol method picks the best available data:{" "}
          <b className="text-green-600 dark:text-green-400">PE</b> →{" "}
          <b className="text-teal-600 dark:text-teal-400">PS</b> →{" "}
          <b className="text-zinc-500">range</b>. Targets are the 20th / 80th percentile of the chosen metric.
          Always cross-check Stock Detail before acting.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 p-6 text-center text-sm text-zinc-500">
          No signals yet — run FMP sync to populate valuation history for your holdings.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {rows.map((r) => (
            <SignalCard
              key={r.symbol}
              row={r}
              onSelectSymbol={onSelectSymbol}
              narrative={narrativeBySymbol.get(r.symbol) ?? null}
              position={positionBySymbol.get(r.symbol) ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Bulk-generate narratives for all symbols that don't have one yet. Runs
 * them sequentially to be kind to Anthropic rate limits — 8 stocks at ~3s
 * each is ~30s total, still much better than clicking Generate eight times.
 */
function GenerateAllButton({
  rows,
  narrativeBySymbol,
}: {
  rows: InvestmentSignal[];
  narrativeBySymbol: Map<string, NarrativeRow>;
}) {
  const generate = useGenerateStockNarrative();
  const missing = rows.filter((r) => !narrativeBySymbol.has(r.symbol));
  const runAll = async () => {
    for (const r of missing) {
      try {
        await generate.mutateAsync({ symbol: r.symbol, force: false });
      } catch {
        // Continue with next symbol even if one fails.
      }
    }
  };
  if (missing.length === 0) return null;
  return (
    <button
      type="button"
      onClick={runAll}
      disabled={generate.isPending}
      className="inline-flex items-center gap-1.5 rounded-md border border-teal-200 dark:border-teal-800/60 bg-teal-50 dark:bg-teal-950/40 px-2.5 py-1 text-[11px] font-medium text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {generate.isPending ? (
        <>
          <Loader2 size={11} className="animate-spin" />
          Generating…
        </>
      ) : (
        <>
          <Sparkles size={11} />
          Generate AI analysis for {missing.length}
        </>
      )}
    </button>
  );
}

function Pill({ tone, count, label }: { tone: "buy" | "trim" | "hold"; count: number; label: string }) {
  const styles: Record<string, string> = {
    buy: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    trim: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    hold: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 ${styles[tone]}`}>
      <span className="font-semibold">{count}</span>
      <span className="uppercase text-[10px] tracking-wide">{label}</span>
    </span>
  );
}

interface NarrativeRow {
  symbol: string;
  narrative: string;
  summary: string | null;
  ai_buy_target: number | null;
  ai_fair_price: number | null;
  ai_trim_target: number | null;
  ai_confidence: "high" | "medium" | "low" | null;
  generated_at: string;
}

interface PositionInfo {
  shares: number;
  avg_cost: number | null;
  market_value: number | null;
}

function SignalCard({
  row,
  onSelectSymbol,
  narrative,
  position,
}: {
  row: InvestmentSignal;
  onSelectSymbol?: (symbol: string) => void;
  narrative: NarrativeRow | null;
  position: PositionInfo | null;
}) {
  const currency = row.currency ?? "USD";
  const generate = useGenerateStockNarrative();
  const accent = {
    buy: "border-l-green-500",
    trim: "border-l-amber-500",
    hold: "border-l-zinc-300 dark:border-l-zinc-700",
  }[row.signal];

  return (
    <div
      className={`group rounded-xl border border-zinc-200 dark:border-zinc-800 border-l-4 ${accent} bg-white dark:bg-zinc-900 p-4 hover:shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700 transition-shadow`}
    >
      {/* Header: signal + symbol + price */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <SignalBadge signal={row.signal} />
            <MethodBadge method={row.method} years={row.pe_history_years ?? row.ps_history_years} />
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            {onSelectSymbol ? (
              <button
                type="button"
                onClick={() => onSelectSymbol(row.symbol)}
                className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 hover:text-teal-700 dark:hover:text-teal-400"
              >
                {row.symbol}
              </button>
            ) : (
              <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{row.symbol}</span>
            )}
            {row.company_name && (
              <span className="text-xs text-zinc-500 truncate">{row.company_name}</span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
            {formatMoney(row.current_price, currency)}
          </div>
          <RevenueInline row={row} />
        </div>
      </div>

      {/* Visual band: buy ← fair → trim, with current-price marker */}
      <PositionBar row={row} />

      {/* Rule-based narrative */}
      <p className="mt-3 text-[12px] leading-snug text-zinc-600 dark:text-zinc-400">
        {buildNarrative(row)}
      </p>

      {/* AI analysis — summary + full narrative when generated, or a button
          to generate it inline when not */}
      <div className="mt-3 rounded-md bg-teal-50/60 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/40 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-start gap-1.5 text-[11px] font-semibold text-teal-700 dark:text-teal-300">
            <Sparkles size={11} className="flex-shrink-0 mt-0.5" />
            <span>{narrative?.summary ?? (narrative ? "AI analysis" : "AI analysis not generated yet")}</span>
          </div>
          <button
            type="button"
            onClick={() => generate.mutate({ symbol: row.symbol, force: narrative != null })}
            disabled={generate.isPending}
            className="inline-flex items-center gap-1 rounded border border-teal-200 dark:border-teal-800/60 bg-white/70 dark:bg-zinc-900/60 px-1.5 py-0.5 text-[10px] font-medium text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generate.isPending ? (
              <>
                <Loader2 size={10} className="animate-spin" />
                Thinking…
              </>
            ) : narrative ? (
              <>
                <RefreshCcw size={10} />
                Regenerate
              </>
            ) : (
              <>
                <Sparkles size={10} />
                Generate
              </>
            )}
          </button>
        </div>
        {generate.error && !narrative && (
          <p className="mt-1.5 text-[10px] text-amber-700 dark:text-amber-400">{String(generate.error)}</p>
        )}
        {narrative && (
          <>
            <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-700 dark:text-zinc-300">
              {narrative.narrative}
            </p>
            {(narrative.ai_buy_target != null || narrative.ai_trim_target != null) && (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-zinc-500">
                {narrative.ai_buy_target != null && (
                  <span>
                    AI buy{" "}
                    <b className="text-green-700 dark:text-green-400">
                      {formatMoney(narrative.ai_buy_target, currency)}
                    </b>
                  </span>
                )}
                {narrative.ai_fair_price != null && (
                  <span>
                    AI fair{" "}
                    <b className="text-zinc-700 dark:text-zinc-300">{formatMoney(narrative.ai_fair_price, currency)}</b>
                  </span>
                )}
                {narrative.ai_trim_target != null && (
                  <span>
                    AI trim{" "}
                    <b className="text-amber-700 dark:text-amber-400">
                      {formatMoney(narrative.ai_trim_target, currency)}
                    </b>
                  </span>
                )}
                {narrative.ai_confidence && <span>Confidence: {narrative.ai_confidence}</span>}
              </div>
            )}
          </>
        )}
      </div>

      {/* Position sizing — deterministic shares/dollars to act on */}
      <SizingSuggestion row={row} position={position} narrative={narrative} />

      {/* Footer metrics */}
      <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-wide text-zinc-500">
        <span>
          P/E <span className="font-medium text-zinc-700 dark:text-zinc-300 normal-case">{formatRatio(row.pe_current)}</span>
        </span>
        {row.pe_p20 != null && row.pe_p80 != null && (
          <span>
            Band <span className="font-medium text-zinc-700 dark:text-zinc-300 normal-case">
              {formatRatio(row.pe_p20)}–{formatRatio(row.pe_p80)}
            </span>
          </span>
        )}
        <span>
          History{" "}
          <span className="font-medium text-zinc-700 dark:text-zinc-300 normal-case">
            {row.pe_history_years ?? row.ps_history_years ?? "—"}y
          </span>
        </span>
      </div>
    </div>
  );
}

/**
 * Horizontal band showing where the current price sits between the buy and
 * trim targets. Visual intuition beats three numeric columns:
 *   [buy ●————————— trim]
 *           ↑ you are here
 * Green zone = below buy target, amber zone = above trim, neutral between.
 * If current price is way outside the band, we extend the bar and clip the
 * marker to the edge so it doesn't fall off.
 */
function PositionBar({ row }: { row: InvestmentSignal }) {
  const currency = row.currency ?? "USD";
  const { current_price: price, buy_target_price: buy, trim_target_price: trim } = row;
  if (price == null || buy == null || trim == null || trim <= buy) {
    return <div className="mt-3 h-8" />;
  }

  const span = trim - buy;
  const rawPct = ((price - buy) / span) * 100;
  const pct = Math.max(-10, Math.min(110, rawPct));
  const markerLeft = `${Math.max(0, Math.min(100, pct))}%`;

  return (
    <div className="mt-4">
      <div className="relative h-2 rounded-full bg-gradient-to-r from-green-200 via-zinc-200 to-amber-200 dark:from-green-900/40 dark:via-zinc-700 dark:to-amber-900/40">
        {/* Current price marker */}
        <div
          className="absolute -top-1 w-1 h-4 rounded-sm bg-zinc-900 dark:bg-zinc-100 -translate-x-1/2"
          style={{ left: markerLeft }}
          title={`Current: ${formatMoney(price, currency)}`}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] tabular-nums">
        <span className="text-green-700 dark:text-green-400">
          Buy ≤ {formatMoney(buy, currency)}
        </span>
        <span className="text-zinc-500">Fair {formatMoney(row.fair_price, currency)}</span>
        <span className="text-amber-700 dark:text-amber-400">
          Trim ≥ {formatMoney(trim, currency)}
        </span>
      </div>
    </div>
  );
}

/**
 * Deterministic position sizing — once the signal says buy/trim, this answers
 * "how much?". Intentionally rule-based (not LLM) because share math must
 * be precise and reproducible.
 *
 * Rules:
 *   BUY — scale in gradually, never go all-in at the first trigger:
 *     * price ≤ 95% of buy target  → add 20% of current position (aggressive)
 *     * price ≤ 100% of buy target → add 10% of current position (standard)
 *     * New position (shares = 0)   → starter tranche: 5% of estimated
 *       portfolio value (= sum of held market values)
 *   TRIM — lock in gains in stages; never fully exit on one signal:
 *     * price ≥ 110% of trim target → sell 25% of position (aggressive)
 *     * price ≥ 100% of trim target → sell 10% of position (standard)
 *   HOLD — no suggestion.
 *
 * Uses AI buy/trim targets if available (more context-aware), otherwise
 * falls back to the quant targets.
 */
/**
 * Always emits a sizing suggestion when there's a buy/trim signal —
 * either an "Add/Sell N shares" action if price is inside the target's
 * action zone, or a "Wait for $X" guidance when price is outside. This
 * way the card never goes silent after AI refinement narrows the zone.
 *
 * Uses AI targets when available (context-aware), quant targets otherwise.
 * When AI disagrees with the quant (e.g. AI says wait, quant says act),
 * we display BOTH: AI's recommendation is primary, quant is shown as a
 * secondary reference so you see the divergence.
 */
function SizingSuggestion({
  row,
  position,
  narrative,
}: {
  row: InvestmentSignal;
  position: PositionInfo | null;
  narrative: NarrativeRow | null;
}) {
  const currency = row.currency ?? "USD";
  const price = row.current_price;
  if (price == null) return null;

  const aiBuy = narrative?.ai_buy_target ?? null;
  const aiTrim = narrative?.ai_trim_target ?? null;
  const quantBuy = row.buy_target_price;
  const quantTrim = row.trim_target_price;
  const shares = position?.shares ?? 0;

  // Active target — prefer AI if set, else quant. The OTHER is shown as a
  // reference line when the two disagree about whether to act now.
  const buyTarget = aiBuy ?? quantBuy;
  const trimTarget = aiTrim ?? quantTrim;

  // Derive the *effective* action state from price vs targets, not from the
  // quant's `signal` column. This way, HOLD cards where the AI has opinions
  // (e.g. "buy below $185" with price at $202) still show a wait box with
  // specific triggers instead of going silent.
  const inBuyZone = buyTarget != null && price <= buyTarget;
  const inTrimZone = trimTarget != null && price >= trimTarget;

  if (!inBuyZone && !inTrimZone) {
    // Fair zone — show both trigger prices so user knows what to watch for.
    if (buyTarget == null && trimTarget == null) return null;
    const toBuy = buyTarget != null ? ((price - buyTarget) / buyTarget) * 100 : null;
    const toTrim = trimTarget != null ? ((trimTarget - price) / trimTarget) * 100 : null;
    const source = aiBuy != null || aiTrim != null ? "AI" : "Quant";
    const parts: string[] = [];
    if (buyTarget != null) parts.push(`add below ${formatMoney(buyTarget, currency)} (${toBuy!.toFixed(1)}% away)`);
    if (trimTarget != null) parts.push(`trim above ${formatMoney(trimTarget, currency)} (${toTrim!.toFixed(1)}% away)`);
    return (
      <ActionBox
        tone="wait"
        label={`Hold — watching for triggers`}
        detail={`${source}: ${parts.join(" · ")}. Current ${formatMoney(price, currency)} is in the fair zone.`}
      />
    );
  }

  if (inBuyZone) {
    const source = aiBuy != null ? "AI" : "quant";
    const otherTarget = aiBuy != null && quantBuy != null ? quantBuy : null;
    const aggressive = price <= buyTarget! * 0.95;
    if (shares === 0) {
      return (
        <ActionBox
          tone="buy"
          label="Start position (3-5% of portfolio)"
          detail={`Price ${formatMoney(price, currency)} is below ${source} buy target ${formatMoney(buyTarget!, currency)}.`}
        />
      );
    }
    const pct = aggressive ? 0.2 : 0.1;
    const addShares = Math.max(1, Math.round(shares * pct));
    const dollars = addShares * price;
    return (
      <ActionBox
        tone="buy"
        label={`Add ${addShares} shares (~${formatMoney(dollars, currency)})`}
        detail={`${aggressive ? "Aggressive add" : "Standard add"} — ${(pct * 100).toFixed(0)}% of your ${shares} shares. Price ${formatMoney(price, currency)} is ${aggressive ? "comfortably" : "just"} below ${source} buy ${formatMoney(buyTarget!, currency)}.${otherTarget != null && price <= otherTarget ? ` Quant buy ${formatMoney(otherTarget, currency)} also in zone.` : ""}`}
      />
    );
  }

  // inTrimZone
  if (shares === 0) return null;
  const source = aiTrim != null ? "AI" : "quant";
  const otherTarget = aiTrim != null && quantTrim != null ? quantTrim : null;
  const aggressive = price >= trimTarget! * 1.1;
  const pct = aggressive ? 0.25 : 0.1;
  const sellShares = Math.max(1, Math.round(shares * pct));
  const dollars = sellShares * price;
  const remaining = shares - sellShares;
  return (
    <ActionBox
      tone="trim"
      label={`Sell ${sellShares} shares (~${formatMoney(dollars, currency)})`}
      detail={`${aggressive ? "Aggressive trim" : "Standard trim"} — ${(pct * 100).toFixed(0)}% of your ${shares} shares, leaving ${remaining}. Price ${formatMoney(price, currency)} is ${aggressive ? "well" : ""} above ${source} trim ${formatMoney(trimTarget!, currency)}.${otherTarget != null && price >= otherTarget ? ` Quant trim ${formatMoney(otherTarget, currency)} also in zone.` : ""}`}
    />
  );
}

function ActionBox({
  tone,
  label,
  detail,
}: {
  tone: "buy" | "trim" | "wait";
  label: string;
  detail: string;
}) {
  const styles = {
    buy: "border-green-200 bg-green-50/70 dark:border-green-900/40 dark:bg-green-950/20 text-green-900 dark:text-green-200",
    trim: "border-amber-200 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200",
    wait: "border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/40 text-zinc-700 dark:text-zinc-300",
  };
  const arrow = tone === "wait" ? "⏸" : "→";
  return (
    <div className={`mt-3 rounded-md border px-2.5 py-2 ${styles[tone]}`}>
      <div className="text-[11px] font-semibold">
        {arrow} {label}
      </div>
      <div className="mt-0.5 text-[10px] opacity-80 leading-snug">{detail}</div>
    </div>
  );
}

function RevenueInline({ row }: { row: InvestmentSignal }) {
  if (row.revenue_yoy == null) return null;
  const positive = row.revenue_yoy > 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  const color = positive
    ? "text-green-600 dark:text-green-400"
    : "text-red-600 dark:text-red-400";
  return (
    <div className={`mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium ${color}`}>
      <Icon size={11} />
      <span>{formatPct(row.revenue_yoy)} rev</span>
    </div>
  );
}

/**
 * One-line explanation of the signal. Answers "what is the system seeing
 * that led to this action?" — tailored per method so the language matches
 * the underlying metric.
 */
function buildNarrative(r: InvestmentSignal): string {
  const ccy = r.currency ?? "USD";
  const revTrend =
    r.revenue_yoy == null
      ? null
      : r.revenue_yoy > 0
        ? `revenue growing ${formatPct(r.revenue_yoy)} YoY`
        : `revenue shrinking ${formatPct(Math.abs(r.revenue_yoy))} YoY`;

  if (!r.method) {
    return "No recommendation — not enough data yet. Try Sync FMP or wait for more history.";
  }

  if (r.signal === "buy") {
    if (r.method === "pe" && r.pe_current != null && r.pe_p20 != null) {
      const trap = r.revenue_yoy != null && r.revenue_yoy < 0 ? " But revenue is shrinking — could be a value trap." : "";
      return `Cheap on earnings — P/E of ${formatRatio(r.pe_current)} is below its ${r.pe_history_years}y floor of ${formatRatio(r.pe_p20)}${revTrend ? `, with ${revTrend}` : ""}. Fair value ~${formatMoney(r.fair_price, ccy)}.${trap}`;
    }
    if (r.method === "ps" && r.ps_current != null && r.ps_p20 != null) {
      return `Cheap on sales — P/S of ${formatRatio(r.ps_current)} is below its bottom-quintile of ${formatRatio(r.ps_p20)}. P/S-based because the company is unprofitable today, ${revTrend ?? "revenue trend unknown"}.`;
    }
    return `Near the bottom of its recent trading range. Range-based signal — no fundamental anchor, just mean-reversion.`;
  }

  if (r.signal === "trim") {
    if (r.method === "pe" && r.pe_current != null && r.pe_p80 != null) {
      const justified = revTrend && r.revenue_yoy != null && r.revenue_yoy > 0.2 ? ` But ${revTrend} — strong growth can justify elevated multiples.` : "";
      return `Rich on earnings — P/E of ${formatRatio(r.pe_current)} is above its ${r.pe_history_years}y ceiling of ${formatRatio(r.pe_p80)}. Historically reverts toward ${formatMoney(r.fair_price, ccy)}.${justified}`;
    }
    if (r.method === "ps" && r.ps_current != null && r.ps_p80 != null) {
      return `Rich on sales — P/S of ${formatRatio(r.ps_current)} is above its top-quintile of ${formatRatio(r.ps_p80)}. P/S-based because the company is unprofitable, ${revTrend ?? "revenue trend unknown"}.`;
    }
    return `Near the top of its recent trading range. Range-based signal — mean-reversion, no fundamental anchor.`;
  }

  // hold
  if (r.method === "pe" && r.pe_current != null) {
    return `Fair zone — P/E of ${formatRatio(r.pe_current)} sits inside its historical band${revTrend ? `, ${revTrend}` : ""}. No action.`;
  }
  if (r.method === "ps" && r.ps_current != null) {
    return `Fair zone on sales — P/S of ${formatRatio(r.ps_current)} is inside its historical band. P/S-based (unprofitable today).`;
  }
  return `Middle of recent trading range. Range-based hold — no fundamental anchor.`;
}

function MethodBadge({
  method,
  years,
}: {
  method: InvestmentSignal["method"];
  years: number | null;
}) {
  if (!method) return <span className="text-[10px] text-zinc-400">—</span>;
  const styles: Record<NonNullable<InvestmentSignal["method"]>, string> = {
    pe: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    ps: "bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
    "price-range": "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  };
  const label = method === "price-range" ? "RANGE" : method.toUpperCase();
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${styles[method]}`}
      title={
        method === "pe"
          ? `P/E percentile over ${years ?? "?"} years`
          : method === "ps"
            ? `P/S percentile over ${years ?? "?"} years`
            : "Price-range percentile (mean reversion, no fundamentals)"
      }
    >
      {label}
    </span>
  );
}

function SignalBadge({ signal }: { signal: InvestmentSignal["signal"] }) {
  const styles: Record<InvestmentSignal["signal"], string> = {
    buy: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    trim: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    hold: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  };
  const Icon = signal === "buy" ? ArrowUp : signal === "trim" ? ArrowDown : Minus;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${styles[signal]}`}
    >
      <Icon size={11} /> {signal}
    </span>
  );
}
