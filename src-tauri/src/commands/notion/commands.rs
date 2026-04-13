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

/// Per-process cache for relation DB page lookups (page_title → page_id), keyed by Notion DB id.
/// TTL 5 minutes — speeds up bulk pushes and repeated single pushes in a session.
static RELATION_CACHE: once_cell::sync::Lazy<tokio::sync::Mutex<
    std::collections::HashMap<String, (std::time::Instant, std::collections::HashMap<String, String>)>
>> = once_cell::sync::Lazy::new(|| tokio::sync::Mutex::new(std::collections::HashMap::new()));

const RELATION_CACHE_TTL: std::time::Duration = std::time::Duration::from_secs(300);

async fn get_relation_lookup(related_db: &str) -> std::collections::HashMap<String, String> {
    {
        let cache = RELATION_CACHE.lock().await;
        if let Some((at, map)) = cache.get(related_db) {
            if at.elapsed() < RELATION_CACHE_TTL {
                return map.clone();
            }
        }
    }
    let pages = api::list_database_pages(related_db).await.unwrap_or_default();
    let name_to_id: std::collections::HashMap<String, String> = pages.into_iter()
        .map(|(id, title)| (title, id))
        .collect();
    let mut cache = RELATION_CACHE.lock().await;
    cache.insert(related_db.to_string(), (std::time::Instant::now(), name_to_id.clone()));
    name_to_id
}

