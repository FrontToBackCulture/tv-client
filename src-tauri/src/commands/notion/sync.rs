// Notion Sync Engine
// Orchestrates syncing Notion database cards into Work Module tasks

use crate::commands::error::{CmdResult, CommandError};
use crate::commands::supabase::get_client;
use crate::commands::work::types::Project;
use serde_json::{json, Value};
use tauri::Emitter;

use super::api;
use super::mapping;
use super::types::*;

/// Run sync for all enabled configs
pub async fn run_sync(app_handle: &tauri::AppHandle) -> CmdResult<Vec<SyncComplete>> {
    let client = get_client().await?;

    // Load enabled sync configs from Supabase
    let configs: Vec<SyncConfig> = client
        .select("notion_sync_configs", "select=*&enabled=eq.true&order=created_at.asc")
        .await?;

    if configs.is_empty() {
        return Ok(vec![]);
    }

    let mut results = Vec::new();

    for config in &configs {
        match sync_config(config, app_handle).await {
            Ok(result) => results.push(result),
            Err(e) => {
                eprintln!("[notion:sync] Error syncing '{}': {}", config.name, e);
                let _ = app_handle.emit(
                    "notion:sync-error",
                    json!({ "error": format!("{}", e), "config": config.name }),
                );
            }
        }
    }

    Ok(results)
}

