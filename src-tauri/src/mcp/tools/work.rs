// Work Module MCP Tools
// Task and project management tools

use crate::commands::work::{
    self, CreateInitiative, CreateLabel, CreateMilestone, CreateProject, CreateProjectUpdate,
    CreateTask, UpdateInitiative, UpdateMilestone, UpdateProject, UpdateTask,
};
use crate::mcp::protocol::{InputSchema, Tool, ToolResult};
use serde_json::{json, Value};

/// Define Work module tools
pub fn tools() -> Vec<Tool> {
    vec![
        // Projects
        Tool {
            name: "list-work-projects".to_string(),
            description: "List all projects in the Work module".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "include_statuses": {
                        "type": "boolean",
                        "description": "Include task statuses for each project"
                    }
                }),
                vec![],
            ),
        },
        Tool {
            name: "get-work-project".to_string(),
            description: "Get details for a specific project by ID".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "project_id": {
                        "type": "string",
                        "description": "The project UUID"
                    }
                }),
                vec!["project_id".to_string()],
            ),
        },
        Tool {
            name: "create-work-project".to_string(),
            description: "Create a new project with default statuses".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "name": { "type": "string", "description": "Project name (required)" },
                    "description": { "type": "string", "description": "Project description" },
                    "slug": { "type": "string", "description": "URL-friendly identifier" },
                    "icon": { "type": "string", "description": "Icon identifier" },
                    "color": { "type": "string", "description": "Hex color" },
                    "identifier_prefix": { "type": "string", "description": "Task ID prefix (e.g., 'PRD')" }
                }),
                vec!["name".to_string()],
            ),
        },
        Tool {
            name: "update-work-project".to_string(),
            description: "Update an existing project".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "project_id": { "type": "string", "description": "The project UUID (required)" },
                    "name": { "type": "string", "description": "New project name" },
                    "description": { "type": "string", "description": "New description" },
                    "health": { "type": "string", "enum": ["on_track", "at_risk", "off_track"] },
                    "priority": { "type": "integer", "enum": [0, 1, 2, 3, 4] },
                    "status": { "type": "string", "enum": ["planned", "active", "completed", "paused"] },
                    "target_date": { "type": "string", "description": "Target date (YYYY-MM-DD)" }
                }),
                vec!["project_id".to_string()],
            ),
        },
        Tool {
            name: "delete-work-project".to_string(),
            description: "Delete a project (soft delete via archived_at).".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "project_id": { "type": "string", "description": "The project UUID (required)" }
                }),
                vec!["project_id".to_string()],
            ),
        },
        // Tasks
        Tool {
            name: "list-work-tasks".to_string(),
            description: "List tasks with optional filters".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "project_id": { "type": "string", "description": "Filter by project UUID" },
                    "status_id": { "type": "string", "description": "Filter by status UUID" },
                    "status_type": { "type": "string", "enum": ["backlog", "unstarted", "started", "review", "completed", "canceled"] },
                    "assignee_id": { "type": "string", "description": "Filter by assignee UUID" },
                    "milestone_id": { "type": "string", "description": "Filter by milestone UUID" }
                }),
                vec![],
            ),
        },
        Tool {
            name: "get-work-task".to_string(),
            description: "Get details for a specific task by ID".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "task_id": { "type": "string", "description": "The task UUID" }
                }),
                vec!["task_id".to_string()],
            ),
        },
        Tool {
            name: "create-work-task".to_string(),
            description: "Create a new task in a project".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "project_id": { "type": "string", "description": "Project UUID (required)" },
                    "status_id": { "type": "string", "description": "Status UUID (required)" },
                    "title": { "type": "string", "description": "Task title (required)" },
                    "description": { "type": "string", "description": "Task description" },
                    "priority": { "type": "integer", "description": "Priority: 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low" },
                    "due_date": { "type": "string", "description": "Due date (YYYY-MM-DD)" },
                    "assignee_id": { "type": "string", "description": "Assignee UUID" },
                    "milestone_id": { "type": "string", "description": "Milestone UUID" },
                    "depends_on": { "type": "array", "items": { "type": "string" }, "description": "Task IDs this depends on" },
                    "session_ref": { "type": "string", "description": "Session folder path" },
                    "requires_review": { "type": "boolean", "description": "Requires human review" },
                    "crm_deal_id": { "type": "string", "description": "CRM deal UUID to link this task to" }
                }),
                vec!["project_id".to_string(), "status_id".to_string(), "title".to_string()],
            ),
        },
        Tool {
            name: "update-work-task".to_string(),
            description: "Update an existing task".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "task_id": { "type": "string", "description": "The task UUID (required)" },
                    "title": { "type": "string" },
                    "description": { "type": "string" },
                    "status_id": { "type": "string" },
                    "priority": { "type": "integer" },
                    "due_date": { "type": "string" },
                    "assignee_id": { "type": "string" },
                    "milestone_id": { "type": "string" },
                    "depends_on": { "type": "array", "items": { "type": "string" } },
                    "session_ref": { "type": "string" },
                    "requires_review": { "type": "boolean" },
                    "crm_deal_id": { "type": "string", "description": "CRM deal UUID to link this task to" }
                }),
                vec!["task_id".to_string()],
            ),
        },
        // Milestones
        Tool {
            name: "list-work-milestones".to_string(),
            description: "List milestones for a project".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "project_id": { "type": "string", "description": "The project UUID" }
                }),
                vec!["project_id".to_string()],
            ),
        },
        Tool {
            name: "create-work-milestone".to_string(),
            description: "Create a new milestone for a project".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "project_id": { "type": "string", "description": "Project UUID (required)" },
                    "name": { "type": "string", "description": "Milestone name (required)" },
                    "description": { "type": "string", "description": "Milestone description" },
                    "target_date": { "type": "string", "description": "Target date (YYYY-MM-DD)" }
                }),
                vec!["project_id".to_string(), "name".to_string()],
            ),
        },
        Tool {
            name: "update-work-milestone".to_string(),
            description: "Update an existing milestone".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "milestone_id": { "type": "string", "description": "The milestone UUID (required)" },
                    "name": { "type": "string" },
                    "description": { "type": "string" },
                    "target_date": { "type": "string" }
                }),
                vec!["milestone_id".to_string()],
            ),
        },
        // Initiatives
        Tool {
            name: "list-work-initiatives".to_string(),
            description: "List all initiatives".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "include": { "type": "string", "enum": ["progress", "projects"], "description": "Include additional data" }
                }),
                vec![],
            ),
        },
        Tool {
            name: "create-work-initiative".to_string(),
            description: "Create a new initiative (strategic layer above projects)".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "name": { "type": "string", "description": "Initiative name (required)" },
                    "description": { "type": "string" },
                    "slug": { "type": "string" },
                    "icon": { "type": "string" },
                    "color": { "type": "string" },
                    "owner": { "type": "string" },
                    "status": { "type": "string", "enum": ["planned", "active", "completed", "paused"] },
                    "health": { "type": "string", "enum": ["on_track", "at_risk", "off_track"] },
                    "target_date": { "type": "string" }
                }),
                vec!["name".to_string()],
            ),
        },
        Tool {
            name: "update-work-initiative".to_string(),
            description: "Update an existing initiative".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "initiative_id": { "type": "string", "description": "The initiative UUID (required)" },
                    "name": { "type": "string" },
                    "description": { "type": "string" },
                    "owner": { "type": "string" },
                    "status": { "type": "string", "enum": ["planned", "active", "completed", "paused"] },
                    "health": { "type": "string", "enum": ["on_track", "at_risk", "off_track"] },
                    "target_date": { "type": "string" }
                }),
                vec!["initiative_id".to_string()],
            ),
        },
        Tool {
            name: "delete-work-initiative".to_string(),
            description: "Delete an initiative (soft delete via archived_at).".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "initiative_id": { "type": "string", "description": "The initiative UUID (required)" }
                }),
                vec!["initiative_id".to_string()],
            ),
        },
        // Initiative-Project linking
        Tool {
            name: "add-project-to-initiative".to_string(),
            description: "Link a project to an initiative. A project can only belong to one initiative.".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "initiative_id": { "type": "string", "description": "The initiative UUID (required)" },
                    "project_id": { "type": "string", "description": "The project UUID to add (required)" }
                }),
                vec!["initiative_id".to_string(), "project_id".to_string()],
            ),
        },
        Tool {
            name: "remove-project-from-initiative".to_string(),
            description: "Remove a project from an initiative.".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "initiative_id": { "type": "string", "description": "The initiative UUID (required)" },
                    "project_id": { "type": "string", "description": "The project UUID to remove (required)" }
                }),
                vec!["initiative_id".to_string(), "project_id".to_string()],
            ),
        },
        Tool {
            name: "list-initiative-projects".to_string(),
            description: "List all projects within an initiative.".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "initiative_id": { "type": "string", "description": "The initiative UUID (required)" }
                }),
                vec!["initiative_id".to_string()],
            ),
        },
        // Labels
        Tool {
            name: "list-work-labels".to_string(),
            description: "List all labels in the Work module".to_string(),
            input_schema: InputSchema::empty(),
        },
        Tool {
            name: "create-work-label".to_string(),
            description: "Create a new label".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "name": { "type": "string", "description": "Label name (required)" },
                    "color": { "type": "string", "description": "Hex color" },
                    "description": { "type": "string" }
                }),
                vec!["name".to_string()],
            ),
        },
        // Users
        Tool {
            name: "list-work-users".to_string(),
            description: "List all users (humans and bots) in the Work module".to_string(),
            input_schema: InputSchema::empty(),
        },
        Tool {
            name: "list-work-bots".to_string(),
            description: "List all bots registered in the Work module".to_string(),
            input_schema: InputSchema::empty(),
        },
        // Project updates
        Tool {
            name: "list-work-project-updates".to_string(),
            description: "List status updates for a project".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "project_id": { "type": "string", "description": "The project UUID" }
                }),
                vec!["project_id".to_string()],
            ),
        },
        Tool {
            name: "create-work-project-update".to_string(),
            description: "Create a status update for a project".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "project_id": { "type": "string", "description": "The project UUID (required)" },
                    "content": { "type": "string", "description": "Update content (required)" },
                    "health": { "type": "string", "enum": ["on_track", "at_risk", "off_track"] },
                    "created_by": { "type": "string", "description": "User UUID of creator" }
                }),
                vec!["project_id".to_string(), "content".to_string()],
            ),
        },
    ]
}

