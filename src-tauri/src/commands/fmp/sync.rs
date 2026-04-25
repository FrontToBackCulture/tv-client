// FMP sync orchestration.
//
// Three sync surfaces, all upserting into `fmp_cache` on (symbol, endpoint):
//
//   - sync_ticker(symbol, exchange)  — fetch all ticker endpoints for one symbol
//   - sync_holdings()                 — iterate over current positions, sync each
//   - sync_market()                   — fetch all 14 market-level endpoints
//   - sync_reference()                — fetch all 5 reference endpoints
//
// Each call respects the global 250ms rate limit between FMP requests.
// Errors for individual endpoints are collected but don't abort the whole
// run — a restricted endpoint shouldn't prevent the rest of a ticker's
// fundamentals from syncing.

use crate::commands::error::{CmdResult, CommandError};
use crate::commands::settings::{self, KEY_FMP_API_KEY};
use crate::commands::supabase::get_client;
use serde_json::{json, Value};
use tauri::Emitter;

use super::client::{fetch, CALL_DELAY};
use super::endpoints::{MarketUrl, MARKET_ENDPOINTS, REFERENCE_ENDPOINTS, TICKER_ENDPOINTS};
use super::projections;
use super::FmpSyncSummary;

fn load_api_key() -> CmdResult<String> {
    let key = settings::settings_get_key(KEY_FMP_API_KEY.to_string())?
        .filter(|s| !s.is_empty())
        .ok_or_else(|| CommandError::Config("FMP API key not set".into()))?;
    Ok(key)
}

/// Upsert a single row into fmp_cache. Uses supabase client which, per the
/// multi-workspace refactor, respects WORKSPACE_OVERRIDE if the calling
/// task set it.
async fn upsert_row(
    symbol: &str,
    exchange: Option<&str>,
    endpoint: &str,
    data: &Value,
) -> CmdResult<()> {
    let client = get_client().await?;
    let row = json!({
        "symbol": symbol,
        "exchange": exchange,
        "endpoint": endpoint,
        "data": data,
        "fetched_at": chrono::Utc::now().to_rfc3339(),
    });
    let _: Value = client.upsert_on("fmp_cache", &row, Some("symbol,endpoint")).await?;
    Ok(())
}

/// Compute "latest trading day" as YYYY-MM-DD, used by dated snapshot
/// endpoints (sector-pe, industry-pe, etc.). Weekend-aware — returns Friday
/// when called on Saturday or Sunday, otherwise yesterday. Holidays are
/// ignored (we'd hit the API and get an empty array, which is fine).
fn latest_trading_day() -> String {
    use chrono::{Datelike, Duration, Weekday};
    let mut date = chrono::Utc::now().date_naive() - Duration::days(1);
    loop {
        match date.weekday() {
            Weekday::Sat => date -= Duration::days(1),
            Weekday::Sun => date -= Duration::days(2),
            _ => break,
        }
    }
    date.format("%Y-%m-%d").to_string()
}

// ---------------------------------------------------------------------------
// Ticker sync
// ---------------------------------------------------------------------------

/// Sync every non-restricted ticker endpoint for a single symbol. Returns
/// (successful_count, errors).
pub async fn sync_ticker(
    app_handle: &tauri::AppHandle,
    symbol: &str,
    exchange: Option<&str>,
) -> (usize, Vec<String>) {
    let api_key = match load_api_key() {
        Ok(k) => k,
        Err(e) => return (0, vec![format!("{}", e)]),
    };

    let mut ok_count = 0usize;
    let mut errors = Vec::new();

    for ep in TICKER_ENDPOINTS {
        if ep.restricted {
            continue;
        }
        let path = ep.url_template.replace("{symbol}", symbol);

        let _ = app_handle.emit(
            "fmp:sync-progress",
            json!({ "symbol": symbol, "endpoint": ep.name, "phase": "fetching" }),
        );

        match fetch(&api_key, &path).await {
            Ok(data) => {
                if let Err(e) = upsert_row(symbol, exchange, ep.name, &data).await {
                    errors.push(format!("{}: upsert failed: {}", ep.name, e));
                } else {
                    ok_count += 1;
                    // Projection failures don't fail the sync — JSONB is still
                    // authoritative in fmp_cache. Surface as a warning.
                    if let Err(e) = projections::project(symbol, exchange, ep.name, &data).await {
                        errors.push(format!("{}: projection failed: {}", ep.name, e));
                    }
                }
            }
            Err(e) => {
                errors.push(format!("{}: {}", ep.name, e));
            }
        }

        tokio::time::sleep(CALL_DELAY).await;
    }

    (ok_count, errors)
}

