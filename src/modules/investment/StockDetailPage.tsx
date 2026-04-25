// Stock Detail — drill-down for a single symbol.
//
// Goal: answer "is this a good time to add / trim / exit?" by overlaying
// current valuation against the stock's own historical distribution and
// showing fundamental trajectory. All data comes from the typed fmp_*
// projection tables populated by the FMP sync.
//
// Sections (top → bottom):
//   1. Header — company name, sector/industry, current price, beta, market cap
//   2. Price chart — 5y daily close (adjClose preferred, fallback close)
//   3. Valuation trend — PE/PB/EV-EBITDA lines with percentile shading vs. history
//   4. Fundamentals trend — revenue + net income bars by fiscal year
//   5. Quarterly revenue — last 12 quarters, bars
//
// Keep chart configs boring and consistent: Recharts defaults with Tailwind
// colours. If a chart has no data (sync didn't pull that endpoint or it's
// plan-restricted), show a muted placeholder rather than an empty chart.

import { useMemo } from "react";
import { ArrowLeft, ExternalLink, Sparkles, RefreshCcw, Loader2 } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";
import {
  useStockProfile,
  useStockPrices,
  useStockRatios,
  useStockIncomeAnnual,
  useStockIncomeQuarterly,
  useStockNews,
  useStockAnalyst,
  useStockNarrative,
  useGenerateStockNarrative,
  type StockProfile,
  type PriceBar,
  type RatiosYearRow,
  type IncomeYearRow,
  type IncomeQuarterRow,
  type NewsItem,
  type AnalystSnapshot,
  type StockNarrative,
} from "../../hooks/investment";
import { SectionLoading, ErrorBanner } from "../../components/ui";

interface StockDetailPageProps {
  symbol: string;
  onBack: () => void;
}

