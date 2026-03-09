// Notion Sync Engine
// Orchestrates syncing Notion database cards into Work Module tasks

use crate::commands::error::{CmdResult, CommandError};
use crate::commands::supabase::get_client;
use crate::commands::work::types::{Project, Task};
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

    let pages = api::query_database(&config.notion_database_id, filter, since).await?;

    let total = pages.len() as i64;
    eprintln!("[notion:sync] Found {} cards to process", total);

    if total == 0 {
        let now = chrono::Utc::now().to_rfc3339();
        // Update last_synced_at even if no changes
        let _: SyncConfig = client
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

    // Get existing tasks with notion_page_id for this project
    let existing_tasks: Vec<Task> = client
        .select(
            "tasks",
            &format!(
                "select=id,notion_page_id,title,status_id,priority,due_date,assignee_id&project_id=eq.{}&notion_page_id=not.is.null",
                target_project_id
            ),
        )
        .await?;

    // Build lookup map: notion_page_id -> task
    let mut existing_map: std::collections::HashMap<String, Task> = std::collections::HashMap::new();
    for task in existing_tasks {
        if let Some(ref npid) = task.notion_page_id {
            existing_map.insert(npid.clone(), task);
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

        if let Some(existing_task) = existing_map.get(&page.id) {
            // UPDATE existing task
            let mut update_data = serde_json::Map::new();

            // Only update fields that changed
            if mapped.get("title").and_then(|v| v.as_str()) != Some(&existing_task.title) {
                if let Some(t) = mapped.get("title") {
                    update_data.insert("title".to_string(), t.clone());
                }
            }
            if let Some(sid) = mapped.get("status_id") {
                if sid.as_str() != existing_task.status_id.as_str().into() {
                    update_data.insert("status_id".to_string(), sid.clone());
                }
            }
            if let Some(p) = mapped.get("priority") {
                update_data.insert("priority".to_string(), p.clone());
            }
            if let Some(d) = mapped.get("due_date") {
                update_data.insert("due_date".to_string(), d.clone());
            }
            if let Some(a) = mapped.get("assignee_id") {
                update_data.insert("assignee_id".to_string(), a.clone());
            }

            if !update_data.is_empty() {
                let _: Value = client
                    .update(
                        "tasks",
                        &format!("id=eq.{}", existing_task.id),
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

            // Get default status_id (first status of the project, or from mapping)
            let status_id = mapped
                .get("status_id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let status_id = if let Some(sid) = status_id {
                sid
            } else {
                // Get first unstarted/backlog status from project
                let statuses: Vec<crate::commands::work::types::TaskStatus> = client
                    .select(
                        "task_statuses",
                        &format!("project_id=eq.{}&order=sort_order.asc", target_project_id),
                    )
                    .await?;

                statuses
                    .first()
                    .map(|s| s.id.clone())
                    .ok_or_else(|| CommandError::Internal("No statuses found for project".into()))?
            };

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
            if let Some(assignee) = mapped.get("assignee_id") {
                insert_data["assignee_id"] = assignee.clone();
            }

            let _task: Task = client.insert("tasks", &insert_data).await?;

            // Increment project's next_task_number
            let _: Project = client
                .update(
                    "projects",
                    &format!("id=eq.{}", target_project_id),
                    &json!({ "next_task_number": next_number + 1 }),
                )
                .await?;

            tasks_created += 1;
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
    let _: SyncConfig = client
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
