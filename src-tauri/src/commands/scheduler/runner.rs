// Job execution — spawn claude -p, capture output, save reports

use std::collections::HashMap;
use std::sync::Mutex;

use chrono::Utc;
use once_cell::sync::Lazy;
use tauri::{Emitter, Manager};

use super::storage;
use super::types::*;
use crate::commands::error::{CmdResult, CommandError};

const S3_BUCKET: &str = "signalval";
const S3_REGION: &str = "ap-southeast-1";
const S3_REPORT_PREFIX: &str = "sod-reports";

// ============================================================================
// Running process tracking (for stop_job)
// ============================================================================

/// Maps run_id → OS PID so we can kill running jobs from the UI.
static RUNNING_PROCESSES: Lazy<Mutex<HashMap<String, u32>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// Stop a running job by killing its process tree.
pub fn stop_job(run_id: &str) -> CmdResult<()> {
    let mut map = RUNNING_PROCESSES.lock().map_err(|e| CommandError::Internal(format!("Lock error: {}", e)))?;
    if let Some(pid) = map.remove(run_id) {
        eprintln!("[scheduler] Stopping job run {} (PID {})", run_id, pid);
        // Kill the claude process directly; it will clean up its own children
        #[cfg(unix)]
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }
        #[cfg(windows)]
        {
            let _ = std::process::Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .output();
        }
        Ok(())
    } else {
        Err(CommandError::NotFound("No running process found for this run".to_string()))
    }
}

/// Execute a scheduler job. Saves run history and emits events.
pub async fn execute_job(
    job: &SchedulerJob,
    run_id: &str,
    trigger: RunTrigger,
    app_handle: &tauri::AppHandle,
    default_reports_folder: &str,
) {
    execute_job_inner(job, run_id, trigger, app_handle, default_reports_folder, None).await;
}

