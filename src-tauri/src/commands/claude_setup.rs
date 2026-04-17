// Claude Code MCP setup — register standalone tv-mcp binary via `claude mcp add`

use crate::commands::error::{CmdResult, CommandError};
use serde::Serialize;
use std::path::PathBuf;
use tauri::command;

// ── Types ────────────────────────────────────────────────

#[derive(Serialize)]
pub struct ClaudeMcpStatus {
    pub binary_installed: bool,
    pub binary_path: String,
    pub binary_version: Option<String>,
    pub config_exists: bool,
    pub config_has_tv_mcp: bool,
    pub registered_path: Option<String>,
    pub path_matches: bool,
    pub platform: String,
}

#[derive(Serialize)]
pub struct ClaudeCliStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub path: Option<String>,
}

// ── Helpers ──────────────────────────────────────────────

/// Resolve the tv-mcp binary path.
///
/// tv-mcp is installed standalone — not bundled with tv-client.
///
/// Priority:
/// 1. ~/.tv-mcp/bin/tv-mcp (standard install location)
/// 2. Dev mode: cargo build output in the tv-mcp repo
fn resolve_binary_path() -> CmdResult<PathBuf> {
    let binary_name = if cfg!(target_os = "windows") {
        "tv-mcp.exe"
    } else {
        "tv-mcp"
    };

    // Standard install: ~/.tv-mcp/bin/tv-mcp
    if let Some(home) = dirs::home_dir() {
        let install_path = home.join(".tv-mcp").join("bin").join(binary_name);
        if install_path.exists() {
            return Ok(install_path);
        }
    }

    // Dev mode: cargo build output in the tv-mcp repo
    #[cfg(debug_assertions)]
    {
        let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        // tv-mcp repo is a sibling: ../../tv-mcp
        let dev_path = manifest_dir
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.join("tv-mcp").join("target").join("debug").join(binary_name));
        if let Some(dev_path) = dev_path {
            if dev_path.exists() {
                return Ok(dev_path);
            }
        }
    }

    Err(CommandError::Config(
        "tv-mcp binary not found. Install it from https://github.com/FrontToBackCulture/tv-mcp".into(),
    ))
}

/// Get the version string from a tv-mcp binary by running `tv-mcp --version`.
async fn get_binary_version(path: &PathBuf) -> Option<String> {
    let output = tokio::process::Command::new(path)
        .arg("--version")
        .output()
        .await
        .ok()?;

    if output.status.success() {
        let version_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
        // Output format: "tv-mcp 0.1.0" — extract just the version
        version_str
            .strip_prefix("tv-mcp ")
            .map(|v| v.to_string())
            .or(Some(version_str))
    } else {
        None
    }
}

fn platform_label() -> &'static str {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    { "darwin-arm64" }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    { "darwin-x64" }
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    { "windows-x64" }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    { "linux-x64" }
    #[cfg(not(any(
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "windows", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "x86_64"),
    )))]
    { "unsupported" }
}

/// Resolve the full path to the `claude` CLI binary.
/// GUI apps (both macOS and Windows) often don't inherit the user's full shell
/// PATH, so we scan common installation locations before falling back to a bare
/// command name.
pub fn resolve_claude_path() -> String {
    let (binary_name, candidates) = if cfg!(target_os = "windows") {
        let mut paths = Vec::new();

        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            let local = PathBuf::from(&local);
            paths.push(local.join("Programs").join("claude-code").join("claude.exe"));
            paths.push(local.join("Programs").join("claude").join("claude.exe"));
            paths.push(local.join("Microsoft").join("WinGet").join("Links").join("claude.exe"));
        }

        if let Ok(appdata) = std::env::var("APPDATA") {
            let appdata = PathBuf::from(&appdata);
            paths.push(appdata.join("npm").join("claude.cmd"));
            paths.push(appdata.join("npm").join("claude.exe"));
        }

        if let Some(home) = dirs::home_dir() {
            paths.push(home.join(".claude").join("local").join("claude.exe"));
            if let Ok(nvm_home) = std::env::var("NVM_HOME") {
                if let Ok(entries) = std::fs::read_dir(&nvm_home) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.is_dir() {
                            paths.push(p.join("claude.cmd"));
                            paths.push(p.join("claude.exe"));
                        }
                    }
                }
            }
            paths.push(home.join("AppData").join("Local").join("Chocolatey").join("bin").join("claude.exe"));
        }

        paths.push(PathBuf::from(r"C:\Program Files\Claude\claude.exe"));
        paths.push(PathBuf::from(r"C:\Program Files\nodejs\claude.cmd"));

        ("claude.exe", paths)
    } else {
        let mut paths = vec![
            PathBuf::from("/usr/local/bin/claude"),
            PathBuf::from("/opt/homebrew/bin/claude"),
        ];
        if let Some(home) = dirs::home_dir() {
            paths.push(home.join(".claude").join("local").join("claude"));
            paths.push(home.join(".local").join("bin").join("claude"));
            paths.push(home.join(".npm-global").join("bin").join("claude"));
        }

        ("claude", paths)
    };

    for path in &candidates {
        if path.exists() {
            return path.to_string_lossy().to_string();
        }
    }

    binary_name.to_string()
}

