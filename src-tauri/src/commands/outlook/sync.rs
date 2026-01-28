// Sync orchestration - initial + incremental sync
// Coordinates Graph API fetching, classification, and database writes

use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;

use super::classify::{calculate_priority, classify_email, is_action_required};
use super::db::EmailDb;
use super::graph::GraphClient;
use super::types::*;

// ============================================================================
// Body storage
// ============================================================================

fn get_bodies_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".tv-desktop")
        .join("outlook")
        .join("bodies")
}

fn body_file_path(message_id: &str) -> PathBuf {
    let mut hasher = Sha256::new();
    hasher.update(message_id.as_bytes());
    let hash = format!("{:x}", hasher.finalize());
    get_bodies_dir().join(format!("{}.html", &hash[..16]))
}

pub fn read_body_file(message_id: &str) -> Option<String> {
    let path = body_file_path(message_id);
    fs::read_to_string(&path).ok()
}

fn write_body_file(message_id: &str, html: &str) -> Result<String, String> {
    let dir = get_bodies_dir();
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create bodies dir: {}", e))?;
    }
    let path = body_file_path(message_id);
    fs::write(&path, html)
        .map_err(|e| format!("Failed to write body: {}", e))?;
    Ok(path.to_string_lossy().to_string())
}

// ============================================================================
// Initial sync
// ============================================================================

/// Run initial sync - fetch all messages metadata, store in DB
pub async fn run_initial_sync(
    db: &EmailDb,
    app_handle: &tauri::AppHandle,
) -> Result<i64, String> {
    use tauri::Emitter;

    eprintln!("[outlook:sync] Starting initial sync...");
    let graph = GraphClient::new();

    // 1. Sync folder map
    emit_progress(app_handle, "folders", 0, 0, "Fetching folders...");
    eprintln!("[outlook:sync] Fetching folders...");
    let folders = graph.list_folders().await.map_err(|e| {
        eprintln!("[outlook:sync] Failed to list folders: {}", e);
        e
    })?;
    eprintln!("[outlook:sync] Got {} folders", folders.len());
    for folder in &folders {
        db.upsert_folder(&folder.id, &folder.display_name)?;
    }

    // 2. Fetch all messages (metadata only, no bodies)
    emit_progress(app_handle, "messages", 0, 0, "Fetching messages...");
    eprintln!("[outlook:sync] Fetching messages (up to 10000)...");
    let messages = graph.fetch_messages(10000, None).await.map_err(|e| {
        eprintln!("[outlook:sync] Failed to fetch messages: {}", e);
        e
    })?;
    let total = messages.len() as i64;
    eprintln!("[outlook:sync] Got {} messages, processing...", total);

    // 3. Process and store each message
    let mut synced = 0i64;
    for (i, msg) in messages.iter().enumerate() {
        let email = graph_message_to_entry(msg, db)?;
        db.upsert_email(&email)?;
        synced += 1;

        if i % 50 == 0 {
            emit_progress(
                app_handle,
                "processing",
                synced,
                total,
                &format!("Processing {} of {} emails...", synced, total),
            );
        }
    }

    // 4. Record sync time
    let now = chrono::Utc::now().to_rfc3339();
    db.set_sync_state("last_sync", &now)?;
    db.set_sync_state("initial_sync_done", "true")?;

    emit_progress(app_handle, "complete", synced, total, "Sync complete");

    // Emit completion event
    let _ = app_handle.emit("outlook:sync-complete", serde_json::json!({
        "emailsSynced": synced,
        "timestamp": now,
    }));

    Ok(synced)
}

// ============================================================================
// Incremental sync (timestamp-based)
// ============================================================================

/// Run incremental sync - fetch messages received since last sync
pub async fn run_incremental_sync(
    db: &EmailDb,
    app_handle: &tauri::AppHandle,
) -> Result<i64, String> {
    use tauri::Emitter;

    let last_sync = db.get_sync_state("last_sync")?;
    let graph = GraphClient::new();

    eprintln!("[outlook:sync] Incremental sync, last_sync={:?}", last_sync);
    emit_progress(app_handle, "incremental", 0, 0, "Checking for new emails...");

    // Build filter for messages received after last sync
    // Ensure timestamp is ISO 8601 for Graph API (replace space with T, ensure Z suffix)
    let filter = last_sync.as_deref().map(|ts| {
        let iso_ts = ts.replace(' ', "T");
        let iso_ts = if iso_ts.ends_with('Z') || iso_ts.contains('+') { iso_ts } else { format!("{}Z", iso_ts) };
        format!("receivedDateTime gt {}", iso_ts)
    });

    let messages = graph
        .fetch_messages(500, filter.as_deref())
        .await?;

    eprintln!("[outlook:sync] Incremental: got {} new/updated messages", messages.len());

    let mut synced = 0i64;

    for msg in &messages {
        let email = graph_message_to_entry(msg, db)?;
        db.upsert_email(&email)?;
        synced += 1;
    }

    // Update sync time
    let now = chrono::Utc::now().to_rfc3339();
    db.set_sync_state("last_sync", &now)?;

    if synced > 0 {
        emit_progress(app_handle, "complete", synced, synced, &format!("{} new emails synced", synced));
    } else {
        emit_progress(app_handle, "complete", 0, 0, "Already up to date");
    }

    let _ = app_handle.emit("outlook:sync-complete", serde_json::json!({
        "emailsSynced": synced,
        "timestamp": now,
        "incremental": true,
    }));

    Ok(synced)
}

