use serde::{Deserialize, Serialize};

use super::types::{Job, JobRun, RunStatus, RunStep, RunTrigger, ToolDetail};
use crate::commands::error::{CmdResult, CommandError};
use crate::commands::supabase;

// ============================================================================
// Supabase row types (snake_case for Postgres columns)
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct JobRow {
    pub id: String,
    pub name: String,
    pub skill_prompt: String,
    pub cron_expression: Option<String>,
    pub model: String,
    pub max_budget: Option<f64>,
    pub allowed_tools: Vec<String>,
    pub slack_webhook_url: Option<String>,
    pub slack_channel_name: Option<String>,
    pub enabled: bool,
    pub generate_report: bool,
    pub report_prefix: Option<String>,
    pub skill_refs: Option<serde_json::Value>,
    pub bot_path: Option<String>,
    pub sod_reports_folder: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub last_run_at: Option<String>,
    pub last_run_status: Option<String>,
}

impl From<&Job> for JobRow {
    fn from(job: &Job) -> Self {
        JobRow {
            id: job.id.clone(),
            name: job.name.clone(),
            skill_prompt: job.skill_prompt.clone(),
            cron_expression: job.cron_expression.clone(),
            model: job.model.clone(),
            max_budget: job.max_budget,
            allowed_tools: job.allowed_tools.clone(),
            slack_webhook_url: job.slack_webhook_url.clone(),
            slack_channel_name: job.slack_channel_name.clone(),
            enabled: job.enabled,
            generate_report: job.generate_report,
            report_prefix: job.report_prefix.clone(),
            skill_refs: job.skill_refs.as_ref().map(|refs| serde_json::to_value(refs).unwrap_or_default()),
            bot_path: job.bot_path.clone(),
            sod_reports_folder: job.sod_reports_folder.clone(),
            created_at: job.created_at.to_rfc3339(),
            updated_at: job.updated_at.to_rfc3339(),
            last_run_at: job.last_run_at.map(|t| t.to_rfc3339()),
            last_run_status: job.last_run_status.as_ref().map(|s| match s {
                RunStatus::Running => "running",
                RunStatus::Success => "success",
                RunStatus::Failed => "failed",
            }.to_string()),
        }
    }
}

impl From<JobRow> for Job {
    fn from(row: JobRow) -> Self {
        use chrono::{DateTime, Utc};
        use super::types::SkillRef;

        let created_at = DateTime::parse_from_rfc3339(&row.created_at)
            .map(|t| t.with_timezone(&Utc))
            .unwrap_or_else(|_| Utc::now());
        let updated_at = DateTime::parse_from_rfc3339(&row.updated_at)
            .map(|t| t.with_timezone(&Utc))
            .unwrap_or_else(|_| Utc::now());
        let last_run_at = row.last_run_at
            .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
            .map(|t| t.with_timezone(&Utc));

        Job {
            id: row.id,
            name: row.name,
            skill_prompt: row.skill_prompt,
            cron_expression: row.cron_expression,
            model: row.model,
            max_budget: row.max_budget,
            allowed_tools: row.allowed_tools,
            slack_webhook_url: row.slack_webhook_url,
            slack_channel_name: row.slack_channel_name,
            enabled: row.enabled,
            generate_report: row.generate_report,
            report_prefix: row.report_prefix,
            skill_refs: row.skill_refs.and_then(|v| serde_json::from_value::<Vec<SkillRef>>(v).ok()),
            bot_path: row.bot_path,
            sod_reports_folder: row.sod_reports_folder,
            created_at,
            updated_at,
            last_run_at,
            last_run_status: row.last_run_status.as_deref().map(|s| match s {
                "success" => RunStatus::Success,
                "failed" => RunStatus::Failed,
                _ => RunStatus::Running,
            }),
        }
    }
}

// ============================================================================
// Jobs CRUD (Supabase)
// ============================================================================

pub async fn load_jobs_async() -> CmdResult<Vec<Job>> {
    let client = supabase::get_client().await?;
    let rows: Vec<JobRow> = client.select("jobs", "order=created_at.asc").await?;
    Ok(rows.into_iter().map(Job::from).collect())
}

pub async fn load_job_async(id: &str) -> CmdResult<Job> {
    let client = supabase::get_client().await?;
    let query = format!("id=eq.{}", id);
    let row = client
        .select_single::<JobRow>("jobs", &query)
        .await?
        .ok_or_else(|| CommandError::NotFound(format!("Job {} not found", id)))?;
    Ok(Job::from(row))
}

pub async fn save_job_async(job: &Job) -> CmdResult<()> {
    let client = supabase::get_client().await?;
    let row = JobRow::from(job);
    client
        .upsert_on::<_, serde_json::Value>("jobs", &row, Some("id"))
        .await?;
    Ok(())
}

pub async fn delete_job_async(id: &str) -> CmdResult<()> {
    let client = supabase::get_client().await?;
    client.delete("jobs", &format!("id=eq.{}", id)).await
}

pub async fn update_job_run_status(
    id: &str,
    status: &RunStatus,
    ran_at: chrono::DateTime<chrono::Utc>,
) -> CmdResult<()> {
    let client = supabase::get_client().await?;
    let status_str = match status {
        RunStatus::Running => "running",
        RunStatus::Success => "success",
        RunStatus::Failed => "failed",
    };
    let data = serde_json::json!({
        "last_run_status": status_str,
        "last_run_at": ran_at.to_rfc3339(),
        "updated_at": chrono::Utc::now().to_rfc3339(),
    });
    client
        .update::<_, serde_json::Value>("jobs", &format!("id=eq.{}", id), &data)
        .await?;
    Ok(())
}

/// Reset any jobs stuck in "running" status back to "failed".
/// Called on app startup to clean up stale state from killed processes.
pub async fn reset_running_jobs_async() {
    match async {
        let client = supabase::get_client().await?;
        let data = serde_json::json!({
            "last_run_status": "failed",
            "updated_at": chrono::Utc::now().to_rfc3339(),
        });
        // Update all jobs where last_run_status = running
        let _: serde_json::Value = client
            .update("jobs", "last_run_status=eq.running", &data)
            .await?;
        Ok::<(), CommandError>(())
    }.await {
        Ok(_) => eprintln!("[scheduler] Reset stale running jobs"),
        Err(e) => eprintln!("[scheduler] Failed to reset running jobs: {}", e),
    }
}

// ============================================================================
// Run history (renamed tables: job_runs, job_run_steps)
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

pub async fn save_run_async(run: &JobRun) -> CmdResult<()> {
    let client = supabase::get_client().await?;
    let db_run = RunRow::from(run);
    client
        .upsert_on::<_, serde_json::Value>("job_runs", &db_run, Some("id"))
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
    let rows: Vec<RunRow> = client.select("job_runs", &query).await?;
    Ok(rows.into_iter().map(JobRun::from).collect())
}

pub async fn load_run_async(run_id: &str) -> CmdResult<JobRun> {
    let client = supabase::get_client().await?;
    let query = format!("id=eq.{}", run_id);
    let row = client
        .select_single::<RunRow>("job_runs", &query)
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
        .insert::<_, serde_json::Value>("job_run_steps", &rows)
        .await?;
    Ok(())
}

pub async fn load_run_steps_async(run_id: &str) -> CmdResult<Vec<RunStep>> {
    let client = supabase::get_client().await?;
    let query = format!("run_id=eq.{}&order=turn_number.asc", run_id);
    let rows: Vec<StepRow> = client.select("job_run_steps", &query).await?;
    Ok(rows.into_iter().map(StepRow::into_step).collect())
}
