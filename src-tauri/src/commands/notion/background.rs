// Notion Background Sync
// Starts 60s after app launch, runs incremental sync every 4 hours

use super::sync;
use serde_json::json;
use tauri::Emitter;

/// Emit job event — frontend jobsStore handles both memory + Supabase persistence
fn emit_job(app: &tauri::AppHandle, id: &str, name: &str, status: &str, message: &str, started_at: &str) {
    let _ = app.emit("jobs:update", json!({
        "id": id, "name": name, "status": status,
        "message": message, "startedAt": started_at,
    }));
}

/// Start the background sync loop. Call from main.rs setup hook.
///
/// Each iteration walks the list of registered workspaces and runs the
/// Notion incremental sync scoped to each one via `WORKSPACE_OVERRIDE`, so
/// every workspace syncs to its own Supabase project. Falls back to a
/// single global-settings run if no workspaces are registered yet (first
/// launch / legacy installs).
pub fn start_background_sync(app_handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Wait 60s before first sync (let app initialize + give user time for manual sync)
        tokio::time::sleep(std::time::Duration::from_secs(60)).await;

        loop {
            // Sync is gated by a single global flag (the Notion API key is
            // shared across workspaces today). If scoping these per-workspace
            // is ever needed, the flag can be moved to `ws:{id}:bg_sync_notion`
            // and read via `get_workspace_setting`.
            let sync_enabled = crate::commands::settings::is_bg_sync_enabled(
                crate::commands::settings::KEY_BG_SYNC_NOTION,
            );

            let has_key = crate::commands::settings::settings_get_key(
                crate::commands::settings::KEY_NOTION_API.to_string(),
            )
            .ok()
            .flatten()
            .is_some();

            if sync_enabled && has_key {
                let workspaces = crate::commands::settings::get_registered_workspaces();

                if workspaces.is_empty() {
                    // Fallback: no workspaces registered yet → run once
                    // against global settings (legacy single-workspace mode).
                    run_one(&app_handle, None).await;
                } else {
                    for workspace_id in workspaces {
                        run_one(&app_handle, Some(workspace_id)).await;
                    }
                }
            }

            // Wait 4 hours before next sync
            tokio::time::sleep(std::time::Duration::from_secs(4 * 3600)).await;
        }
    });
}

/// Execute a single sync run, optionally scoped to a specific workspace via
/// the `WORKSPACE_OVERRIDE` task-local. When `workspace_id` is None, the
/// sync uses global settings (legacy path).
async fn run_one(app_handle: &tauri::AppHandle, workspace_id: Option<String>) {
    let scope_label = workspace_id.clone().unwrap_or_else(|| "global".into());
    let job_id = format!(
        "notion-bg-{}-{}",
        scope_label,
        chrono::Utc::now().timestamp_millis()
    );
    let started_at = chrono::Utc::now().to_rfc3339();
    let job_name = if workspace_id.is_some() {
        format!("Notion Sync ({})", scope_label)
    } else {
        "Notion Incremental Sync".to_string()
    };
    emit_job(app_handle, &job_id, &job_name, "running", "Starting...", &started_at);

    let result = match workspace_id {
        Some(ws_id) => {
            // Wrap the sync in a WORKSPACE_OVERRIDE scope so every
            // `get_client()` call inside the sync resolves to this
            // workspace's Supabase project.
            crate::commands::supabase::WORKSPACE_OVERRIDE
                .scope(Some(ws_id), sync::run_sync(app_handle, true))
                .await
        }
        None => sync::run_sync(app_handle, true).await,
    };

    match result {
        Ok(results) => {
            let total_created: i64 = results.iter().map(|r| r.tasks_created).sum();
            let total_updated: i64 = results.iter().map(|r| r.tasks_updated).sum();
            let msg = format!("{} created, {} updated", total_created, total_updated);
            emit_job(app_handle, &job_id, &job_name, "completed", &msg, &started_at);
            if total_created > 0 || total_updated > 0 {
                eprintln!("[notion:bg] {} done: {}", scope_label, msg);
            }
        }
        Err(e) => {
            let msg = format!("{}", e);
            emit_job(app_handle, &job_id, &job_name, "failed", &msg, &started_at);
            eprintln!("[notion:bg] {} error: {}", scope_label, e);
        }
    }
}
