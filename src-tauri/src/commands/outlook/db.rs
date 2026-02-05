// SQLite database for Outlook email metadata
// Storage: ~/.tv-desktop/outlook/emails.db (WAL mode)

use rusqlite::{params, Connection};
use std::path::PathBuf;
use std::sync::Mutex;

use super::types::{ContactRule, EmailEntry, EmailStats};

// ============================================================================
// Database connection
// ============================================================================

pub struct EmailDb {
    conn: Mutex<Connection>,
}

impl EmailDb {
    pub fn open() -> Result<Self, String> {
        let path = get_db_path();
        let dir = path.parent().unwrap();
        if !dir.exists() {
            std::fs::create_dir_all(dir)
                .map_err(|e| format!("Failed to create outlook directory: {}", e))?;
        }

        let conn = Connection::open(&path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        // Enable WAL mode for better concurrent read/write
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .map_err(|e| format!("Failed to set pragmas: {}", e))?;

        let db = Self {
            conn: Mutex::new(conn),
        };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
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
            ",
        )
        .map_err(|e| format!("Migration failed: {}", e))
    }

    // ========================================================================
    // Email CRUD
    // ========================================================================

    pub fn upsert_email(&self, email: &EmailEntry) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
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
        .map_err(|e| format!("Failed to upsert email: {}", e))?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn delete_email(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        conn.execute("DELETE FROM emails WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to delete email: {}", e))?;
        Ok(())
    }

    pub fn get_email(&self, id: &str) -> Result<Option<EmailEntry>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        let mut stmt = conn
            .prepare("SELECT * FROM emails WHERE id = ?1")
            .map_err(|e| format!("Query error: {}", e))?;

        let result = stmt
            .query_row(params![id], |row| Ok(row_to_email(row)))
            .optional()
            .map_err(|e| format!("Query error: {}", e))?;

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
    ) -> Result<Vec<EmailEntry>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;

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
            .map_err(|e| format!("Query error: {}", e))?;

        let rows = stmt
            .query_map(params_ref.as_slice(), |row| Ok(row_to_email(row)))
            .map_err(|e| format!("Query error: {}", e))?;

        let mut emails = Vec::new();
        for row in rows {
            match row {
                Ok(Ok(email)) => emails.push(email),
                Ok(Err(e)) => return Err(e),
                Err(e) => return Err(format!("Row error: {}", e)),
            }
        }
        Ok(emails)
    }

    #[allow(dead_code)]
    pub fn email_exists(&self, id: &str) -> Result<bool, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM emails WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Query error: {}", e))?;
        Ok(count > 0)
    }

    pub fn mark_read(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        conn.execute(
            "UPDATE emails SET is_read = 1, status = CASE WHEN status = 'inbox' THEN 'read' ELSE status END, updated_at = datetime('now') WHERE id = ?1",
            params![id],
        )
        .map_err(|e| format!("Failed to mark read: {}", e))?;
        Ok(())
    }

    pub fn archive_email(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        conn.execute(
            "UPDATE emails SET status = 'archived', is_read = 1, updated_at = datetime('now') WHERE id = ?1",
            params![id],
        )
        .map_err(|e| format!("Failed to archive: {}", e))?;
        Ok(())
    }

    pub fn set_body_path(&self, id: &str, body_path: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        conn.execute(
            "UPDATE emails SET body_path = ?2, updated_at = datetime('now') WHERE id = ?1",
            params![id, body_path],
        )
        .map_err(|e| format!("Failed to set body path: {}", e))?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn set_ai_summary(&self, id: &str, summary: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        conn.execute(
            "UPDATE emails SET ai_summary = ?2, updated_at = datetime('now') WHERE id = ?1",
            params![id, summary],
        )
        .map_err(|e| format!("Failed to set summary: {}", e))?;
        Ok(())
    }

    // ========================================================================
    // Stats
    // ========================================================================

    pub fn get_stats(&self) -> Result<EmailStats, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;

        let total: i64 = conn
            .query_row("SELECT COUNT(*) FROM emails", [], |row| row.get(0))
            .map_err(|e| format!("Stats error: {}", e))?;

        let unread: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM emails WHERE is_read = 0",
                [],
                |row| row.get(0),
            )
            .map_err(|e| format!("Stats error: {}", e))?;

        let inbox: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM emails WHERE status = 'inbox'",
                [],
                |row| row.get(0),
            )
            .map_err(|e| format!("Stats error: {}", e))?;

        let archived: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM emails WHERE status = 'archived'",
                [],
                |row| row.get(0),
            )
            .map_err(|e| format!("Stats error: {}", e))?;

        let action_required: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM emails WHERE action_required = 1",
                [],
                |row| row.get(0),
            )
            .map_err(|e| format!("Stats error: {}", e))?;

        let mut by_category = std::collections::HashMap::new();
        let mut stmt = conn
            .prepare("SELECT category, COUNT(*) FROM emails GROUP BY category")
            .map_err(|e| format!("Stats error: {}", e))?;

        let rows = stmt
            .query_map([], |row| {
                let cat: String = row.get(0)?;
                let count: i64 = row.get(1)?;
                Ok((cat, count))
            })
            .map_err(|e| format!("Stats error: {}", e))?;

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

    pub fn get_sync_state(&self, key: &str) -> Result<Option<String>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        let result = conn
            .query_row(
                "SELECT value FROM sync_state WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| format!("Query error: {}", e))?;
        Ok(result)
    }

    pub fn set_sync_state(&self, key: &str, value: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        conn.execute(
            "INSERT INTO sync_state (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
            params![key, value],
        )
        .map_err(|e| format!("Failed to set sync state: {}", e))?;
        Ok(())
    }

    // ========================================================================
    // Contacts
    // ========================================================================

    pub fn upsert_contact(&self, rule: &ContactRule) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
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
        .map_err(|e| format!("Failed to upsert contact: {}", e))?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn get_contacts(&self) -> Result<Vec<ContactRule>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        let mut stmt = conn
            .prepare("SELECT match_type, match_value, entity_type, entity_name, entity_path FROM contacts")
            .map_err(|e| format!("Query error: {}", e))?;

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
            .map_err(|e| format!("Query error: {}", e))?;

        let mut contacts = Vec::new();
        for row in rows {
            contacts.push(row.map_err(|e| format!("Row error: {}", e))?);
        }
        Ok(contacts)
    }

    pub fn find_contact_by_email(&self, email: &str) -> Result<Option<ContactRule>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
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
            .map_err(|e| format!("Query error: {}", e))?;
        Ok(result)
    }

    pub fn find_contact_by_domain(&self, domain: &str) -> Result<Option<ContactRule>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
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
            .map_err(|e| format!("Query error: {}", e))?;
        Ok(result)
    }

    pub fn is_noise_domain(&self, domain: &str) -> Result<bool, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM contacts WHERE match_type = 'noise_domain' AND ?1 LIKE '%' || match_value || '%'",
                params![domain],
                |row| row.get(0),
            )
            .map_err(|e| format!("Query error: {}", e))?;
        Ok(count > 0)
    }

    // ========================================================================
    // Folder map
    // ========================================================================

    pub fn upsert_folder(&self, folder_id: &str, display_name: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        conn.execute(
            "INSERT INTO folder_map (folder_id, display_name) VALUES (?1, ?2)
             ON CONFLICT(folder_id) DO UPDATE SET display_name = excluded.display_name",
            params![folder_id, display_name],
        )
        .map_err(|e| format!("Failed to upsert folder: {}", e))?;
        Ok(())
    }

    pub fn get_folder_name(&self, folder_id: &str) -> Result<String, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        let result: Option<String> = conn
            .query_row(
                "SELECT display_name FROM folder_map WHERE folder_id = ?1",
                params![folder_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| format!("Query error: {}", e))?;
        Ok(result.unwrap_or_else(|| "Unknown".to_string()))
    }

    pub fn get_email_count(&self) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        conn.query_row("SELECT COUNT(*) FROM emails", [], |row| row.get(0))
            .map_err(|e| format!("Count error: {}", e))
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

