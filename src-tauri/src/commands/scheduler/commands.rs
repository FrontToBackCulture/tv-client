use chrono::Utc;
use tauri::command;

use super::action;
use super::runner;
use super::storage;
use super::types::*;
use crate::commands::error::CmdResult;

// ============================================================================
// Job CRUD (all async, backed by Supabase)
// ============================================================================

#[command]
pub async fn scheduler_list_jobs() -> CmdResult<Vec<Job>> {
    storage::load_jobs_async().await
}

#[command]
pub async fn scheduler_get_job(id: String) -> CmdResult<Job> {
    storage::load_job_async(&id).await
}

#[command]
pub async fn scheduler_create_job(input: JobInput) -> CmdResult<Job> {
    let now = Utc::now();

    let job = Job {
        id: uuid_v4(),
        name: input.name,
        skill_prompt: input.skill_prompt,
        cron_expression: input.cron_expression,
        model: input.model.unwrap_or_else(|| "sonnet".to_string()),
        max_budget: input.max_budget,
        allowed_tools: input.allowed_tools.unwrap_or_default(),
        enabled: input.enabled.unwrap_or(true),
        generate_report: input.generate_report.unwrap_or(true),
        report_prefix: input.report_prefix,
        skill_refs: input.skill_refs,
        bot_path: input.bot_path,
        sod_reports_folder: input.sod_reports_folder,
        created_at: now,
        updated_at: now,
        last_run_at: None,
        last_run_status: None,
    };

    storage::save_job_async(&job).await?;
    Ok(job)
}

#[command]
pub async fn scheduler_update_job(id: String, input: JobInput) -> CmdResult<Job> {
    let mut job = storage::load_job_async(&id).await?;

    job.name = input.name;
    job.skill_prompt = input.skill_prompt;
    job.cron_expression = input.cron_expression;
    if let Some(model) = input.model {
        job.model = model;
    }
    job.max_budget = input.max_budget;
    if let Some(tools) = input.allowed_tools {
        job.allowed_tools = tools;
    }
    if let Some(enabled) = input.enabled {
        job.enabled = enabled;
    }
    if let Some(generate_report) = input.generate_report {
        job.generate_report = generate_report;
    }
    job.report_prefix = input.report_prefix;
    job.skill_refs = input.skill_refs;
    job.bot_path = input.bot_path;
    job.sod_reports_folder = input.sod_reports_folder;
    job.updated_at = Utc::now();

    storage::save_job_async(&job).await?;
    Ok(job)
}

#[command]
pub async fn scheduler_delete_job(id: String) -> CmdResult<()> {
    storage::delete_job_async(&id).await
}

#[command]
pub async fn scheduler_toggle_job(id: String, enabled: bool) -> CmdResult<Job> {
    let mut job = storage::load_job_async(&id).await?;
    job.enabled = enabled;
    job.updated_at = Utc::now();
    storage::save_job_async(&job).await?;
    Ok(job)
}

// ============================================================================
// Execution
// ============================================================================

#[command]
pub async fn scheduler_run_job(id: String, default_reports_folder: String, app_handle: tauri::AppHandle) -> CmdResult<String> {
    let job = storage::load_job_async(&id).await?;

    let run_id = uuid_v4();
    let run_id_clone = run_id.clone();
    let run_id_tracking = run_id.clone();
    let job_name = job.name.clone();

    // Spawn execution in background so the command returns immediately
    tauri::async_runtime::spawn(async move {
        use tauri::Emitter;
        let tracking_id = format!("scheduler-manual-{}", chrono::Utc::now().timestamp_millis());
        let started_at = chrono::Utc::now().to_rfc3339();
        let display_name = format!("Run: {}", job_name);
        let _ = app_handle.emit("jobs:update", serde_json::json!({
            "id": &tracking_id, "name": &display_name, "status": "running",
            "message": format!("Running {}...", job_name), "startedAt": &started_at,
        }));
        runner::execute_job(&job, &run_id_clone, RunTrigger::Manual, &app_handle, &default_reports_folder).await;
        let job_status = storage::load_run_async(&run_id_tracking).await
            .map(|r| r.status)
            .unwrap_or(RunStatus::Failed);
        match job_status {
            RunStatus::Failed => {
                let _ = app_handle.emit("jobs:update", serde_json::json!({
                    "id": &tracking_id, "name": &display_name, "status": "failed",
                    "message": format!("{} failed", job_name), "startedAt": &started_at,
                }));
            }
            _ => {
                let _ = app_handle.emit("jobs:update", serde_json::json!({
                    "id": &tracking_id, "name": &display_name, "status": "completed",
                    "message": format!("{} completed", job_name), "startedAt": &started_at,
                }));
            }
        }
    });

    Ok(run_id)
}

// ============================================================================
// Stop a running job
// ============================================================================

#[command]
pub async fn scheduler_stop_job(run_id: String) -> CmdResult<()> {
    runner::stop_job(&run_id)
}

// ============================================================================
// Run History
// ============================================================================

