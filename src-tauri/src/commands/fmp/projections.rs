// Typed projections of FMP cache rows.
//
// After sync.rs upserts a raw JSONB row into fmp_cache, it calls project()
// which dispatches to a per-endpoint projector. Each projector extracts a
// stable subset of fields from the JSONB array and upserts typed rows into
// the matching fmp_* table. JSONB remains authoritative for everything else.
//
// FMP returns arrays for every endpoint here. Array-of-one for `profile`,
// array-of-many for time-series (historical-price) and year/quarter entries
// (ratios, key-metrics, income statement). We upsert the whole batch in one
// request per endpoint per symbol.

use crate::commands::error::CmdResult;
use crate::commands::supabase::get_client;
use serde_json::{json, Value};

/// Dispatch to the matching projector for a known endpoint. Unknown
/// endpoints are ignored — they stay JSONB-only in fmp_cache.
pub async fn project(symbol: &str, exchange: Option<&str>, endpoint: &str, data: &Value) -> CmdResult<()> {
    match endpoint {
        "profile"                    => project_profile(symbol, exchange, data).await,
        "historical-price"           => project_prices_daily(symbol, data).await,
        "ratios-annual"              => project_ratios_annual(symbol, data).await,
        "key-metrics-annual"         => project_key_metrics_annual(symbol, data).await,
        "income-statement-annual"    => project_income_annual(symbol, data).await,
        "income-statement-quarter"   => project_income_quarter(symbol, data).await,
        _ => Ok(()),
    }
}

// ---------------------------------------------------------------------------
// Field extraction helpers — FMP returns numeric fields sometimes as numbers,
// sometimes as strings. Treat both uniformly. Missing/null stays None.
// ---------------------------------------------------------------------------

fn s(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(|x| x.as_str()).map(str::to_string)
}

fn n(v: &Value, key: &str) -> Option<f64> {
    match v.get(key) {
        Some(Value::Number(num)) => num.as_f64(),
        Some(Value::String(s)) => s.parse::<f64>().ok(),
        _ => None,
    }
}

fn i(v: &Value, key: &str) -> Option<i64> {
    match v.get(key) {
        Some(Value::Number(num)) => num.as_i64(),
        Some(Value::String(s)) => s.parse::<i64>().ok(),
        _ => None,
    }
}

/// Parse fiscal year from a "calendarYear" or "date" field. Tries
/// calendarYear first, falls back to year from date string.
fn fiscal_year(v: &Value) -> Option<i64> {
    if let Some(y) = i(v, "calendarYear") {
        return Some(y);
    }
    let date = s(v, "date")?;
    date.get(0..4).and_then(|yr| yr.parse::<i64>().ok())
}

// ---------------------------------------------------------------------------
// Projectors
// ---------------------------------------------------------------------------

async fn project_profile(symbol: &str, exchange: Option<&str>, data: &Value) -> CmdResult<()> {
    let Some(entry) = data.as_array().and_then(|a| a.first()) else { return Ok(()); };

    let row = json!({
        "symbol": symbol,
        "exchange": exchange.or_else(|| entry.get("exchangeShortName").and_then(Value::as_str)),
        "company_name":  s(entry, "companyName"),
        "industry":      s(entry, "industry"),
        "sector":        s(entry, "sector"),
        "country":       s(entry, "country"),
        "currency":      s(entry, "currency"),
        "ceo":           s(entry, "ceo"),
        "website":       s(entry, "website"),
        "description":   s(entry, "description"),
        "market_cap":    n(entry, "marketCap"),
        "price":         n(entry, "price"),
        "beta":          n(entry, "beta"),
        "last_dividend": n(entry, "lastDividend"),
        "image_url":     s(entry, "image"),
        "ipo_date":      s(entry, "ipoDate"),
        "fetched_at":    chrono::Utc::now().to_rfc3339(),
    });

    let client = get_client().await?;
    let _: Value = client.upsert_on("fmp_profiles", &row, Some("symbol")).await?;
    Ok(())
}

