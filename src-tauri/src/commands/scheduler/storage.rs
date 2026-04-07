use serde::{Deserialize, Serialize};

use super::action::ActionConfig;
use super::types::{AutomationConfig, Job, JobRun, LoopConfig, RunStatus, RunStep, RunTrigger, ToolDetail};
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
// Unified Automation loading (reads automations + automation_nodes directly)
// ============================================================================

#[derive(Debug, Deserialize)]
struct AutomationRow {
    id: String,
    name: String,
    enabled: bool,
    cron_expression: Option<String>,
    active_hours: Option<String>,
    generate_report: Option<bool>,
    report_prefix: Option<String>,
    sod_reports_folder: Option<String>,
    last_run_at: Option<String>,
    last_run_status: Option<String>,
}

/// Load all enabled automations, assembling config from automation_nodes.
pub async fn load_automations_async() -> CmdResult<Vec<AutomationConfig>> {
    let client = supabase::get_client().await?;

    // Load all enabled automations
    let rows: Vec<AutomationRow> = client
        .select("automations", "enabled=eq.true&order=created_at.asc")
        .await?;

    if rows.is_empty() {
        return Ok(vec![]);
    }

    // Load ALL nodes for enabled automations in one query
    let auto_ids: Vec<&str> = rows.iter().map(|r| r.id.as_str()).collect();
    let ids_filter = format!("automation_id=in.({})", auto_ids.join(","));
    let all_nodes: Vec<AutomationNodeRow> = client
        .select("automation_nodes", &ids_filter)
        .await?;

    let mut configs = vec![];
    for row in rows {
        // Find nodes for this automation
        let nodes: Vec<&AutomationNodeRow> = all_nodes
            .iter()
            .filter(|n| n.automation_id == row.id)
            .collect();

        // Extract configs from nodes
        let mut model = "sonnet".to_string();
        let mut bot_path: Option<String> = None;
        let mut additional_instructions: Option<String> = None;
        let mut cron = row.cron_expression.clone();
        let mut active_hours = row.active_hours.clone();
        let mut loop_config: Option<LoopConfig> = None;
        let mut aggregation_instructions: Option<String> = None;

        for node in &nodes {
            match node.node_type.as_str() {
                "trigger" => {
                    // Override cron from trigger node if set
                    if let Some(c) = node.config.get("cron_expression").and_then(|v| v.as_str()) {
                        cron = Some(c.to_string());
                    }
                    if let Some(h) = node.config.get("active_hours").and_then(|v| v.as_str()) {
                        active_hours = Some(h.to_string());
                    }
                }
                "ai_process" => {
                    if let Some(m) = node.config.get("model").and_then(|v| v.as_str()) {
                        model = m.to_string();
                    }
                    bot_path = node.config.get("bot_path").and_then(|v| v.as_str()).map(|s| s.to_string());
                    additional_instructions = node.config.get("additional_instructions")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                        .or_else(|| node.config.get("system_prompt").and_then(|v| v.as_str()).map(|s| s.to_string()));
                }
                "loop" => {
                    loop_config = serde_json::from_value::<LoopConfig>(node.config.clone()).ok();
                }
                "output" => {
                    aggregation_instructions = node.config.get("aggregation_instructions")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                }
                _ => {}
            }
        }

        use chrono::{DateTime, Utc};
        let last_run_at = row.last_run_at
            .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
            .map(|t| t.with_timezone(&Utc));

        configs.push(AutomationConfig {
            id: row.id,
            name: row.name,
            enabled: row.enabled,
            cron_expression: cron,
            active_hours,
            model,
            bot_path,
            additional_instructions,
            loop_config,
            aggregation_instructions,
            generate_report: row.generate_report.unwrap_or(false),
            report_prefix: row.report_prefix,
            sod_reports_folder: row.sod_reports_folder,
            last_run_at,
            last_run_status: row.last_run_status.as_deref().map(|s| match s {
                "success" => RunStatus::Success,
                "failed" => RunStatus::Failed,
                _ => RunStatus::Running,
            }),
        });
    }

    Ok(configs)
}