#[command]
pub async fn scheduler_list_runs(
    job_id: Option<String>,
    limit: Option<usize>,
) -> CmdResult<Vec<JobRun>> {
    storage::load_runs_async(job_id.as_deref(), limit.unwrap_or(100)).await
}

#[command]
pub async fn scheduler_get_run(run_id: String) -> CmdResult<JobRun> {
    storage::load_run_async(&run_id).await
}

#[command]
pub async fn scheduler_get_run_steps(run_id: String) -> CmdResult<Vec<RunStep>> {
    storage::load_run_steps_async(&run_id).await
}

// ============================================================================
// Status
// ============================================================================

#[command]
pub async fn scheduler_get_status() -> CmdResult<SchedulerStatus> {
    let jobs = storage::load_jobs_async().await?;
    let total = jobs.len();
    let enabled = jobs.iter().filter(|j| j.enabled).count();
    let running = jobs
        .iter()
        .filter(|j| j.last_run_status.as_ref() == Some(&RunStatus::Running))
        .count();

    Ok(SchedulerStatus {
        total_jobs: total,
        enabled_jobs: enabled,
        running_jobs: running,
        last_check_at: None,
    })
}

// ============================================================================
// Export / Import
// ============================================================================

#[command]
pub async fn scheduler_export_jobs(file_path: String) -> CmdResult<usize> {
    let jobs = storage::load_jobs_async().await?;

    // Strip runtime state before exporting
    let exported: Vec<Job> = jobs
        .into_iter()
        .map(|mut j| {
            j.last_run_at = None;
            j.last_run_status = None;
            j
        })
        .collect();

    let count = exported.len();
    let content = serde_json::to_string_pretty(&exported)?;
    std::fs::write(&file_path, content)?;
    Ok(count)
}

#[command]
pub async fn scheduler_import_jobs(file_path: String) -> CmdResult<usize> {
    let content = std::fs::read_to_string(&file_path)?;
    let imported: Vec<Job> = serde_json::from_str(&content)?;

    let now = Utc::now();
    let count = imported.len();

    for mut job in imported {
        job.id = uuid_v4();
        job.bot_path = None;
        job.enabled = false;
        job.last_run_at = None;
        job.last_run_status = None;
        job.created_at = now;
        job.updated_at = now;
        storage::save_job_async(&job).await?;
    }

    Ok(count)
}

// ============================================================================
// Unified automation execution
// ============================================================================

#[command]
pub async fn scheduler_run_automation(automation_id: String, default_reports_folder: String, app_handle: tauri::AppHandle) -> CmdResult<String> {
    let config = storage::load_automation_async(&automation_id).await?;

    let run_id = uuid_v4();
    let run_id_clone = run_id.clone();
    let run_id_tracking = run_id.clone();
    let auto_name = config.name.clone();

    tauri::async_runtime::spawn(async move {
        use tauri::Emitter;
        let tracking_id = format!("scheduler-manual-{}", chrono::Utc::now().timestamp_millis());
        let started_at = chrono::Utc::now().to_rfc3339();
        let display_name = format!("Run: {}", auto_name);
        let _ = app_handle.emit("jobs:update", serde_json::json!({
            "id": &tracking_id, "name": &display_name, "status": "running",
            "message": format!("Running {}...", auto_name), "startedAt": &started_at,
        }));
        runner::execute_automation(&config, &run_id_clone, RunTrigger::Manual, &app_handle, &default_reports_folder).await;
        let run_status = storage::load_run_async(&run_id_tracking).await
            .map(|r| r.status)
            .unwrap_or(RunStatus::Failed);
        match run_status {
            RunStatus::Failed => {
                let _ = app_handle.emit("jobs:update", serde_json::json!({
                    "id": &tracking_id, "name": &display_name, "status": "failed",
                    "message": format!("{} failed", auto_name), "startedAt": &started_at,
                }));
            }
            _ => {
                let _ = app_handle.emit("jobs:update", serde_json::json!({
                    "id": &tracking_id, "name": &display_name, "status": "completed",
                    "message": format!("{} completed", auto_name), "startedAt": &started_at,
                }));
            }
        }
    });

    Ok(run_id)
}

// ============================================================================
// Action execution
// ============================================================================

#[command]
pub async fn scheduler_execute_action(config: action::ActionConfig) -> CmdResult<action::ActionResult> {
    action::execute_action(&config).await
}

// ============================================================================
// Helpers
// ============================================================================

fn uuid_v4() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let d = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let nanos = d.as_nanos();
    let random: u64 = (nanos as u64).wrapping_mul(6364136223846793005).wrapping_add(1);
    format!(
        "{:08x}-{:04x}-4{:03x}-{:04x}-{:012x}",
        (nanos & 0xFFFFFFFF) as u32,
        ((nanos >> 32) & 0xFFFF) as u16,
        (random & 0xFFF) as u16,
        (0x8000 | (random >> 12) & 0x3FFF) as u16,
        (random >> 26) & 0xFFFFFFFFFFFF,
    )
}
