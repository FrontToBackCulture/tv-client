// Financial Modeling Prep (FMP) endpoint registry.
//
// Every endpoint reverse-engineered from Melvin's cached Research folder +
// live-tested against the `/stable/` API on a Starter plan subscription.
// URL templates use `{symbol}` and `{date}` placeholders substituted at
// request time. Endpoints marked `restricted = true` returned explicit
// "Restricted Endpoint" or "Premium Query Parameter" errors on Starter and
// are skipped by the sync logic.
//
// Three endpoint classes:
//   - TickerEndpoint: per-symbol, needs {symbol} substitution
//   - MarketEndpoint: global (no symbol), some need {date} for "latest
//     trading day" snapshots
//   - ReferenceEndpoint: global lookup data (exchanges, sectors, etc.),
//     rarely changes — sync on-demand, not every sync pass
//
// Adding a new endpoint: append to the appropriate const array. No other
// file changes needed — sync.rs iterates these arrays blindly.

#[derive(Debug, Clone, Copy)]
pub struct TickerEndpoint {
    /// Cache key (used as `fmp_cache.endpoint` column value). Matches the
    /// filename Melvin's Research folder used.
    pub name: &'static str,
    /// URL template relative to the FMP stable base, with `{symbol}`
    /// placeholder. E.g. "/profile?symbol={symbol}".
    pub url_template: &'static str,
    /// True if this endpoint is unavailable on Starter plan. Skipped by sync.
    pub restricted: bool,
}

