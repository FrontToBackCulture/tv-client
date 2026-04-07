// Background sync task for GA4 Analytics
// Starts 30s after app launch, checks if last sync was >24h ago, runs both syncs if stale.

use super::auth;
use super::ga4;
use crate::commands::settings;
use tauri::Emitter;

/// Emit job event for frontend jobs panel
fn emit_job(app: &tauri::AppHandle, id: &str, name: &str, status: &str, message: &str, started_at: &str) {
    let _ = app.emit("jobs:update", serde_json::json!({
        "id": id, "name": name, "status": status,
        "message": message, "startedAt": started_at,
    }));
}

/// Start the GA4 background sync loop. Call from main.rs setup hook.
///
/// Each iteration walks the list of registered workspaces and runs the GA4
/// sync against each one's Supabase project. GA4 itself (the Google side)
/// is a single property configured via global settings; the per-workspace
/// scoping only affects where the fetched analytics rows are written.
/// Falls back to a single global-settings run if no workspaces are
/// registered yet.
pub fn start_background_sync(app_handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Wait 30s before first check (let app settle)
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;

        loop {
            // Only attempt if authenticated
            if auth::load_tokens().is_some() {
                let workspaces = settings::get_registered_workspaces();
                let targets: Vec<Option<String>> = if workspaces.is_empty() {
                    vec![None] // Legacy single-workspace fallback
                } else {
                    workspaces.into_iter().map(Some).collect()
                };

                for workspace_id in targets {
                    if let Some((url, key)) = resolve_supabase_creds(workspace_id.as_deref()) {
                        if should_sync(&url, &key).await {
                            run_sync(&app_handle, &url, &key, workspace_id.as_deref()).await;
                        }
                    }
                }
            }

            // Check again in 6 hours (in case app stays open for days)
            tokio::time::sleep(std::time::Duration::from_secs(6 * 3600)).await;
        }
    });
}

/// Resolve Supabase URL + anon key, optionally scoped to a workspace. When
/// `workspace_id` is `None`, reads the global (unscoped) keys.
fn resolve_supabase_creds(workspace_id: Option<&str>) -> Option<(String, String)> {
    match workspace_id {
        Some(ws_id) => {
            let url = settings::get_workspace_setting(ws_id, settings::KEY_SUPABASE_URL)?;
            let key = settings::get_workspace_setting(ws_id, settings::KEY_SUPABASE_ANON_KEY)?;
            Some((url, key))
        }
        None => {
            let s = settings::load_settings().ok()?;
            let url = s
                .keys
                .get(settings::KEY_SUPABASE_URL)
                .filter(|v| !v.is_empty())
                .cloned()?;
            let key = s
                .keys
                .get(settings::KEY_SUPABASE_ANON_KEY)
                .filter(|v| !v.is_empty())
                .cloned()?;
            Some((url, key))
        }
    }
}

/// Check if we should sync (last sync was >24h ago) against a given
/// Supabase project.
async fn should_sync(supabase_url: &str, supabase_key: &str) -> bool {

    // Check most recent created_at in analytics_page_views
    let client = crate::HTTP_CLIENT.clone();
    let url = format!(
        "{}/rest/v1/analytics_page_views?select=created_at&order=created_at.desc&limit=1",
        supabase_url
    );

    let resp = match client
        .get(&url)
        .header("apikey", supabase_key)
        .header("Authorization", format!("Bearer {}", supabase_key))
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[ga4:bg] Failed to check last sync: {}", e);
            return true; // Sync if we can't check
        }
    };

    if !resp.status().is_success() {
        return true; // Sync if query fails
    }

    let rows: Vec<serde_json::Value> = match resp.json().await {
        Ok(r) => r,
        Err(_) => return true,
    };

    if rows.is_empty() {
        return true; // Never synced
    }

    let last_sync_str = match rows[0]["created_at"].as_str() {
        Some(s) => s,
        None => return true,
    };

    // Parse ISO 8601 timestamp
    let last_sync = match chrono::DateTime::parse_from_rfc3339(last_sync_str) {
        Ok(dt) => dt.with_timezone(&chrono::Utc),
        Err(_) => return true,
    };

    let hours_since = (chrono::Utc::now() - last_sync).num_hours();
    eprintln!("[ga4:bg] Last sync was {}h ago", hours_since);
    hours_since >= 24
}

/// Run both GA4 syncs (platform + website) against a given Supabase
/// project. GA4 property IDs are read from global settings (one GA4 account
/// across all workspaces); only the write target is workspace-scoped.
async fn run_sync(
    app: &tauri::AppHandle,
    supabase_url: &str,
    supabase_key: &str,
    workspace_id: Option<&str>,
) {
    let s = match settings::load_settings() {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[ga4:bg] Failed to load settings: {}", e);
            return;
        }
    };

    let has_platform = s.keys.get(settings::KEY_GA4_PROPERTY_ID).map_or(false, |p| !p.is_empty());
    let has_website = s.keys.get(settings::KEY_GA4_WEBSITE_PROPERTY_ID).map_or(false, |p| !p.is_empty());

    let scope_label = workspace_id.unwrap_or("global");

    // Sync VAL platform
    if has_platform {
        let job_id = format!("ga4-platform-{}-{}", scope_label, chrono::Utc::now().timestamp_millis());
        let started_at = chrono::Utc::now().to_rfc3339();
        let name = format!("GA4 Platform Sync ({})", scope_label);
        emit_job(app, &job_id, &name, "running", "Fetching VAL platform analytics...", &started_at);

        match ga4::ga4_fetch_analytics(supabase_url.to_string(), supabase_key.to_string()).await {
            Ok(result) => {
                let msg = format!("{} rows synced", result.rows_upserted);
                emit_job(app, &job_id, &name, "completed", &msg, &started_at);
                eprintln!("[ga4:bg] {} platform done: {}", scope_label, msg);
            }
            Err(e) => {
                emit_job(app, &job_id, &name, "failed", &format!("{}", e), &started_at);
                eprintln!("[ga4:bg] {} platform error: {}", scope_label, e);
            }
        }
    }

    // Sync website
    if has_website {
        let job_id = format!("ga4-website-{}-{}", scope_label, chrono::Utc::now().timestamp_millis());
        let started_at = chrono::Utc::now().to_rfc3339();
        let name = format!("GA4 Website Sync ({})", scope_label);
        emit_job(app, &job_id, &name, "running", "Fetching website analytics...", &started_at);

        match ga4::ga4_fetch_website_analytics(supabase_url.to_string(), supabase_key.to_string()).await {
            Ok(result) => {
                let msg = format!("{} rows synced", result.rows_upserted);
                emit_job(app, &job_id, &name, "completed", &msg, &started_at);
                eprintln!("[ga4:bg] {} website done: {}", scope_label, msg);
            }
            Err(e) => {
                emit_job(app, &job_id, &name, "failed", &format!("{}", e), &started_at);
                eprintln!("[ga4:bg] {} website error: {}", scope_label, e);
            }
        }
    }
}
