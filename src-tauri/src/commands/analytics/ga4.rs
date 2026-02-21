// GA4 Analytics — fetch page views from Google Analytics Data API
//
// Auth: Service account JWT → Bearer token (cached 1 hour)
// API: GA4 Data API v1beta runReport
// Output: Normalized AnalyticsPageView rows → Supabase via shared storage
//
// Tries to fetch with Domain + UserID custom dimensions first, then
// falls back progressively if dimensions aren't available. Warnings
// are returned when dimensions are missing so the user knows what data
// is incomplete. Internal users (thinkval.com) are flagged, not filtered.

use chrono::{NaiveDate, Utc};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::command;

use super::{upsert_page_views, AnalyticsPageView, AnalyticsSyncResult};
use crate::commands::settings;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ga4ConfigStatus {
    pub configured: bool,
    pub service_account_path: Option<String>,
    pub property_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ServiceAccountKey {
    client_email: String,
    private_key: String,
    token_uri: String,
}

struct CachedToken {
    access_token: String,
    expires_at: i64,
}

static TOKEN_CACHE: std::sync::LazyLock<Mutex<Option<CachedToken>>> =
    std::sync::LazyLock::new(|| Mutex::new(None));

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
// Auth — Service Account JWT → Access Token
// ============================================================================

async fn get_access_token(sa_path: &str) -> Result<String, String> {
    {
        let cache = TOKEN_CACHE
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        if let Some(ref cached) = *cache {
            if Utc::now().timestamp() < cached.expires_at - 60 {
                return Ok(cached.access_token.clone());
            }
        }
    }

    let sa_content = std::fs::read_to_string(sa_path)
        .map_err(|e| format!("Failed to read service account file: {}", e))?;
    let sa: ServiceAccountKey = serde_json::from_str(&sa_content)
        .map_err(|e| format!("Failed to parse service account JSON: {}", e))?;

    let now = Utc::now().timestamp();
    let exp = now + 3600;

    #[derive(Serialize)]
    struct Claims {
        iss: String,
        scope: String,
        aud: String,
        iat: i64,
        exp: i64,
    }

    let claims = Claims {
        iss: sa.client_email,
        scope: "https://www.googleapis.com/auth/analytics.readonly".to_string(),
        aud: sa.token_uri.clone(),
        iat: now,
        exp,
    };

    let key = jsonwebtoken::EncodingKey::from_rsa_pem(sa.private_key.as_bytes())
        .map_err(|e| format!("Failed to parse RSA private key: {}", e))?;

    let header = jsonwebtoken::Header::new(jsonwebtoken::Algorithm::RS256);
    let jwt = jsonwebtoken::encode(&header, &claims, &key)
        .map_err(|e| format!("Failed to encode JWT: {}", e))?;

    let client = Client::new();
    let resp = client
        .post(&sa.token_uri)
        .form(&[
            ("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"),
            ("assertion", &jwt),
        ])
        .send()
        .await
        .map_err(|e| format!("Token request failed: {}", e))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Token exchange failed: {}", body));
    }

    let token_resp: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;
    let access_token = token_resp["access_token"]
        .as_str()
        .ok_or("No access_token in response")?
        .to_string();

    {
        let mut cache = TOKEN_CACHE
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        *cache = Some(CachedToken {
            access_token: access_token.clone(),
            expires_at: exp,
        });
    }

    Ok(access_token)
}

// ============================================================================
// GA4 API — Fetch page views with Domain + UserID dimensions
// ============================================================================

/// Result of a fetch attempt — rows + any warnings about missing dimensions
struct FetchResult {
    rows: Vec<AnalyticsPageView>,
    warnings: Vec<String>,
}