async fn execute_job_inner(
    job: &SchedulerJob,
    run_id: &str,
    trigger: RunTrigger,
    app_handle: &tauri::AppHandle,
    default_reports_folder: &str,
    automation_id: Option<String>,
) {
    let started_at = Utc::now();

    // For automation runs, don't set job_id (FK constraint to jobs table)
    let job_id_for_run = if automation_id.is_some() {
        String::new()
    } else {
        job.id.clone()
    };

    // Create initial run record
    let mut run = JobRun {
        id: run_id.to_string(),
        job_id: job_id_for_run,
        job_name: job.name.clone(),
        automation_id,
        started_at,
        finished_at: None,
        duration_secs: None,
        status: RunStatus::Running,
        output: String::new(),
        output_preview: String::new(),
        error: None,
        trigger,
        cost_usd: None,
        input_tokens: None,
        output_tokens: None,
        cache_read_tokens: None,
        cache_creation_tokens: None,
        num_turns: None,
    };

    // Update job status to Running
    let _ = storage::update_job_run_status(&job.id, &RunStatus::Running, started_at).await;

    // Helper to emit progress updates
    let emit_progress = |step: &str| {
        let _ = app_handle.emit(
            "scheduler:job-progress",
            serde_json::json!({
                "jobId": job.id,
                "runId": run_id,
                "step": step,
            }),
        );
    };

    // Emit started event
    let _ = app_handle.emit(
        "scheduler:job-started",
        serde_json::json!({
            "jobId": job.id,
            "runId": run_id,
            "jobName": job.name,
        }),
    );

    // Resolve knowledge path from app state
    let knowledge_path = app_handle
        .state::<crate::AppState>()
        .knowledge_path
        .clone();

    // Execute Action nodes (if any) before running Claude
    let mut action_context = String::new();
    // Load action configs — try by automation_id directly, fall back to job_id lookup
    let action_configs_result = match storage::load_action_configs_for_automation(&job.id).await {
        Ok(configs) if !configs.is_empty() => Ok(configs),
        _ => storage::load_action_configs_for_job(&job.id).await,
    };
    match action_configs_result {
        Ok(action_configs) if !action_configs.is_empty() => {
            emit_progress("Executing action nodes...");
            for (i, config) in action_configs.iter().enumerate() {
                let _ = app_handle.emit(
                    "claude-stream",
                    serde_json::json!({
                        "run_id": run_id,
                        "event_type": "tool_use",
                        "content": format!("Action {}: {} on {}.{}", i + 1, config.operation, config.target_schema, config.target_table),
                        "metadata": { "tool": "action" },
                    }),
                );
                match super::action::execute_action(config).await {
                    Ok(result) => {
                        action_context.push_str(&format!(
                            "\n## Action {} Result\n- Operation: {}\n- Target: {}.{}\n- {}\n",
                            i + 1, config.operation, config.target_schema, config.target_table, result.summary
                        ));
                        if !result.errors.is_empty() {
                            action_context.push_str(&format!("- Errors: {}\n", result.errors.join("; ")));
                        }
                        if !result.source_data.is_empty() {
                            if let Ok(json_str) = serde_json::to_string_pretty(&result.source_data) {
                                action_context.push_str(&format!("- Data:\n```json\n{}\n```\n", json_str));
                            }
                        }
                        let _ = app_handle.emit(
                            "claude-stream",
                            serde_json::json!({
                                "run_id": run_id,
                                "event_type": "text",
                                "content": result.summary,
                                "metadata": null,
                            }),
                        );
                    }
                    Err(e) => {
                        action_context.push_str(&format!("\n## Action {} Failed\n- Error: {}\n", i + 1, e));
                        eprintln!("[scheduler] Action {} failed: {}", i + 1, e);
                    }
                }
            }
        }
        _ => {} // No action nodes or failed to load — proceed without
    }

    // Build modified job with action context prepended to skill_prompt
    let effective_job = if !action_context.is_empty() {
        let mut modified = job.clone();
        modified.skill_prompt = format!(
            "{}\n\n---\n\n# Action Results (pre-executed)\n\nThe following data operations were already executed before this prompt:\n{}\n\nPlease summarize what happened above in your response.",
            job.skill_prompt, action_context
        );
        modified
    } else {
        job.clone()
    };

    // Run claude
    emit_progress("Running claude...");
    let result = run_claude(&effective_job, &knowledge_path, run_id, app_handle).await;

    let finished_at = Utc::now();
    let duration = (finished_at - started_at).num_milliseconds() as f64 / 1000.0;

    let mut run_steps: Option<Vec<RunStep>> = None;

    match result {
        Ok(claude_output) => {
            run.status = RunStatus::Success;
            run.output_preview = claude_output.text.chars().take(500).collect();
            run.output = claude_output.text;
            run.cost_usd = claude_output.cost_usd;
            run.num_turns = claude_output.num_turns;

            // Parse token usage from session JSONL file
            if let Some(ref sid) = claude_output.session_id {
                match parse_session_tokens(sid) {
                    Ok(usage) => {
                        run.input_tokens = Some(usage.input_tokens);
                        run.output_tokens = Some(usage.output_tokens);
                        run.cache_read_tokens = Some(usage.cache_read_tokens);
                        run.cache_creation_tokens = Some(usage.cache_creation_tokens);
                        eprintln!(
                            "[scheduler] Tokens — in: {}, out: {}, cache_read: {}, cache_create: {}",
                            usage.input_tokens, usage.output_tokens,
                            usage.cache_read_tokens, usage.cache_creation_tokens
                        );
                    }
                    Err(e) => {
                        eprintln!("[scheduler] Failed to parse session tokens: {}", e);
                    }
                }

                // Parse per-turn steps
                match parse_session_steps(sid) {
                    Ok(steps) => {
                        eprintln!("[scheduler] Parsed {} steps from session", steps.len());
                        run_steps = Some(steps);
                    }
                    Err(e) => {
                        eprintln!("[scheduler] Failed to parse session steps: {}", e);
                    }
                }
            }
        }
        Err(err) => {
            run.status = RunStatus::Failed;
            run.error = Some(err.to_string());
        }
    }

    run.finished_at = Some(finished_at);
    run.duration_secs = Some(duration);

    // Post-processing: save reports, upload to S3
    if run.status == RunStatus::Success {
        let date_str = finished_at.format("%Y-%m-%d").to_string();

        if job.generate_report {
            // Look for skill-generated HTML report (written by Claude during skill execution)
            emit_progress("Looking for HTML report...");
            let prefix = job.report_prefix.as_deref().unwrap_or("sod");
            let report_filename = format!("{}-{}.html", prefix, date_str);

            let reports_folder = job.sod_reports_folder.as_deref().unwrap_or(default_reports_folder);
            let skill_report_path = std::path::Path::new(&knowledge_path)
                .join(reports_folder)
                .join(&report_filename);
            if skill_report_path.exists() {
                if let Ok(html) = std::fs::read_to_string(&skill_report_path) {
                    if !html.is_empty() {
                        emit_progress("Uploading report to S3...");
                        match upload_html_to_s3(prefix, &date_str, &html).await {
                            Ok(url) => {
                                eprintln!("[scheduler] Report uploaded: {}", url);
                            }
                            Err(e) => {
                                eprintln!("[scheduler] S3 upload failed: {}", e);
                            }
                        }
                    }
                }
            } else {
                eprintln!("[scheduler] No HTML report found at {:?}, skipping S3 upload", skill_report_path);
            }
        }
    }

    // Save run history (Supabase with local fallback)
    let _ = storage::save_run_async(&run).await;

    // Save per-turn steps if available
    if let Some(ref steps) = run_steps {
        if let Err(e) = storage::save_run_steps_async(&run.id, steps).await {
            eprintln!("[scheduler] Failed to save run steps: {}", e);
        }
    }

    // Update job status
    let _ = storage::update_job_run_status(&job.id, &run.status, finished_at).await;

    // Emit completed event
    let _ = app_handle.emit(
        "scheduler:job-completed",
        serde_json::json!({
            "jobId": job.id,
            "runId": run.id,
            "jobName": job.name,
            "status": run.status,
            "durationSecs": run.duration_secs,
            "outputPreview": run.output_preview,
            "error": run.error,
        }),
    );
}

// ============================================================================
// Unified automation execution (reads from automations + automation_nodes)
// ============================================================================

