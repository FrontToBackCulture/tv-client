// Workspace Module - Context Commands
// Now writes project_id alongside workspace_id for forward compatibility

use super::types::*;
use crate::commands::error::CmdResult;
use crate::commands::supabase::get_client;
use crate::commands::work::types::WorkspaceContext;

/// Get the rolling context for a workspace
#[tauri::command]
#[allow(dead_code)]
pub async fn workspace_get_context(workspace_id: String) -> CmdResult<Option<WorkspaceContext>> {
    let client = get_client().await?;
    let query = format!("project_id=eq.{}", workspace_id);
    client.select_single("workspace_context", &query).await
}

/// Upsert the rolling context for a workspace
#[tauri::command]
pub async fn workspace_update_context(data: UpsertWorkspaceContext) -> CmdResult<WorkspaceContext> {
    let client = get_client().await?;

    // Dual-write: set both workspace_id and project_id
    let mut upsert_data = serde_json::to_value(&data).unwrap_or_default();
    if let Some(obj) = upsert_data.as_object_mut() {
        obj.insert("project_id".to_string(), serde_json::Value::String(data.workspace_id.clone()));
    }

    client.upsert("workspace_context", &upsert_data).await
}