async fn project_prices_daily(symbol: &str, data: &Value) -> CmdResult<()> {
    // FMP returns either a plain array of bars or `{ symbol, historical: [] }`.
    let bars: Vec<&Value> = if let Some(arr) = data.as_array() {
        arr.iter().collect()
    } else if let Some(arr) = data.get("historical").and_then(Value::as_array) {
        arr.iter().collect()
    } else {
        return Ok(());
    };

    if bars.is_empty() {
        return Ok(());
    }

    let rows: Vec<Value> = bars
        .iter()
        .filter_map(|bar| {
            let date = s(bar, "date")?;
            // Normalise "2024-01-02 00:00:00" → "2024-01-02"
            let date = date.split_whitespace().next().unwrap_or(&date).to_string();
            Some(json!({
                "symbol": symbol,
                "date": date,
                "open":            n(bar, "open"),
                "high":            n(bar, "high"),
                "low":             n(bar, "low"),
                "close":           n(bar, "close"),
                "adj_close":       n(bar, "adjClose"),
                "volume":          n(bar, "volume"),
                "change":          n(bar, "change"),
                "change_percent":  n(bar, "changePercent").or_else(|| n(bar, "changeOverTime")),
                "vwap":            n(bar, "vwap"),
            }))
        })
        .collect();

    if rows.is_empty() {
        return Ok(());
    }

    let client = get_client().await?;
    let _: Value = client
        .upsert_on("fmp_prices_daily", &Value::Array(rows), Some("symbol,date"))
        .await?;
    Ok(())
}

async fn project_ratios_annual(symbol: &str, data: &Value) -> CmdResult<()> {
    let Some(arr) = data.as_array() else { return Ok(()); };
    let now = chrono::Utc::now().to_rfc3339();
    let rows: Vec<Value> = arr
        .iter()
        .filter_map(|e| {
            let fy = fiscal_year(e)?;
            Some(json!({
                "symbol": symbol,
                "fiscal_year":             fy,
                "date":                    s(e, "date"),
                "period":                  s(e, "period"),
                // FMP stable uses `priceToEarningsRatio`. Older/alt APIs use
                // `priceEarningsRatio` / `peRatio` — keep those as fallbacks.
                "pe_ratio":                n(e, "priceToEarningsRatio").or_else(|| n(e, "priceEarningsRatio")).or_else(|| n(e, "peRatio")),
                "price_to_book":           n(e, "priceToBookRatio").or_else(|| n(e, "pbRatio")),
                "price_to_sales":          n(e, "priceToSalesRatio"),
                "ev_to_ebitda":            n(e, "enterpriseValueOverEBITDA").or_else(|| n(e, "evToEbitda")),
                "ev_to_sales":             n(e, "enterpriseValueMultiple").or_else(|| n(e, "evToSales")),
                "gross_profit_margin":     n(e, "grossProfitMargin"),
                "operating_profit_margin": n(e, "operatingProfitMargin"),
                "net_profit_margin":       n(e, "netProfitMargin"),
                "return_on_equity":        n(e, "returnOnEquity"),
                "return_on_assets":        n(e, "returnOnAssets"),
                "current_ratio":           n(e, "currentRatio"),
                "debt_to_equity":          n(e, "debtEquityRatio").or_else(|| n(e, "debtToEquity")),
                "debt_to_assets":          n(e, "debtRatio").or_else(|| n(e, "debtToAssets")),
                "dividend_yield":          n(e, "dividendYield"),
                "payout_ratio":            n(e, "payoutRatio"),
                "fetched_at":              now,
            }))
        })
        .collect();

    if rows.is_empty() {
        return Ok(());
    }
    let client = get_client().await?;
    let _: Value = client
        .upsert_on("fmp_ratios_annual", &Value::Array(rows), Some("symbol,fiscal_year"))
        .await?;
    Ok(())
}