/// Execute an automation using its config assembled from automation_nodes.
pub async fn execute_automation(
    config: &AutomationConfig,
    run_id: &str,
    trigger: RunTrigger,
    app_handle: &tauri::AppHandle,
    default_reports_folder: &str,
) {
    let started_at = Utc::now();

    // Update automation status to Running
    let _ = storage::update_automation_run_status(&config.id, &RunStatus::Running, started_at).await;

    // Check if this automation has a loop node
    let debug_msg = format!("[scheduler] execute_automation: id={}, loop_config={:?}\n", config.id, config.loop_config);
    eprintln!("{}", debug_msg);
    let _ = std::fs::write("/tmp/scheduler-loop-debug.log", &debug_msg);
    if let Some(ref loop_cfg) = config.loop_config {
        let loop_msg = format!("[scheduler] Taking LOOP path: mode={}, item_variable={}\n", loop_cfg.mode, loop_cfg.item_variable);
        eprintln!("{}", loop_msg);
        let _ = std::fs::write("/tmp/scheduler-loop-debug.log", format!("{}{}", debug_msg, loop_msg));
        execute_automation_with_loop(config, loop_cfg, run_id, trigger, app_handle, default_reports_folder).await;
    } else {
        let _ = std::fs::write("/tmp/scheduler-loop-debug.log", format!("{}NON-LOOP path\n", debug_msg));
        // No loop — run as before (single Claude invocation)
        let job = automation_to_job(config);
        execute_job_inner(&job, run_id, trigger, app_handle, default_reports_folder, Some(config.id.clone())).await;
    }

    // Update automation status from the run result
    let final_status = match storage::load_run_async(run_id).await {
        Ok(run) => (run.status, run.finished_at.unwrap_or(Utc::now())),
        Err(e) => {
            eprintln!("[scheduler] Failed to load run {} for status update: {}", run_id, e);
            (RunStatus::Failed, Utc::now())
        }
    };
    let _ = storage::update_automation_run_status(&config.id, &final_status.0, final_status.1).await;
}

/// Convert AutomationConfig to a temporary SchedulerJob for the execute pipeline.
fn automation_to_job(config: &AutomationConfig) -> SchedulerJob {
    SchedulerJob {
        id: config.id.clone(),
        name: config.name.clone(),
        skill_prompt: config.additional_instructions.clone().unwrap_or_default(),
        cron_expression: config.cron_expression.clone(),
        model: config.model.clone(),
        max_budget: None,
        allowed_tools: vec![],
        enabled: config.enabled,
        generate_report: config.generate_report,
        report_prefix: config.report_prefix.clone(),
        skill_refs: None,
        bot_path: config.bot_path.clone(),
        sod_reports_folder: config.sod_reports_folder.clone(),
        created_at: Utc::now(),
        updated_at: Utc::now(),
        last_run_at: config.last_run_at,
        last_run_status: config.last_run_status.clone(),
    }
}

