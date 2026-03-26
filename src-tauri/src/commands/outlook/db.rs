// SQLite database for Outlook email metadata
// Storage: ~/.tv-desktop/outlook/emails.db (WAL mode)

use rusqlite::{params, Connection};
use std::path::PathBuf;
use std::sync::Mutex;

use super::types::{CalendarEvent, ContactRule, EmailEntry, EmailStats};
use crate::commands::error::{CmdResult, CommandError};

// ============================================================================
// Database connection
// ============================================================================

pub struct EmailDb {
    conn: Mutex<Connection>,
}

impl EmailDb {
    pub fn open() -> CmdResult<Self> {
        let path = get_db_path();
        let dir = path.parent().unwrap_or(&path);
        if !dir.exists() {
            std::fs::create_dir_all(dir)?;
        }

        let conn = Connection::open(&path)
            .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;

        // Enable WAL mode for better concurrent read/write
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;

        let db = Self {
            conn: Mutex::new(conn),
        };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> CmdResult<()> {
        let conn = self.conn.lock().map_err(|e| CommandError::Internal(format!("Lock error: {}", e)))?;
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS emails (
                id TEXT PRIMARY KEY,
                conversation_id TEXT,
                subject TEXT NOT NULL DEFAULT '',
                from_name TEXT NOT NULL DEFAULT '',
                from_email TEXT NOT NULL DEFAULT '',
                to_addresses TEXT NOT NULL DEFAULT '[]',
                cc_addresses TEXT NOT NULL DEFAULT '[]',
                received_at TEXT NOT NULL,
                folder_name TEXT NOT NULL DEFAULT 'Inbox',
                importance TEXT NOT NULL DEFAULT 'normal',
                is_read INTEGER NOT NULL DEFAULT 0,
                has_attachments INTEGER NOT NULL DEFAULT 0,
                body_preview TEXT NOT NULL DEFAULT '',
                body_path TEXT,

                category TEXT NOT NULL DEFAULT 'unknown',
                priority_score INTEGER NOT NULL DEFAULT 50,
                priority_level TEXT NOT NULL DEFAULT 'medium',
                ai_summary TEXT,
                action_required INTEGER NOT NULL DEFAULT 0,

                status TEXT NOT NULL DEFAULT 'inbox',
                linked_company_id TEXT,
                linked_company_name TEXT,

                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_emails_received ON emails(received_at DESC);
            CREATE INDEX IF NOT EXISTS idx_emails_category ON emails(category);
            CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status);
            CREATE INDEX IF NOT EXISTS idx_emails_folder ON emails(folder_name);
            CREATE INDEX IF NOT EXISTS idx_emails_is_read ON emails(is_read);
            CREATE INDEX IF NOT EXISTS idx_emails_from_email ON emails(from_email);

            CREATE TABLE IF NOT EXISTS sync_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                match_type TEXT NOT NULL,
                match_value TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_name TEXT NOT NULL,
                entity_path TEXT,
                UNIQUE(match_type, match_value)
            );

            CREATE TABLE IF NOT EXISTS folder_map (
                folder_id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                subject TEXT NOT NULL DEFAULT '',
                body_preview TEXT NOT NULL DEFAULT '',
                start_at TEXT NOT NULL,
                start_timezone TEXT NOT NULL DEFAULT '',
                end_at TEXT NOT NULL,
                end_timezone TEXT NOT NULL DEFAULT '',
                is_all_day INTEGER NOT NULL DEFAULT 0,
                location TEXT NOT NULL DEFAULT '',
                organizer_name TEXT NOT NULL DEFAULT '',
                organizer_email TEXT NOT NULL DEFAULT '',
                attendees TEXT NOT NULL DEFAULT '[]',
                is_online_meeting INTEGER NOT NULL DEFAULT 0,
                online_meeting_url TEXT,
                show_as TEXT NOT NULL DEFAULT 'busy',
                importance TEXT NOT NULL DEFAULT 'normal',
                is_cancelled INTEGER NOT NULL DEFAULT 0,
                web_link TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT '',
                last_modified_at TEXT NOT NULL DEFAULT '',
                categories TEXT NOT NULL DEFAULT '[]',
                synced_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_at);
            CREATE INDEX IF NOT EXISTS idx_events_end ON events(end_at);
            ",
        )
        .map_err(|e| CommandError::Internal(format!("DB: {}", e)))
    }

    // ========================================================================
    // Email CRUD
    // ========================================================================

    pub fn upsert_email(&self, email: &EmailEntry) -> CmdResult<()> {
        let conn = self.conn.lock().map_err(|e| CommandError::Internal(format!("Lock error: {}", e)))?;
        conn.execute(
            "INSERT INTO emails (
                id, conversation_id, subject, from_name, from_email,
                to_addresses, cc_addresses, received_at, folder_name, importance,
                is_read, has_attachments, body_preview, body_path,
                category, priority_score, priority_level, ai_summary, action_required,
                status, linked_company_id, linked_company_name, updated_at
            ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
                subject=excluded.subject, from_name=excluded.from_name, from_email=excluded.from_email,
                to_addresses=excluded.to_addresses, cc_addresses=excluded.cc_addresses,
                received_at=excluded.received_at, folder_name=excluded.folder_name,
                importance=excluded.importance, is_read=excluded.is_read,
                has_attachments=excluded.has_attachments, body_preview=excluded.body_preview,
                body_path=COALESCE(excluded.body_path, emails.body_path),
                category=excluded.category, priority_score=excluded.priority_score,
                priority_level=excluded.priority_level,
                ai_summary=COALESCE(excluded.ai_summary, emails.ai_summary),
                action_required=excluded.action_required,
                status=emails.status,
                linked_company_id=COALESCE(emails.linked_company_id, excluded.linked_company_id),
                linked_company_name=COALESCE(emails.linked_company_name, excluded.linked_company_name),
                updated_at=datetime('now')",
            params![
                email.id,
                email.conversation_id,
                email.subject,
                email.from_name,
                email.from_email,
                serde_json::to_string(&email.to_addresses).unwrap_or_default(),
                serde_json::to_string(&email.cc_addresses).unwrap_or_default(),
                email.received_at,
                email.folder_name,
                email.importance,
                email.is_read as i32,
                email.has_attachments as i32,
                email.body_preview,
                email.body_path,
                email.category,
                email.priority_score,
                email.priority_level,
                email.ai_summary,
                email.action_required as i32,
                email.status,
                email.linked_company_id,
                email.linked_company_name,
            ],
        )
        .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn delete_email(&self, id: &str) -> CmdResult<()> {
        let conn = self.conn.lock().map_err(|e| CommandError::Internal(format!("Lock error: {}", e)))?;
        conn.execute("DELETE FROM emails WHERE id = ?1", params![id])
            .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;
        Ok(())
    }

    pub fn get_email(&self, id: &str) -> CmdResult<Option<EmailEntry>> {
        let conn = self.conn.lock().map_err(|e| CommandError::Internal(format!("Lock error: {}", e)))?;
        let mut stmt = conn
            .prepare("SELECT * FROM emails WHERE id = ?1")
            .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;

        let result = stmt
            .query_row(params![id], |row| Ok(row_to_email(row)))
            .optional()
            .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;

        match result {
            Some(Ok(email)) => Ok(Some(email)),
            Some(Err(e)) => Err(e),
            None => Ok(None),
        }
    }

    pub fn list_emails(
        &self,
        folder: Option<&str>,
        category: Option<&str>,
        status: Option<&str>,
        search: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> CmdResult<Vec<EmailEntry>> {
        let conn = self.conn.lock().map_err(|e| CommandError::Internal(format!("Lock error: {}", e)))?;

        let mut sql = String::from("SELECT * FROM emails WHERE 1=1");
        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        let mut param_idx = 1;

        if let Some(f) = folder {
            sql.push_str(&format!(" AND folder_name = ?{}", param_idx));
            param_values.push(Box::new(f.to_string()));
            param_idx += 1;
        }
        if let Some(c) = category {
            sql.push_str(&format!(" AND category = ?{}", param_idx));
            param_values.push(Box::new(c.to_string()));
            param_idx += 1;
        }
        if let Some(s) = status {
            sql.push_str(&format!(" AND status = ?{}", param_idx));
            param_values.push(Box::new(s.to_string()));
            param_idx += 1;
        }
        if let Some(q) = search {
            let pattern = format!("%{}%", q);
            sql.push_str(&format!(
                " AND (subject LIKE ?{p} OR from_name LIKE ?{p} OR from_email LIKE ?{p} OR body_preview LIKE ?{p})",
                p = param_idx
            ));
            param_values.push(Box::new(pattern));
            param_idx += 1;
        }

        sql.push_str(&format!(
            " ORDER BY received_at DESC LIMIT ?{} OFFSET ?{}",
            param_idx,
            param_idx + 1
        ));
        param_values.push(Box::new(limit));
        param_values.push(Box::new(offset));

        let params_ref: Vec<&dyn rusqlite::types::ToSql> =
            param_values.iter().map(|p| p.as_ref()).collect();

        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;

        let rows = stmt
            .query_map(params_ref.as_slice(), |row| Ok(row_to_email(row)))
            .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;

        let mut emails = Vec::new();
        for row in rows {
            match row {
                Ok(Ok(email)) => emails.push(email),
                Ok(Err(e)) => return Err(e),
                Err(e) => return Err(CommandError::Internal(format!("DB: {}", e))),
            }
        }
        Ok(emails)
    }

    #[allow(dead_code)]
    pub fn email_exists(&self, id: &str) -> CmdResult<bool> {
        let conn = self.conn.lock().map_err(|e| CommandError::Internal(format!("Lock error: {}", e)))?;
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM emails WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;
        Ok(count > 0)
    }

    pub fn mark_read(&self, id: &str) -> CmdResult<()> {
        let conn = self.conn.lock().map_err(|e| CommandError::Internal(format!("Lock error: {}", e)))?;
        conn.execute(
            "UPDATE emails SET is_read = 1, status = CASE WHEN status = 'inbox' THEN 'read' ELSE status END, updated_at = datetime('now') WHERE id = ?1",
            params![id],
        )
        .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;
        Ok(())
    }

    pub fn archive_email(&self, id: &str) -> CmdResult<()> {
        let conn = self.conn.lock().map_err(|e| CommandError::Internal(format!("Lock error: {}", e)))?;
        conn.execute(
            "UPDATE emails SET status = 'archived', is_read = 1, updated_at = datetime('now') WHERE id = ?1",
            params![id],
        )
        .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;
        Ok(())
    }

    pub fn set_body_path(&self, id: &str, body_path: &str) -> CmdResult<()> {
        let conn = self.conn.lock().map_err(|e| CommandError::Internal(format!("Lock error: {}", e)))?;
        conn.execute(
            "UPDATE emails SET body_path = ?2, updated_at = datetime('now') WHERE id = ?1",
            params![id, body_path],
        )
        .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn set_ai_summary(&self, id: &str, summary: &str) -> CmdResult<()> {
        let conn = self.conn.lock().map_err(|e| CommandError::Internal(format!("Lock error: {}", e)))?;
        conn.execute(
            "UPDATE emails SET ai_summary = ?2, updated_at = datetime('now') WHERE id = ?1",
            params![id, summary],
        )
        .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;
        Ok(())
    }

    // ========================================================================
    // Stats
    // ========================================================================

    pub fn get_stats(&self) -> CmdResult<EmailStats> {
        let conn = self.conn.lock().map_err(|e| CommandError::Internal(format!("Lock error: {}", e)))?;

        let total: i64 = conn
            .query_row("SELECT COUNT(*) FROM emails", [], |row| row.get(0))
            .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;

        let unread: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM emails WHERE is_read = 0",
                [],
                |row| row.get(0),
            )
            .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;

        let inbox: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM emails WHERE status = 'inbox'",
                [],
                |row| row.get(0),
            )
            .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;

        let archived: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM emails WHERE status = 'archived'",
                [],
                |row| row.get(0),
            )
            .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;

        let action_required: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM emails WHERE action_required = 1",
                [],
                |row| row.get(0),
            )
            .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;

        let mut by_category = std::collections::HashMap::new();
        let mut stmt = conn
            .prepare("SELECT category, COUNT(*) FROM emails GROUP BY category")
            .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;

        let rows = stmt
            .query_map([], |row| {
                let cat: String = row.get(0)?;
                let count: i64 = row.get(1)?;
                Ok((cat, count))
            })
            .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;

        for row in rows {
            if let Ok((cat, count)) = row {
                by_category.insert(cat, count);
            }
        }

        Ok(EmailStats {
            total,
            unread,
            inbox,
            archived,
            action_required,
            by_category,
        })
    }

    // ========================================================================
    // Sync state
    // ========================================================================

    pub fn get_sync_state(&self, key: &str) -> CmdResult<Option<String>> {
        let conn = self.conn.lock().map_err(|e| CommandError::Internal(format!("Lock error: {}", e)))?;
        let result = conn
            .query_row(
                "SELECT value FROM sync_state WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;
        Ok(result)
    }

    pub fn set_sync_state(&self, key: &str, value: &str) -> CmdResult<()> {
        let conn = self.conn.lock().map_err(|e| CommandError::Internal(format!("Lock error: {}", e)))?;
        conn.execute(
            "INSERT INTO sync_state (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
            params![key, value],
        )
        .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;
        Ok(())
    }

    // ========================================================================
    // Contacts
    // ========================================================================

    pub fn upsert_contact(&self, rule: &ContactRule) -> CmdResult<()> {
        let conn = self.conn.lock().map_err(|e| CommandError::Internal(format!("Lock error: {}", e)))?;
        conn.execute(
            "INSERT INTO contacts (match_type, match_value, entity_type, entity_name, entity_path)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(match_type, match_value) DO UPDATE SET
                entity_type = excluded.entity_type,
                entity_name = excluded.entity_name,
                entity_path = excluded.entity_path",
            params![
                rule.match_type,
                rule.match_value,
                rule.entity_type,
                rule.entity_name,
                rule.entity_path,
            ],
        )
        .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn get_contacts(&self) -> CmdResult<Vec<ContactRule>> {
        let conn = self.conn.lock().map_err(|e| CommandError::Internal(format!("Lock error: {}", e)))?;
        let mut stmt = conn
            .prepare("SELECT match_type, match_value, entity_type, entity_name, entity_path FROM contacts")
            .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;

        let rows = stmt
            .query_map([], |row| {
                Ok(ContactRule {
                    match_type: row.get(0)?,
                    match_value: row.get(1)?,
                    entity_type: row.get(2)?,
                    entity_name: row.get(3)?,
                    entity_path: row.get(4)?,
                })
            })
            .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;

        let mut contacts = Vec::new();
        for row in rows {
            contacts.push(row.map_err(|e| CommandError::Internal(format!("DB: {}", e)))?);
        }
        Ok(contacts)
    }

    pub fn find_contact_by_email(&self, email: &str) -> CmdResult<Option<ContactRule>> {
        let conn = self.conn.lock().map_err(|e| CommandError::Internal(format!("Lock error: {}", e)))?;
        let result = conn
            .query_row(
                "SELECT match_type, match_value, entity_type, entity_name, entity_path
                 FROM contacts WHERE match_type = 'email' AND match_value = ?1",
                params![email],
                |row| {
                    Ok(ContactRule {
                        match_type: row.get(0)?,
                        match_value: row.get(1)?,
                        entity_type: row.get(2)?,
                        entity_name: row.get(3)?,
                        entity_path: row.get(4)?,
                    })
                },
            )
            .optional()
            .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;
        Ok(result)
    }

    pub fn find_contact_by_domain(&self, domain: &str) -> CmdResult<Option<ContactRule>> {
        let conn = self.conn.lock().map_err(|e| CommandError::Internal(format!("Lock error: {}", e)))?;
        let result = conn
            .query_row(
                "SELECT match_type, match_value, entity_type, entity_name, entity_path
                 FROM contacts WHERE match_type = 'domain' AND match_value = ?1",
                params![domain],
                |row| {
                    Ok(ContactRule {
                        match_type: row.get(0)?,
                        match_value: row.get(1)?,
                        entity_type: row.get(2)?,
                        entity_name: row.get(3)?,
                        entity_path: row.get(4)?,
                    })
                },
            )
            .optional()
            .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;
        Ok(result)
    }

    pub fn is_noise_domain(&self, domain: &str) -> CmdResult<bool> {
        let conn = self.conn.lock().map_err(|e| CommandError::Internal(format!("Lock error: {}", e)))?;
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM contacts WHERE match_type = 'noise_domain' AND ?1 LIKE '%' || match_value || '%'",
                params![domain],
                |row| row.get(0),
            )
            .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;
        Ok(count > 0)
    }

    // ========================================================================
    // Folder map
    // ========================================================================

    pub fn upsert_folder(&self, folder_id: &str, display_name: &str) -> CmdResult<()> {
        let conn = self.conn.lock().map_err(|e| CommandError::Internal(format!("Lock error: {}", e)))?;
        conn.execute(
            "INSERT INTO folder_map (folder_id, display_name) VALUES (?1, ?2)
             ON CONFLICT(folder_id) DO UPDATE SET display_name = excluded.display_name",
            params![folder_id, display_name],
        )
        .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;
        Ok(())
    }

    pub fn get_folder_name(&self, folder_id: &str) -> CmdResult<String> {
        let conn = self.conn.lock().map_err(|e| CommandError::Internal(format!("Lock error: {}", e)))?;
        let result: Option<String> = conn
            .query_row(
                "SELECT display_name FROM folder_map WHERE folder_id = ?1",
                params![folder_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;
        Ok(result.unwrap_or_else(|| "Unknown".to_string()))
    }

    pub fn get_email_count(&self) -> CmdResult<i64> {
        let conn = self.conn.lock().map_err(|e| CommandError::Internal(format!("Lock error: {}", e)))?;
        conn.query_row("SELECT COUNT(*) FROM emails", [], |row| row.get(0))
            .map_err(|e| CommandError::Internal(format!("DB: {}", e)))
    }

    // ========================================================================
    // Calendar events
    // ========================================================================

    pub fn upsert_event(&self, event: &CalendarEvent) -> CmdResult<()> {
        let conn = self.conn.lock().map_err(|e| CommandError::Internal(format!("Lock error: {}", e)))?;
        conn.execute(
            "INSERT INTO events (
                id, subject, body_preview, start_at, start_timezone, end_at, end_timezone,
                is_all_day, location, organizer_name, organizer_email, attendees,
                is_online_meeting, online_meeting_url, show_as, importance, is_cancelled,
                web_link, created_at, last_modified_at, categories, synced_at
            ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
                subject=excluded.subject, body_preview=excluded.body_preview,
                start_at=excluded.start_at, start_timezone=excluded.start_timezone,
                end_at=excluded.end_at, end_timezone=excluded.end_timezone,
                is_all_day=excluded.is_all_day, location=excluded.location,
                organizer_name=excluded.organizer_name, organizer_email=excluded.organizer_email,
                attendees=excluded.attendees, is_online_meeting=excluded.is_online_meeting,
                online_meeting_url=excluded.online_meeting_url, show_as=excluded.show_as,
                importance=excluded.importance, is_cancelled=excluded.is_cancelled,
                web_link=excluded.web_link, created_at=excluded.created_at,
                last_modified_at=excluded.last_modified_at, categories=excluded.categories,
                synced_at=datetime('now')",
            params![
                event.id,
                event.subject,
                event.body_preview,
                event.start_at,
                event.start_timezone,
                event.end_at,
                event.end_timezone,
                event.is_all_day as i32,
                event.location,
                event.organizer_name,
                event.organizer_email,
                serde_json::to_string(&event.attendees).unwrap_or_default(),
                event.is_online_meeting as i32,
                event.online_meeting_url,
                event.show_as,
                event.importance,
                event.is_cancelled as i32,
                event.web_link,
                event.created_at,
                event.last_modified_at,
                serde_json::to_string(&event.categories).unwrap_or_default(),
            ],
        )
        .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;
        Ok(())
    }

    pub fn list_events(&self, start_after: &str, end_before: &str, limit: i64) -> CmdResult<Vec<CalendarEvent>> {
        let conn = self.conn.lock().map_err(|e| CommandError::Internal(format!("Lock error: {}", e)))?;
        let mut stmt = conn
            .prepare(
                "SELECT id, subject, body_preview, start_at, start_timezone, end_at, end_timezone,
                        is_all_day, location, organizer_name, organizer_email, attendees,
                        is_online_meeting, online_meeting_url, show_as, importance, is_cancelled,
                        web_link, created_at, last_modified_at, categories
                 FROM events
                 WHERE start_at >= ?1 AND end_at <= ?2
                 ORDER BY start_at ASC
                 LIMIT ?3",
            )
            .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;

        let rows = stmt
            .query_map(params![start_after, end_before, limit], |row| Ok(row_to_event(row)))
            .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;

        let mut events = Vec::new();
        for row in rows {
            match row {
                Ok(Ok(event)) => events.push(event),
                Ok(Err(e)) => return Err(e),
                Err(e) => return Err(CommandError::Internal(format!("DB: {}", e))),
            }
        }
        Ok(events)
    }

    pub fn get_event_count(&self) -> CmdResult<i64> {
        let conn = self.conn.lock().map_err(|e| CommandError::Internal(format!("Lock error: {}", e)))?;
        conn.query_row("SELECT COUNT(*) FROM events", [], |row| row.get(0))
            .map_err(|e| CommandError::Internal(format!("DB: {}", e)))
    }

    /// Scan calendar events matching attendee emails or organizer domains
    pub fn scan_events_for_entity(
        &self,
        domains: &[String],
        contact_emails: &[String],
        since: Option<&str>,
    ) -> CmdResult<Vec<super::types::EventScanCandidate>> {
        let conn = self.conn.lock().map_err(|e| CommandError::Internal(format!("Lock error: {}", e)))?;

        let mut candidates: Vec<super::types::EventScanCandidate> = Vec::new();
        let mut seen_ids: std::collections::HashSet<String> = std::collections::HashSet::new();

        // 1. Match by contact emails (organizer or attendees JSON)
        for email in contact_emails {
            let email_lower = email.to_lowercase();
            let like_pattern = format!("%{}%", email_lower);

            let (sql, params_vec): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = if let Some(s) = since {
                (
                    "SELECT id, subject, start_at, end_at, organizer_name, organizer_email, location, attendees
                     FROM events
                     WHERE (LOWER(organizer_email) = ?1 OR LOWER(attendees) LIKE ?2) AND start_at >= ?3
                     ORDER BY start_at DESC".to_string(),
                    vec![Box::new(email_lower), Box::new(like_pattern), Box::new(s.to_string())],
                )
            } else {
                (
                    "SELECT id, subject, start_at, end_at, organizer_name, organizer_email, location, attendees
                     FROM events
                     WHERE (LOWER(organizer_email) = ?1 OR LOWER(attendees) LIKE ?2)
                     ORDER BY start_at DESC".to_string(),
                    vec![Box::new(email_lower), Box::new(like_pattern)],
                )
            };

            let mut stmt = conn.prepare(&sql)
                .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;
            let params_ref: Vec<&dyn rusqlite::types::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

            let rows = stmt.query_map(params_ref.as_slice(), |row| {
                Ok(super::types::EventScanCandidate {
                    event_id: row.get(0)?,
                    subject: row.get(1)?,
                    start_at: row.get(2)?,
                    end_at: row.get(3)?,
                    organizer_name: row.get(4)?,
                    organizer_email: row.get(5)?,
                    location: row.get(6)?,
                    match_method: "auto_contact".to_string(),
                    relevance_score: 0.9,
                })
            }).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;

            for row in rows {
                if let Ok(c) = row {
                    if seen_ids.insert(c.event_id.clone()) {
                        candidates.push(c);
                    }
                }
            }
        }

        // 2. Match by domain (organizer_email domain or attendees domain)
        for domain in domains {
            let domain_lower = domain.to_lowercase();
            let org_pattern = format!("%@{}", domain_lower);
            let att_pattern = format!("%@{}%", domain_lower);

            let (sql, params_vec): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = if let Some(s) = since {
                (
                    "SELECT id, subject, start_at, end_at, organizer_name, organizer_email, location, attendees
                     FROM events
                     WHERE (LOWER(organizer_email) LIKE ?1 OR LOWER(attendees) LIKE ?2) AND start_at >= ?3
                     ORDER BY start_at DESC".to_string(),
                    vec![Box::new(org_pattern), Box::new(att_pattern), Box::new(s.to_string())],
                )
            } else {
                (
                    "SELECT id, subject, start_at, end_at, organizer_name, organizer_email, location, attendees
                     FROM events
                     WHERE (LOWER(organizer_email) LIKE ?1 OR LOWER(attendees) LIKE ?2)
                     ORDER BY start_at DESC".to_string(),
                    vec![Box::new(org_pattern), Box::new(att_pattern)],
                )
            };

            let mut stmt = conn.prepare(&sql)
                .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;
            let params_ref: Vec<&dyn rusqlite::types::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

            let rows = stmt.query_map(params_ref.as_slice(), |row| {
                Ok(super::types::EventScanCandidate {
                    event_id: row.get(0)?,
                    subject: row.get(1)?,
                    start_at: row.get(2)?,
                    end_at: row.get(3)?,
                    organizer_name: row.get(4)?,
                    organizer_email: row.get(5)?,
                    location: row.get(6)?,
                    match_method: "auto_domain".to_string(),
                    relevance_score: 0.6,
                })
            }).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;

            for row in rows {
                if let Ok(c) = row {
                    if seen_ids.insert(c.event_id.clone()) {
                        candidates.push(c);
                    }
                }
            }
        }

        // Sort by relevance then date
        candidates.sort_by(|a, b| {
            b.relevance_score.partial_cmp(&a.relevance_score)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| b.start_at.cmp(&a.start_at))
        });

        Ok(candidates)
    }

    pub fn delete_events_in_range(&self, start_after: &str, end_before: &str) -> CmdResult<()> {
        let conn = self.conn.lock().map_err(|e| CommandError::Internal(format!("Lock error: {}", e)))?;
        conn.execute(
            "DELETE FROM events WHERE start_at >= ?1 AND end_at <= ?2",
            params![start_after, end_before],
        )
        .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;
        Ok(())
    }

    /// Scan emails matching company domains or contact emails
    pub fn scan_emails_for_entity(
        &self,
        domains: &[String],
        contact_emails: &[String],
        since: Option<&str>,
    ) -> CmdResult<Vec<super::types::EmailScanCandidate>> {
        let conn = self.conn.lock().map_err(|e| CommandError::Internal(format!("Lock error: {}", e)))?;

        let mut candidates: Vec<super::types::EmailScanCandidate> = Vec::new();
        let mut seen_ids: std::collections::HashSet<String> = std::collections::HashSet::new();

        // 1. Match by contact emails (from or to)
        for email in contact_emails {
            let email_lower = email.to_lowercase();
            let like_pattern = format!("%{}%", email_lower);

            let (sql, params_vec): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = if let Some(s) = since {
                (
                    "SELECT id, subject, from_email, from_name, received_at, folder_name
                     FROM emails
                     WHERE (LOWER(from_email) = ?1 OR LOWER(to_addresses) LIKE ?2) AND received_at >= ?3
                     ORDER BY received_at DESC".to_string(),
                    vec![Box::new(email_lower), Box::new(like_pattern), Box::new(s.to_string())],
                )
            } else {
                (
                    "SELECT id, subject, from_email, from_name, received_at, folder_name
                     FROM emails
                     WHERE (LOWER(from_email) = ?1 OR LOWER(to_addresses) LIKE ?2)
                     ORDER BY received_at DESC".to_string(),
                    vec![Box::new(email_lower), Box::new(like_pattern)],
                )
            };

            let mut stmt = conn.prepare(&sql)
                .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;
            let params_ref: Vec<&dyn rusqlite::types::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

            let rows = stmt.query_map(params_ref.as_slice(), |row| {
                Ok(super::types::EmailScanCandidate {
                    email_id: row.get(0)?,
                    subject: row.get(1)?,
                    from_email: row.get(2)?,
                    from_name: row.get(3)?,
                    received_at: row.get(4)?,
                    folder_name: row.get(5)?,
                    match_method: "auto_contact".to_string(),
                    relevance_score: 0.9,
                })
            }).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;

            for row in rows {
                if let Ok(c) = row {
                    if seen_ids.insert(c.email_id.clone()) {
                        candidates.push(c);
                    }
                }
            }
        }

        // 2. Match by domain (from_email domain or to_addresses domain)
        for domain in domains {
            let domain_lower = domain.to_lowercase();
            let from_pattern = format!("%@{}", domain_lower);
            let to_pattern = format!("%@{}%", domain_lower);

            let (sql, params_vec): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = if let Some(s) = since {
                (
                    "SELECT id, subject, from_email, from_name, received_at, folder_name
                     FROM emails
                     WHERE (LOWER(from_email) LIKE ?1 OR LOWER(to_addresses) LIKE ?2) AND received_at >= ?3
                     ORDER BY received_at DESC".to_string(),
                    vec![Box::new(from_pattern), Box::new(to_pattern), Box::new(s.to_string())],
                )
            } else {
                (
                    "SELECT id, subject, from_email, from_name, received_at, folder_name
                     FROM emails
                     WHERE (LOWER(from_email) LIKE ?1 OR LOWER(to_addresses) LIKE ?2)
                     ORDER BY received_at DESC".to_string(),
                    vec![Box::new(from_pattern), Box::new(to_pattern)],
                )
            };

            let mut stmt = conn.prepare(&sql)
                .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;
            let params_ref: Vec<&dyn rusqlite::types::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

            let rows = stmt.query_map(params_ref.as_slice(), |row| {
                Ok(super::types::EmailScanCandidate {
                    email_id: row.get(0)?,
                    subject: row.get(1)?,
                    from_email: row.get(2)?,
                    from_name: row.get(3)?,
                    received_at: row.get(4)?,
                    folder_name: row.get(5)?,
                    match_method: "auto_domain".to_string(),
                    relevance_score: 0.6,
                })
            }).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;

            for row in rows {
                if let Ok(c) = row {
                    if seen_ids.insert(c.email_id.clone()) {
                        candidates.push(c);
                    }
                }
            }
        }

        // Sort by relevance then date
        candidates.sort_by(|a, b| {
            b.relevance_score.partial_cmp(&a.relevance_score)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| b.received_at.cmp(&a.received_at))
        });

        Ok(candidates)
    }
}

