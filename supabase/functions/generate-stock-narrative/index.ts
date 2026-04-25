// Supabase Edge Function: Generate an AI narrative for one symbol.
//
// POST /generate-stock-narrative
// Body: { symbol: string, force?: boolean }
//
// Pulls signal + news + analyst + profile + recent quarterly trend from the
// workspace DB, sends it to Claude via OpenRouter, writes the result to
// `stock_narratives`. Uses `inputs_hash` to short-circuit when nothing
// material has changed — client can pass `force: true` to bypass.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;

const supabase = createClient(supabaseUrl, supabaseKey);

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-sonnet-4-6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

interface Signal {
  symbol: string;
  company_name: string | null;
  sector: string | null;
  industry: string | null;
  currency: string | null;
  current_price: number | null;
  pe_current: number | null;
  pe_p20: number | null;
  pe_p50: number | null;
  pe_p80: number | null;
  pe_history_years: number | null;
  ps_current: number | null;
  ps_p20: number | null;
  ps_p80: number | null;
  buy_target_price: number | null;
  fair_price: number | null;
  trim_target_price: number | null;
  revenue_yoy: number | null;
  pe_band: string;
  revenue_trend: string;
  method: string | null;
  signal: string;
}

async function hash(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

async function loadContext(symbol: string) {
  const [signalRes, profileRes, cacheRes, quartersRes] = await Promise.all([
    supabase.from("v_investment_signals").select("*").eq("symbol", symbol).maybeSingle(),
    supabase.from("fmp_profiles").select("description").eq("symbol", symbol).maybeSingle(),
    supabase
      .from("fmp_cache")
      .select("endpoint,data")
      .eq("symbol", symbol)
      .in("endpoint", ["stock-news", "price-target-consensus", "stock-grades-summary", "ratings-snapshot"]),
    supabase
      .from("fmp_income_quarter")
      .select("fiscal_date,period,revenue,net_income,eps")
      .eq("symbol", symbol)
      .order("fiscal_date", { ascending: false })
      .limit(6),
  ]);

  const cacheByEndpoint = new Map<string, unknown>();
  for (const row of cacheRes.data ?? []) {
    cacheByEndpoint.set((row as { endpoint: string }).endpoint, (row as { data: unknown }).data);
  }

  const newsRaw = cacheByEndpoint.get("stock-news");
  const news: { title: string; published: string; site: string | null; summary: string | null }[] =
    Array.isArray(newsRaw)
      ? newsRaw
          .slice(0, 8)
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const e = item as Record<string, unknown>;
            const title = str(e.title);
            const published = str(e.publishedDate) ?? str(e.date);
            if (!title || !published) return null;
            return {
              title,
              published,
              site: str(e.site) ?? str(e.publisher),
              summary: str(e.text)?.slice(0, 300) ?? null,
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)
      : [];

  const targetRaw = cacheByEndpoint.get("price-target-consensus");
  const targetFirst = Array.isArray(targetRaw) && targetRaw[0] ? (targetRaw[0] as Record<string, unknown>) : {};
  const target = {
    high: num(targetFirst.targetHigh),
    low: num(targetFirst.targetLow),
    median: num(targetFirst.targetMedian) ?? num(targetFirst.targetConsensus),
    mean: num(targetFirst.targetMean) ?? num(targetFirst.targetAvg),
    count: num(targetFirst.numberOfAnalysts),
  };

  const gradesRaw = cacheByEndpoint.get("stock-grades-summary");
  const gradesFirst = Array.isArray(gradesRaw) && gradesRaw[0] ? (gradesRaw[0] as Record<string, unknown>) : {};
  const grades = {
    consensus: str(gradesFirst.consensus),
    strong_buy: num(gradesFirst.strongBuy),
    buy: num(gradesFirst.buy),
    hold: num(gradesFirst.hold),
    sell: num(gradesFirst.sell),
    strong_sell: num(gradesFirst.strongSell),
  };

  const ratingRaw = cacheByEndpoint.get("ratings-snapshot");
  const ratingFirst = Array.isArray(ratingRaw) && ratingRaw[0] ? (ratingRaw[0] as Record<string, unknown>) : {};
  const rating = {
    rating: str(ratingFirst.rating),
    score: num(ratingFirst.overallScore),
  };

  return {
    signal: (signalRes.data ?? null) as Signal | null,
    description: (profileRes.data as { description: string | null } | null)?.description ?? null,
    quarters: (quartersRes.data ?? []) as {
      fiscal_date: string;
      period: string | null;
      revenue: number | null;
      net_income: number | null;
      eps: number | null;
    }[],
    news,
    target,
    grades,
    rating,
  };
}

type Context = Awaited<ReturnType<typeof loadContext>>;

function buildPrompt(ctx: Context): string {
  const s = ctx.signal;
  if (!s) return "";

  const price = s.current_price ?? 0;
  const upside =
    ctx.target.median != null && price > 0 ? ((ctx.target.median - price) / price) * 100 : null;

  const lines: string[] = [
    `SYMBOL: ${s.symbol}${s.company_name ? ` (${s.company_name})` : ""}`,
    `SECTOR: ${s.sector ?? "?"} / ${s.industry ?? "?"}`,
    ctx.description ? `WHAT THEY DO: ${ctx.description.slice(0, 400)}` : "",
    "",
    `QUANT SIGNAL: ${s.signal.toUpperCase()} (method: ${s.method ?? "none"})`,
    `PRICE: ${s.currency ?? "USD"} ${price.toFixed(2)}`,
    `BUY TARGET: ${s.buy_target_price != null ? s.buy_target_price.toFixed(2) : "—"}`,
    `FAIR VALUE: ${s.fair_price != null ? s.fair_price.toFixed(2) : "—"}`,
    `TRIM TARGET: ${s.trim_target_price != null ? s.trim_target_price.toFixed(2) : "—"}`,
    `P/E NOW: ${s.pe_current != null ? s.pe_current.toFixed(1) : "—"} vs ${s.pe_history_years ?? "?"}y band ${s.pe_p20?.toFixed(1) ?? "?"}–${s.pe_p80?.toFixed(1) ?? "?"}`,
    s.method === "ps"
      ? `P/S NOW: ${s.ps_current?.toFixed(1) ?? "—"} vs band ${s.ps_p20?.toFixed(1) ?? "?"}–${s.ps_p80?.toFixed(1) ?? "?"}`
      : "",
    `REVENUE YoY: ${s.revenue_yoy != null ? (s.revenue_yoy * 100).toFixed(1) + "%" : "—"} (${s.revenue_trend})`,
    "",
    `ANALYST TARGET: ${ctx.target.median?.toFixed(2) ?? "—"} (median, ${ctx.target.count ?? "?"} analysts)${upside != null ? ` — ${upside > 0 ? "+" : ""}${upside.toFixed(1)}% vs price` : ""}`,
    `ANALYST CONSENSUS: ${ctx.grades.consensus ?? "?"} (SB:${ctx.grades.strong_buy ?? 0} B:${ctx.grades.buy ?? 0} H:${ctx.grades.hold ?? 0} S:${ctx.grades.sell ?? 0} SS:${ctx.grades.strong_sell ?? 0})`,
    ctx.rating.rating ? `FMP RATING: ${ctx.rating.rating} (score ${ctx.rating.score?.toFixed(1) ?? "?"})` : "",
    "",
    "RECENT QUARTERLY REVENUE (newest first):",
    ...ctx.quarters
      .slice(0, 4)
      .map(
        (q) =>
          `  ${q.period ?? q.fiscal_date}: revenue ${q.revenue != null ? (q.revenue / 1e9).toFixed(2) + "B" : "—"}, EPS ${q.eps?.toFixed(2) ?? "—"}`,
      ),
    "",
    `RECENT NEWS (last ${ctx.news.length} headlines):`,
    ...ctx.news.map((n, i) => `  ${i + 1}. [${n.published.slice(0, 10)}] ${n.title}${n.site ? ` — ${n.site}` : ""}`),
  ];

  return lines.filter(Boolean).join("\n");
}

const SYSTEM_PROMPT = `You are an investment analyst writing honest, decision-ready notes for a personal portfolio.

Your job: analyze ${"${SYMBOL}"} and output your OWN recommended buy/fair/trim prices, derived from the full picture — analyst consensus, recent news tone, valuation vs history, growth trajectory. The user already has a mechanical quant-derived price band; your value is in pressure-testing it with context the quant can't see.

METHODOLOGY (do this in your head before answering):
1. Start from analyst median target as an anchor if available.
2. Adjust down if: news is deteriorating (lawsuits, misses, layoffs, guidance cuts, sector headwinds), growth is decelerating, accounting concerns surface.
3. Adjust up if: news is improving (beats, raises, partnerships, tailwinds), growth accelerating, catalysts landing.
4. Cross-check against the historical valuation band — if your number implies a P/E far outside the stock's own history, reconsider.
5. "Buy below" = the price at which risk/reward is clearly favorable given what you know today. "Trim above" = the price at which valuation is stretched enough that taking some profit is prudent.

OUTPUT — return ONLY a JSON object, no prose outside it, no markdown fences:
{
  "buy_target": number | null,    // price to add more below
  "fair_price": number | null,    // your fair value estimate today
  "trim_target": number | null,   // price to take profit above
  "confidence": "high" | "medium" | "low",  // based on data completeness & signal agreement
  "narrative": "3-5 sentences of flowing prose. Must: (1) state your buy/fair/trim and why, citing specific evidence; (2) compare with the quant signal and call out any disagreement; (3) weight recent news tone; (4) end with a decision — add / hold / trim — for TODAY's price.",
  "summary": "one sentence starting with Buy / Hold / Trim, ~12 words, e.g. 'Buy below $X — analysts bullish and Q3 beat justifies current valuation.'"
}

Rules:
- Ground every claim in the provided data. Never invent numbers.
- All prices in the same currency as "PRICE" in the input. No unit conversion.
- "confidence": "low" if data is sparse (new IPO, currency mismatch flagged, no analyst coverage), "high" if multiple signals agree.
- If the quant signal's prices look broken (e.g. ADR currency mismatch producing P/E of 1.0), set your own prices from analyst target and explain why in the narrative.
- Never hedge with "investors should consider..." — take a position.`;

interface LLMOutput {
  narrative: string;
  summary: string | null;
  ai_buy_target: number | null;
  ai_fair_price: number | null;
  ai_trim_target: number | null;
  ai_confidence: string | null;
}

async function callLLM(prompt: string, symbol: string): Promise<LLMOutput> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      temperature: 0.3,
      system: SYSTEM_PROMPT.replace("${SYMBOL}", symbol),
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  // Messages API returns content as an array of blocks; text blocks have {type:"text", text}.
  const blocks = Array.isArray(json.content) ? json.content : [];
  const content: string = blocks
    .filter((b: unknown): b is { type: string; text: string } =>
      !!b && typeof b === "object" && (b as { type?: string }).type === "text",
    )
    .map((b: { text: string }) => b.text)
    .join("");
  if (!content) throw new Error("Empty LLM response");

  // Strip any accidental code fences or leading/trailing whitespace.
  const stripped = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    // Fallback — if the model returned prose, treat the whole thing as narrative.
    return {
      narrative: stripped,
      summary: null,
      ai_buy_target: null,
      ai_fair_price: null,
      ai_trim_target: null,
      ai_confidence: null,
    };
  }

  const confidence = str(parsed.confidence);
  return {
    narrative: str(parsed.narrative) ?? stripped,
    summary: str(parsed.summary),
    ai_buy_target: num(parsed.buy_target),
    ai_fair_price: num(parsed.fair_price),
    ai_trim_target: num(parsed.trim_target),
    ai_confidence: confidence && ["high", "medium", "low"].includes(confidence) ? confidence : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, force } = (await req.json()) as { symbol?: string; force?: boolean };
    if (!symbol || typeof symbol !== "string") {
      return new Response(JSON.stringify({ error: "symbol required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ctx = await loadContext(symbol);
    if (!ctx.signal) {
      return new Response(JSON.stringify({ error: `no signal row for ${symbol}` }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = buildPrompt(ctx);
    const inputsHash = await hash(prompt);

    if (!force) {
      const { data: existing } = await supabase
        .from("stock_narratives")
        .select("*")
        .eq("symbol", symbol)
        .maybeSingle();
      if (existing && (existing as { inputs_hash: string }).inputs_hash === inputsHash) {
        return new Response(JSON.stringify({ cached: true, row: existing }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const llm = await callLLM(prompt, symbol);

    const row = {
      symbol,
      narrative: llm.narrative,
      summary: llm.summary,
      ai_buy_target: llm.ai_buy_target,
      ai_fair_price: llm.ai_fair_price,
      ai_trim_target: llm.ai_trim_target,
      ai_confidence: llm.ai_confidence,
      model: MODEL,
      inputs_hash: inputsHash,
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error: upsertErr } = await supabase.from("stock_narratives").upsert(row, { onConflict: "symbol" });
    if (upsertErr) throw new Error(`upsert failed: ${upsertErr.message}`);

    return new Response(JSON.stringify({ cached: false, row }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
