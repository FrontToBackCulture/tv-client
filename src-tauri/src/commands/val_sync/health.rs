// VAL Sync Health - Data model and workflow health checks
// Analyzes tables and workflows to score their health based on freshness, usage, and execution status

use super::config::get_domain_config;
use super::auth;
use super::sync::write_json;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::time::Instant;
use tauri::command;

// ============================================================================
// Constants
// ============================================================================

// Health score thresholds
const HEALTHY_THRESHOLD: i32 = 80;
const WARNING_THRESHOLD: i32 = 60;
const STALE_THRESHOLD: i32 = 40;

// Workflow-specific thresholds (slightly different)
const WORKFLOW_WARNING_THRESHOLD: i32 = 60;
const WORKFLOW_STALE_THRESHOLD: i32 = 30;

// Freshness thresholds (days)
const FRESHNESS_CRITICAL_DAYS: i64 = 60;
const FRESHNESS_STALE_DAYS: i64 = 30;
const FRESHNESS_WARNING_DAYS: i64 = 7;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthStatus {
    pub level: String,
    pub emoji: String,
    pub description: String,
}

impl HealthStatus {
    fn healthy() -> Self {
        Self {
            level: "healthy".to_string(),
            emoji: "🟢".to_string(),
            description: "Table is healthy and up to date".to_string(),
        }
    }
    fn warning() -> Self {
        Self {
            level: "warning".to_string(),
            emoji: "🟡".to_string(),
            description: "Table has minor issues".to_string(),
        }
    }
    fn stale() -> Self {
        Self {
            level: "stale".to_string(),
            emoji: "🟠".to_string(),
            description: "Table data is outdated".to_string(),
        }
    }
    fn critical() -> Self {
        Self {
            level: "critical".to_string(),
            emoji: "🔴".to_string(),
            description: "Table has critical issues".to_string(),
        }
    }
    fn skipped() -> Self {
        Self {
            level: "skipped".to_string(),
            emoji: "⚪".to_string(),
            description: "Not evaluated".to_string(),
        }
    }

    fn from_score(score: i32) -> Self {
        if score >= HEALTHY_THRESHOLD {
            Self::healthy()
        } else if score >= WARNING_THRESHOLD {
            Self::warning()
        } else if score >= STALE_THRESHOLD {
            Self::stale()
        } else {
            Self::critical()
        }
    }

    fn from_workflow_score(score: i32) -> Self {
        if score >= HEALTHY_THRESHOLD {
            Self::healthy()
        } else if score >= WORKFLOW_WARNING_THRESHOLD {
            Self::warning()
        } else if score >= WORKFLOW_STALE_THRESHOLD {
            Self::stale()
        } else {
            Self::critical()
        }
    }
}

