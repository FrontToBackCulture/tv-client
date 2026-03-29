// Tauri IPC commands for the Outlook module
// These are registered in main.rs invoke_handler

use super::contacts;
use super::db::EmailDb;
use super::sync;
use super::types::*;
use crate::commands::error::CmdResult;
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
) -> CmdResult<Vec<EmailEntry>> {
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
pub async fn outlook_get_email(id: String) -> CmdResult<Option<EmailEntry>> {
    let db = EmailDb::open()?;
    db.get_email(&id)
}

#[tauri::command]
pub async fn outlook_get_email_body(id: String) -> CmdResult<String> {
    let db = EmailDb::open()?;
    sync::ensure_body_cached(&db, &id).await
}

#[tauri::command]
pub async fn outlook_get_stats() -> CmdResult<EmailStats> {
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
pub async fn outlook_mark_read(id: String, app_handle: tauri::AppHandle) -> CmdResult<()> {
    let db = EmailDb::open()?;
    db.mark_read(&id)?;

    // Fire-and-forget Graph API update
    tokio::spawn(async move {
        use tauri::Emitter;
        let job_id = format!("archive-email-{}", chrono::Utc::now().timestamp_millis());
        let started_at = chrono::Utc::now().to_rfc3339();
        let _ = app_handle.emit("jobs:update", serde_json::json!({
            "id": &job_id, "name": "Archive Email", "status": "running",
            "message": "Syncing read status to Outlook...", "startedAt": &started_at,
        }));
        let graph = super::graph::GraphClient::new();
        match graph.mark_as_read(&id).await {
            Ok(_) => {
                let _ = app_handle.emit("jobs:update", serde_json::json!({
                    "id": &job_id, "name": "Archive Email", "status": "completed",
                    "message": "Email marked as read in Outlook", "startedAt": &started_at,
                }));
            }
            Err(e) => {
                log::warn!("Failed to mark as read in Outlook: {}", e);
                let _ = app_handle.emit("jobs:update", serde_json::json!({
                    "id": &job_id, "name": "Archive Email", "status": "failed",
                    "message": format!("{}", e), "startedAt": &started_at,
                }));
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn outlook_archive_email(id: String) -> CmdResult<()> {
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
) -> CmdResult<()> {
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

/// Initial setup — runs initial email sync + initial calendar sync.
/// Called from Settings when the user first connects Outlook.
#[tauri::command]
pub async fn outlook_initial_setup(app_handle: tauri::AppHandle, months: Option<i64>) -> CmdResult<serde_json::Value> {
    use tauri::Emitter;

    let m = months.unwrap_or(6);
    let job_id = format!("outlook-initial-{}", chrono::Utc::now().timestamp_millis());
    let started_at = chrono::Utc::now().to_rfc3339();
    eprintln!("[outlook] initial_setup called, months={}", m);

    let _ = app_handle.emit("jobs:update", serde_json::json!({
        "id": &job_id, "name": "Outlook Initial Setup", "status": "running",
        "message": format!("Syncing {} months of emails + calendar...", m), "startedAt": &started_at,
    }));

    let db = EmailDb::open().map_err(|e| {
        eprintln!("[outlook] Failed to open DB: {}", e);
        e
    })?;

    let _ = db.set_sync_state("sync_months", &m.to_string());

    let email_count = sync::run_initial_sync(&db, &app_handle, m).await.map_err(|e| {
        let _ = app_handle.emit("jobs:update", serde_json::json!({
            "id": &job_id, "name": "Outlook Initial Setup", "status": "failed",
            "message": format!("Email sync failed: {}", e), "startedAt": &started_at,
        }));
        e
    })?;

    let event_count = sync::run_calendar_sync(&db, &app_handle, m).await.map_err(|e| {
        let _ = app_handle.emit("jobs:update", serde_json::json!({
            "id": &job_id, "name": "Outlook Initial Setup", "status": "failed",
            "message": format!("Calendar sync failed: {}", e), "startedAt": &started_at,
        }));
        e
    })?;

    let msg = format!("{} emails, {} events synced", email_count, event_count);
    let _ = app_handle.emit("jobs:update", serde_json::json!({
        "id": &job_id, "name": "Outlook Initial Setup", "status": "completed",
        "message": &msg, "startedAt": &started_at,
    }));
    eprintln!("[outlook] initial_setup complete: {}", msg);

    let _ = app_handle.emit("outlook:setup-complete", serde_json::json!({
        "emails": email_count,
        "events": event_count,
    }));

    Ok(serde_json::json!({ "emails": email_count, "events": event_count }))
}

/// Incremental email sync only. Requires initial sync to be done first.
#[tauri::command]
pub async fn outlook_sync_start(app_handle: tauri::AppHandle) -> CmdResult<i64> {
    use tauri::Emitter;
    let job_id = format!("outlook-manual-{}", chrono::Utc::now().timestamp_millis());
    let started_at = chrono::Utc::now().to_rfc3339();
    eprintln!("[outlook] sync_start called (incremental)");

    let _ = app_handle.emit("jobs:update", serde_json::json!({
        "id": &job_id, "name": "Outlook Email Sync", "status": "running",
        "message": "Syncing emails...", "startedAt": &started_at,
    }));

    let db = EmailDb::open().map_err(|e| {
        eprintln!("[outlook] Failed to open DB: {}", e);
        e
    })?;

    let initial_done = db
        .get_sync_state("initial_sync_done")?
        .map(|v| v == "true")
        .unwrap_or(false);

    if !initial_done {
        let _ = app_handle.emit("jobs:update", serde_json::json!({
            "id": &job_id, "name": "Outlook Email Sync", "status": "failed",
            "message": "Initial sync not completed", "startedAt": &started_at,
        }));
        return Err("Initial sync not completed. Go to Settings > Outlook to set up.".into());
    }

    let result = sync::run_incremental_sync(&db, &app_handle).await;
    match &result {
        Ok(count) => {
            let _ = app_handle.emit("jobs:update", serde_json::json!({
                "id": &job_id, "name": "Outlook Email Sync", "status": "completed",
                "message": format!("{} emails", count), "startedAt": &started_at,
            }));
        }
        Err(e) => {
            let _ = app_handle.emit("jobs:update", serde_json::json!({
                "id": &job_id, "name": "Outlook Email Sync", "status": "failed",
                "message": format!("{}", e), "startedAt": &started_at,
            }));
        }
    }
    result
}

#[tauri::command]
pub async fn outlook_sync_status() -> CmdResult<SyncStatus> {
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
pub async fn outlook_get_folders() -> CmdResult<Vec<EmailFolder>> {
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

// ============================================================================
// Calendar commands
// ============================================================================

#[tauri::command]
pub async fn outlook_get_event(id: String) -> CmdResult<Option<super::types::CalendarEvent>> {
    let db = EmailDb::open()?;
    db.get_event(&id)
}

#[tauri::command]
pub async fn outlook_list_calendars() -> CmdResult<Vec<super::types::CalendarEntry>> {
    let graph = super::graph::GraphClient::new();
    let calendars = graph.list_calendars().await?;

    Ok(calendars
        .into_iter()
        .map(|c| super::types::CalendarEntry {
            id: c.id,
            name: c.name.unwrap_or_else(|| "Calendar".to_string()),
            is_default: c.is_default_calendar.unwrap_or(false),
        })
        .collect())
}

#[tauri::command]
pub async fn outlook_list_events(
    start_time: String,
    end_time: String,
    limit: Option<i64>,
) -> CmdResult<Vec<super::types::CalendarEvent>> {
    eprintln!("[outlook:calendar] list_events called: start={}, end={}", start_time, end_time);
    let db = EmailDb::open()?;
    let max = limit.unwrap_or(200);

    // Try fresh fetch from Graph API, upsert into cache (no delete)
    let graph = super::graph::GraphClient::new();
    match graph.fetch_events(max as usize, &start_time, &end_time).await {
        Ok(api_events) => {
            eprintln!("[outlook:calendar] Got {} events from API", api_events.len());
            let converted: Vec<super::types::CalendarEvent> = api_events
                .into_iter()
                .map(graph_event_to_calendar_event)
                .collect();
            for event in &converted {
                let _ = db.upsert_event(event);
            }
            Ok(converted)
        }
        Err(e) => {
            // API failed — fall back to cached events from SQLite
            eprintln!("[outlook:calendar] API fetch failed, falling back to cache: {}", e);
            db.list_events(&start_time, &end_time, max)
        }
    }
}

/// Convert GraphEvent reference to CalendarEvent (for sync, where we borrow)
pub fn graph_event_to_calendar_event_from_ref(e: &super::types::GraphEvent) -> super::types::CalendarEvent {
    let start = e.start.as_ref();
    let end = e.end.as_ref();

    let organizer_addr = e.organizer.as_ref().map(|o| &o.email_address);
    let attendees: Vec<super::types::EventAttendee> = e
        .attendees
        .as_ref()
        .map(|atts| atts.iter().map(|a| super::types::EventAttendee {
            name: a.email_address.name.clone().unwrap_or_default(),
            email: a.email_address.address.clone().unwrap_or_default(),
            response_status: a.status.as_ref().and_then(|s| s.response.clone()).unwrap_or_else(|| "none".to_string()),
            attendee_type: a.attendee_type.clone().unwrap_or_else(|| "required".to_string()),
        }).collect())
        .unwrap_or_default();

    super::types::CalendarEvent {
        id: e.id.clone(),
        subject: e.subject.clone().unwrap_or_default(),
        body_preview: e.body_preview.clone().unwrap_or_default(),
        start_at: start.and_then(|s| s.date_time.clone()).unwrap_or_default(),
        start_timezone: start.and_then(|s| s.time_zone.clone()).unwrap_or_default(),
        end_at: end.and_then(|s| s.date_time.clone()).unwrap_or_default(),
        end_timezone: end.and_then(|s| s.time_zone.clone()).unwrap_or_default(),
        is_all_day: e.is_all_day.unwrap_or(false),
        location: e.location.as_ref().and_then(|l| l.display_name.clone()).unwrap_or_default(),
        organizer_name: organizer_addr.and_then(|a| a.name.clone()).unwrap_or_default(),
        organizer_email: organizer_addr.and_then(|a| a.address.clone()).unwrap_or_default(),
        attendees,
        is_online_meeting: e.is_online_meeting.unwrap_or(false),
        online_meeting_url: e.online_meeting.as_ref().and_then(|m| m.join_url.clone()),
        show_as: e.show_as.clone().unwrap_or_else(|| "busy".to_string()),
        importance: e.importance.clone().unwrap_or_else(|| "normal".to_string()),
        is_cancelled: e.is_cancelled.unwrap_or(false),
        web_link: e.web_link.clone().unwrap_or_default(),
        created_at: e.created_date_time.clone().unwrap_or_default(),
        last_modified_at: e.last_modified_date_time.clone().unwrap_or_default(),
        categories: e.categories.clone().unwrap_or_default(),
    }
}

fn graph_event_to_calendar_event(e: super::types::GraphEvent) -> super::types::CalendarEvent {
    let start = e.start.as_ref();
    let end = e.end.as_ref();

    let organizer_addr = e.organizer.as_ref().map(|o| &o.email_address);
    let attendees: Vec<super::types::EventAttendee> = e
        .attendees
        .unwrap_or_default()
        .into_iter()
        .map(|a| super::types::EventAttendee {
            name: a.email_address.name.unwrap_or_default(),
            email: a.email_address.address.unwrap_or_default(),
            response_status: a.status.and_then(|s| s.response).unwrap_or_else(|| "none".to_string()),
            attendee_type: a.attendee_type.unwrap_or_else(|| "required".to_string()),
        })
        .collect();

    super::types::CalendarEvent {
        id: e.id,
        subject: e.subject.unwrap_or_default(),
        body_preview: e.body_preview.unwrap_or_default(),
        start_at: start.and_then(|s| s.date_time.clone()).unwrap_or_default(),
        start_timezone: start.and_then(|s| s.time_zone.clone()).unwrap_or_default(),
        end_at: end.and_then(|s| s.date_time.clone()).unwrap_or_default(),
        end_timezone: end.and_then(|s| s.time_zone.clone()).unwrap_or_default(),
        is_all_day: e.is_all_day.unwrap_or(false),
        location: e.location.and_then(|l| l.display_name).unwrap_or_default(),
        organizer_name: organizer_addr.and_then(|a| a.name.clone()).unwrap_or_default(),
        organizer_email: organizer_addr.and_then(|a| a.address.clone()).unwrap_or_default(),
        attendees,
        is_online_meeting: e.is_online_meeting.unwrap_or(false),
        online_meeting_url: e.online_meeting.and_then(|m| m.join_url),
        show_as: e.show_as.unwrap_or_else(|| "busy".to_string()),
        importance: e.importance.unwrap_or_else(|| "normal".to_string()),
        is_cancelled: e.is_cancelled.unwrap_or(false),
        web_link: e.web_link.unwrap_or_default(),
        created_at: e.created_date_time.unwrap_or_default(),
        last_modified_at: e.last_modified_date_time.unwrap_or_default(),
        categories: e.categories.unwrap_or_default(),
    }
}

// ============================================================================
// Calendar sync commands
// ============================================================================

/// Incremental calendar sync only (1 month back + 2 months forward, clear-and-replace).
/// Requires initial setup to be done first.
#[tauri::command]
pub async fn outlook_calendar_sync_start(app_handle: tauri::AppHandle) -> CmdResult<i64> {
    use tauri::Emitter;
    let job_id = format!("outlook-cal-manual-{}", chrono::Utc::now().timestamp_millis());
    let started_at = chrono::Utc::now().to_rfc3339();
    eprintln!("[outlook:calendar] sync_start called (incremental)");

    let _ = app_handle.emit("jobs:update", serde_json::json!({
        "id": &job_id, "name": "Outlook Calendar Sync", "status": "running",
        "message": "Syncing events...", "startedAt": &started_at,
    }));

    let db = EmailDb::open()?;
    let initial_done = db
        .get_sync_state("calendar_initial_sync_done")?
        .map(|v| v == "true")
        .unwrap_or(false);

    if !initial_done {
        let _ = app_handle.emit("jobs:update", serde_json::json!({
            "id": &job_id, "name": "Outlook Calendar Sync", "status": "failed",
            "message": "Initial sync not completed", "startedAt": &started_at,
        }));
        return Err("Calendar initial sync not completed. Go to Settings > Outlook to set up.".into());
    }

    let result = sync::run_calendar_sync(&db, &app_handle, 1).await;
    match &result {
        Ok(count) => {
            let _ = app_handle.emit("jobs:update", serde_json::json!({
                "id": &job_id, "name": "Outlook Calendar Sync", "status": "completed",
                "message": format!("{} events", count), "startedAt": &started_at,
            }));
        }
        Err(e) => {
            let _ = app_handle.emit("jobs:update", serde_json::json!({
                "id": &job_id, "name": "Outlook Calendar Sync", "status": "failed",
                "message": format!("{}", e), "startedAt": &started_at,
            }));
        }
    }
    result
}

#[tauri::command]
pub async fn outlook_calendar_sync_status() -> CmdResult<super::types::CalendarSyncStatus> {
    let db = EmailDb::open()?;
    let last_sync = db.get_sync_state("calendar_last_sync")?;
    let events_synced = db.get_event_count()?;

    Ok(super::types::CalendarSyncStatus {
        is_syncing: false,
        last_sync,
        events_synced,
        error: None,
    })
}

// ============================================================================
// Calendar event scan (matches local SQLite events against CRM domains/contacts)
// ============================================================================

#[tauri::command]
pub async fn outlook_scan_events(
    domains: Vec<String>,
    contact_emails: Vec<String>,
    since: Option<String>,
) -> CmdResult<Vec<super::types::EventScanCandidate>> {
    let db = EmailDb::open()?;
    db.scan_events_for_entity(&domains, &contact_emails, since.as_deref())
}

// ============================================================================
// Email scan (matches local SQLite emails against CRM domains/contacts)
// ============================================================================

#[tauri::command]
pub async fn outlook_scan_emails(
    domains: Vec<String>,
    contact_emails: Vec<String>,
    since: Option<String>,
) -> CmdResult<Vec<super::types::EmailScanCandidate>> {
    let db = EmailDb::open()?;
    db.scan_emails_for_entity(&domains, &contact_emails, since.as_deref())
}

#[tauri::command]
pub async fn outlook_bootstrap_contacts(
    state: tauri::State<'_, AppState>,
    clients_folder: String,
    company_folder: String,
) -> CmdResult<usize> {
    let db = EmailDb::open()?;
    contacts::bootstrap_contacts(
        &db,
        &state.knowledge_path,
        &clients_folder,
        &company_folder,
    )
}

// ============================================================================
// User lookup
// ============================================================================

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MsUserLookup {
    pub microsoft_id: String,
    pub display_name: String,
    pub email: String,
}

#[tauri::command]
pub async fn outlook_lookup_user(email: String) -> CmdResult<MsUserLookup> {
    let graph = super::graph::GraphClient::new();
    let (id, display_name, mail) = graph.lookup_user_by_email(&email).await?;
    Ok(MsUserLookup {
        microsoft_id: id,
        display_name,
        email: mail,
    })
}
