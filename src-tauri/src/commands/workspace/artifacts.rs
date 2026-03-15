// Workspace Module - Artifact Commands
// Now writes project_id alongside workspace_id for forward compatibility

use super::types::*;
use crate::commands::error::CmdResult;
use crate::commands::supabase::get_client;
use crate::commands::work::types::WorkspaceArtifact;

/// Add an artifact to a workspace
#[tauri::command]
pub async fn workspace_add_artifact(data: CreateWorkspaceArtifact) -> CmdResult<WorkspaceArtifact> {
    let client = get_client().await?;

    // Dual-write: set both workspace_id and project_id
    let mut insert_data = serde_json::to_value(&data).unwrap_or_default();
    if let Some(obj) = insert_data.as_object_mut() {
        obj.insert("project_id".to_string(), serde_json::Value::String(data.workspace_id.clone()));
    }

    client.insert("workspace_artifacts", &insert_data).await
}

/// List artifacts for a workspace
#[tauri::command]
#[allow(dead_code)]
pub async fn workspace_list_artifacts(workspace_id: String, artifact_type: Option<String>) -> CmdResult<Vec<WorkspaceArtifact>> {
    let client = get_client().await?;
    let mut query = format!("project_id=eq.{}&order=created_at.desc", workspace_id);
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
