// VAL Domain Recency Data Collection
// Queries pg_stat_user_tables via VAL SQL API to get table-level activity data.
// Outputs recency.json with row counts, write activity, and last analysis timestamps.

use crate::commands::error::{CmdResult, CommandError};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::time::Instant;
use tauri::command;

use super::config::get_domain_config;
use super::sync::write_json;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecencyResult {
    pub domain: String,
    pub table_count: usize,
    pub duration_ms: u64,
    pub status: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableRecency {
    pub table_name: String,
    pub row_count: i64,
    pub dead_tuples: i64,
    pub total_inserts: i64,
    pub total_updates: i64,
    pub total_deletes: i64,
    pub last_autoanalyze: Option<String>,
    pub last_autovacuum: Option<String>,
    /// Derived: "active", "stale", "empty", "dead"
    pub activity_status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecencyReport {
    pub computed_at: String,
    pub domain: String,
    pub tables: HashMap<String, TableRecency>,
    pub summary: RecencySummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecencySummary {
    pub total_tables: usize,
    pub active_tables: usize,
    pub stale_tables: usize,
    pub empty_tables: usize,
    pub dead_tables: usize,
    pub total_live_rows: i64,
}

// ============================================================================
// Internal
// ============================================================================

const PG_STAT_SQL: &str = r#"
SELECT
    relname,
    n_live_tup,
    n_dead_tup,
    n_tup_ins,
    n_tup_upd,
    n_tup_del,
    last_autoanalyze,
    last_autovacuum
FROM pg_stat_user_tables
WHERE relname LIKE 'custom_tbl_%'
ORDER BY n_live_tup DESC
"#;

/// Classify table activity based on pg_stat data
fn classify_activity(
    row_count: i64,
    total_inserts: i64,
    total_updates: i64,
    last_autoanalyze: &Option<String>,
) -> String {
    if row_count == 0 && total_inserts == 0 {
        return "empty".to_string();
    }

    if row_count == 0 && total_inserts > 0 {
        // Had data but now empty — probably cleared
        return "dead".to_string();
    }

    // Check if autoanalyze has happened (proxy for recent writes)
    match last_autoanalyze {
        None => {
            // Never auto-analyzed = very small table with minimal activity
            if total_inserts + total_updates < 100 {
                "stale".to_string()
            } else {
                "active".to_string()
            }
        }
        Some(ts) => {
            // Parse timestamp and check recency
            if let Ok(analyzed_at) = chrono::DateTime::parse_from_rfc3339(ts) {
                let days_ago = (chrono::Utc::now() - analyzed_at.with_timezone(&chrono::Utc))
                    .num_days();
                if days_ago > 90 {
                    "stale".to_string()
                } else {
                    "active".to_string()
                }
            } else {
                // Can't parse timestamp, fall back to write counts
                if total_inserts + total_updates > 100 {
                    "active".to_string()
                } else {
                    "stale".to_string()
                }
            }
        }
    }
}

// ============================================================================
// Command
// ============================================================================

#[command]
pub async fn val_collect_recency(domain: String) -> CmdResult<RecencyResult> {
    let start = Instant::now();
    let domain_config = get_domain_config(&domain)?;
    let global_path = &domain_config.global_path;

    // Execute SQL via the existing sql module
    let sql_result = super::sql::val_execute_sql(
        domain.clone(),
        PG_STAT_SQL.to_string(),
        Some(5000), // High limit to get all tables
    )
    .await?;

    if let Some(err) = &sql_result.error {
        return Err(CommandError::Internal(format!(
            "Failed to collect recency data: {}",
            err
        )));
    }

    // Parse results into TableRecency entries
    let mut tables: HashMap<String, TableRecency> = HashMap::new();
    let mut total_live_rows: i64 = 0;
    let mut active = 0usize;
    let mut stale = 0usize;
    let mut empty = 0usize;
    let mut dead = 0usize;

    for row in &sql_result.data {
        let table_name = row
            .get("relname")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        if table_name.is_empty() {
            continue;
        }

        let row_count = extract_i64(row, "n_live_tup");
        let dead_tuples = extract_i64(row, "n_dead_tup");
        let total_inserts = extract_i64(row, "n_tup_ins");
        let total_updates = extract_i64(row, "n_tup_upd");
        let total_deletes = extract_i64(row, "n_tup_del");
        let last_autoanalyze = row
            .get("last_autoanalyze")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let last_autovacuum = row
            .get("last_autovacuum")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let activity_status =
            classify_activity(row_count, total_inserts, total_updates, &last_autoanalyze);

        match activity_status.as_str() {
            "active" => active += 1,
            "stale" => stale += 1,
            "empty" => empty += 1,
            "dead" => dead += 1,
            _ => {}
        }

        total_live_rows += row_count;

        tables.insert(
            table_name.clone(),
            TableRecency {
                table_name,
                row_count,
                dead_tuples,
                total_inserts,
                total_updates,
                total_deletes,
                last_autoanalyze,
                last_autovacuum,
                activity_status,
            },
        );
    }

    let table_count = tables.len();

    let report = RecencyReport {
        computed_at: chrono::Utc::now().to_rfc3339(),
        domain: domain.clone(),
        tables,
        summary: RecencySummary {
            total_tables: table_count,
            active_tables: active,
            stale_tables: stale,
            empty_tables: empty,
            dead_tables: dead,
            total_live_rows,
        },
    };

    // Write to recency.json
    let output_path = format!("{}/recency.json", global_path);
    let json_value = serde_json::to_value(&report)?;
    write_json(&output_path, &json_value)?;

    let duration_ms = start.elapsed().as_millis() as u64;

    Ok(RecencyResult {
        domain,
        table_count,
        duration_ms,
        status: "ok".to_string(),
        message: format!(
            "Collected recency for {} tables ({} active, {} stale, {} empty, {} dead)",
            table_count, active, stale, empty, dead
        ),
    })
}

/// Extract i64 from a JSON value (handles both number and string representations)
fn extract_i64(row: &Value, key: &str) -> i64 {
    row.get(key)
        .and_then(|v| {
            v.as_i64()
                .or_else(|| v.as_str().and_then(|s| s.parse::<i64>().ok()))
        })
        .unwrap_or(0)
}
