-- Financial Modeling Prep (FMP) data cache.
--
-- Single-table JSONB cache for all FMP endpoint responses across every
-- symbol, market-level dataset, and reference lookup. Mirrors the directory
-- structure Melvin has been maintaining by hand (one JSON file per
-- endpoint per ticker).
--
-- Design choices:
--   - Single table, not per-endpoint-type. 57+ distinct endpoint names would
--     mean 57+ tables, 57+ schemas, 57+ things to break when FMP renames a
--     field. JSONB absorbs schema drift.
--   - `symbol` is the partitioning key. Market-level rows use sentinel
--     '_MARKET' (e.g. sector-pe, treasury-rates), reference rows use
--     '_REFERENCE' (available exchanges, sectors, industries).
--   - `exchange` is stored separately so we can query per-exchange (e.g.
--     "all NASDAQ tickers") without parsing the symbol string.
--   - Primary key on (symbol, endpoint) so re-syncs upsert cleanly. One row
--     per (symbol, endpoint) — always the latest snapshot, never a history.
--     If time-series snapshots of the cache itself are ever needed, a
--     history table can be added alongside.

CREATE TABLE IF NOT EXISTS fmp_cache (
  symbol      text        NOT NULL,  -- ticker, or '_MARKET' / '_REFERENCE'
  exchange    text,                   -- NASDAQ, NYSE, etc; null for _MARKET/_REFERENCE
  endpoint    text        NOT NULL,  -- e.g. 'profile', 'income-statement-annual'
  data        jsonb       NOT NULL,  -- FMP response payload (envelope unwrapped)
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_fmp_cache_exchange
  ON fmp_cache (exchange)
  WHERE exchange IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fmp_cache_endpoint
  ON fmp_cache (endpoint);

CREATE INDEX IF NOT EXISTS idx_fmp_cache_fetched_at
  ON fmp_cache (fetched_at DESC);

-- Convenience view: latest profile row per symbol, flattened for common
-- dashboard queries. Build additional typed views here as specific queries
-- become hot paths. JSONB extraction syntax: `data->>'field'` for text,
-- `(data->>'field')::numeric` for numbers.
CREATE OR REPLACE VIEW fmp_profiles AS
  SELECT
    symbol,
    exchange,
    data->>'companyName'                AS company_name,
    data->>'industry'                   AS industry,
    data->>'sector'                     AS sector,
    data->>'currency'                   AS currency,
    (data->>'marketCap')::numeric       AS market_cap,
    (data->>'price')::numeric           AS price,
    (data->>'beta')::numeric            AS beta,
    (data->>'lastDividend')::numeric    AS last_dividend,
    data->>'website'                    AS website,
    data->>'description'                AS description,
    data->>'ceo'                        AS ceo,
    fetched_at
  FROM fmp_cache
  WHERE endpoint = 'profile'
    AND symbol NOT IN ('_MARKET', '_REFERENCE');
