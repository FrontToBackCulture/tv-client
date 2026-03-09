// Workspace Module - Session Commands

use super::types::*;
use crate::commands::error::CmdResult;
use crate::commands::supabase::get_client;

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

    let mut context = UpsertWorkspaceContext {
        workspace_id: workspace_id.to_string(),
        context_summary: None, // don't overwrite — only update current_state
        current_state: Some(current_state),
        key_decisions: None,
    };

    // If session has decisions, merge them into context too
    if let Some(d) = decisions {
        if d.is_array() && !d.as_array().unwrap().is_empty() {
            context.key_decisions = Some(d.clone());
        }
    }

    let _: Result<WorkspaceContext, _> = client.upsert("workspace_context", &context).await;
}

/// Add a session entry to a workspace.
/// If conversation_id is provided and a session already exists for that conversation,
/// updates the existing session instead of creating a duplicate.
/// Also auto-updates the workspace context current_state from the session.
#[tauri::command]
pub async fn workspace_add_session(data: CreateWorkspaceSession) -> CmdResult<WorkspaceSession> {
    let client = get_client().await?;

    // Upsert by conversation_id: if a session with this conversation already exists, update it
    if let Some(ref conv_id) = data.conversation_id {
        let query = format!(
            "workspace_id=eq.{}&conversation_id=eq.{}",
            data.workspace_id, conv_id
        );
        let existing: Vec<WorkspaceSession> =
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
            let result: WorkspaceSession = client
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

    let result: WorkspaceSession = client.insert("workspace_sessions", &data).await?;

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
) -> CmdResult<WorkspaceSession> {
    let client = get_client().await?;
    let result: WorkspaceSession = client
        .update("workspace_sessions", &format!("id=eq.{}", id), &data)
        .await?;

    // Auto-sync context using the session's workspace_id
    sync_context_current_state(
        &client,
        &result.workspace_id,
        data.summary.as_deref(),
        data.next_steps.as_deref(),
        data.decisions.as_ref(),
    )
    .await;

    Ok(result)
}

/// List sessions for a workspace
#[tauri::command]
pub async fn workspace_list_sessions(workspace_id: String) -> CmdResult<Vec<WorkspaceSession>> {
    let client = get_client().await?;
    let query = format!("workspace_id=eq.{}&order=date.desc", workspace_id);
    client.select("workspace_sessions", &query).await
}