/// Load a single automation config by ID.
pub async fn load_automation_async(id: &str) -> CmdResult<AutomationConfig> {
    let client = supabase::get_client().await?;

    let row = client
        .select_single::<AutomationRow>("automations", &format!("id=eq.{}", id))
        .await?
        .ok_or_else(|| CommandError::NotFound(format!("Automation {} not found", id)))?;

    let nodes: Vec<AutomationNodeRow> = client
        .select("automation_nodes", &format!("automation_id=eq.{}", id))
        .await?;

    let mut model = "sonnet".to_string();
    let mut bot_path: Option<String> = None;
    let mut additional_instructions: Option<String> = None;
    let mut cron = row.cron_expression.clone();
    let mut active_hours = row.active_hours.clone();
    let mut loop_config: Option<LoopConfig> = None;
    let mut aggregation_instructions: Option<String> = None;

    for node in &nodes {
        match node.node_type.as_str() {
            "trigger" => {
                if let Some(c) = node.config.get("cron_expression").and_then(|v| v.as_str()) {
                    cron = Some(c.to_string());
                }
                if let Some(h) = node.config.get("active_hours").and_then(|v| v.as_str()) {
                    active_hours = Some(h.to_string());
                }
            }
            "ai_process" => {
                if let Some(m) = node.config.get("model").and_then(|v| v.as_str()) {
                    model = m.to_string();
                }
                bot_path = node.config.get("bot_path").and_then(|v| v.as_str()).map(|s| s.to_string());
                additional_instructions = node.config.get("additional_instructions")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .or_else(|| node.config.get("system_prompt").and_then(|v| v.as_str()).map(|s| s.to_string()));
            }
            "loop" => {
                loop_config = serde_json::from_value::<LoopConfig>(node.config.clone()).ok();
            }
            "output" => {
                aggregation_instructions = node.config.get("aggregation_instructions")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
            }
            _ => {}
        }
    }

    use chrono::{DateTime, Utc};
    let last_run_at = row.last_run_at
        .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
        .map(|t| t.with_timezone(&Utc));

    Ok(AutomationConfig {
        id: row.id,
        name: row.name,
        enabled: row.enabled,
        cron_expression: cron,
        active_hours,
        model,
        bot_path,
        additional_instructions,
        loop_config,
        aggregation_instructions,
        generate_report: row.generate_report.unwrap_or(false),
        report_prefix: row.report_prefix,
        sod_reports_folder: row.sod_reports_folder,
        last_run_at,
        last_run_status: row.last_run_status.as_deref().map(|s| match s {
            "success" => RunStatus::Success,
            "failed" => RunStatus::Failed,
            _ => RunStatus::Running,
        }),
    })
}

/// Update run status directly on the automations table.
pub async fn update_automation_run_status(
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
        .update::<_, serde_json::Value>("automations", &format!("id=eq.{}", id), &data)
        .await?;
    Ok(())
}

/// Load data source SQL queries for an automation's data_source node.
/// Reads custom_source_ids from the data_source node, then fetches the SQL from custom_data_sources.
pub async fn load_data_source_queries(automation_id: &str) -> CmdResult<Vec<String>> {
    let client = supabase::get_client().await?;
    let query = format!("automation_id=eq.{}&node_type=eq.data_source", automation_id);
    let nodes: Vec<AutomationNodeRow> = client.select("automation_nodes", &query).await?;

    let mut source_ids: Vec<String> = vec![];
    for node in &nodes {
        if let Some(ids) = node.config.get("custom_source_ids").and_then(|v| v.as_array()) {
            for id in ids {
                if let Some(s) = id.as_str() {
                    source_ids.push(s.to_string());
                }
            }
        }
    }

    if source_ids.is_empty() {
        return Ok(vec![]);
    }

    #[derive(Debug, Deserialize)]
    struct DataSourceRow {
        sql_query: String,
    }

    let ids_filter = format!("id=in.({})", source_ids.join(","));
    let rows: Vec<DataSourceRow> = client.select("custom_data_sources", &ids_filter).await?;
    Ok(rows.into_iter().map(|r| r.sql_query).collect())
}