async fn project_key_metrics_annual(symbol: &str, data: &Value) -> CmdResult<()> {
    let Some(arr) = data.as_array() else { return Ok(()); };
    let now = chrono::Utc::now().to_rfc3339();
    let rows: Vec<Value> = arr
        .iter()
        .filter_map(|e| {
            let fy = fiscal_year(e)?;
            Some(json!({
                "symbol": symbol,
                "fiscal_year":                   fy,
                "date":                          s(e, "date"),
                "period":                        s(e, "period"),
                "revenue_per_share":             n(e, "revenuePerShare"),
                "net_income_per_share":          n(e, "netIncomePerShare"),
                "operating_cash_flow_per_share": n(e, "operatingCashFlowPerShare"),
                "free_cash_flow_per_share":      n(e, "freeCashFlowPerShare"),
                "book_value_per_share":          n(e, "bookValuePerShare"),
                "tangible_book_value_per_share": n(e, "tangibleBookValuePerShare"),
                "market_cap":                    n(e, "marketCap"),
                "enterprise_value":              n(e, "enterpriseValue"),
                "pe_ratio":                      n(e, "peRatio"),
                "pb_ratio":                      n(e, "pbRatio"),
                "ev_to_ebitda":                  n(e, "enterpriseValueOverEBITDA").or_else(|| n(e, "evToEbitda")),
                "ev_to_fcf":                     n(e, "evToOperatingCashFlow").or_else(|| n(e, "evToFreeCashFlow")),
                "earnings_yield":                n(e, "earningsYield"),
                "free_cash_flow_yield":          n(e, "freeCashFlowYield"),
                "debt_to_equity":                n(e, "debtToEquity"),
                "debt_to_ebitda":                n(e, "netDebtToEBITDA").or_else(|| n(e, "debtToEbitda")),
                "current_ratio":                 n(e, "currentRatio"),
                "dividend_yield":                n(e, "dividendYield"),
                "payout_ratio":                  n(e, "payoutRatio"),
                "working_capital":               n(e, "workingCapital"),
                "roic":                          n(e, "roic"),
                "roe":                           n(e, "roe"),
                "fetched_at":                    now,
            }))
        })
        .collect();

    if rows.is_empty() {
        return Ok(());
    }
    let client = get_client().await?;
    let _: Value = client
        .upsert_on("fmp_key_metrics_annual", &Value::Array(rows), Some("symbol,fiscal_year"))
        .await?;
    Ok(())
}

async fn project_income_annual(symbol: &str, data: &Value) -> CmdResult<()> {
    let Some(arr) = data.as_array() else { return Ok(()); };
    let now = chrono::Utc::now().to_rfc3339();
    let rows: Vec<Value> = arr
        .iter()
        .filter_map(|e| {
            let fy = fiscal_year(e)?;
            Some(json!({
                "symbol": symbol,
                "fiscal_year":                     fy,
                "date":                            s(e, "date"),
                "period":                          s(e, "period"),
                "reported_currency":               s(e, "reportedCurrency"),
                "revenue":                         n(e, "revenue"),
                "cost_of_revenue":                 n(e, "costOfRevenue"),
                "gross_profit":                    n(e, "grossProfit"),
                "operating_expenses":              n(e, "operatingExpenses"),
                "operating_income":                n(e, "operatingIncome"),
                "ebitda":                          n(e, "ebitda"),
                "net_income":                      n(e, "netIncome"),
                "eps":                             n(e, "eps"),
                "eps_diluted":                     n(e, "epsdiluted").or_else(|| n(e, "epsDiluted")),
                "weighted_average_shares":         n(e, "weightedAverageShsOut").or_else(|| n(e, "weightedAverageShares")),
                "weighted_average_shares_diluted": n(e, "weightedAverageShsOutDil").or_else(|| n(e, "weightedAverageSharesDiluted")),
                "fetched_at":                      now,
            }))
        })
        .collect();

    if rows.is_empty() {
        return Ok(());
    }
    let client = get_client().await?;
    let _: Value = client
        .upsert_on("fmp_income_annual", &Value::Array(rows), Some("symbol,fiscal_year"))
        .await?;
    Ok(())
}

async fn project_income_quarter(symbol: &str, data: &Value) -> CmdResult<()> {
    let Some(arr) = data.as_array() else { return Ok(()); };
    let now = chrono::Utc::now().to_rfc3339();
    let rows: Vec<Value> = arr
        .iter()
        .filter_map(|e| {
            let date = s(e, "date")?;
            Some(json!({
                "symbol": symbol,
                "fiscal_date":            date,
                "period":                 s(e, "period"),
                "reported_currency":      s(e, "reportedCurrency"),
                "revenue":                n(e, "revenue"),
                "cost_of_revenue":        n(e, "costOfRevenue"),
                "gross_profit":           n(e, "grossProfit"),
                "operating_expenses":     n(e, "operatingExpenses"),
                "operating_income":       n(e, "operatingIncome"),
                "ebitda":                 n(e, "ebitda"),
                "net_income":              n(e, "netIncome"),
                "eps":                    n(e, "eps"),
                "eps_diluted":            n(e, "epsdiluted").or_else(|| n(e, "epsDiluted")),
                "weighted_average_shares": n(e, "weightedAverageShsOut").or_else(|| n(e, "weightedAverageShares")),
                "fetched_at":              now,
            }))
        })
        .collect();

    if rows.is_empty() {
        return Ok(());
    }
    let client = get_client().await?;
    let _: Value = client
        .upsert_on("fmp_income_quarter", &Value::Array(rows), Some("symbol,fiscal_date"))
        .await?;
    Ok(())
}
