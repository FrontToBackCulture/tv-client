// Workspace Module - Workspace Commands
// Now thin wrappers around the projects table with project_type='workspace'

use super::types::*;
use crate::commands::error::CmdResult;
use crate::commands::supabase::get_client;
use crate::commands::work::types::{
    CreateProject, Project, UpdateProject,
};

/// Map workspace status to project status
fn ws_status_to_project(status: &str) -> &str {
    match status {
        "open" => "planned",
        "active" => "active",
        "in_progress" => "active",
        "done" => "completed",
        "paused" => "paused",
        _ => "planned",
    }
}

/// Map project status back to workspace status for display
fn project_status_to_ws(status: &str) -> &str {
    match status {
        "planned" => "open",
        "active" => "active",
        "completed" => "done",
        "paused" => "paused",
        _ => "open",
    }
}

/// Convert a Project to a WorkspaceSummary
fn project_to_ws_summary(p: &Project) -> WorkspaceSummary {
    WorkspaceSummary {
        id: p.id.clone(),
        title: p.name.clone(),
        description: p.description.clone(),
        status: project_status_to_ws(p.status.as_deref().unwrap_or("planned")).to_string(),
        owner: p.owner.clone().unwrap_or_default(),
        intent: p.intent.clone(),
        initiative_id: None, // initiative_id is via junction table now
        created_at: p.created_at.clone(),
        updated_at: p.updated_at.clone(),
    }
}

/// Convert a Project to a Workspace (full detail)
fn project_to_workspace(p: Project) -> Workspace {
    Workspace {
        id: p.id.clone(),
        title: p.name.clone(),
        description: p.description.clone(),
        status: project_status_to_ws(p.status.as_deref().unwrap_or("planned")).to_string(),
        owner: p.owner.clone().unwrap_or_default(),
        intent: p.intent.clone(),
        initiative_id: None,
        created_at: p.created_at.clone(),
        updated_at: p.updated_at.clone(),
        sessions: p.sessions,
        artifacts: p.artifacts,
        context: p.context,
    }
}

/// List workspaces (lightweight — no nested sessions/artifacts/context)
#[tauri::command]
pub async fn workspace_list(
    status: Option<String>,
    owner: Option<String>,
    limit: Option<u32>,
) -> CmdResult<Vec<WorkspaceSummary>> {
    let client = get_client().await?;

    let limit = limit.unwrap_or(20).min(100);
    let mut query = format!(
        "select=*&project_type=eq.workspace&archived_at=is.null&order=updated_at.desc&limit={}",
        limit
    );

    if let Some(s) = status {
        let project_status = ws_status_to_project(&s);
        query.push_str(&format!("&status=eq.{}", project_status));
    }
    if let Some(o) = owner {
        query.push_str(&format!("&owner=eq.{}", o));
    }

    let projects: Vec<Project> = client.select("projects", &query).await?;
    Ok(projects.iter().map(project_to_ws_summary).collect())
}

/// Get a single workspace by ID with all related data
#[tauri::command]
pub async fn workspace_get(workspace_id: String) -> CmdResult<Workspace> {
    let project = crate::commands::work::work_get_project(workspace_id).await?;
    Ok(project_to_workspace(project))
}

/// Create a new workspace (creates a project with project_type='workspace')
#[tauri::command]
pub async fn workspace_create(data: CreateWorkspace) -> CmdResult<Workspace> {
    let create_data = CreateProject {
        name: data.title,
        description: data.description,
        status: data.status.map(|s| ws_status_to_project(&s).to_string()),
        project_type: Some("workspace".to_string()),
        owner: Some(data.owner),
        intent: data.intent,
        ..Default::default()
    };

    let project = crate::commands::work::work_create_project(create_data).await?;
    Ok(project_to_workspace(project))
}

/// Update a workspace
#[tauri::command]
pub async fn workspace_update(
    workspace_id: String,
    data: UpdateWorkspace,
) -> CmdResult<Workspace> {
    let update_data = UpdateProject {
        name: data.title,
        description: data.description,
        status: data.status.map(|s| ws_status_to_project(&s).to_string()),
        intent: data.intent,
        ..Default::default()
    };

    let project = crate::commands::work::work_update_project(workspace_id, update_data).await?;
    Ok(project_to_workspace(project))
}

/// Delete a workspace
#[tauri::command]
pub async fn workspace_delete(workspace_id: String) -> CmdResult<()> {
    crate::commands::work::work_delete_project(workspace_id).await
}
