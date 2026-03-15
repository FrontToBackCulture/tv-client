// MCP Tool Registry
// Defines and dispatches tools for Claude Code

pub mod work;
pub mod workspace;
pub mod crm;
pub mod generate;
pub mod intercom;
pub mod docgen;
pub mod val_sync;
pub mod feed;

use super::protocol::{Tool, ToolResult};
use serde_json::Value;

/// List all available tools
pub fn list_tools() -> Vec<Tool> {
    let mut tools = Vec::new();

    // Work module tools
    tools.extend(work::tools());

    // Workspace module tools
    tools.extend(workspace::tools());

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

    // Feed tools
    tools.extend(feed::tools());

    tools
}

/// Call a tool by name
pub async fn call_tool(name: &str, arguments: Value) -> ToolResult {
    // Workspace module tools (checked BEFORE work — "create-workspace" would match "create-work-*")
    if name.ends_with("-workspace") || name.ends_with("-workspaces") ||
       name.starts_with("get-workspace") || name.starts_with("create-workspace") ||
       name.starts_with("update-workspace") || name.starts_with("delete-workspace") ||
       name.starts_with("add-workspace-") || name.starts_with("remove-workspace-") ||
       name == "list-workspaces" {
        return workspace::call(name, arguments).await;
    }

    // Work module tools
    if name.starts_with("list-work-") || name.starts_with("get-work-") ||
       name.starts_with("create-work-") || name.starts_with("update-work-") ||
       name.starts_with("delete-work-") ||
       name == "add-project-to-initiative" || name == "remove-project-from-initiative" ||
       name == "list-initiative-projects" {
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
    if name.starts_with("sync-val-") || name.starts_with("sync-all-domain-") || name == "execute-val-sql" || name == "list-drive-files" || name == "check-all-domain-drive-files" {
        return val_sync::call(name, arguments).await;
    }

    // Feed tools
    if name.ends_with("-feed-card") || name.ends_with("-feed-cards") {
        return feed::call(name, arguments).await;
    }

    ToolResult::error(format!("Unknown tool: {}", name))
}
