// MCP Tauri Commands
// Exposes MCP tools via Tauri IPC for the UI

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::command;

use crate::mcp::protocol::{Tool, ToolResult};
use crate::mcp::tools;

/// MCP tool info for the UI (matches the React interface)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpToolInfo {
    pub name: String,
    pub description: String,
    #[serde(rename = "inputSchema")]
    pub input_schema: McpInputSchema,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpInputSchema {
    #[serde(rename = "type")]
    pub schema_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub properties: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub required: Option<Vec<String>>,
}

impl From<Tool> for McpToolInfo {
    fn from(tool: Tool) -> Self {
        Self {
            name: tool.name,
            description: tool.description,
            input_schema: McpInputSchema {
                schema_type: tool.input_schema.schema_type,
                properties: tool.input_schema.properties,
                required: tool.input_schema.required,
            },
        }
    }
}

/// List all MCP tools (for UI capability explorer)
#[command]
pub fn mcp_list_tools() -> Vec<McpToolInfo> {
    tools::list_tools()
        .into_iter()
        .map(McpToolInfo::from)
        .collect()
}

/// Call an MCP tool by name
#[command]
pub async fn mcp_call_tool(name: String, arguments: Value) -> Result<ToolResult, String> {
    Ok(tools::call_tool(&name, arguments).await)
}

/// Get MCP server status
#[command]
pub fn mcp_get_status() -> McpStatus {
    McpStatus {
        http_enabled: true,
        http_port: crate::mcp::server::DEFAULT_PORT,
        tool_count: tools::list_tools().len(),
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct McpStatus {
    pub http_enabled: bool,
    pub http_port: u16,
    pub tool_count: usize,
}
