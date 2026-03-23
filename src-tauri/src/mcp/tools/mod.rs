// MCP Tool Registry
// Defines and dispatches tools for Claude Code

pub mod work;
pub mod crm;
pub mod email;
pub mod generate;
pub mod intercom;
pub mod docgen;
pub mod val_sync;
pub mod feed;
pub mod discussions;
pub mod notifications;
pub mod blog;

use super::protocol::{Tool, ToolResult};
use serde_json::Value;

/// List all available tools
pub fn list_tools() -> Vec<Tool> {
    let mut tools = Vec::new();

    // Project module tools (projects, tasks, milestones, initiatives, labels, users)
    tools.extend(work::tools());

    // CRM module tools (companies, contacts, activities)
    tools.extend(crm::tools());

    // Email campaign tools
    tools.extend(email::tools());

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

    // Discussion tools
    tools.extend(discussions::tools());

    // Notification tools
    tools.extend(notifications::tools());

    // Blog tools
    tools.extend(blog::tools());

    tools
}

/// Call a tool by name
pub async fn call_tool(name: &str, arguments: Value) -> ToolResult {
    // Project module tools
    if name.starts_with("list-project") || name.starts_with("get-project") ||
       name.starts_with("create-project") || name.starts_with("update-project") ||
       name.starts_with("delete-project") ||
       name.starts_with("list-task") || name.starts_with("get-task") ||
       name.starts_with("create-task") || name.starts_with("update-task") ||
       name.starts_with("list-milestone") || name.starts_with("create-milestone") ||
       name.starts_with("update-milestone") ||
       name.starts_with("list-initiative") || name.starts_with("create-initiative") ||
       name.starts_with("update-initiative") || name.starts_with("delete-initiative") ||
       name == "add-project-to-initiative" || name == "remove-project-from-initiative" ||
       name == "list-initiative-projects" ||
       name.starts_with("list-label") || name.starts_with("create-label") ||
       name == "list-users" || name == "list-bots" ||
       name == "get-pipeline" ||
       name.starts_with("add-project-") || name.starts_with("remove-project-") {
        return work::call(name, arguments).await;
    }

    // CRM module tools (companies, contacts, activities only — deals are projects now)
    if name.starts_with("list-crm-") || name.starts_with("find-crm-") ||
       name.starts_with("get-crm-") || name.starts_with("create-crm-") ||
       name.starts_with("update-crm-") || name.starts_with("delete-crm-") ||
       name.starts_with("log-crm-") {
        return crm::call(name, arguments).await;
    }

    // Email campaign tools
    if name.starts_with("list-email-") || name.starts_with("create-email-") ||
       name.starts_with("update-email-") || name.starts_with("delete-email-") {
        return email::call(name, arguments).await;
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

    // Discussion tools
    if name.ends_with("-discussion") || name.ends_with("-discussions") {
        return discussions::call(name, arguments).await;
    }

    // Notification tools
    if name.ends_with("-notification") || name.ends_with("-notifications") || name.starts_with("mark-notification-") {
        return notifications::call(name, arguments).await;
    }

    // Blog tools
    if name.ends_with("-blog-article") || name.ends_with("-blog-articles") {
        return blog::call(name, arguments).await;
    }

    ToolResult::error(format!("Unknown tool: {}", name))
}
