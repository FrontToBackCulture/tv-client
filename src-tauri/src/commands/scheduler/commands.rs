use chrono::Utc;
use tauri::command;

use super::runner;
use super::storage;
use super::types::*;

// ============================================================================
// Job CRUD
// ============================================================================

#[command]
pub fn scheduler_list_jobs() -> Result<Vec<SchedulerJob>, String> {
    storage::load_jobs()
}

#[command]
pub fn scheduler_get_job(id: String) -> Result<SchedulerJob, String> {
    let jobs = storage::load_jobs()?;
    jobs.into_iter()
        .find(|j| j.id == id)
        .ok_or_else(|| format!("Job {} not found", id))
}

#[command]
pub fn scheduler_create_job(input: JobInput) -> Result<SchedulerJob, String> {
    let mut jobs = storage::load_jobs()?;
    let now = Utc::now();

    let job = SchedulerJob {
        id: uuid_v4(),
        name: input.name,
        skill_prompt: input.skill_prompt,
        cron_expression: input.cron_expression,
        model: input.model.unwrap_or_else(|| "sonnet".to_string()),
        max_budget: input.max_budget,
        allowed_tools: input.allowed_tools.unwrap_or_default(),
        slack_webhook_url: input.slack_webhook_url,
        slack_channel_name: input.slack_channel_name,
        enabled: input.enabled.unwrap_or(true),
        generate_report: input.generate_report.unwrap_or(true),
        report_prefix: input.report_prefix,
        skill_refs: input.skill_refs,
        bot_path: input.bot_path,
        created_at: now,
        updated_at: now,
        last_run_at: None,
        last_run_status: None,
    };

    jobs.push(job.clone());
    storage::save_jobs(&jobs)?;
    Ok(job)
}

#[command]
pub fn scheduler_update_job(id: String, input: JobInput) -> Result<SchedulerJob, String> {
    let mut jobs = storage::load_jobs()?;
    let job = jobs.iter_mut()
        .find(|j| j.id == id)
        .ok_or_else(|| format!("Job {} not found", id))?;

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
    job.slack_webhook_url = input.slack_webhook_url;
    job.slack_channel_name = input.slack_channel_name;
    if let Some(enabled) = input.enabled {
        job.enabled = enabled;
    }
    if let Some(generate_report) = input.generate_report {
        job.generate_report = generate_report;
    }
    job.report_prefix = input.report_prefix;
    job.skill_refs = input.skill_refs;
    job.bot_path = input.bot_path;
    job.updated_at = Utc::now();

    let updated = job.clone();
    storage::save_jobs(&jobs)?;
    Ok(updated)
}

#[command]
pub fn scheduler_delete_job(id: String) -> Result<(), String> {
    let mut jobs = storage::load_jobs()?;
    let before = jobs.len();
    jobs.retain(|j| j.id != id);
    if jobs.len() == before {
        return Err(format!("Job {} not found", id));
    }
    storage::save_jobs(&jobs)
}

#[command]
pub fn scheduler_toggle_job(id: String, enabled: bool) -> Result<SchedulerJob, String> {
    let mut jobs = storage::load_jobs()?;
    let job = jobs.iter_mut()
        .find(|j| j.id == id)
        .ok_or_else(|| format!("Job {} not found", id))?;

    job.enabled = enabled;
    job.updated_at = Utc::now();

    let updated = job.clone();
    storage::save_jobs(&jobs)?;
    Ok(updated)
}

// ============================================================================
// Execution
// ============================================================================

#[command]
pub async fn scheduler_run_job(id: String, app_handle: tauri::AppHandle) -> Result<String, String> {
    let jobs = storage::load_jobs()?;
    let job = jobs.into_iter()
        .find(|j| j.id == id)
        .ok_or_else(|| format!("Job {} not found", id))?;

    let run_id = uuid_v4();
    let run_id_clone = run_id.clone();

    // Spawn execution in background so the command returns immediately
    tauri::async_runtime::spawn(async move {
        runner::execute_job(&job, &run_id_clone, RunTrigger::Manual, &app_handle).await;
    });

    Ok(run_id)
}

// ============================================================================
// Stop a running job
// ============================================================================

#[command]
pub async fn scheduler_stop_job(run_id: String) -> Result<(), String> {
    runner::stop_job(&run_id)
}

// ============================================================================
// Run History
// ============================================================================

#[command]
pub async fn scheduler_list_runs(
    job_id: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<JobRun>, String> {
    storage::load_runs_async(job_id.as_deref(), limit.unwrap_or(100)).await
}

#[command]
pub async fn scheduler_get_run(run_id: String) -> Result<JobRun, String> {
    storage::load_run_async(&run_id).await
}

#[command]
pub async fn scheduler_get_run_steps(run_id: String) -> Result<Vec<RunStep>, String> {
    storage::load_run_steps_async(&run_id).await
}

// ============================================================================
// Status
// ============================================================================

#[command]
pub fn scheduler_get_status() -> Result<SchedulerStatus, String> {
    let jobs = storage::load_jobs()?;
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
