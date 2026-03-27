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

        let all_props = super::mapping::map_task_to_page(
            &task,
            &cfg.field_mapping,
            &status_id_to_name,
            &user_id_to_notion,
            &company_id_to_name,
            &schema.properties,
        );

        // Only push specific fields — Notion is source of truth for title/description/assignees
        let push_fields = ["status_id", "priority", "due_date", "company_id"];
        let allowed_notion_props: std::collections::HashSet<String> = push_fields
            .iter()
            .filter_map(|&wf| {
                let m = cfg.field_mapping.get(wf)?;
                if let Some(s) = m.as_str() { Some(s.to_string()) }
                else { m.get("source")?.as_str().map(|s| s.to_string()) }
            })
            .collect();

        let props = if let Some(obj) = all_props.as_object() {
            let filtered: serde_json::Map<String, Value> = obj
                .iter()
                .filter(|(k, _)| allowed_notion_props.contains(k.as_str()))
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect();
            Value::Object(filtered)
        } else {
            all_props
        };

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

    // 4. Create or update (properties only — never overwrite Notion page body)
    let existing_notion_id = task["notion_page_id"].as_str().filter(|s| !s.is_empty());

    // When updating, only push properties — don't touch page blocks/description.
    // Notion is the source of truth for body content.
    let (action, notion_page_id) = if let Some(page_id) = existing_notion_id {
        // Update existing page — properties only, no block replacement
        api::update_page_properties(page_id, &notion_properties).await?;
        ("updated".to_string(), page_id.to_string())
    } else {
        // Create new page — include description as initial content
        let description = task["description"].as_str().unwrap_or("");
        let blocks = api::markdown_to_blocks(description);
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
// Fetch Notion page blocks as JSON (for direct rendering in UI)
// ============================================================================

/// Fetch direct children of a Notion block/page with 2-level recursion.
#[tauri::command]
pub async fn notion_get_block_children(block_id: String) -> CmdResult<Value> {
    let blocks = api::fetch_block_children(&block_id).await?;
    Ok(Value::Array(blocks))
}

/// Convert a Notion page to markdown using notion-to-md (Node.js).
/// Returns clean markdown string.
#[tauri::command]
pub async fn notion_page_to_markdown(page_id: String) -> CmdResult<String> {
    use crate::commands::settings::{settings_get_key, KEY_NOTION_API};

    let api_key = settings_get_key(KEY_NOTION_API.to_string())?
        .ok_or_else(|| crate::commands::error::CommandError::Config(
            "Notion API key not configured".into()
        ))?;

    // Find the script relative to the app
    let script_path = std::env::current_exe()
        .unwrap_or_default()
        .parent()
        .unwrap_or(std::path::Path::new("."))
        .join("../scripts/notion-to-md.mjs");

    // Fallback to relative path from project root
    let script = if script_path.exists() {
        script_path
    } else {
        // Dev mode — script is in src-tauri/scripts/
        std::path::PathBuf::from("scripts/notion-to-md.mjs")
    };

    eprintln!("[notion:n2m] Converting page {} to markdown via {:?}", page_id, script);

    let output = tokio::process::Command::new("node")
        .arg(&script)
        .arg(&page_id)
        .arg(&api_key)
        .current_dir(
            std::env::current_exe()
                .unwrap_or_default()
                .parent()
                .and_then(|p| p.parent())
                .unwrap_or(std::path::Path::new("."))
        )
        .output()
        .await
        .map_err(|e| crate::commands::error::CommandError::Config(
            format!("Failed to run notion-to-md: {}", e)
        ))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        eprintln!("[notion:n2m] Error: {}", stderr);
        return Err(crate::commands::error::CommandError::Config(
            format!("notion-to-md failed: {}", stderr)
        ));
    }

    let markdown = String::from_utf8_lossy(&output.stdout).to_string();
    eprintln!("[notion:n2m] Converted {} chars of markdown", markdown.len());
    Ok(markdown)
}

// ============================================================================
// Pull (Notion → tv-client) — single task
// ============================================================================

