// Background sync task
// Starts 10s after app launch, runs incremental delta sync every 5 minutes

use super::db::EmailDb;
use super::sync;

/// Start the background sync loop. Call from main.rs setup hook.
pub fn start_background_sync(app_handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Wait 10s before first sync
        tokio::time::sleep(std::time::Duration::from_secs(10)).await;

        loop {
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

            if initial_done {
                match sync::run_incremental_sync(&db, &app_handle).await {
                    Ok(count) => {
                        eprintln!("[outlook:bg] Sync done: {} new emails", count);
                    }
                    Err(e) => {
                        eprintln!("[outlook:bg] Sync error: {}", e);
                        use tauri::Emitter;
                        let _ = app_handle.emit(
                            "outlook:sync-error",
                            serde_json::json!({ "error": e }),
                        );
                    }
                }
            }

            // Wait 5 minutes
            tokio::time::sleep(std::time::Duration::from_secs(300)).await;
        }
    });
}
