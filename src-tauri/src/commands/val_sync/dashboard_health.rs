// VAL Sync Dashboard Health - Analyze dashboard usage based on session data
// Dashboards are scored based on recency and frequency of user sessions

use super::config::get_domain_config;
use super::sync::write_json;
use super::auth;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::time::Instant;
use tauri::command;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardHealthStatus {
    pub level: String,
    pub description: String,
}

impl DashboardHealthStatus {
    fn critical() -> Self {
        Self { level: "critical".to_string(), description: "High frequency, recently accessed - essential dashboard".to_string() }
    }
    fn active() -> Self {
        Self { level: "active".to_string(), description: "Regular usage, healthy dashboard".to_string() }
    }
    fn occasional() -> Self {
        Self { level: "occasional".to_string(), description: "Low but recent usage - occasional use case".to_string() }
    }
    fn attention() -> Self {
        Self { level: "attention".to_string(), description: "High frequency but aging - check if still needed".to_string() }
    }
    fn declining() -> Self {
        Self { level: "declining".to_string(), description: "Usage dropping off - may become stale".to_string() }
    }
    fn abandoned() -> Self {
        Self { level: "abandoned".to_string(), description: "Was heavily used, now inactive".to_string() }
    }
    fn stale() -> Self {
        Self { level: "stale".to_string(), description: "Rarely used, potentially obsolete".to_string() }
    }
    fn dead() -> Self {
        Self { level: "dead".to_string(), description: "Was critical, now completely inactive".to_string() }
    }
    fn unused() -> Self {
        Self { level: "unused".to_string(), description: "Never accessed - candidate for cleanup".to_string() }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardMetrics {
    pub total_sessions: i64,
    pub unique_users: i64,
    pub total_page_views: i64,
    pub days_with_activity: i64,
    pub sessions_per_month: f64,
    pub first_session: Option<String>,
    pub last_session: Option<String>,
    pub days_since_last_session: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardHealth {
    pub score: i32,
    pub status: DashboardHealthStatus,
    pub issues: Vec<String>,
    pub frequency_tier: String,
    pub recency_tier: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardAnalysis {
    pub id: i64,
    pub name: String,
    pub category: Option<String>,
    pub created_date: Option<String>,
    pub updated_date: Option<String>,
    pub metrics: DashboardMetrics,
    pub health: DashboardHealth,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardHealthSummary {
    pub critical: usize,
    pub active: usize,
    pub occasional: usize,
    pub attention: usize,
    pub declining: usize,
    pub abandoned: usize,
    pub stale: usize,
    pub dead: usize,
    pub unused: usize,
    pub errors: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardHealthResult {
    pub domain: String,
    pub global_path: String,
    pub timestamp: String,
    pub lookback_days: i64,
    pub total_dashboards: usize,
    pub dashboards_with_sessions: usize,
    pub dashboards: Vec<DashboardAnalysis>,
    pub summary: DashboardHealthSummary,
    pub file_path: String,
    pub duration_ms: u64,
}

// ============================================================================
// Helper types for parsing
// ============================================================================

#[derive(Debug, Deserialize)]
struct Dashboard {
    id: i64,
    name: Option<String>,
    category: Option<String>,
    created_date: Option<String>,
    updated_date: Option<String>,
}

#[derive(Debug, Clone)]
struct SessionMetrics {
    total_sessions: i64,
    unique_users: i64,
    total_page_views: i64,
    first_session: Option<String>,
    last_session: Option<String>,
    days_with_activity: i64,
}

// ============================================================================
// Session data constants (from tv domain)
// ============================================================================

const SESSIONS_TABLE: &str = "custom_tbl_2675_67";
const COL_SESSION_DATE: &str = "gv5fc732311905cb27e82d67f4f6511f7f";
const COL_DOMAIN: &str = "gvae7b2ca969e4b3d1b396ccca092ad1a7";
const COL_USER_EMAIL: &str = "gv74914f4a229a23bd15143ba9dd14dcf9";
const COL_PAGE_VIEWS: &str = "gv161bca2e917335e125291a00fd76a80f";
const COL_PAGE_URL: &str = "gv5b88211f306c96500f1eb44b5e53d9b7";

// ============================================================================
// Helper functions
// ============================================================================

fn load_dashboards(global_path: &str) -> Result<Vec<Dashboard>, String> {
    let path = Path::new(global_path).join("all_dashboards.json");
    if !path.exists() {
        return Err(format!("Dashboards file not found: {:?}. Run sync first.", path));
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read dashboards: {}", e))?;

    let data: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse dashboards JSON: {}", e))?;

    let items = if let Some(arr) = data.as_array() {
        arr.clone()
    } else if let Some(data_arr) = data.get("data").and_then(|d| d.as_array()) {
        data_arr.clone()
    } else {
        return Err("Invalid dashboards JSON format".to_string());
    };

    let dashboards: Vec<Dashboard> = items
        .into_iter()
        .filter_map(|v| serde_json::from_value(v).ok())
        .collect();

    Ok(dashboards)
}

/// Execute SQL query against the TV domain to get session metrics
async fn fetch_session_metrics(domain: &str, lookback_days: i64) -> Result<HashMap<i64, SessionMetrics>, String> {
    // Get TV domain config
    let tv_config = get_domain_config("tv")
        .map_err(|_| "TV domain not configured. Session data requires tv domain access.".to_string())?;

    let base_url = format!("https://{}.thinkval.io", tv_config.api_domain());

    // Ensure auth to TV domain
    let (token, _) = auth::ensure_auth("tv").await?;

    // Calculate from date
    let from_date = chrono::Utc::now() - chrono::Duration::days(lookback_days);
    let from_date_str = from_date.format("%Y-%m-%d").to_string();

    // Build SQL query for session metrics
    let sql = format!(
        r#"SELECT
            {page_url} AS page_url,
            COUNT(*) AS total_sessions,
            COUNT(DISTINCT {user_email}) AS unique_users,
            SUM(CAST({page_views} AS INT)) AS total_page_views,
            MIN({session_date}) AS first_session,
            MAX({session_date}) AS last_session,
            COUNT(DISTINCT DATE({session_date})) AS days_with_activity
        FROM {table}
        WHERE {domain_col} = '{domain}'
            AND {user_email} NOT LIKE '%thinkval%'
            AND ({page_url} LIKE '%/dashboard/public/%' OR {page_url} LIKE '%/dashboard/private/%')
            AND {session_date} >= '{from_date}'
        GROUP BY {page_url}
        ORDER BY total_sessions DESC"#,
        page_url = COL_PAGE_URL,
        user_email = COL_USER_EMAIL,
        page_views = COL_PAGE_VIEWS,
        session_date = COL_SESSION_DATE,
        table = SESSIONS_TABLE,
        domain_col = COL_DOMAIN,
        domain = domain,
        from_date = from_date_str
    );

    // Execute SQL via VAL API
    let url = format!("{}/api/v1/sql/execute", base_url);
    let client = reqwest::Client::new();

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", token))
        .json(&serde_json::json!({
            "sql": sql,
            "rowsPerPage": 10000,
            "page": 0
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to execute session query: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Session query failed ({}): {}", status, body));
    }

    let data: serde_json::Value = response.json().await
        .map_err(|e| format!("Failed to parse session query response: {}", e))?;

    // Parse results into metrics map
    let mut metrics_map = HashMap::new();

    if let Some(rows) = data.get("data").and_then(|d| d.as_array()) {
        for row in rows {
            // Extract dashboard ID from URL pattern: /dashboard/public/123 or /dashboard/private/123
            let page_url = row.get("page_url")
                .and_then(|v| v.as_str())
                .unwrap_or("");

            // Parse dashboard ID from URL
            let dashboard_id = if let Some(caps) = regex::Regex::new(r"/dashboard/(public|private)/(\d+)")
                .ok()
                .and_then(|re| re.captures(page_url))
            {
                caps.get(2).and_then(|m| m.as_str().parse::<i64>().ok())
            } else {
                None
            };

            if let Some(id) = dashboard_id {
                let metrics = SessionMetrics {
                    total_sessions: row.get("total_sessions")
                        .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
                        .unwrap_or(0),
                    unique_users: row.get("unique_users")
                        .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
                        .unwrap_or(0),
                    total_page_views: row.get("total_page_views")
                        .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
                        .unwrap_or(0),
                    first_session: row.get("first_session").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    last_session: row.get("last_session").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    days_with_activity: row.get("days_with_activity")
                        .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
                        .unwrap_or(0),
                };
                metrics_map.insert(id, metrics);
            }
        }
    }

    Ok(metrics_map)
}

/// Calculate days since a date
fn days_since(date_str: &str) -> Option<i64> {
    chrono::NaiveDate::parse_from_str(date_str.split('T').next().unwrap_or(date_str), "%Y-%m-%d")
        .ok()
        .map(|date| {
            let now = chrono::Utc::now().date_naive();
            (now - date).num_days()
        })
}

/// Determine frequency tier based on sessions per month and unique users
fn get_frequency_tier(sessions_per_month: f64, unique_users: i64) -> &'static str {
    if sessions_per_month >= 20.0 || unique_users >= 5 {
        "HIGH"
    } else if sessions_per_month >= 5.0 || unique_users >= 2 {
        "MEDIUM"
    } else if sessions_per_month >= 1.0 {
        "LOW"
    } else {
        "NONE"
    }
}

/// Determine recency tier based on days since last session
fn get_recency_tier(days_since_last: Option<i64>) -> &'static str {
    match days_since_last {
        None => "ANCIENT",
        Some(d) if d <= 30 => "RECENT",
        Some(d) if d <= 90 => "AGING",
        Some(d) if d <= 180 => "OLD",
        Some(_) => "ANCIENT",
    }
}

/// Calculate dashboard health based on frequency and recency
fn calculate_dashboard_health(
    frequency_tier: &str,
    recency_tier: &str,
    metrics: &SessionMetrics,
) -> DashboardHealth {
    // Health matrix lookup
    let (status, score) = match (frequency_tier, recency_tier) {
        ("HIGH", "RECENT") => (DashboardHealthStatus::critical(), 100),
        ("HIGH", "AGING") => (DashboardHealthStatus::attention(), 60),
        ("HIGH", "OLD") => (DashboardHealthStatus::abandoned(), 30),
        ("HIGH", "ANCIENT") => (DashboardHealthStatus::dead(), 10),
        ("MEDIUM", "RECENT") => (DashboardHealthStatus::active(), 90),
        ("MEDIUM", "AGING") => (DashboardHealthStatus::active(), 90),
        ("MEDIUM", "OLD") => (DashboardHealthStatus::declining(), 50),
        ("MEDIUM", "ANCIENT") => (DashboardHealthStatus::stale(), 20),
        ("LOW", "RECENT") => (DashboardHealthStatus::occasional(), 80),
        ("LOW", "AGING") => (DashboardHealthStatus::occasional(), 80),
        ("LOW", "OLD") => (DashboardHealthStatus::declining(), 50),
        ("LOW", "ANCIENT") => (DashboardHealthStatus::stale(), 20),
        ("NONE", _) => (DashboardHealthStatus::unused(), 0),
        _ => (DashboardHealthStatus::unused(), 0),
    };

    let mut issues = vec![];
    if recency_tier == "ANCIENT" && frequency_tier != "NONE" {
        issues.push(format!("No sessions in 180+ days (was {} frequency)", frequency_tier));
    } else if recency_tier == "OLD" {
        issues.push("No sessions in 90-180 days".to_string());
    } else if recency_tier == "AGING" && frequency_tier == "HIGH" {
        issues.push("High-usage dashboard not accessed in 30-90 days".to_string());
    }
    if frequency_tier == "NONE" && metrics.total_sessions == 0 {
        issues.push("Never accessed by users".to_string());
    }

    DashboardHealth {
        score,
        status,
        issues,
        frequency_tier: frequency_tier.to_string(),
        recency_tier: recency_tier.to_string(),
    }
}

// ============================================================================
// Commands
// ============================================================================

/// Run dashboard health analysis for a domain
#[command]
pub async fn val_run_dashboard_health(domain: String, lookback_days: Option<i64>) -> Result<DashboardHealthResult, String> {
    let start = Instant::now();
    let domain_config = get_domain_config(&domain)?;
    let global_path = &domain_config.global_path;
    let lookback = lookback_days.unwrap_or(180);

    // Load dashboards
    let dashboards = load_dashboards(global_path)?;

    // Fetch session metrics from TV domain
    let session_metrics = fetch_session_metrics(&domain, lookback).await?;

    // Analyze each dashboard
    let mut analyses = vec![];
    let mut summary = DashboardHealthSummary {
        critical: 0,
        active: 0,
        occasional: 0,
        attention: 0,
        declining: 0,
        abandoned: 0,
        stale: 0,
        dead: 0,
        unused: 0,
        errors: 0,
    };
    let mut dashboards_with_sessions = 0;

    for dashboard in &dashboards {
        let metrics = session_metrics.get(&dashboard.id).cloned().unwrap_or(SessionMetrics {
            total_sessions: 0,
            unique_users: 0,
            total_page_views: 0,
            first_session: None,
            last_session: None,
            days_with_activity: 0,
        });

        if metrics.total_sessions > 0 {
            dashboards_with_sessions += 1;
        }

        // Calculate sessions per month
        let sessions_per_month = if lookback > 0 {
            (metrics.total_sessions as f64 / lookback as f64) * 30.0
        } else {
            0.0
        };

        // Calculate days since last session
        let days_since_last = metrics.last_session.as_ref().and_then(|d| days_since(d));

        // Determine tiers
        let frequency_tier = get_frequency_tier(sessions_per_month, metrics.unique_users);
        let recency_tier = get_recency_tier(days_since_last);

        // Calculate health
        let health = calculate_dashboard_health(frequency_tier, recency_tier, &metrics);

        // Update summary
        match health.status.level.as_str() {
            "critical" => summary.critical += 1,
            "active" => summary.active += 1,
            "occasional" => summary.occasional += 1,
            "attention" => summary.attention += 1,
            "declining" => summary.declining += 1,
            "abandoned" => summary.abandoned += 1,
            "stale" => summary.stale += 1,
            "dead" => summary.dead += 1,
            "unused" => summary.unused += 1,
            _ => summary.errors += 1,
        }

        analyses.push(DashboardAnalysis {
            id: dashboard.id,
            name: dashboard.name.clone().unwrap_or_else(|| format!("Dashboard {}", dashboard.id)),
            category: dashboard.category.clone(),
            created_date: dashboard.created_date.clone(),
            updated_date: dashboard.updated_date.clone(),
            metrics: DashboardMetrics {
                total_sessions: metrics.total_sessions,
                unique_users: metrics.unique_users,
                total_page_views: metrics.total_page_views,
                days_with_activity: metrics.days_with_activity,
                sessions_per_month: (sessions_per_month * 10.0).round() / 10.0,
                first_session: metrics.first_session,
                last_session: metrics.last_session.clone(),
                days_since_last_session: days_since_last,
            },
            health,
        });
    }

    let timestamp = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let file_path = Path::new(global_path).join("dashboard-health-results.json");

    let result = DashboardHealthResult {
        domain: domain.clone(),
        global_path: global_path.clone(),
        timestamp,
        lookback_days: lookback,
        total_dashboards: dashboards.len(),
        dashboards_with_sessions,
        dashboards: analyses,
        summary,
        file_path: file_path.to_string_lossy().to_string(),
        duration_ms: start.elapsed().as_millis() as u64,
    };

    // Write results to file
    let output_value = serde_json::to_value(&result)
        .map_err(|e| format!("Failed to serialize dashboard health results: {}", e))?;
    write_json(&file_path.to_string_lossy(), &output_value)?;

    Ok(result)
}