/// Run `claude <args>` and return the output.
async fn run_claude(args: &[&str]) -> CmdResult<std::process::Output> {
    let claude_path = resolve_claude_path();

    if cfg!(target_os = "windows") && claude_path.ends_with(".cmd") {
        let mut cmd_args = vec!["/C", &claude_path];
        let args_owned: Vec<&str> = args.to_vec();
        cmd_args.extend_from_slice(&args_owned);
        tokio::process::Command::new("cmd")
            .args(&cmd_args)
            .output()
            .await
            .map_err(|e| CommandError::Io(format!("Failed to run {claude_path} via cmd.exe: {e}")))
    } else {
        let result = tokio::process::Command::new(&claude_path)
            .args(args)
            .output()
            .await;

        match result {
            Ok(output) => Ok(output),
            Err(e) if cfg!(target_os = "windows") => {
                let mut cmd_args = vec!["/C", "claude"];
                cmd_args.extend_from_slice(args);
                tokio::process::Command::new("cmd")
                    .args(&cmd_args)
                    .output()
                    .await
                    .map_err(|_| CommandError::Io(format!("Failed to run {claude_path}: {e}")))
            }
            Err(e) => Err(CommandError::Io(format!("Failed to run {claude_path}: {e}"))),
        }
    }
}

/// Check tv-mcp registration by reading Claude config JSON directly.
async fn mcp_list_check() -> (bool, Option<String>) {
    let config_path = match dirs::home_dir() {
        Some(home) => home.join(".claude.json"),
        None => return (false, None),
    };

    let content = match tokio::fs::read_to_string(&config_path).await {
        Ok(c) => c,
        Err(_) => return (false, None),
    };

    let json: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return (false, None),
    };

    let tv_mcp = match json.get("mcpServers").and_then(|s| s.get("tv-mcp")) {
        Some(v) => v,
        None => return (false, None),
    };

    let command = tv_mcp
        .get("command")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    (true, command)
}

// ── Auto-registration ───────────────────────────────────

/// Ensure tv-mcp is registered with Claude Code and the path is current.
/// Called on app startup — silently fixes stale registrations.
pub async fn ensure_mcp_registered() {
    let bin = match resolve_binary_path() {
        Ok(p) => p,
        Err(_) => {
            eprintln!("[claude-setup] tv-mcp binary not found — install from https://github.com/FrontToBackCulture/tv-mcp");
            return;
        }
    };
    let bin_str = bin.to_string_lossy().to_string();

    let claude_path = resolve_claude_path();
    let cli_exists = if claude_path == "claude" || claude_path == "claude.exe" {
        let which_cmd = if cfg!(target_os = "windows") { "where" } else { "which" };
        tokio::process::Command::new(which_cmd)
            .arg(&claude_path)
            .output()
            .await
            .map(|o| o.status.success())
            .unwrap_or(false)
    } else {
        PathBuf::from(&claude_path).exists()
    };
    if !cli_exists {
        return;
    }

    let (is_registered, registered_path) = mcp_list_check().await;

    if is_registered {
        if let Some(ref reg) = registered_path {
            if reg == &bin_str {
                return;
            }
            eprintln!(
                "[claude-setup] MCP path stale: registered={}, current={} — re-registering",
                reg, bin_str
            );
        }
    } else {
        eprintln!("[claude-setup] tv-mcp not registered with Claude Code — registering");
    }

    let _ = run_claude(&["mcp", "remove", "tv-mcp", "-s", "user"]).await;

    match run_claude(&[
        "mcp", "add", "--transport", "stdio", "-s", "user", "tv-mcp", "--", &bin_str,
    ])
    .await
    {
        Ok(output) if output.status.success() => {
            eprintln!("[claude-setup] tv-mcp auto-registered at {bin_str}");
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            eprintln!("[claude-setup] auto-register failed: {stderr}");
        }
        Err(e) => {
            eprintln!("[claude-setup] auto-register error: {e}");
        }
    }
}

