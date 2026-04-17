// GA4 Analytics — fetch page views from Google Analytics Data API
//
// Auth: OAuth2 via Google account (tokens in ~/.tv-client/analytics/tokens.json)
// API: GA4 Data API v1beta runReport
// Output: Normalized AnalyticsPageView rows → Supabase via shared storage
//
// Two sync targets:
// 1. VAL Platform — /dashboard/* paths with Domain + UserID custom dimensions
// 2. Website — all paths, no custom dimensions, source = "ga4-website"
//
// Internal users (thinkval.com) are flagged, not filtered.

use chrono::{NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use tauri::command;

use super::auth;
use super::{upsert_page_views, AnalyticsPageView, AnalyticsSyncResult};
use crate::commands::error::{CmdResult, CommandError};
use crate::commands::settings;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ga4ConfigStatus {
    pub configured: bool,
    pub property_id: Option<String>,
    pub website_property_id: Option<String>,
    pub is_authenticated: bool,
}

// GA4 API response
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Ga4RunReportResponse {
    rows: Option<Vec<Ga4Row>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Ga4Row {
    dimension_values: Vec<Ga4Value>,
    metric_values: Vec<Ga4Value>,
}

#[derive(Debug, Deserialize)]
struct Ga4Value {
    value: String,
}

/// Domains to exclude from analytics (internal usage)
const INTERNAL_EMAIL_DOMAINS: &[&str] = &["thinkval.com"];

// ============================================================================
// GA4 API — Fetch VAL platform page views with Domain + UserID dimensions
// ============================================================================

/// Result of a fetch attempt — rows + any warnings about missing dimensions
struct FetchResult {
    rows: Vec<AnalyticsPageView>,
    warnings: Vec<String>,
}

async fn fetch_page_views(
    access_token: &str,
    property_id: &str,
) -> CmdResult<FetchResult> {
    let client = crate::HTTP_CLIENT.clone();
    let url = format!(
        "https://analyticsdata.googleapis.com/v1beta/properties/{}:runReport",
        property_id
    );

    let today = Utc::now().format("%Y-%m-%d").to_string();
    let ninety_days_ago = (Utc::now() - chrono::Duration::days(90))
        .format("%Y-%m-%d")
        .to_string();

    // Try with both Domain and UserID dimensions first
    let body = serde_json::json!({
        "dateRanges": [{
            "startDate": ninety_days_ago,
            "endDate": today,
        }],
        "dimensions": [
            { "name": "pagePath" },
            { "name": "date" },
            { "name": "customEvent:ua_dimension_1" },
            { "name": "customEvent:ua_dimension_2" },
        ],
        "metrics": [
            { "name": "screenPageViews" },
        ],
        "dimensionFilter": {
            "filter": {
                "fieldName": "pagePath",
                "stringFilter": {
                    "matchType": "BEGINS_WITH",
                    "value": "/dashboard/",
                }
            }
        },
        "limit": "10000",
    });

    let resp = client
        .post(&url)
        .bearer_auth(access_token)
        .json(&body)
        .send()
        .await?;

    if !resp.status().is_success() {
        let body_text = resp.text().await.unwrap_or_default();

        if body_text.contains("not a valid dimension") {
            // Fall back: try with just UserID (no Domain)
            return fetch_page_views_no_domain(access_token, property_id).await;
        }
        return Err(CommandError::Network(format!("GA4 API error: {}", body_text)));
    }

    // Full dimensions available — parse with Domain + UserID
    let report: Ga4RunReportResponse = resp.json().await?;

    let mut results = Vec::new();
    if let Some(rows) = report.rows {
        for row in rows {
            // Dimensions: pagePath, date, Domain, UserID
            if row.dimension_values.len() < 4 || row.metric_values.is_empty() {
                continue;
            }
            let page_path = row.dimension_values[0].value.clone();
            let date_str = &row.dimension_values[1].value;
            let domain_raw = &row.dimension_values[2].value;
            let user_id_raw = &row.dimension_values[3].value;
            let views: i64 = row.metric_values[0].value.parse().unwrap_or(0);

            let domain = if domain_raw == "(not set)" || domain_raw.is_empty() {
                None
            } else {
                Some(domain_raw.clone())
            };

            let user_id = if user_id_raw == "(not set)" || user_id_raw.is_empty() {
                None
            } else {
                Some(user_id_raw.clone())
            };

            let is_internal = user_id
                .as_ref()
                .map(|uid| {
                    let uid_lower = uid.to_lowercase();
                    INTERNAL_EMAIL_DOMAINS
                        .iter()
                        .any(|d| uid_lower.contains(d))
                })
                .unwrap_or(false);

            let date = NaiveDate::parse_from_str(date_str, "%Y%m%d")
                .unwrap_or_else(|_| Utc::now().date_naive());

            results.push(AnalyticsPageView {
                source: "ga4".to_string(),
                domain,
                page_path,
                user_id,
                view_date: date,
                views: views as i32,
                is_internal,
            });
        }
    }

    Ok(FetchResult {
        rows: results,
        warnings: vec![],
    })
}

/// Fallback 1: fetch with UserID but no Domain dimension
async fn fetch_page_views_no_domain(
    access_token: &str,
    property_id: &str,
) -> CmdResult<FetchResult> {
    let client = crate::HTTP_CLIENT.clone();
    let url = format!(
        "https://analyticsdata.googleapis.com/v1beta/properties/{}:runReport",
        property_id
    );

    let today = Utc::now().format("%Y-%m-%d").to_string();
    let ninety_days_ago = (Utc::now() - chrono::Duration::days(90))
        .format("%Y-%m-%d")
        .to_string();

    let body = serde_json::json!({
        "dateRanges": [{
            "startDate": ninety_days_ago,
            "endDate": today,
        }],
        "dimensions": [
            { "name": "pagePath" },
            { "name": "date" },
            { "name": "customEvent:ua_dimension_2" },
        ],
        "metrics": [
            { "name": "screenPageViews" },
        ],
        "dimensionFilter": {
            "filter": {
                "fieldName": "pagePath",
                "stringFilter": {
                    "matchType": "BEGINS_WITH",
                    "value": "/dashboard/",
                }
            }
        },
        "limit": "10000",
    });

    let resp = client
        .post(&url)
        .bearer_auth(access_token)
        .json(&body)
        .send()
        .await?;

    if !resp.status().is_success() {
        let body_text = resp.text().await.unwrap_or_default();

        if body_text.contains("not a valid dimension") {
            // Fall back further: no Domain, no UserID
            return fetch_page_views_basic(access_token, property_id).await;
        }
        return Err(CommandError::Network(format!("GA4 API error: {}", body_text)));
    }

    let report: Ga4RunReportResponse = resp.json().await?;

    let mut results = Vec::new();
    if let Some(rows) = report.rows {
        for row in rows {
            // Dimensions: pagePath, date, UserID
            if row.dimension_values.len() < 3 || row.metric_values.is_empty() {
                continue;
            }
            let page_path = row.dimension_values[0].value.clone();
            let date_str = &row.dimension_values[1].value;
            let user_id_raw = &row.dimension_values[2].value;
            let views: i64 = row.metric_values[0].value.parse().unwrap_or(0);

            let user_id = if user_id_raw == "(not set)" || user_id_raw.is_empty() {
                None
            } else {
                Some(user_id_raw.clone())
            };

            let is_internal = user_id
                .as_ref()
                .map(|uid| {
                    let uid_lower = uid.to_lowercase();
                    INTERNAL_EMAIL_DOMAINS
                        .iter()
                        .any(|d| uid_lower.contains(d))
                })
                .unwrap_or(false);

            let date = NaiveDate::parse_from_str(date_str, "%Y%m%d")
                .unwrap_or_else(|_| Utc::now().date_naive());

            results.push(AnalyticsPageView {
                source: "ga4".to_string(),
                domain: None,
                page_path,
                user_id,
                view_date: date,
                views: views as i32,
                is_internal,
            });
        }
    }

    Ok(FetchResult {
        rows: results,
        warnings: vec![
            "Domain dimension (ua_dimension_1) not available — domain will be null for all rows".to_string(),
        ],
    })
}

/// Fallback 2: fetch with just pagePath + date (no UserID, no Domain)
async fn fetch_page_views_basic(
    access_token: &str,
    property_id: &str,
) -> CmdResult<FetchResult> {
    let client = crate::HTTP_CLIENT.clone();
    let url = format!(
        "https://analyticsdata.googleapis.com/v1beta/properties/{}:runReport",
        property_id
    );

    let today = Utc::now().format("%Y-%m-%d").to_string();
    let ninety_days_ago = (Utc::now() - chrono::Duration::days(90))
        .format("%Y-%m-%d")
        .to_string();

    let body = serde_json::json!({
        "dateRanges": [{
            "startDate": ninety_days_ago,
            "endDate": today,
        }],
        "dimensions": [
            { "name": "pagePath" },
            { "name": "date" },
        ],
        "metrics": [
            { "name": "screenPageViews" },
        ],
        "dimensionFilter": {
            "filter": {
                "fieldName": "pagePath",
                "stringFilter": {
                    "matchType": "BEGINS_WITH",
                    "value": "/dashboard/",
                }
            }
        },
        "limit": "10000",
    });

    let resp = client
        .post(&url)
        .bearer_auth(access_token)
        .json(&body)
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        return Err(CommandError::Http {
            status: status.as_u16(),
            body: body_text,
        });
    }

    let report: Ga4RunReportResponse = resp.json().await?;

    let mut results = Vec::new();
    if let Some(rows) = report.rows {
        for row in rows {
            if row.dimension_values.len() < 2 || row.metric_values.is_empty() {
                continue;
            }
            let page_path = row.dimension_values[0].value.clone();
            let date_str = &row.dimension_values[1].value;
            let views: i64 = row.metric_values[0].value.parse().unwrap_or(0);

            let date = NaiveDate::parse_from_str(date_str, "%Y%m%d")
                .unwrap_or_else(|_| Utc::now().date_naive());

            results.push(AnalyticsPageView {
                source: "ga4".to_string(),
                domain: None,
                page_path,
                user_id: None,
                view_date: date,
                views: views as i32,
                is_internal: false,
            });
        }
    }

    Ok(FetchResult {
        rows: results,
        warnings: vec![
            "Domain dimension (ua_dimension_1) not available — domain will be null for all rows".to_string(),
            "UserID dimension (ua_dimension_2) not available — cannot identify internal users".to_string(),
        ],
    })
}

// ============================================================================
// GA4 API — Fetch website page views (no custom dimensions)
// ============================================================================

async fn fetch_website_page_views(
    access_token: &str,
    property_id: &str,
) -> CmdResult<FetchResult> {
    let client = crate::HTTP_CLIENT.clone();
    let url = format!(
        "https://analyticsdata.googleapis.com/v1beta/properties/{}:runReport",
        property_id
    );

    let today = Utc::now().format("%Y-%m-%d").to_string();
    let ninety_days_ago = (Utc::now() - chrono::Duration::days(90))
        .format("%Y-%m-%d")
        .to_string();

    let body = serde_json::json!({
        "dateRanges": [{
            "startDate": ninety_days_ago,
            "endDate": today,
        }],
        "dimensions": [
            { "name": "pagePath" },
            { "name": "date" },
        ],
        "metrics": [
            { "name": "screenPageViews" },
            { "name": "totalUsers" },
        ],
        "limit": "10000",
    });

    let resp = client
        .post(&url)
        .bearer_auth(access_token)
        .json(&body)
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        return Err(CommandError::Http {
            status: status.as_u16(),
            body: body_text,
        });
    }

    let report: Ga4RunReportResponse = resp.json().await?;

    let mut results = Vec::new();
    if let Some(rows) = report.rows {
        for row in rows {
            if row.dimension_values.len() < 2 || row.metric_values.is_empty() {
                continue;
            }
            let page_path = row.dimension_values[0].value.clone();
            let date_str = &row.dimension_values[1].value;
            let views: i64 = row.metric_values[0].value.parse().unwrap_or(0);

            let date = NaiveDate::parse_from_str(date_str, "%Y%m%d")
                .unwrap_or_else(|_| Utc::now().date_naive());

            results.push(AnalyticsPageView {
                source: "ga4-website".to_string(),
                domain: None,
                page_path,
                user_id: None,
                view_date: date,
                views: views as i32,
                is_internal: false,
            });
        }
    }

    Ok(FetchResult {
        rows: results,
        warnings: vec![],
    })
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Check if GA4 is configured (OAuth + property IDs)
#[command]
pub async fn ga4_check_config() -> CmdResult<Ga4ConfigStatus> {
    let s = settings::load_settings()?;
    let prop_id = s.keys.get(settings::KEY_GA4_PROPERTY_ID).cloned();
    let website_prop_id = s.keys.get(settings::KEY_GA4_WEBSITE_PROPERTY_ID).cloned();

    let has_property = prop_id.as_ref().map_or(false, |p| !p.is_empty())
        || website_prop_id.as_ref().map_or(false, |p| !p.is_empty());

    let is_authenticated = auth::load_tokens().is_some();

    Ok(Ga4ConfigStatus {
        configured: has_property && is_authenticated,
        property_id: prop_id,
        website_property_id: website_prop_id,
        is_authenticated,
    })
}

/// List all available dimensions for the GA4 property (including custom event params).
#[command]
pub async fn ga4_list_dimensions() -> CmdResult<Vec<String>> {
    let s = settings::load_settings()?;
    let property_id = s
        .keys
        .get(settings::KEY_GA4_PROPERTY_ID)
        .ok_or_else(|| CommandError::Config("GA4 property ID not configured".into()))?
        .clone();

    let access_token = auth::get_valid_token().await?;
    let client = crate::HTTP_CLIENT.clone();

    let url = format!(
        "https://analyticsdata.googleapis.com/v1beta/properties/{}/metadata",
        property_id
    );

    let resp = client
        .get(&url)
        .bearer_auth(&access_token)
        .send()
        .await?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(CommandError::Network(format!("GA4 metadata error: {}", body)));
    }

    let metadata: serde_json::Value = resp.json().await?;

    let mut dimensions = Vec::new();
    if let Some(dims) = metadata["dimensions"].as_array() {
        for dim in dims {
            if let Some(api_name) = dim["apiName"].as_str() {
                if api_name.starts_with("customEvent:") {
                    dimensions.push(api_name.to_string());
                }
            }
        }
    }

    dimensions.sort();
    Ok(dimensions)
}