/// Call a Work module tool
pub async fn call(name: &str, args: Value) -> ToolResult {
    match name {
        // Projects
        "list-work-projects" => {
            let include_statuses = args.get("include_statuses").and_then(|v| v.as_bool());
            match work::work_list_projects(include_statuses).await {
                Ok(projects) => ToolResult::json(&projects),
                Err(e) => ToolResult::error(e),
            }
        }
        "get-work-project" => {
            let project_id = match args.get("project_id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => return ToolResult::error("project_id is required".to_string()),
            };
            match work::work_get_project(project_id).await {
                Ok(project) => ToolResult::json(&project),
                Err(e) => ToolResult::error(e),
            }
        }
        "create-work-project" => {
            let data: CreateProject = match serde_json::from_value(args) {
                Ok(d) => d,
                Err(e) => return ToolResult::error(format!("Invalid parameters: {}", e)),
            };
            match work::work_create_project(data).await {
                Ok(project) => ToolResult::json(&project),
                Err(e) => ToolResult::error(e),
            }
        }
        "update-work-project" => {
            let project_id = match args.get("project_id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => return ToolResult::error("project_id is required".to_string()),
            };
            let mut data_args = args.clone();
            if let Some(obj) = data_args.as_object_mut() {
                obj.remove("project_id");
            }
            let data: UpdateProject = match serde_json::from_value(data_args) {
                Ok(d) => d,
                Err(e) => return ToolResult::error(format!("Invalid parameters: {}", e)),
            };
            match work::work_update_project(project_id, data).await {
                Ok(project) => ToolResult::json(&project),
                Err(e) => ToolResult::error(e),
            }
        }
        "delete-work-project" => {
            let project_id = match args.get("project_id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => return ToolResult::error("project_id is required".to_string()),
            };
            match work::work_delete_project(project_id).await {
                Ok(()) => ToolResult::text("Project deleted successfully.".to_string()),
                Err(e) => ToolResult::error(e),
            }
        }

        // Tasks
        "list-work-tasks" => {
            let project_id = args.get("project_id").and_then(|v| v.as_str()).map(|s| s.to_string());
            let status_id = args.get("status_id").and_then(|v| v.as_str()).map(|s| s.to_string());
            let status_type = args.get("status_type").and_then(|v| v.as_str()).map(|s| s.to_string());
            let assignee_id = args.get("assignee_id").and_then(|v| v.as_str()).map(|s| s.to_string());
            let milestone_id = args.get("milestone_id").and_then(|v| v.as_str()).map(|s| s.to_string());
            match work::work_list_tasks(project_id, status_id, status_type, assignee_id, milestone_id).await {
                Ok(tasks) => ToolResult::json(&tasks),
                Err(e) => ToolResult::error(e),
            }
        }
        "get-work-task" => {
            let task_id = match args.get("task_id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => return ToolResult::error("task_id is required".to_string()),
            };
            match work::work_get_task(task_id).await {
                Ok(task) => ToolResult::json(&task),
                Err(e) => ToolResult::error(e),
            }
        }
        "create-work-task" => {
            let data: CreateTask = match serde_json::from_value(args) {
                Ok(d) => d,
                Err(e) => return ToolResult::error(format!("Invalid parameters: {}", e)),
            };
            match work::work_create_task(data).await {
                Ok(task) => ToolResult::json(&task),
                Err(e) => ToolResult::error(e),
            }
        }
        "update-work-task" => {
            let task_id = match args.get("task_id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => return ToolResult::error("task_id is required".to_string()),
            };
            let mut data_args = args.clone();
            if let Some(obj) = data_args.as_object_mut() {
                obj.remove("task_id");
            }
            let data: UpdateTask = match serde_json::from_value(data_args) {
                Ok(d) => d,
                Err(e) => return ToolResult::error(format!("Invalid parameters: {}", e)),
            };
            match work::work_update_task(task_id, data).await {
                Ok(task) => ToolResult::json(&task),
                Err(e) => ToolResult::error(e),
            }
        }

        // Milestones
        "list-work-milestones" => {
            let project_id = match args.get("project_id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => return ToolResult::error("project_id is required".to_string()),
            };
            match work::work_list_milestones(project_id).await {
                Ok(milestones) => ToolResult::json(&milestones),
                Err(e) => ToolResult::error(e),
            }
        }
        "create-work-milestone" => {
            let data: CreateMilestone = match serde_json::from_value(args) {
                Ok(d) => d,
                Err(e) => return ToolResult::error(format!("Invalid parameters: {}", e)),
            };
            match work::work_create_milestone(data).await {
                Ok(milestone) => ToolResult::json(&milestone),
                Err(e) => ToolResult::error(e),
            }
        }
        "update-work-milestone" => {
            let milestone_id = match args.get("milestone_id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => return ToolResult::error("milestone_id is required".to_string()),
            };
            let mut data_args = args.clone();
            if let Some(obj) = data_args.as_object_mut() {
                obj.remove("milestone_id");
            }
            let data: UpdateMilestone = match serde_json::from_value(data_args) {
                Ok(d) => d,
                Err(e) => return ToolResult::error(format!("Invalid parameters: {}", e)),
            };
            match work::work_update_milestone(milestone_id, data).await {
                Ok(milestone) => ToolResult::json(&milestone),
                Err(e) => ToolResult::error(e),
            }
        }

        // Initiatives
        "list-work-initiatives" => {
            let include_projects = args.get("include").and_then(|v| v.as_str()) == Some("projects");
            match work::work_list_initiatives(Some(include_projects)).await {
                Ok(initiatives) => ToolResult::json(&initiatives),
                Err(e) => ToolResult::error(e),
            }
        }
        "create-work-initiative" => {
            let data: CreateInitiative = match serde_json::from_value(args) {
                Ok(d) => d,
                Err(e) => return ToolResult::error(format!("Invalid parameters: {}", e)),
            };
            match work::work_create_initiative(data).await {
                Ok(initiative) => ToolResult::json(&initiative),
                Err(e) => ToolResult::error(e),
            }
        }
        "update-work-initiative" => {
            let initiative_id = match args.get("initiative_id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => return ToolResult::error("initiative_id is required".to_string()),
            };
            let mut data_args = args.clone();
            if let Some(obj) = data_args.as_object_mut() {
                obj.remove("initiative_id");
            }
            let data: UpdateInitiative = match serde_json::from_value(data_args) {
                Ok(d) => d,
                Err(e) => return ToolResult::error(format!("Invalid parameters: {}", e)),
            };
            match work::work_update_initiative(initiative_id, data).await {
                Ok(initiative) => ToolResult::json(&initiative),
                Err(e) => ToolResult::error(e),
            }
        }

        "delete-work-initiative" => {
            let initiative_id = match args.get("initiative_id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => return ToolResult::error("initiative_id is required".to_string()),
            };
            match work::work_delete_initiative(initiative_id, Some(true)).await {
                Ok(()) => ToolResult::text("Initiative deleted successfully.".to_string()),
                Err(e) => ToolResult::error(e),
            }
        }

        // Initiative-Project linking
        "add-project-to-initiative" => {
            let initiative_id = match args.get("initiative_id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => return ToolResult::error("initiative_id is required".to_string()),
            };
            let project_id = match args.get("project_id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => return ToolResult::error("project_id is required".to_string()),
            };
            match work::work_add_project_to_initiative(initiative_id, project_id).await {
                Ok(link) => ToolResult::json(&link),
                Err(e) => ToolResult::error(e),
            }
        }
        "remove-project-from-initiative" => {
            let initiative_id = match args.get("initiative_id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => return ToolResult::error("initiative_id is required".to_string()),
            };
            let project_id = match args.get("project_id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => return ToolResult::error("project_id is required".to_string()),
            };
            match work::work_remove_project_from_initiative(initiative_id, project_id).await {
                Ok(()) => ToolResult::text("Project removed from initiative successfully.".to_string()),
                Err(e) => ToolResult::error(e),
            }
        }
        "list-initiative-projects" => {
            let initiative_id = match args.get("initiative_id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => return ToolResult::error("initiative_id is required".to_string()),
            };
            match work::work_list_initiative_projects(initiative_id).await {
                Ok(projects) => ToolResult::json(&projects),
                Err(e) => ToolResult::error(e),
            }
        }

        // Labels
        "list-work-labels" => {
            match work::work_list_labels().await {
                Ok(labels) => ToolResult::json(&labels),
                Err(e) => ToolResult::error(e),
            }
        }
        "create-work-label" => {
            let data: CreateLabel = match serde_json::from_value(args) {
                Ok(d) => d,
                Err(e) => return ToolResult::error(format!("Invalid parameters: {}", e)),
            };
            match work::work_create_label(data).await {
                Ok(label) => ToolResult::json(&label),
                Err(e) => ToolResult::error(e),
            }
        }

        // Users
        "list-work-users" => {
            match work::work_list_users().await {
                Ok(users) => ToolResult::json(&users),
                Err(e) => ToolResult::error(e),
            }
        }
        "list-work-bots" => {
            match work::work_list_bots().await {
                Ok(bots) => ToolResult::json(&bots),
                Err(e) => ToolResult::error(e),
            }
        }

        // Project updates
        "list-work-project-updates" => {
            let project_id = match args.get("project_id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => return ToolResult::error("project_id is required".to_string()),
            };
            match work::work_list_project_updates(project_id).await {
                Ok(updates) => ToolResult::json(&updates),
                Err(e) => ToolResult::error(e),
            }
        }
        "create-work-project-update" => {
            let project_id = match args.get("project_id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => return ToolResult::error("project_id is required".to_string()),
            };
            let mut data_args = args.clone();
            if let Some(obj) = data_args.as_object_mut() {
                obj.remove("project_id");
            }
            let data: CreateProjectUpdate = match serde_json::from_value(data_args) {
                Ok(d) => d,
                Err(e) => return ToolResult::error(format!("Invalid parameters: {}", e)),
            };
            match work::work_create_project_update(project_id, data).await {
                Ok(update) => ToolResult::json(&update),
                Err(e) => ToolResult::error(e),
            }
        }

        _ => ToolResult::error(format!("Unknown work tool: {}", name)),
    }
}
