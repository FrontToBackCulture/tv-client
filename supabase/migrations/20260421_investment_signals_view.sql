-- Investment Signals — adaptive buy/hold/trim per symbol with a fallback ladder.
--
-- Every held symbol gets a method + targets + signal. The system picks the
-- best available tier and falls through on its own when that tier produces
-- numbers that fail a sanity clamp (targets must be within 0.2×..5× of
-- current price — otherwise we're extrapolating from poisoned data).
--
--   Tier 1 — PE:  needs TTM EPS > 0 (from ≥2 quarters, annualised) AND
--                 ≥3y of annual PE history AND targets within clamp.
--   Tier 2 — PS:  needs TTM revenue AND ≥3y of PS history AFTER outlier
--                 trimming (values outside median×[0.1, 10] are dropped —
--                 kills the "IPO backfill with today's market cap ÷ ancient
--                 revenue" garbage that plagues recent IPOs). Targets must
--                 also pass the sanity clamp.
--   Tier 3 — Range: percentile of daily close over last ~2y of trading.
--                   Always works if ≥30 bars exist. Pure mean-reversion
--                   heuristic — ignores fundamentals but never lies about
--                   what the stock has actually traded at recently.

DROP VIEW IF EXISTS v_investment_signals;

CREATE VIEW v_investment_signals AS
WITH ttm_eps AS (
  SELECT symbol,
    CASE WHEN COUNT(*) = 4 THEN SUM(eps)
         WHEN COUNT(*) >= 2 THEN SUM(eps) * 4.0 / COUNT(*) END AS eps_ttm
  FROM (
    SELECT symbol, eps,
           ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY fiscal_date DESC) AS rn
    FROM fmp_income_quarter WHERE eps IS NOT NULL
  ) q WHERE rn <= 4 GROUP BY symbol HAVING COUNT(*) >= 2
),
ttm_revenue AS (
  SELECT symbol,
    CASE WHEN COUNT(*) = 4 THEN SUM(revenue)
         WHEN COUNT(*) >= 2 THEN SUM(revenue) * 4.0 / COUNT(*) END AS revenue_ttm
  FROM (
    SELECT symbol, revenue,
           ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY fiscal_date DESC) AS rn
    FROM fmp_income_quarter WHERE revenue IS NOT NULL
  ) q WHERE rn <= 4 GROUP BY symbol HAVING COUNT(*) >= 2
),
latest_price AS (
  SELECT DISTINCT ON (symbol) symbol, close AS price, date AS price_date
  FROM fmp_prices_daily WHERE close IS NOT NULL
  ORDER BY symbol, date DESC
),
pe_history AS (
  SELECT symbol,
    percentile_cont(0.20) WITHIN GROUP (ORDER BY pe_ratio) AS pe_p20,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY pe_ratio) AS pe_p50,
    percentile_cont(0.80) WITHIN GROUP (ORDER BY pe_ratio) AS pe_p80,
    COUNT(*) AS pe_history_years
  FROM fmp_ratios_annual
  WHERE pe_ratio IS NOT NULL AND pe_ratio > 0
  GROUP BY symbol HAVING COUNT(*) >= 3
),
pb_history AS (
  SELECT symbol,
    percentile_cont(0.20) WITHIN GROUP (ORDER BY price_to_book) AS pb_p20,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY price_to_book) AS pb_p50,
    percentile_cont(0.80) WITHIN GROUP (ORDER BY price_to_book) AS pb_p80
  FROM fmp_ratios_annual
  WHERE price_to_book IS NOT NULL AND price_to_book > 0
  GROUP BY symbol
),
-- Outlier-trimmed PS: drop years whose PS is outside [median/10, median*10].
-- IPO filings report pre-IPO fiscal years whose "PS" is computed with the
-- current market cap and tiny legacy revenue, producing ratios of 500+.
-- Those poison the 80th percentile; trimming fixes it. Compute the median
-- in its own aggregate then join — Postgres forbids ordered-set aggregates
-- in window contexts.
ps_median AS (
  SELECT symbol,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY price_to_sales) AS ps_med
  FROM fmp_ratios_annual
  WHERE price_to_sales IS NOT NULL AND price_to_sales > 0
  GROUP BY symbol
),
ps_history AS (
  SELECT r.symbol,
    percentile_cont(0.20) WITHIN GROUP (ORDER BY r.price_to_sales) AS ps_p20,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY r.price_to_sales) AS ps_p50,
    percentile_cont(0.80) WITHIN GROUP (ORDER BY r.price_to_sales) AS ps_p80,
    COUNT(*) AS ps_history_years
  FROM fmp_ratios_annual r
  JOIN ps_median m USING (symbol)
  WHERE r.price_to_sales IS NOT NULL AND r.price_to_sales > 0
    AND r.price_to_sales BETWEEN m.ps_med * 0.1 AND m.ps_med * 10
  GROUP BY r.symbol HAVING COUNT(*) >= 3
),
-- Price range over last 2y (504 trading days) — reflects CURRENT trading
-- range, not a 5y window dominated by old levels. Threshold 30 days so even
-- freshly-IPO'd tickers get a recommendation.
price_range AS (
  SELECT symbol,
    percentile_cont(0.20) WITHIN GROUP (ORDER BY close) AS price_p20,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY close) AS price_p50,
    percentile_cont(0.80) WITHIN GROUP (ORDER BY close) AS price_p80,
    COUNT(*) AS price_history_days
  FROM (
    SELECT symbol, close,
      ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY date DESC) AS rn
    FROM fmp_prices_daily WHERE close IS NOT NULL
  ) p WHERE rn <= 504 GROUP BY symbol HAVING COUNT(*) >= 30
),
revenue_growth AS (
  SELECT symbol, revenue, prev_revenue,
    (revenue - prev_revenue) / NULLIF(prev_revenue, 0) AS revenue_yoy
  FROM (
    SELECT symbol, fiscal_year, revenue,
      LAG(revenue) OVER (PARTITION BY symbol ORDER BY fiscal_year) AS prev_revenue,
      ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY fiscal_year DESC) AS rn
    FROM fmp_income_annual
  ) x WHERE rn = 1
),
pe_current AS (
  -- Compute price / eps_ttm, then sanity-check against the historical median.
  -- If the result is >5× or <1/5× the median, the inputs are incompatible
  -- (classic ADR currency mismatch — TSMC reports EPS in TWD while the ADR
  -- price is USD, yielding P/E of ~1). Drop it so the next tier can take over.
  SELECT lp.symbol,
    CASE
      WHEN t.eps_ttm IS NULL OR t.eps_ttm <= 0 THEN NULL
      WHEN peh.pe_p50 IS NOT NULL
        AND (lp.price / t.eps_ttm) NOT BETWEEN peh.pe_p50 / 5.0 AND peh.pe_p50 * 5.0
        THEN NULL
      ELSE lp.price / t.eps_ttm
    END AS pe_now
  FROM latest_price lp
  LEFT JOIN ttm_eps    t   USING (symbol)
  LEFT JOIN pe_history peh USING (symbol)
),
ps_current AS (
  -- Same sanity check for PS — market_cap/revenue in mismatched currencies
  -- produces garbage P/S for ADRs too.
  SELECT lp.symbol,
    CASE
      WHEN p.market_cap IS NULL OR p.market_cap <= 0
        OR tr.revenue_ttm IS NULL OR tr.revenue_ttm <= 0 THEN NULL
      WHEN psh.ps_p50 IS NOT NULL
        AND (p.market_cap::numeric / tr.revenue_ttm) NOT BETWEEN psh.ps_p50 / 5.0 AND psh.ps_p50 * 5.0
        THEN NULL
      ELSE p.market_cap::numeric / tr.revenue_ttm
    END AS ps_now
  FROM latest_price lp
  LEFT JOIN fmp_profiles p  USING (symbol)
  LEFT JOIN ttm_revenue  tr USING (symbol)
  LEFT JOIN ps_history   psh USING (symbol)
),
-- Candidate targets per tier. Any that falls outside [0.2×, 5×] current
-- price is nulled out — downstream COALESCE then falls to the next tier.
candidates AS (
  SELECT
    lp.symbol, lp.price,
    CASE WHEN t.eps_ttm > 0 AND peh.pe_p20 * t.eps_ttm BETWEEN lp.price * 0.2 AND lp.price * 5
         THEN peh.pe_p20 * t.eps_ttm END AS pe_buy,
    CASE WHEN t.eps_ttm > 0 AND peh.pe_p50 * t.eps_ttm BETWEEN lp.price * 0.2 AND lp.price * 5
         THEN peh.pe_p50 * t.eps_ttm END AS pe_fair,
    CASE WHEN t.eps_ttm > 0 AND peh.pe_p80 * t.eps_ttm BETWEEN lp.price * 0.2 AND lp.price * 5
         THEN peh.pe_p80 * t.eps_ttm END AS pe_trim,
    CASE WHEN psc.ps_now > 0 AND psh.ps_p20 IS NOT NULL
          AND lp.price * psh.ps_p20 / psc.ps_now BETWEEN lp.price * 0.2 AND lp.price * 5
         THEN lp.price * psh.ps_p20 / psc.ps_now END AS ps_buy,
    CASE WHEN psc.ps_now > 0 AND psh.ps_p50 IS NOT NULL
          AND lp.price * psh.ps_p50 / psc.ps_now BETWEEN lp.price * 0.2 AND lp.price * 5
         THEN lp.price * psh.ps_p50 / psc.ps_now END AS ps_fair,
    CASE WHEN psc.ps_now > 0 AND psh.ps_p80 IS NOT NULL
          AND lp.price * psh.ps_p80 / psc.ps_now BETWEEN lp.price * 0.2 AND lp.price * 5
         THEN lp.price * psh.ps_p80 / psc.ps_now END AS ps_trim,
    pr.price_p20 AS range_buy,
    pr.price_p50 AS range_fair,
    pr.price_p80 AS range_trim
  FROM latest_price lp
  LEFT JOIN ttm_eps     t   USING (symbol)
  LEFT JOIN pe_history  peh USING (symbol)
  LEFT JOIN ps_current  psc USING (symbol)
  LEFT JOIN ps_history  psh USING (symbol)
  LEFT JOIN price_range pr  USING (symbol)
)
SELECT
  p.symbol, p.company_name, p.sector, p.industry, p.currency,
  lp.price AS current_price, lp.price_date AS price_as_of, p.market_cap,
  t.eps_ttm, pc.pe_now AS pe_current,
  peh.pe_p20, peh.pe_p50, peh.pe_p80, peh.pe_history_years,
  pb.pb_p20, pb.pb_p50, pb.pb_p80,
  psh.ps_p20, psh.ps_p50, psh.ps_p80, psh.ps_history_years,
  psc.ps_now AS ps_current,
  pr.price_p20, pr.price_p50, pr.price_p80, pr.price_history_days,
  -- Method = first tier whose buy + trim both survived the sanity clamp.
  -- Guarantees method and targets are consistent (no mix-and-match).
  CASE
    WHEN c.pe_buy IS NOT NULL AND c.pe_trim IS NOT NULL THEN 'pe'
    WHEN c.ps_buy IS NOT NULL AND c.ps_trim IS NOT NULL THEN 'ps'
    WHEN c.range_buy IS NOT NULL AND c.range_trim IS NOT NULL THEN 'price-range'
  END AS method,
  COALESCE(c.pe_buy,  c.ps_buy,  c.range_buy)  AS buy_target_price,
  COALESCE(c.pe_fair, c.ps_fair, c.range_fair) AS fair_price,
  COALESCE(c.pe_trim, c.ps_trim, c.range_trim) AS trim_target_price,
  rg.revenue, rg.prev_revenue, rg.revenue_yoy,
  CASE
    WHEN pc.pe_now IS NULL OR peh.pe_p20 IS NULL THEN 'unknown'
    WHEN pc.pe_now <= peh.pe_p20 THEN 'cheap'
    WHEN pc.pe_now >= peh.pe_p80 THEN 'expensive'
    ELSE 'fair'
  END AS pe_band,
  CASE
    WHEN rg.revenue_yoy IS NULL THEN 'unknown'
    WHEN rg.revenue_yoy > 0.0 THEN 'growing'
    ELSE 'shrinking'
  END AS revenue_trend,
  -- Signal = compare current price to the chosen tier's buy/trim target.
  -- For PE/PS we also require revenue growth on the buy side (valuation
  -- without growth is a value trap). Range ignores fundamentals.
  CASE
    WHEN c.pe_buy IS NOT NULL AND c.pe_trim IS NOT NULL THEN
      CASE
        WHEN lp.price <= c.pe_buy AND COALESCE(rg.revenue_yoy, 0) > 0 THEN 'buy'
        WHEN lp.price >= c.pe_trim THEN 'trim'
        ELSE 'hold'
      END
    WHEN c.ps_buy IS NOT NULL AND c.ps_trim IS NOT NULL THEN
      CASE
        WHEN lp.price <= c.ps_buy AND COALESCE(rg.revenue_yoy, 0) > 0 THEN 'buy'
        WHEN lp.price >= c.ps_trim THEN 'trim'
        ELSE 'hold'
      END
    WHEN c.range_buy IS NOT NULL AND c.range_trim IS NOT NULL THEN
      CASE
        WHEN lp.price <= c.range_buy THEN 'buy'
        WHEN lp.price >= c.range_trim THEN 'trim'
        ELSE 'hold'
      END
    ELSE 'hold'
  END AS signal
FROM fmp_profiles p
LEFT JOIN latest_price    lp   USING (symbol)
LEFT JOIN ttm_eps         t    USING (symbol)
LEFT JOIN pe_current      pc   USING (symbol)
LEFT JOIN ps_current      psc  USING (symbol)
LEFT JOIN pe_history      peh  USING (symbol)
LEFT JOIN pb_history      pb   USING (symbol)
LEFT JOIN ps_history      psh  USING (symbol)
LEFT JOIN price_range     pr   USING (symbol)
LEFT JOIN revenue_growth  rg   USING (symbol)
LEFT JOIN candidates      c    USING (symbol);
