// Agent SDK Runner — Spawn the tv-agent-runner sidecar as a subprocess,
// stream Agent SDK events back to the frontend via Tauri events.
//
// This is the SDK-based alternative to claude_runner.rs (which shells out to
// the `claude` CLI). The sidecar (src-tauri/sidecars/agent-runner/) is a Bun-
// compiled binary that wraps @anthropic-ai/claude-agent-sdk.
//
// Wire format:
//   stdin  : single JSON object (AgentRunRequest), then EOF.
//   stdout : NDJSON — one raw SDKMessage per line. Same shape as Claude Code's
//            --output-format stream-json, so we reuse the existing event-parsing
//            logic from claude_runner.rs.
//
// Events emitted to the frontend (channel "claude-stream") match the shape
// produced by claude_runner so the existing claudeRunStore + UI work unchanged.

use crate::commands::claude_setup::resolve_claude_path;
use crate::commands::error::{CmdResult, CommandError};
use crate::commands::settings::load_settings;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{command, AppHandle, Emitter};

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct McpServerSpec {
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRunRequest {
    pub prompt: String,
    #[serde(default)]
    pub allowed_tools: Vec<String>,
    pub model: Option<String>,
    pub cwd: Option<String>,
    pub resume_session_id: Option<String>,
    pub max_turns: Option<u32>,
    pub system_prompt: Option<String>,
    #[serde(default)]
    pub mcp_servers: HashMap<String, McpServerSpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRunResult {
    pub session_id: String,
    pub result: String,
    pub is_error: bool,
    pub duration_ms: u64,
    pub cost_usd: f64,
}

// Reuse claude_runner's event shape so the frontend ignores the engine swap.
#[derive(Debug, Clone, Serialize)]
pub struct ClaudeStreamEvent {
    pub run_id: String,
    pub event_type: String,
    pub content: String,
    pub metadata: Option<Value>,
}

fn active_runs() -> &'static Mutex<HashMap<String, Arc<Mutex<bool>>>> {
    static INSTANCE: OnceLock<Mutex<HashMap<String, Arc<Mutex<bool>>>>> = OnceLock::new();
    INSTANCE.get_or_init(|| Mutex::new(HashMap::new()))
}

// ============================================================================
// Sidecar binary resolution
// ============================================================================

/// Locate the tv-agent-runner sidecar. Search order:
///   1. $TV_AGENT_RUNNER_BIN (escape hatch for dev/CI)
///   2. ~/.tv-client/bin/tv-agent-runner   (manual install / symlink)
///   3. Tauri app resource dir (production bundle, future)
///   4. Workspace dev build: src-tauri/sidecars/agent-runner/dist/tv-agent-runner
fn resolve_sidecar_path() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("TV_AGENT_RUNNER_BIN") {
        let pb = PathBuf::from(p);
        if pb.exists() {
            return Some(pb);
        }
    }
    if let Some(home) = dirs::home_dir() {
        let p = home.join(".tv-client/bin/tv-agent-runner");
        if p.exists() {
            return Some(p);
        }
    }
    // Dev fallback: from src-tauri/target/{debug,release}/... up to repo root
    if let Ok(exe) = std::env::current_exe() {
        let mut cur = exe.as_path();
        for _ in 0..6 {
            if let Some(parent) = cur.parent() {
                let candidate = parent.join("sidecars/agent-runner/dist/tv-agent-runner");
                if candidate.exists() {
                    return Some(candidate);
                }
                cur = parent;
            } else {
                break;
            }
        }
    }
    None
}

// ============================================================================
// Command
// ============================================================================

