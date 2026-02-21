// Analytics module — source-agnostic page view storage
//
// Each analytics source (GA4, Mixpanel, etc.) normalizes data into
// AnalyticsPageView structs, which get upserted to the Supabase
// analytics_page_views table.

pub mod ga4;

use chrono::{NaiveDate, Utc};
use reqwest::Client;
use serde::{Deserialize, Serialize};

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
) -> Result<usize, String> {
    if rows.is_empty() {
        return Ok(0);
    }

    let client = Client::new();
    let url = format!("{}/rest/v1/analytics_page_views", supabase_url);

    // Supabase has a payload size limit — batch in chunks of 500
    let mut total = 0;
    for chunk in rows.chunks(500) {
        let payload: Vec<serde_json::Value> = chunk
            .iter()
            .map(|r| {
                serde_json::json!({
                    "source": r.source,
                    "domain": r.domain,
                    "page_path": r.page_path,
                    "user_id": r.user_id,
                    "view_date": r.view_date.to_string(),
                    "views": r.views,
                    "is_internal": r.is_internal,
                    "created_at": Utc::now().to_rfc3339(),
                })
            })
            .collect();

        let resp = client
            .post(&url)
            .header("apikey", supabase_key)
            .header("Authorization", format!("Bearer {}", supabase_key))
            .header("Content-Type", "application/json")
            .header("Prefer", "resolution=merge-duplicates")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Supabase upsert failed: {}", e))?;

        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Supabase upsert error: {}", body));
        }

        total += chunk.len();
    }

    Ok(total)
}
