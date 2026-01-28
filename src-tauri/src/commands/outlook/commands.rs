// Tauri IPC commands for the Outlook module
// These are registered in main.rs invoke_handler

use super::contacts;
use super::db::EmailDb;
use super::sync;
use super::types::*;
use crate::AppState;

// ============================================================================
// Email queries
// ============================================================================

#[tauri::command]
pub async fn outlook_list_emails(
    folder: Option<String>,
    category: Option<String>,
    status: Option<String>,
    search: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<EmailEntry>, String> {
    eprintln!("[outlook] list_emails called: folder={:?} category={:?} status={:?}", folder, category, status);
    let db = EmailDb::open().map_err(|e| {
        eprintln!("[outlook] list_emails: DB open failed: {}", e);
        e
    })?;
    let result = db.list_emails(
        folder.as_deref(),
        category.as_deref(),
        status.as_deref(),
        search.as_deref(),
        limit.unwrap_or(100),
        offset.unwrap_or(0),
    );
    match &result {
        Ok(emails) => eprintln!("[outlook] list_emails: returned {} emails", emails.len()),
        Err(e) => eprintln!("[outlook] list_emails: query failed: {}", e),
    }
    result
}

#[tauri::command]
pub async fn outlook_get_email(id: String) -> Result<Option<EmailEntry>, String> {
    let db = EmailDb::open()?;
    db.get_email(&id)
}

#[tauri::command]
pub async fn outlook_get_email_body(id: String) -> Result<String, String> {
    let db = EmailDb::open()?;
    sync::ensure_body_cached(&db, &id).await
}

#[tauri::command]
pub async fn outlook_get_stats() -> Result<EmailStats, String> {
    eprintln!("[outlook] get_stats called");
    let db = EmailDb::open().map_err(|e| {
        eprintln!("[outlook] get_stats: DB open failed: {}", e);
        e
    })?;
    let result = db.get_stats();
    match &result {
        Ok(stats) => eprintln!("[outlook] get_stats: total={} unread={} inbox={}", stats.total, stats.unread, stats.inbox),
        Err(e) => eprintln!("[outlook] get_stats: failed: {}", e),
    }
    result
}

// ============================================================================
// Email actions
// ============================================================================

#[tauri::command]
pub async fn outlook_mark_read(id: String) -> Result<(), String> {
    let db = EmailDb::open()?;
    db.mark_read(&id)?;

    // Fire-and-forget Graph API update
    tokio::spawn(async move {
        let graph = super::graph::GraphClient::new();
        if let Err(e) = graph.mark_as_read(&id).await {
            log::warn!("Failed to mark as read in Outlook: {}", e);
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn outlook_archive_email(id: String) -> Result<(), String> {
    let db = EmailDb::open()?;
    db.archive_email(&id)
}

#[tauri::command]
pub async fn outlook_send_email(
    to: Vec<EmailAddress>,
    cc: Option<Vec<EmailAddress>>,
    subject: String,
    body: String,
    reply_to: Option<String>,
) -> Result<(), String> {
    let graph = super::graph::GraphClient::new();

    if let Some(reply_id) = reply_to {
        graph.reply_to_email(&reply_id, &body).await
    } else {
        graph
            .send_email(&to, &cc.unwrap_or_default(), &subject, &body)
            .await
    }
}

// ============================================================================
// Sync commands
// ============================================================================

#[tauri::command]
pub async fn outlook_sync_start(app_handle: tauri::AppHandle) -> Result<i64, String> {
    eprintln!("[outlook] sync_start called");
    let db = EmailDb::open().map_err(|e| {
        eprintln!("[outlook] Failed to open DB: {}", e);
        e
    })?;

    let initial_done = db
        .get_sync_state("initial_sync_done")?
        .map(|v| v == "true")
        .unwrap_or(false);

    eprintln!("[outlook] initial_sync_done={}", initial_done);

    let result = if initial_done {
        sync::run_incremental_sync(&db, &app_handle).await
    } else {
        sync::run_initial_sync(&db, &app_handle).await
    };

    match &result {
        Ok(count) => eprintln!("[outlook] sync complete: {} emails", count),
        Err(e) => eprintln!("[outlook] sync error: {}", e),
    }

    result
}

#[tauri::command]
pub async fn outlook_sync_status() -> Result<SyncStatus, String> {
    let db = EmailDb::open()?;
    let last_sync = db.get_sync_state("last_sync")?;
    let emails_synced = db.get_email_count()?;

    Ok(SyncStatus {
        is_syncing: false, // TODO: track with AtomicBool
        last_sync,
        emails_synced,
        error: None,
    })
}

#[tauri::command]
pub async fn outlook_get_folders() -> Result<Vec<EmailFolder>, String> {
    let graph = super::graph::GraphClient::new();
    let folders = graph.list_folders().await?;

    Ok(folders
        .into_iter()
        .map(|f| EmailFolder {
            id: f.id,
            display_name: f.display_name,
            total_count: f.total_item_count.unwrap_or(0),
            unread_count: f.unread_item_count.unwrap_or(0),
        })
        .collect())
}

#[tauri::command]
pub async fn outlook_bootstrap_contacts(
    state: tauri::State<'_, AppState>,
) -> Result<usize, String> {
    let db = EmailDb::open()?;
    contacts::bootstrap_contacts(&db, &state.knowledge_path)
}
