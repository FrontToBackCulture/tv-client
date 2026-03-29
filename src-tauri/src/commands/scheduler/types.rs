use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum RunStatus {
    Running,
    Success,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum RunTrigger {
    Scheduled,
    Manual,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: String,
    pub name: String,
    pub skill_prompt: String,
    pub cron_expression: Option<String>,  // None = ad-hoc only
    pub model: String,
    pub max_budget: Option<f64>,
    pub allowed_tools: Vec<String>,
    pub slack_webhook_url: Option<String>,
    pub slack_channel_name: Option<String>,
    pub enabled: bool,
    #[serde(default = "default_true")]
    pub generate_report: bool,
    #[serde(default)]
    pub report_prefix: Option<String>,
    #[serde(default)]
    pub skill_refs: Option<Vec<SkillRef>>,
    #[serde(default)]
    pub bot_path: Option<String>,
    #[serde(default)]
    pub sod_reports_folder: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_run_at: Option<DateTime<Utc>>,
    pub last_run_status: Option<RunStatus>,
}

/// Backward-compatible alias
pub type SchedulerJob = Job;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobRun {
    pub id: String,
    pub job_id: String,
    pub job_name: String,
    pub started_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
    pub duration_secs: Option<f64>,
    pub status: RunStatus,
    pub output: String,
    pub output_preview: String,
    pub error: Option<String>,
    pub slack_posted: bool,
    pub trigger: RunTrigger,
    #[serde(default)]
    pub cost_usd: Option<f64>,
    #[serde(default)]
    pub input_tokens: Option<u64>,
    #[serde(default)]
    pub output_tokens: Option<u64>,
    #[serde(default)]
    pub cache_read_tokens: Option<u64>,
    #[serde(default)]
    pub cache_creation_tokens: Option<u64>,
    #[serde(default)]
    pub num_turns: Option<u32>,
}

/// Per-turn step data parsed from session JSONL
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunStep {
    pub turn_number: u32,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_creation_tokens: u64,
    pub tools: Vec<String>,
    pub tool_details: Vec<ToolDetail>,
    pub stop_reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDetail {
    pub name: String,
    pub target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillRef {
    pub bot: String,
    pub slug: String,
    pub title: String,
}

/// Input for creating/updating a job (no id, timestamps auto-set)
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobInput {
    pub name: String,
    pub skill_prompt: String,
    pub cron_expression: Option<String>,  // None = ad-hoc only
    pub model: Option<String>,
    pub max_budget: Option<f64>,
    pub allowed_tools: Option<Vec<String>>,
    pub slack_webhook_url: Option<String>,
    pub slack_channel_name: Option<String>,
    pub enabled: Option<bool>,
    pub generate_report: Option<bool>,
    pub report_prefix: Option<String>,
    pub skill_refs: Option<Vec<SkillRef>>,
    pub bot_path: Option<String>,
    pub sod_reports_folder: Option<String>,
}

fn default_true() -> bool { true }

/// Overall scheduler status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchedulerStatus {
    pub total_jobs: usize,
    pub enabled_jobs: usize,
    pub running_jobs: usize,
    pub last_check_at: Option<DateTime<Utc>>,
}