/// Execute an automation with a loop node — runs Claude once per record from the data source.
async fn execute_automation_with_loop(
    config: &AutomationConfig,
    loop_cfg: &super::types::LoopConfig,
    run_id: &str,
    trigger: RunTrigger,
    app_handle: &tauri::AppHandle,
    _default_reports_folder: &str,
) {
    let started_at = Utc::now();
    let base_prompt = config.additional_instructions.clone().unwrap_or_default();
    let item_var = &loop_cfg.item_variable;

    // Create the parent run record
    let mut run = JobRun {
        id: run_id.to_string(),
        job_id: String::new(),
        job_name: config.name.clone(),
        automation_id: Some(config.id.clone()),
        started_at,
        finished_at: None,
        duration_secs: None,
        status: RunStatus::Running,
        output: String::new(),
        output_preview: String::new(),
        error: None,
        trigger,
        cost_usd: None,
        input_tokens: None,
        output_tokens: None,
        cache_read_tokens: None,
        cache_creation_tokens: None,
        num_turns: None,
    };

    let _ = app_handle.emit(
        "scheduler:job-started",
        serde_json::json!({
            "jobId": config.id,
            "runId": run_id,
            "jobName": config.name,
        }),
    );

    // Step 1: Fetch records from data source node's custom SQL queries
    let mut records: Vec<serde_json::Value> = vec![];
    let _ = app_handle.emit(
        "claude-stream",
        serde_json::json!({
            "run_id": run_id,
            "event_type": "text",
            "content": "Fetching data source records...",
            "metadata": null,
        }),
    );

    match storage::load_data_source_queries(&config.id).await {
        Ok(queries) if !queries.is_empty() => {
            for query in &queries {
                match super::action::execute_source_query_public(query).await {
                    Ok(rows) => {
                        let _ = app_handle.emit(
                            "claude-stream",
                            serde_json::json!({
                                "run_id": run_id,
                                "event_type": "text",
                                "content": format!("Data source returned {} record(s)", rows.len()),
                                "metadata": null,
                            }),
                        );
                        records.extend(rows);
                    }
                    Err(e) => {
                        eprintln!("[scheduler] Data source query failed: {}", e);
                        run.status = RunStatus::Failed;
                        run.error = Some(format!("Data source query failed: {}", e));
                        run.finished_at = Some(Utc::now());
                        run.duration_secs = Some((Utc::now() - started_at).num_milliseconds() as f64 / 1000.0);
                        let _ = storage::save_run_async(&run).await;
                        return;
                    }
                }
            }
        }
        _ => {
            run.status = RunStatus::Failed;
            run.error = Some("Loop automation requires a data source node with custom SQL queries".to_string());
            run.finished_at = Some(Utc::now());
            run.duration_secs = Some((Utc::now() - started_at).num_milliseconds() as f64 / 1000.0);
            let _ = storage::save_run_async(&run).await;
            return;
        }
    }

    if records.is_empty() {
        let _ = app_handle.emit(
            "claude-stream",
            serde_json::json!({
                "run_id": run_id,
                "event_type": "text",
                "content": "No records found from data source. Nothing to process.",
                "metadata": null,
            }),
        );
        run.status = RunStatus::Success;
        run.output = "No records to process.".to_string();
        run.output_preview = run.output.clone();
        run.finished_at = Some(Utc::now());
        run.duration_secs = Some((Utc::now() - started_at).num_milliseconds() as f64 / 1000.0);
        let _ = storage::save_run_async(&run).await;
        return;
    }

    let total = records.len();
    let _ = app_handle.emit(
        "claude-stream",
        serde_json::json!({
            "run_id": run_id,
            "event_type": "text",
            "content": format!("Loop: processing {} record(s) sequentially...\n", total),
            "metadata": null,
        }),
    );

    // Step 2: Iterate over records, run Claude once per record
    let knowledge_path = app_handle
        .state::<crate::AppState>()
        .knowledge_path
        .clone();

    let mut all_outputs: Vec<String> = vec![];
    let mut total_cost: f64 = 0.0;
    let mut total_input_tokens: u64 = 0;
    let mut total_output_tokens: u64 = 0;
    let mut total_cache_read: u64 = 0;
    let mut total_cache_create: u64 = 0;
    let mut total_turns: u32 = 0;
    let mut had_error = false;

    for (i, record) in records.iter().enumerate() {
        let record_json = serde_json::to_string_pretty(record).unwrap_or_default();
        let iteration_prompt = format!(
            "{}\n\n---\n\n# Current {item_var} (iteration {idx}/{total})\n\n```json\n{record}\n```",
            base_prompt,
            item_var = item_var,
            idx = i + 1,
            total = total,
            record = record_json,
        );

        let _ = app_handle.emit(
            "claude-stream",
            serde_json::json!({
                "run_id": run_id,
                "event_type": "text",
                "content": format!("\n---\n## Iteration {}/{}\n", i + 1, total),
                "metadata": null,
            }),
        );

        let iter_job = SchedulerJob {
            id: config.id.clone(),
            name: format!("{} [{}/{}]", config.name, i + 1, total),
            skill_prompt: iteration_prompt,
            cron_expression: None,
            model: config.model.clone(),
            max_budget: None,
            allowed_tools: vec![],
            enabled: true,
            generate_report: false,
            report_prefix: None,
            skill_refs: None,
            bot_path: config.bot_path.clone(),
            sod_reports_folder: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            last_run_at: None,
            last_run_status: None,
        };

        match run_claude(&iter_job, &knowledge_path, run_id, app_handle).await {
            Ok(output) => {
                all_outputs.push(format!("### Iteration {}/{}\n{}", i + 1, total, output.text));
                if let Some(cost) = output.cost_usd { total_cost += cost; }
                if let Some(turns) = output.num_turns { total_turns += turns; }

                // Parse token usage for this iteration
                if let Some(ref sid) = output.session_id {
                    if let Ok(usage) = parse_session_tokens(sid) {
                        total_input_tokens += usage.input_tokens;
                        total_output_tokens += usage.output_tokens;
                        total_cache_read += usage.cache_read_tokens;
                        total_cache_create += usage.cache_creation_tokens;
                    }
                }
            }
            Err(e) => {
                all_outputs.push(format!("### Iteration {}/{}\nERROR: {}", i + 1, total, e));
                eprintln!("[scheduler] Loop iteration {}/{} failed: {}", i + 1, total, e);
                had_error = true;
                // Continue to next record — don't abort the whole loop
            }
        }
    }

    // Step 3: Aggregate results — optionally run a final Claude call to summarize
    let combined_output = all_outputs.join("\n\n");

    let final_output = if let Some(ref agg_instructions) = config.aggregation_instructions {
        let _ = app_handle.emit(
            "claude-stream",
            serde_json::json!({
                "run_id": run_id,
                "event_type": "text",
                "content": "\n---\n## Aggregating results...\n",
                "metadata": null,
            }),
        );

        let agg_prompt = format!(
            "{}\n\n---\n\n# Raw iteration outputs\n\n{}\n",
            agg_instructions, combined_output,
        );

        let agg_job = SchedulerJob {
            id: config.id.clone(),
            name: format!("{} [summary]", config.name),
            skill_prompt: agg_prompt,
            cron_expression: None,
            model: config.model.clone(),
            max_budget: None,
            allowed_tools: vec![],
            enabled: true,
            generate_report: false,
            report_prefix: None,
            skill_refs: None,
            bot_path: config.bot_path.clone(),
            sod_reports_folder: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            last_run_at: None,
            last_run_status: None,
        };

        match run_claude(&agg_job, &knowledge_path, run_id, app_handle).await {
            Ok(output) => {
                if let Some(cost) = output.cost_usd { total_cost += cost; }
                if let Some(turns) = output.num_turns { total_turns += turns; }
                if let Some(ref sid) = output.session_id {
                    if let Ok(usage) = parse_session_tokens(sid) {
                        total_input_tokens += usage.input_tokens;
                        total_output_tokens += usage.output_tokens;
                        total_cache_read += usage.cache_read_tokens;
                        total_cache_create += usage.cache_creation_tokens;
                    }
                }
                output.text
            }
            Err(e) => {
                eprintln!("[scheduler] Aggregation Claude call failed: {}", e);
                format!("{}\n\n---\n\n*Aggregation failed: {}*", combined_output, e)
            }
        }
    } else {
        combined_output
    };

    let finished_at = Utc::now();
    let duration = (finished_at - started_at).num_milliseconds() as f64 / 1000.0;
    run.status = if had_error { RunStatus::Failed } else { RunStatus::Success };
    run.output = final_output.clone();
    run.output_preview = final_output.chars().take(500).collect();
    run.finished_at = Some(finished_at);
    run.duration_secs = Some(duration);
    run.cost_usd = Some(total_cost);
    run.input_tokens = Some(total_input_tokens);
    run.output_tokens = Some(total_output_tokens);
    run.cache_read_tokens = Some(total_cache_read);
    run.cache_creation_tokens = Some(total_cache_create);
    run.num_turns = Some(total_turns);

    let _ = storage::save_run_async(&run).await;

    let _ = app_handle.emit(
        "scheduler:job-completed",
        serde_json::json!({
            "jobId": config.id,
            "runId": run.id,
            "jobName": config.name,
            "status": run.status,
            "durationSecs": run.duration_secs,
            "outputPreview": run.output_preview,
            "error": run.error,
        }),
    );
}

