// Background scheduler — 60s polling loop, checks cron expressions

use chrono::Utc;
use cron::Schedule;
use std::str::FromStr;

use super::runner;
use super::storage;
use super::types::RunTrigger;

/// Start the scheduler polling loop. Call from main.rs setup hook.
/// `default_reports_folder` is the fallback for jobs that don't have sod_reports_folder set.
pub fn start_scheduler(app_handle: tauri::AppHandle, default_reports_folder: String) {
    tauri::async_runtime::spawn(async move {
        // Wait 15s before first check
        tokio::time::sleep(std::time::Duration::from_secs(15)).await;
        eprintln!("[scheduler] Background scheduler started");

        loop {
            check_and_run_jobs(&app_handle, &default_reports_folder).await;
            // Poll every 60s
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
        }
    });
}

async fn check_and_run_jobs(app_handle: &tauri::AppHandle, default_reports_folder: &str) {
    let jobs = match storage::load_jobs_async().await {
        Ok(j) => j,
        Err(e) => {
            eprintln!("[scheduler] Failed to load jobs: {}", e);
            return;
        }
    };

    let now = Utc::now();

    for job in jobs.iter().filter(|j| j.enabled) {
        // Skip ad-hoc jobs (no cron expression)
        let cron_expr_str = match &job.cron_expression {
            Some(expr) => expr.clone(),
            None => continue,
        };

        // Parse cron expression (cron crate needs 6 or 7 fields; add seconds if missing)
        let cron_expr = normalize_cron(&cron_expr_str);
        let schedule = match Schedule::from_str(&cron_expr) {
            Ok(s) => s,
            Err(e) => {
                eprintln!(
                    "[scheduler] Invalid cron '{}' for job '{}': {}",
                    cron_expr_str, job.name, e
                );
                continue;
            }
        };

        // Check if the job should run this minute
        if !should_run_now(&schedule, &job.last_run_at, &now) {
            continue;
        }

        eprintln!("[scheduler] Triggering scheduled job: {}", job.name);

        let job_clone = job.clone();
        let handle = app_handle.clone();
        let run_id = format!(
            "{:08x}-{:04x}-4000-8000-{:012x}",
            (now.timestamp_nanos_opt().unwrap_or(0) & 0xFFFFFFFF) as u32,
            ((now.timestamp_nanos_opt().unwrap_or(0) >> 32) & 0xFFFF) as u16,
            (now.timestamp_nanos_opt().unwrap_or(0) >> 16) & 0xFFFFFFFFFFFF,
        );

        // Spawn in separate task so concurrent jobs are OK
        let reports_folder = default_reports_folder.to_string();
        let job_name_for_tracking = job_clone.name.clone();
        let run_id_for_tracking = run_id.clone();
        tauri::async_runtime::spawn(async move {
            use tauri::Emitter;
            let tracking_id = format!("scheduler-{}-{}", job_clone.id, chrono::Utc::now().timestamp_millis());
            let started_at = chrono::Utc::now().to_rfc3339();
            let display_name = format!("Scheduled: {}", job_name_for_tracking);
            let _ = handle.emit("jobs:update", serde_json::json!({
                "id": &tracking_id, "name": &display_name, "status": "running",
                "message": format!("Running scheduled job: {}", job_name_for_tracking), "startedAt": &started_at,
            }));
            runner::execute_job(&job_clone, &run_id, RunTrigger::Scheduled, &handle, &reports_folder).await;
            // Check run status from storage to determine success/failure
            let job_status = storage::load_run_async(&run_id_for_tracking).await
                .map(|r| r.status)
                .unwrap_or(super::types::RunStatus::Failed);
            match job_status {
                super::types::RunStatus::Failed => {
                    let _ = handle.emit("jobs:update", serde_json::json!({
                        "id": &tracking_id, "name": &display_name, "status": "failed",
                        "message": format!("{} failed", job_name_for_tracking), "startedAt": &started_at,
                    }));
                }
                _ => {
                    let _ = handle.emit("jobs:update", serde_json::json!({
                        "id": &tracking_id, "name": &display_name, "status": "completed",
                        "message": format!("{} completed", job_name_for_tracking), "startedAt": &started_at,
                    }));
                }
            }
        });
    }
}

/// Check if the cron schedule matches the current minute and job hasn't run this minute
fn should_run_now(
    schedule: &Schedule,
    last_run_at: &Option<chrono::DateTime<Utc>>,
    now: &chrono::DateTime<Utc>,
) -> bool {
    // Find the most recent scheduled time before now
    let check_from = *now - chrono::Duration::seconds(61);
    let next = schedule.after(&check_from).next();

    if let Some(next_time) = next {
        // Check if this scheduled time falls within the current minute
        let diff = (*now - next_time).num_seconds().abs();
        if diff > 59 {
            return false;
        }

        // Check we haven't already run in this minute
        if let Some(last) = last_run_at {
            let since_last = (*now - *last).num_seconds();
            if since_last < 55 {
                return false;
            }
        }

        return true;
    }

    false
}

/// Normalize a 5-field cron expression to 6-field (add seconds) for the cron crate
fn normalize_cron(expr: &str) -> String {
    let fields: Vec<&str> = expr.trim().split_whitespace().collect();
    match fields.len() {
        5 => format!("0 {}", expr.trim()), // Add "0" seconds prefix
        6 | 7 => expr.to_string(),         // Already has seconds (or year)
        _ => expr.to_string(),             // Let cron crate handle the error
    }
}
