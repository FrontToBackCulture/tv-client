// Work Module - Task Commands

use super::types::*;
use crate::commands::supabase::get_client;

/// List tasks with optional filters
#[tauri::command]
pub async fn work_list_tasks(
    project_id: Option<String>,
    status_id: Option<String>,
    status_type: Option<String>,
    assignee_id: Option<String>,
    milestone_id: Option<String>,
) -> Result<Vec<Task>, String> {
    let client = get_client().await?;

    let mut filters = vec!["select=*,project:projects(*),status:task_statuses(*),assignee:users!tasks_assignee_id_fkey(*)".to_string()];

    if let Some(pid) = project_id {
        filters.push(format!("project_id=eq.{}", pid));
    }
    if let Some(sid) = status_id {
        filters.push(format!("status_id=eq.{}", sid));
    }
    if let Some(st) = status_type {
        filters.push(format!("status.type=eq.{}", st));
    }
    if let Some(aid) = assignee_id {
        filters.push(format!("assignee_id=eq.{}", aid));
    }
    if let Some(mid) = milestone_id {
        filters.push(format!("milestone_id=eq.{}", mid));
    }

    filters.push("order=sort_order.asc,created_at.desc".to_string());

    let query = filters.join("&");
    client.select("tasks", &query).await
}

/// Get a single task by ID
#[tauri::command]
pub async fn work_get_task(task_id: String) -> Result<Task, String> {
    let client = get_client().await?;

    let query = format!(
        "select=*,project:projects(*),status:task_statuses(*),assignee:users!tasks_assignee_id_fkey(*)&id=eq.{}",
        task_id
    );

    client
        .select_single("tasks", &query)
        .await?
        .ok_or_else(|| format!("Task not found: {}", task_id))
}

/// Create a new task
#[tauri::command]
pub async fn work_create_task(data: CreateTask) -> Result<Task, String> {
    let client = get_client().await?;

    // Get next task number for the project
    let project: Project = client
        .select_single(
            "projects",
            &format!("id=eq.{}", data.project_id),
        )
        .await?
        .ok_or("Project not found")?;

    let next_number = project.next_task_number.unwrap_or(1);

    // Build insert data
    let insert_data = serde_json::json!({
        "project_id": data.project_id,
        "status_id": data.status_id,
        "title": data.title,
        "description": data.description,
        "priority": data.priority.unwrap_or(0),
        "due_date": data.due_date,
        "assignee_id": data.assignee_id,
        "milestone_id": data.milestone_id,
        "depends_on": data.depends_on,
        "session_ref": data.session_ref,
        "requires_review": data.requires_review,
        "task_number": next_number
    });

    // Create task
    let task: Task = client.insert("tasks", &insert_data).await?;

    // Increment project's next_task_number
    let update_data = serde_json::json!({ "next_task_number": next_number + 1 });
    let _: Project = client
        .update("projects", &format!("id=eq.{}", data.project_id), &update_data)
        .await?;

    // Return task with joins
    work_get_task(task.id).await
}

/// Update a task
#[tauri::command]
pub async fn work_update_task(task_id: String, data: UpdateTask) -> Result<Task, String> {
    let client = get_client().await?;

    // Check if status is changing to completed
    if let Some(status_id) = &data.status_id {
        // Get the new status to check its type
        let status: Option<TaskStatus> = client
            .select_single("task_statuses", &format!("id=eq.{}", status_id))
            .await?;

        if let Some(s) = status {
            if s.status_type == "completed" {
                // Set completed_at timestamp
                let mut update_data = serde_json::to_value(&data).map_err(|e| e.to_string())?;
                if let Some(obj) = update_data.as_object_mut() {
                    obj.insert(
                        "completed_at".to_string(),
                        serde_json::Value::String(chrono::Utc::now().to_rfc3339()),
                    );
                }

                let _: Task = client
                    .update("tasks", &format!("id=eq.{}", task_id), &update_data)
                    .await?;
                return work_get_task(task_id).await;
            }
        }
    }

    let _: Task = client
        .update("tasks", &format!("id=eq.{}", task_id), &data)
        .await?;

    work_get_task(task_id).await
}

/// Delete a task
#[tauri::command]
pub async fn work_delete_task(task_id: String) -> Result<(), String> {
    let client = get_client().await?;

    let query = format!("id=eq.{}", task_id);
    client.delete("tasks", &query).await
}

/// Add labels to a task
#[tauri::command]
pub async fn work_add_task_labels(task_id: String, label_ids: Vec<String>) -> Result<(), String> {
    let client = get_client().await?;

    for label_id in label_ids {
        let data = serde_json::json!({
            "task_id": task_id,
            "label_id": label_id
        });
        // Use upsert behavior by catching conflicts
        let result: Result<serde_json::Value, _> = client.insert("task_labels", &data).await;
        if let Err(e) = result {
            // Ignore duplicate key errors
            if !e.contains("duplicate") && !e.contains("23505") {
                return Err(e);
            }
        }
    }

    Ok(())
}

/// Remove labels from a task
#[tauri::command]
pub async fn work_remove_task_labels(task_id: String, label_ids: Vec<String>) -> Result<(), String> {
    let client = get_client().await?;

    for label_id in label_ids {
        let query = format!("task_id=eq.{}&label_id=eq.{}", task_id, label_id);
        client.delete("task_labels", &query).await?;
    }

    Ok(())
}