fn body_hash(task: &Value) -> String {
    use sha2::{Sha256, Digest};
    let mut h = Sha256::new();
    if let Some(json_content) = task.get("description_json").filter(|v| !v.is_null()) {
        h.update(serde_json::to_string(json_content).unwrap_or_default().as_bytes());
    } else {
        h.update(task.get("description").and_then(|v| v.as_str()).unwrap_or("").as_bytes());
    }
    format!("{:x}", h.finalize())
}

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

    let mut task = tasks.into_iter().next()
        .ok_or_else(|| crate::commands::error::CommandError::NotFound(format!("Task {} not found", task_id)))?;

    // Load assignees (task_assignees M2M) and inject first as assignee_id for mapping
    let assignees: Vec<serde_json::Value> = client
        .select("task_assignees", &format!("task_id=eq.{}&select=user_id", task_id))
        .await
        .unwrap_or_default();
    if let Some(first) = assignees.iter().filter_map(|a| a["user_id"].as_str()).next() {
        if let Some(obj) = task.as_object_mut() {
            obj.insert("assignee_id".to_string(), serde_json::Value::String(first.to_string()));
        }
    }

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

        // Load global statuses
        let statuses: Vec<crate::commands::work::types::TaskStatus> = client
            .select("task_statuses", "order=sort_order.asc")
            .await?;

        let status_id_to_name: std::collections::HashMap<String, String> = statuses.iter()
            .map(|s| (s.id.clone(), s.name.clone()))
            .collect();

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
        // Bridge naming mismatches via the config's assignee value_map (Notion name → tv-UUID).
        // If a tv-UUID didn't match by tv-name, look up the Notion user by the value_map name.
        if let Some(assignee_map) = cfg.field_mapping.get("assignee_id")
            .or_else(|| cfg.field_mapping.get("assignees"))
            .and_then(|m| m.get("value_map"))
            .and_then(|v| v.as_object())
        {
            for (notion_name, tv_uuid_val) in assignee_map {
                if let Some(tv_uuid) = tv_uuid_val.as_str() {
                    if user_id_to_notion.contains_key(tv_uuid) { continue; }
                    if let Some(nu) = notion_users.iter().find(|nu| nu.name.to_lowercase() == notion_name.to_lowercase()) {
                        user_id_to_notion.insert(tv_uuid.to_string(), nu.id.clone());
                    }
                }
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

        // Build relation lookups (Notion prop name → map of page_title → page_id) for every
        // relation-typed prop present in the field mapping. Needed to push relation values,
        // since Notion expects page IDs, not names.
        let mut relation_lookups: std::collections::HashMap<String, std::collections::HashMap<String, String>> = std::collections::HashMap::new();
        if let Some(map_obj) = cfg.field_mapping.as_object() {
            for (_, mapping) in map_obj {
                let prop_name = if let Some(s) = mapping.as_str() {
                    s.to_string()
                } else if let Some(obj) = mapping.as_object() {
                    obj.get("source").and_then(|v| v.as_str()).unwrap_or("").to_string()
                } else { continue; };
                if prop_name.is_empty() || relation_lookups.contains_key(&prop_name) { continue; }
                let schema_prop = match schema.properties.iter().find(|p| p.name == prop_name) {
                    Some(p) => p,
                    None => continue,
                };
                if schema_prop.prop_type != "relation" { continue; }
                let related_db = match schema_prop.relation_database_id.as_deref() {
                    Some(id) if !id.is_empty() => id,
                    _ => continue,
                };
                let name_to_id = get_relation_lookup(related_db).await;
                relation_lookups.insert(prop_name, name_to_id);
            }
        }

        let all_props = super::mapping::map_task_to_page(
            &task,
            &cfg.field_mapping,
            &status_id_to_name,
            &user_id_to_notion,
            &company_id_to_name,
            &schema.properties,
            &relation_lookups,
        );

        // Only push specific fields — Notion is source of truth for description
        let push_fields = ["title", "status_id", "priority", "due_date", "company_id", "assignee_id", "assignees"];
        let allowed_notion_props: std::collections::HashSet<String> = push_fields
            .iter()
            .filter_map(|&wf| {
                let m = cfg.field_mapping.get(wf)?;
                if let Some(s) = m.as_str() { Some(s.to_string()) }
                else { m.get("source")?.as_str().map(|s| s.to_string()) }
            })
            .collect();

        let mut props = if let Some(obj) = all_props.as_object() {
            obj.iter()
                .filter(|(k, _)| allowed_notion_props.contains(k.as_str()))
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect::<serde_json::Map<String, Value>>()
        } else {
            serde_json::Map::new()
        };

        // Default "Card Type" to "Task" on push (matches select option type in schema)
        if let Some(card_type) = schema.properties.iter().find(|p| p.name == "Card Type") {
            let val = match card_type.prop_type.as_str() {
                "select" => Some(serde_json::json!({ "select": { "name": "Task" } })),
                "multi_select" => Some(serde_json::json!({ "multi_select": [{ "name": "Task" }] })),
                _ => None,
            };
            if let Some(v) = val {
                props.insert("Card Type".to_string(), v);
            }
        }

        (cfg.notion_database_id.clone(), Value::Object(props))
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
        // Check if page is archived — if so, mark task as complete and skip
        match api::get_page_archived(page_id).await {
            Ok(true) => {
                // Page is archived in Notion — mark task as Archived in tv-client
                let archived_statuses: Vec<crate::commands::work::types::TaskStatus> = client
                    .select("task_statuses", "type=eq.complete&name=eq.Archived")
                    .await
                    .unwrap_or_default();
                if let Some(archived) = archived_statuses.first() {
                    let _: Result<Value, _> = client.update("tasks", &task_id, &serde_json::json!({"status_id": archived.id})).await;
                }
                eprintln!("[notion:push] Page {} is archived — marked task as Archived", page_id);
                return Ok(PushResult { action: "archived".to_string(), notion_page_id: page_id.to_string() });
            }
            _ => {}
        }
        // Update existing page — properties always; replace body only if task originated in tv-client
        eprintln!("[notion:push] task {} sending properties: {}", task_id, serde_json::to_string(&notion_properties).unwrap_or_default());
        api::update_page_properties(page_id, &notion_properties).await?;

        let source = task.get("source").and_then(|v| v.as_str()).unwrap_or("");
        if source != "notion" {
            let new_hash = body_hash(&task);
            let prev_hash = task.get("last_pushed_body_hash").and_then(|v| v.as_str()).unwrap_or("");
            if new_hash != prev_hash {
                let blocks = if let Some(json_content) = task.get("description_json").filter(|v| !v.is_null()) {
                    api::tiptap_json_to_blocks(json_content)
                } else {
                    let description = task["description"].as_str().unwrap_or("");
                    api::markdown_to_blocks(description)
                };
                api::replace_page_blocks(page_id, &blocks).await?;
                let _: Result<Value, _> = client
                    .update(
                        "tasks",
                        &format!("id=eq.{}", task_id),
                        &serde_json::json!({ "last_pushed_body_hash": new_hash }),
                    )
                    .await;
            } else {
                eprintln!("[notion:push] body unchanged for task {} — skipping block replace", task_id);
            }
        }
        ("updated".to_string(), page_id.to_string())
    } else {
        // Create new page — prefer TipTap JSON for content, fall back to markdown
        let blocks = if let Some(json_content) = task.get("description_json").filter(|v| !v.is_null()) {
            api::tiptap_json_to_blocks(json_content)
        } else {
            let description = task["description"].as_str().unwrap_or("");
            api::markdown_to_blocks(description)
        };
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

    let target_project_id = config
        .target_project_id
        .as_deref()
        .unwrap_or(&project_id);

    // Load global statuses (task_statuses is no longer per-project)
    let project_statuses: Vec<crate::commands::work::types::TaskStatus> = client
        .select("task_statuses", "order=sort_order.asc")
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

    // Fetch page body content (markdown + TipTap JSON)
    let page_body_md = match api::get_page_content_as_markdown(&notion_page_id).await {
        Ok(md) if !md.is_empty() => Some(md),
        _ => None,
    };

    // Also generate TipTap JSON for rich content (toggle blocks, etc.)
    let page_body_json: Option<Value> = match api::get_page_blocks_raw(&notion_page_id).await {
        Ok(blocks) if !blocks.is_empty() => Some(api::blocks_to_tiptap_json(&blocks)),
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

    // Clear description_json so the UI falls back to ReactMarkdown rendering of
    // the markdown description. Notion pages frequently contain markdown syntax
    // stored as literal plain_text (pasted markdown, asymmetric emphasis), which
    // the TipTap converter can't losslessly represent — ReactMarkdown handles
    // those cases correctly. User edits via TipTap editor will repopulate it.
    let _ = page_body_json;
    let _: Value = client
        .update(
            "tasks",
            &format!("id=eq.{}", task_id),
            &serde_json::json!({ "description_json": null }),
        )
        .await?;

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
    use tauri::Emitter;
    let job_id = format!("notion-manual-{}", chrono::Utc::now().timestamp_millis());
    let started_at = chrono::Utc::now().to_rfc3339();
    eprintln!("[notion] Manual incremental sync triggered");

    // Emit job start
    let _ = app_handle.emit("jobs:update", serde_json::json!({
        "id": job_id, "name": "Notion Incremental Sync", "status": "running",
        "message": "Starting manual sync...", "startedAt": started_at,
    }));

    let result = sync::run_sync(&app_handle, false).await;

    match &result {
        Ok(results) => {
            let created: i64 = results.iter().map(|r| r.tasks_created).sum();
            let updated: i64 = results.iter().map(|r| r.tasks_updated).sum();
            let msg = if results.is_empty() { "Skipped (another sync running)".to_string() }
                else { format!("{} created, {} updated", created, updated) };
            let _ = app_handle.emit("jobs:update", serde_json::json!({
                "id": job_id, "name": "Notion Incremental Sync",
                "status": if results.is_empty() { "failed" } else { "completed" },
                "message": msg, "startedAt": started_at,
            }));
        }
        Err(e) => {
            let _ = app_handle.emit("jobs:update", serde_json::json!({
                "id": job_id, "name": "Notion Incremental Sync", "status": "failed",
                "message": format!("{}", e), "startedAt": started_at,
            }));
        }
    }
    result
}

/// Initial sync — full backfill, ignores filter and last_synced_at
#[tauri::command]
pub async fn notion_sync_initial(app_handle: tauri::AppHandle, since_date: Option<String>) -> CmdResult<Vec<SyncComplete>> {
    use tauri::Emitter;
    let since = since_date.unwrap_or_else(|| "2025-08-01".to_string());
    let job_id = format!("notion-initial-{}", chrono::Utc::now().timestamp_millis());
    let started_at = chrono::Utc::now().to_rfc3339();
    eprintln!("[notion] Initial sync triggered (since {})", since);

    let _ = app_handle.emit("jobs:update", serde_json::json!({
        "id": job_id, "name": "Notion Initial Sync", "status": "running",
        "message": format!("Full backfill since {}...", since), "startedAt": started_at,
    }));

    let result = sync::run_sync_initial(&app_handle, &since).await;

    match &result {
        Ok(results) => {
            let created: i64 = results.iter().map(|r| r.tasks_created).sum();
            let updated: i64 = results.iter().map(|r| r.tasks_updated).sum();
            let _ = app_handle.emit("jobs:update", serde_json::json!({
                "id": job_id, "name": "Notion Initial Sync", "status": "completed",
                "message": format!("{} created, {} updated", created, updated), "startedAt": started_at,
            }));
        }
        Err(e) => {
            let _ = app_handle.emit("jobs:update", serde_json::json!({
                "id": job_id, "name": "Notion Initial Sync", "status": "failed",
                "message": format!("{}", e), "startedAt": started_at,
            }));
        }
    }
    result
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