// ============================================================================
// Claude CLI
// ============================================================================

struct ClaudeOutput {
    text: String,
    cost_usd: Option<f64>,
    session_id: Option<String>,
    num_turns: Option<u32>,
}

struct TokenUsage {
    input_tokens: u64,
    output_tokens: u64,
    cache_read_tokens: u64,
    cache_creation_tokens: u64,
}

/// Spawn `claude -p` with stream-json output, emitting `claude-stream` events for live UI.
async fn run_claude(job: &SchedulerJob, knowledge_path: &str, run_id: &str, app_handle: &tauri::AppHandle) -> Result<ClaudeOutput, CommandError> {
    use tokio::process::Command;
    use tokio::io::{AsyncBufReadExt, BufReader};
    use std::process::Stdio;

    let mut cmd = Command::new("claude");
    cmd.arg("-p");
    cmd.arg("--model").arg(&job.model);
    cmd.arg("--output-format").arg("stream-json");
    cmd.arg("--verbose");

    if let Some(budget) = job.max_budget {
        cmd.arg("--max-turns").arg(format!("{}", (budget * 10.0) as u32));
    }

    if !job.allowed_tools.is_empty() {
        cmd.arg("--allowedTools").arg(job.allowed_tools.join(","));
    }

    // Load MCP servers from ~/.claude/mcp.json if it exists.
    // In pipe mode (-p), claude doesn't auto-load MCP configs without this flag.
    let home = dirs::home_dir().unwrap_or_default();
    let mcp_config = home.join(".claude/mcp.json");
    if mcp_config.exists() {
        cmd.arg("--mcp-config").arg(&mcp_config);
    }

    // Use bot_path as working directory if set, otherwise fall back to knowledge_path.
    // Running from the bot folder ensures the Claude session picks up the bot's
    // CLAUDE.md, .claude/settings.local.json (pre-approved tools), and MCP context.
    let working_dir = match job.bot_path.as_deref() {
        Some(bp) => {
            let p = std::path::Path::new(bp);
            if p.is_relative() {
                std::path::Path::new(knowledge_path).join(bp).to_string_lossy().to_string()
            } else {
                bp.to_string()
            }
        }
        None => knowledge_path.to_string(),
    };
    cmd.current_dir(&working_dir);

    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    // Debug: log the command we're about to run
    let debug_msg = format!(
        "[scheduler] Spawning claude for job: {} in dir: {} with PATH: {:?}\n",
        job.name, working_dir, std::env::var("PATH").unwrap_or_default()
    );
    eprintln!("{}", debug_msg);
    let _ = std::fs::write("/tmp/scheduler-debug.log", &debug_msg);

    // Emit init event to open the console drawer
    let _ = app_handle.emit(
        "claude-stream",
        serde_json::json!({
            "run_id": run_id,
            "event_type": "init",
            "content": format!("Starting {} ({})...", job.name, job.model),
            "metadata": null,
        }),
    );

    let mut child = cmd
        .spawn()
        .map_err(|e| {
            let err = format!("Failed to spawn claude: {}. Is claude CLI installed?", e);
            let _ = std::fs::write("/tmp/scheduler-debug.log", format!("{}\nSPAWN ERROR: {}", debug_msg, err));
            CommandError::Io(err)
        })?;

    // Track PID for stop_job()
    if let Some(pid) = child.id() {
        if let Ok(mut map) = RUNNING_PROCESSES.lock() {
            map.insert(run_id.to_string(), pid);
        }
    }

    if let Some(mut stdin) = child.stdin.take() {
        use tokio::io::AsyncWriteExt;
        let _ = stdin.write_all(job.skill_prompt.as_bytes()).await;
        let _ = stdin.shutdown().await;
    }

    let stdout = child.stdout.take()
        .ok_or_else(|| CommandError::Internal("Failed to capture stdout".to_string()))?;

    let mut reader = BufReader::new(stdout).lines();
    let mut final_result = String::new();
    let mut session_id: Option<String> = None;
    let mut cost_usd: Option<f64> = None;
    let mut num_turns: Option<u32> = None;
    let mut is_error = false;
    // Track emitted content block IDs to deduplicate — stream-json can emit
    // the same assistant message content blocks in both streaming and final events.
    let mut emitted_block_ids: std::collections::HashSet<String> = std::collections::HashSet::new();

    while let Some(line) = reader.next_line().await.unwrap_or(None) {
        if line.trim().is_empty() {
            continue;
        }

        let parsed: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let event_type = parsed.get("type").and_then(|t| t.as_str()).unwrap_or("").to_string();

        match event_type.as_str() {
            "system" => {
                let subtype = parsed.get("subtype").and_then(|s| s.as_str()).unwrap_or("");
                if subtype == "init" {
                    session_id = parsed.get("session_id").and_then(|s| s.as_str()).map(|s| s.to_string());
                }
            }
            "assistant" => {
                if let Some(content) = parsed.pointer("/message/content").and_then(|c| c.as_array()) {
                    for block in content {
                        // Deduplicate: each block has a unique "id" field.
                        // stream-json emits the same blocks in streaming + final message events.
                        if let Some(block_id) = block.get("id").and_then(|id| id.as_str()) {
                            if !emitted_block_ids.insert(block_id.to_string()) {
                                continue; // Already emitted this block
                            }
                        }
                        let block_type = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
                        match block_type {
                            "text" => {
                                let text = block.get("text").and_then(|t| t.as_str()).unwrap_or("");
                                if !text.is_empty() {
                                    let _ = app_handle.emit(
                                        "claude-stream",
                                        serde_json::json!({
                                            "run_id": run_id,
                                            "event_type": "text",
                                            "content": text,
                                            "metadata": null,
                                        }),
                                    );
                                }
                            }
                            "tool_use" => {
                                let tool_name = block.get("name").and_then(|n| n.as_str()).unwrap_or("unknown");
                                let input = block.get("input");
                                let description = match tool_name {
                                    "Read" | "read_file" => {
                                        let path = input.and_then(|i| i.get("file_path")).and_then(|p| p.as_str()).unwrap_or("");
                                        let short = path.rsplit('/').next().unwrap_or(path);
                                        format!("Reading: {}", short)
                                    }
                                    "Write" | "write_file" => {
                                        let path = input.and_then(|i| i.get("file_path")).and_then(|p| p.as_str()).unwrap_or("");
                                        let short = path.rsplit('/').next().unwrap_or(path);
                                        format!("Writing: {}", short)
                                    }
                                    "Edit" | "edit_file" => {
                                        let path = input.and_then(|i| i.get("file_path")).and_then(|p| p.as_str()).unwrap_or("");
                                        let short = path.rsplit('/').next().unwrap_or(path);
                                        format!("Editing: {}", short)
                                    }
                                    "Glob" => {
                                        let pattern = input.and_then(|i| i.get("pattern")).and_then(|p| p.as_str()).unwrap_or("");
                                        format!("Glob: {}", pattern)
                                    }
                                    "Grep" => {
                                        let pattern = input.and_then(|i| i.get("pattern")).and_then(|p| p.as_str()).unwrap_or("");
                                        format!("Grep: {}", pattern)
                                    }
                                    "Bash" => {
                                        let cmd = input.and_then(|i| i.get("command")).and_then(|c| c.as_str()).unwrap_or("");
                                        let short = if cmd.len() > 80 { format!("{}...", &cmd[..80]) } else { cmd.to_string() };
                                        format!("$ {}", short)
                                    }
                                    "WebSearch" => {
                                        let query = input.and_then(|i| i.get("query")).and_then(|q| q.as_str()).unwrap_or("");
                                        format!("Searching: {}", query)
                                    }
                                    "WebFetch" => {
                                        let url = input.and_then(|i| i.get("url")).and_then(|u| u.as_str()).unwrap_or("");
                                        let short = if url.len() > 80 { format!("{}...", &url[..80]) } else { url.to_string() };
                                        format!("Fetching: {}", short)
                                    }
                                    n if n.contains("execute-val-sql") || n.contains("execute_sql") => {
                                        let sql = input.and_then(|i| i.get("sql").or_else(|| i.get("query"))).and_then(|s| s.as_str()).unwrap_or("");
                                        let short_sql = if sql.len() > 120 { format!("{}...", &sql[..120]) } else { sql.to_string() };
                                        format!("SQL: {}", short_sql)
                                    }
                                    n if n.starts_with("mcp__") => {
                                        // Show the MCP tool short name + first meaningful arg
                                        let short_name = n.rsplit("__").next().unwrap_or(n);
                                        let arg = input.and_then(|i| {
                                            i.get("name").or_else(|| i.get("query")).or_else(|| i.get("slug")).or_else(|| i.get("title"))
                                        }).and_then(|v| v.as_str()).unwrap_or("");
                                        if arg.is_empty() { format!("MCP: {}", short_name) } else { format!("MCP: {} — {}", short_name, arg) }
                                    }
                                    _ => format!("Using tool: {}", tool_name),
                                };
                                let _ = app_handle.emit(
                                    "claude-stream",
                                    serde_json::json!({
                                        "run_id": run_id,
                                        "event_type": "tool_use",
                                        "content": description,
                                        "metadata": { "tool": tool_name },
                                    }),
                                );
                            }
                            "tool_result" => {
                                let result_content = block.get("content").map(|c| {
                                    if let Some(s) = c.as_str() { s.to_string() } else { c.to_string() }
                                }).unwrap_or_default();
                                let truncated = if result_content.len() > 500 {
                                    format!("{}...", &result_content[..500])
                                } else {
                                    result_content
                                };
                                let _ = app_handle.emit(
                                    "claude-stream",
                                    serde_json::json!({
                                        "run_id": run_id,
                                        "event_type": "tool_result",
                                        "content": truncated,
                                        "metadata": null,
                                    }),
                                );
                            }
                            _ => {}
                        }
                    }
                }
            }
            "result" => {
                final_result = parsed.get("result").and_then(|r| r.as_str()).unwrap_or("").to_string();
                is_error = parsed.get("is_error").and_then(|e| e.as_bool()).unwrap_or(false);
                cost_usd = parsed.get("total_cost_usd").and_then(|c| c.as_f64());
                num_turns = parsed.get("num_turns").and_then(|n| n.as_u64()).map(|n| n as u32);
                session_id = parsed.get("session_id").and_then(|s| s.as_str()).map(|s| s.to_string());

                let _ = app_handle.emit(
                    "claude-stream",
                    serde_json::json!({
                        "run_id": run_id,
                        "event_type": "result",
                        "content": final_result,
                        "metadata": { "is_error": is_error, "cost_usd": cost_usd },
                    }),
                );
            }
            _ => {}
        }
    }

    // Wait for process to finish
    let status = child.wait().await
        .map_err(|e| CommandError::Io(format!("Failed to wait for claude: {}", e)))?;

    // Remove from tracking once finished
    if let Ok(mut map) = RUNNING_PROCESSES.lock() {
        map.remove(run_id);
    }

    eprintln!("[scheduler] Claude finished: status={:?}, cost={:?}, session={:?}, turns={:?}", status.code(), cost_usd, session_id, num_turns);

    if status.success() || !final_result.is_empty() {
        if final_result.is_empty() {
            final_result = "(no output)".to_string();
        }
        Ok(ClaudeOutput { text: final_result, cost_usd, session_id, num_turns })
    } else if is_error {
        Err(CommandError::Internal(final_result))
    } else {
        Err(CommandError::Internal(format!("claude exited with code {:?}", status.code())))
    }
}

