// Workspace Module - Session Commands
// Now writes project_id alongside workspace_id for forward compatibility

use super::types::*;
use crate::commands::error::CmdResult;
use crate::commands::supabase::get_client;
use crate::commands::work::types::WorkspaceContext;

/// Build a current_state string from session data for auto-updating workspace context.
fn build_current_state(summary: Option<&str>, next_steps: Option<&[String]>) -> String {
    let mut parts = Vec::new();
    if let Some(s) = summary {
        parts.push(s.to_string());
    }
    if let Some(steps) = next_steps {
        if !steps.is_empty() {
            parts.push(format!("Next: {}", steps.join("; ")));
        }
    }
    parts.join(" ")
}

/// Auto-update workspace context current_state after session add/update.
/// Best-effort — does not fail the session operation if context update fails.
/// Works for Work, Deal, and Workspace type projects.
async fn sync_context_current_state(
    client: &crate::commands::supabase::SupabaseClient,
    workspace_id: &str,
    summary: Option<&str>,
    next_steps: Option<&[String]>,
    decisions: Option<&serde_json::Value>,
) {
    let current_state = build_current_state(summary, next_steps);
    if current_state.is_empty() {
        return;
    }

    // Check if this ID exists in the legacy workspaces table
    let ws_query = format!("id=eq.{}&select=id", workspace_id);
    let ws_exists: Vec<serde_json::Value> = client.select("workspaces", &ws_query).await.unwrap_or_default();

    let context = UpsertWorkspaceContext {
        workspace_id: workspace_id.to_string(),
        context_summary: None, // don't overwrite — only update current_state
        current_state: Some(current_state),
        key_decisions: None,
    };

    let mut context_data = serde_json::to_value(&context).unwrap_or_default();
    if let Some(obj) = context_data.as_object_mut() {
        // Always set project_id
        obj.insert("project_id".to_string(), serde_json::Value::String(workspace_id.to_string()));

        if ws_exists.is_empty() {
            // Not a legacy workspace — remove workspace_id to avoid FK violation
            obj.remove("workspace_id");
        }

        // If session has decisions, merge them into context too
        if let Some(d) = decisions {
            if d.is_array() && !d.as_array().unwrap().is_empty() {
                obj.insert("key_decisions".to_string(), d.clone());
            }
        }
    }

    let _: Result<WorkspaceContext, _> = client.upsert_on("workspace_context", &context_data, Some("project_id")).await;
}

/// Add a session entry to a workspace.
/// If conversation_id is provided and a session already exists for that conversation,
/// updates the existing session instead of creating a duplicate.
/// Also auto-updates the workspace context current_state from the session.
#[tauri::command]
pub async fn workspace_add_session(data: CreateWorkspaceSession) -> CmdResult<crate::commands::work::types::WorkspaceSession> {
    let client = get_client().await?;

    // Check if this ID exists in the legacy workspaces table
    let ws_query = format!("id=eq.{}&select=id", data.workspace_id);
    let ws_exists: Vec<serde_json::Value> = client.select("workspaces", &ws_query).await.unwrap_or_default();

    // Upsert by conversation_id: if a session with this conversation already exists, update it
    if let Some(ref conv_id) = data.conversation_id {
        let query = format!(
            "project_id=eq.{}&conversation_id=eq.{}",
            data.workspace_id, conv_id
        );
        let existing: Vec<crate::commands::work::types::WorkspaceSession> =
            client.select("workspace_sessions", &query).await?;

        if let Some(existing_session) = existing.into_iter().next() {
            let update = UpdateWorkspaceSession {
                summary: data.summary.clone(),
                decisions: data.decisions.clone(),
                next_steps: data.next_steps.clone(),
                open_questions: data.open_questions,
                notes: data.notes,
                conversation_id: data.conversation_id,
            };
            let result: crate::commands::work::types::WorkspaceSession = client
                .update(
                    "workspace_sessions",
                    &format!("id=eq.{}", existing_session.id),
                    &update,
                )
                .await?;

            // Auto-sync context
            sync_context_current_state(
                &client,
                &data.workspace_id,
                update.summary.as_deref(),
                update.next_steps.as_deref(),
                update.decisions.as_ref(),
            )
            .await;

            return Ok(result);
        }
    }

    // Build insert data — always set project_id, only set workspace_id if legacy workspace exists
    let mut insert_data = serde_json::to_value(&data).unwrap_or_default();
    if let Some(obj) = insert_data.as_object_mut() {
        obj.insert("project_id".to_string(), serde_json::Value::String(data.workspace_id.clone()));

        if ws_exists.is_empty() {
            // Not a legacy workspace — remove workspace_id to avoid FK violation
            obj.remove("workspace_id");
        }
    }

    let result: crate::commands::work::types::WorkspaceSession = client.insert("workspace_sessions", &insert_data).await?;

    // Auto-sync context
    sync_context_current_state(
        &client,
        &data.workspace_id,
        data.summary.as_deref(),
        data.next_steps.as_deref(),
        data.decisions.as_ref(),
    )
    .await;

    Ok(result)
}

/// Update a session entry. Also auto-updates workspace context current_state.
#[tauri::command]
pub async fn workspace_update_session(
    id: String,
    data: UpdateWorkspaceSession,
) -> CmdResult<crate::commands::work::types::WorkspaceSession> {
    let client = get_client().await?;
    let result: crate::commands::work::types::WorkspaceSession = client
        .update("workspace_sessions", &format!("id=eq.{}", id), &data)
        .await?;

    // Auto-sync context using the session's workspace_id or project_id
    if let Some(ref ws_id) = result.workspace_id.as_ref().or(result.project_id.as_ref()) {
        sync_context_current_state(
            &client,
            ws_id,
            data.summary.as_deref(),
            data.next_steps.as_deref(),
            data.decisions.as_ref(),
        )
        .await;
    }

    Ok(result)
}

/// List sessions for a workspace
#[tauri::command]
#[allow(dead_code)]
pub async fn workspace_list_sessions(workspace_id: String) -> CmdResult<Vec<crate::commands::work::types::WorkspaceSession>> {
    let client = get_client().await?;
    // Query by project_id (forward-compatible) with fallback to workspace_id
    let query = format!("project_id=eq.{}&order=date.desc", workspace_id);
    client.select("workspace_sessions", &query).await
}
