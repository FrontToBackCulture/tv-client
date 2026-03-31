// Notion Sync Engine
// Orchestrates syncing Notion database cards into Work Module tasks

use crate::commands::error::{CmdResult, CommandError};
use crate::commands::supabase::get_client;
use std::sync::atomic::{AtomicBool, Ordering};

static SYNC_RUNNING: AtomicBool = AtomicBool::new(false);

/// Guard that clears SYNC_RUNNING on drop — prevents stuck locks
struct SyncGuard;
impl SyncGuard {
    fn acquire() -> Option<Self> {
        if SYNC_RUNNING.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_ok() {
            Some(SyncGuard)
        } else {
            None
        }
    }
}
impl Drop for SyncGuard {
    fn drop(&mut self) {
        SYNC_RUNNING.store(false, Ordering::SeqCst);
    }
}
use serde_json::{json, Value};
use tauri::Emitter;

use super::api;
use super::export;
use super::mapping;
use super::types::*;

/// Run incremental sync for all enabled configs (uses last_synced_at + filter)
pub async fn run_sync(app_handle: &tauri::AppHandle, _incremental: bool) -> CmdResult<Vec<SyncComplete>> {
    let _guard = match SyncGuard::acquire() {
        Some(g) => g,
        None => {
            eprintln!("[notion:sync] Another sync is already running — skipping");
            return Ok(vec![]);
        }
    };
    run_sync_inner(app_handle).await
}

