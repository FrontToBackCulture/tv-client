// Notion Tauri Command Handlers
// IPC entry points for the frontend

use crate::commands::error::CmdResult;
use crate::commands::supabase::get_client;
use serde_json::Value;

use super::api;
use super::sync;
use super::types::*;

// ============================================================================
// Database Discovery
// ============================================================================

/// List Notion databases accessible to the integration
#[tauri::command]
pub async fn notion_list_databases(query: Option<String>) -> CmdResult<Vec<NotionDatabaseInfo>> {
    api::search_databases(&query.unwrap_or_default()).await
}

/// Get the full schema (properties) of a Notion database
#[tauri::command]
pub async fn notion_get_database_schema(database_id: String) -> CmdResult<NotionDatabaseInfo> {
    api::get_database_schema(&database_id).await
}

/// Preview cards from a database with optional filter
#[tauri::command]
pub async fn notion_preview_cards(
    database_id: String,
    filter: Option<Value>,
) -> CmdResult<Vec<PreviewCard>> {
    api::preview_database(&database_id, filter.as_ref()).await
}

// ============================================================================
// Sync Configuration (CRUD via Supabase)
// ============================================================================

/// List all sync configurations
#[tauri::command]
pub async fn notion_list_sync_configs() -> CmdResult<Vec<SyncConfig>> {
    let client = get_client().await?;
    client
        .select("notion_sync_configs", "select=*&order=created_at.asc")
        .await
}

/// Save a new sync configuration
#[tauri::command]
pub async fn notion_save_sync_config(data: CreateSyncConfig) -> CmdResult<SyncConfig> {
    let client = get_client().await?;
    client.insert("notion_sync_configs", &data).await
}

/// Update an existing sync configuration
#[tauri::command]
pub async fn notion_update_sync_config(
    config_id: String,
    data: UpdateSyncConfig,
) -> CmdResult<SyncConfig> {
    let client = get_client().await?;
    client
        .update(
            "notion_sync_configs",
            &format!("id=eq.{}", config_id),
            &data,
        )
        .await
}

/// Delete a sync configuration
#[tauri::command]
pub async fn notion_delete_sync_config(config_id: String) -> CmdResult<()> {
    let client = get_client().await?;
    client
        .delete("notion_sync_configs", &format!("id=eq.{}", config_id))
        .await
}

// ============================================================================
// Sync Actions
// ============================================================================

/// Manually trigger a sync for all enabled configs
#[tauri::command]
pub async fn notion_sync_start(app_handle: tauri::AppHandle) -> CmdResult<Vec<SyncComplete>> {
    eprintln!("[notion] Manual sync triggered");
    sync::run_sync(&app_handle).await
}

/// Get current sync status
#[tauri::command]
pub async fn notion_sync_status() -> CmdResult<SyncStatus> {
    let client = get_client().await?;

    let all_configs: Vec<SyncConfig> = client
        .select("notion_sync_configs", "select=*")
        .await?;

    let enabled_count = all_configs.iter().filter(|c| c.enabled.unwrap_or(true)).count() as i64;

    let last_sync = all_configs
        .iter()
        .filter_map(|c| c.last_synced_at.as_ref())
        .max()
        .cloned();

    Ok(SyncStatus {
        is_syncing: false,
        last_sync,
        configs_count: all_configs.len() as i64,
        enabled_count,
    })
}
