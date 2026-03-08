// Workspace Module - Artifact Commands

use super::types::*;
use crate::commands::error::CmdResult;
use crate::commands::supabase::get_client;

/// Add an artifact to a workspace
#[tauri::command]
pub async fn workspace_add_artifact(data: CreateWorkspaceArtifact) -> CmdResult<WorkspaceArtifact> {
    let client = get_client().await?;
    client.insert("workspace_artifacts", &data).await
}

/// List artifacts for a workspace
#[tauri::command]
pub async fn workspace_list_artifacts(workspace_id: String, artifact_type: Option<String>) -> CmdResult<Vec<WorkspaceArtifact>> {
    let client = get_client().await?;
    let mut query = format!("workspace_id=eq.{}&order=created_at.desc", workspace_id);
    if let Some(t) = artifact_type {
        query.push_str(&format!("&type=eq.{}", t));
    }
    client.select("workspace_artifacts", &query).await
}

/// Remove an artifact from a workspace
#[tauri::command]
pub async fn workspace_remove_artifact(artifact_id: String) -> CmdResult<()> {
    let client = get_client().await?;
    let query = format!("id=eq.{}", artifact_id);
    client.delete("workspace_artifacts", &query).await
}