// ── Commands ─────────────────────────────────────────────

#[command]
pub async fn check_claude_cli() -> CmdResult<ClaudeCliStatus> {
    let claude_path = resolve_claude_path();

    let path_exists = if claude_path == "claude" || claude_path == "claude.exe" {
        let which_cmd = if cfg!(target_os = "windows") { "where" } else { "which" };
        tokio::process::Command::new(which_cmd)
            .arg(&claude_path)
            .output()
            .await
            .map(|o| o.status.success())
            .unwrap_or(false)
    } else {
        PathBuf::from(&claude_path).exists()
    };

    if !path_exists {
        return Ok(ClaudeCliStatus {
            installed: false,
            version: None,
            path: None,
        });
    }

    let version_output = run_claude(&["--version"]).await.ok();
    let version = version_output.and_then(|o| {
        if o.status.success() {
            Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
        } else {
            None
        }
    });

    Ok(ClaudeCliStatus {
        installed: true,
        version,
        path: Some(claude_path),
    })
}

#[command]
pub async fn claude_mcp_status() -> CmdResult<ClaudeMcpStatus> {
    let bin_path = resolve_binary_path().unwrap_or_default();
    let bin_str = bin_path.to_string_lossy().to_string();
    let binary_installed = bin_path.exists();
    let binary_version = if binary_installed {
        get_binary_version(&bin_path).await
    } else {
        None
    };

    let (has_tv_mcp, registered_path) = mcp_list_check().await;

    let path_matches = match &registered_path {
        Some(reg) => reg == &bin_str,
        None => false,
    };

    Ok(ClaudeMcpStatus {
        binary_installed,
        binary_path: bin_str,
        binary_version,
        config_exists: has_tv_mcp,
        config_has_tv_mcp: has_tv_mcp,
        registered_path,
        path_matches,
        platform: platform_label().to_string(),
    })
}

#[command]
pub async fn claude_mcp_install() -> CmdResult<ClaudeMcpStatus> {
    let bin = resolve_binary_path()?;
    let bin_str = bin.to_string_lossy().to_string();

    eprintln!("[claude-setup] Using tv-mcp binary at {bin_str}");

    let version = get_binary_version(&bin).await;
    if let Some(ref v) = version {
        eprintln!("[claude-setup] Binary version: {v}");
    }

    let _ = run_claude(&["mcp", "remove", "tv-mcp", "-s", "user"]).await;

    let add_output = run_claude(&[
        "mcp", "add", "--transport", "stdio", "-s", "user", "tv-mcp", "--", &bin_str,
    ])
    .await
    .map_err(|e| CommandError::Io(format!("Failed to run claude mcp add: {e}")))?;

    if !add_output.status.success() {
        let stderr = String::from_utf8_lossy(&add_output.stderr);
        eprintln!("[claude-setup] claude mcp add failed: {stderr}");
        return Err(CommandError::Config(format!(
            "claude mcp add failed: {stderr}"
        )));
    }

    eprintln!("[claude-setup] tv-mcp registered via claude mcp add");

    claude_mcp_status().await
}

#[command]
pub async fn claude_mcp_uninstall() -> CmdResult<ClaudeMcpStatus> {
    let _ = run_claude(&["mcp", "remove", "tv-mcp", "-s", "user"]).await;
    eprintln!("[claude-setup] tv-mcp deregistered");
    claude_mcp_status().await
}