/// Fetch VAL platform dashboard page views from GA4 and store in Supabase.
#[command]
pub async fn ga4_fetch_analytics(
    supabase_url: String,
    supabase_key: String,
) -> CmdResult<AnalyticsSyncResult> {
    let s = settings::load_settings()?;
    let property_id = s
        .keys
        .get(settings::KEY_GA4_PROPERTY_ID)
        .ok_or_else(|| CommandError::Config("GA4 property ID not configured".into()))?
        .clone();

    let access_token = auth::get_valid_token().await?;
    let fetch_result = fetch_page_views(&access_token, &property_id).await?;
    let rows_upserted =
        upsert_page_views(&fetch_result.rows, &supabase_url, &supabase_key).await?;

    Ok(AnalyticsSyncResult {
        source: "ga4".to_string(),
        rows_upserted,
        warnings: fetch_result.warnings,
    })
}

/// Fetch website page views from GA4 and store in Supabase.
#[command]
pub async fn ga4_fetch_website_analytics(
    supabase_url: String,
    supabase_key: String,
) -> CmdResult<AnalyticsSyncResult> {
    let s = settings::load_settings()?;
    let property_id = s
        .keys
        .get(settings::KEY_GA4_WEBSITE_PROPERTY_ID)
        .ok_or_else(|| CommandError::Config("GA4 website property ID not configured".into()))?
        .clone();

    let access_token = auth::get_valid_token().await?;
    let fetch_result = fetch_website_page_views(&access_token, &property_id).await?;
    let rows_upserted =
        upsert_page_views(&fetch_result.rows, &supabase_url, &supabase_key).await?;

    Ok(AnalyticsSyncResult {
        source: "ga4-website".to_string(),
        rows_upserted,
        warnings: fetch_result.warnings,
    })
}
