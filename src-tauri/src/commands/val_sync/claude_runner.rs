// Claude CLI Runner — Spawn claude CLI as subprocess, stream output via Tauri events
//
// Used by the Cleanup tab to run AI-powered tasks like converting calc fields to SQL.
// Streams structured JSON events back to the frontend for live progress updates.

use crate::commands::claude_setup::resolve_claude_path;
use crate::commands::error::{CmdResult, CommandError};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{command, AppHandle, Emitter};

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeRunRequest {
    pub prompt: String,
    pub allowed_tools: Vec<String>,
    pub model: Option<String>,
    pub max_budget_usd: Option<f64>,
    pub cwd: Option<String>,
    /// Resume a previous conversation by session ID (uses `claude --resume`)
    pub resume_session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeRunResult {
    pub session_id: String,
    pub result: String,
    pub is_error: bool,
    pub duration_ms: u64,
    pub cost_usd: f64,
}

/// Events emitted to the frontend during a run
#[derive(Debug, Clone, Serialize)]
pub struct ClaudeStreamEvent {
    pub run_id: String,
    pub event_type: String, // "init", "text", "tool_use", "tool_result", "result", "error"
    pub content: String,
    pub metadata: Option<Value>,
}

// Track active runs for cancellation
fn active_runs() -> &'static Mutex<HashMap<String, Arc<Mutex<bool>>>> {
    static INSTANCE: OnceLock<Mutex<HashMap<String, Arc<Mutex<bool>>>>> = OnceLock::new();
    INSTANCE.get_or_init(|| Mutex::new(HashMap::new()))
}

// ============================================================================
// Command: Run Claude CLI
// ============================================================================

#[command]
pub async fn claude_run(
    app: AppHandle,
    run_id: String,
    request: ClaudeRunRequest,
) -> CmdResult<ClaudeRunResult> {
    let may_retry = request.resume_session_id.is_some();

    // First attempt — suppress result event if we have a resume session (might retry)
    let result = run_claude_process(&app, &run_id, &request, true, may_retry)?;

    // If resume failed because session wasn't found, retry without resume
    if result.is_error && may_retry {
        let errors_hint = result.result.to_lowercase();
        if errors_hint.contains("no conversation found") || errors_hint.contains("session") {
            eprintln!("[claude_run] Resume failed ({}), retrying without --resume", result.result);
            let _ = app.emit(
                "claude-stream",
                ClaudeStreamEvent {
                    run_id: run_id.clone(),
                    event_type: "init".to_string(),
                    content: "Session expired, starting fresh...".to_string(),
                    metadata: None,
                },
            );
            return run_claude_process(&app, &run_id, &request, false, false);
        }
    }

    // First attempt result was suppressed — emit it now (success or non-retryable error)
    if may_retry {
        let _ = app.emit(
            "claude-stream",
            ClaudeStreamEvent {
                run_id: run_id.clone(),
                event_type: "result".to_string(),
                content: result.result.clone(),
                metadata: Some(serde_json::json!({
                    "is_error": result.is_error,
                    "duration_ms": result.duration_ms,
                    "cost_usd": result.cost_usd,
                })),
            },
        );
    }

    Ok(result)
}