async fn run_sync_inner(app_handle: &tauri::AppHandle) -> CmdResult<Vec<SyncComplete>> {
    let client = get_client().await?;

    let configs: Vec<SyncConfig> = client
        .select("notion_sync_configs", "select=*&enabled=eq.true&order=created_at.asc")
        .await?;

    if configs.is_empty() {
        return Ok(vec![]);
    }

    let mut results = Vec::new();

    for config in &configs {
        // Incremental: skip page body fetch (only metadata), no status filter (use last_synced_at only)
        let mut inc_config = config.clone();
        inc_config.skip_body = true;
        inc_config.filter = None; // Don't filter by status — if edited, sync it
        match sync_config(&inc_config, app_handle).await {
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

/// Run initial sync — full backfill, no filter, only created_time cutoff
pub async fn run_sync_initial(app_handle: &tauri::AppHandle, since_date: &str) -> CmdResult<Vec<SyncComplete>> {
    let _guard = match SyncGuard::acquire() {
        Some(g) => g,
        None => return Err(CommandError::Internal("Another sync is already running".into())),
    };
    run_sync_initial_inner(app_handle, since_date).await
}

async fn run_sync_initial_inner(app_handle: &tauri::AppHandle, since_date: &str) -> CmdResult<Vec<SyncComplete>> {
    let client = get_client().await?;

    let configs: Vec<SyncConfig> = client
        .select("notion_sync_configs", "select=*&enabled=eq.true&order=created_at.asc")
        .await?;

    if configs.is_empty() {
        return Ok(vec![]);
    }

    let mut results = Vec::new();

    for config in &configs {
        // Override: no user filter, use created_time instead of last_edited_time
        let mut initial_config = config.clone();
        initial_config.filter = None; // No status filter
        initial_config.last_synced_at = Some(format!("{}T00:00:00.000Z", since_date));
        initial_config.use_created_time = true; // Filter by created_time, not last_edited_time
        initial_config.skip_body = true; // Skip page body fetch for speed

        match sync_config(&initial_config, app_handle).await {
            Ok(result) => {
                eprintln!("[notion:sync:initial] '{}': {} created, {} updated",
                    config.name, result.tasks_created, result.tasks_updated);
                results.push(result);
            }
            Err(e) => {
                eprintln!("[notion:sync:initial] Error syncing '{}': {}", config.name, e);
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

    // Resolve markdown export directory (if knowledge_path is configured)
    let export_dir = export::get_export_dir(&config.name);
    if let Some(ref dir) = export_dir {
        eprintln!("[notion:sync] Markdown export → {}", dir.display());
    }

    let _ = app_handle.emit(
        "notion:sync-progress",
        SyncProgress {
            phase: "fetching".to_string(),
            current: 0,
            total: 0,
            message: format!("Fetching cards from '{}'...", config.name),
        },
    );

    // Query Notion with filter + since timestamp
    let filter = config.filter.as_ref();
    let since = config.last_synced_at.as_deref();

    let query_result = api::query_database_ex(&config.notion_database_id, filter, since, config.use_created_time).await?;
    let pages = query_result.pages;
    eprintln!("[notion:sync] Fetched {} pages from '{}' (since={:?}, use_created_time={})", pages.len(), config.name, since, config.use_created_time);

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

    // Load global statuses for resolving status names → UUIDs
    let project_statuses: Vec<crate::commands::work::types::TaskStatus> = client
        .select(
            "task_statuses",
            "order=sort_order.asc",
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
        let raw_status = mapped.get("status_id").and_then(|v| v.as_str()).map(|s| s.to_string());
        let resolved_status = raw_status.as_deref()
            .map(|s| {
                if s.len() == 36 && s.contains('-') {
                    s.to_string()
                } else {
                    let resolved = status_name_map
                        .get(&s.to_lowercase())
                        .cloned()
                        .unwrap_or_else(|| default_status_id.clone());
                    eprintln!("[notion:sync] '{}' status name '{}' → {}", title, s, resolved);
                    resolved
                }
            });
        // Log status mapping for every card on first 200 pages
        if i < 200 {
            eprintln!("[notion:sync] [{}/{}] '{}' status: raw={:?} resolved={:?}", i+1, pages.len(), title, raw_status, resolved_status);
        }

        // Resolve assignees: may be comma-separated names from Notion people field
        let resolved_assignees: Vec<String> = mapped
            .get("assignee_id")
            .and_then(|v| v.as_str())
            .map(|s| {
                s.split(',')
                    .map(|name| name.trim())
                    .filter(|name| !name.is_empty())
                    .filter_map(|name| {
                        if name.len() == 36 && name.contains('-') {
                            Some(name.to_string())
                        } else {
                            user_name_map.get(&name.to_lowercase()).cloned()
                        }
                    })
                    .collect()
            })
            .unwrap_or_default();
        let resolved_assignee = resolved_assignees.first().cloned();

        // Resolve company_id: try name match first (covers value_map-resolved names),
        // then resolve Notion relation page IDs by fetching page titles (skip API calls in bulk mode)
        let resolved_company = if let Some(raw) = mapped.get("company_id").and_then(|v| v.as_str()) {
            if let Some(id) = company_name_map.get(&raw.to_lowercase()) {
                Some(id.clone())
            } else if config.skip_body {
                None // Skip slow page title lookups in bulk sync
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

        // Fetch page body content (blocks → markdown) — skip in bulk sync mode
        let page_body_md = if config.skip_body {
            None
        } else {
            match api::get_page_content_as_markdown(&page.id).await {
                Ok(md) if !md.is_empty() => Some(md),
                _ => None,
            }
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
            "p_notion_content": page_body_md,
            "p_created_at": created_at,
            "p_updated_at": updated_at,
        });

        // Timeout per card: 10 seconds max
        let rpc_future = async { let r: Value = client.rpc("sync_notion_task", &rpc_params).await?; Ok::<Value, CommandError>(r) };
        match tokio::time::timeout(std::time::Duration::from_secs(10), rpc_future).await {
            Ok(Ok(result)) => {
                if let Some(action) = result.get("action").and_then(|a| a.as_str()) {
                    match action {
                        "created" => tasks_created += 1,
                        "updated" => tasks_updated += 1,
                        _ => {}
                    }
                }
                // Sync additional assignees (RPC only handles the first one)
                if resolved_assignees.len() > 1 {
                    let task_result: Result<Vec<serde_json::Value>, _> = client.select(
                        "tasks",
                        &format!("select=id&notion_page_id=eq.{}", page.id)
                    ).await;
                    if let Ok(ref tasks_vec) = task_result {
                        if let Some(task_obj) = tasks_vec.first() {
                            if let Some(task_id) = task_obj.get("id").and_then(|v| v.as_str()) {
                                for uid in &resolved_assignees[1..] {
                                    let payload = json!({"task_id": task_id, "user_id": uid});
                                    let _: Result<serde_json::Value, _> = client.insert("task_assignees", &payload).await;
                                }
                            }
                        }
                    }
                }
            }
            Ok(Err(e)) => {
                eprintln!("[notion:sync] Failed to sync card '{}': {}", title, e);
            }
            Err(_) => {
                eprintln!("[notion:sync] Timeout syncing card '{}' — skipping", title);
            }
        }

        // Export as markdown file (if knowledge_path configured)
        if let Some(ref dir) = export_dir {
            if let Err(e) = export::export_page_as_markdown(
                dir,
                page,
                &config.field_mapping,
                page_body_md.as_deref(),
            ) {
                eprintln!("[notion:sync] Export error for '{}': {}", title, e);
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

    // Rebuild markdown index (skip for bulk/initial sync)
    if !config.skip_body {
        if let Some(ref dir) = export_dir {
            export::rebuild_index(dir, &config.name, &config.notion_database_id);
            eprintln!("[notion:sync] Rebuilt markdown index at {}", dir.display());
        }
    }

    // Update last_synced_at
    let now = chrono::Utc::now().to_rfc3339();
    match tokio::time::timeout(
        std::time::Duration::from_secs(10),
        async { let r: Value = client.update("notion_sync_configs", &format!("id=eq.{}", config.id), &json!({ "last_synced_at": now })).await?; Ok::<Value, CommandError>(r) }
    ).await {
        Ok(Ok(_)) => {}
        Ok(Err(e)) => eprintln!("[notion:sync] Failed to update last_synced_at: {}", e),
        Err(_) => eprintln!("[notion:sync] Timeout updating last_synced_at"),
    }

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