fn row_to_email(row: &rusqlite::Row) -> Result<EmailEntry, String> {
    let to_json: String = row
        .get::<_, String>(5)
        .map_err(|e| format!("Row parse error: {}", e))?;
    let cc_json: String = row
        .get::<_, String>(6)
        .map_err(|e| format!("Row parse error: {}", e))?;

    Ok(EmailEntry {
        id: row.get(0).map_err(|e| format!("Row parse error: {}", e))?,
        conversation_id: row.get(1).map_err(|e| format!("Row parse error: {}", e))?,
        subject: row.get(2).map_err(|e| format!("Row parse error: {}", e))?,
        from_name: row.get(3).map_err(|e| format!("Row parse error: {}", e))?,
        from_email: row.get(4).map_err(|e| format!("Row parse error: {}", e))?,
        to_addresses: serde_json::from_str(&to_json).unwrap_or_default(),
        cc_addresses: serde_json::from_str(&cc_json).unwrap_or_default(),
        received_at: row.get(7).map_err(|e| format!("Row parse error: {}", e))?,
        folder_name: row.get(8).map_err(|e| format!("Row parse error: {}", e))?,
        importance: row.get(9).map_err(|e| format!("Row parse error: {}", e))?,
        is_read: row
            .get::<_, i32>(10)
            .map_err(|e| format!("Row parse error: {}", e))?
            != 0,
        has_attachments: row
            .get::<_, i32>(11)
            .map_err(|e| format!("Row parse error: {}", e))?
            != 0,
        body_preview: row.get(12).map_err(|e| format!("Row parse error: {}", e))?,
        body_path: row.get(13).map_err(|e| format!("Row parse error: {}", e))?,
        category: row.get(14).map_err(|e| format!("Row parse error: {}", e))?,
        priority_score: row.get(15).map_err(|e| format!("Row parse error: {}", e))?,
        priority_level: row.get(16).map_err(|e| format!("Row parse error: {}", e))?,
        ai_summary: row.get(17).map_err(|e| format!("Row parse error: {}", e))?,
        action_required: row
            .get::<_, i32>(18)
            .map_err(|e| format!("Row parse error: {}", e))?
            != 0,
        status: row.get(19).map_err(|e| format!("Row parse error: {}", e))?,
        linked_company_id: row.get(20).map_err(|e| format!("Row parse error: {}", e))?,
        linked_company_name: row.get(21).map_err(|e| format!("Row parse error: {}", e))?,
    })
}

// Re-export for use in optional() calls
use rusqlite::OptionalExtension;
