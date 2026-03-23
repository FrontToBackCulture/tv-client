// Notion Sync Engine
// Orchestrates syncing Notion database cards into Work Module tasks

use crate::commands::error::{CmdResult, CommandError};
use crate::commands::supabase::get_client;
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

    // Load companies for resolving company names → UUIDs
    let companies: Vec<Value> = client
        .select("crm_companies", "select=id,name,display_name")
        .await
        .unwrap_or_default();

    let mut company_name_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for c in &companies {
        if let Some(id) = c["id"].as_str() {
            if let Some(name) = c["display_name"].as_str().or(c["name"].as_str()) {
                company_name_map.insert(name.to_lowercase(), id.to_string());
            }
            // Also add raw name if display_name differs
            if let Some(name) = c["name"].as_str() {
                company_name_map.insert(name.to_lowercase(), id.to_string());
            }
        }
    }

    // Also add value_map entries for company_id so Notion names resolve even if they differ from CRM names
    if let Some(company_mapping) = config.field_mapping.get("company_id") {
        if let Some(vmap) = company_mapping.get("value_map").and_then(|v| v.as_object()) {
            for (notion_name, crm_id) in vmap {
                if let Some(id) = crm_id.as_str() {
                    company_name_map.insert(notion_name.to_lowercase(), id.to_string());
                }
            }
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
                if s.len() == 36 && s.contains('-') {
                    s.to_string()
                } else {
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

        // Resolve company_id: try name match first (covers value_map-resolved names),
        // then resolve Notion relation page IDs by fetching page titles
        let resolved_company = if let Some(raw) = mapped.get("company_id").and_then(|v| v.as_str()) {
            if let Some(id) = company_name_map.get(&raw.to_lowercase()) {
                Some(id.clone())
            } else {
                let page_ids: Vec<&str> = raw.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
                let mut found = None;
                for page_id in page_ids {
                    if page_id.len() == 36 || page_id.len() == 32 {
                        let normalized = if page_id.contains('-') { page_id.to_string() } else {
                            format!("{}-{}-{}-{}-{}", &page_id[..8], &page_id[8..12], &page_id[12..16], &page_id[16..20], &page_id[20..])
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

        // Fetch page body content (blocks → markdown)
        let notion_content = match api::get_page_content_as_markdown(&page.id).await {
            Ok(md) if !md.is_empty() => Some(md),
            _ => None,
        };

        // Use resolved status or fall back to default
        let status_id = resolved_status
            .clone()
            .unwrap_or_else(|| default_status_id.clone());

        // Resolve timestamps
        let created_at = mapped.get("created_at").cloned()
            .or_else(|| page.created_time.as_ref().map(|t| Value::String(t.clone())));
        let updated_at = mapped.get("updated_at").cloned()
            .or_else(|| page.last_edited_time.as_ref().map(|t| Value::String(t.clone())));

        // Atomic upsert via RPC — never overwrites project_id on existing tasks
        let rpc_params = json!({
            "p_notion_page_id": page.id,
            "p_target_project_id": target_project_id,
            "p_title": title,
            "p_status_id": status_id,
            "p_priority": mapped.get("priority").and_then(|v| v.as_i64()).unwrap_or(0),
            "p_description": mapped.get("description"),
            "p_due_date": mapped.get("due_date"),
            "p_assignee_id": resolved_assignee,
            "p_company_id": resolved_company,
            "p_notion_content": notion_content,
            "p_created_at": created_at,
            "p_updated_at": updated_at,
        });

        let result: Value = client.rpc("sync_notion_task", &rpc_params).await?;
        match result.get("action").and_then(|a| a.as_str()) {
            Some("created") => tasks_created += 1,
            Some("updated") => tasks_updated += 1,
            _ => {}
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