function formatMoney(n: number | null | undefined, currency = "USD"): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatLargeMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toFixed(0)}`;
}

function formatRatio(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(2);
}

/** Quantile helper for percentile banding — p in [0,1]. Returns null for empty. */
function quantile(arr: number[], p: number): number | null {
  const sorted = arr.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function StockDetailPage({ symbol, onBack }: StockDetailPageProps) {
  const profile = useStockProfile(symbol);
  const prices = useStockPrices(symbol, 5);
  const ratios = useStockRatios(symbol);
  const incomeAnnual = useStockIncomeAnnual(symbol);
  const incomeQuarterly = useStockIncomeQuarterly(symbol, 12);
  const news = useStockNews(symbol, 10);
  const analyst = useStockAnalyst(symbol);
  const narrative = useStockNarrative(symbol);
  const generateNarrative = useGenerateStockNarrative();

  const currency = profile.data?.currency ?? "USD";

  const anyLoading =
    profile.isLoading ||
    prices.isLoading ||
    ratios.isLoading ||
    incomeAnnual.isLoading ||
    incomeQuarterly.isLoading;

  const firstError =
    profile.error ?? prices.error ?? ratios.error ?? incomeAnnual.error ?? incomeQuarterly.error;

  if (anyLoading) return <SectionLoading className="flex-1" />;
  if (firstError) return <ErrorBanner message={String(firstError)} />;

  return (
    <div className="p-6 space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        <ArrowLeft size={14} /> Back to Positions
      </button>

      <Header symbol={symbol} data={profile.data ?? null} currency={currency} />

      <NarrativeCard
        symbol={symbol}
        narrative={narrative.data ?? null}
        onGenerate={(force) => generateNarrative.mutate({ symbol, force })}
        isGenerating={generateNarrative.isPending}
        error={generateNarrative.error ? String(generateNarrative.error) : null}
      />

      {analyst.data && <AnalystCard data={analyst.data} price={profile.data?.price ?? null} currency={currency} />}

      <Section title="Price — last 5 years">
        <PriceChart prices={prices.data ?? []} />
      </Section>

      <Section title="Valuation trend (annual)">
        <ValuationChart ratios={ratios.data ?? []} />
      </Section>

      <Section title="Revenue & net income (annual)">
        <IncomeAnnualChart rows={incomeAnnual.data ?? []} />
      </Section>

      <Section title="Quarterly revenue (last 12 quarters)">
        <IncomeQuarterlyChart rows={incomeQuarterly.data ?? []} />
      </Section>

      <Section title="Recent news">
        <NewsList items={news.data ?? []} />
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI narrative — Claude-written synthesis of signal + news + analyst + news
// ---------------------------------------------------------------------------

function NarrativeCard({
  symbol,
  narrative,
  onGenerate,
  isGenerating,
  error,
}: {
  symbol: string;
  narrative: StockNarrative | null;
  onGenerate: (force: boolean) => void;
  isGenerating: boolean;
  error: string | null;
}) {
  const generatedAt = narrative?.generated_at
    ? new Date(narrative.generated_at).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-gradient-to-br from-teal-50/40 via-white to-white dark:from-teal-950/20 dark:via-zinc-900 dark:to-zinc-900 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-500">
          <Sparkles size={13} className="text-teal-600 dark:text-teal-400" />
          AI analysis
          {narrative && (
            <span className="ml-1 normal-case text-[10px] text-zinc-400">
              · {narrative.model.split("/").pop() ?? narrative.model} · {generatedAt}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onGenerate(narrative != null)}
          disabled={isGenerating}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 px-2 py-1 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <Loader2 size={11} className="animate-spin" />
              Thinking…
            </>
          ) : narrative ? (
            <>
              <RefreshCcw size={11} />
              Regenerate
            </>
          ) : (
            <>
              <Sparkles size={11} />
              Generate
            </>
          )}
        </button>
      </div>

      {error ? (
        <div className="mt-3 text-xs text-amber-700 dark:text-amber-400">{error}</div>
      ) : narrative ? (
        <>
          <AiPriceRow narrative={narrative} />
          <div className="mt-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap">
            {narrative.narrative}
          </div>
        </>
      ) : (
        <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          No narrative yet — click Generate to have Claude synthesise the quant signal, recent news, and analyst
          sentiment into a read on {symbol} plus its own buy/fair/trim prices.
        </div>
      )}
    </div>
  );
}

function AiPriceRow({ narrative }: { narrative: StockNarrative }) {
  const { ai_buy_target: buy, ai_fair_price: fair, ai_trim_target: trim, ai_confidence: conf } = narrative;
  if (buy == null && fair == null && trim == null) return null;

  const confStyles: Record<string, string> = {
    high: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    medium: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
    low: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  };

  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      <AiPriceCell label="Buy below" value={buy} tone="green" />
      <AiPriceCell label="Fair" value={fair} tone="zinc" />
      <AiPriceCell label="Trim above" value={trim} tone="amber" />
      {conf && (
        <div className="col-span-3 text-[10px] uppercase tracking-wide text-zinc-500">
          Claude's confidence:{" "}
          <span className={`ml-1 inline-flex items-center rounded px-1.5 py-0.5 font-semibold ${confStyles[conf]}`}>
            {conf}
          </span>
        </div>
      )}
    </div>
  );
}

function AiPriceCell({ label, value, tone }: { label: string; value: number | null; tone: "green" | "zinc" | "amber" }) {
  const colors = {
    green: "text-green-700 dark:text-green-400",
    amber: "text-amber-700 dark:text-amber-400",
    zinc: "text-zinc-700 dark:text-zinc-300",
  };
  return (
    <div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${colors[tone]}`}>
        {value != null
          ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value)
          : "—"}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Analyst card — consensus price target + Buy/Hold/Sell distribution
// ---------------------------------------------------------------------------