// ============================================================================
// Helpers
// ============================================================================

fn get_db_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".tv-desktop")
        .join("outlook")
        .join("emails.db")
}

fn row_to_email(row: &rusqlite::Row) -> CmdResult<EmailEntry> {
    let to_json: String = row
        .get::<_, String>(5)
        .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;
    let cc_json: String = row
        .get::<_, String>(6)
        .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;

    Ok(EmailEntry {
        id: row.get(0).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        conversation_id: row.get(1).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        subject: row.get(2).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        from_name: row.get(3).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        from_email: row.get(4).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        to_addresses: serde_json::from_str(&to_json).unwrap_or_default(),
        cc_addresses: serde_json::from_str(&cc_json).unwrap_or_default(),
        received_at: row.get(7).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        folder_name: row.get(8).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        importance: row.get(9).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        is_read: row
            .get::<_, i32>(10)
            .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?
            != 0,
        has_attachments: row
            .get::<_, i32>(11)
            .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?
            != 0,
        body_preview: row.get(12).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        body_path: row.get(13).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        category: row.get(14).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        priority_score: row.get(15).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        priority_level: row.get(16).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        ai_summary: row.get(17).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        action_required: row
            .get::<_, i32>(18)
            .map_err(|e| CommandError::Internal(format!("DB: {}", e)))?
            != 0,
        status: row.get(19).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        linked_company_id: row.get(20).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        linked_company_name: row.get(21).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
    })
}