/// Sync fundamentals for every symbol present in ibkr_positions (latest
/// snapshot). Positions are fetched ONCE at the start; subsequent ticker
/// syncs run sequentially with rate limiting between calls.
pub async fn sync_holdings(app_handle: &tauri::AppHandle) -> CmdResult<FmpSyncSummary> {
    let client = get_client().await?;

    // Find the latest snapshot date, then pull distinct (symbol, exchange)
    // pairs. Exchange is derived from IBKR's assetCategory/exchange — we
    // don't have it in the ibkr_positions schema today, so pass None for
    // now. Can be enhanced later by joining with a symbol→exchange map.
    let latest: Vec<Value> = client
        .select(
            "ibkr_positions",
            "select=snapshot_date&order=snapshot_date.desc&limit=1",
        )
        .await?;
    if latest.is_empty() {
        return Ok(FmpSyncSummary {
            endpoints_written: 0,
            errors: vec!["No positions found — sync IBKR first".into()],
            finished_at: chrono::Utc::now().to_rfc3339(),
        });
    }
    let snapshot_date = latest[0]["snapshot_date"].as_str().unwrap_or("").to_string();

    let positions: Vec<Value> = client
        .select(
            "ibkr_positions",
            &format!(
                "select=symbol,asset_class&snapshot_date=eq.{}&asset_class=eq.STK",
                snapshot_date
            ),
        )
        .await?;

    // Dedupe symbols — the same ticker can appear across multiple accounts
    let mut seen = std::collections::BTreeSet::new();
    let symbols: Vec<String> = positions
        .iter()
        .filter_map(|p| p["symbol"].as_str().map(str::to_string))
        .filter(|s| seen.insert(s.clone()))
        .collect();

    eprintln!("[fmp:sync] Syncing {} unique symbols from holdings", symbols.len());

    let mut total_ok = 0usize;
    let mut all_errors = Vec::new();

    for symbol in &symbols {
        let (ok, errs) = sync_ticker(app_handle, symbol, None).await;
        total_ok += ok;
        for e in errs {
            all_errors.push(format!("{}: {}", symbol, e));
        }
    }

    let summary = FmpSyncSummary {
        endpoints_written: total_ok,
        errors: all_errors,
        finished_at: chrono::Utc::now().to_rfc3339(),
    };
    let _ = app_handle.emit("fmp:sync-complete", &summary);
    Ok(summary)
}

// ---------------------------------------------------------------------------
// Market sync
// ---------------------------------------------------------------------------

pub async fn sync_market(app_handle: &tauri::AppHandle) -> CmdResult<FmpSyncSummary> {
    let api_key = load_api_key()?;
    let date = latest_trading_day();

    let mut ok_count = 0usize;
    let mut errors = Vec::new();

    for ep in MARKET_ENDPOINTS {
        let _ = app_handle.emit(
            "fmp:sync-progress",
            json!({ "symbol": "_MARKET", "endpoint": ep.name, "phase": "fetching" }),
        );

        let result = match ep.url {
            MarketUrl::Static(path) => fetch(&api_key, path).await,
            MarketUrl::Dated(template) => {
                let path = template.replace("{date}", &date);
                fetch(&api_key, &path).await
            }
            MarketUrl::EconomicIndicators(names) => {
                // Merge multiple indicator pulls into one JSONB row keyed
                // by indicator name, matching the cached file shape.
                // `names` is `&'static [&'static str]` from the enum variant;
                // destructure with `&name` to bind `name: &'static str`
                // directly (avoids ambiguous `.to_string()` on `&&str`).
                let mut merged = serde_json::Map::new();
                let mut any_error = None;
                for &name in names {
                    let path = format!("/economic-indicators?name={}", name);
                    match fetch(&api_key, &path).await {
                        Ok(v) => {
                            merged.insert(name.to_string(), v);
                        }
                        Err(e) => {
                            any_error = Some(format!("{}: {}", name, e));
                            break;
                        }
                    }
                    tokio::time::sleep(CALL_DELAY).await;
                }
                if let Some(e) = any_error {
                    Err(CommandError::Internal(e))
                } else {
                    Ok(Value::Object(merged))
                }
            }
        };

        match result {
            Ok(data) => {
                if let Err(e) = upsert_row("_MARKET", None, ep.name, &data).await {
                    errors.push(format!("{}: upsert failed: {}", ep.name, e));
                } else {
                    ok_count += 1;
                }
            }
            Err(e) => errors.push(format!("{}: {}", ep.name, e)),
        }

        tokio::time::sleep(CALL_DELAY).await;
    }

    let summary = FmpSyncSummary {
        endpoints_written: ok_count,
        errors,
        finished_at: chrono::Utc::now().to_rfc3339(),
    };
    let _ = app_handle.emit("fmp:sync-complete", &summary);
    Ok(summary)
}

// ---------------------------------------------------------------------------
// Reference sync
// ---------------------------------------------------------------------------

pub async fn sync_reference(app_handle: &tauri::AppHandle) -> CmdResult<FmpSyncSummary> {
    let api_key = load_api_key()?;

    let mut ok_count = 0usize;
    let mut errors = Vec::new();

    for ep in REFERENCE_ENDPOINTS {
        let _ = app_handle.emit(
            "fmp:sync-progress",
            json!({ "symbol": "_REFERENCE", "endpoint": ep.name, "phase": "fetching" }),
        );

        match fetch(&api_key, ep.url).await {
            Ok(data) => {
                if let Err(e) = upsert_row("_REFERENCE", None, ep.name, &data).await {
                    errors.push(format!("{}: upsert failed: {}", ep.name, e));
                } else {
                    ok_count += 1;
                }
            }
            Err(e) => errors.push(format!("{}: {}", ep.name, e)),
        }

        tokio::time::sleep(CALL_DELAY).await;
    }

    let summary = FmpSyncSummary {
        endpoints_written: ok_count,
        errors,
        finished_at: chrono::Utc::now().to_rfc3339(),
    };
    let _ = app_handle.emit("fmp:sync-complete", &summary);
    Ok(summary)
}
