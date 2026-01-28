// VAL Sync Query Health - Analyze query health based on dashboard usage
// Queries are scored based on the health of dashboards that use them

use super::config::get_domain_config;
use super::sync::write_json;
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
pub struct QueryHealthStatus {
    pub level: String,
    pub description: String,
}

impl QueryHealthStatus {
    fn essential() -> Self {
        Self {
            level: "essential".to_string(),
            description: "Used in critical/active dashboards".to_string(),
        }
    }
    fn active() -> Self {
        Self {
            level: "active".to_string(),
            description: "Used in dashboards that need attention".to_string(),
        }
    }
    fn at_risk() -> Self {
        Self {
            level: "at_risk".to_string(),
            description: "Only used in unhealthy dashboards".to_string(),
        }
    }
    fn orphaned() -> Self {
        Self {
            level: "orphaned".to_string(),
            description: "Only used in unused dashboards".to_string(),
        }
    }
    fn standalone() -> Self {
        Self {
            level: "standalone".to_string(),
            description: "Not referenced in dashboards (may be API-used)".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryHealth {
    pub score: Option<i32>,
    pub status: QueryHealthStatus,
    pub issues: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardReference {
    pub id: i64,
    pub name: String,
    pub category: Option<String>,
    pub widget_type: String,
    pub health: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryAnalysis {
    pub id: i64,
    pub name: String,
    #[serde(rename = "type")]
    pub query_type: Option<String>,
    pub created_date: Option<String>,
    pub updated_date: Option<String>,
    pub dashboard_count: usize,
    pub dashboards: Vec<DashboardReference>,
    pub health: QueryHealth,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryHealthSummary {
    pub essential: usize,
    pub active: usize,
    pub at_risk: usize,
    pub orphaned: usize,
    pub standalone: usize,
    pub errors: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryHealthResult {
    pub domain: String,
    pub global_path: String,
    pub timestamp: String,
    pub total_queries: usize,
    pub queries_in_dashboards: usize,
    pub standalone_queries: usize,
    pub has_dashboard_health: bool,
    pub queries: Vec<QueryAnalysis>,
    pub summary: QueryHealthSummary,
    pub file_path: String,
    pub duration_ms: u64,
}

// ============================================================================
// Helper types for parsing
// ============================================================================

#[derive(Debug, Deserialize)]
struct Query {
    id: i64,
    name: Option<String>,
    description: Option<String>,
    #[serde(rename = "type")]
    query_type: Option<String>,
    created_date: Option<String>,
    updated_date: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Dashboard {
    id: i64,
    name: Option<String>,
    category: Option<String>,
    widgets: Option<Vec<Widget>>,
}

#[derive(Debug, Deserialize)]
struct Widget {
    #[serde(rename = "type")]
    widget_type: Option<String>,
    settings: Option<WidgetSettings>,
}

#[derive(Debug, Deserialize)]
struct WidgetSettings {
    datasource: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct DashboardHealthEntry {
    id: i64,
    health: Option<DashboardHealthInfo>,
}

#[derive(Debug, Deserialize)]
struct DashboardHealthInfo {
    status: Option<DashboardHealthStatusInfo>,
}

#[derive(Debug, Deserialize)]
struct DashboardHealthStatusInfo {
    level: Option<String>,
}

// ============================================================================
// Helper functions
// ============================================================================

fn load_queries(global_path: &str) -> Result<Vec<Query>, String> {
    let path = Path::new(global_path).join("all_queries.json");
    if !path.exists() {
        return Err(format!("Queries file not found: {:?}. Run sync first.", path));
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read queries: {}", e))?;

    let data: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse queries JSON: {}", e))?;

    // Handle both array and { data: [...] } formats
    let items = if let Some(arr) = data.as_array() {
        arr.clone()
    } else if let Some(data_arr) = data.get("data").and_then(|d| d.as_array()) {
        data_arr.clone()
    } else {
        return Err("Invalid queries JSON format".to_string());
    };

    let queries: Vec<Query> = items
        .into_iter()
        .filter_map(|v| serde_json::from_value(v).ok())
        .collect();

    Ok(queries)
}

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

fn load_dashboard_health(global_path: &str) -> HashMap<i64, String> {
    let path = Path::new(global_path).join("dashboard-health-results.json");
    let mut health_map = HashMap::new();

    if !path.exists() {
        return health_map;
    }

    if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(data) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(dashboards) = data.get("dashboards").and_then(|d| d.as_array()) {
                for dashboard in dashboards {
                    if let Ok(entry) = serde_json::from_value::<DashboardHealthEntry>(dashboard.clone()) {
                        let level = entry.health
                            .and_then(|h| h.status)
                            .and_then(|s| s.level)
                            .unwrap_or_else(|| "unknown".to_string());
                        health_map.insert(entry.id, level);
                    }
                }
            }
        }
    }

    health_map
}

/// Extract query references from dashboard widgets
fn extract_query_references(dashboard: &Dashboard) -> Vec<(i64, String)> {
    let mut refs = vec![];

    if let Some(widgets) = &dashboard.widgets {
        for widget in widgets {
            let widget_type = widget.widget_type.clone().unwrap_or_else(|| "unknown".to_string());

            if let Some(settings) = &widget.settings {
                if let Some(datasource) = &settings.datasource {
                    if let Some(ds_obj) = datasource.as_object() {
                        for (_key, value) in ds_obj {
                            if let Some(dsid) = value.get("dsid") {
                                let query_id = if let Some(n) = dsid.as_i64() {
                                    n
                                } else if let Some(s) = dsid.as_str() {
                                    s.parse().unwrap_or(0)
                                } else {
                                    continue;
                                };
                                if query_id > 0 {
                                    refs.push((query_id, widget_type.clone()));
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    refs
}

/// Build query -> dashboard mapping
fn build_query_dashboard_map(dashboards: &[Dashboard]) -> HashMap<i64, Vec<(i64, String, Option<String>, String)>> {
    let mut map: HashMap<i64, Vec<(i64, String, Option<String>, String)>> = HashMap::new();

    for dashboard in dashboards {
        let refs = extract_query_references(dashboard);
        for (query_id, widget_type) in refs {
            map.entry(query_id).or_default().push((
                dashboard.id,
                dashboard.name.clone().unwrap_or_else(|| format!("Dashboard {}", dashboard.id)),
                dashboard.category.clone(),
                widget_type,
            ));
        }
    }

    map
}

/// Calculate query health based on dashboard health levels
fn calculate_query_health(dashboard_health_levels: &[String]) -> QueryHealth {
    if dashboard_health_levels.is_empty() {
        return QueryHealth {
            score: None,
            status: QueryHealthStatus::standalone(),
            issues: vec!["Not referenced in any dashboard".to_string()],
        };
    }

    let mut health_counts: HashMap<&str, usize> = HashMap::new();
    for level in dashboard_health_levels {
        *health_counts.entry(level.as_str()).or_insert(0) += 1;
    }

    let healthy_count = health_counts.get("critical").unwrap_or(&0)
        + health_counts.get("active").unwrap_or(&0)
        + health_counts.get("occasional").unwrap_or(&0);
    let attention_count = *health_counts.get("attention").unwrap_or(&0);
    let declining_count = health_counts.get("declining").unwrap_or(&0)
        + health_counts.get("abandoned").unwrap_or(&0);
    let unhealthy_count = health_counts.get("stale").unwrap_or(&0)
        + health_counts.get("dead").unwrap_or(&0);
    let unused_count = *health_counts.get("unused").unwrap_or(&0);

    let mut issues = vec![];

    if healthy_count > 0 {
        if let Some(&c) = health_counts.get("critical") {
            if c > 0 {
                issues.push(format!("Used in {} critical dashboard(s)", c));
            }
        }
        if let Some(&c) = health_counts.get("active") {
            if c > 0 {
                issues.push(format!("Used in {} active dashboard(s)", c));
            }
        }
        return QueryHealth {
            score: Some(100),
            status: QueryHealthStatus::essential(),
            issues,
        };
    }

    if attention_count > 0 {
        issues.push(format!("Used in {} dashboard(s) needing attention", attention_count));
        return QueryHealth {
            score: Some(70),
            status: QueryHealthStatus::active(),
            issues,
        };
    }

    if declining_count > 0 {
        issues.push(format!("Only used in {} declining/abandoned dashboard(s)", declining_count));
        return QueryHealth {
            score: Some(40),
            status: QueryHealthStatus::at_risk(),
            issues,
        };
    }

    if unhealthy_count > 0 {
        issues.push(format!("Only used in {} stale/dead dashboard(s)", unhealthy_count));
        return QueryHealth {
            score: Some(20),
            status: QueryHealthStatus::at_risk(),
            issues,
        };
    }

    if unused_count > 0 {
        issues.push(format!("Only used in {} unused dashboard(s)", unused_count));
        return QueryHealth {
            score: Some(10),
            status: QueryHealthStatus::orphaned(),
            issues,
        };
    }

    QueryHealth {
        score: Some(50),
        status: QueryHealthStatus::standalone(),
        issues: vec!["Dashboard health unknown".to_string()],
    }
}

// ============================================================================
// Commands
// ============================================================================

/// Run query health analysis for a domain
#[command]
pub async fn val_run_query_health(domain: String) -> Result<QueryHealthResult, String> {
    let start = Instant::now();
    let domain_config = get_domain_config(&domain)?;
    let global_path = &domain_config.global_path;

    // Load data
    let queries = load_queries(global_path)?;
    let dashboards = load_dashboards(global_path)?;
    let dashboard_health_map = load_dashboard_health(global_path);
    let has_dashboard_health = !dashboard_health_map.is_empty();

    // Build query -> dashboard mapping
    let query_dashboard_map = build_query_dashboard_map(&dashboards);

    // Analyze each query
    let mut query_analyses = vec![];
    let mut summary = QueryHealthSummary {
        essential: 0,
        active: 0,
        at_risk: 0,
        orphaned: 0,
        standalone: 0,
        errors: 0,
    };
    let mut queries_in_dashboards = 0;
    let mut standalone_queries = 0;

    for query in &queries {
        let dashboard_refs = query_dashboard_map.get(&query.id);
        let dashboard_count = dashboard_refs.map(|r| r.len()).unwrap_or(0);

        if dashboard_count > 0 {
            queries_in_dashboards += 1;
        } else {
            standalone_queries += 1;
        }

        // Get dashboard health levels for this query
        let dashboard_health_levels: Vec<String> = dashboard_refs
            .map(|refs| {
                refs.iter()
                    .filter_map(|(dash_id, _, _, _)| dashboard_health_map.get(dash_id).cloned())
                    .collect()
            })
            .unwrap_or_default();

        // Calculate query health
        let health = calculate_query_health(&dashboard_health_levels);

        // Update summary
        match health.status.level.as_str() {
            "essential" => summary.essential += 1,
            "active" => summary.active += 1,
            "at_risk" => summary.at_risk += 1,
            "orphaned" => summary.orphaned += 1,
            "standalone" => summary.standalone += 1,
            _ => summary.errors += 1,
        }

        // Build dashboard references
        let dashboard_details: Vec<DashboardReference> = dashboard_refs
            .map(|refs| {
                refs.iter()
                    .map(|(dash_id, name, category, widget_type)| {
                        let health_level = dashboard_health_map
                            .get(dash_id)
                            .cloned()
                            .unwrap_or_else(|| "unknown".to_string());
                        DashboardReference {
                            id: *dash_id,
                            name: name.clone(),
                            category: category.clone(),
                            widget_type: widget_type.clone(),
                            health: health_level,
                        }
                    })
                    .collect()
            })
            .unwrap_or_default();

        query_analyses.push(QueryAnalysis {
            id: query.id,
            name: query.name.clone()
                .or_else(|| query.description.clone())
                .unwrap_or_else(|| format!("Query {}", query.id)),
            query_type: query.query_type.clone(),
            created_date: query.created_date.clone(),
            updated_date: query.updated_date.clone(),
            dashboard_count,
            dashboards: dashboard_details,
            health,
        });
    }

    let timestamp = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let file_path = Path::new(global_path).join("query-health-results.json");

    let result = QueryHealthResult {
        domain: domain.clone(),
        global_path: global_path.clone(),
        timestamp,
        total_queries: queries.len(),
        queries_in_dashboards,
        standalone_queries,
        has_dashboard_health,
        queries: query_analyses,
        summary,
        file_path: file_path.to_string_lossy().to_string(),
        duration_ms: start.elapsed().as_millis() as u64,
    };

    // Write results to file
    let output_value = serde_json::to_value(&result)
        .map_err(|e| format!("Failed to serialize query health results: {}", e))?;
    write_json(&file_path.to_string_lossy(), &output_value)?;

    Ok(result)
}
