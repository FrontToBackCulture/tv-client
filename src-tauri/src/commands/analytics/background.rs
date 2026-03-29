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
pub fn start_background_sync(app_handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Wait 30s before first check (let app settle)
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;

        loop {
            // Only attempt if authenticated
            if auth::load_tokens().is_some() {
                if should_sync().await {
                    run_sync(&app_handle).await;
                }
            }

            // Check again in 6 hours (in case app stays open for days)
            tokio::time::sleep(std::time::Duration::from_secs(6 * 3600)).await;
        }
    });
}

/// Check if we should sync (last sync was >24h ago)
async fn should_sync() -> bool {
    let s = match settings::load_settings() {
        Ok(s) => s,
        Err(_) => return false,
    };

    let supabase_url = match s.keys.get(settings::KEY_SUPABASE_URL) {
        Some(u) if !u.is_empty() => u.clone(),
        _ => return false,
    };
    let supabase_key = match s.keys.get(settings::KEY_SUPABASE_ANON_KEY) {
        Some(k) if !k.is_empty() => k.clone(),
        _ => return false,
    };

    // Check most recent created_at in analytics_page_views
    let client = crate::HTTP_CLIENT.clone();
    let url = format!(
        "{}/rest/v1/analytics_page_views?select=created_at&order=created_at.desc&limit=1",
        supabase_url
    );

    let resp = match client
        .get(&url)
        .header("apikey", &supabase_key)
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

/// Run both GA4 syncs (platform + website)
async fn run_sync(app: &tauri::AppHandle) {
    let s = match settings::load_settings() {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[ga4:bg] Failed to load settings: {}", e);
            return;
        }
    };

    let supabase_url = match s.keys.get(settings::KEY_SUPABASE_URL).cloned() {
        Some(u) if !u.is_empty() => u,
        _ => return,
    };
    let supabase_key = match s.keys.get(settings::KEY_SUPABASE_ANON_KEY).cloned() {
        Some(k) if !k.is_empty() => k,
        _ => return,
    };

    let has_platform = s.keys.get(settings::KEY_GA4_PROPERTY_ID).map_or(false, |p| !p.is_empty());
    let has_website = s.keys.get(settings::KEY_GA4_WEBSITE_PROPERTY_ID).map_or(false, |p| !p.is_empty());

    // Sync VAL platform
    if has_platform {
        let job_id = format!("ga4-platform-{}", chrono::Utc::now().timestamp_millis());
        let started_at = chrono::Utc::now().to_rfc3339();
        emit_job(app, &job_id, "GA4 Platform Sync", "running", "Fetching VAL platform analytics...", &started_at);

        match ga4::ga4_fetch_analytics(supabase_url.clone(), supabase_key.clone()).await {
            Ok(result) => {
                let msg = format!("{} rows synced", result.rows_upserted);
                emit_job(app, &job_id, "GA4 Platform Sync", "completed", &msg, &started_at);
                eprintln!("[ga4:bg] Platform sync done: {}", msg);
            }
            Err(e) => {
                emit_job(app, &job_id, "GA4 Platform Sync", "failed", &format!("{}", e), &started_at);
                eprintln!("[ga4:bg] Platform sync error: {}", e);
            }
        }
    }

    // Sync website
    if has_website {
        let job_id = format!("ga4-website-{}", chrono::Utc::now().timestamp_millis());
        let started_at = chrono::Utc::now().to_rfc3339();
        emit_job(app, &job_id, "GA4 Website Sync", "running", "Fetching website analytics...", &started_at);

        match ga4::ga4_fetch_website_analytics(supabase_url, supabase_key).await {
            Ok(result) => {
                let msg = format!("{} rows synced", result.rows_upserted);
                emit_job(app, &job_id, "GA4 Website Sync", "completed", &msg, &started_at);
                eprintln!("[ga4:bg] Website sync done: {}", msg);
            }
            Err(e) => {
                emit_job(app, &job_id, "GA4 Website Sync", "failed", &format!("{}", e), &started_at);
                eprintln!("[ga4:bg] Website sync error: {}", e);
            }
        }
    }
}
