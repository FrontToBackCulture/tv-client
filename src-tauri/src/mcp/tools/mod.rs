// MCP Tool Registry
// Defines and dispatches tools for Claude Code

pub mod work;
pub mod crm;
pub mod generate;
pub mod intercom;
pub mod docgen;
pub mod val_sync;

use super::protocol::{Tool, ToolResult};
use serde_json::Value;

/// List all available tools
pub fn list_tools() -> Vec<Tool> {
    let mut tools = Vec::new();

    // Work module tools
    tools.extend(work::tools());

    // CRM module tools
    tools.extend(crm::tools());

    // Generation tools (Gamma, Nanobanana)
    tools.extend(generate::tools());

    // Intercom tools (Help Center publishing)
    tools.extend(intercom::tools());

    // Document generation tools (Order forms, Proposals)
    tools.extend(docgen::tools());

    // VAL Sync tools
    tools.extend(val_sync::tools());

    tools
}

/// Call a tool by name
pub async fn call_tool(name: &str, arguments: Value) -> ToolResult {
    // Work module tools
    if name.starts_with("list-work-") || name.starts_with("get-work-") ||
       name.starts_with("create-work-") || name.starts_with("update-work-") ||
       name.starts_with("delete-work-") {
        return work::call(name, arguments).await;
    }

    // CRM module tools
    if name.starts_with("list-crm-") || name.starts_with("find-crm-") ||
       name.starts_with("get-crm-") || name.starts_with("create-crm-") ||
       name.starts_with("update-crm-") || name.starts_with("delete-crm-") ||
       name.starts_with("log-crm-") || name == "link-task-to-deal" {
        return crm::call(name, arguments).await;
    }

    // Generation tools
    if name.starts_with("gamma-") || name.starts_with("nanobanana-") {
        return generate::call(name, arguments).await;
    }

    // Intercom tools
    if name.starts_with("list-intercom-") || name.starts_with("publish-to-intercom") {
        return intercom::call(name, arguments).await;
    }

    // Document generation tools
    if name.starts_with("generate-order-form") || name.starts_with("generate-proposal") || name == "check-document-type" {
        return docgen::call(name, arguments).await;
    }

    // VAL Sync tools
    if name.starts_with("sync-val-") || name == "execute-val-sql" {
        return val_sync::call(name, arguments).await;
    }

    ToolResult::error(format!("Unknown tool: {}", name))
}
