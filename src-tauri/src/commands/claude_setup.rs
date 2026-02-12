// Claude Code MCP setup — download tv-mcp binary + configure ~/.claude/mcp.json

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

#[derive(Deserialize, Serialize)]
struct McpConfig {
    #[serde(rename = "mcpServers", default)]
    mcp_servers: serde_json::Map<String, serde_json::Value>,
}

// ── Helpers ──────────────────────────────────────────────

fn bin_dir() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|h| h.join(".tv-desktop").join("bin"))
        .ok_or_else(|| "Cannot determine home directory".to_string())
}

fn binary_path() -> Result<PathBuf, String> {
    let name = if cfg!(target_os = "windows") {
        "tv-mcp.exe"
    } else {
        "tv-mcp"
    };
    Ok(bin_dir()?.join(name))
}

fn claude_config_path() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|h| h.join(".claude").join("mcp.json"))
        .ok_or_else(|| "Cannot determine home directory".to_string())
}

fn platform_suffix() -> &'static str {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    { "aarch64-apple-darwin" }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    { "x86_64-apple-darwin" }
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    { "x86_64-pc-windows-msvc.exe" }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    { "x86_64-unknown-linux-gnu" }
    #[cfg(not(any(
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "windows", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "x86_64"),
    )))]
    { "unsupported" }
}

fn read_mcp_config() -> Result<McpConfig, String> {
    let path = claude_config_path()?;
    if !path.exists() {
        return Ok(McpConfig {
            mcp_servers: serde_json::Map::new(),
        });
    }
    let data = std::fs::read_to_string(&path).map_err(|e| format!("Read mcp.json: {e}"))?;
    serde_json::from_str(&data).map_err(|e| format!("Parse mcp.json: {e}"))
}

fn write_mcp_config(config: &McpConfig) -> Result<(), String> {
    let path = claude_config_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Create .claude dir: {e}"))?;
    }
    let json = serde_json::to_string_pretty(config).map_err(|e| format!("Serialize: {e}"))?;
    std::fs::write(&path, json).map_err(|e| format!("Write mcp.json: {e}"))
}

// ── Commands ─────────────────────────────────────────────

#[command]
pub fn claude_mcp_status() -> Result<ClaudeMcpStatus, String> {
    let bin = binary_path()?;
    let config = read_mcp_config()?;

    Ok(ClaudeMcpStatus {
        binary_installed: bin.exists(),
        binary_path: bin.to_string_lossy().to_string(),
        config_exists: claude_config_path()?.exists(),
        config_has_tv_mcp: config.mcp_servers.contains_key("tv-mcp"),
        platform: platform_suffix().to_string(),
    })
}

#[command]
pub async fn claude_mcp_install() -> Result<ClaudeMcpStatus, String> {
    let suffix = platform_suffix();
    if suffix == "unsupported" {
        return Err("Unsupported platform".to_string());
    }

    // 1. Download binary
    let url = format!("{GITHUB_RELEASE_BASE}/tv-mcp-{suffix}");
    eprintln!("[claude-setup] Downloading {url}");

    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Download failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download failed: HTTP {}",
            response.status()
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Read response: {e}"))?;

    // 2. Write binary
    let bin = binary_path()?;
    if let Some(parent) = bin.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Create bin dir: {e}"))?;
    }
    std::fs::write(&bin, &bytes).map_err(|e| format!("Write binary: {e}"))?;

    // 3. chmod +x (unix)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o755);
        std::fs::set_permissions(&bin, perms).map_err(|e| format!("chmod: {e}"))?;
    }

    eprintln!(
        "[claude-setup] Binary installed at {}",
        bin.to_string_lossy()
    );

    // 4. Merge tv-mcp entry into mcp.json
    let mut config = read_mcp_config()?;
    let entry = serde_json::json!({
        "command": bin.to_string_lossy(),
    });
    config
        .mcp_servers
        .insert("tv-mcp".to_string(), entry);
    write_mcp_config(&config)?;

    eprintln!("[claude-setup] mcp.json updated");

    // Return updated status
    claude_mcp_status()
}

#[command]
pub async fn claude_mcp_uninstall() -> Result<ClaudeMcpStatus, String> {
    // 1. Remove binary
    let bin = binary_path()?;
    if bin.exists() {
        std::fs::remove_file(&bin).map_err(|e| format!("Remove binary: {e}"))?;
        eprintln!("[claude-setup] Binary removed");
    }

    // 2. Remove tv-mcp key from mcp.json (preserve other entries)
    let config_path = claude_config_path()?;
    if config_path.exists() {
        let mut config = read_mcp_config()?;
        config.mcp_servers.remove("tv-mcp");
        write_mcp_config(&config)?;
        eprintln!("[claude-setup] tv-mcp removed from mcp.json");
    }

    claude_mcp_status()
}