// ============================================================================
// S3 upload
// ============================================================================

async fn upload_html_to_s3(prefix: &str, date_str: &str, html: &str) -> Result<String, CommandError> {
    let settings = crate::commands::settings::load_settings()
        .map_err(|e| CommandError::Config(format!("Failed to load settings: {}", e)))?;

    let access_key = settings.keys.get("aws_access_key_id")
        .ok_or_else(|| CommandError::Config("AWS Access Key ID not configured. Go to Settings to add it.".to_string()))?;
    let secret_key = settings.keys.get("aws_secret_access_key")
        .ok_or_else(|| CommandError::Config("AWS Secret Access Key not configured. Go to Settings to add it.".to_string()))?;

    // Write HTML to a temp file
    let tmp_path = std::env::temp_dir().join(format!("{}-report-{}.html", prefix, date_str));
    std::fs::write(&tmp_path, html)?;

    let s3_key = format!("{}/{}-{}.html", S3_REPORT_PREFIX, prefix, date_str);
    let s3_dest = format!("s3://{}/{}", S3_BUCKET, s3_key);

    let output = tokio::process::Command::new("aws")
        .args([
            "s3", "cp",
            &tmp_path.to_string_lossy(),
            &s3_dest,
            "--region", S3_REGION,
            "--content-type", "text/html",
            "--cache-control", "public, max-age=86400",
        ])
        .env("AWS_ACCESS_KEY_ID", access_key)
        .env("AWS_SECRET_ACCESS_KEY", secret_key)
        .output()
        .await
        .map_err(|e| CommandError::Io(format!("Failed to run aws CLI: {}. Is aws CLI installed?", e)))?;

    // Clean up temp file
    let _ = std::fs::remove_file(&tmp_path);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(CommandError::Internal(format!("aws s3 cp failed: {}", stderr.trim())));
    }

    // Return public URL
    let url = format!("https://{}.s3.{}.amazonaws.com/{}", S3_BUCKET, S3_REGION, s3_key);
    Ok(url)
}

