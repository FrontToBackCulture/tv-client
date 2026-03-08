use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use super::types::{JobRun, RunStatus, RunStep, RunTrigger, SchedulerJob, ToolDetail};
use crate::commands::error::{CmdResult, CommandError};
use crate::commands::supabase;

// ============================================================================
// Paths
// ============================================================================

fn scheduler_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".tv-desktop")
        .join("scheduler")
}

fn jobs_path() -> PathBuf {
    scheduler_dir().join("jobs.json")
}

fn ensure_dir(dir: &PathBuf) -> CmdResult<()> {
    if !dir.exists() {
        fs::create_dir_all(dir)?;
    }
    Ok(())
}

// ============================================================================
// Jobs CRUD
// ============================================================================

pub fn load_jobs() -> CmdResult<Vec<SchedulerJob>> {
    let path = jobs_path();
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&path)?;
    let jobs = serde_json::from_str(&content)?;
    Ok(jobs)
}

pub fn save_jobs(jobs: &[SchedulerJob]) -> CmdResult<()> {
    let dir = scheduler_dir();
    ensure_dir(&dir)?;
    let path = jobs_path();
    let content = serde_json::to_string_pretty(jobs)?;
    fs::write(&path, content)?;
    Ok(())
}



// ============================================================================
// Startup cleanup
// ============================================================================

/// Reset any jobs stuck in "running" status back to "failed".
/// Called on app startup to clean up stale state from killed processes.
pub fn reset_running_jobs() {
    match load_jobs() {
        Ok(mut jobs) => {
            let mut changed = false;
            for job in jobs.iter_mut() {
                if job.last_run_status == Some(RunStatus::Running) {
                    eprintln!("[scheduler] Resetting stale running job: {}", job.name);
                    job.last_run_status = Some(RunStatus::Failed);
                    changed = true;
                }
            }
            if changed {
                if let Err(e) = save_jobs(&jobs) {
                    eprintln!("[scheduler] Failed to save reset jobs: {}", e);
                }
            }
        }
        Err(e) => {
            eprintln!("[scheduler] Failed to load jobs for reset: {}", e);
        }
    }
}

// ============================================================================
// Supabase-friendly row type (snake_case for Postgres columns)
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
struct RunRow {
    id: String,
    job_id: String,
    job_name: String,
    started_at: String,
    finished_at: Option<String>,
    duration_secs: Option<f64>,
    status: String,
    output: Option<String>,
    output_preview: Option<String>,
    error: Option<String>,
    slack_posted: bool,
    trigger: String,
    cost_usd: Option<f64>,
    input_tokens: Option<i64>,
    output_tokens: Option<i64>,
    cache_read_tokens: Option<i64>,
    cache_creation_tokens: Option<i64>,
    num_turns: Option<i32>,
}

impl From<&JobRun> for RunRow {
    fn from(run: &JobRun) -> Self {
        RunRow {
            id: run.id.clone(),
            job_id: run.job_id.clone(),
            job_name: run.job_name.clone(),
            started_at: run.started_at.to_rfc3339(),
            finished_at: run.finished_at.map(|t| t.to_rfc3339()),
            duration_secs: run.duration_secs,
            status: match run.status {
                RunStatus::Running => "running",
                RunStatus::Success => "success",
                RunStatus::Failed => "failed",
            }
            .to_string(),
            output: Some(run.output.clone()),
            output_preview: Some(run.output_preview.clone()),
            error: run.error.clone(),
            slack_posted: run.slack_posted,
            trigger: match run.trigger {
                RunTrigger::Scheduled => "scheduled",
                RunTrigger::Manual => "manual",
            }
            .to_string(),
            cost_usd: run.cost_usd,
            input_tokens: run.input_tokens.map(|v| v as i64),
            output_tokens: run.output_tokens.map(|v| v as i64),
            cache_read_tokens: run.cache_read_tokens.map(|v| v as i64),
            cache_creation_tokens: run.cache_creation_tokens.map(|v| v as i64),
            num_turns: run.num_turns.map(|v| v as i32),
        }
    }
}