function AnalystCard({
  data,
  price,
  currency,
}: {
  data: AnalystSnapshot;
  price: number | null;
  currency: string;
}) {
  const hasTarget = data.target_mean != null || data.target_median != null;
  const hasGrades =
    (data.strong_buy ?? 0) + (data.buy ?? 0) + (data.hold ?? 0) + (data.sell ?? 0) + (data.strong_sell ?? 0) > 0;

  if (!hasTarget && !hasGrades && !data.rating) return null;

  const target = data.target_median ?? data.target_mean;
  const upside = target != null && price != null && price > 0 ? (target - price) / price : null;

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        {hasTarget && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">Analyst target</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                {formatMoney(target, currency)}
              </span>
              {upside != null && (
                <span
                  className={`text-xs font-medium ${
                    upside > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {upside > 0 ? "+" : ""}
                  {(upside * 100).toFixed(1)}% vs price
                </span>
              )}
            </div>
            {data.target_low != null && data.target_high != null && (
              <div className="mt-1 text-[11px] text-zinc-500">
                Range {formatMoney(data.target_low, currency)} – {formatMoney(data.target_high, currency)}
                {data.target_count ? ` · ${data.target_count} analysts` : ""}
              </div>
            )}
          </div>
        )}

        {hasGrades && <GradeDistribution data={data} />}

        {data.rating && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">FMP rating</div>
            <div className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{data.rating}</div>
            {data.rating_score != null && (
              <div className="text-[11px] text-zinc-500">Score {data.rating_score.toFixed(1)}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function GradeDistribution({ data }: { data: AnalystSnapshot }) {
  const rows: { label: string; value: number; color: string }[] = [
    { label: "Strong Buy", value: data.strong_buy ?? 0, color: "bg-green-500" },
    { label: "Buy", value: data.buy ?? 0, color: "bg-green-400" },
    { label: "Hold", value: data.hold ?? 0, color: "bg-zinc-400" },
    { label: "Sell", value: data.sell ?? 0, color: "bg-amber-400" },
    { label: "Strong Sell", value: data.strong_sell ?? 0, color: "bg-red-500" },
  ];
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  if (total === 0) return null;

  return (
    <div className="min-w-[260px] flex-1">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">
        Analyst ratings {data.consensus ? `· ${data.consensus}` : ""}
      </div>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        {rows.map(
          (r) =>
            r.value > 0 && (
              <div
                key={r.label}
                className={r.color}
                style={{ width: `${(r.value / total) * 100}%` }}
                title={`${r.label}: ${r.value}`}
              />
            ),
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-zinc-500">
        {rows.map((r) => (
          <span key={r.label}>
            {r.label.split(" ")[0]} <span className="font-medium text-zinc-700 dark:text-zinc-300">{r.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// News list — recent headlines with source + relative time
// ---------------------------------------------------------------------------

function NewsList({ items }: { items: NewsItem[] }) {
  if (items.length === 0) {
    return <Empty hint="No news synced yet — run FMP sync for this symbol." />;
  }
  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {items.map((item) => (
        <li key={item.url} className="py-3 first:pt-0 last:pb-0">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start gap-3"
          >
            {item.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.image}
                alt=""
                className="w-16 h-16 rounded object-cover flex-shrink-0 border border-zinc-200 dark:border-zinc-800"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 group-hover:text-teal-700 dark:group-hover:text-teal-400 leading-snug">
                {item.title}
                <ExternalLink size={11} className="inline-block ml-1 opacity-0 group-hover:opacity-100 align-middle" />
              </div>
              <div className="mt-1 text-[11px] text-zinc-500">
                {item.site ?? "Unknown source"} · {formatRelative(item.published_at)}
              </div>
              {item.text && (
                <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2">{item.text}</div>
              )}
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  const diffHr = Math.floor(diffMs / 3_600_000);
  if (diffHr < 1) return "just now";
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

interface HeaderProps {
  symbol: string;
  data: StockProfile | null;
  currency: string;
}

function Header({ symbol, data, currency }: HeaderProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{symbol}</h1>
        {data?.company_name && (
          <span className="text-base text-zinc-500 dark:text-zinc-400">{data.company_name}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        {data?.sector && <span>Sector: <span className="text-zinc-700 dark:text-zinc-300">{data.sector}</span></span>}
        {data?.industry && <span>Industry: <span className="text-zinc-700 dark:text-zinc-300">{data.industry}</span></span>}
        {data?.country && <span>Country: <span className="text-zinc-700 dark:text-zinc-300">{data.country}</span></span>}
        {data?.exchange && <span>Exchange: <span className="text-zinc-700 dark:text-zinc-300">{data.exchange}</span></span>}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm pt-2">
        <Stat label="Price" value={formatMoney(data?.price, currency)} />
        <Stat label="Market cap" value={formatLargeMoney(data?.market_cap)} />
        <Stat label="Beta" value={formatRatio(data?.beta)} />
        <Stat label="Last dividend" value={formatMoney(data?.last_dividend, currency)} />
      </div>
      {data?.description && (
        <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-3xl leading-relaxed pt-2 line-clamp-3">
          {data.description}
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="text-zinc-900 dark:text-zinc-100 font-medium">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-4">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Empty({ hint }: { hint: string }) {
  return (
    <div className="flex items-center justify-center h-40 text-xs text-zinc-400 dark:text-zinc-500">
      {hint}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

function PriceChart({ prices }: { prices: PriceBar[] }) {
  const data = useMemo(
    () =>
      prices
        .map((p) => ({ date: p.date, close: p.adj_close ?? p.close }))
        .filter((d) => d.close != null),
    [prices],
  );

  if (data.length === 0) return <Empty hint="No price data — run FMP sync for this symbol." />;

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d9488" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#0d9488" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(113,113,122,0.15)" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a" }} minTickGap={40} />
          <YAxis
            tick={{ fontSize: 10, fill: "#71717a" }}
            domain={["auto", "auto"]}
            tickFormatter={(v) => v.toFixed(0)}
          />
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 6 }}
            formatter={(v: unknown) => (typeof v === "number" ? v.toFixed(2) : "—")}
          />
          <Area type="monotone" dataKey="close" stroke="#0d9488" strokeWidth={1.5} fill="url(#priceFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function ValuationChart({ ratios }: { ratios: RatiosYearRow[] }) {
  const data = useMemo(
    () =>
      ratios.map((r) => ({
        fiscal_year: r.fiscal_year,
        pe: r.pe_ratio,
        pb: r.price_to_book,
        ev_ebitda: r.ev_to_ebitda,
      })),
    [ratios],
  );

  const peBands = useMemo(() => {
    const vals = data.map((d) => d.pe).filter((v): v is number => v != null && Number.isFinite(v));
    return {
      p25: quantile(vals, 0.25),
      median: quantile(vals, 0.5),
      p75: quantile(vals, 0.75),
    };
  }, [data]);

  if (data.length === 0) return <Empty hint="No ratios data — annual ratios sync skipped or empty." />;

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(113,113,122,0.15)" vertical={false} />
          <XAxis dataKey="fiscal_year" tick={{ fontSize: 10, fill: "#71717a" }} />
          <YAxis tick={{ fontSize: 10, fill: "#71717a" }} />
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 6 }}
            formatter={(v: unknown) => (typeof v === "number" ? v.toFixed(2) : "—")}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {peBands.median != null && (
            <ReferenceLine
              y={peBands.median}
              stroke="#a1a1aa"
              strokeDasharray="3 3"
              label={{ value: "PE median", fontSize: 10, fill: "#71717a", position: "right" }}
            />
          )}
          <Line type="monotone" dataKey="pe" name="P/E" stroke="#0d9488" strokeWidth={1.5} dot={{ r: 2 }} />
          <Line type="monotone" dataKey="pb" name="P/B" stroke="#6366f1" strokeWidth={1.5} dot={{ r: 2 }} />
          <Line
            type="monotone"
            dataKey="ev_ebitda"
            name="EV/EBITDA"
            stroke="#f59e0b"
            strokeWidth={1.5}
            dot={{ r: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function IncomeAnnualChart({ rows }: { rows: IncomeYearRow[] }) {
  if (rows.length === 0) return <Empty hint="No income statement data." />;
  const data = rows.map((r) => ({
    fiscal_year: r.fiscal_year,
    revenue: r.revenue ?? 0,
    net_income: r.net_income ?? 0,
  }));

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(113,113,122,0.15)" vertical={false} />
          <XAxis dataKey="fiscal_year" tick={{ fontSize: 10, fill: "#71717a" }} />
          <YAxis
            tick={{ fontSize: 10, fill: "#71717a" }}
            tickFormatter={(v) => formatLargeMoney(v).replace("$", "")}
          />
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 6 }}
            formatter={(v: unknown) => formatLargeMoney(typeof v === "number" ? v : null)}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="revenue" name="Revenue" fill="#0d9488" />
          <Bar dataKey="net_income" name="Net income" fill="#6366f1" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function IncomeQuarterlyChart({ rows }: { rows: IncomeQuarterRow[] }) {
  if (rows.length === 0) return <Empty hint="No quarterly income data." />;
  const data = rows.map((r) => ({
    label: `${r.fiscal_date}${r.period ? ` ${r.period}` : ""}`,
    revenue: r.revenue ?? 0,
  }));

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(113,113,122,0.15)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: "#71717a" }}
            interval={0}
            angle={-30}
            textAnchor="end"
            height={60}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#71717a" }}
            tickFormatter={(v) => formatLargeMoney(v).replace("$", "")}
          />
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 6 }}
            formatter={(v: unknown) => formatLargeMoney(typeof v === "number" ? v : null)}
          />
          <Bar dataKey="revenue" name="Revenue" fill="#0d9488" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