#[derive(Debug, Clone, Copy)]
pub enum MarketUrl {
    /// Static URL, no params.
    Static(&'static str),
    /// URL takes a `{date}` placeholder filled with the latest trading
    /// day (YYYY-MM-DD). Used by sector/industry snapshots.
    Dated(&'static str),
    /// Special-case: multi-indicator endpoint. Fetches each indicator in
    /// `indicators` separately and merges into a single JSONB map so the
    /// cache row matches the cached file shape `{IndicatorName: [...]}`.
    EconomicIndicators(&'static [&'static str]),
}

#[derive(Debug, Clone, Copy)]
pub struct MarketEndpoint {
    pub name: &'static str,
    pub url: MarketUrl,
}

#[derive(Debug, Clone, Copy)]
pub struct ReferenceEndpoint {
    pub name: &'static str,
    pub url: &'static str,
}

// ---------------------------------------------------------------------------
// Ticker endpoints (40 total; 4 restricted on Starter plan)
// ---------------------------------------------------------------------------

pub const TICKER_ENDPOINTS: &[TickerEndpoint] = &[
    // Profile + quote
    TickerEndpoint { name: "profile",                   url_template: "/profile?symbol={symbol}",                          restricted: false },
    TickerEndpoint { name: "quote",                     url_template: "/quote?symbol={symbol}",                            restricted: false },

    // Income statement (annual, quarter, ttm, growth)
    TickerEndpoint { name: "income-statement-annual",   url_template: "/income-statement?symbol={symbol}&period=annual",   restricted: false },
    TickerEndpoint { name: "income-statement-quarter",  url_template: "/income-statement?symbol={symbol}&period=quarter",  restricted: false },
    TickerEndpoint { name: "income-statement-ttm",      url_template: "/income-statement?symbol={symbol}&period=ttm",      restricted: false },
    TickerEndpoint { name: "income-statement-growth",   url_template: "/income-statement-growth?symbol={symbol}",          restricted: false },

    // Balance sheet (annual, quarter, ttm-RESTRICTED, growth)
    TickerEndpoint { name: "balance-sheet-annual",      url_template: "/balance-sheet-statement?symbol={symbol}&period=annual",  restricted: false },
    TickerEndpoint { name: "balance-sheet-quarter",     url_template: "/balance-sheet-statement?symbol={symbol}&period=quarter", restricted: false },
    TickerEndpoint { name: "balance-sheet-ttm",         url_template: "/balance-sheet-statement-ttm?symbol={symbol}",      restricted: true },
    TickerEndpoint { name: "balance-sheet-growth",      url_template: "/balance-sheet-statement-growth?symbol={symbol}",   restricted: false },

    // Cash flow (annual, quarter, ttm-RESTRICTED, growth)
    TickerEndpoint { name: "cash-flow-annual",          url_template: "/cash-flow-statement?symbol={symbol}&period=annual",    restricted: false },
    TickerEndpoint { name: "cash-flow-quarter",         url_template: "/cash-flow-statement?symbol={symbol}&period=quarter",   restricted: false },
    TickerEndpoint { name: "cash-flow-ttm",             url_template: "/cash-flow-statement-ttm?symbol={symbol}",          restricted: true },
    TickerEndpoint { name: "cash-flow-growth",          url_template: "/cash-flow-statement-growth?symbol={symbol}",       restricted: false },

    // Key metrics + ratios (quarter restricted on Starter)
    TickerEndpoint { name: "key-metrics-annual",        url_template: "/key-metrics?symbol={symbol}&period=annual",         restricted: false },
    TickerEndpoint { name: "key-metrics-quarter",       url_template: "/key-metrics?symbol={symbol}&period=quarter",        restricted: true },
    TickerEndpoint { name: "key-metrics-ttm",           url_template: "/key-metrics-ttm?symbol={symbol}",                   restricted: false },
    TickerEndpoint { name: "ratios-annual",             url_template: "/ratios?symbol={symbol}&period=annual",              restricted: false },
    TickerEndpoint { name: "ratios-quarter",            url_template: "/ratios?symbol={symbol}&period=quarter",             restricted: true },
    TickerEndpoint { name: "ratios-ttm",                url_template: "/ratios-ttm?symbol={symbol}",                        restricted: false },

    // Growth + scores + owner earnings + enterprise values
    TickerEndpoint { name: "financial-growth",          url_template: "/financial-growth?symbol={symbol}",                  restricted: false },
    TickerEndpoint { name: "financial-scores",          url_template: "/financial-scores?symbol={symbol}",                  restricted: false },
    TickerEndpoint { name: "owner-earnings",            url_template: "/owner-earnings?symbol={symbol}",                    restricted: false },
    TickerEndpoint { name: "enterprise-values",         url_template: "/enterprise-values?symbol={symbol}",                 restricted: false },

    // Analyst estimates + price targets + ratings + grades
    TickerEndpoint { name: "analyst-estimates-annual",  url_template: "/analyst-estimates?symbol={symbol}&period=annual",   restricted: false },
    TickerEndpoint { name: "price-target-consensus",    url_template: "/price-target-consensus?symbol={symbol}",            restricted: false },
    TickerEndpoint { name: "price-target-summary",      url_template: "/price-target-summary?symbol={symbol}",              restricted: false },
    TickerEndpoint { name: "ratings-snapshot",          url_template: "/ratings-snapshot?symbol={symbol}",                  restricted: false },
    TickerEndpoint { name: "ratings-historical",        url_template: "/ratings-historical?symbol={symbol}",                restricted: false },
    TickerEndpoint { name: "stock-grades",              url_template: "/grades?symbol={symbol}",                            restricted: false },
    TickerEndpoint { name: "stock-grades-historical",   url_template: "/grades-historical?symbol={symbol}",                 restricted: false },
    TickerEndpoint { name: "stock-grades-summary",      url_template: "/grades-consensus?symbol={symbol}",                  restricted: false },

    // Ownership + insider/government trading
    TickerEndpoint { name: "acquisition-ownership",     url_template: "/acquisition-of-beneficial-ownership?symbol={symbol}", restricted: false },
    TickerEndpoint { name: "house-trades",              url_template: "/house-trades?symbol={symbol}",                      restricted: false },
    TickerEndpoint { name: "senate-trades",             url_template: "/senate-trades?symbol={symbol}",                     restricted: false },
    TickerEndpoint { name: "insider-trades",            url_template: "/insider-trading/search?symbol={symbol}",            restricted: false },
    TickerEndpoint { name: "insider-trade-statistics",  url_template: "/insider-trading/statistics?symbol={symbol}",        restricted: false },

    // News + historical price + price change
    TickerEndpoint { name: "stock-news",                url_template: "/news/stock?symbols={symbol}",                       restricted: false },
    TickerEndpoint { name: "historical-price",          url_template: "/historical-price-eod/full?symbol={symbol}",         restricted: false },
    TickerEndpoint { name: "price-change",              url_template: "/stock-price-change?symbol={symbol}",                restricted: false },
];

// ---------------------------------------------------------------------------
// Market endpoints (14 total, all working on Starter)
// ---------------------------------------------------------------------------

/// Indicators fetched by the `economic-indicators` multi-fetch endpoint.
/// These are the exact names FMP's /stable/economic-indicators endpoint
/// accepts — verified against live API. Note: the legacy disk cache used
/// `unemployment` and `interestRate` as convenience aliases, but FMP rejects
/// those with "Invalid name". The canonical names are `unemploymentRate`
/// and `federalFunds` — the resulting JSONB row uses those as keys.
pub const ECONOMIC_INDICATORS: &[&str] = &[
    "GDP",
    "realGDP",
    "CPI",
    "unemploymentRate",
    "federalFunds",
];

pub const MARKET_ENDPOINTS: &[MarketEndpoint] = &[
    MarketEndpoint { name: "economic-calendar",    url: MarketUrl::Static("/economic-calendar") },
    MarketEndpoint { name: "economic-indicators",  url: MarketUrl::EconomicIndicators(ECONOMIC_INDICATORS) },
    MarketEndpoint { name: "fmp-articles",         url: MarketUrl::Static("/fmp-articles") },
    MarketEndpoint { name: "general-news",         url: MarketUrl::Static("/news/general-latest") },
    MarketEndpoint { name: "industry-pe",          url: MarketUrl::Dated("/industry-pe-snapshot?date={date}") },
    MarketEndpoint { name: "industry-performance", url: MarketUrl::Dated("/industry-performance-snapshot?date={date}") },
    MarketEndpoint { name: "market-risk-premium",  url: MarketUrl::Static("/market-risk-premium") },
    MarketEndpoint { name: "sector-pe",            url: MarketUrl::Dated("/sector-pe-snapshot?date={date}") },
    MarketEndpoint { name: "sector-performance",   url: MarketUrl::Dated("/sector-performance-snapshot?date={date}") },
    MarketEndpoint { name: "stock-gainers",        url: MarketUrl::Static("/biggest-gainers") },
    MarketEndpoint { name: "stock-losers",         url: MarketUrl::Static("/biggest-losers") },
    MarketEndpoint { name: "stock-news-latest",    url: MarketUrl::Static("/news/stock-latest") },
    MarketEndpoint { name: "top-traded",           url: MarketUrl::Static("/most-actives") },
    MarketEndpoint { name: "treasury-rates",       url: MarketUrl::Static("/treasury-rates") },
];

// ---------------------------------------------------------------------------
// Reference endpoints (5 total, all working, change infrequently)
// ---------------------------------------------------------------------------

pub const REFERENCE_ENDPOINTS: &[ReferenceEndpoint] = &[
    ReferenceEndpoint { name: "available-countries",  url: "/available-countries"  },
    ReferenceEndpoint { name: "available-exchanges",  url: "/available-exchanges"  },
    ReferenceEndpoint { name: "available-industries", url: "/available-industries" },
    ReferenceEndpoint { name: "available-sectors",    url: "/available-sectors"    },
    ReferenceEndpoint { name: "stock-list",           url: "/stock-list"           },
];
