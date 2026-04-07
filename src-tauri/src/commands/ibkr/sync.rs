// IBKR Flex sync orchestration.
//
// Reads credentials from the settings store, calls the Flex Web Service for
// each of the three configured queries (positions, trades, cash), parses the
// XML, maps records to table rows, and upserts them into the current
// workspace's Supabase project via the workspace-scoped Supabase client.
//
// Errors per query are collected and returned in the summary rather than
// aborting the whole run — a failure fetching trades shouldn't block positions
// from being written.

use crate::commands::error::{CmdResult, CommandError};
use crate::commands::settings::{
    self, KEY_IBKR_FLEX_QUERY_CASH, KEY_IBKR_FLEX_QUERY_POSITIONS, KEY_IBKR_FLEX_QUERY_TRADES,
    KEY_IBKR_FLEX_TOKEN,
};
use crate::commands::supabase::{get_client, SupabaseClient};
use serde_json::{json, Value};
use tauri::Emitter;

use super::flex::{self, opt_date, opt_num, opt_str, FlexRecords};
use super::IbkrSyncSummary;

/// Run the IBKR Flex sync once. Collects errors per phase; only truly fatal
/// issues (missing credentials, Supabase unreachable) short-circuit.
pub async fn run_sync(app_handle: &tauri::AppHandle) -> CmdResult<IbkrSyncSummary> {
    let mut summary = IbkrSyncSummary {
        positions_written: 0,
        trades_written: 0,
        cash_tx_written: 0,
        nav_rows_written: 0,
        errors: Vec::new(),
        finished_at: String::new(),
    };

    // Read credentials. Missing any one aborts early — no point partial-syncing.
    let token = load_key(KEY_IBKR_FLEX_TOKEN)?
        .ok_or_else(|| CommandError::Config("IBKR Flex token not set".into()))?;
    let q_positions = load_key(KEY_IBKR_FLEX_QUERY_POSITIONS)?;
    let q_trades = load_key(KEY_IBKR_FLEX_QUERY_TRADES)?;
    let q_cash = load_key(KEY_IBKR_FLEX_QUERY_CASH)?;

    if q_positions.is_none() && q_trades.is_none() && q_cash.is_none() {
        return Err(CommandError::Config(
            "At least one IBKR Flex query ID must be set".into(),
        ));
    }

    let client = get_client().await?;

    // --- Positions + NAV (both come from the same query) --------------------
    if let Some(qid) = q_positions {
        emit_progress(app_handle, "positions", "fetching");
        match fetch_and_parse(&token, &qid).await {
            Ok(records) => {
                eprintln!(
                    "[ibkr:sync] positions query returned: {:?}",
                    flex::record_counts(&records)
                );
                match write_positions(&client, &records).await {
                    Ok(n) => summary.positions_written = n,
                    Err(e) => summary.errors.push(format!("positions upsert: {}", e)),
                }
                match write_nav(&client, &records).await {
                    Ok(n) => summary.nav_rows_written = n,
                    Err(e) => summary.errors.push(format!("nav upsert: {}", e)),
                }
            }
            Err(e) => summary.errors.push(format!("positions fetch: {}", e)),
        }
    }

    // --- Trades -------------------------------------------------------------
    if let Some(qid) = q_trades {
        emit_progress(app_handle, "trades", "fetching");
        match fetch_and_parse(&token, &qid).await {
            Ok(records) => {
                eprintln!(
                    "[ibkr:sync] trades query returned: {:?}",
                    flex::record_counts(&records)
                );
                match write_trades(&client, &records).await {
                    Ok(n) => summary.trades_written = n,
                    Err(e) => summary.errors.push(format!("trades upsert: {}", e)),
                }
            }
            Err(e) => summary.errors.push(format!("trades fetch: {}", e)),
        }
    }

    // --- Cash transactions --------------------------------------------------
    if let Some(qid) = q_cash {
        emit_progress(app_handle, "cash", "fetching");
        match fetch_and_parse(&token, &qid).await {
            Ok(records) => {
                eprintln!(
                    "[ibkr:sync] cash query returned: {:?}",
                    flex::record_counts(&records)
                );
                match write_cash_tx(&client, &records).await {
                    Ok(n) => summary.cash_tx_written = n,
                    Err(e) => summary.errors.push(format!("cash upsert: {}", e)),
                }
            }
            Err(e) => summary.errors.push(format!("cash fetch: {}", e)),
        }
    }

    summary.finished_at = chrono::Utc::now().to_rfc3339();
    let _ = app_handle.emit("ibkr:sync-complete", &summary);
    Ok(summary)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn load_key(name: &str) -> CmdResult<Option<String>> {
    let v = settings::settings_get_key(name.to_string())?;
    Ok(v.filter(|s| !s.is_empty()))
}

fn emit_progress(app_handle: &tauri::AppHandle, phase: &str, status: &str) {
    let _ = app_handle.emit(
        "ibkr:sync-progress",
        json!({ "phase": phase, "status": status }),
    );
}

async fn fetch_and_parse(token: &str, query_id: &str) -> CmdResult<FlexRecords> {
    let xml = flex::fetch_statement(token, query_id).await?;
    flex::parse_flex_xml(&xml)
}

// ---------------------------------------------------------------------------
// Row builders — map parsed Flex attribute maps to our Supabase table shapes.
// Each builder keeps a `raw` copy of the original attributes so future schema
// changes don't require re-fetching.
// ---------------------------------------------------------------------------

async fn write_positions(client: &SupabaseClient, records: &FlexRecords) -> CmdResult<usize> {
    if records.open_positions.is_empty() {
        return Ok(0);
    }

    let rows: Vec<Value> = records
        .open_positions
        .iter()
        .filter_map(|m| {
            // snapshot_date: Flex doesn't give a "reportDate" on OpenPosition
            // rows. We use the file's generation date which we don't have at
            // this level; instead, use today (the run date). For "Last Business
            // Day" queries this matches the data window.
            let snapshot_date = chrono::Utc::now().format("%Y-%m-%d").to_string();
            let account_id = opt_str(m, "accountId")?;
            let conid = opt_str(m, "conid")?;
            let symbol = opt_str(m, "symbol").unwrap_or_else(|| "UNKNOWN".into());
            Some(json!({
                "snapshot_date": snapshot_date,
                "account_id": account_id,
                "conid": conid,
                "symbol": symbol,
                "asset_class": opt_str(m, "assetCategory"),
                "description": opt_str(m, "description"),
                "currency": opt_str(m, "currency"),
                "quantity": opt_num(m, "position"),
                "mark_price": opt_num(m, "markPrice"),
                "position_value": opt_num(m, "positionValue"),
                "cost_basis": opt_num(m, "costBasisMoney"),
                "unrealized_pnl": opt_num(m, "fifoPnlUnrealized"),
                "realized_pnl": opt_num(m, "realizedPnl"),
                "fx_rate_to_base": opt_num(m, "fxRateToBase"),
                "raw": Value::Object(m.clone()),
            }))
        })
        .collect();

    upsert_rows(
        client,
        "ibkr_positions",
        &rows,
        "snapshot_date,account_id,conid",
    )
    .await?;
    Ok(rows.len())
}

async fn write_trades(client: &SupabaseClient, records: &FlexRecords) -> CmdResult<usize> {
    if records.trades.is_empty() {
        return Ok(0);
    }

    let rows: Vec<Value> = records
        .trades
        .iter()
        .filter_map(|m| {
            let trade_id = opt_str(m, "tradeID")?;
            let trade_date = opt_date(m, "tradeDate")?;
            let account_id = opt_str(m, "accountId")?;
            let symbol = opt_str(m, "symbol").unwrap_or_else(|| "UNKNOWN".into());
            // orderTime is "yyyyMMdd;HHmmss" in Flex. Not worth parsing in v1;
            // the full value lives in `raw` and we leave the typed column null.
            let order_time: Option<String> = None;
            Some(json!({
                "trade_id": trade_id,
                "trade_date": trade_date,
                "settle_date": opt_date(m, "settleDateTarget"),
                "account_id": account_id,
                "conid": opt_str(m, "conid"),
                "symbol": symbol,
                "asset_class": opt_str(m, "assetCategory"),
                "description": opt_str(m, "description"),
                "currency": opt_str(m, "currency"),
                "side": opt_str(m, "buySell"),
                "quantity": opt_num(m, "quantity"),
                "price": opt_num(m, "tradePrice"),
                "proceeds": opt_num(m, "proceeds"),
                "commission": opt_num(m, "ibCommission"),
                "net_cash": opt_num(m, "netCash"),
                "fx_rate_to_base": opt_num(m, "fxRateToBase"),
                "order_time": order_time,
                "raw": Value::Object(m.clone()),
            }))
        })
        .collect();

    upsert_rows(client, "ibkr_trades", &rows, "trade_id").await?;
    Ok(rows.len())
}

async fn write_cash_tx(client: &SupabaseClient, records: &FlexRecords) -> CmdResult<usize> {
    if records.cash_transactions.is_empty() {
        return Ok(0);
    }

    let rows: Vec<Value> = records
        .cash_transactions
        .iter()
        .filter_map(|m| {
            let transaction_id = opt_str(m, "transactionID")?;
            // settleDate is the primary date; fall back to dateTime's date part.
            let settle_date = opt_date(m, "settleDate").or_else(|| opt_date(m, "dateTime"))?;
            let account_id = opt_str(m, "accountId")?;
            let currency = opt_str(m, "currency").unwrap_or_else(|| "USD".into());
            let tx_type = opt_str(m, "type").unwrap_or_else(|| "Unknown".into());
            Some(json!({
                "transaction_id": transaction_id,
                "settle_date": settle_date,
                "report_date": opt_date(m, "reportDate"),
                "account_id": account_id,
                "currency": currency,
                "type": tx_type,
                "symbol": opt_str(m, "symbol"),
                "conid": opt_str(m, "conid"),
                "description": opt_str(m, "description"),
                "amount": opt_num(m, "amount").unwrap_or(0.0),
                "fx_rate_to_base": opt_num(m, "fxRateToBase"),
                "raw": Value::Object(m.clone()),
            }))
        })
        .collect();

    upsert_rows(client, "ibkr_cash_transactions", &rows, "transaction_id").await?;
    Ok(rows.len())
}

async fn write_nav(client: &SupabaseClient, records: &FlexRecords) -> CmdResult<usize> {
    if records.equity_summaries.is_empty() {
        return Ok(0);
    }

    let rows: Vec<Value> = records
        .equity_summaries
        .iter()
        .filter_map(|m| {
            let as_of_date = opt_date(m, "reportDate")?;
            let account_id = opt_str(m, "accountId")?;
            // Flex puts base currency either in a currency attribute or as
            // accompanying "EquitySummaryInBase" wrapper. We try a few names.
            let base_currency = opt_str(m, "currency")
                .or_else(|| opt_str(m, "baseCurrency"))
                .unwrap_or_else(|| "USD".into());
            // Total NAV: Flex uses `total` on the summary row for the total
            // equity in base currency. Some field variants differ by query
            // config — fall back through a few known names.
            let nav_base = opt_num(m, "total")
                .or_else(|| opt_num(m, "totalLong"))
                .or_else(|| opt_num(m, "netLiquidation"))
                .unwrap_or(0.0);
            Some(json!({
                "as_of_date": as_of_date,
                "account_id": account_id,
                "base_currency": base_currency,
                "nav_base": nav_base,
                "cash_base": opt_num(m, "cash"),
                "stock_base": opt_num(m, "stock"),
                "options_base": opt_num(m, "options"),
                "other_base": opt_num(m, "other"),
                "raw": Value::Object(m.clone()),
            }))
        })
        .collect();

    upsert_rows(client, "ibkr_nav_history", &rows, "as_of_date,account_id").await?;
    Ok(rows.len())
}

/// Batch upsert via PostgREST. The workspace Supabase client's `upsert_on`
/// helper returns a single row; we only care that the request succeeds, so we
/// deserialize into `Value` and discard the returned row.
async fn upsert_rows(
    client: &SupabaseClient,
    table: &str,
    rows: &[Value],
    on_conflict: &str,
) -> CmdResult<()> {
    if rows.is_empty() {
        return Ok(());
    }
    // PostgREST accepts JSON arrays for bulk upsert. We send the whole array.
    let payload = Value::Array(rows.to_vec());
    let _: Value = client.upsert_on(table, &payload, Some(on_conflict)).await?;
    Ok(())
}

