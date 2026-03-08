// Workspace Module - Session Commands

use super::types::*;
use crate::commands::error::CmdResult;
use crate::commands::supabase::get_client;

/// Add a session entry to a workspace
#[tauri::command]
pub async fn workspace_add_session(data: CreateWorkspaceSession) -> CmdResult<WorkspaceSession> {
    let client = get_client().await?;
    client.insert("workspace_sessions", &data).await
}

/// Update a session entry
#[tauri::command]
pub async fn workspace_update_session(
    id: String,
    data: UpdateWorkspaceSession,
) -> CmdResult<WorkspaceSession> {
    let client = get_client().await?;
    client
        .update("workspace_sessions", &format!("id=eq.{}", id), &data)
        .await
}

/// List sessions for a workspace
#[tauri::command]
pub async fn workspace_list_sessions(workspace_id: String) -> CmdResult<Vec<WorkspaceSession>> {
    let client = get_client().await?;
    let query = format!("workspace_id=eq.{}&order=date.desc", workspace_id);
    client.select("workspace_sessions", &query).await
}