// ============================================================================
// Token usage parsing from Claude session JSONL
// ============================================================================

/// Parse token usage from a Claude session JSONL file.
/// Searches ~/.claude/projects/ for the session file and sums all assistant message usage.
fn parse_session_tokens(session_id: &str) -> Result<TokenUsage, CommandError> {
    let content = read_session_file(session_id)?;

    let mut usage = TokenUsage {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
    };

    for line in content.lines() {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(line) {
            if val.get("type").and_then(|t| t.as_str()) != Some("assistant") {
                continue;
            }
            if let Some(u) = val.pointer("/message/usage") {
                usage.input_tokens += u.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
                usage.output_tokens += u.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
                usage.cache_read_tokens += u.get("cache_read_input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
                usage.cache_creation_tokens += u.get("cache_creation_input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
            }
        }
    }

    Ok(usage)
}

// ============================================================================
// Per-turn step parsing from Claude session JSONL
// ============================================================================

/// Parse per-turn step data from a Claude session JSONL file.
/// Each assistant message becomes one step with token usage and tool info.
fn parse_session_steps(session_id: &str) -> Result<Vec<RunStep>, CommandError> {
    let content = read_session_file(session_id)?;

    let mut steps: Vec<RunStep> = Vec::new();
    let mut turn_number: u32 = 0;

    for line in content.lines() {
        let val: serde_json::Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        if val.get("type").and_then(|t| t.as_str()) != Some("assistant") {
            continue;
        }

        turn_number += 1;

        let usage = val.pointer("/message/usage");
        let input_tokens = usage.and_then(|u| u.get("input_tokens")).and_then(|v| v.as_u64()).unwrap_or(0);
        let output_tokens = usage.and_then(|u| u.get("output_tokens")).and_then(|v| v.as_u64()).unwrap_or(0);
        let cache_read_tokens = usage.and_then(|u| u.get("cache_read_input_tokens")).and_then(|v| v.as_u64()).unwrap_or(0);
        let cache_creation_tokens = usage.and_then(|u| u.get("cache_creation_input_tokens")).and_then(|v| v.as_u64()).unwrap_or(0);

        let stop_reason = val.pointer("/message/stop_reason")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();

        // Extract tool_use entries from content
        let mut tools: Vec<String> = Vec::new();
        let mut tool_details: Vec<ToolDetail> = Vec::new();

        if let Some(content_arr) = val.pointer("/message/content").and_then(|c| c.as_array()) {
            for block in content_arr {
                if block.get("type").and_then(|t| t.as_str()) != Some("tool_use") {
                    continue;
                }
                let name = block.get("name").and_then(|n| n.as_str()).unwrap_or("unknown").to_string();
                let target = extract_tool_target(&name, block.get("input"));

                if !tools.contains(&name) {
                    tools.push(name.clone());
                }
                tool_details.push(ToolDetail { name, target });
            }
        }

        steps.push(RunStep {
            turn_number,
            input_tokens,
            output_tokens,
            cache_read_tokens,
            cache_creation_tokens,
            tools,
            tool_details,
            stop_reason,
        });
    }

    Ok(steps)
}

/// Extract a human-readable target from a tool's input args
fn extract_tool_target(tool_name: &str, input: Option<&serde_json::Value>) -> String {
    let input = match input {
        Some(v) => v,
        None => return String::new(),
    };

    // Common patterns for different tools
    match tool_name {
        "Read" | "read_file" => {
            input.get("file_path")
                .or_else(|| input.get("path"))
                .and_then(|v| v.as_str())
                .map(shorten_path)
                .unwrap_or_default()
        }
        "Edit" | "edit_file" => {
            input.get("file_path")
                .or_else(|| input.get("path"))
                .and_then(|v| v.as_str())
                .map(shorten_path)
                .unwrap_or_default()
        }
        "Write" | "write_file" => {
            input.get("file_path")
                .or_else(|| input.get("path"))
                .and_then(|v| v.as_str())
                .map(shorten_path)
                .unwrap_or_default()
        }
        "Glob" | "Grep" => {
            input.get("pattern")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string()
        }
        "Bash" => {
            input.get("command")
                .and_then(|v| v.as_str())
                .map(|c| c.chars().take(80).collect::<String>())
                .unwrap_or_default()
        }
        "Task" => {
            input.get("description")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string()
        }
        _ => {
            // For MCP tools, try common field names
            if tool_name.starts_with("mcp__") {
                input.get("sql")
                    .or_else(|| input.get("query"))
                    .or_else(|| input.get("name"))
                    .or_else(|| input.get("table_id"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.chars().take(100).collect::<String>())
                    .unwrap_or_default()
            } else {
                String::new()
            }
        }
    }
}

/// Shorten a file path to just filename or last 2 segments
fn shorten_path(path: &str) -> String {
    let parts: Vec<&str> = path.split('/').collect();
    if parts.len() <= 2 {
        path.to_string()
    } else {
        parts[parts.len()-2..].join("/")
    }
}

/// Read a session JSONL file by session ID (shared helper)
fn read_session_file(session_id: &str) -> Result<String, CommandError> {
    let claude_dir = dirs::home_dir()
        .ok_or_else(|| CommandError::NotFound("No home directory".to_string()))?
        .join(".claude/projects");

    if !claude_dir.exists() {
        return Err(CommandError::NotFound("~/.claude/projects/ does not exist".to_string()));
    }

    let filename = format!("{}.jsonl", session_id);

    let mut session_path = None;
    if let Ok(entries) = std::fs::read_dir(&claude_dir) {
        for entry in entries.flatten() {
            let candidate = entry.path().join(&filename);
            if candidate.exists() {
                session_path = Some(candidate);
                break;
            }
        }
    }

    let path = session_path.ok_or_else(|| CommandError::NotFound(format!("Session file {} not found", filename)))?;
    std::fs::read_to_string(&path)
        .map_err(|e| CommandError::Io(format!("Failed to read {}: {}", path.display(), e)))
}

// ============================================================================
// Helpers
// ============================================================================

