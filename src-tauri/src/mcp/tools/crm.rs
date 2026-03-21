// CRM Module MCP Tools
// Company, contact, and activity management tools

use crate::commands::crm::{self, CreateActivity, CreateCompany, CreateContact, UpdateCompany, UpdateContact};
use crate::mcp::protocol::{InputSchema, Tool, ToolResult};
use serde_json::{json, Value};

/// Define CRM module tools
pub fn tools() -> Vec<Tool> {
    vec![
        // Companies
        Tool {
            name: "list-crm-companies".to_string(),
            description: "List companies in the CRM with optional filters".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "search": { "type": "string", "description": "Search by company name" },
                    "stage": { "type": "string", "enum": ["prospect", "opportunity", "client", "churned", "partner"] },
                    "industry": { "type": "string", "description": "Filter by industry" },
                    "limit": { "type": "integer", "description": "Max results to return (default: 50)" }
                }),
                vec![],
            ),
        },
        Tool {
            name: "find-crm-company".to_string(),
            description: "Find a company by name or domain. Use this before creating to avoid duplicates.".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "name": { "type": "string", "description": "Company name to search for" },
                    "domain": { "type": "string", "description": "Website domain to match (e.g., 'koi.com')" }
                }),
                vec![],
            ),
        },
        Tool {
            name: "get-crm-company".to_string(),
            description: "Get full details for a company by ID, including contacts and recent activity.".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "company_id": { "type": "string", "description": "The company UUID" },
                    "include_relations": { "type": "boolean", "description": "Include contacts and activities" }
                }),
                vec!["company_id".to_string()],
            ),
        },
        Tool {
            name: "create-crm-company".to_string(),
            description: "Create a new company in the CRM. Use find-crm-company first to check if it exists.".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "name": { "type": "string", "description": "Company name (required)" },
                    "display_name": { "type": "string", "description": "Display name if different from name" },
                    "industry": { "type": "string", "description": "Industry category" },
                    "website": { "type": "string", "description": "Company website URL" },
                    "stage": { "type": "string", "enum": ["prospect", "opportunity", "client", "churned", "partner"], "description": "Relationship stage (default: prospect)" },
                    "source": { "type": "string", "enum": ["apollo", "inbound", "referral", "manual", "existing"], "description": "Lead source" },
                    "notes": { "type": "string", "description": "Notes about the company" },
                    "tags": { "type": "array", "items": { "type": "string" }, "description": "Tags for categorization" }
                }),
                vec!["name".to_string()],
            ),
        },
        Tool {
            name: "update-crm-company".to_string(),
            description: "Update an existing company's details.".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "company_id": { "type": "string", "description": "The company UUID (required)" },
                    "name": { "type": "string" },
                    "display_name": { "type": "string" },
                    "industry": { "type": "string" },
                    "website": { "type": "string" },
                    "stage": { "type": "string", "enum": ["prospect", "opportunity", "client", "churned", "partner"] },
                    "client_folder_path": { "type": "string", "description": "Path to client folder in knowledge base" },
                    "domain_id": { "type": "string", "description": "VAL domain ID if client" },
                    "notes": { "type": "string" },
                    "tags": { "type": "array", "items": { "type": "string" } }
                }),
                vec!["company_id".to_string()],
            ),
        },
        Tool {
            name: "delete-crm-company".to_string(),
            description: "Delete a company and all related records (contacts, activities).".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "company_id": { "type": "string", "description": "The company UUID" }
                }),
                vec!["company_id".to_string()],
            ),
        },
        // Contacts
        Tool {
            name: "list-crm-contacts".to_string(),
            description: "List contacts, optionally filtered by company.".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "company_id": { "type": "string", "description": "Filter by company UUID" },
                    "search": { "type": "string", "description": "Search by name or email" }
                }),
                vec![],
            ),
        },
        Tool {
            name: "find-crm-contact".to_string(),
            description: "Find a contact by email address.".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "email": { "type": "string", "description": "Email address to search for" }
                }),
                vec!["email".to_string()],
            ),
        },
        Tool {
            name: "create-crm-contact".to_string(),
            description: "Create a new contact for a company.".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "company_id": { "type": "string", "description": "Company UUID (required)" },
                    "name": { "type": "string", "description": "Contact name (required)" },
                    "email": { "type": "string", "description": "Email address (required)" },
                    "phone": { "type": "string" },
                    "role": { "type": "string", "description": "Job title/role" },
                    "department": { "type": "string" },
                    "is_primary": { "type": "boolean", "description": "Set as primary contact for company" },
                    "notes": { "type": "string" },
                    "linkedin_url": { "type": "string" }
                }),
                vec!["company_id".to_string(), "name".to_string(), "email".to_string()],
            ),
        },
        Tool {
            name: "update-crm-contact".to_string(),
            description: "Update an existing contact.".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "contact_id": { "type": "string", "description": "Contact UUID (required)" },
                    "name": { "type": "string" },
                    "email": { "type": "string" },
                    "phone": { "type": "string" },
                    "role": { "type": "string" },
                    "department": { "type": "string" },
                    "is_primary": { "type": "boolean" },
                    "is_active": { "type": "boolean" },
                    "notes": { "type": "string" },
                    "linkedin_url": { "type": "string" }
                }),
                vec!["contact_id".to_string()],
            ),
        },
        // Activities
        Tool {
            name: "log-crm-activity".to_string(),
            description: "Log an activity (note, call, meeting) for a company or project.".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "company_id": { "type": "string", "description": "Company UUID (optional)" },
                    "type": { "type": "string", "enum": ["note", "call", "meeting", "email", "task"], "description": "Activity type (required)" },
                    "subject": { "type": "string", "description": "Activity subject/title" },
                    "content": { "type": "string", "description": "Activity content/notes" },
                    "contact_id": { "type": "string", "description": "Link to a contact (optional)" },
                    "project_id": { "type": "string", "description": "Link to a project (optional)" },
                    "activity_date": { "type": "string", "description": "When the activity occurred (ISO date, default: now)" }
                }),
                vec!["type".to_string()],
            ),
        },
        Tool {
            name: "list-crm-activities".to_string(),
            description: "List activities for a company or project.".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "company_id": { "type": "string", "description": "Filter by company UUID" },
                    "project_id": { "type": "string", "description": "Filter by project UUID" },
                    "type": { "type": "string", "enum": ["note", "call", "meeting", "email", "task", "stage_change"] },
                    "limit": { "type": "integer", "description": "Max results (default: 20)" }
                }),
                vec![],
            ),
        },
    ]
}

