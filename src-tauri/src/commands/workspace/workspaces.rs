// Workspace Module - Workspace Commands

use super::types::*;
use crate::commands::error::CmdResult;
use crate::commands::supabase::get_client;

/// List workspaces (lightweight — no nested sessions/artifacts/context)
#[tauri::command]
pub async fn workspace_list(status: Option<String>, owner: Option<String>, limit: Option<u32>) -> CmdResult<Vec<WorkspaceSummary>> {
    let client = get_client().await?;

    let limit = limit.unwrap_or(20).min(100);
    let mut query = format!(
        "select=id,title,description,status,owner,intent,initiative_id,created_at,updated_at&order=updated_at.desc&limit={}",
        limit
    );

    if let Some(s) = status {
        query.push_str(&format!("&status=eq.{}", s));
    }
    if let Some(o) = owner {
        query.push_str(&format!("&owner=eq.{}", o));
    }

    client.select("workspaces", &query).await
}

/// Get a single workspace by ID with all related data
#[tauri::command]
pub async fn workspace_get(workspace_id: String) -> CmdResult<Workspace> {
    let client = get_client().await?;

    let query = format!(
        "select=*,sessions:workspace_sessions(*),artifacts:workspace_artifacts(*),context:workspace_context(*)&id=eq.{}&sessions.order=date.desc&artifacts.order=created_at.desc",
        workspace_id
    );

    client
        .select_single("workspaces", &query)
        .await?
        .ok_or_else(|| crate::commands::error::CommandError::NotFound(format!("Workspace not found: {}", workspace_id)))
}

/// Create a new workspace
#[tauri::command]
pub async fn workspace_create(data: CreateWorkspace) -> CmdResult<Workspace> {
    let client = get_client().await?;
    let workspace: Workspace = client.insert("workspaces", &data).await?;
    workspace_get(workspace.id).await
}

/// Update a workspace
#[tauri::command]
pub async fn workspace_update(workspace_id: String, data: UpdateWorkspace) -> CmdResult<Workspace> {
    let client = get_client().await?;

    let query = format!("id=eq.{}", workspace_id);
    let _: Workspace = client.update("workspaces", &query, &data).await?;

    workspace_get(workspace_id).await
}

/// Delete a workspace
#[tauri::command]
pub async fn workspace_delete(workspace_id: String) -> CmdResult<()> {
    let client = get_client().await?;
    let query = format!("id=eq.{}", workspace_id);
    client.delete("workspaces", &query).await
}
