// Notion Tauri Command Handlers
// IPC entry points for the frontend

use crate::commands::error::CmdResult;
use crate::commands::supabase::get_client;
use serde_json::Value;

use super::api;
use super::sync;
use super::types::*;

// ============================================================================
// Database Discovery
// ============================================================================

/// List Notion databases accessible to the integration
#[tauri::command]
pub async fn notion_list_databases(query: Option<String>) -> CmdResult<Vec<NotionDatabaseInfo>> {
    api::search_databases(&query.unwrap_or_default()).await
}

/// Get the full schema (properties) of a Notion database
#[tauri::command]
pub async fn notion_get_database_schema(database_id: String) -> CmdResult<NotionDatabaseInfo> {
    api::get_database_schema(&database_id).await
}

/// Preview cards from a database with optional filter
#[tauri::command]
pub async fn notion_preview_cards(
    database_id: String,
    filter: Option<Value>,
) -> CmdResult<Vec<PreviewCard>> {
    api::preview_database(&database_id, filter.as_ref()).await
}

/// List all users in the Notion workspace
#[tauri::command]
pub async fn notion_list_users() -> CmdResult<Vec<NotionUser>> {
    api::list_users().await
}

/// List all pages from a Notion database (for relation field value mapping)
#[tauri::command]
pub async fn notion_list_database_pages(database_id: String) -> CmdResult<Vec<(String, String)>> {
    api::list_database_pages(&database_id).await
}

/// Fetch page content (blocks → markdown) and attachments with fresh URLs
#[tauri::command]
pub async fn notion_get_page_content(page_id: String) -> CmdResult<(String, Vec<NotionAttachment>)> {
    api::get_page_blocks(&page_id).await
}

// ============================================================================
// Sync Configuration (CRUD via Supabase)
// ============================================================================

/// List all sync configurations
#[tauri::command]
pub async fn notion_list_sync_configs() -> CmdResult<Vec<SyncConfig>> {
    let client = get_client().await?;
    client
        .select("notion_sync_configs", "select=*&order=created_at.asc")
        .await
}

/// Save a new sync configuration
#[tauri::command]
pub async fn notion_save_sync_config(data: CreateSyncConfig) -> CmdResult<SyncConfig> {
    let client = get_client().await?;
    client.insert("notion_sync_configs", &data).await
}

/// Update an existing sync configuration
#[tauri::command]
pub async fn notion_update_sync_config(
    config_id: String,
    data: UpdateSyncConfig,
) -> CmdResult<SyncConfig> {
    let client = get_client().await?;
    client
        .update(
            "notion_sync_configs",
            &format!("id=eq.{}", config_id),
            &data,
        )
        .await
}

/// Delete a sync configuration
#[tauri::command]
pub async fn notion_delete_sync_config(config_id: String) -> CmdResult<()> {
    let client = get_client().await?;
    client
        .delete("notion_sync_configs", &format!("id=eq.{}", config_id))
        .await
}

// ============================================================================
// Push (tv-client → Notion)
// ============================================================================