impl From<RunRow> for JobRun {
    fn from(row: RunRow) -> Self {
        use chrono::{DateTime, Utc};

        let started_at = DateTime::parse_from_rfc3339(&row.started_at)
            .map(|t| t.with_timezone(&Utc))
            .unwrap_or_else(|_| Utc::now());
        let finished_at = row
            .finished_at
            .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
            .map(|t| t.with_timezone(&Utc));

        JobRun {
            id: row.id,
            job_id: row.job_id,
            job_name: row.job_name,
            started_at,
            finished_at,
            duration_secs: row.duration_secs,
            status: match row.status.as_str() {
                "success" => RunStatus::Success,
                "failed" => RunStatus::Failed,
                _ => RunStatus::Running,
            },
            output: row.output.unwrap_or_default(),
            output_preview: row.output_preview.unwrap_or_default(),
            error: row.error,
            slack_posted: row.slack_posted,
            trigger: match row.trigger.as_str() {
                "manual" => RunTrigger::Manual,
                _ => RunTrigger::Scheduled,
            },
            cost_usd: row.cost_usd,
            input_tokens: row.input_tokens.map(|v| v as u64),
            output_tokens: row.output_tokens.map(|v| v as u64),
            cache_read_tokens: row.cache_read_tokens.map(|v| v as u64),
            cache_creation_tokens: row.cache_creation_tokens.map(|v| v as u64),
            num_turns: row.num_turns.map(|v| v as u32),
        }
    }
}

// ============================================================================
// Async Supabase functions (Supabase only, no local fallback)
// ============================================================================

pub async fn save_run_async(run: &JobRun) -> CmdResult<()> {
    let client = supabase::get_client().await?;
    let db_run = RunRow::from(run);
    client
        .insert::<_, serde_json::Value>("scheduler_runs", &db_run)
        .await?;
    Ok(())
}

pub async fn load_runs_async(
    job_id: Option<&str>,
    limit: usize,
) -> CmdResult<Vec<JobRun>> {
    let client = supabase::get_client().await?;
    let mut query = format!("order=started_at.desc&limit={}", limit);
    if let Some(jid) = job_id {
        query = format!("job_id=eq.{}&{}", jid, query);
    }
    let rows: Vec<RunRow> = client.select("scheduler_runs", &query).await?;
    Ok(rows.into_iter().map(JobRun::from).collect())
}

pub async fn load_run_async(run_id: &str) -> CmdResult<JobRun> {
    let client = supabase::get_client().await?;
    let query = format!("id=eq.{}", run_id);
    let row = client
        .select_single::<RunRow>("scheduler_runs", &query)
        .await?
        .ok_or_else(|| CommandError::NotFound(format!("Run {} not found", run_id)))?;
    Ok(JobRun::from(row))
}

// ============================================================================
// Run Steps (per-turn token breakdown)
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
struct StepRow {
    run_id: String,
    turn_number: i32,
    input_tokens: i64,
    output_tokens: i64,
    cache_read_tokens: i64,
    cache_creation_tokens: i64,
    tools: Vec<String>,
    tool_details: serde_json::Value,
    stop_reason: String,
}

impl StepRow {
    fn from_step(run_id: &str, step: &RunStep) -> Self {
        StepRow {
            run_id: run_id.to_string(),
            turn_number: step.turn_number as i32,
            input_tokens: step.input_tokens as i64,
            output_tokens: step.output_tokens as i64,
            cache_read_tokens: step.cache_read_tokens as i64,
            cache_creation_tokens: step.cache_creation_tokens as i64,
            tools: step.tools.clone(),
            tool_details: serde_json::to_value(&step.tool_details).unwrap_or_default(),
            stop_reason: step.stop_reason.clone(),
        }
    }

    fn into_step(self) -> RunStep {
        let tool_details: Vec<ToolDetail> = serde_json::from_value(self.tool_details)
            .unwrap_or_default();
        RunStep {
            turn_number: self.turn_number as u32,
            input_tokens: self.input_tokens as u64,
            output_tokens: self.output_tokens as u64,
            cache_read_tokens: self.cache_read_tokens as u64,
            cache_creation_tokens: self.cache_creation_tokens as u64,
            tools: self.tools,
            tool_details,
            stop_reason: self.stop_reason,
        }
    }
}

pub async fn save_run_steps_async(run_id: &str, steps: &[RunStep]) -> CmdResult<()> {
    if steps.is_empty() {
        return Ok(());
    }
    let client = supabase::get_client().await?;
    let rows: Vec<StepRow> = steps.iter().map(|s| StepRow::from_step(run_id, s)).collect();
    client
        .insert::<_, serde_json::Value>("scheduler_run_steps", &rows)
        .await?;
    Ok(())
}

pub async fn load_run_steps_async(run_id: &str) -> CmdResult<Vec<RunStep>> {
    let client = supabase::get_client().await?;
    let query = format!("run_id=eq.{}&order=turn_number.asc", run_id);
    let rows: Vec<StepRow> = client.select("scheduler_run_steps", &query).await?;
    Ok(rows.into_iter().map(StepRow::into_step).collect())
}
