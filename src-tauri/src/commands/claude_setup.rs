// Claude Code MCP setup — resolve bundled tv-mcp sidecar + register via `claude mcp add`

use crate::commands::error::{CmdResult, CommandError};
use serde::Serialize;
use std::path::PathBuf;
use tauri::command;

const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

// ── Types ────────────────────────────────────────────────

#[derive(Serialize)]
pub struct ClaudeMcpStatus {
    pub binary_installed: bool,
    pub binary_path: String,
    pub binary_version: Option<String>,
    pub app_version: String,
    pub version_match: bool,
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
/// Priority:
/// 1. Dev mode: cargo build output (target/debug/tv-mcp) — avoids needing sidecar rebuild
/// 2. Production: next to the main executable (bundled sidecar)
/// 3. Legacy fallback: ~/.tv-desktop/bin/tv-mcp
fn resolve_binary_path() -> CmdResult<PathBuf> {
    let binary_name = if cfg!(target_os = "windows") {
        "tv-mcp.exe"
    } else {
        "tv-mcp"
    };

    // Dev mode: use cargo build output directly
    #[cfg(debug_assertions)]
    {
        let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let dev_path = manifest_dir.join("target").join("debug").join(binary_name);
        if dev_path.exists() {
            return Ok(dev_path);
        }
    }

    // Production: sidecar lives next to the main executable
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let sidecar_path = exe_dir.join(binary_name);
            if sidecar_path.exists() {
                return Ok(sidecar_path);
            }
        }
    }

    // Legacy fallback: ~/.tv-desktop/bin/tv-mcp
    if let Some(home) = dirs::home_dir() {
        let legacy_path = home.join(".tv-desktop").join("bin").join(binary_name);
        if legacy_path.exists() {
            return Ok(legacy_path);
        }
    }

    Err(CommandError::Config(
        "tv-mcp binary not found. Try reinstalling TV Client.".into(),
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
        // Output format: "tv-mcp 0.9.11" — extract just the version
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
fn resolve_claude_path() -> String {
    let (binary_name, candidates) = if cfg!(target_os = "windows") {
        let mut paths = Vec::new();

        // Claude Code native installer (AppData\Local\Programs)
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            let local = PathBuf::from(&local);
            paths.push(local.join("Programs").join("claude-code").join("claude.exe"));
            paths.push(local.join("Programs").join("claude").join("claude.exe"));
            // Scoop installs
            paths.push(local.join("Microsoft").join("WinGet").join("Links").join("claude.exe"));
        }

        // npm global installs — check actual npm prefix first
        if let Ok(appdata) = std::env::var("APPDATA") {
            let appdata = PathBuf::from(&appdata);
            // Default npm global prefix on Windows
            paths.push(appdata.join("npm").join("claude.cmd"));
            paths.push(appdata.join("npm").join("claude.exe"));
        }

        if let Some(home) = dirs::home_dir() {
            // Claude Code local install
            paths.push(home.join(".claude").join("local").join("claude.exe"));
            // nvm-windows — scan all installed node versions
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
            // Chocolatey
            paths.push(home.join("AppData").join("Local").join("Chocolatey").join("bin").join("claude.exe"));
        }

        // Program Files
        paths.push(PathBuf::from(r"C:\Program Files\Claude\claude.exe"));
        paths.push(PathBuf::from(r"C:\Program Files\nodejs\claude.cmd"));

        ("claude.exe", paths)
    } else {
        // macOS / Linux
        let mut paths = vec![
            PathBuf::from("/usr/local/bin/claude"),
            PathBuf::from("/opt/homebrew/bin/claude"),
        ];
        if let Some(home) = dirs::home_dir() {
            paths.push(home.join(".claude").join("local").join("claude"));
            paths.push(home.join(".local").join("bin").join("claude"));
            // npm global installs
            paths.push(home.join(".npm-global").join("bin").join("claude"));
        }

        ("claude", paths)
    };

    for path in &candidates {
        if path.exists() {
            return path.to_string_lossy().to_string();
        }
    }

    // Fallback: try bare name (works if PATH is set correctly)
    binary_name.to_string()
}

/// Run `claude <args>` and return the output.
/// Uses `resolve_claude_path()` to find the binary on all platforms.
/// On Windows, if the resolved path is a `.cmd` file, runs through `cmd /C`.
async fn run_claude(args: &[&str]) -> CmdResult<std::process::Output> {
    let claude_path = resolve_claude_path();

    if cfg!(target_os = "windows") && claude_path.ends_with(".cmd") {
        // .cmd files must be run through cmd.exe
        let mut cmd_args = vec!["/C", &claude_path];
        let args_owned: Vec<&str> = args.to_vec();
        cmd_args.extend_from_slice(&args_owned);
        tokio::process::Command::new("cmd")
            .args(&cmd_args)
            .output()
            .await
            .map_err(|e| CommandError::Io(format!("Failed to run {claude_path} via cmd.exe: {e}")))
    } else {
        // .exe or unix binary — run directly
        let result = tokio::process::Command::new(&claude_path)
            .args(args)
            .output()
            .await;

        match result {
            Ok(output) => Ok(output),
            Err(e) if cfg!(target_os = "windows") => {
                // Last resort on Windows: try cmd /C claude for PATHEXT resolution
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
/// This avoids PATH issues and CLI output format fragility.
/// Returns (is_registered, Option<registered_command_path>)
async fn mcp_list_check() -> (bool, Option<String>) {
    // Read ~/.claude.json (primary config location)
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

// ── Commands ─────────────────────────────────────────────

#[command]
pub async fn check_claude_cli() -> CmdResult<ClaudeCliStatus> {
    let claude_path = resolve_claude_path();

    // Check if the resolved path actually exists (or is findable)
    let path_exists = if claude_path == "claude" || claude_path == "claude.exe" {
        // Bare name — try `which`/`where` to verify
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
    let version_match = binary_version.as_deref() == Some(APP_VERSION);

    let (has_tv_mcp, registered_path) = mcp_list_check().await;

    let path_matches = match &registered_path {
        Some(reg) => reg == &bin_str,
        None => false,
    };

    Ok(ClaudeMcpStatus {
        binary_installed,
        binary_path: bin_str,
        binary_version,
        app_version: APP_VERSION.to_string(),
        version_match,
        config_exists: has_tv_mcp,
        config_has_tv_mcp: has_tv_mcp,
        registered_path,
        path_matches,
        platform: platform_label().to_string(),
    })
}

#[command]
pub async fn claude_mcp_install() -> CmdResult<ClaudeMcpStatus> {
    // 1. Resolve the bundled sidecar binary
    let bin = resolve_binary_path()?;
    let bin_str = bin.to_string_lossy().to_string();

    eprintln!("[claude-setup] Using bundled binary at {bin_str}");

    // 2. Verify the binary works
    let version = get_binary_version(&bin).await;
    if let Some(ref v) = version {
        eprintln!("[claude-setup] Binary version: {v}");
        if v != APP_VERSION {
            eprintln!(
                "[claude-setup] Warning: binary version ({v}) != app version ({APP_VERSION})"
            );
        }
    }

    // 3. Register via `claude mcp add` (user-level)
    // Remove first in case it already exists with a stale path
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

    // Return updated status
    claude_mcp_status().await
}

#[command]
pub async fn claude_mcp_uninstall() -> CmdResult<ClaudeMcpStatus> {
    // Deregister via `claude mcp remove` (user-level)
    let _ = run_claude(&["mcp", "remove", "tv-mcp", "-s", "user"]).await;
    eprintln!("[claude-setup] tv-mcp deregistered");

    // Don't delete the binary — it's bundled with the app
    claude_mcp_status().await
}
