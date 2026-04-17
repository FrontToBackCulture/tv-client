// Interactive Brokers Flex Web Service sync.
//
// Personal-workspace-only connector. Pulls portfolio data (positions, trades,
// cash transactions, NAV) from IBKR's Flex Web Service and writes it into the
// current workspace's Supabase tables.
//
// Credentials are stored under the `melly_ibkr_*` key namespace in
// ~/.tv-mcp/settings.json — no other workspace touches these keys because
// the UI card is only registered inside the Melly workspace's personal
// connector registry (see src/modules/settings/integrations/connectors.personal.tsx).
//
// First milestone: manual "Sync Now" only. Background loop comes next once
// we've verified end-to-end.

pub mod flex;
pub mod sync;

use crate::commands::error::CmdResult;
use serde::Serialize;
use tauri::command;

/// Summary returned to the UI after a manual sync so the user can see what
/// happened without digging through logs.
#[derive(Debug, Clone, Serialize)]
pub struct IbkrSyncSummary {
    pub positions_written: usize,
    pub trades_written: usize,
    pub cash_tx_written: usize,
    pub nav_rows_written: usize,
    pub errors: Vec<String>,
    pub finished_at: String,
}

/// Tauri command: run the IBKR Flex sync once, end-to-end.
///
/// Bound to the "Sync Now" button inside the IBKR connector detail view.
/// Reads the four Flex credentials from the settings store. When the
/// calling window provides its `workspace_id`, the Supabase client is
/// scoped to that workspace via `WORKSPACE_OVERRIDE` so the data lands in
/// the right project even when multiple workspace windows are open.
#[command]
pub async fn ibkr_sync_now(
    app_handle: tauri::AppHandle,
    workspace_id: Option<String>,
) -> CmdResult<IbkrSyncSummary> {
    match workspace_id {
        Some(ws_id) => {
            crate::commands::supabase::WORKSPACE_OVERRIDE
                .scope(Some(ws_id), sync::run_sync(&app_handle))
                .await
        }
        None => sync::run_sync(&app_handle).await,
    }
}