#[command]
pub async fn agent_run(
    app: AppHandle,
    run_id: String,
    request: AgentRunRequest,
) -> CmdResult<AgentRunResult> {
    let sidecar = resolve_sidecar_path().ok_or_else(|| {
        CommandError::Internal(
            "tv-agent-runner sidecar not found. Set TV_AGENT_RUNNER_BIN, install to \
             ~/.tv-client/bin/tv-agent-runner, or build it via \
             src-tauri/sidecars/agent-runner/ (bun run build)."
                .to_string(),
        )
    })?;

    let anthropic_key = load_settings()
        .ok()
        .and_then(|s| s.keys.get("anthropic_api_key").cloned())
        .unwrap_or_default();

    if anthropic_key.is_empty() {
        return Err(CommandError::Internal(
            "ANTHROPIC_API_KEY not set in tv-client settings. Add it under Settings → API Keys."
                .to_string(),
        ));
    }

    // Compose the JSON request that the sidecar reads from stdin.
    let mut req_json = serde_json::to_value(&request)
        .map_err(|e| CommandError::Internal(format!("serialize request: {}", e)))?;
    req_json["anthropic_api_key"] = json!(anthropic_key);
    // SDK needs the native claude binary path; bun --compile bundles JS only.
    req_json["claude_code_executable"] = json!(resolve_claude_path());

    let model_label = request.model.clone().unwrap_or_else(|| "sonnet".to_string());

    // Cancellation tracking
    let cancelled = Arc::new(Mutex::new(false));
    {
        let mut runs = active_runs()
            .lock()
            .map_err(|e| CommandError::Internal(e.to_string()))?;
        runs.insert(run_id.clone(), cancelled.clone());
    }

    // Init event so the UI flips into "running" immediately.
    let _ = app.emit(
        "claude-stream",
        ClaudeStreamEvent {
            run_id: run_id.clone(),
            event_type: "init".to_string(),
            content: format!("Starting agent SDK ({})...", model_label),
            metadata: None,
        },
    );

    // Spawn sidecar.
    let mut cmd = Command::new(&sidecar);
    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| {
        CommandError::Internal(format!(
            "spawn tv-agent-runner ({}): {}",
            sidecar.display(),
            e
        ))
    })?;

    // Write the request and close stdin so the sidecar can begin.
    {
        let stdin = child
            .stdin
            .as_mut()
            .ok_or_else(|| CommandError::Internal("sidecar stdin unavailable".to_string()))?;
        let line = serde_json::to_string(&req_json)
            .map_err(|e| CommandError::Internal(format!("serialize request: {}", e)))?;
        stdin
            .write_all(line.as_bytes())
            .map_err(|e| CommandError::Internal(format!("write to sidecar stdin: {}", e)))?;
        stdin
            .write_all(b"\n")
            .map_err(|e| CommandError::Internal(format!("write to sidecar stdin: {}", e)))?;
    }
    drop(child.stdin.take());

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| CommandError::Internal("sidecar stdout unavailable".to_string()))?;
    let reader = BufReader::new(stdout);

    // Drain stderr in a background thread so it doesn't block the pipe and we
    // can log it (helps debug SDK errors that don't surface as NDJSON).
    if let Some(stderr) = child.stderr.take() {
        let run_id_for_err = run_id.clone();
        std::thread::spawn(move || {
            let r = BufReader::new(stderr);
            for line in r.lines().flatten() {
                eprintln!("[agent_runner stderr {}] {}", run_id_for_err, line);
            }
        });
    }

    let mut session_id = String::new();
    let mut final_result = String::new();
    let mut duration_ms: u64 = 0;
    let mut cost_usd: f64 = 0.0;
    let mut is_error = false;

    for line in reader.lines() {
        if *cancelled.lock().unwrap_or_else(|e| e.into_inner()) {
            let _ = child.kill();
            let _ = app.emit(
                "claude-stream",
                ClaudeStreamEvent {
                    run_id: run_id.clone(),
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
                            run_id: run_id.clone(),
                            event_type: "init".to_string(),
                            content: "Agent SDK session started".to_string(),
                            metadata: Some(json!({ "session_id": session_id })),
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
                                let text =
                                    block.get("text").and_then(|t| t.as_str()).unwrap_or("");
                                if !text.is_empty() {
                                    let _ = app.emit(
                                        "claude-stream",
                                        ClaudeStreamEvent {
                                            run_id: run_id.clone(),
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
                                let _ = app.emit(
                                    "claude-stream",
                                    ClaudeStreamEvent {
                                        run_id: run_id.clone(),
                                        event_type: "tool_use".to_string(),
                                        content: format!("Using tool: {}", tool_name),
                                        metadata: Some(json!({
                                            "tool": tool_name,
                                            "input": input,
                                        })),
                                    },
                                );
                            }
                            _ => {}
                        }
                    }
                }
            }
            "user" => {
                // Tool results arrive in user messages from the SDK.
                if let Some(content) = parsed
                    .get("message")
                    .and_then(|m| m.get("content"))
                    .and_then(|c| c.as_array())
                {
                    for block in content {
                        if block.get("type").and_then(|t| t.as_str()) != Some("tool_result") {
                            continue;
                        }
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
                                run_id: run_id.clone(),
                                event_type: "tool_result".to_string(),
                                content: truncated,
                                metadata: None,
                            },
                        );
                    }
                }
            }
            "result" => {
                final_result = parsed
                    .get("result")
                    .and_then(|r| r.as_str())
                    .unwrap_or("")
                    .to_string();
                is_error = parsed
                    .get("is_error")
                    .and_then(|e| e.as_bool())
                    .unwrap_or(false);
                duration_ms = parsed
                    .get("duration_ms")
                    .and_then(|d| d.as_u64())
                    .unwrap_or(0);
                cost_usd = parsed
                    .get("total_cost_usd")
                    .and_then(|c| c.as_f64())
                    .unwrap_or(0.0);
                if session_id.is_empty() {
                    session_id = parsed
                        .get("session_id")
                        .and_then(|s| s.as_str())
                        .unwrap_or("")
                        .to_string();
                }
                let _ = app.emit(
                    "claude-stream",
                    ClaudeStreamEvent {
                        run_id: run_id.clone(),
                        event_type: "result".to_string(),
                        content: final_result.clone(),
                        metadata: Some(json!({
                            "is_error": is_error,
                            "duration_ms": duration_ms,
                            "cost_usd": cost_usd,
                        })),
                    },
                );
            }
            _ => {}
        }
    }

    let _ = child.wait();

    {
        let mut runs = active_runs().lock().unwrap_or_else(|e| e.into_inner());
        runs.remove(&run_id);
    }

    Ok(AgentRunResult {
        session_id,
        result: final_result,
        is_error,
        duration_ms,
        cost_usd,
    })
}

#[command]
pub async fn agent_run_cancel(run_id: String) -> CmdResult<bool> {
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
