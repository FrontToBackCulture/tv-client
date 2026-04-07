// Public Data Background Sync
// Starts 120s after app launch, runs daily (every 24 hours).
// Invokes the `ingest-public-data` Supabase Edge Function for each source,
// then calls `map_new_job_postings()` to tag new rows.

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
        // Wait 120s before first sync
        tokio::time::sleep(std::time::Duration::from_secs(120)).await;

        loop {
            let sync_enabled = crate::commands::settings::is_bg_sync_enabled(
                crate::commands::settings::KEY_BG_SYNC_PUBLIC_DATA,
            );

            if sync_enabled {
                let workspaces = crate::commands::settings::get_registered_workspaces();

                if workspaces.is_empty() {
                    run_one(&app_handle, None).await;
                } else {
                    for workspace_id in workspaces {
                        run_one(&app_handle, Some(workspace_id)).await;
                    }
                }
            }

            // Wait 24 hours before next sync
            tokio::time::sleep(std::time::Duration::from_secs(24 * 3600)).await;
        }
    });
}

async fn run_one(app_handle: &tauri::AppHandle, workspace_id: Option<String>) {
    let scope_label = workspace_id.clone().unwrap_or_else(|| "global".into());
    let job_id = format!(
        "public-data-bg-{}-{}",
        scope_label,
        chrono::Utc::now().timestamp_millis()
    );
    let started_at = chrono::Utc::now().to_rfc3339();
    let job_name = "Public Data Sync".to_string();

    emit_job(app_handle, &job_id, &job_name, "running", "Starting MCF job postings sync...", &started_at);

    let result = match workspace_id {
        Some(ws_id) => {
            crate::commands::supabase::WORKSPACE_OVERRIDE
                .scope(Some(ws_id), invoke_ingest(app_handle, &job_id, &job_name, &started_at))
                .await
        }
        None => invoke_ingest(app_handle, &job_id, &job_name, &started_at).await,
    };

    match result {
        Ok(msg) => {
            emit_job(app_handle, &job_id, &job_name, "completed", &msg, &started_at);
            eprintln!("[public-data:bg] {} done: {}", scope_label, msg);
        }
        Err(e) => {
            let msg = format!("{}", e);
            emit_job(app_handle, &job_id, &job_name, "failed", &msg, &started_at);
            eprintln!("[public-data:bg] {} error: {}", scope_label, e);
        }
    }
}

/// Invoke the ingest-public-data edge function with source_id = "all-p1"
/// (all priority-1 sources, which includes MCF).
async fn invoke_ingest(
    app_handle: &tauri::AppHandle,
    job_id: &str,
    job_name: &str,
    started_at: &str,
) -> Result<String, crate::commands::error::CommandError> {
    let client = crate::commands::supabase::get_client().await?;
    let url = format!("{}/functions/v1/ingest-public-data", client.base_url());
    let headers = client.auth_headers();

    emit_job(app_handle, job_id, job_name, "running", "Calling ingest-public-data edge function...", started_at);

    let response = crate::HTTP_CLIENT
        .post(&url)
        .headers(headers)
        .json(&json!({ "source_id": "all-p1" }))
        .send()
        .await
        .map_err(|e| crate::commands::error::CommandError::Internal(format!("Edge function request failed: {}", e)))?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        return Err(crate::commands::error::CommandError::Http { status, body });
    }

    let data: serde_json::Value = response.json().await
        .map_err(|e| crate::commands::error::CommandError::Internal(format!("Failed to parse response: {}", e)))?;

    // Summarize results
    let results = data.get("results").and_then(|r| r.as_object());
    let summary = if let Some(results) = results {
        let parts: Vec<String> = results.iter().map(|(k, v)| {
            let status = v.get("status").and_then(|s| s.as_str()).unwrap_or("?");
            let rows = v.get("rows").and_then(|r| r.as_i64());
            match rows {
                Some(n) => format!("{}: {} ({} rows)", k, status, n),
                None => format!("{}: {}", k, status),
            }
        }).collect();
        parts.join(", ")
    } else {
        "Sync completed".to_string()
    };

    Ok(summary)
}
