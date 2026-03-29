// Analytics module — source-agnostic page view storage
//
// Each analytics source (GA4, Mixpanel, etc.) normalizes data into
// AnalyticsPageView structs, which get upserted to the Supabase
// analytics_page_views table.

pub mod auth;
pub mod background;
pub mod ga4;
pub mod types;

use chrono::{NaiveDate, Utc};
use serde::{Deserialize, Serialize};

use crate::commands::error::{CmdResult, CommandError};

// ============================================================================
// Shared types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyticsPageView {
    pub source: String, // "ga4", "mixpanel", etc.
    pub domain: Option<String>,
    pub page_path: String,
    pub user_id: Option<String>,
    pub view_date: NaiveDate,
    pub views: i32,
    pub is_internal: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyticsSyncResult {
    pub source: String,
    pub rows_upserted: usize,
    pub warnings: Vec<String>,
}

// ============================================================================
// Supabase storage — shared by all sources
// ============================================================================

pub async fn upsert_page_views(
    rows: &[AnalyticsPageView],
    supabase_url: &str,
    supabase_key: &str,
) -> CmdResult<usize> {
    if rows.is_empty() {
        return Ok(0);
    }

    // Deduplicate: GA4 can return multiple rows for the same (source, page_path, user_id, view_date)
    // when there are different domain values. Aggregate by summing views.
    use std::collections::HashMap;
    struct AggRow {
        domain: Option<String>,
        views: i32,
        is_internal: bool,
    }
    let mut deduped: HashMap<(String, String, String, String), AggRow> = HashMap::new();
    for r in rows {
        let key = (
            r.source.clone(),
            r.page_path.clone(),
            r.user_id.as_deref().unwrap_or("").to_string(),
            r.view_date.to_string(),
        );
        let entry = deduped.entry(key).or_insert(AggRow {
            domain: r.domain.clone(),
            views: 0,
            is_internal: r.is_internal,
        });
        entry.views += r.views;
        // Keep domain if we find a non-null one
        if entry.domain.is_none() && r.domain.is_some() {
            entry.domain = r.domain.clone();
        }
        if r.is_internal {
            entry.is_internal = true;
        }
    }

    let client = crate::HTTP_CLIENT.clone();
    let url = format!(
        "{}/rest/v1/analytics_page_views?on_conflict=source,page_path,user_id,view_date",
        supabase_url
    );

    let all_rows: Vec<serde_json::Value> = deduped
        .into_iter()
        .map(|((source, page_path, user_id, view_date), agg)| {
            serde_json::json!({
                "source": source,
                "domain": agg.domain,
                "page_path": page_path,
                "user_id": user_id,
                "view_date": view_date,
                "views": agg.views,
                "is_internal": agg.is_internal,
                "created_at": Utc::now().to_rfc3339(),
            })
        })
        .collect();

    // Supabase has a payload size limit — batch in chunks of 500
    let mut total = 0;
    for chunk in all_rows.chunks(500) {
        let resp = client
            .post(&url)
            .header("apikey", supabase_key)
            .header("Authorization", format!("Bearer {}", supabase_key))
            .header("Content-Type", "application/json")
            .header("Prefer", "resolution=merge-duplicates")
            .json(&chunk)
            .send()
            .await?;

        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(CommandError::Network(format!("Supabase upsert error: {}", body)));
        }

        total += chunk.len();
    }

    Ok(total)
}
