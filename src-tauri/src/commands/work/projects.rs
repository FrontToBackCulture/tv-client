// Work Module - Project Commands

use super::types::*;
use crate::commands::supabase::get_client;

/// List all projects
#[tauri::command]
pub async fn work_list_projects(include_statuses: Option<bool>) -> Result<Vec<Project>, String> {
    let client = get_client().await?;

    // Build query with optional status join
    let query = if include_statuses.unwrap_or(false) {
        "select=*,statuses:task_statuses(*)&archived_at=is.null&order=sort_order.asc"
    } else {
        "archived_at=is.null&order=sort_order.asc"
    };

    client.select("projects", query).await
}

/// Get a single project by ID
#[tauri::command]
pub async fn work_get_project(project_id: String) -> Result<Project, String> {
    let client = get_client().await?;

    let query = format!(
        "select=*,statuses:task_statuses(*)&id=eq.{}",
        project_id
    );

    client
        .select_single("projects", &query)
        .await?
        .ok_or_else(|| format!("Project not found: {}", project_id))
}

/// Create a new project with default statuses
#[tauri::command]
pub async fn work_create_project(data: CreateProject) -> Result<Project, String> {
    let client = get_client().await?;

    // Generate slug if not provided
    let mut insert_data = data.clone();
    if insert_data.slug.is_none() {
        insert_data.slug = Some(slugify(&data.name));
    }

    // Create project
    let project: Project = client.insert("projects", &insert_data).await?;

    // Create default statuses
    let default_statuses = vec![
        ("Backlog", "backlog", "#6B7280", 0),
        ("Todo", "unstarted", "#3B82F6", 1),
        ("In Progress", "started", "#F59E0B", 2),
        ("In Review", "review", "#8B5CF6", 3),
        ("Done", "completed", "#10B981", 4),
        ("Canceled", "canceled", "#EF4444", 5),
    ];

    for (name, status_type, color, sort_order) in default_statuses {
        let status = serde_json::json!({
            "project_id": project.id,
            "name": name,
            "type": status_type,
            "color": color,
            "sort_order": sort_order
        });
        let _: TaskStatus = client.insert("task_statuses", &status).await?;
    }

    // Return project with statuses
    work_get_project(project.id).await
}

/// Update a project
#[tauri::command]
pub async fn work_update_project(project_id: String, data: UpdateProject) -> Result<Project, String> {
    let client = get_client().await?;

    let query = format!("id=eq.{}", project_id);
    client.update("projects", &query, &data).await
}

/// Delete a project (soft delete by setting archived_at)
#[tauri::command]
pub async fn work_delete_project(project_id: String) -> Result<(), String> {
    let client = get_client().await?;

    let query = format!("id=eq.{}", project_id);
    let now = chrono::Utc::now().to_rfc3339();
    let data = serde_json::json!({ "archived_at": now });

    let _: Project = client.update("projects", &query, &data).await?;
    Ok(())
}

/// List task statuses for a project
#[tauri::command]
pub async fn work_list_project_statuses(project_id: String) -> Result<Vec<TaskStatus>, String> {
    let client = get_client().await?;

    let query = format!("project_id=eq.{}&order=sort_order.asc", project_id);
    client.select("task_statuses", &query).await
}

/// List project updates (status updates)
#[tauri::command]
pub async fn work_list_project_updates(project_id: String) -> Result<Vec<ProjectUpdate>, String> {
    let client = get_client().await?;

    let query = format!(
        "project_id=eq.{}&order=created_at.desc",
        project_id
    );
    client.select("project_updates", &query).await
}

/// Create a project update
#[tauri::command]
pub async fn work_create_project_update(
    project_id: String,
    data: CreateProjectUpdate,
) -> Result<ProjectUpdate, String> {
    let client = get_client().await?;

    let insert_data = serde_json::json!({
        "project_id": project_id,
        "content": data.content,
        "health": data.health,
        "created_by": data.created_by
    });

    // Create update
    let update: ProjectUpdate = client.insert("project_updates", &insert_data).await?;

    // Also update project health if provided
    if let Some(health) = &data.health {
        let query = format!("id=eq.{}", project_id);
        let health_data = serde_json::json!({ "health": health });
        let _: Project = client.update("projects", &query, &health_data).await?;
    }

    Ok(update)
}

/// Delete a project update
#[tauri::command]
pub async fn work_delete_project_update(update_id: String) -> Result<(), String> {
    let client = get_client().await?;

    let query = format!("id=eq.{}", update_id);
    client.delete("project_updates", &query).await
}

// Helper function to create URL-friendly slug
fn slugify(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}
