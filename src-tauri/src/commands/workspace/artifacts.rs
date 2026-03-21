// Workspace Module - Artifact Commands
// Now writes project_id alongside workspace_id for forward compatibility

use super::types::*;
use crate::commands::error::CmdResult;
use crate::commands::supabase::get_client;
use crate::commands::work::types::WorkspaceArtifact;

/// Add an artifact to a workspace or project (Work, Deal, or Workspace type).
/// Uses project_id as the primary FK. Sets workspace_id only if the project
/// also exists in the legacy workspaces table (backward compatibility).
/// If session_id is provided, resolves it: if it matches a conversation_id in
/// workspace_sessions, uses the session's actual id (UUID PK) for the FK.
#[tauri::command]
pub async fn workspace_add_artifact(data: CreateWorkspaceArtifact) -> CmdResult<WorkspaceArtifact> {
    let client = get_client().await?;

    // Check if this ID exists in the legacy workspaces table
    let ws_query = format!("id=eq.{}&select=id", data.workspace_id);
    let ws_exists: Vec<serde_json::Value> = client.select("workspaces", &ws_query).await.unwrap_or_default();

    let mut insert_data = serde_json::to_value(&data).unwrap_or_default();
    if let Some(obj) = insert_data.as_object_mut() {
        // Always set project_id
        obj.insert("project_id".to_string(), serde_json::Value::String(data.workspace_id.clone()));

        if ws_exists.is_empty() {
            // Not a legacy workspace — remove workspace_id to avoid FK violation
            obj.remove("workspace_id");
        }

        // Resolve session_id: caller may pass conversation_id instead of the session's PK.
        // Look up by conversation_id first, fall back to direct id match.
        if let Some(sid) = obj.get("session_id").and_then(|v| v.as_str()).map(|s| s.to_string()) {
            // Try to find a session where conversation_id matches
            let conv_query = format!(
                "project_id=eq.{}&conversation_id=eq.{}&select=id",
                data.workspace_id, sid
            );
            let conv_matches: Vec<serde_json::Value> = client
                .select("workspace_sessions", &conv_query)
                .await
                .unwrap_or_default();

            if let Some(first) = conv_matches.first() {
                // Found a session by conversation_id — use its actual PK
                if let Some(real_id) = first.get("id").and_then(|v| v.as_str()) {
                    obj.insert("session_id".to_string(), serde_json::Value::String(real_id.to_string()));
                }
            }
            // If no match by conversation_id, leave session_id as-is (it may be the actual PK).
            // If it's invalid, the DB FK constraint will catch it — caller gets a clear error.
        }
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
