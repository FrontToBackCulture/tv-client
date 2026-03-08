// Workspace Module - Context Commands

use super::types::*;
use crate::commands::error::CmdResult;
use crate::commands::supabase::get_client;

/// Get the rolling context for a workspace
#[tauri::command]
pub async fn workspace_get_context(workspace_id: String) -> CmdResult<Option<WorkspaceContext>> {
    let client = get_client().await?;
    let query = format!("workspace_id=eq.{}", workspace_id);
    client.select_single("workspace_context", &query).await
}

/// Upsert the rolling context for a workspace
#[tauri::command]
pub async fn workspace_update_context(data: UpsertWorkspaceContext) -> CmdResult<WorkspaceContext> {
    let client = get_client().await?;
    client.upsert("workspace_context", &data).await
}
