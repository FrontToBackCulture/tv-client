// Claude Code MCP setup — download tv-mcp binary + register via `claude mcp add`

use crate::commands::error::{CmdResult, CommandError};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::command;

const GITHUB_RELEASE_BASE: &str =
    "https://github.com/FrontToBackCulture/tv-client/releases/latest/download";

// ── Types ────────────────────────────────────────────────

#[derive(Serialize)]
pub struct ClaudeMcpStatus {
    pub binary_installed: bool,
    pub binary_path: String,
    pub config_exists: bool,
    pub config_has_tv_mcp: bool,
    pub platform: String,
}

// ── Helpers ──────────────────────────────────────────────

fn bin_dir() -> CmdResult<PathBuf> {
    dirs::home_dir()
        .map(|h| h.join(".tv-desktop").join("bin"))
        .ok_or_else(|| CommandError::Config("Cannot determine home directory".into()))
}

fn binary_path() -> CmdResult<PathBuf> {
    let name = if cfg!(target_os = "windows") {
        "tv-mcp.exe"
    } else {
        "tv-mcp"
    };
    Ok(bin_dir()?.join(name))
}

fn platform_suffix() -> &'static str {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    { "darwin-arm64" }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    { "darwin-x64" }
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    { "windows-x64.exe" }
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

/// Run `claude mcp <args>` and return stdout. Returns error if claude CLI not found.
async fn run_claude_mcp(args: &[&str]) -> CmdResult<String> {
    let claude_cmd = if cfg!(target_os = "windows") { "claude.cmd" } else { "claude" };
    let output = tokio::process::Command::new(claude_cmd)
        .arg("mcp")
        .args(args)
        .output()
        .await
        .map_err(|e| CommandError::Io(format!("Failed to run claude mcp: {e}")))?;
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Check if tv-mcp is registered via `claude mcp list` output.
async fn mcp_list_has_tv_mcp() -> bool {
    run_claude_mcp(&["list"]).await
        .map(|out| out.contains("tv-mcp"))
        .unwrap_or(false)
}

// ── Types (CLI check) ────────────────────────────────────

#[derive(Serialize)]
pub struct ClaudeCliStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub path: Option<String>,
}

// ── Commands ─────────────────────────────────────────────

#[command]
pub async fn check_claude_cli() -> CmdResult<ClaudeCliStatus> {
    let which_cmd = if cfg!(target_os = "windows") {
        "where"
    } else {
        "which"
    };

    // Check if claude is in PATH
    let path_output = tokio::process::Command::new(which_cmd)
        .arg("claude")
        .output()
        .await
        .map_err(|e| CommandError::Io(format!("Failed to run {which_cmd}: {e}")))?;

    if !path_output.status.success() {
        return Ok(ClaudeCliStatus {
            installed: false,
            version: None,
            path: None,
        });
    }

    let path = String::from_utf8_lossy(&path_output.stdout)
        .trim()
        .to_string();

    // Get version
    let version_output = tokio::process::Command::new("claude")
        .arg("--version")
        .output()
        .await
        .ok();

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
        path: Some(path),
    })
}

#[command]
pub async fn claude_mcp_status() -> CmdResult<ClaudeMcpStatus> {
    let bin = binary_path()?;
    let has_tv_mcp = mcp_list_has_tv_mcp().await;

    Ok(ClaudeMcpStatus {
        binary_installed: bin.exists(),
        binary_path: bin.to_string_lossy().to_string(),
        config_exists: has_tv_mcp,
        config_has_tv_mcp: has_tv_mcp,
        platform: platform_suffix().to_string(),
    })
}

#[command]
pub async fn claude_mcp_install() -> CmdResult<ClaudeMcpStatus> {
    let suffix = platform_suffix();
    if suffix == "unsupported" {
        return Err(CommandError::Config("Unsupported platform".into()));
    }

    // 1. Download binary
    let url = format!("{GITHUB_RELEASE_BASE}/tv-mcp-{suffix}");
    eprintln!("[claude-setup] Downloading {url}");

    let response = reqwest::get(&url).await?;

    if !response.status().is_success() {
        return Err(CommandError::Http {
            status: response.status().as_u16(),
            body: format!("Download failed for tv-mcp-{suffix}"),
        });
    }

    let bytes = response.bytes().await?;

    // 2. Write binary
    let bin = binary_path()?;
    if let Some(parent) = bin.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&bin, &bytes)?;

    // 3. chmod +x (unix)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o755);
        std::fs::set_permissions(&bin, perms)?;
    }

    eprintln!(
        "[claude-setup] Binary installed at {}",
        bin.to_string_lossy()
    );

    // 4. Register via `claude mcp add` (user-level, not project-level)
    // Remove first in case it already exists with a stale path
    let claude_cmd = if cfg!(target_os = "windows") { "claude.cmd" } else { "claude" };
    let _ = tokio::process::Command::new(claude_cmd)
        .args(["mcp", "remove", "tv-mcp", "-s", "user"])
        .output()
        .await;

    let add_output = tokio::process::Command::new(claude_cmd)
        .args(["mcp", "add", "--transport", "stdio", "-s", "user", "tv-mcp", "--", &bin.to_string_lossy()])
        .output()
        .await
        .map_err(|e| CommandError::Io(format!("Failed to run claude mcp add: {e}")))?;

    if !add_output.status.success() {
        let stderr = String::from_utf8_lossy(&add_output.stderr);
        eprintln!("[claude-setup] claude mcp add failed: {stderr}");
        return Err(CommandError::Config(format!("claude mcp add failed: {stderr}")));
    }

    eprintln!("[claude-setup] tv-mcp registered via claude mcp add");

    // Return updated status
    claude_mcp_status().await
}

#[command]
pub async fn claude_mcp_uninstall() -> CmdResult<ClaudeMcpStatus> {
    // 1. Remove binary
    let bin = binary_path()?;
    if bin.exists() {
        std::fs::remove_file(&bin)?;
        eprintln!("[claude-setup] Binary removed");
    }

    // 2. Deregister via `claude mcp remove` (user-level)
    let claude_cmd = if cfg!(target_os = "windows") { "claude.cmd" } else { "claude" };
    let _ = tokio::process::Command::new(claude_cmd)
        .args(["mcp", "remove", "tv-mcp", "-s", "user"])
        .output()
        .await;
    eprintln!("[claude-setup] tv-mcp deregistered");

    claude_mcp_status().await
}
