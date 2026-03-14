// Notion Background Sync
// Starts 15s after app launch, runs incremental sync every hour

use super::sync;

/// Start the background sync loop. Call from main.rs setup hook.
pub fn start_background_sync(app_handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Wait 15s before first sync (let app initialize)
        tokio::time::sleep(std::time::Duration::from_secs(15)).await;

        loop {
            // Check if Notion API key is configured before attempting sync
            let has_key = crate::commands::settings::settings_get_key(
                crate::commands::settings::KEY_NOTION_API.to_string(),
            )
            .ok()
            .flatten()
            .is_some();

            if has_key {
                match sync::run_sync(&app_handle).await {
                    Ok(results) => {
                        let total_created: i64 = results.iter().map(|r| r.tasks_created).sum();
                        let total_updated: i64 = results.iter().map(|r| r.tasks_updated).sum();
                        if total_created > 0 || total_updated > 0 {
                            eprintln!(
                                "[notion:bg] Sync done: {} created, {} updated across {} configs",
                                total_created,
                                total_updated,
                                results.len()
                            );
                        }
                    }
                    Err(e) => {
                        eprintln!("[notion:bg] Sync error: {}", e);
                    }
                }
            }

            // Wait 1 hour before next sync
            tokio::time::sleep(std::time::Duration::from_secs(3600)).await;
        }
    });
}
