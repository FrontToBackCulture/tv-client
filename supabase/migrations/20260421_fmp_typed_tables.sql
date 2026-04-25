-- Typed projections of fmp_cache for hot-path analytical queries.
--
-- Six endpoints are promoted from JSONB to real columns because they drive
-- the Investment module's Stock Detail / entry-exit analysis views:
--   - profile                 → fmp_profiles           (one row per symbol)
--   - historical-price        → fmp_prices_daily       (time-series)
--   - ratios-annual           → fmp_ratios_annual      (valuation trend)
--   - key-metrics-annual      → fmp_key_metrics_annual (valuation trend)
--   - income-statement-annual → fmp_income_annual      (fundamentals trend)
--   - income-statement-quarter → fmp_income_quarter    (fundamentals trend)
--
-- Population: sync.rs still upserts raw JSONB into fmp_cache, then calls
-- projections::project_* which extracts typed columns and upserts here.
-- JSONB remains authoritative; these tables are a queryable projection.
-- Quarterly ratios/key-metrics are Starter-plan restricted (see endpoints.rs);
-- annual is the best we have.

-- The prior migration (20260406_fmp_cache.sql) created fmp_profiles as a VIEW
-- on top of fmp_cache. That name is now owned by a real table with the same
-- shape plus extra columns. Drop the view first so CREATE TABLE can take over.
DROP VIEW IF EXISTS fmp_profiles;

CREATE TABLE IF NOT EXISTS fmp_profiles (
  symbol            text PRIMARY KEY,
  exchange          text,
  company_name      text,
  industry          text,
  sector            text,
  country           text,
  currency          text,
  ceo               text,
  website           text,
  description       text,
  market_cap        numeric,
  price             numeric,
  beta              numeric,
  last_dividend     numeric,
  image_url         text,
  ipo_date          date,
  fetched_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fmp_profiles_sector   ON fmp_profiles (sector);
CREATE INDEX IF NOT EXISTS idx_fmp_profiles_industry ON fmp_profiles (industry);

CREATE TABLE IF NOT EXISTS fmp_prices_daily (
  symbol         text NOT NULL,
  date           date NOT NULL,
  open           numeric,
  high           numeric,
  low            numeric,
  close          numeric,
  adj_close      numeric,
  volume         numeric,
  change         numeric,
  change_percent numeric,
  vwap           numeric,
  PRIMARY KEY (symbol, date)
);
CREATE INDEX IF NOT EXISTS idx_fmp_prices_daily_date ON fmp_prices_daily (date);

CREATE TABLE IF NOT EXISTS fmp_ratios_annual (
  symbol                   text NOT NULL,
  fiscal_year              int  NOT NULL,
  date                     date,
  period                   text,
  pe_ratio                 numeric,
  price_to_book            numeric,
  price_to_sales           numeric,
  ev_to_ebitda             numeric,
  ev_to_sales              numeric,
  gross_profit_margin      numeric,
  operating_profit_margin  numeric,
  net_profit_margin        numeric,
  return_on_equity         numeric,
  return_on_assets         numeric,
  current_ratio            numeric,
  debt_to_equity           numeric,
  debt_to_assets           numeric,
  dividend_yield           numeric,
  payout_ratio             numeric,
  fetched_at               timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, fiscal_year)
);

CREATE TABLE IF NOT EXISTS fmp_key_metrics_annual (
  symbol                         text NOT NULL,
  fiscal_year                    int  NOT NULL,
  date                           date,
  period                         text,
  revenue_per_share              numeric,
  net_income_per_share           numeric,
  operating_cash_flow_per_share  numeric,
  free_cash_flow_per_share       numeric,
  book_value_per_share           numeric,
  tangible_book_value_per_share  numeric,
  market_cap                     numeric,
  enterprise_value               numeric,
  pe_ratio                       numeric,
  pb_ratio                       numeric,
  ev_to_ebitda                   numeric,
  ev_to_fcf                      numeric,
  earnings_yield                 numeric,
  free_cash_flow_yield           numeric,
  debt_to_equity                 numeric,
  debt_to_ebitda                 numeric,
  current_ratio                  numeric,
  dividend_yield                 numeric,
  payout_ratio                   numeric,
  working_capital                numeric,
  roic                           numeric,
  roe                            numeric,
  fetched_at                     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, fiscal_year)
);

CREATE TABLE IF NOT EXISTS fmp_income_annual (
  symbol                          text NOT NULL,
  fiscal_year                     int  NOT NULL,
  date                            date,
  period                          text,
  reported_currency               text,
  revenue                         numeric,
  cost_of_revenue                 numeric,
  gross_profit                    numeric,
  operating_expenses              numeric,
  operating_income                numeric,
  ebitda                          numeric,
  net_income                      numeric,
  eps                             numeric,
  eps_diluted                     numeric,
  weighted_average_shares         numeric,
  weighted_average_shares_diluted numeric,
  fetched_at                      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, fiscal_year)
);

CREATE TABLE IF NOT EXISTS fmp_income_quarter (
  symbol                   text NOT NULL,
  fiscal_date              date NOT NULL,
  period                   text,
  reported_currency        text,
  revenue                  numeric,
  cost_of_revenue          numeric,
  gross_profit             numeric,
  operating_expenses       numeric,
  operating_income         numeric,
  ebitda                   numeric,
  net_income               numeric,
  eps                      numeric,
  eps_diluted              numeric,
  weighted_average_shares  numeric,
  fetched_at               timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, fiscal_date)
);

-- Supabase auto-enables RLS on new public-schema tables. The Melly personal
-- workspace is a solo-user DB with no multi-tenant access control — grant
-- the `authenticated` role full access so frontend queries (anon JWT) and
-- the Rust sync client (workspace JWT) both work. Matches the pattern used
-- by fmp_cache (see 20260406_fmp_cache.sql).
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'fmp_profiles',
    'fmp_prices_daily',
    'fmp_ratios_annual',
    'fmp_key_metrics_annual',
    'fmp_income_annual',
    'fmp_income_quarter'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = tbl
        AND policyname = tbl || '_all_authenticated'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        tbl || '_all_authenticated',
        tbl
      );
    END IF;
  END LOOP;
END $$;
