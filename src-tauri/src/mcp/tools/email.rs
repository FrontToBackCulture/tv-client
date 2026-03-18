// Email Campaign MCP Tools
// Campaign and group management for the email module

use crate::commands::email::campaigns::{self, CreateCampaign, UpdateCampaign};
use crate::mcp::protocol::{InputSchema, Tool, ToolResult};
use serde_json::{json, Value};

/// Define email module tools
pub fn tools() -> Vec<Tool> {
    vec![
        // Campaigns
        Tool {
            name: "list-email-campaigns".to_string(),
            description: "List email campaigns with optional filters (status, group, search).".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "status": { "type": "string", "enum": ["draft", "scheduled", "sending", "sent", "partial", "failed"], "description": "Filter by campaign status" },
                    "group_id": { "type": "string", "description": "Filter by email group ID" },
                    "search": { "type": "string", "description": "Search by campaign name or subject" },
                    "limit": { "type": "integer", "description": "Max results (default: 50)" }
                }),
                vec![],
            ),
        },
        Tool {
            name: "create-email-campaign".to_string(),
            description: "Create a new email campaign. Use list-email-groups first to get valid group IDs. Set content_path to the relative path of the campaign HTML file in tv-knowledge (e.g., '6_Marketing/external/campaigns/email-campaigns/2026-03-my-campaign.html').".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "name": { "type": "string", "description": "Campaign name (required)" },
                    "subject": { "type": "string", "description": "Email subject line (required)" },
                    "from_name": { "type": "string", "description": "Sender display name (required)" },
                    "from_email": { "type": "string", "description": "Sender email address (required, default: hello@thinkval.com)" },
                    "group_id": { "type": "string", "description": "Target email group ID" },
                    "content_path": { "type": "string", "description": "Relative path to campaign HTML file in tv-knowledge" },
                    "html_body": { "type": "string", "description": "Inline HTML body (use content_path instead for file-based campaigns)" },
                    "bcc_email": { "type": "string", "description": "BCC recipient email" },
                    "category": { "type": "string", "description": "Campaign category for organization" },
                    "status": { "type": "string", "enum": ["draft", "scheduled"], "description": "Initial status (default: draft)" }
                }),
                vec!["name".to_string(), "subject".to_string(), "from_name".to_string()],
            ),
        },
        Tool {
            name: "update-email-campaign".to_string(),
            description: "Update an existing email campaign's metadata (name, subject, group, etc.).".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "campaign_id": { "type": "string", "description": "The campaign UUID (required)" },
                    "name": { "type": "string" },
                    "subject": { "type": "string" },
                    "from_name": { "type": "string" },
                    "from_email": { "type": "string" },
                    "group_id": { "type": "string" },
                    "content_path": { "type": "string" },
                    "bcc_email": { "type": "string" },
                    "category": { "type": "string" },
                    "status": { "type": "string", "enum": ["draft", "scheduled"] }
                }),
                vec!["campaign_id".to_string()],
            ),
        },
        Tool {
            name: "delete-email-campaign".to_string(),
            description: "Delete an email campaign by ID. Only works for draft campaigns.".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "campaign_id": { "type": "string", "description": "The campaign UUID to delete" }
                }),
                vec!["campaign_id".to_string()],
            ),
        },
        // Groups
        Tool {
            name: "list-email-groups".to_string(),
            description: "List all email groups (contact lists). Use to find group IDs when creating campaigns.".to_string(),
            input_schema: InputSchema::with_properties(json!({}), vec![]),
        },
        Tool {
            name: "create-email-group".to_string(),
            description: "Create a new email group (contact list).".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "name": { "type": "string", "description": "Group name (required)" },
                    "description": { "type": "string", "description": "Group description" }
                }),
                vec!["name".to_string()],
            ),
        },
    ]
}