/// Inner function that actually spawns and streams the Claude CLI process.
/// When `use_resume` is false, the resume_session_id is ignored (for retry after stale session).
/// When `suppress_result` is true, the "result" event is NOT emitted (caller handles it).
fn run_claude_process(
    app: &AppHandle,
    run_id: &str,
    request: &ClaudeRunRequest,
    use_resume: bool,
    suppress_result: bool,
) -> CmdResult<ClaudeRunResult> {
    let model = request.model.as_deref().unwrap_or("sonnet");

    // Resolve claude binary path — GUI apps may not have PATH set correctly
    let claude_bin = resolve_claude_path();

    // Build command
    let mut cmd = Command::new(&claude_bin);
    cmd.arg("-p")
        .arg(&request.prompt)
        .arg("--output-format")
        .arg("stream-json")
        .arg("--verbose")
        .arg("--model")
        .arg(model)
        .arg("--dangerously-skip-permissions");

    // Resume a previous conversation session (only if use_resume is true)
    if use_resume {
        if let Some(ref sid) = request.resume_session_id {
            if !sid.is_empty() {
                cmd.arg("--resume").arg(sid);
            }
        }
    }

    // Optional budget cap (only relevant for API key users)
    if let Some(budget) = request.max_budget_usd {
        cmd.arg("--max-budget-usd").arg(budget.to_string());
    }

    // Add allowed tools
    if !request.allowed_tools.is_empty() {
        cmd.arg("--allowedTools");
        for tool in &request.allowed_tools {
            cmd.arg(tool);
        }
    }

    // Set working directory
    if let Some(cwd) = &request.cwd {
        cmd.current_dir(cwd);
    }

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    // Track cancellation
    let cancelled = Arc::new(Mutex::new(false));
    {
        let mut runs = active_runs().lock().map_err(|e| CommandError::Internal(e.to_string()))?;
        runs.insert(run_id.to_string(), cancelled.clone());
    }

    // Emit init event
    let _ = app.emit(
        "claude-stream",
        ClaudeStreamEvent {
            run_id: run_id.to_string(),
            event_type: "init".to_string(),
            content: format!("Starting Claude ({})...", model),
            metadata: None,
        },
    );

    // Spawn process
    let mut child = cmd
        .spawn()
        .map_err(|e| CommandError::Internal(format!("Failed to spawn claude CLI ({}): {}. Is it installed?", claude_bin, e)))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| CommandError::Internal("Failed to capture stdout".to_string()))?;

    let reader = BufReader::new(stdout);
    let mut final_result = String::new();
    let mut session_id = String::new();
    let mut duration_ms = 0u64;
    let mut cost_usd = 0.0f64;
    let mut is_error = false;

    for line in reader.lines() {
        // Check cancellation
        if *cancelled.lock().unwrap_or_else(|e| e.into_inner()) {
            let _ = child.kill();
            let _ = app.emit(
                "claude-stream",
                ClaudeStreamEvent {
                    run_id: run_id.to_string(),
                    event_type: "error".to_string(),
                    content: "Run cancelled".to_string(),
                    metadata: None,
                },
            );
            break;
        }

        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };

        if line.trim().is_empty() {
            continue;
        }

        let parsed: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let event_type = parsed
            .get("type")
            .and_then(|t| t.as_str())
            .unwrap_or("")
            .to_string();

        match event_type.as_str() {
            "system" => {
                let subtype = parsed.get("subtype").and_then(|s| s.as_str()).unwrap_or("");
                if subtype == "init" {
                    session_id = parsed
                        .get("session_id")
                        .and_then(|s| s.as_str())
                        .unwrap_or("")
                        .to_string();
                    let _ = app.emit(
                        "claude-stream",
                        ClaudeStreamEvent {
                            run_id: run_id.to_string(),
                            event_type: "init".to_string(),
                            content: "Claude session started".to_string(),
                            metadata: Some(serde_json::json!({ "session_id": session_id })),
                        },
                    );
                }
            }
            "assistant" => {
                if let Some(content) = parsed
                    .get("message")
                    .and_then(|m| m.get("content"))
                    .and_then(|c| c.as_array())
                {
                    for block in content {
                        let block_type = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
                        match block_type {
                            "text" => {
                                let text = block.get("text").and_then(|t| t.as_str()).unwrap_or("");
                                if !text.is_empty() {
                                    let _ = app.emit(
                                        "claude-stream",
                                        ClaudeStreamEvent {
                                            run_id: run_id.to_string(),
                                            event_type: "text".to_string(),
                                            content: text.to_string(),
                                            metadata: None,
                                        },
                                    );
                                }
                            }
                            "tool_use" => {
                                let tool_name = block
                                    .get("name")
                                    .and_then(|n| n.as_str())
                                    .unwrap_or("unknown");
                                let input = block.get("input");

                                let description = match tool_name {
                                    "Read" => {
                                        let path = input
                                            .and_then(|i| i.get("file_path"))
                                            .and_then(|p| p.as_str())
                                            .unwrap_or("");
                                        let short = path.rsplit('/').next().unwrap_or(path);
                                        format!("Reading: {}", short)
                                    }
                                    n if n.contains("execute-val-sql") => {
                                        let sql = input
                                            .and_then(|i| i.get("sql"))
                                            .and_then(|s| s.as_str())
                                            .unwrap_or("");
                                        let domain = input
                                            .and_then(|i| i.get("domain"))
                                            .and_then(|d| d.as_str())
                                            .unwrap_or("");
                                        let short_sql = if sql.len() > 120 { format!("{}...", &sql[..120]) } else { sql.to_string() };
                                        format!("SQL [{}]: {}", domain, short_sql)
                                    }
                                    _ => format!("Using tool: {}", tool_name),
                                };

                                let _ = app.emit(
                                    "claude-stream",
                                    ClaudeStreamEvent {
                                        run_id: run_id.to_string(),
                                        event_type: "tool_use".to_string(),
                                        content: description,
                                        metadata: Some(serde_json::json!({
                                            "tool": tool_name,
                                            "input": input,
                                        })),
                                    },
                                );
                            }
                            "tool_result" => {
                                let result_content = block
                                    .get("content")
                                    .map(|c| {
                                        if let Some(s) = c.as_str() {
                                            s.to_string()
                                        } else {
                                            c.to_string()
                                        }
                                    })
                                    .unwrap_or_default();
                                let truncated = if result_content.len() > 500 {
                                    format!("{}...", &result_content[..500])
                                } else {
                                    result_content
                                };
                                let _ = app.emit(
                                    "claude-stream",
                                    ClaudeStreamEvent {
                                        run_id: run_id.to_string(),
                                        event_type: "tool_result".to_string(),
                                        content: truncated,
                                        metadata: None,
                                    },
                                );
                            }
                            _ => {}
                        }
                    }
                }
            }
            "result" => {
                // Extract result text — may be in "result" field or "errors" array
                final_result = parsed
                    .get("result")
                    .and_then(|r| r.as_str())
                    .unwrap_or("")
                    .to_string();
                is_error = parsed
                    .get("is_error")
                    .and_then(|e| e.as_bool())
                    .unwrap_or(false);

                // If result is empty but errors array exists, use that
                if final_result.is_empty() {
                    if let Some(errors) = parsed.get("errors").and_then(|e| e.as_array()) {
                        let msgs: Vec<&str> = errors.iter().filter_map(|e| e.as_str()).collect();
                        if !msgs.is_empty() {
                            final_result = msgs.join("; ");
                            is_error = true;
                        }
                    }
                }

                duration_ms = parsed
                    .get("duration_ms")
                    .and_then(|d| d.as_u64())
                    .unwrap_or(0);
                cost_usd = parsed
                    .get("total_cost_usd")
                    .and_then(|c| c.as_f64())
                    .unwrap_or(0.0);
                session_id = parsed
                    .get("session_id")
                    .and_then(|s| s.as_str())
                    .unwrap_or("")
                    .to_string();

                if !suppress_result {
                    let _ = app.emit(
                        "claude-stream",
                        ClaudeStreamEvent {
                            run_id: run_id.to_string(),
                            event_type: "result".to_string(),
                            content: final_result.clone(),
                            metadata: Some(serde_json::json!({
                                "is_error": is_error,
                                "duration_ms": duration_ms,
                                "cost_usd": cost_usd,
                            })),
                        },
                    );
                }
            }
            _ => {}
        }
    }

    // Wait for process to finish
    let _ = child.wait();

    // Clean up tracking
    {
        let mut runs = active_runs().lock().unwrap_or_else(|e| e.into_inner());
        runs.remove(run_id);
    }

    Ok(ClaudeRunResult {
        session_id,
        result: final_result,
        is_error,
        duration_ms,
        cost_usd,
    })
}

// ============================================================================
// Command: Cancel a running Claude CLI process
// ============================================================================

#[command]
pub async fn claude_run_cancel(run_id: String) -> CmdResult<bool> {
    let runs = active_runs()
        .lock()
        .map_err(|e| CommandError::Internal(e.to_string()))?;
    if let Some(cancelled) = runs.get(&run_id) {
        let mut c = cancelled.lock().unwrap_or_else(|e| e.into_inner());
        *c = true;
        Ok(true)
    } else {
        Ok(false)
    }
}
