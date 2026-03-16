// Workspace MCP Tools
// Collaboration workspace management tools

use crate::commands::workspace::{
    self, CreateWorkspace, CreateWorkspaceArtifact, CreateWorkspaceSession, UpdateWorkspace,
    UpdateWorkspaceSession, UpsertWorkspaceContext,
};
use crate::mcp::protocol::{InputSchema, Tool, ToolResult};
use serde_json::{json, Value};

/// Define Workspace module tools
pub fn tools() -> Vec<Tool> {
    vec![
        // Workspaces
        Tool {
            name: "list-workspaces".to_string(),
            description: "List workspaces (lightweight summary, no nested sessions/artifacts). Use get-workspace for full detail.".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "status": {
                        "type": "string",
                        "enum": ["open", "active", "in_progress", "done", "paused"],
                        "description": "Filter by status"
                    },
                    "owner": {
                        "type": "string",
                        "description": "Filter by owner name"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max results to return (default 20, max 100)"
                    }
                }),
                vec![],
            ),
        },
        Tool {
            name: "get-workspace".to_string(),
            description: "Get a workspace with all sessions, artifacts, and context. Use this to load workspace context when continuing work.".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "workspace_id": {
                        "type": "string",
                        "description": "The workspace UUID"
                    }
                }),
                vec!["workspace_id".to_string()],
            ),
        },
        Tool {
            name: "create-workspace".to_string(),
            description: "Create a new collaboration workspace".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "title": { "type": "string", "description": "Workspace title (required)" },
                    "description": { "type": "string", "description": "What this workspace is about" },
                    "owner": { "type": "string", "description": "Owner name (required)" },
                    "intent": { "type": "string", "enum": ["skill_review", "skill_creation", "feature_build"], "description": "Workspace intent type — determines standard task templates" },
                    "initiative_id": { "type": "string", "description": "Initiative UUID to link to" }
                }),
                vec!["title".to_string(), "owner".to_string()],
            ),
        },
        Tool {
            name: "update-workspace".to_string(),
            description: "Update a workspace (title, description, status)".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "workspace_id": { "type": "string", "description": "The workspace UUID (required)" },
                    "title": { "type": "string" },
                    "description": { "type": "string" },
                    "status": { "type": "string", "enum": ["open", "active", "in_progress", "done", "paused"] },
                    "intent": { "type": "string", "enum": ["skill_review", "skill_creation", "feature_build"], "description": "Workspace intent type" },
                    "initiative_id": { "type": "string", "description": "Initiative UUID to link to" }
                }),
                vec!["workspace_id".to_string()],
            ),
        },
        Tool {
            name: "delete-workspace".to_string(),
            description: "Delete a workspace and all its sessions, artifacts, and context".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "workspace_id": { "type": "string", "description": "The workspace UUID (required)" }
                }),
                vec!["workspace_id".to_string()],
            ),
        },
        // Sessions
        Tool {
            name: "add-workspace-session".to_string(),
            description: "Add a session entry to a project (Work, Deal, or Workspace type — one per Claude Code conversation)".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "workspace_id": { "type": "string", "description": "Project UUID — works with Work, Deal, or Workspace type projects (required)" },
                    "date": { "type": "string", "description": "Session date YYYY-MM-DD (defaults to today)" },
                    "summary": { "type": "string", "description": "What was accomplished this session" },
                    "decisions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "decision": { "type": "string" },
                                "rationale": { "type": "string" }
                            }
                        },
                        "description": "Key decisions made"
                    },
                    "next_steps": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "What needs to happen next"
                    },
                    "open_questions": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Unresolved questions"
                    },
                    "notes": { "type": "string", "description": "Freeform session notes / discussion log (markdown)" },
                    "conversation_id": { "type": "string", "description": "Claude Code conversation UUID (auto-detected from ~/.claude transcript files)" }
                }),
                vec!["workspace_id".to_string()],
            ),
        },
        Tool {
            name: "update-workspace-session".to_string(),
            description: "Update an existing session entry (e.g. append notes, update summary, add decisions)".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "session_id": { "type": "string", "description": "Session UUID (required)" },
                    "summary": { "type": "string", "description": "Updated summary" },
                    "decisions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "decision": { "type": "string" },
                                "rationale": { "type": "string" }
                            }
                        },
                        "description": "Key decisions made"
                    },
                    "next_steps": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "What needs to happen next"
                    },
                    "open_questions": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Unresolved questions"
                    },
                    "notes": { "type": "string", "description": "Freeform session notes / discussion log (markdown)" }
                }),
                vec!["session_id".to_string()],
            ),
        },
        // Artifacts
        Tool {
            name: "add-workspace-artifact".to_string(),
            description: "Link an artifact (file, skill, deal, task, etc.) to a project (Work, Deal, or Workspace type)".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "workspace_id": { "type": "string", "description": "Project UUID — works with Work, Deal, or Workspace type projects (required)" },
                    "session_id": { "type": "string", "description": "Session UUID that created this artifact" },
                    "type": {
                        "type": "string",
                        "enum": ["skill", "doc", "crm_deal", "crm_company", "task", "domain", "code", "report", "proposal", "order_form", "other"],
                        "description": "Artifact type (required)"
                    },
                    "reference": { "type": "string", "description": "File path or entity ID (required)" },
                    "label": { "type": "string", "description": "Human-readable name (required)" },
                    "preview_content": { "type": "string", "description": "Markdown content for inline preview in tv-client" }
                }),
                vec!["workspace_id".to_string(), "type".to_string(), "reference".to_string(), "label".to_string()],
            ),
        },
        Tool {
            name: "remove-workspace-artifact".to_string(),
            description: "Remove an artifact from a workspace".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "artifact_id": { "type": "string", "description": "Artifact UUID (required)" }
                }),
                vec!["artifact_id".to_string()],
            ),
        },
        // Context
        Tool {
            name: "update-workspace-context".to_string(),
            description: "Update the rolling context summary for a workspace. This is what gets loaded when cold-starting a new conversation.".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "workspace_id": { "type": "string", "description": "Workspace UUID (required)" },
                    "context_summary": { "type": "string", "description": "Rolling summary of all work done" },
                    "current_state": { "type": "string", "description": "Where things stand right now" },
                    "key_decisions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "decision": { "type": "string" },
                                "rationale": { "type": "string" }
                            }
                        },
                        "description": "Accumulated key decisions"
                    }
                }),
                vec!["workspace_id".to_string()],
            ),
        },
    ]
}

