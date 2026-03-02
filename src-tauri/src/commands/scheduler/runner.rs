// Job execution — spawn claude -p, capture output, save reports, post to Slack

use std::collections::HashMap;
use std::sync::Mutex;

use chrono::Utc;
use once_cell::sync::Lazy;
use tauri::{Emitter, Manager};

use super::storage;
use super::types::*;

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
pub fn stop_job(run_id: &str) -> Result<(), String> {
    let mut map = RUNNING_PROCESSES.lock().unwrap();
    if let Some(pid) = map.remove(run_id) {
        eprintln!("[scheduler] Stopping job run {} (PID {})", run_id, pid);
        // Kill the claude process directly; it will clean up its own children
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }
        Ok(())
    } else {
        Err("No running process found for this run".into())
    }
}

/// Execute a scheduler job. Saves run history and emits events.
pub async fn execute_job(
    job: &SchedulerJob,
    run_id: &str,
    trigger: RunTrigger,
    app_handle: &tauri::AppHandle,
) {
    let started_at = Utc::now();

    // Create initial run record
    let mut run = JobRun {
        id: run_id.to_string(),
        job_id: job.id.clone(),
        job_name: job.name.clone(),
        started_at,
        finished_at: None,
        duration_secs: None,
        status: RunStatus::Running,
        output: String::new(),
        output_preview: String::new(),
        error: None,
        slack_posted: false,
        trigger,
        cost_usd: None,
        input_tokens: None,
        output_tokens: None,
        cache_read_tokens: None,
        cache_creation_tokens: None,
        num_turns: None,
    };

    // Update job status to Running
    if let Ok(mut jobs) = storage::load_jobs() {
        if let Some(j) = jobs.iter_mut().find(|j| j.id == job.id) {
            j.last_run_status = Some(RunStatus::Running);
            j.last_run_at = Some(started_at);
            let _ = storage::save_jobs(&jobs);
        }
    }

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

    // Run claude
    emit_progress("Running claude...");
    let result = run_claude(job, &knowledge_path, run_id).await;

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
            run.error = Some(err);
        }
    }

    run.finished_at = Some(finished_at);
    run.duration_secs = Some(duration);

    // Post-processing: save reports, upload to S3, post to Slack
    if run.status == RunStatus::Success {
        let date_str = finished_at.format("%Y-%m-%d").to_string();
        let mut report_url: Option<String> = None;

        if job.generate_report {
            // Look for skill-generated HTML report (written by Claude during skill execution)
            emit_progress("Looking for HTML report...");
            let prefix = job.report_prefix.as_deref().unwrap_or("sod");
            let report_filename = format!("{}-{}.html", prefix, date_str);

            let skill_report_path = std::path::Path::new(&knowledge_path)
                .join("0_Platform/sod-reports")
                .join(&report_filename);
            if skill_report_path.exists() {
                if let Ok(html) = std::fs::read_to_string(&skill_report_path) {
                    if !html.is_empty() {
                        emit_progress("Uploading report to S3...");
                        match upload_html_to_s3(prefix, &date_str, &html).await {
                            Ok(url) => {
                                eprintln!("[scheduler] Report uploaded: {}", url);
                                report_url = Some(url);
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

        // Post to Slack
        if let Some(webhook) = &job.slack_webhook_url {
            if !webhook.is_empty() {
                emit_progress("Posting to Slack...");
                match post_to_slack(webhook, &job.name, &run.output, report_url.as_deref()).await {
                    Ok(_) => {
                        run.slack_posted = true;
                        eprintln!("[scheduler] Slack posted for job {}", job.name);
                    }
                    Err(e) => {
                        eprintln!("[scheduler] Slack post failed: {}", e);
                    }
                }
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
    if let Ok(mut jobs) = storage::load_jobs() {
        if let Some(j) = jobs.iter_mut().find(|j| j.id == job.id) {
            j.last_run_status = Some(run.status.clone());
            j.last_run_at = Some(finished_at);
            j.updated_at = Utc::now();
            let _ = storage::save_jobs(&jobs);
        }
    }

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
            "slackPosted": run.slack_posted,
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

/// Spawn `claude -p` with JSON output format to capture both result text and cost
async fn run_claude(job: &SchedulerJob, knowledge_path: &str, run_id: &str) -> Result<ClaudeOutput, String> {
    use tokio::process::Command;
    use std::process::Stdio;

    let mut cmd = Command::new("claude");
    cmd.arg("-p");
    cmd.arg("--model").arg(&job.model);
    cmd.arg("--output-format").arg("json");

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
    let working_dir = job.bot_path.as_deref().unwrap_or(knowledge_path);
    cmd.current_dir(working_dir);

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

    let mut child = cmd
        .spawn()
        .map_err(|e| {
            let err = format!("Failed to spawn claude: {}. Is claude CLI installed?", e);
            let _ = std::fs::write("/tmp/scheduler-debug.log", format!("{}\nSPAWN ERROR: {}", debug_msg, err));
            err
        })?;

    // Track PID for stop_job()
    if let Some(pid) = child.id() {
        RUNNING_PROCESSES.lock().unwrap().insert(run_id.to_string(), pid);
    }

    if let Some(mut stdin) = child.stdin.take() {
        use tokio::io::AsyncWriteExt;
        let _ = stdin.write_all(job.skill_prompt.as_bytes()).await;
        let _ = stdin.shutdown().await;
    }

    let output = child
        .wait_with_output()
        .await
        .map_err(|e| format!("Failed to wait for claude: {}", e))?;

    // Remove from tracking once finished
    RUNNING_PROCESSES.lock().unwrap().remove(run_id);

    // Debug: log exit status
    let debug_exit = format!(
        "EXIT: code={:?} stdout_len={} stderr_len={}\nstderr_head: {}",
        output.status.code(),
        output.stdout.len(),
        output.stderr.len(),
        String::from_utf8_lossy(&output.stderr).chars().take(500).collect::<String>(),
    );
    let _ = std::fs::OpenOptions::new().append(true).open("/tmp/scheduler-debug.log")
        .and_then(|mut f| { use std::io::Write; writeln!(f, "{}", debug_exit) });

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        if stdout.trim().is_empty() {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            if !stderr.trim().is_empty() {
                return Ok(ClaudeOutput { text: stderr, cost_usd: None, session_id: None, num_turns: None });
            }
            return Ok(ClaudeOutput { text: "(no output)".to_string(), cost_usd: None, session_id: None, num_turns: None });
        }

        // Parse JSON output from claude CLI
        match serde_json::from_str::<serde_json::Value>(&stdout) {
            Ok(json) => {
                let text = json.get("result")
                    .and_then(|v| v.as_str())
                    .unwrap_or(&stdout)
                    .to_string();
                let cost_usd = json.get("cost_usd")
                    .and_then(|v| v.as_f64())
                    .or_else(|| json.get("total_cost_usd").and_then(|v| v.as_f64()));
                let session_id = json.get("session_id")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let num_turns = json.get("num_turns")
                    .and_then(|v| v.as_u64())
                    .map(|n| n as u32);
                eprintln!("[scheduler] Claude cost: {:?}, session: {:?}, turns: {:?}", cost_usd, session_id, num_turns);
                Ok(ClaudeOutput { text, cost_usd, session_id, num_turns })
            }
            Err(_) => {
                eprintln!("[scheduler] Failed to parse claude JSON output, using raw text");
                Ok(ClaudeOutput { text: stdout, cost_usd: None, session_id: None, num_turns: None })
            }
        }
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        Err(format!(
            "claude exited with code {:?}\nstdout: {}\nstderr: {}",
            output.status.code(),
            stdout.chars().take(1000).collect::<String>(),
            stderr.chars().take(1000).collect::<String>(),
        ))
    }
}

// ============================================================================
// S3 upload
// ============================================================================

async fn upload_html_to_s3(prefix: &str, date_str: &str, html: &str) -> Result<String, String> {
    let settings = crate::commands::settings::load_settings()
        .map_err(|e| format!("Failed to load settings: {}", e))?;

    let access_key = settings.keys.get("aws_access_key_id")
        .ok_or_else(|| "AWS Access Key ID not configured. Go to Settings to add it.".to_string())?;
    let secret_key = settings.keys.get("aws_secret_access_key")
        .ok_or_else(|| "AWS Secret Access Key not configured. Go to Settings to add it.".to_string())?;

    // Write HTML to a temp file
    let tmp_path = std::env::temp_dir().join(format!("{}-report-{}.html", prefix, date_str));
    std::fs::write(&tmp_path, html)
        .map_err(|e| format!("Failed to write temp HTML: {}", e))?;

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
        .map_err(|e| format!("Failed to run aws CLI: {}. Is aws CLI installed?", e))?;

    // Clean up temp file
    let _ = std::fs::remove_file(&tmp_path);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("aws s3 cp failed: {}", stderr.trim()));
    }

    // Return public URL
    let url = format!("https://{}.s3.{}.amazonaws.com/{}", S3_BUCKET, S3_REGION, s3_key);
    Ok(url)
}

// ============================================================================
// Slack posting
// ============================================================================

/// Post a short summary + report link to Slack
async fn post_to_slack(
    webhook_url: &str,
    job_name: &str,
    output: &str,
    report_url: Option<&str>,
) -> Result<(), String> {
    let summary = extract_summary(output);

    let mut blocks = vec![
        serde_json::json!({
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": format!("⏰ {}", job_name),
            }
        }),
        serde_json::json!({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": summary,
            }
        }),
    ];

    // Add report link button if available
    if let Some(url) = report_url {
        blocks.push(serde_json::json!({
            "type": "actions",
            "elements": [{
                "type": "button",
                "text": {
                    "type": "plain_text",
                    "text": "📄 View Full Report",
                },
                "url": url,
                "style": "primary",
            }]
        }));
    }

    let payload = serde_json::json!({ "blocks": blocks });

    let client = reqwest::Client::new();
    let resp = client
        .post(webhook_url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Slack request failed: {}", e))?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Slack returned {}: {}", status, body));
    }

    Ok(())
}

/// Extract a short summary from the SOD report output for Slack.
/// Converts markdown tables and formatting into clean Slack mrkdwn.
fn extract_summary(output: &str) -> String {
    let mut summary_lines: Vec<String> = Vec::new();
    let mut in_summary = false;
    let mut found_summary = false;

    for line in output.lines() {
        let trimmed = line.trim();

        // Look for any "Summary" heading (##, ###, #, or bold)
        if trimmed == "## Summary" || trimmed == "### Summary"
            || trimmed == "# Summary" || trimmed == "**Summary**"
            || trimmed == "Summary"
        {
            in_summary = true;
            found_summary = true;
            continue;
        }

        // Stop at next heading (any level)
        if in_summary && !trimmed.is_empty() && trimmed.starts_with('#') {
            break;
        }

        if in_summary && !trimmed.is_empty() {
            // Skip markdown table separator rows (|---|---|)
            if trimmed.contains("---") && trimmed.starts_with('|') {
                continue;
            }
            // Skip horizontal rules
            if trimmed == "---" || trimmed == "***" || trimmed == "___" {
                continue;
            }

            // Convert markdown table rows to "Key: Value" lines
            if trimmed.starts_with('|') && trimmed.ends_with('|') {
                let cells: Vec<&str> = trimmed
                    .trim_matches('|')
                    .split('|')
                    .map(|c| c.trim())
                    .collect();
                if cells.len() == 2 {
                    // Two-column table: "Key: Value"
                    let key = cells[0].replace("**", "*");
                    let val = cells[1].replace("**", "*");
                    summary_lines.push(format!("• *{}:* {}", key, val));
                } else if cells.len() > 2 {
                    // Multi-column: join with " | "
                    let joined = cells.iter()
                        .map(|c| c.replace("**", "*"))
                        .collect::<Vec<_>>()
                        .join(" | ");
                    summary_lines.push(joined);
                }
                continue;
            }

            // Regular line: convert **bold** → *bold* for Slack
            let slack_line = trimmed.replace("**", "*");
            summary_lines.push(slack_line);
        }
    }

    if !found_summary || summary_lines.is_empty() {
        // Fallback: take first 500 chars, strip markdown artifacts
        let preview: String = output
            .lines()
            .filter(|l| {
                let t = l.trim();
                !t.is_empty() && !t.starts_with('#') && t != "---"
                    && !t.starts_with("I now have")
                    && !t.starts_with("Let me")
            })
            .take(15)
            .collect::<Vec<_>>()
            .join("\n");
        return preview.replace("**", "*");
    }

    // Truncate to Slack's 3000 char limit for section text
    let result = summary_lines.join("\n");
    if result.len() > 2800 {
        format!("{}...", &result[..2800])
    } else {
        result
    }
}

// ============================================================================
// Token usage parsing from Claude session JSONL
// ============================================================================

/// Parse token usage from a Claude session JSONL file.
/// Searches ~/.claude/projects/ for the session file and sums all assistant message usage.
fn parse_session_tokens(session_id: &str) -> Result<TokenUsage, String> {
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
fn parse_session_steps(session_id: &str) -> Result<Vec<RunStep>, String> {
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
fn read_session_file(session_id: &str) -> Result<String, String> {
    let claude_dir = dirs::home_dir()
        .ok_or_else(|| "No home directory".to_string())?
        .join(".claude/projects");

    if !claude_dir.exists() {
        return Err("~/.claude/projects/ does not exist".to_string());
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

    let path = session_path.ok_or_else(|| format!("Session file {} not found", filename))?;
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {}", path.display(), e))
}

// ============================================================================
// Helpers
// ============================================================================

