// Background sync task
// Starts 10s after app launch, runs incremental delta sync every 5 minutes

use super::db::EmailDb;
use super::sync;
use tauri::Emitter;

/// Emit job event for frontend jobs panel
fn emit_job(app: &tauri::AppHandle, id: &str, name: &str, status: &str, message: &str, started_at: &str) {
    let _ = app.emit("jobs:update", serde_json::json!({
        "id": id, "name": name, "status": status,
        "message": message, "startedAt": started_at,
    }));
}

/// Start the background sync loop. Call from main.rs setup hook.
pub fn start_background_sync(app_handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Wait 10s before first sync
        tokio::time::sleep(std::time::Duration::from_secs(10)).await;

        loop {
            // Check if background syncs are enabled (default: disabled)
            let email_enabled = crate::commands::settings::is_bg_sync_enabled(
                crate::commands::settings::KEY_BG_SYNC_OUTLOOK_EMAIL,
            );
            let calendar_enabled = crate::commands::settings::is_bg_sync_enabled(
                crate::commands::settings::KEY_BG_SYNC_OUTLOOK_CALENDAR,
            );

            if email_enabled || calendar_enabled {
                let db = match EmailDb::open() {
                    Ok(db) => db,
                    Err(e) => {
                        eprintln!("[outlook:bg] Failed to open DB: {}", e);
                        tokio::time::sleep(std::time::Duration::from_secs(300)).await;
                        continue;
                    }
                };

                let initial_done = db
                    .get_sync_state("initial_sync_done")
                    .ok()
                    .flatten()
                    .map(|v| v == "true")
                    .unwrap_or(false);

                if initial_done && email_enabled {
                    // Email incremental sync
                    let job_id = format!("outlook-email-{}", chrono::Utc::now().timestamp_millis());
                    let started_at = chrono::Utc::now().to_rfc3339();
                    emit_job(&app_handle, &job_id, "Outlook Email Sync", "running", "Syncing emails...", &started_at);

                    match sync::run_incremental_sync(&db, &app_handle).await {
                        Ok(count) => {
                            let msg = format!("{} new emails", count);
                            emit_job(&app_handle, &job_id, "Outlook Email Sync", "completed", &msg, &started_at);
                            eprintln!("[outlook:bg] Sync done: {}", msg);
                        }
                        Err(e) => {
                            emit_job(&app_handle, &job_id, "Outlook Email Sync", "failed", &format!("{}", e), &started_at);
                            eprintln!("[outlook:bg] Sync error: {}", e);
                        }
                    }
                }

                if initial_done && calendar_enabled {
                    // Calendar sync
                    let calendar_initial_done = db
                        .get_sync_state("calendar_initial_sync_done")
                        .ok()
                        .flatten()
                        .map(|v| v == "true")
                        .unwrap_or(false);

                    if calendar_initial_done {
                        let cal_job_id = format!("outlook-cal-{}", chrono::Utc::now().timestamp_millis());
                        let cal_started = chrono::Utc::now().to_rfc3339();
                        emit_job(&app_handle, &cal_job_id, "Outlook Calendar Sync", "running", "Syncing events...", &cal_started);

                        match sync::run_calendar_sync(&db, &app_handle, 1).await {
                            Ok(count) => {
                                emit_job(&app_handle, &cal_job_id, "Outlook Calendar Sync", "completed", &format!("{} events", count), &cal_started);
                                eprintln!("[outlook:bg] Calendar sync done: {} events", count);
                            }
                            Err(e) => {
                                emit_job(&app_handle, &cal_job_id, "Outlook Calendar Sync", "failed", &format!("{}", e), &cal_started);
                                eprintln!("[outlook:bg] Calendar sync error: {}", e);
                            }
                        }
                    }
                }
            }

            // Wait 5 minutes
            tokio::time::sleep(std::time::Duration::from_secs(300)).await;
        }
    });
}
