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

/// Upsert the rolling context for a workspace.
/// Uses project_id as the primary FK. Sets workspace_id only if the project
/// also exists in the legacy workspaces table (backward compatibility).
#[tauri::command]
pub async fn workspace_update_context(data: UpsertWorkspaceContext) -> CmdResult<WorkspaceContext> {
    let client = get_client().await?;

    // Check if this ID exists in the legacy workspaces table
    let ws_query = format!("id=eq.{}&select=id", data.workspace_id);
    let ws_exists: Vec<serde_json::Value> = client.select("workspaces", &ws_query).await.unwrap_or_default();

    let mut upsert_data = serde_json::to_value(&data).unwrap_or_default();
    if let Some(obj) = upsert_data.as_object_mut() {
        // Always set project_id
        obj.insert("project_id".to_string(), serde_json::Value::String(data.workspace_id.clone()));

        if ws_exists.is_empty() {
            // Not a legacy workspace — remove workspace_id to avoid FK violation
            obj.remove("workspace_id");
        }
    }

    // Upsert on project_id (unique constraint added in 20260320 migration).
    // Previously upserted on workspace_id (the old PK), but now id is the PK
    // and project_id has a unique constraint for one-context-per-project.
    client.upsert_on("workspace_context", &upsert_data, Some("project_id")).await
}
