// Work Module - Milestone Commands

use super::types::*;
use crate::commands::supabase::get_client;

/// List milestones for a project
#[tauri::command]
pub async fn work_list_milestones(project_id: String) -> Result<Vec<Milestone>, String> {
    let client = get_client().await?;

    let query = format!(
        "project_id=eq.{}&order=sort_order.asc,target_date.asc",
        project_id
    );

    client.select("milestones", &query).await
}

/// Get a single milestone by ID
#[tauri::command]
pub async fn work_get_milestone(milestone_id: String) -> Result<Milestone, String> {
    let client = get_client().await?;

    let query = format!("id=eq.{}", milestone_id);

    client
        .select_single("milestones", &query)
        .await?
        .ok_or_else(|| format!("Milestone not found: {}", milestone_id))
}

/// Create a new milestone
#[tauri::command]
pub async fn work_create_milestone(data: CreateMilestone) -> Result<Milestone, String> {
    let client = get_client().await?;

    client.insert("milestones", &data).await
}

/// Update a milestone
#[tauri::command]
pub async fn work_update_milestone(
    milestone_id: String,
    data: UpdateMilestone,
) -> Result<Milestone, String> {
    let client = get_client().await?;

    let query = format!("id=eq.{}", milestone_id);
    client.update("milestones", &query, &data).await
}

/// Delete a milestone
#[tauri::command]
pub async fn work_delete_milestone(milestone_id: String) -> Result<(), String> {
    let client = get_client().await?;

    let query = format!("id=eq.{}", milestone_id);
    client.delete("milestones", &query).await
}