/// Call a CRM module tool
pub async fn call(name: &str, args: Value) -> ToolResult {
    match name {
        // Companies
        "list-crm-companies" => {
            let search = args.get("search").and_then(|v| v.as_str()).map(|s| s.to_string());
            let stage = args.get("stage").and_then(|v| v.as_str()).map(|s| s.to_string());
            let industry = args.get("industry").and_then(|v| v.as_str()).map(|s| s.to_string());
            let limit = args.get("limit").and_then(|v| v.as_i64()).map(|n| n as i32);
            match crm::crm_list_companies(search, stage, industry, limit).await {
                Ok(companies) => ToolResult::json(&companies),
                Err(e) => ToolResult::error(e.to_string()),
            }
        }
        "find-crm-company" => {
            let name = args.get("name").and_then(|v| v.as_str()).map(|s| s.to_string());
            let domain = args.get("domain").and_then(|v| v.as_str()).map(|s| s.to_string());
            match crm::crm_find_company(name, domain).await {
                Ok(company) => ToolResult::json(&company),
                Err(e) => ToolResult::error(e.to_string()),
            }
        }
        "get-crm-company" => {
            let company_id = match args.get("company_id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => return ToolResult::error("company_id is required".to_string()),
            };
            let include_relations = args.get("include_relations").and_then(|v| v.as_bool());
            match crm::crm_get_company(company_id, include_relations).await {
                Ok(company) => ToolResult::json(&company),
                Err(e) => ToolResult::error(e.to_string()),
            }
        }
        "create-crm-company" => {
            let data: CreateCompany = match serde_json::from_value(args) {
                Ok(d) => d,
                Err(e) => return ToolResult::error(format!("Invalid parameters: {}", e)),
            };
            match crm::crm_create_company(data).await {
                Ok(company) => ToolResult::json(&company),
                Err(e) => ToolResult::error(e.to_string()),
            }
        }
        "update-crm-company" => {
            let company_id = match args.get("company_id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => return ToolResult::error("company_id is required".to_string()),
            };
            let mut data_args = args.clone();
            if let Some(obj) = data_args.as_object_mut() {
                obj.remove("company_id");
            }
            let data: UpdateCompany = match serde_json::from_value(data_args) {
                Ok(d) => d,
                Err(e) => return ToolResult::error(format!("Invalid parameters: {}", e)),
            };
            match crm::crm_update_company(company_id, data).await {
                Ok(company) => ToolResult::json(&company),
                Err(e) => ToolResult::error(e.to_string()),
            }
        }
        "delete-crm-company" => {
            let company_id = match args.get("company_id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => return ToolResult::error("company_id is required".to_string()),
            };
            match crm::crm_delete_company(company_id).await {
                Ok(()) => ToolResult::text("Company deleted successfully".to_string()),
                Err(e) => ToolResult::error(e.to_string()),
            }
        }

        // Contacts
        "list-crm-contacts" => {
            let company_id = args.get("company_id").and_then(|v| v.as_str()).map(|s| s.to_string());
            let search = args.get("search").and_then(|v| v.as_str()).map(|s| s.to_string());
            match crm::crm_list_contacts(company_id, search).await {
                Ok(contacts) => ToolResult::json(&contacts),
                Err(e) => ToolResult::error(e.to_string()),
            }
        }
        "find-crm-contact" => {
            let email = match args.get("email").and_then(|v| v.as_str()) {
                Some(e) => e.to_string(),
                None => return ToolResult::error("email is required".to_string()),
            };
            match crm::crm_find_contact(email).await {
                Ok(contact) => ToolResult::json(&contact),
                Err(e) => ToolResult::error(e.to_string()),
            }
        }
        "create-crm-contact" => {
            let data: CreateContact = match serde_json::from_value(args) {
                Ok(d) => d,
                Err(e) => return ToolResult::error(format!("Invalid parameters: {}", e)),
            };
            match crm::crm_create_contact(data).await {
                Ok(contact) => ToolResult::json(&contact),
                Err(e) => ToolResult::error(e.to_string()),
            }
        }
        "update-crm-contact" => {
            let contact_id = match args.get("contact_id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => return ToolResult::error("contact_id is required".to_string()),
            };
            let mut data_args = args.clone();
            if let Some(obj) = data_args.as_object_mut() {
                obj.remove("contact_id");
            }
            let data: UpdateContact = match serde_json::from_value(data_args) {
                Ok(d) => d,
                Err(e) => return ToolResult::error(format!("Invalid parameters: {}", e)),
            };
            match crm::crm_update_contact(contact_id, data).await {
                Ok(contact) => ToolResult::json(&contact),
                Err(e) => ToolResult::error(e.to_string()),
            }
        }

        // Activities
        "log-crm-activity" => {
            let data: CreateActivity = match serde_json::from_value(args) {
                Ok(d) => d,
                Err(e) => return ToolResult::error(format!("Invalid parameters: {}", e)),
            };
            match crm::crm_log_activity(data).await {
                Ok(activity) => ToolResult::json(&activity),
                Err(e) => ToolResult::error(e.to_string()),
            }
        }
        "list-crm-activities" => {
            let company_id = args.get("company_id").and_then(|v| v.as_str()).map(|s| s.to_string());
            let project_id = args.get("project_id").and_then(|v| v.as_str()).map(|s| s.to_string());
            let activity_type = args.get("type").and_then(|v| v.as_str()).map(|s| s.to_string());
            let limit = args.get("limit").and_then(|v| v.as_i64()).map(|n| n as i32);
            match crm::crm_list_activities(company_id, None, project_id, activity_type, limit).await {
                Ok(activities) => ToolResult::json(&activities),
                Err(e) => ToolResult::error(e.to_string()),
            }
        }

        _ => ToolResult::error(format!("Unknown CRM tool: {}", name)),
    }
}