/// Call a Workspace module tool
pub async fn call(name: &str, args: Value) -> ToolResult {
    match name {
        // Workspaces
        "list-workspaces" => {
            let status = args.get("status").and_then(|v| v.as_str()).map(|s| s.to_string());
            let owner = args.get("owner").and_then(|v| v.as_str()).map(|s| s.to_string());
            let limit = args.get("limit").and_then(|v| v.as_u64()).map(|n| n as u32);
            match workspace::workspace_list(status, owner, limit).await {
                Ok(workspaces) => ToolResult::json(&workspaces),
                Err(e) => ToolResult::error(e.to_string()),
            }
        }
        "get-workspace" => {
            let workspace_id = match args.get("workspace_id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => return ToolResult::error("workspace_id is required".to_string()),
            };
            match workspace::workspace_get(workspace_id).await {
                Ok(ws) => ToolResult::json(&ws),
                Err(e) => ToolResult::error(e.to_string()),
            }
        }
        "create-workspace" => {
            let data: CreateWorkspace = match serde_json::from_value(args) {
                Ok(d) => d,
                Err(e) => return ToolResult::error(format!("Invalid parameters: {}", e)),
            };
            match workspace::workspace_create(data).await {
                Ok(ws) => ToolResult::json(&ws),
                Err(e) => ToolResult::error(e.to_string()),
            }
        }
        "update-workspace" => {
            let workspace_id = match args.get("workspace_id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => return ToolResult::error("workspace_id is required".to_string()),
            };
            let mut data_args = args.clone();
            if let Some(obj) = data_args.as_object_mut() {
                obj.remove("workspace_id");
            }
            let data: UpdateWorkspace = match serde_json::from_value(data_args) {
                Ok(d) => d,
                Err(e) => return ToolResult::error(format!("Invalid parameters: {}", e)),
            };
            match workspace::workspace_update(workspace_id, data).await {
                Ok(ws) => ToolResult::json(&ws),
                Err(e) => ToolResult::error(e.to_string()),
            }
        }
        "delete-workspace" => {
            let workspace_id = match args.get("workspace_id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => return ToolResult::error("workspace_id is required".to_string()),
            };
            match workspace::workspace_delete(workspace_id).await {
                Ok(()) => ToolResult::text("Workspace deleted successfully.".to_string()),
                Err(e) => ToolResult::error(e.to_string()),
            }
        }

        // Sessions
        "add-workspace-session" => {
            let data: CreateWorkspaceSession = match serde_json::from_value(args) {
                Ok(d) => d,
                Err(e) => return ToolResult::error(format!("Invalid parameters: {}", e)),
            };
            match workspace::workspace_add_session(data).await {
                Ok(session) => ToolResult::json(&session),
                Err(e) => ToolResult::error(e.to_string()),
            }
        }

        "update-workspace-session" => {
            let session_id = match args.get("session_id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => return ToolResult::error("session_id is required".to_string()),
            };
            let mut data_args = args.clone();
            if let Some(obj) = data_args.as_object_mut() {
                obj.remove("session_id");
            }
            let data: UpdateWorkspaceSession = match serde_json::from_value(data_args) {
                Ok(d) => d,
                Err(e) => return ToolResult::error(format!("Invalid parameters: {}", e)),
            };
            match workspace::workspace_update_session(session_id, data).await {
                Ok(session) => ToolResult::json(&session),
                Err(e) => ToolResult::error(e.to_string()),
            }
        }

        // Artifacts
        "add-workspace-artifact" => {
            let data: CreateWorkspaceArtifact = match serde_json::from_value(args) {
                Ok(d) => d,
                Err(e) => return ToolResult::error(format!("Invalid parameters: {}", e)),
            };
            match workspace::workspace_add_artifact(data).await {
                Ok(artifact) => ToolResult::json(&artifact),
                Err(e) => ToolResult::error(e.to_string()),
            }
        }
        "remove-workspace-artifact" => {
            let artifact_id = match args.get("artifact_id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => return ToolResult::error("artifact_id is required".to_string()),
            };
            match workspace::workspace_remove_artifact(artifact_id).await {
                Ok(()) => ToolResult::text("Artifact removed successfully.".to_string()),
                Err(e) => ToolResult::error(e.to_string()),
            }
        }

        // Context
        "update-workspace-context" => {
            let data: UpsertWorkspaceContext = match serde_json::from_value(args) {
                Ok(d) => d,
                Err(e) => return ToolResult::error(format!("Invalid parameters: {}", e)),
            };
            match workspace::workspace_update_context(data).await {
                Ok(ctx) => ToolResult::json(&ctx),
                Err(e) => ToolResult::error(e.to_string()),
            }
        }

        _ => ToolResult::error(format!("Unknown workspace tool: {}", name)),
    }
}