/// Load action configs for an automation (by automation ID directly).
pub async fn load_action_configs_for_automation(automation_id: &str) -> CmdResult<Vec<ActionConfig>> {
    let client = supabase::get_client().await?;
    let query = format!("automation_id=eq.{}&node_type=eq.action", automation_id);
    let nodes: Vec<AutomationNodeRow> = client.select("automation_nodes", &query).await?;

    let mut configs = vec![];
    for node in nodes {
        if let Ok(config) = serde_json::from_value::<ActionConfig>(node.config) {
            configs.push(config);
        }
    }
    Ok(configs)
}

// ============================================================================
// Jobs CRUD (Supabase) — DEPRECATED: kept for backward compatibility
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

/// Reset any jobs and automations stuck in "running" status back to "failed".
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
        // Also reset automations stuck in "running" (same issue)
        let _: serde_json::Value = client
            .update("automations", "last_run_status=eq.running", &data)
            .await?;
        Ok::<(), CommandError>(())
    }.await {
        Ok(_) => eprintln!("[scheduler] Reset stale running jobs + automations"),
        Err(e) => eprintln!("[scheduler] Failed to reset running jobs: {}", e),
    }
}

// ============================================================================
// Action node loading (from automation_nodes graph)
// ============================================================================

#[derive(Debug, Deserialize)]
struct AutomationNodeRow {
    #[allow(dead_code)]
    id: String,
    #[allow(dead_code)]
    automation_id: String,
    node_type: String,
    config: serde_json::Value,
}

/// Load ActionConfig(s) for a job by finding its automation and action nodes.
pub async fn load_action_configs_for_job(job_id: &str) -> CmdResult<Vec<ActionConfig>> {
    let client = supabase::get_client().await?;

    // Find the automation that references this job
    let query = format!("job_id=eq.{}&select=id", job_id);
    let automations: Vec<serde_json::Value> = client.select("automations", &query).await?;

    let automation_id = match automations.first() {
        Some(a) => a.get("id").and_then(|v| v.as_str()).unwrap_or(""),
        None => return Ok(vec![]),
    };

    if automation_id.is_empty() {
        return Ok(vec![]);
    }

    // Load action nodes for this automation
    let query = format!("automation_id=eq.{}&node_type=eq.action", automation_id);
    let nodes: Vec<AutomationNodeRow> = client.select("automation_nodes", &query).await?;

    let mut configs = vec![];
    for node in nodes {
        if node.node_type == "action" {
            if let Ok(config) = serde_json::from_value::<ActionConfig>(node.config) {
                configs.push(config);
            }
        }
    }

    Ok(configs)
}

// ============================================================================
// Run history (renamed tables: job_runs, job_run_steps)
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
struct RunRow {
    id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    job_id: Option<String>,
    job_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    automation_id: Option<String>,
    started_at: String,
    finished_at: Option<String>,
    duration_secs: Option<f64>,
    status: String,
    output: Option<String>,
    output_preview: Option<String>,
    error: Option<String>,
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
        // If automation_id is set, don't send job_id (FK constraint to jobs table would fail)
        let job_id = if run.automation_id.is_some() {
            None
        } else if run.job_id.is_empty() {
            None
        } else {
            Some(run.job_id.clone())
        };
        RunRow {
            id: run.id.clone(),
            job_id,
            job_name: run.job_name.clone(),
            automation_id: run.automation_id.clone(),
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
            job_id: row.job_id.unwrap_or_default(),
            job_name: row.job_name,
            automation_id: row.automation_id,
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