fn row_to_event(row: &rusqlite::Row) -> CmdResult<CalendarEvent> {
    let attendees_json: String = row.get(11).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;
    let categories_json: String = row.get(20).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?;

    Ok(CalendarEvent {
        id: row.get(0).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        subject: row.get(1).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        body_preview: row.get(2).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        start_at: row.get(3).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        start_timezone: row.get(4).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        end_at: row.get(5).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        end_timezone: row.get(6).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        is_all_day: row.get::<_, i32>(7).map_err(|e| CommandError::Internal(format!("DB: {}", e)))? != 0,
        location: row.get(8).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        organizer_name: row.get(9).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        organizer_email: row.get(10).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        attendees: serde_json::from_str(&attendees_json).unwrap_or_default(),
        is_online_meeting: row.get::<_, i32>(12).map_err(|e| CommandError::Internal(format!("DB: {}", e)))? != 0,
        online_meeting_url: row.get(13).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        show_as: row.get(14).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        importance: row.get(15).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        is_cancelled: row.get::<_, i32>(16).map_err(|e| CommandError::Internal(format!("DB: {}", e)))? != 0,
        web_link: row.get(17).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        created_at: row.get(18).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        last_modified_at: row.get(19).map_err(|e| CommandError::Internal(format!("DB: {}", e)))?,
        categories: serde_json::from_str(&categories_json).unwrap_or_default(),
    })
}

// Re-export for use in optional() calls
use rusqlite::OptionalExtension;