/// Push a single task to Notion (create or update).
/// Uses the project's sync config for full field mapping if available,
/// otherwise falls back to the default Notion database with title + body only.
#[tauri::command]
pub async fn notion_push_task(task_id: String) -> CmdResult<PushResult> {
    use crate::commands::settings::{settings_get_key, KEY_NOTION_DEFAULT_DB};

    let client = get_client().await?;

    // 1. Load the task
    let tasks: Vec<serde_json::Value> = client
        .select("tasks", &format!("id=eq.{}&select=*,project:projects(id,name,identifier_prefix)", task_id))
        .await?;

    let task = tasks.into_iter().next()
        .ok_or_else(|| crate::commands::error::CommandError::NotFound(format!("Task {} not found", task_id)))?;

    let project_id = task["project_id"].as_str().unwrap_or("");

    // 2. Find sync config for this project (optional)
    let configs: Vec<SyncConfig> = client
        .select("notion_sync_configs", "select=*&enabled=eq.true")
        .await?;

    // Try project-specific config first, then fall back to any enabled config
    let config = configs.iter()
        .find(|c| c.target_project_id.as_deref() == Some(project_id))
        .or_else(|| configs.first());

    // 3. Determine database ID and build properties
    let (database_id, notion_properties) = if let Some(cfg) = config {
        // Full mapping path: use sync config's field mapping + database schema
        let schema = api::get_database_schema(&cfg.notion_database_id).await?;

        // Load statuses from the task's own project (not the config's target)
        let statuses: Vec<crate::commands::work::types::TaskStatus> = client
            .select("task_statuses", &format!("project_id=eq.{}", project_id))
            .await?;

        // Also load statuses from the config's target project for value_map reverse lookup
        let target_statuses: Vec<crate::commands::work::types::TaskStatus> = if cfg.target_project_id.as_deref() != Some(project_id) {
            if let Some(ref tid) = cfg.target_project_id {
                client.select("task_statuses", &format!("project_id=eq.{}", tid)).await.unwrap_or_default()
            } else {
                vec![]
            }
        } else {
            vec![]
        };

        let mut status_id_to_name: std::collections::HashMap<String, String> = statuses.iter()
            .map(|s| (s.id.clone(), s.name.clone()))
            .collect();
        // Merge target project statuses so value_map reverse lookup works across projects
        for s in &target_statuses {
            status_id_to_name.entry(s.id.clone()).or_insert_with(|| s.name.clone());
        }

        let users: Vec<crate::commands::work::types::User> = client
            .select("users", "select=id,name,type&type=eq.human")
            .await
            .unwrap_or_default();

        let notion_users = api::list_users().await.unwrap_or_default();
        let mut user_id_to_notion: std::collections::HashMap<String, String> = std::collections::HashMap::new();
        for u in &users {
            if let Some(nu) = notion_users.iter().find(|nu| nu.name.to_lowercase() == u.name.to_lowercase()) {
                user_id_to_notion.insert(u.id.clone(), nu.id.clone());
            }
        }

        let companies: Vec<serde_json::Value> = client
            .select("crm_companies", "select=id,name,display_name")
            .await
            .unwrap_or_default();

        let company_id_to_name: std::collections::HashMap<String, String> = companies.iter()
            .filter_map(|c| {
                let id = c["id"].as_str()?;
                let name = c["display_name"].as_str().or(c["name"].as_str())?;
                Some((id.to_string(), name.to_string()))
            })
            .collect();

        let props = super::mapping::map_task_to_page(
            &task,
            &cfg.field_mapping,
            &status_id_to_name,
            &user_id_to_notion,
            &company_id_to_name,
            &schema.properties,
        );

        (cfg.notion_database_id.clone(), props)
    } else {
        // Fallback path: use default database, push title only as property
        let default_db = settings_get_key(KEY_NOTION_DEFAULT_DB.to_string())?
            .ok_or_else(|| crate::commands::error::CommandError::Config(
                "No sync config for this project and no default Notion database configured. Add one in Settings.".into()
            ))?;

        // Get schema to find the title property name
        let schema = api::get_database_schema(&default_db).await?;
        let title_prop_name = schema.properties.iter()
            .find(|p| p.prop_type == "title")
            .map(|p| p.name.clone())
            .unwrap_or_else(|| "Name".to_string());

        let title = task["title"].as_str().unwrap_or("Untitled");
        let props = serde_json::json!({
            title_prop_name: {
                "title": [{ "type": "text", "text": { "content": title } }]
            }
        });

        (default_db, props)
    };

    // 4. Convert description to Notion blocks
    let description = task["description"].as_str().unwrap_or("");
    let blocks = api::markdown_to_blocks(description);

    // 5. Create or update
    let existing_notion_id = task["notion_page_id"].as_str().filter(|s| !s.is_empty());

    let (action, notion_page_id) = if let Some(page_id) = existing_notion_id {
        // Update existing page
        api::update_page_properties(page_id, &notion_properties).await?;
        api::replace_page_blocks(page_id, &blocks).await?;
        ("updated".to_string(), page_id.to_string())
    } else {
        // Create new page
        let new_page_id = api::create_page(
            &database_id,
            &notion_properties,
            &blocks,
        ).await?;

        // Store notion_page_id back on the task
        let _: serde_json::Value = client
            .update(
                "tasks",
                &format!("id=eq.{}", task_id),
                &serde_json::json!({ "notion_page_id": new_page_id }),
            )
            .await?;

        ("created".to_string(), new_page_id)
    };

    // 6. Set last_pushed_at to prevent echo on next pull
    let _: serde_json::Value = client
        .update(
            "tasks",
            &format!("id=eq.{}", task_id),
            &serde_json::json!({ "last_pushed_at": chrono::Utc::now().to_rfc3339() }),
        )
        .await?;

    eprintln!("[notion:push] Task {} {} as Notion page {}", task_id, action, notion_page_id);

    Ok(PushResult { action, notion_page_id })
}

// ============================================================================
// Sync Actions
// ============================================================================

/// Manually trigger a sync for all enabled configs
#[tauri::command]
pub async fn notion_sync_start(app_handle: tauri::AppHandle) -> CmdResult<Vec<SyncComplete>> {
    eprintln!("[notion] Manual sync triggered");
    sync::run_sync(&app_handle).await
}

/// Get current sync status
#[tauri::command]
pub async fn notion_sync_status() -> CmdResult<SyncStatus> {
    let client = get_client().await?;

    let all_configs: Vec<SyncConfig> = client
        .select("notion_sync_configs", "select=*")
        .await?;

    let enabled_count = all_configs.iter().filter(|c| c.enabled.unwrap_or(true)).count() as i64;

    let last_sync = all_configs
        .iter()
        .filter_map(|c| c.last_synced_at.as_ref())
        .max()
        .cloned();

    Ok(SyncStatus {
        is_syncing: false,
        last_sync,
        configs_count: all_configs.len() as i64,
        enabled_count,
    })
}
