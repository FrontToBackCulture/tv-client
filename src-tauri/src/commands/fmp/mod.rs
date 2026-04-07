// Financial Modeling Prep (FMP) connector.
//
// Pulls fundamental data (profiles, statements, ratios, metrics, analyst
// data, insider trades, news) from the FMP /stable/ API into the personal
// workspace's `fmp_cache` table. Per-symbol granularity with on-demand sync
// triggered from the connector card in Settings → Integrations, or per
// holding via `sync_holdings`.
//
// All endpoints were reverse-engineered from Melvin's cached Research
// folder and live-tested against a Starter plan subscription. Plan-
// restricted endpoints are marked in endpoints.rs and skipped by the sync
// logic.

pub mod client;
pub mod endpoints;
pub mod sync;

use crate::commands::error::CmdResult;
use serde::Serialize;
use tauri::command;

#[derive(Debug, Clone, Serialize)]
pub struct FmpSyncSummary {
    pub endpoints_written: usize,
    pub errors: Vec<String>,
    pub finished_at: String,
}

/// Sync all fundamentals for one ticker. Called from the FMP connector card
/// after a user picks/types a symbol.
#[command]
pub async fn fmp_sync_ticker(
    app_handle: tauri::AppHandle,
    symbol: String,
    exchange: Option<String>,
    workspace_id: Option<String>,
) -> CmdResult<FmpSyncSummary> {
    let exchange_ref = exchange.as_deref();
    let run = async move {
        let (ok, errors) = sync::sync_ticker(&app_handle, &symbol, exchange_ref).await;
        Ok::<FmpSyncSummary, crate::commands::error::CommandError>(FmpSyncSummary {
            endpoints_written: ok,
            errors,
            finished_at: chrono::Utc::now().to_rfc3339(),
        })
    };

    match workspace_id {
        Some(ws_id) => {
            crate::commands::supabase::WORKSPACE_OVERRIDE
                .scope(Some(ws_id), run)
                .await
        }
        None => run.await,
    }
}

/// Sync fundamentals for every unique symbol currently held in
/// ibkr_positions. Useful as a "refresh all my research" button.
#[command]
pub async fn fmp_sync_holdings(
    app_handle: tauri::AppHandle,
    workspace_id: Option<String>,
) -> CmdResult<FmpSyncSummary> {
    match workspace_id {
        Some(ws_id) => {
            crate::commands::supabase::WORKSPACE_OVERRIDE
                .scope(Some(ws_id), sync::sync_holdings(&app_handle))
                .await
        }
        None => sync::sync_holdings(&app_handle).await,
    }
}

/// Sync the 14 market-level endpoints (sector PE, treasury rates, economic
/// indicators, etc.). Independent of any specific ticker.
#[command]
pub async fn fmp_sync_market(
    app_handle: tauri::AppHandle,
    workspace_id: Option<String>,
) -> CmdResult<FmpSyncSummary> {
    match workspace_id {
        Some(ws_id) => {
            crate::commands::supabase::WORKSPACE_OVERRIDE
                .scope(Some(ws_id), sync::sync_market(&app_handle))
                .await
        }
        None => sync::sync_market(&app_handle).await,
    }
}

/// Sync the 5 reference endpoints (available exchanges/sectors/industries/
/// countries/stock-list). Changes very infrequently — run on-demand only.
#[command]
pub async fn fmp_sync_reference(
    app_handle: tauri::AppHandle,
    workspace_id: Option<String>,
) -> CmdResult<FmpSyncSummary> {
    match workspace_id {
        Some(ws_id) => {
            crate::commands::supabase::WORKSPACE_OVERRIDE
                .scope(Some(ws_id), sync::sync_reference(&app_handle))
                .await
        }
        None => sync::sync_reference(&app_handle).await,
    }
}