// Health config structures
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthConfig {
    pub tables: HashMap<String, TableHealthConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableHealthConfig {
    #[serde(rename = "type")]
    pub table_type: String, // "static" or "transactional"
    #[serde(rename = "freshnessColumn")]
    pub freshness_column: Option<String>,
}

// Template generation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthConfigTemplate {
    #[serde(rename = "_instructions")]
    pub instructions: Vec<String>,
    pub tables: HashMap<String, TableConfigTemplate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableConfigTemplate {
    #[serde(rename = "_displayName")]
    pub display_name: String,
    #[serde(rename = "type")]
    pub table_type: String,
    #[serde(rename = "_availableDateColumns")]
    pub available_date_columns: Vec<String>,
    #[serde(rename = "freshnessColumn")]
    pub freshness_column: Option<String>,
}

// Table definition from synced data
#[derive(Debug, Clone, Deserialize)]
struct TableDefinition {
    id: Option<String>,
    name: Option<String>,
    #[serde(rename = "displayName")]
    display_name: Option<String>,
    columns: Option<Vec<ColumnDefinition>>,
}

#[derive(Debug, Clone, Deserialize)]
struct ColumnDefinition {
    name: Option<String>,
    #[serde(rename = "displayName")]
    display_name: Option<String>,
    #[serde(rename = "type")]
    column_type: Option<String>,
}

// All tables summary
#[derive(Debug, Clone, Deserialize)]
struct AllTablesEntry {
    id: Option<String>,
    name: Option<String>,
    #[serde(rename = "displayName")]
    display_name: Option<String>,
}

// Table health analysis result
#[derive(Debug, Clone, Serialize)]
pub struct TableHealthAnalysis {
    pub id: String,
    #[serde(rename = "tableName")]
    pub table_name: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    #[serde(rename = "tableType")]
    pub table_type: String,
    pub stats: TableStats,
    pub freshness: TableFreshness,
    pub dependencies: Vec<TableDependency>,
    pub health: HealthResult,
}

#[derive(Debug, Clone, Serialize)]
pub struct TableStats {
    #[serde(rename = "tableName")]
    pub table_name: String,
    #[serde(rename = "rowCount")]
    pub row_count: Option<i64>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TableFreshness {
    #[serde(rename = "tableName")]
    pub table_name: String,
    #[serde(rename = "dateColumn")]
    pub date_column: Option<String>,
    #[serde(rename = "maxDate")]
    pub max_date: Option<String>,
    #[serde(rename = "daysSinceUpdate")]
    pub days_since_update: Option<i64>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TableDependency {
    #[serde(rename = "type")]
    pub dep_type: String, // "workflow" or "query"
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct HealthResult {
    pub score: i32,
    pub status: HealthStatus,
    pub issues: Vec<String>,
}

// Domain health analysis result
#[derive(Debug, Clone, Serialize)]
pub struct DomainHealthAnalysis {
    pub domain: String,
    #[serde(rename = "globalPath")]
    pub global_path: String,
    pub timestamp: String,
    #[serde(rename = "totalTables")]
    pub total_tables: usize,
    #[serde(rename = "analyzedTables")]
    pub analyzed_tables: usize,
    #[serde(rename = "configuredTables")]
    pub configured_tables: usize,
    pub tables: Vec<TableHealthAnalysis>,
    pub summary: HealthSummary,
}

#[derive(Debug, Clone, Serialize)]
pub struct HealthSummary {
    pub healthy: usize,
    pub warning: usize,
    pub stale: usize,
    pub critical: usize,
    pub errors: usize,
    pub skipped: usize,
}

// Workflow health types
#[derive(Debug, Clone, Deserialize)]
struct WorkflowDefinition {
    id: Option<String>,
    name: Option<String>,
    #[serde(rename = "cronExpression")]
    cron_expression: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkflowHealthAnalysis {
    pub id: String,
    pub name: String,
    #[serde(rename = "cronExpression")]
    pub cron_expression: Option<String>,
    #[serde(rename = "isScheduled")]
    pub is_scheduled: bool,
    #[serde(rename = "lastSuccessfulRun")]
    pub last_successful_run: Option<String>,
    #[serde(rename = "daysSinceSuccess")]
    pub days_since_success: Option<i64>,
    #[serde(rename = "totalExecutions")]
    pub total_executions: usize,
    #[serde(rename = "successfulExecutions")]
    pub successful_executions: usize,
    pub health: HealthResult,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkflowDomainHealthAnalysis {
    pub domain: String,
    #[serde(rename = "globalPath")]
    pub global_path: String,
    pub timestamp: String,
    #[serde(rename = "lookbackDays")]
    pub lookback_days: i64,
    #[serde(rename = "totalWorkflows")]
    pub total_workflows: usize,
    #[serde(rename = "analyzedWorkflows")]
    pub analyzed_workflows: usize,
    #[serde(rename = "skippedWorkflows")]
    pub skipped_workflows: usize,
    pub workflows: Vec<WorkflowHealthAnalysis>,
    pub summary: HealthSummary,
}

// SQL API types
#[derive(Debug, Serialize)]
struct SqlQueryRequest {
    query: String,
}

#[derive(Debug, Deserialize)]
struct SqlQueryResponse {
    data: Option<Vec<serde_json::Value>>,
}

// Command results
#[derive(Debug, Serialize)]
pub struct HealthCheckResult {
    pub domain: String,
    #[serde(rename = "checkType")]
    pub check_type: String,
    pub file_path: String,
    pub duration_ms: u64,
    pub status: String,
    pub message: String,
    pub summary: HealthSummary,
}

#[derive(Debug, Serialize)]
pub struct GenerateConfigResult {
    pub domain: String,
    pub file_path: String,
    #[serde(rename = "tablesFound")]
    pub tables_found: usize,
    #[serde(rename = "tablesWithDateColumns")]
    pub tables_with_date_columns: usize,
    pub message: String,
}

// ============================================================================
// Helpers
// ============================================================================

fn is_date_type(col_type: &str) -> bool {
    let t = col_type.to_lowercase();
    t.contains("date") || t.contains("timestamp") || t.contains("time")
}

fn load_health_config(global_path: &str) -> Option<HealthConfig> {
    let path = Path::new(global_path).join("health-config.json");
    if !path.exists() {
        return None;
    }
    let content = fs::read_to_string(&path).ok()?;
    serde_json::from_str(&content).ok()
}

fn scan_table_definitions(global_path: &str) -> Result<Vec<(String, TableDefinition)>, String> {
    let data_models_path = Path::new(global_path).join("data_models");
    if !data_models_path.exists() {
        return Err(format!("data_models folder not found at {}", data_models_path.display()));
    }

    let mut tables = Vec::new();
    let entries = fs::read_dir(&data_models_path)
        .map_err(|e| format!("Failed to read data_models: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let folder_name = path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("");

            if folder_name.starts_with("table_") {
                let def_path = path.join("definition.json");
                if def_path.exists() {
                    if let Ok(content) = fs::read_to_string(&def_path) {
                        if let Ok(def) = serde_json::from_str::<TableDefinition>(&content) {
                            let table_name = def.name.clone().unwrap_or_else(|| folder_name.to_string());
                            tables.push((table_name, def));
                        }
                    }
                }
            }
        }
    }

    Ok(tables)
}

fn load_all_tables(global_path: &str) -> HashMap<String, String> {
    let path = Path::new(global_path).join("all_tables.json");
    let mut map = HashMap::new();

    if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(tables) = serde_json::from_str::<Vec<AllTablesEntry>>(&content) {
            for t in tables {
                if let (Some(name), Some(display)) = (t.name, t.display_name) {
                    map.insert(name, display);
                }
            }
        }
    }

    map
}

fn find_table_dependencies(global_path: &str, table_name: &str) -> Vec<TableDependency> {
    let mut deps = Vec::new();
    let table_lower = table_name.to_lowercase();

    // Scan workflows
    let workflows_path = Path::new(global_path).join("workflows");
    if workflows_path.exists() {
        if let Ok(entries) = fs::read_dir(&workflows_path) {
            for entry in entries.flatten() {
                let def_path = entry.path().join("definition.json");
                if def_path.exists() {
                    if let Ok(content) = fs::read_to_string(&def_path) {
                        let content_lower = content.to_lowercase();
                        if content_lower.contains(&table_lower) {
                            if let Ok(wf) = serde_json::from_str::<WorkflowDefinition>(&content) {
                                deps.push(TableDependency {
                                    dep_type: "workflow".to_string(),
                                    id: wf.id.unwrap_or_default(),
                                    name: wf.name.unwrap_or_default(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    // Scan queries
    let queries_path = Path::new(global_path).join("queries");
    if queries_path.exists() {
        if let Ok(entries) = fs::read_dir(&queries_path) {
            for entry in entries.flatten() {
                let def_path = entry.path().join("definition.json");
                if def_path.exists() {
                    if let Ok(content) = fs::read_to_string(&def_path) {
                        let content_lower = content.to_lowercase();
                        if content_lower.contains(&table_lower) {
                            if let Ok(q) = serde_json::from_str::<serde_json::Value>(&content) {
                                deps.push(TableDependency {
                                    dep_type: "query".to_string(),
                                    id: q.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                                    name: q.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    deps
}

fn calculate_table_health_score(
    stats: &TableStats,
    freshness: &TableFreshness,
    dependencies: &[TableDependency],
    table_type: &str,
) -> HealthResult {
    let mut score = 100i32;
    let mut issues = Vec::new();

    // Check for API errors
    if stats.error.is_some() {
        return HealthResult {
            score: 0,
            status: HealthStatus::critical(),
            issues: vec!["Table not accessible".to_string()],
        };
    }

    // Row count penalties
    match stats.row_count {
        Some(0) => {
            score -= 30;
            issues.push("Table is empty".to_string());
        }
        None => {
            score -= 15;
            issues.push("Could not determine row count".to_string());
        }
        _ => {}
    }

    // Freshness penalties (transactional only)
    if table_type == "transactional" {
        if let Some(days) = freshness.days_since_update {
            if days > FRESHNESS_CRITICAL_DAYS {
                score -= 40;
                issues.push(format!("Data is {} days old (>60 days)", days));
            } else if days > FRESHNESS_STALE_DAYS {
                score -= 20;
                issues.push(format!("Data is {} days old (>30 days)", days));
            } else if days > FRESHNESS_WARNING_DAYS {
                score -= 10;
                issues.push(format!("Data is {} days old (>7 days)", days));
            }
        } else if freshness.date_column.is_some() && freshness.error.is_none() {
            // Has date column configured but no data
            score -= 20;
            issues.push("No date data found".to_string());
        }
    }

    // Dependency penalties
    if dependencies.is_empty() {
        if table_type == "static" {
            score -= 5;
            issues.push("Not referenced by any workflow or query".to_string());
        } else {
            score -= 15;
            issues.push("Not referenced by any workflow or query".to_string());
        }
    }

    score = score.max(0);
    let status = HealthStatus::from_score(score);

    HealthResult {
        score,
        status,
        issues,
    }
}

fn calculate_workflow_health_score(
    is_scheduled: bool,
    days_since_success: Option<i64>,
    total_executions: usize,
) -> HealthResult {
    if !is_scheduled {
        return HealthResult {
            score: 0,
            status: HealthStatus::skipped(),
            issues: vec!["Non-scheduled workflow".to_string()],
        };
    }

    let mut issues = Vec::new();

    let score = match days_since_success {
        None => {
            if total_executions == 0 {
                issues.push("Never executed".to_string());
            } else {
                issues.push("Never completed successfully".to_string());
            }
            0
        }
        Some(days) if days > FRESHNESS_CRITICAL_DAYS => {
            issues.push(format!("Last success was {} days ago", days));
            10
        }
        Some(days) if days > FRESHNESS_STALE_DAYS => {
            issues.push(format!("Last success was {} days ago", days));
            40
        }
        Some(days) if days > FRESHNESS_WARNING_DAYS => {
            issues.push(format!("Last success was {} days ago", days));
            70
        }
        Some(_) => 100,
    };

    let status = if !is_scheduled {
        HealthStatus::skipped()
    } else {
        HealthStatus::from_workflow_score(score)
    };

    HealthResult {
        score,
        status,
        issues,
    }
}

async fn execute_sql_query(
    token: &str,
    domain: &str,
    sql: &str,
) -> Result<SqlQueryResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let url = format!("https://{}.thinkval.io/api/v1/query/data", domain);

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .query(&[("token", token)])
        .json(&SqlQueryRequest { query: sql.to_string() })
        .send()
        .await
        .map_err(|e| format!("SQL query failed: {}", e))?;

    if !response.status().is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("SQL error: {}", body));
    }

    response
        .json()
        .await
        .map_err(|e| format!("Failed to parse SQL response: {}", e))
}

async fn get_table_row_count(
    token: &str,
    domain: &str,
    table_name: &str,
) -> TableStats {
    let sql = format!("SELECT COUNT(*) as row_count FROM {}", table_name);

    match execute_sql_query(token, domain, &sql).await {
        Ok(resp) => {
            let row_count = resp.data
                .and_then(|d| d.first().cloned())
                .and_then(|row| row.get("row_count").cloned())
                .and_then(|v| v.as_i64());

            TableStats {
                table_name: table_name.to_string(),
                row_count,
                error: None,
            }
        }
        Err(e) => TableStats {
            table_name: table_name.to_string(),
            row_count: None,
            error: Some(e),
        },
    }
}

async fn get_table_freshness(
    token: &str,
    domain: &str,
    table_name: &str,
    date_column: Option<&str>,
) -> TableFreshness {
    let date_col = match date_column {
        Some(col) => col,
        None => {
            return TableFreshness {
                table_name: table_name.to_string(),
                date_column: None,
                max_date: None,
                days_since_update: None,
                error: None,
            };
        }
    };

    let sql = format!("SELECT MAX({}) as max_date FROM {}", date_col, table_name);

    match execute_sql_query(token, domain, &sql).await {
        Ok(resp) => {
            let max_date = resp.data
                .and_then(|d| d.first().cloned())
                .and_then(|row| row.get("max_date").cloned())
                .and_then(|v| v.as_str().map(|s| s.to_string()));

            let days_since = max_date.as_ref().and_then(|d| {
                chrono::NaiveDate::parse_from_str(&d[..10], "%Y-%m-%d")
                    .ok()
                    .map(|date| {
                        let today = chrono::Local::now().date_naive();
                        (today - date).num_days()
                    })
            });

            TableFreshness {
                table_name: table_name.to_string(),
                date_column: Some(date_col.to_string()),
                max_date,
                days_since_update: days_since,
                error: None,
            }
        }
        Err(e) => TableFreshness {
            table_name: table_name.to_string(),
            date_column: Some(date_col.to_string()),
            max_date: None,
            days_since_update: None,
            error: Some(e),
        },
    }
}

// ============================================================================
// Commands
// ============================================================================

/// Generate health config template by scanning table definitions
#[command]
pub async fn val_generate_health_config(domain: String) -> Result<GenerateConfigResult, String> {
    let domain_config = get_domain_config(&domain)?;
    let global_path = &domain_config.global_path;

    // Scan table definitions
    let tables = scan_table_definitions(global_path)?;
    let display_names = load_all_tables(global_path);

    let mut template_tables = HashMap::new();
    let mut tables_with_date_cols = 0;

    for (table_name, def) in &tables {
        let columns = def.columns.as_ref().map(|c| c.as_slice()).unwrap_or(&[]);

        // Find date columns
        let date_columns: Vec<String> = columns
            .iter()
            .filter(|c| {
                c.column_type
                    .as_ref()
                    .map(|t| is_date_type(t))
                    .unwrap_or(false)
            })
            .filter_map(|c| c.name.clone())
            .collect();

        if !date_columns.is_empty() {
            tables_with_date_cols += 1;
        }

        let display_name = display_names
            .get(table_name)
            .cloned()
            .or_else(|| def.display_name.clone())
            .unwrap_or_else(|| table_name.clone());

        // Default: first date column if available, transactional if has date columns
        let (default_type, default_col) = if date_columns.is_empty() {
            ("static".to_string(), None)
        } else {
            ("transactional".to_string(), Some(date_columns[0].clone()))
        };

        template_tables.insert(
            table_name.clone(),
            TableConfigTemplate {
                display_name,
                table_type: default_type,
                available_date_columns: date_columns,
                freshness_column: default_col,
            },
        );
    }

    let template = HealthConfigTemplate {
        instructions: vec![
            "Edit this file to configure health checks for each table.".to_string(),
            "Set 'type' to 'static' for reference/master tables, 'transactional' for regular data.".to_string(),
            "Set 'freshnessColumn' to the date column to use for freshness checks (or null for static tables).".to_string(),
            "Rename this file to 'health-config.json' when done.".to_string(),
        ],
        tables: template_tables,
    };

    let file_path = Path::new(global_path).join("health-config.template.json");
    let content = serde_json::to_string_pretty(&template)
        .map_err(|e| format!("Failed to serialize template: {}", e))?;

    fs::write(&file_path, content)
        .map_err(|e| format!("Failed to write template: {}", e))?;

    Ok(GenerateConfigResult {
        domain,
        file_path: file_path.to_string_lossy().to_string(),
        tables_found: tables.len(),
        tables_with_date_columns: tables_with_date_cols,
        message: format!(
            "Generated template with {} tables ({} have date columns)",
            tables.len(),
            tables_with_date_cols
        ),
    })
}

/// Run data model health check
#[command]
pub async fn val_run_data_model_health(
    domain: String,
    skip_freshness: bool,
    skip_dependencies: bool,
    limit: Option<usize>,
) -> Result<HealthCheckResult, String> {
    let start = Instant::now();
    let domain_config = get_domain_config(&domain)?;
    let global_path = &domain_config.global_path;
    let api_domain = domain_config.api_domain();

    // Ensure auth
    let (token, _) = auth::ensure_auth(&domain).await?;

    // Load health config (requires AI-curated health-config.json)
    let health_config = load_health_config(global_path);
    let config_tables = health_config
        .as_ref()
        .map(|c| &c.tables)
        .cloned()
        .unwrap_or_default();

    // Scan tables
    let mut tables = scan_table_definitions(global_path)?;
    let display_names = load_all_tables(global_path);

    // Apply limit if specified
    if let Some(lim) = limit {
        if lim > 0 && lim < tables.len() {
            tables.truncate(lim);
        }
    }

    let total_tables = tables.len();
    let mut analyses = Vec::new();
    let mut summary = HealthSummary {
        healthy: 0,
        warning: 0,
        stale: 0,
        critical: 0,
        errors: 0,
        skipped: 0,
    };

    for (table_name, def) in &tables {
        // Get table config
        let table_config = config_tables.get(table_name);
        let table_type = table_config
            .map(|c| c.table_type.clone())
            .unwrap_or_else(|| "transactional".to_string());
        let freshness_column = table_config.and_then(|c| c.freshness_column.clone());

        // Get stats
        let stats = get_table_row_count(&token, api_domain, table_name).await;

        // Get freshness (skip if requested or static table)
        let freshness = if skip_freshness || table_type == "static" {
            TableFreshness {
                table_name: table_name.clone(),
                date_column: freshness_column,
                max_date: None,
                days_since_update: None,
                error: None,
            }
        } else {
            get_table_freshness(&token, api_domain, table_name, freshness_column.as_deref()).await
        };

        // Get dependencies
        let dependencies = if skip_dependencies {
            Vec::new()
        } else {
            find_table_dependencies(global_path, table_name)
        };

        // Calculate health
        let health = calculate_table_health_score(&stats, &freshness, &dependencies, &table_type);

        // Update summary
        match health.status.level.as_str() {
            "healthy" => summary.healthy += 1,
            "warning" => summary.warning += 1,
            "stale" => summary.stale += 1,
            "critical" => summary.critical += 1,
            _ => summary.errors += 1,
        }

        let display_name = display_names
            .get(table_name)
            .cloned()
            .or_else(|| def.display_name.clone())
            .unwrap_or_else(|| table_name.clone());

        analyses.push(TableHealthAnalysis {
            id: def.id.clone().unwrap_or_default(),
            table_name: table_name.clone(),
            display_name,
            table_type,
            stats,
            freshness,
            dependencies,
            health,
        });
    }

    let result = DomainHealthAnalysis {
        domain: domain.clone(),
        global_path: global_path.clone(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        total_tables,
        analyzed_tables: analyses.len(),
        configured_tables: config_tables.len(),
        tables: analyses,
        summary: summary.clone(),
    };

    // Write output
    let output_path = Path::new(global_path).join("data-model-health.json");
    let output_value = serde_json::to_value(&result)
        .map_err(|e| format!("Failed to serialize result: {}", e))?;
    write_json(&output_path.to_string_lossy(), &output_value)?;

    let duration_ms = start.elapsed().as_millis() as u64;

    Ok(HealthCheckResult {
        domain,
        check_type: "data-model".to_string(),
        file_path: output_path.to_string_lossy().to_string(),
        duration_ms,
        status: "ok".to_string(),
        message: format!(
            "Analyzed {} tables: {} healthy, {} warning, {} stale, {} critical",
            total_tables, summary.healthy, summary.warning, summary.stale, summary.critical
        ),
        summary,
    })
}

/// Run workflow health check
#[command]
pub async fn val_run_workflow_health(
    domain: String,
    lookback_days: Option<i64>,
) -> Result<HealthCheckResult, String> {
    let start = Instant::now();
    let domain_config = get_domain_config(&domain)?;
    let global_path = &domain_config.global_path;

    let days = lookback_days.unwrap_or(60);

    // Load synced workflows
    let all_workflows_path = Path::new(global_path).join("all_workflows.json");
    if !all_workflows_path.exists() {
        return Err("all_workflows.json not found. Run sync first.".to_string());
    }

    let workflows_content = fs::read_to_string(&all_workflows_path)
        .map_err(|e| format!("Failed to read all_workflows.json: {}", e))?;
    let workflows: Vec<WorkflowDefinition> = serde_json::from_str(&workflows_content)
        .map_err(|e| format!("Failed to parse all_workflows.json: {}", e))?;

    // Load synced execution data if available
    let monitoring_path = Path::new(global_path).join("monitoring");
    let mut execution_data: HashMap<String, Vec<serde_json::Value>> = HashMap::new();

    // Try to load recent workflow execution files
    if monitoring_path.exists() {
        if let Ok(entries) = fs::read_dir(&monitoring_path) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    // Look for workflow_executions_*.json files
                    if let Ok(files) = fs::read_dir(entry.path()) {
                        for file in files.flatten() {
                            let fname = file.file_name().to_string_lossy().to_string();
                            if fname.starts_with("workflow_executions_") && fname.ends_with(".json") {
                                if let Ok(content) = fs::read_to_string(file.path()) {
                                    if let Ok(data) = serde_json::from_str::<serde_json::Value>(&content) {
                                        if let Some(executions) = data.get("executions").and_then(|e| e.as_array()) {
                                            for exec in executions {
                                                if let Some(wf_id) = exec.get("workflow_id").and_then(|v| v.as_str()) {
                                                    execution_data
                                                        .entry(wf_id.to_string())
                                                        .or_default()
                                                        .push(exec.clone());
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Find scheduled workflow IDs (for child workflow detection)
    let scheduled_workflow_ids: HashSet<String> = workflows
        .iter()
        .filter(|w| w.cron_expression.is_some())
        .filter_map(|w| w.id.clone())
        .collect();

    let total_workflows = workflows.len();
    let mut analyses = Vec::new();
    let mut summary = HealthSummary {
        healthy: 0,
        warning: 0,
        stale: 0,
        critical: 0,
        errors: 0,
        skipped: 0,
    };

    let cutoff_date = chrono::Local::now() - chrono::Duration::days(days);

    for wf in &workflows {
        let wf_id = wf.id.clone().unwrap_or_default();
        let wf_name = wf.name.clone().unwrap_or_default();
        let is_scheduled = wf.cron_expression.is_some();

        // Get executions for this workflow
        let executions = execution_data.get(&wf_id).cloned().unwrap_or_default();
        let total_executions = executions.len();

        // Find successful executions
        let successful_executions: Vec<_> = executions
            .iter()
            .filter(|e| {
                e.get("status")
                    .and_then(|s| s.as_str())
                    .map(|s| s == "completed" || s == "success")
                    .unwrap_or(false)
            })
            .collect();

        // Find last successful run
        let last_successful_run = successful_executions
            .iter()
            .filter_map(|e| e.get("completed_at").and_then(|v| v.as_str()))
            .max()
            .map(|s| s.to_string());

        // Calculate days since success
        let days_since_success = last_successful_run.as_ref().and_then(|d| {
            chrono::DateTime::parse_from_rfc3339(d)
                .ok()
                .or_else(|| {
                    chrono::NaiveDateTime::parse_from_str(&d[..19], "%Y-%m-%dT%H:%M:%S")
                        .ok()
                        .map(|dt| dt.and_utc().fixed_offset())
                })
                .map(|dt| (chrono::Local::now().signed_duration_since(dt)).num_days())
        });

        // Calculate health
        let health = calculate_workflow_health_score(
            is_scheduled,
            days_since_success,
            total_executions,
        );

        // Update summary
        match health.status.level.as_str() {
            "healthy" => summary.healthy += 1,
            "warning" => summary.warning += 1,
            "stale" => summary.stale += 1,
            "critical" => summary.critical += 1,
            "skipped" => summary.skipped += 1,
            _ => summary.errors += 1,
        }

        analyses.push(WorkflowHealthAnalysis {
            id: wf_id,
            name: wf_name,
            cron_expression: wf.cron_expression.clone(),
            is_scheduled,
            last_successful_run,
            days_since_success,
            total_executions,
            successful_executions: successful_executions.len(),
            health,
        });
    }

    let result = WorkflowDomainHealthAnalysis {
        domain: domain.clone(),
        global_path: global_path.clone(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        lookback_days: days,
        total_workflows,
        analyzed_workflows: total_workflows - summary.skipped,
        skipped_workflows: summary.skipped,
        workflows: analyses,
        summary: summary.clone(),
    };

    // Write output
    let output_path = Path::new(global_path).join("workflow-health.json");
    let output_value = serde_json::to_value(&result)
        .map_err(|e| format!("Failed to serialize result: {}", e))?;
    write_json(&output_path.to_string_lossy(), &output_value)?;

    let duration_ms = start.elapsed().as_millis() as u64;

    Ok(HealthCheckResult {
        domain,
        check_type: "workflow".to_string(),
        file_path: output_path.to_string_lossy().to_string(),
        duration_ms,
        status: "ok".to_string(),
        message: format!(
            "Analyzed {} workflows ({} scheduled): {} healthy, {} warning, {} stale, {} critical",
            total_workflows,
            total_workflows - summary.skipped,
            summary.healthy,
            summary.warning,
            summary.stale,
            summary.critical
        ),
        summary,
    })
}
