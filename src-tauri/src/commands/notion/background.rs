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
pub fn start_background_sync(app_handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Wait 60s before first sync (let app initialize + give user time for manual sync)
        tokio::time::sleep(std::time::Duration::from_secs(60)).await;

        loop {
            // Check if background Notion sync is enabled (default: disabled)
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
                let job_id = format!("notion-bg-{}", chrono::Utc::now().timestamp_millis());
                let started_at = chrono::Utc::now().to_rfc3339();
                emit_job(&app_handle, &job_id, "Notion Incremental Sync", "running", "Starting...", &started_at);

                match sync::run_sync(&app_handle, true).await {
                    Ok(results) => {
                        let total_created: i64 = results.iter().map(|r| r.tasks_created).sum();
                        let total_updated: i64 = results.iter().map(|r| r.tasks_updated).sum();
                        let msg = format!("{} created, {} updated", total_created, total_updated);
                        emit_job(&app_handle, &job_id, "Notion Incremental Sync", "completed", &msg, &started_at);
                        if total_created > 0 || total_updated > 0 {
                            eprintln!("[notion:bg] Sync done: {}", msg);
                        }
                    }
                    Err(e) => {
                        let msg = format!("{}", e);
                        emit_job(&app_handle, &job_id, "Notion Incremental Sync", "failed", &msg, &started_at);
                        eprintln!("[notion:bg] Sync error: {}", e);
                    }
                }
            }

            // Wait 4 hours before next sync
            tokio::time::sleep(std::time::Duration::from_secs(4 * 3600)).await;
        }
    });
}
