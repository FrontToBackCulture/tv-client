// Work Module - User Commands

use super::types::*;
use crate::commands::supabase::get_client;

/// List all users (humans and bots)
#[tauri::command]
pub async fn work_list_users() -> Result<Vec<User>, String> {
    let client = get_client().await?;

    client.select("users", "order=name.asc").await
}

/// List only human users
#[tauri::command]
pub async fn work_list_humans() -> Result<Vec<User>, String> {
    let client = get_client().await?;

    client.select("users", "type=eq.human&order=name.asc").await
}

/// List only bot users
#[tauri::command]
pub async fn work_list_bots() -> Result<Vec<User>, String> {
    let client = get_client().await?;

    client.select("users", "type=eq.bot&order=name.asc").await
}

/// Get a single user by ID
#[tauri::command]
pub async fn work_get_user(user_id: String) -> Result<User, String> {
    let client = get_client().await?;

    let query = format!("id=eq.{}", user_id);

    client
        .select_single("users", &query)
        .await?
        .ok_or_else(|| format!("User not found: {}", user_id))
}

/// Find user by email
#[tauri::command]
pub async fn work_find_user_by_email(email: String) -> Result<Option<User>, String> {
    let client = get_client().await?;

    let query = format!("email=eq.{}", email);
    client.select_single("users", &query).await
}

/// Find user by GitHub username
#[tauri::command]
pub async fn work_find_user_by_github(github_username: String) -> Result<Option<User>, String> {
    let client = get_client().await?;

    let query = format!("github_username=eq.{}", github_username);
    client.select_single("users", &query).await
}

/// Find bot by folder ID
#[tauri::command]
pub async fn work_find_bot_by_folder(bot_folder_id: String) -> Result<Option<User>, String> {
    let client = get_client().await?;

    let query = format!("type=eq.bot&bot_folder_id=eq.{}", bot_folder_id);
    client.select_single("users", &query).await
}