/// Handle email tool calls
pub async fn call(name: &str, args: Value) -> ToolResult {
    match name {
        "list-email-campaigns" => {
            let status = args.get("status").and_then(|v| v.as_str()).map(String::from);
            let group_id = args.get("group_id").and_then(|v| v.as_str()).map(String::from);
            let search = args.get("search").and_then(|v| v.as_str()).map(String::from);
            let limit = args.get("limit").and_then(|v| v.as_i64()).map(|n| n as i32);

            match campaigns::list_campaigns(status, group_id, search, limit).await {
                Ok(list) => ToolResult::json(&list),
                Err(e) => ToolResult::error(e.to_string()),
            }
        }

        "create-email-campaign" => {
            let name = match args.get("name").and_then(|v| v.as_str()) {
                Some(v) => v.to_string(),
                None => return ToolResult::error("name is required".to_string()),
            };
            let subject = match args.get("subject").and_then(|v| v.as_str()) {
                Some(v) => v.to_string(),
                None => return ToolResult::error("subject is required".to_string()),
            };
            let from_name = match args.get("from_name").and_then(|v| v.as_str()) {
                Some(v) => v.to_string(),
                None => return ToolResult::error("from_name is required".to_string()),
            };
            let from_email = args.get("from_email")
                .and_then(|v| v.as_str())
                .unwrap_or("hello@thinkval.com")
                .to_string();

            let data = CreateCampaign {
                name,
                subject,
                from_name,
                from_email,
                group_id: args.get("group_id").and_then(|v| v.as_str()).map(String::from),
                html_body: args.get("html_body").and_then(|v| v.as_str()).map(String::from),
                content_path: args.get("content_path").and_then(|v| v.as_str()).map(String::from),
                bcc_email: args.get("bcc_email").and_then(|v| v.as_str()).map(String::from),
                category: args.get("category").and_then(|v| v.as_str()).map(String::from),
                status: args.get("status").and_then(|v| v.as_str()).map(String::from),
            };

            match campaigns::create_campaign(data).await {
                Ok(campaign) => ToolResult::json(&campaign),
                Err(e) => ToolResult::error(e.to_string()),
            }
        }

        "update-email-campaign" => {
            let campaign_id = match args.get("campaign_id").and_then(|v| v.as_str()) {
                Some(v) => v,
                None => return ToolResult::error("campaign_id is required".to_string()),
            };

            let data = UpdateCampaign {
                name: args.get("name").and_then(|v| v.as_str()).map(String::from),
                subject: args.get("subject").and_then(|v| v.as_str()).map(String::from),
                from_name: args.get("from_name").and_then(|v| v.as_str()).map(String::from),
                from_email: args.get("from_email").and_then(|v| v.as_str()).map(String::from),
                group_id: args.get("group_id").and_then(|v| v.as_str()).map(String::from),
                html_body: args.get("html_body").and_then(|v| v.as_str()).map(String::from),
                content_path: args.get("content_path").and_then(|v| v.as_str()).map(String::from),
                bcc_email: args.get("bcc_email").and_then(|v| v.as_str()).map(String::from),
                category: args.get("category").and_then(|v| v.as_str()).map(String::from),
                status: args.get("status").and_then(|v| v.as_str()).map(String::from),
            };

            match campaigns::update_campaign(campaign_id, data).await {
                Ok(campaign) => ToolResult::json(&campaign),
                Err(e) => ToolResult::error(e.to_string()),
            }
        }

        "delete-email-campaign" => {
            let campaign_id = match args.get("campaign_id").and_then(|v| v.as_str()) {
                Some(v) => v,
                None => return ToolResult::error("campaign_id is required".to_string()),
            };

            match campaigns::delete_campaign(campaign_id).await {
                Ok(_) => ToolResult::text("Campaign deleted successfully".to_string()),
                Err(e) => ToolResult::error(e.to_string()),
            }
        }

        "list-email-groups" => {
            match campaigns::list_groups().await {
                Ok(groups) => ToolResult::json(&groups),
                Err(e) => ToolResult::error(e.to_string()),
            }
        }

        "create-email-group" => {
            let name = match args.get("name").and_then(|v| v.as_str()) {
                Some(v) => v,
                None => return ToolResult::error("name is required".to_string()),
            };
            let description = args.get("description").and_then(|v| v.as_str());

            match campaigns::create_group(name, description).await {
                Ok(group) => ToolResult::json(&group),
                Err(e) => ToolResult::error(e.to_string()),
            }
        }

        _ => ToolResult::error(format!("Unknown email tool: {}", name)),
    }
}