async fn fetch_page_views(
    access_token: &str,
    property_id: &str,
) -> Result<FetchResult, String> {
    let client = Client::new();
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
        .await
        .map_err(|e| format!("GA4 API request failed: {}", e))?;

    if !resp.status().is_success() {
        let body_text = resp.text().await.unwrap_or_default();

        if body_text.contains("not a valid dimension") {
            // Fall back: try with just UserID (no Domain)
            return fetch_page_views_no_domain(access_token, property_id).await;
        }
        return Err(format!("GA4 API error: {}", body_text));
    }

    // Full dimensions available — parse with Domain + UserID
    let report: Ga4RunReportResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse GA4 response: {}", e))?;

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
) -> Result<FetchResult, String> {
    let client = Client::new();
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
        .await
        .map_err(|e| format!("GA4 API request failed: {}", e))?;

    if !resp.status().is_success() {
        let body_text = resp.text().await.unwrap_or_default();

        if body_text.contains("not a valid dimension") {
            // Fall back further: no Domain, no UserID
            return fetch_page_views_basic(access_token, property_id).await;
        }
        return Err(format!("GA4 API error: {}", body_text));
    }

    let report: Ga4RunReportResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse GA4 response: {}", e))?;

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
) -> Result<FetchResult, String> {
    let client = Client::new();
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
        .await
        .map_err(|e| format!("GA4 API request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        return Err(format!("GA4 API error ({}): {}", status, body_text));
    }

    let report: Ga4RunReportResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse GA4 response: {}", e))?;

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
// Tauri Commands
// ============================================================================

/// Check if GA4 service account and property ID are configured
#[command]
pub fn ga4_check_config() -> Result<Ga4ConfigStatus, String> {
    let s = settings::load_settings()?;
    let sa_path = s
        .keys
        .get(settings::KEY_GA4_SERVICE_ACCOUNT_PATH)
        .cloned();
    let prop_id = s.keys.get(settings::KEY_GA4_PROPERTY_ID).cloned();

    let configured = sa_path.as_ref().map_or(false, |p| !p.is_empty())
        && prop_id.as_ref().map_or(false, |p| !p.is_empty());

    Ok(Ga4ConfigStatus {
        configured,
        service_account_path: sa_path,
        property_id: prop_id,
    })
}

/// List all available dimensions for the GA4 property (including custom event params).
/// Use this to discover the correct API names for custom dimensions.
#[command]
pub async fn ga4_list_dimensions() -> Result<Vec<String>, String> {
    let s = settings::load_settings()?;
    let sa_path = s
        .keys
        .get(settings::KEY_GA4_SERVICE_ACCOUNT_PATH)
        .ok_or("GA4 service account path not configured")?
        .clone();
    let property_id = s
        .keys
        .get(settings::KEY_GA4_PROPERTY_ID)
        .ok_or("GA4 property ID not configured")?
        .clone();

    let sa_path = if sa_path.starts_with("~/") {
        dirs::home_dir()
            .map(|h| h.join(&sa_path[2..]).to_string_lossy().to_string())
            .unwrap_or(sa_path)
    } else {
        sa_path
    };

    let access_token = get_access_token(&sa_path).await?;
    let client = Client::new();

    // GA4 Metadata API — returns all valid dimensions and metrics
    let url = format!(
        "https://analyticsdata.googleapis.com/v1beta/properties/{}/metadata",
        property_id
    );

    let resp = client
        .get(&url)
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| format!("GA4 metadata request failed: {}", e))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("GA4 metadata error: {}", body));
    }

    let metadata: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse metadata: {}", e))?;

    // Extract dimension apiNames, filter to customEvent: ones for readability
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

    // Sort for readability
    dimensions.sort();
    Ok(dimensions)
}

/// Fetch all dashboard page views from GA4 and store in Supabase.
/// Excludes internal users (thinkval.com).
#[command]
pub async fn ga4_fetch_analytics(
    supabase_url: String,
    supabase_key: String,
) -> Result<AnalyticsSyncResult, String> {
    let s = settings::load_settings()?;
    let sa_path = s
        .keys
        .get(settings::KEY_GA4_SERVICE_ACCOUNT_PATH)
        .ok_or("GA4 service account path not configured")?
        .clone();
    let property_id = s
        .keys
        .get(settings::KEY_GA4_PROPERTY_ID)
        .ok_or("GA4 property ID not configured")?
        .clone();

    // Resolve ~ in path
    let sa_path = if sa_path.starts_with("~/") {
        dirs::home_dir()
            .map(|h| h.join(&sa_path[2..]).to_string_lossy().to_string())
            .unwrap_or(sa_path)
    } else {
        sa_path
    };

    let access_token = get_access_token(&sa_path).await?;
    let fetch_result = fetch_page_views(&access_token, &property_id).await?;
    let rows_upserted =
        upsert_page_views(&fetch_result.rows, &supabase_url, &supabase_key).await?;

    Ok(AnalyticsSyncResult {
        source: "ga4".to_string(),
        rows_upserted,
        warnings: fetch_result.warnings,
    })
}
