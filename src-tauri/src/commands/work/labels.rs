// Work Module - Label Commands

use super::types::*;
use crate::commands::supabase::get_client;

/// List all labels
#[tauri::command]
pub async fn work_list_labels() -> Result<Vec<Label>, String> {
    let client = get_client().await?;

    client.select("labels", "order=name.asc").await
}

/// Get a single label by ID
#[tauri::command]
pub async fn work_get_label(label_id: String) -> Result<Label, String> {
    let client = get_client().await?;

    let query = format!("id=eq.{}", label_id);

    client
        .select_single("labels", &query)
        .await?
        .ok_or_else(|| format!("Label not found: {}", label_id))
}

/// Create a new label
#[tauri::command]
pub async fn work_create_label(data: CreateLabel) -> Result<Label, String> {
    let client = get_client().await?;

    client.insert("labels", &data).await
}

/// Update a label
#[tauri::command]
pub async fn work_update_label(label_id: String, name: Option<String>, color: Option<String>) -> Result<Label, String> {
    let client = get_client().await?;

    let mut data = serde_json::Map::new();
    if let Some(n) = name {
        data.insert("name".to_string(), serde_json::Value::String(n));
    }
    if let Some(c) = color {
        data.insert("color".to_string(), serde_json::Value::String(c));
    }

    let query = format!("id=eq.{}", label_id);
    client.update("labels", &query, &serde_json::Value::Object(data)).await
}

/// Delete a label
#[tauri::command]
pub async fn work_delete_label(label_id: String) -> Result<(), String> {
    let client = get_client().await?;

    // First remove all task_labels associations
    client.delete("task_labels", &format!("label_id=eq.{}", label_id)).await?;

    // Then delete the label
    client.delete("labels", &format!("id=eq.{}", label_id)).await
}