/// Sync a single config
async fn sync_config(
    config: &SyncConfig,
    app_handle: &tauri::AppHandle,
) -> CmdResult<SyncComplete> {
    let client = get_client().await?;

    eprintln!("[notion:sync] Syncing '{}' (db: {})", config.name, config.notion_database_id);

    let _ = app_handle.emit(
        "notion:sync-progress",
        SyncProgress {
            phase: "fetching".to_string(),
            current: 0,
            total: 0,
            message: format!("Fetching cards from '{}'...", config.name),
        },
    );

    // Query Notion with filter + since timestamp for incremental sync
    let filter = config.filter.as_ref();
    let since = config.last_synced_at.as_deref();

    let query_result = api::query_database(&config.notion_database_id, filter, since).await?;
    let pages = query_result.pages;

    // If the filter was rejected, warn the user but continue with unfiltered results
    if let Some(ref warning) = query_result.filter_warning {
        eprintln!("[notion:sync] Filter warning for '{}': {}", config.name, warning);
        let _ = app_handle.emit(
            "notion:sync-filter-warning",
            json!({
                "config": config.name,
                "config_id": config.id,
                "warning": warning,
            }),
        );
    }

    let total = pages.len() as i64;
    eprintln!("[notion:sync] Found {} cards to process", total);

    if total == 0 {
        let now = chrono::Utc::now().to_rfc3339();
        // Update last_synced_at even if no changes
        let _: Value = client
            .update(
                "notion_sync_configs",
                &format!("id=eq.{}", config.id),
                &json!({ "last_synced_at": now }),
            )
            .await?;

        return Ok(SyncComplete {
            tasks_created: 0,
            tasks_updated: 0,
            timestamp: now,
            config_name: config.name.clone(),
        });
    }

    // Get target project info (for task_number increment)
    let target_project_id = config
        .target_project_id
        .as_ref()
        .ok_or_else(|| CommandError::Config("No target project configured for sync".into()))?;

    // Load project statuses for resolving status names → UUIDs
    let project_statuses: Vec<crate::commands::work::types::TaskStatus> = client
        .select(
            "task_statuses",
            &format!("project_id=eq.{}&order=sort_order.asc", target_project_id),
        )
        .await?;

    // Build status name → id lookup (case-insensitive)
    let status_name_map: std::collections::HashMap<String, String> = project_statuses
        .iter()
        .map(|s| (s.name.to_lowercase(), s.id.clone()))
        .collect();

    let default_status_id = project_statuses
        .first()
        .map(|s| s.id.clone())
        .unwrap_or_default();

    // Load users for resolving assignee names → UUIDs
    let users: Vec<crate::commands::work::types::User> = client
        .select("users", "select=id,name,type&type=eq.human")
        .await
        .unwrap_or_default();

    // Build user name → id lookup (case-insensitive, also match initials)
    let mut user_name_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for u in &users {
        user_name_map.insert(u.name.to_lowercase(), u.id.clone());
        // Also map initials (e.g., "YC" → user id)
        let initials: String = u.name.split_whitespace()
            .filter_map(|w| w.chars().next())
            .collect::<String>()
            .to_lowercase();
        if !initials.is_empty() {
            user_name_map.insert(initials, u.id.clone());
        }
    }

    // Get existing tasks with notion_page_id (across all projects — unique constraint is table-wide)
    let existing_tasks: Vec<Value> = client
        .select(
            "tasks",
            "select=id,project_id,notion_page_id,title,status_id,priority,due_date,assignee_id&notion_page_id=not.is.null",
        )
        .await?;

    // Build lookup map: notion_page_id -> task data
    let mut existing_map: std::collections::HashMap<String, Value> = std::collections::HashMap::new();
    for task in existing_tasks {
        if let Some(npid) = task["notion_page_id"].as_str() {
            existing_map.insert(npid.to_string(), task);
        }
    }

    let mut tasks_created = 0i64;
    let mut tasks_updated = 0i64;

    for (i, page) in pages.iter().enumerate() {
        // Map Notion properties to task fields
        let mapped = mapping::map_page_to_task(&page.properties, &config.field_mapping);

        let title = mapped["title"]
            .as_str()
            .unwrap_or_else(|| api::extract_page_title(&page.properties).leak())
            .to_string();

        // Resolve status_id: if it's not a UUID, try matching by name
        let resolved_status = mapped
            .get("status_id")
            .and_then(|v| v.as_str())
            .map(|s| {
                // If it looks like a UUID, use as-is (from value_map)
                if s.len() == 36 && s.contains('-') {
                    s.to_string()
                } else {
                    // Try to match by name (case-insensitive)
                    status_name_map
                        .get(&s.to_lowercase())
                        .cloned()
                        .unwrap_or_else(|| default_status_id.clone())
                }
            });

        // Resolve assignee_id: if it's not a UUID, try matching by name/initials
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

        if let Some(existing_task) = existing_map.get(&page.id) {
            // UPDATE existing task
            let mut update_data = serde_json::Map::new();
            let existing_id = existing_task["id"].as_str().unwrap_or("");

            // Only update fields that changed
            if mapped.get("title").and_then(|v| v.as_str()) != existing_task["title"].as_str() {
                if let Some(t) = mapped.get("title") {
                    update_data.insert("title".to_string(), t.clone());
                }
            }
            if let Some(ref sid) = resolved_status {
                if Some(sid.as_str()) != existing_task["status_id"].as_str() {
                    update_data.insert("status_id".to_string(), Value::String(sid.clone()));
                }
            }
            if let Some(p) = mapped.get("priority") {
                update_data.insert("priority".to_string(), p.clone());
            }
            if let Some(d) = mapped.get("due_date") {
                update_data.insert("due_date".to_string(), d.clone());
            }
            if let Some(ref aid) = resolved_assignee {
                update_data.insert("assignee_id".to_string(), Value::String(aid.clone()));
            }

            if !update_data.is_empty() && !existing_id.is_empty() {
                let _: Value = client
                    .update(
                        "tasks",
                        &format!("id=eq.{}", existing_id),
                        &Value::Object(update_data),
                    )
                    .await?;
                tasks_updated += 1;
            }
        } else {
            // CREATE new task
            let project: Project = client
                .select_single("projects", &format!("id=eq.{}", target_project_id))
                .await?
                .ok_or_else(|| CommandError::NotFound("Target project not found".into()))?;

            let next_number = project.next_task_number.unwrap_or(1);

            // Use resolved status or fall back to default
            let status_id = resolved_status
                .clone()
                .unwrap_or_else(|| default_status_id.clone());

            let mut insert_data = json!({
                "project_id": target_project_id,
                "status_id": status_id,
                "title": title,
                "task_number": next_number,
                "notion_page_id": page.id,
                "priority": mapped.get("priority").and_then(|v| v.as_i64()).unwrap_or(0),
            });

            // Add optional fields from mapping
            if let Some(desc) = mapped.get("description") {
                insert_data["description"] = desc.clone();
            }
            if let Some(due) = mapped.get("due_date") {
                insert_data["due_date"] = due.clone();
            }
            if let Some(ref aid) = resolved_assignee {
                insert_data["assignee_id"] = Value::String(aid.clone());
            }

            match client.insert::<_, Value>("tasks", &insert_data).await {
                Ok(_) => {
                    // Increment project's next_task_number
                    let _: Value = client
                        .update(
                            "projects",
                            &format!("id=eq.{}", target_project_id),
                            &json!({ "next_task_number": next_number + 1 }),
                        )
                        .await?;
                    tasks_created += 1;
                }
                Err(_) => {
                    // Likely duplicate notion_page_id — fall back to update
                    let existing: Option<Value> = client
                        .select_single(
                            "tasks",
                            &format!("select=id&notion_page_id=eq.{}", page.id),
                        )
                        .await?;
                    if let Some(existing) = existing {
                        if let Some(eid) = existing["id"].as_str() {
                            let _: Value = client
                                .update("tasks", &format!("id=eq.{}", eid), &insert_data)
                                .await?;
                            tasks_updated += 1;
                        }
                    }
                }
            }
        }

        // Emit progress every 10 items
        if (i + 1) % 10 == 0 || i + 1 == pages.len() {
            let _ = app_handle.emit(
                "notion:sync-progress",
                SyncProgress {
                    phase: "processing".to_string(),
                    current: (i + 1) as i64,
                    total,
                    message: format!("Processing {} of {} cards...", i + 1, total),
                },
            );
        }

        // Rate limit: small delay between task operations
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }

    // Update last_synced_at
    let now = chrono::Utc::now().to_rfc3339();
    let _: Value = client
        .update(
            "notion_sync_configs",
            &format!("id=eq.{}", config.id),
            &json!({ "last_synced_at": now }),
        )
        .await?;

    let result = SyncComplete {
        tasks_created,
        tasks_updated,
        timestamp: now.clone(),
        config_name: config.name.clone(),
    };

    let _ = app_handle.emit("notion:sync-complete", &result);

    eprintln!(
        "[notion:sync] '{}' done: {} created, {} updated",
        config.name, tasks_created, tasks_updated
    );

    Ok(result)
}