// ============================================================================
// Lazy body fetch
// ============================================================================

/// Fetch email body from Graph API if not cached locally
pub async fn ensure_body_cached(
    db: &EmailDb,
    message_id: &str,
) -> Result<String, String> {
    // Check if already on disk
    if let Some(html) = read_body_file(message_id) {
        return Ok(html);
    }

    // Fetch from Graph
    let graph = GraphClient::new();
    let body = graph.fetch_message_body(message_id).await?;
    let html = body.content.unwrap_or_default();

    // Write to disk
    let path = write_body_file(message_id, &html)?;
    db.set_body_path(message_id, &path)?;

    Ok(html)
}

// ============================================================================
// Helpers
// ============================================================================

fn graph_message_to_entry(
    msg: &GraphMessage,
    db: &EmailDb,
) -> Result<EmailEntry, String> {
    let from_name = msg
        .from
        .as_ref()
        .and_then(|r| r.email_address.name.clone())
        .unwrap_or_default();
    let from_email = msg
        .from
        .as_ref()
        .and_then(|r| r.email_address.address.clone())
        .unwrap_or_default();

    let to_addresses: Vec<EmailAddress> = msg
        .to_recipients
        .as_ref()
        .map(|recipients| {
            recipients
                .iter()
                .map(|r| EmailAddress {
                    name: r.email_address.name.clone().unwrap_or_default(),
                    email: r.email_address.address.clone().unwrap_or_default(),
                })
                .collect()
        })
        .unwrap_or_default();

    let cc_addresses: Vec<EmailAddress> = msg
        .cc_recipients
        .as_ref()
        .map(|recipients| {
            recipients
                .iter()
                .map(|r| EmailAddress {
                    name: r.email_address.name.clone().unwrap_or_default(),
                    email: r.email_address.address.clone().unwrap_or_default(),
                })
                .collect()
        })
        .unwrap_or_default();

    let received_at = msg
        .received_date_time
        .clone()
        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

    let folder_name = msg
        .parent_folder_id
        .as_ref()
        .and_then(|fid| db.get_folder_name(fid).ok())
        .unwrap_or_else(|| "Inbox".to_string());

    let importance = msg.importance.clone().unwrap_or_else(|| "normal".to_string());
    let is_read = msg.is_read.unwrap_or(false);
    let has_attachments = msg.has_attachments.unwrap_or(false);
    let body_preview = msg.body_preview.clone().unwrap_or_default();
    let subject = msg.subject.clone().unwrap_or_default();

    // Classify
    let classification = classify_email(&from_email, &subject, &body_preview, db);
    let (priority_score, priority_level) =
        calculate_priority(&classification.category, &received_at, is_read, &importance);
    let action_required = is_action_required(&classification.category, priority_score);

    // Check if body already cached
    let body_path = if read_body_file(&msg.id).is_some() {
        Some(body_file_path(&msg.id).to_string_lossy().to_string())
    } else {
        None
    };

    Ok(EmailEntry {
        id: msg.id.clone(),
        conversation_id: msg.conversation_id.clone(),
        subject,
        from_name,
        from_email,
        to_addresses,
        cc_addresses,
        received_at,
        folder_name,
        importance,
        is_read,
        has_attachments,
        body_preview,
        body_path,
        category: classification.category,
        priority_score,
        priority_level,
        ai_summary: None,
        action_required,
        status: if is_read { "read" } else { "inbox" }.to_string(),
        linked_company_id: classification.entity_path.clone(),
        linked_company_name: classification.entity_name,
    })
}

fn emit_progress(
    app_handle: &tauri::AppHandle,
    phase: &str,
    current: i64,
    total: i64,
    message: &str,
) {
    use tauri::Emitter;
    let _ = app_handle.emit(
        "outlook:sync-progress",
        SyncProgress {
            phase: phase.to_string(),
            current,
            total,
            message: message.to_string(),
        },
    );
}