/// Pull a single task from Notion (update local task with Notion data).
/// Requires the task to have a notion_page_id.
#[tauri::command]
pub async fn notion_pull_task(task_id: String) -> CmdResult<PushResult> {
    use crate::commands::error::CommandError;

    let client = get_client().await?;

    // 1. Load the task to get notion_page_id and project_id
    let tasks: Vec<Value> = client
        .select(
            "tasks",
            &format!("id=eq.{}&select=*,project:projects(id,name,identifier_prefix)", task_id),
        )
        .await?;

    let task = tasks.into_iter().next().ok_or_else(|| {
        CommandError::NotFound(format!("Task {} not found", task_id))
    })?;

    let notion_page_id = task["notion_page_id"]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            CommandError::Config("Task has no linked Notion page. Push to Notion first.".into())
        })?
        .to_string();

    let project_id = task["project_id"]
        .as_str()
        .unwrap_or("")
        .to_string();

    // 2. Find sync config for this project
    let configs: Vec<SyncConfig> = client
        .select("notion_sync_configs", "select=*&enabled=eq.true")
        .await?;

    let config = configs
        .iter()
        .find(|c| c.target_project_id.as_deref() == Some(&project_id))
        .or_else(|| configs.first())
        .ok_or_else(|| {
            CommandError::Config("No sync configuration found. Set up Notion sync first.".into())
        })?;

    // 3. Fetch the Notion page
    let page = api::get_page(&notion_page_id).await?;

    // 4. Map Notion properties to task fields
    let mapped = super::mapping::map_page_to_task(&page.properties, &config.field_mapping);

    eprintln!("[notion:pull] Mapped fields: {:?}", mapped);
    eprintln!("[notion:pull] Raw status from Notion: {:?}",
        page.properties.get("Status").and_then(|s| s.get("status")).and_then(|s| s.get("name")));
    eprintln!("[notion:pull] Mapped status_id: {:?}", mapped.get("status_id"));

    let title = mapped["title"]
        .as_str()
        .unwrap_or_else(|| api::extract_page_title(&page.properties).leak())
        .to_string();

    // 5. Resolve status, assignee, company (same logic as sync.rs)

    // Load project statuses
    let target_project_id = config
        .target_project_id
        .as_deref()
        .unwrap_or(&project_id);

    let project_statuses: Vec<crate::commands::work::types::TaskStatus> = client
        .select(
            "task_statuses",
            &format!("project_id=eq.{}&order=sort_order.asc", target_project_id),
        )
        .await?;

    let status_name_map: std::collections::HashMap<String, String> = project_statuses
        .iter()
        .map(|s| (s.name.to_lowercase(), s.id.clone()))
        .collect();

    let default_status_id = project_statuses
        .first()
        .map(|s| s.id.clone())
        .unwrap_or_default();

    // Resolve status
    let resolved_status = mapped
        .get("status_id")
        .and_then(|v| v.as_str())
        .map(|s| {
            if s.len() == 36 && s.contains('-') {
                s.to_string()
            } else {
                status_name_map
                    .get(&s.to_lowercase())
                    .cloned()
                    .unwrap_or_else(|| default_status_id.clone())
            }
        });

    // Load users for assignee resolution
    let users: Vec<crate::commands::work::types::User> = client
        .select("users", "select=id,name,type&type=eq.human")
        .await
        .unwrap_or_default();

    let mut user_name_map: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    for u in &users {
        user_name_map.insert(u.name.to_lowercase(), u.id.clone());
        let initials: String = u
            .name
            .split_whitespace()
            .filter_map(|w| w.chars().next())
            .collect::<String>()
            .to_lowercase();
        if !initials.is_empty() {
            user_name_map.insert(initials, u.id.clone());
        }
    }

    let resolved_assignee = mapped
        .get("assignee_id")
        .and_then(|v| v.as_str())
        .and_then(|s| {
            if s.len() == 36 && s.contains('-') {
                Some(s.to_string())
            } else {
                user_name_map.get(&s.to_lowercase()).cloned()
            }
        });

    // Load companies for company resolution
    let companies: Vec<Value> = client
        .select("crm_companies", "select=id,name,display_name")
        .await
        .unwrap_or_default();

    let mut company_name_map: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    for c in &companies {
        if let Some(id) = c["id"].as_str() {
            if let Some(name) = c["display_name"].as_str().or(c["name"].as_str()) {
                company_name_map.insert(name.to_lowercase(), id.to_string());
            }
            if let Some(name) = c["name"].as_str() {
                company_name_map.insert(name.to_lowercase(), id.to_string());
            }
        }
    }

    // Also add value_map entries for company_id
    if let Some(company_mapping) = config.field_mapping.get("company_id") {
        if let Some(vmap) = company_mapping.get("value_map").and_then(|v| v.as_object()) {
            for (notion_name, crm_id) in vmap {
                if let Some(id) = crm_id.as_str() {
                    company_name_map.insert(notion_name.to_lowercase(), id.to_string());
                }
            }
        }
    }

    let resolved_company =
        if let Some(raw) = mapped.get("company_id").and_then(|v| v.as_str()) {
            if let Some(id) = company_name_map.get(&raw.to_lowercase()) {
                Some(id.clone())
            } else {
                let page_ids: Vec<&str> = raw
                    .split(',')
                    .map(|s| s.trim())
                    .filter(|s| !s.is_empty())
                    .collect();
                let mut found = None;
                for pid in page_ids {
                    if pid.len() == 36 || pid.len() == 32 {
                        let normalized = if pid.contains('-') {
                            pid.to_string()
                        } else {
                            format!(
                                "{}-{}-{}-{}-{}",
                                &pid[..8],
                                &pid[8..12],
                                &pid[12..16],
                                &pid[16..20],
                                &pid[20..]
                            )
                        };
                        if let Ok(title) = api::get_page_title(&normalized).await {
                            if let Some(id) = company_name_map.get(&title.to_lowercase()) {
                                found = Some(id.clone());
                                break;
                            }
                        }
                    }
                }
                found
            }
        } else {
            None
        };

    // Fetch page body content
    let page_body_md = match api::get_page_content_as_markdown(&notion_page_id).await {
        Ok(md) if !md.is_empty() => Some(md),
        _ => None,
    };

    let status_id = resolved_status
        .clone()
        .unwrap_or_else(|| default_status_id.clone());

    let created_at = mapped
        .get("created_at")
        .cloned()
        .or_else(|| page.created_time.as_ref().map(|t| Value::String(t.clone())));
    let updated_at = mapped
        .get("updated_at")
        .cloned()
        .or_else(|| {
            page.last_edited_time
                .as_ref()
                .map(|t| Value::String(t.clone()))
        });

    // 6. Clear last_pushed_at to bypass the echo guard in the RPC
    // (echo guard prevents background syncs from overwriting a just-pushed change,
    // but an explicit "Sync from Notion" click should always apply)
    let _: Value = client
        .update(
            "tasks",
            &format!("id=eq.{}", task_id),
            &serde_json::json!({ "last_pushed_at": null }),
        )
        .await?;

    // 7. Upsert via the same RPC used by bulk sync
    let rpc_params = serde_json::json!({
        "p_notion_page_id": notion_page_id,
        "p_target_project_id": target_project_id,
        "p_title": title,
        "p_status_id": status_id,
        "p_priority": mapped.get("priority").and_then(|v| v.as_i64()).unwrap_or(0),
        "p_description": mapped.get("description"),
        "p_due_date": mapped.get("due_date"),
        "p_assignee_id": resolved_assignee,
        "p_company_id": resolved_company,
        "p_notion_content": page_body_md,
        "p_created_at": created_at,
        "p_updated_at": updated_at,
    });

    let result: Value = client.rpc("sync_notion_task", &rpc_params).await?;
    let action = result["action"]
        .as_str()
        .unwrap_or("updated")
        .to_string();

    eprintln!(
        "[notion:pull] Task {} {} from Notion page {}",
        task_id, action, notion_page_id
    );

    Ok(PushResult {
        action,
        notion_page_id,
    })
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
