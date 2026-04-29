// MCP Tools sync — invokes `tv-mcp --sync-tools` to repopulate the
// `mcp_tools` Supabase registry from the in-process tool catalog.

use crate::commands::claude_setup::resolve_binary_path;
use crate::commands::error::{CmdResult, CommandError};
use serde::{Deserialize, Serialize};
use tauri::command;

#[derive(Serialize, Deserialize)]
pub struct McpSyncResult {
    pub synced: u32,
    pub marked_missing: u32,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
}

#[command]
pub async fn sync_mcp_tools_command() -> CmdResult<McpSyncResult> {
    let binary_path = resolve_binary_path()?;

    let output = tokio::process::Command::new(&binary_path)
        .arg("--sync-tools")
        .output()
        .await
        .map_err(|e| CommandError::Internal(format!("failed to spawn tv-mcp: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(CommandError::Internal(format!(
            "tv-mcp --sync-tools failed: {}",
            stderr.trim()
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();

    serde_json::from_str::<McpSyncResult>(trimmed).map_err(|e| {
        CommandError::Internal(format!(
            "failed to parse sync result (stdout: {}): {}",
            trimmed, e
        ))
    })
}
