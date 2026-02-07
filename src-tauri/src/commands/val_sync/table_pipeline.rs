// VAL Sync Table Pipeline - Generate table documentation (overview.md)
// Ported from tv-tools/mcp-server table pipeline
//
// 5-step pipeline:
// 1. prepare-table-overview → definition_details.json
// 2. sample-table-data → definition_sample.json
// 3. analyze-table-data → definition_analysis.json (AI via Claude)
// 4. extract-table-calc-fields → definition_calculated_fields.json
// 5. generate-table-overview → overview.md

use super::config::get_domain_config;
use super::sql::val_execute_sql;
use crate::commands::settings;
use crate::AppState;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use tauri::{command, State};

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Serialize)]
pub struct TablePipelineResult {
    pub domain: String,
    pub table_name: String,
    pub step: String,
    pub status: String,
    pub file_path: Option<String>,
    pub message: String,
    pub duration_ms: u64,
}

#[derive(Debug, Serialize)]
pub struct PipelineRunResult {
    pub domain: String,
    pub tables_processed: usize,
    pub tables_skipped: usize,
    pub tables_errored: usize,
    pub results: Vec<TablePipelineStepResult>,
    pub total_duration_ms: u64,
}

#[derive(Debug, Serialize)]
pub struct TablePipelineStepResult {
    pub table_name: String,
    pub status: String,
    pub steps: HashMap<String, String>,
    pub error: Option<String>,
    pub output_folder: Option<String>,
    pub output_files: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct AllTablesNode {
    #[serde(rename = "type")]
    node_type: Option<String>,
    name: Option<String>,
    table_name: Option<String>,
    #[serde(rename = "spaceName")]
    space_name: Option<String>,
    #[serde(rename = "zoneName")]
    zone_name: Option<String>,
    children: Option<Vec<AllTablesNode>>,
}

#[derive(Debug, Clone)]
struct TableMeta {
    display_name: String,
    space: String,
    zone: String,
    _path: String,
}

#[derive(Debug, Deserialize)]
struct HealthCheckResults {
    tables: Option<Vec<TableHealthEntry>>,
}

#[derive(Debug, Deserialize)]
struct TableHealthEntry {
    #[serde(rename = "tableName")]
    table_name: String,
    #[serde(rename = "tableType")]
    table_type: Option<String>,
    stats: Option<TableStats>,
    freshness: Option<TableFreshness>,
    health: Option<HealthInfo>,
    #[serde(rename = "rowCreatedDate")]
    row_created_date: Option<RowCreatedDate>,
    dependencies: Option<Vec<Dependency>>,
}

#[derive(Debug, Deserialize)]
struct TableStats {
    #[serde(rename = "rowCount")]
    row_count: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct TableFreshness {
    #[serde(rename = "dateColumn")]
    date_column: Option<String>,
    #[serde(rename = "daysSinceUpdate")]
    days_since_update: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct HealthInfo {
    score: Option<i32>,
    status: Option<HealthStatus>,
    issues: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct HealthStatus {
    description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RowCreatedDate {
    #[serde(rename = "daysSinceInsert")]
    days_since_insert: Option<i64>,
}

#[derive(Debug, Deserialize, Clone)]
struct Dependency {
    #[serde(rename = "type")]
    dep_type: Option<String>,
    id: Option<Value>,
    name: Option<String>,
}

// ============================================================================
// Dependency Scanning Types
// ============================================================================

#[derive(Debug, Deserialize)]
struct AllWorkflowsFile {
    data: Option<Vec<WorkflowEntry>>,
}

#[derive(Debug, Deserialize)]
struct WorkflowEntry {
    id: Option<i64>,
    name: Option<String>,
    cron_expression: Option<String>,
    latest_run_status: Option<String>,
    run_started_at: Option<String>,
    run_completed_at: Option<String>,
    updated_date: Option<String>,
    data: Option<WorkflowData>,
}

#[derive(Debug, Deserialize)]
struct WorkflowData {
    workflow: Option<WorkflowPlugins>,
}

#[derive(Debug, Deserialize)]
struct WorkflowPlugins {
    plugins: Option<Vec<WorkflowPlugin>>,
}

#[derive(Debug, Deserialize)]
struct WorkflowPlugin {
    name: Option<String>,
    params: Option<WorkflowPluginParams>,
}

#[derive(Debug, Deserialize)]
struct WorkflowPluginParams {
    source_tables: Option<Vec<String>>,
    target: Option<WorkflowPluginTarget>,
    workflow_id: Option<Value>, // Can be single ID or array of IDs
}

#[derive(Debug, Deserialize)]
struct WorkflowPluginTarget {
    table: Option<String>,
}

#[derive(Debug, Deserialize)]
struct QueryEntry {
    id: Option<i64>,
    name: Option<String>,
    updated_date: Option<String>,
    datasource: Option<QueryDatasource>,
}

#[derive(Debug, Deserialize)]
struct QueryDatasource {
    dsid: Option<Value>, // Can be i64 or empty string ""
    #[serde(rename = "queryInfo")]
    query_info: Option<QueryInfo>,
}

#[derive(Debug, Deserialize)]
struct QueryInfo {
    #[serde(rename = "tableInfo")]
    table_info: Option<Value>, // Use Value since tableInfo has mixed keys (numeric + named)
}

#[derive(Debug, Deserialize)]
struct DashboardEntry {
    id: Option<i64>,
    name: Option<String>,
    updated_date: Option<String>,
    widgets: Option<Value>, // Can be array or empty object {}
}

#[derive(Debug, Deserialize)]
struct DashboardWidget {
    settings: Option<DashboardWidgetSettings>,
}

#[derive(Debug, Deserialize)]
struct DashboardWidgetSettings {
    datasource: Option<Value>, // Complex structure, we'll parse manually
}

// ============================================================================
// Column Definition Types
// ============================================================================

#[derive(Debug, Deserialize)]
struct ColumnDef {
    name: Option<String>,
    column_name: Option<String>,
    #[serde(rename = "type")]
    col_type: Option<String>,
    raw_data_type: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CalcFieldEntry {
    temp_id: Option<String>,
    id: Option<String>,
    db_column_name: Option<String>,
    settings: Option<CalcFieldSettings>,
}

#[derive(Debug, Deserialize)]
struct CalcFieldSettings {
    #[serde(rename = "ruleField")]
    rule_field: Option<RuleField>,
    data_type: Option<String>,
    db_column_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RuleField {
    name: Option<String>,
    #[serde(rename = "type")]
    rule_type: Option<String>,
    rules: Option<Value>,
    formula: Option<String>,
}

#[derive(Debug, Deserialize)]
struct WorkflowDef {
    id: Option<Value>,
    name: Option<String>,
    description: Option<String>,
    tags: Option<Vec<String>>,
    target: Option<WorkflowTarget>,
    source_tables: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct WorkflowTarget {
    table: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    content: Vec<ContentBlock>,
}

#[derive(Debug, Deserialize)]
struct ContentBlock {
    text: Option<String>,
}

// ============================================================================
// Constants
// ============================================================================

const SYSTEM_COLUMNS: &[&str] = &[
    "seq_id",
    "created_date",
    "created_by",
    "updated_date",
    "updated_by",
    "uploaded_date",
    "uploaded_by",
    "linkage",
    "general_record_id",
];

const STANDARD_DATA_TYPES: &[&str] = &[
    "Receipt",
    "Receipt Line Item",
    "Payment",
    "Points / Loyalty",
    "Outlet Definition",
    "Outlet Mapping",
    "Product Master",
    "Customer Master",
    "Employee / Staff",
    "Inventory",
    "GL Entry / Journal",
    "Reconciliation",
    "Report / Aggregate",
    "Configuration / Settings",
    "Workflow Output",
    "Event / Booking",
    "Order",
    "Order Line Item",
    "Delivery",
    "Other",
];

// ============================================================================
// Helpers
// ============================================================================

fn load_json_file<T: for<'de> Deserialize<'de>>(path: &Path) -> Option<T> {
    fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
}

fn traverse_all_tables(
    nodes: &[AllTablesNode],
    space_name: &str,
    zone_name: &str,
    result: &mut HashMap<String, TableMeta>,
) {
    for node in nodes {
        let node_type = node.node_type.as_deref().unwrap_or("");

        match node_type {
            "project" => {
                if let Some(ref children) = node.children {
                    let new_space = node.name.as_deref().unwrap_or(space_name);
                    traverse_all_tables(children, new_space, "", result);
                }
            }
            "phase" => {
                if let Some(ref children) = node.children {
                    let new_zone = node.name.as_deref().unwrap_or(zone_name);
                    traverse_all_tables(children, space_name, new_zone, result);
                }
            }
            "repoTable" => {
                if let Some(ref table_name) = node.table_name {
                    let display_name = node.name.clone().unwrap_or_else(|| table_name.clone());
                    let space = node.space_name.clone().unwrap_or_else(|| space_name.to_string());
                    let zone = node.zone_name.clone().unwrap_or_else(|| zone_name.to_string());
                    result.insert(
                        table_name.clone(),
                        TableMeta {
                            display_name: display_name.clone(),
                            space: space.clone(),
                            zone: zone.clone(),
                            _path: format!("{} > {} > {}", space, zone, display_name),
                        },
                    );
                }
            }
            _ => {}
        }

        if let Some(ref children) = node.children {
            if node_type != "project" && node_type != "phase" {
                traverse_all_tables(children, space_name, zone_name, result);
            }
        }
    }
}

fn get_tables_to_process(data_models_path: &Path, table_name: &str) -> Vec<String> {
    if table_name == "all" {
        fs::read_dir(data_models_path)
            .ok()
            .map(|entries| {
                entries
                    .filter_map(|e| e.ok())
                    .filter(|e| e.path().is_dir())
                    .filter_map(|e| {
                        e.file_name()
                            .to_str()
                            .filter(|n| n.starts_with("table_"))
                            .map(|n| n.strip_prefix("table_").unwrap().to_string())
                    })
                    .collect()
            })
            .unwrap_or_default()
    } else {
        vec![table_name.to_string()]
    }
}

/// Table info with ID and display name
#[derive(Debug, Serialize)]
pub struct TableInfo {
    pub id: String,
    pub display_name: String,
}

/// Build a lookup map of table_name -> display_name from all_tables.json
fn build_table_display_names(global_path: &str) -> HashMap<String, String> {
    let all_tables_path = Path::new(global_path).join("all_tables.json");
    let mut names: HashMap<String, String> = HashMap::new();

    if let Ok(content) = fs::read_to_string(&all_tables_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            extract_table_names_recursive(&json, &mut names);
        }
    }

    names
}

/// Recursively extract table names from the nested all_tables.json structure
fn extract_table_names_recursive(node: &serde_json::Value, result: &mut HashMap<String, String>) {
    if let Some(arr) = node.as_array() {
        for item in arr {
            extract_table_names_recursive(item, result);
        }
    } else if let Some(obj) = node.as_object() {
        // Check if this is a repoTable node
        if obj.get("type").and_then(|v| v.as_str()) == Some("repoTable") {
            if let (Some(table_name), Some(display_name)) = (
                obj.get("table_name").and_then(|v| v.as_str()),
                obj.get("name").and_then(|v| v.as_str()),
            ) {
                result.insert(table_name.to_string(), display_name.to_string());
            }
        }
        // Recurse into children
        if let Some(children) = obj.get("children") {
            extract_table_names_recursive(children, result);
        }
    }
}

/// Info about a child workflow's parent executor
#[derive(Debug, Clone)]
struct ChildWorkflowInfo {
    parent_id: i64,
    parent_name: String,
    parent_cron_expression: String,
}

/// Extract child workflow IDs from WorkflowExecutorPlugin in scheduled workflows
/// Returns a map of child_workflow_id -> parent info
fn build_child_workflow_map(workflows_file: &AllWorkflowsFile) -> HashMap<i64, ChildWorkflowInfo> {
    let mut child_map: HashMap<i64, ChildWorkflowInfo> = HashMap::new();

    if let Some(ref workflows) = workflows_file.data {
        for wf in workflows {
            // Only consider workflows that are actually scheduled (have cron_expression)
            let cron = match &wf.cron_expression {
                Some(c) => c.clone(),
                None => continue,
            };

            let parent_id = wf.id.unwrap_or(0);
            let parent_name = wf.name.clone().unwrap_or_default();

            // Check plugins for WorkflowExecutorPlugin
            if let Some(ref data) = wf.data {
                if let Some(ref workflow) = data.workflow {
                    if let Some(ref plugins) = workflow.plugins {
                        for plugin in plugins {
                            // Check if this is a WorkflowExecutorPlugin
                            if plugin.name.as_deref() == Some("WorkflowExecutorPlugin") {
                                if let Some(ref params) = plugin.params {
                                    if let Some(ref workflow_ids) = params.workflow_id {
                                        // workflow_id can be an array or single value
                                        let ids: Vec<i64> = match workflow_ids {
                                            Value::Array(arr) => arr
                                                .iter()
                                                .filter_map(|v| v.as_i64())
                                                .collect(),
                                            Value::Number(n) => n.as_i64().into_iter().collect(),
                                            _ => vec![],
                                        };

                                        for child_id in ids {
                                            child_map.insert(
                                                child_id,
                                                ChildWorkflowInfo {
                                                    parent_id,
                                                    parent_name: parent_name.clone(),
                                                    parent_cron_expression: cron.clone(),
                                                },
                                            );
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

    child_map
}

/// Scan workflows for table dependencies
fn scan_workflow_dependencies(global_path: &Path, table_name: &str) -> Vec<Value> {
    let workflows_path = global_path.join("all_workflows.json");
    let mut results: Vec<Value> = Vec::new();

    if !workflows_path.exists() {
        eprintln!("[scan_workflow_dependencies] File not found: {:?}", workflows_path);
        return results;
    }

    if let Some(workflows_file) = load_json_file::<AllWorkflowsFile>(&workflows_path) {
        // Build the child workflow map first to identify children of scheduled executors
        let child_workflow_map = build_child_workflow_map(&workflows_file);

        if let Some(workflows) = workflows_file.data {
            for wf in workflows {
                let mut uses_table = false;
                let mut relationship = "unknown";

                // Check plugins for table references
                if let Some(ref data) = wf.data {
                    if let Some(ref workflow) = data.workflow {
                        if let Some(ref plugins) = workflow.plugins {
                            for plugin in plugins {
                                if let Some(ref params) = plugin.params {
                                    // Check source tables
                                    if let Some(ref sources) = params.source_tables {
                                        if sources.iter().any(|s| s == table_name) {
                                            uses_table = true;
                                            relationship = "source";
                                        }
                                    }
                                    // Check target table
                                    if let Some(ref target) = params.target {
                                        if target.table.as_deref() == Some(table_name) {
                                            uses_table = true;
                                            relationship = "target";
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                if uses_table {
                    let wf_id = wf.id.unwrap_or(0);
                    let has_cron = wf.cron_expression.is_some();

                    // Check if this workflow is a child of a scheduled executor
                    let child_info = child_workflow_map.get(&wf_id);
                    let is_child_workflow = child_info.is_some();

                    // A workflow is considered "scheduled" if it has cron_expression OR is a child of a scheduled executor
                    let is_scheduled = has_cron || is_child_workflow;

                    // Use effective cron expression (own or parent's)
                    let effective_cron = if has_cron {
                        wf.cron_expression.clone()
                    } else {
                        child_info.map(|info| info.parent_cron_expression.clone())
                    };

                    results.push(json!({
                        "id": wf.id,
                        "name": wf.name,
                        "relationship": relationship,
                        "scheduled": is_scheduled,
                        "cronExpression": wf.cron_expression,
                        "effectiveCronExpression": effective_cron,
                        "isChildWorkflow": is_child_workflow,
                        "parentWorkflowId": child_info.map(|info| info.parent_id),
                        "parentWorkflowName": child_info.map(|info| info.parent_name.clone()),
                        "lastRunStatus": wf.latest_run_status,
                        "lastRunAt": wf.run_completed_at,
                        "updatedDate": wf.updated_date
                    }));
                }
            }
        }
    }

    // Sort: scheduled workflows first, then by name
    results.sort_by(|a, b| {
        let a_scheduled = a.get("scheduled").and_then(|v| v.as_bool()).unwrap_or(false);
        let b_scheduled = b.get("scheduled").and_then(|v| v.as_bool()).unwrap_or(false);
        match (b_scheduled, a_scheduled) {
            (true, false) => std::cmp::Ordering::Greater,
            (false, true) => std::cmp::Ordering::Less,
            _ => {
                let a_name = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let b_name = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
                a_name.cmp(b_name)
            }
        }
    });

    results
}

/// Scan queries for table dependencies
fn scan_query_dependencies(global_path: &Path, table_name: &str) -> Vec<Value> {
    let queries_path = global_path.join("all_queries.json");
    let mut results: Vec<Value> = Vec::new();

    if !queries_path.exists() {
        eprintln!("[scan_query_dependencies] File not found: {:?}", queries_path);
        return results;
    }

    if let Some(queries) = load_json_file::<Vec<QueryEntry>>(&queries_path) {
        for query in queries {
            let mut uses_table = false;

            if let Some(ref ds) = query.datasource {
                if let Some(ref qi) = ds.query_info {
                    if let Some(ref ti) = qi.table_info {
                        // tableInfo is an object with mixed keys (numeric + named)
                        // Extract the "id" field which contains the table name
                        if let Some(table_id) = ti.get("id").and_then(|v| v.as_str()) {
                            if table_id == table_name {
                                uses_table = true;
                            }
                        }
                    }
                }
            }

            if uses_table {
                results.push(json!({
                    "id": query.id,
                    "dsid": query.datasource.as_ref().and_then(|d| d.dsid.clone()),
                    "name": query.name,
                    "updatedDate": query.updated_date
                }));
            }
        }
    }

    results
}

/// Scan dashboards for query dependencies
fn scan_dashboard_dependencies(global_path: &Path, query_dsids: &[i64]) -> Vec<Value> {
    let dashboards_path = global_path.join("all_dashboards.json");
    let mut results: Vec<Value> = Vec::new();

    eprintln!("[scan_dashboard_dependencies] Looking for dashboards with query_dsids: {:?}", &query_dsids[..std::cmp::min(10, query_dsids.len())]);

    if !dashboards_path.exists() {
        eprintln!("[scan_dashboard_dependencies] File not found: {:?}", dashboards_path);
        return results;
    }

    // Try to load and parse the dashboards file with error reporting
    let dashboards_result: Result<Vec<DashboardEntry>, String> = fs::read_to_string(&dashboards_path)
        .map_err(|e| format!("Failed to read file: {}", e))
        .and_then(|content| {
            serde_json::from_str(&content)
                .map_err(|e| format!("Failed to parse JSON: {} at line {} col {}", e, e.line(), e.column()))
        });

    match dashboards_result {
        Err(e) => {
            eprintln!("[scan_dashboard_dependencies] Error loading dashboards: {}", e);
            return results;
        }
        Ok(dashboards) => {
        eprintln!("[scan_dashboard_dependencies] Loaded {} dashboards", dashboards.len());
        let mut total_dsids_found = 0;

        for dashboard in dashboards {
            let mut uses_query = false;
            let mut matched_queries: Vec<i64> = Vec::new();

            // widgets can be an array or empty object {}, so handle both
            if let Some(ref widgets_value) = dashboard.widgets {
                let widgets_array = widgets_value.as_array();
                if let Some(widgets) = widgets_array {
                for widget in widgets {
                    if let Some(settings) = widget.get("settings") {
                        if let Some(ds) = settings.get("datasource") {
                            // datasource is an object with numeric keys containing dsid
                            if let Some(obj) = ds.as_object() {
                                for (key, value) in obj {
                                    // Skip non-datasource keys
                                    if key == "provider" || key == "filters" || key == "settings" {
                                        continue;
                                    }
                                    // dsid can be either a number or a string
                                    let dsid_opt: Option<i64> = value.get("dsid").and_then(|v| {
                                        if let Some(n) = v.as_i64() {
                                            return Some(n);
                                        }
                                        if let Some(s) = v.as_str() {
                                            return s.parse::<i64>().ok();
                                        }
                                        None
                                    });
                                    if let Some(dsid) = dsid_opt {
                                        total_dsids_found += 1;
                                        if query_dsids.contains(&dsid) {
                                            uses_query = true;
                                            if !matched_queries.contains(&dsid) {
                                                matched_queries.push(dsid);
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

            if uses_query {
                eprintln!("[scan_dashboard_dependencies] Found matching dashboard: {} with dsids {:?}",
                    dashboard.name.as_deref().unwrap_or("unknown"), matched_queries);
                results.push(json!({
                    "id": dashboard.id,
                    "name": dashboard.name,
                    "updatedDate": dashboard.updated_date,
                    "queryIds": matched_queries
                }));
            }
        }
        eprintln!("[scan_dashboard_dependencies] Total dsids found in dashboards: {}, matches: {}", total_dsids_found, results.len());
        }
    }

    results
}

/// List available tables in a domain's data_models folder with display names
#[command]
pub async fn val_list_domain_tables(domain: String) -> Result<Vec<TableInfo>, String> {
    let domain_config = get_domain_config(&domain)?;
    let global_path = &domain_config.global_path;

    let data_models_path = Path::new(global_path).join("data_models");
    if !data_models_path.exists() {
        return Ok(vec![]);
    }

    // Build lookup from all_tables.json (synced from VAL)
    let display_names = build_table_display_names(global_path);

    let table_ids = get_tables_to_process(&data_models_path, "all");

    // Map table IDs to display names
    let mut tables: Vec<TableInfo> = table_ids
        .into_iter()
        .map(|id| {
            let display_name = display_names
                .get(&id)
                .cloned()
                .unwrap_or_else(|| id.clone());
            TableInfo { id, display_name }
        })
        .collect();

    // Sort by display name for better UX
    tables.sort_by(|a, b| a.display_name.to_lowercase().cmp(&b.display_name.to_lowercase()));

    Ok(tables)
}

fn classify_columns(
    columns: &[ColumnDef],
) -> (Vec<&ColumnDef>, Vec<&ColumnDef>, Vec<&ColumnDef>) {
    let mut system_cols = Vec::new();
    let mut data_cols = Vec::new();
    let mut calc_cols = Vec::new();

    for col in columns {
        let col_name = col.column_name.as_deref().unwrap_or("");
        let col_type = col.col_type.as_deref().unwrap_or("");

        if SYSTEM_COLUMNS.contains(&col_name) {
            system_cols.push(col);
        } else if col_type == "rule" || (col_name.starts_with("usr_") && col_type == "rule") {
            calc_cols.push(col);
        } else {
            data_cols.push(col);
        }
    }

    (system_cols, data_cols, calc_cols)
}

fn format_number(n: Option<i64>) -> String {
    match n {
        Some(num) => {
            if num >= 1_000_000 {
                format!("{:.1}M", num as f64 / 1_000_000.0)
            } else if num >= 1_000 {
                format!("{:.1}K", num as f64 / 1_000.0)
            } else {
                num.to_string()
            }
        }
        None => "Unknown".to_string(),
    }
}

fn capitalize_first(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        None => String::new(),
        Some(c) => c.to_uppercase().chain(chars).collect(),
    }
}

fn format_data_source(source: &str) -> String {
    match source {
        "workflow-generated" => "Workflow Generated".to_string(),
        "manual-upload" => "Manual Upload".to_string(),
        "integration" => "Integration".to_string(),
        _ => capitalize_first(source),
    }
}

// ============================================================================
// Step 1: Prepare Table Overview (definition_details.json)
// ============================================================================

#[command]
pub async fn val_prepare_table_overview(
    domain: String,
    table_name: String,
    overwrite: bool,
    skip_sql: bool,
    freshness_column: Option<String>,
) -> Result<TablePipelineResult, String> {
    let start = std::time::Instant::now();
    let domain_config = get_domain_config(&domain)?;
    let global_path = &domain_config.global_path;

    let data_models_path = Path::new(global_path).join("data_models");
    if !data_models_path.exists() {
        return Err(format!("data_models folder not found at {:?}", data_models_path));
    }

    // Load supporting data files
    let all_tables: Vec<AllTablesNode> =
        load_json_file(&Path::new(global_path).join("all_tables.json")).unwrap_or_default();
    let health_results: Option<HealthCheckResults> =
        load_json_file(&Path::new(global_path).join("health-check-results.json"));
    let calc_fields: Vec<CalcFieldEntry> =
        load_json_file(&Path::new(global_path).join("all_calculated_fields.json")).unwrap_or_default();

    // Build lookups
    let mut table_metadata: HashMap<String, TableMeta> = HashMap::new();
    traverse_all_tables(&all_tables, "", "", &mut table_metadata);

    let mut health_by_table: HashMap<String, &TableHealthEntry> = HashMap::new();
    if let Some(ref hr) = health_results {
        if let Some(ref tables) = hr.tables {
            for t in tables {
                health_by_table.insert(t.table_name.clone(), t);
            }
        }
    }

    let mut calc_fields_by_table: HashMap<String, Vec<&CalcFieldEntry>> = HashMap::new();
    for cf in &calc_fields {
        let tbl = cf.temp_id.as_ref().or(cf.id.as_ref());
        if let Some(t) = tbl {
            calc_fields_by_table.entry(t.clone()).or_default().push(cf);
        }
    }

    let table_folder = data_models_path.join(format!("table_{}", table_name));
    let definition_path = table_folder.join("definition.json");
    let details_path = table_folder.join("definition_details.json");

    // Skip if exists and not overwriting
    if !overwrite && details_path.exists() {
        return Ok(TablePipelineResult {
            domain,
            table_name,
            step: "prepare-table-overview".to_string(),
            status: "skipped".to_string(),
            file_path: Some(details_path.to_string_lossy().to_string()),
            message: "definition_details.json already exists".to_string(),
            duration_ms: start.elapsed().as_millis() as u64,
        });
    }

    if !definition_path.exists() {
        return Ok(TablePipelineResult {
            domain,
            table_name,
            step: "prepare-table-overview".to_string(),
            status: "skipped".to_string(),
            file_path: None,
            message: "no definition.json".to_string(),
            duration_ms: start.elapsed().as_millis() as u64,
        });
    }

    // Read definition.json
    let columns: Vec<ColumnDef> = load_json_file(&definition_path)
        .ok_or("Failed to parse definition.json")?;

    let (system_cols, data_cols, calc_cols) = classify_columns(&columns);

    // Get metadata
    let meta = table_metadata
        .get(&table_name)
        .cloned()
        .unwrap_or_else(|| TableMeta {
            display_name: table_name.clone(),
            space: "Unknown".to_string(),
            zone: "Unknown".to_string(),
            _path: table_name.clone(),
        });

    let health = health_by_table.get(&table_name);
    let table_calc_fields = calc_fields_by_table.get(&table_name);

    // Build calc field details and lookup tables
    let mut calc_field_details: HashMap<String, Value> = HashMap::new();
    let mut lookup_tables: HashMap<String, Value> = HashMap::new();
    // Track fields per lookup table: tableName -> Vec<{fieldName, ruleType}>
    let mut lookup_table_fields: HashMap<String, Vec<Value>> = HashMap::new();

    if let Some(cfs) = table_calc_fields {
        for cf in cfs {
            if let Some(ref settings) = cf.settings {
                if let Some(ref rf) = settings.rule_field {
                    if let Some(ref field_name) = rf.name {
                        let rules = rf.rules.as_ref();
                        let rule_name = rules
                            .and_then(|r| r.get("rule_name"))
                            .and_then(|v| v.as_str())
                            .or(rf.rule_type.as_deref())
                            .unwrap_or("unknown");

                        let lookup_table_name = if rule_name == "vlookup" || rule_name == "rollup" {
                            rules.and_then(|r| r.get("table")).and_then(|v| v.as_str())
                        } else {
                            None
                        };

                        let lookup_info = lookup_table_name.map(|lt| {
                            let display = table_metadata
                                .get(lt)
                                .map(|m| m.display_name.clone())
                                .unwrap_or_else(|| lt.to_string());
                            json!({
                                "tableName": lt,
                                "displayName": display
                            })
                        });

                        // Extract more rule details for the logic view
                        let lookup_column = rules
                            .and_then(|r| r.get("column"))
                            .and_then(|v| v.as_str());
                        let return_column_detail = rules
                            .and_then(|r| r.get("data"))
                            .and_then(|d| d.as_array())
                            .and_then(|arr| arr.first())
                            .and_then(|first| first.get("value_column"))
                            .and_then(|v| v.as_str());
                        let ref_column_detail = rules
                            .and_then(|r| r.get("data"))
                            .and_then(|d| d.as_array())
                            .and_then(|arr| arr.first())
                            .and_then(|first| first.get("ref_column"))
                            .and_then(|v| v.as_str());
                        let formula = rf.formula.clone();
                        let constant_value = rules
                            .and_then(|r| r.get("value"))
                            .cloned();

                        calc_field_details.insert(
                            field_name.clone(),
                            json!({
                                "ruleType": rule_name,
                                "lookupTable": lookup_info,
                                "lookupColumn": lookup_column,
                                "refColumn": ref_column_detail,
                                "returnColumn": return_column_detail,
                                "formula": formula,
                                "constantValue": constant_value,
                                "rules": rules.cloned()  // Store raw rules for full logic view
                            }),
                        );

                        if let Some(lt) = lookup_table_name {
                            let entry = lookup_tables.entry(lt.to_string()).or_insert_with(|| {
                                let display = table_metadata
                                    .get(lt)
                                    .map(|m| m.display_name.clone())
                                    .unwrap_or_else(|| lt.to_string());
                                json!({
                                    "tableName": lt,
                                    "displayName": display,
                                    "fieldCount": 0
                                })
                            });
                            if let Some(count) = entry.get_mut("fieldCount") {
                                *count = json!(count.as_i64().unwrap_or(0) + 1);
                            }
                            // Track field details for this lookup table
                            // Extract more vlookup details if available
                            let lookup_column = rules
                                .and_then(|r| r.get("column"))
                                .and_then(|v| v.as_str());
                            let return_column = rules
                                .and_then(|r| r.get("data"))
                                .and_then(|d| d.as_array())
                                .and_then(|arr| arr.first())
                                .and_then(|first| first.get("value_column"))
                                .and_then(|v| v.as_str());
                            let ref_column = rules
                                .and_then(|r| r.get("data"))
                                .and_then(|d| d.as_array())
                                .and_then(|arr| arr.first())
                                .and_then(|first| first.get("ref_column"))
                                .and_then(|v| v.as_str());

                            lookup_table_fields
                                .entry(lt.to_string())
                                .or_default()
                                .push(json!({
                                    "fieldName": field_name,
                                    "ruleType": rule_name,
                                    "lookupColumn": lookup_column,
                                    "refColumn": ref_column,
                                    "returnColumn": return_column
                                }));
                        }
                    }
                }
            }
        }
    }

    // Add fields array to each lookup table
    for (table_name_key, fields) in lookup_table_fields {
        if let Some(entry) = lookup_tables.get_mut(&table_name_key) {
            entry["fields"] = json!(fields);
        }
    }

    // Detect workflow lineage
    let workflows_path = Path::new(global_path).join("workflows");
    let mut source_workflow: Option<Value> = None;
    let mut downstream_workflows: Vec<Value> = Vec::new();

    if workflows_path.exists() {
        if let Ok(entries) = fs::read_dir(&workflows_path) {
            for entry in entries.filter_map(|e| e.ok()) {
                let wf_path = entry.path();
                if !wf_path.is_dir() {
                    continue;
                }

                let wf_def_path = wf_path.join("definition.json");
                if !wf_def_path.exists() {
                    continue;
                }

                if let Some(wf_def) = load_json_file::<WorkflowDef>(&wf_def_path) {
                    // Check if this workflow targets our table
                    if let Some(ref target) = wf_def.target {
                        if target.table.as_deref() == Some(&table_name) {
                            let source_tables: Vec<Value> = wf_def
                                .source_tables
                                .as_ref()
                                .map(|st| {
                                    st.iter()
                                        .map(|t| {
                                            let display = table_metadata
                                                .get(t)
                                                .map(|m| m.display_name.clone())
                                                .unwrap_or_else(|| t.clone());
                                            json!({
                                                "tableName": t,
                                                "displayName": display
                                            })
                                        })
                                        .collect()
                                })
                                .unwrap_or_default();

                            let wf_id = wf_def
                                .id
                                .as_ref()
                                .map(|v| v.to_string())
                                .or_else(|| {
                                    wf_path
                                        .file_name()
                                        .and_then(|n| n.to_str())
                                        .map(|n| n.strip_prefix("workflow_").unwrap_or(n).to_string())
                                });

                            source_workflow = Some(json!({
                                "id": wf_id,
                                "name": wf_def.name,
                                "description": wf_def.description,
                                "tags": wf_def.tags,
                                "sourceTables": source_tables
                            }));
                        }
                    }

                    // Check if our table is a source for this workflow
                    if let Some(ref sources) = wf_def.source_tables {
                        if sources.contains(&table_name) {
                            let target_table = wf_def.target.as_ref().and_then(|t| t.table.clone());
                            let target_info = target_table.as_ref().map(|tt| {
                                let display = table_metadata
                                    .get(tt)
                                    .map(|m| m.display_name.clone())
                                    .unwrap_or_else(|| tt.clone());
                                json!({
                                    "tableName": tt,
                                    "displayName": display
                                })
                            });

                            let wf_id = wf_def
                                .id
                                .as_ref()
                                .map(|v| v.to_string())
                                .or_else(|| {
                                    wf_path
                                        .file_name()
                                        .and_then(|n| n.to_str())
                                        .map(|n| n.strip_prefix("workflow_").unwrap_or(n).to_string())
                                });

                            downstream_workflows.push(json!({
                                "id": wf_id,
                                "name": wf_def.name,
                                "targetTable": target_info
                            }));
                        }
                    }
                }
            }
        }
    }

    // Determine data source type
    let data_source = if source_workflow.is_some() {
        "workflow-generated"
    } else if data_cols.iter().any(|c| c.col_type.as_deref() == Some("integration")) {
        "integration"
    } else {
        "manual-upload"
    };

    // Collect SQL data if not skipping
    let mut sql_data: Option<Value> = None;
    let mut date_col_used = "created_date".to_string();

    if !skip_sql {
        // Find best date column - check user-specified first, then health config, then look for common date columns
        let date_col = freshness_column.clone()
            .or_else(|| health
                .and_then(|h| h.freshness.as_ref())
                .and_then(|f| f.date_column.clone()))
            .or_else(|| {
                // Look for common date columns in data fields
                let date_types = ["date", "timestamp", "timestamp without time zone", "timestamp with time zone", "timestamptz"];
                let common_names = ["transaction_date", "date", "order_date", "business_date", "report_date", "value_date"];
                data_cols.iter()
                    .find(|c| {
                        let col_type = c.raw_data_type.as_deref().unwrap_or("");
                        let col_name = c.column_name.as_deref().unwrap_or("");
                        date_types.iter().any(|t| col_type.to_lowercase().contains(t)) &&
                        common_names.iter().any(|n| col_name.to_lowercase().contains(n))
                    })
                    .and_then(|c| c.column_name.clone())
            })
            .unwrap_or_else(|| "created_date".to_string());

        date_col_used = date_col.clone();

        let range_query = format!(
            "SELECT MIN({}) as earliest, MAX({}) as latest, MIN(created_date) as first_created, MAX(created_date) as last_created, COUNT(*) as total FROM {}",
            date_col, date_col, table_name
        );

        if let Ok(result) = val_execute_sql(domain.clone(), range_query, Some(1)).await {
            if result.error.is_none() && !result.data.is_empty() {
                sql_data = Some(json!({
                    "dateColumn": date_col,
                    "range": result.data.first()
                }));
            }
        }
    }

    // Calculate health data inline if not available from health-check-results.json
    let calculated_health: Option<(String, i64, Option<i64>, Option<i64>, i64, String, Vec<String>)> =
        if health.is_none() {
            if let Some(ref sd) = sql_data {
                if let Some(range) = sd.get("range") {
                    let row_count = range.get("total")
                        .and_then(|v| v.as_str())
                        .and_then(|s| s.parse::<i64>().ok())
                        .or_else(|| range.get("total").and_then(|v| v.as_i64()))
                        .unwrap_or(0);

                    // SGT timezone offset (UTC+8) - VAL operates in Singapore time
                    let sgt_offset = chrono::FixedOffset::east_opt(8 * 3600).unwrap();

                    let last_created = range.get("last_created")
                        .and_then(|v| v.as_str())
                        .and_then(|s| DateTime::parse_from_rfc3339(s).ok().or_else(|| {
                            chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.f")
                                .ok()
                                .map(|dt| dt.and_local_timezone(sgt_offset).unwrap().fixed_offset())
                        }));

                    let latest = range.get("latest")
                        .and_then(|v| v.as_str())
                        .and_then(|s| DateTime::parse_from_rfc3339(s).ok().or_else(|| {
                            chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.f")
                                .ok()
                                .map(|dt| dt.and_local_timezone(sgt_offset).unwrap().fixed_offset())
                                .or_else(|| {
                                    chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d")
                                        .ok()
                                        .map(|d| d.and_hms_opt(23, 59, 59).unwrap().and_local_timezone(sgt_offset).unwrap().fixed_offset())
                                })
                        }));

                    // Use SGT for "now" to compare dates properly
                    let now_sgt = Utc::now().with_timezone(&sgt_offset);
                    let today_sgt = now_sgt.date_naive();

                    let days_since_created = last_created.map(|lc| {
                        let lc_date = lc.with_timezone(&sgt_offset).date_naive();
                        (today_sgt - lc_date).num_days()
                    });
                    let days_since_update = latest.map(|l| {
                        let l_date = l.with_timezone(&sgt_offset).date_naive();
                        (today_sgt - l_date).num_days()
                    });

                    // Determine table type based on date columns
                    let date_types = ["date", "timestamp", "timestamp without time zone", "timestamptz"];
                    let has_date_columns = data_cols.iter().any(|c| {
                        c.raw_data_type.as_ref()
                            .map(|t| date_types.iter().any(|dt| t.to_lowercase().contains(dt)))
                            .unwrap_or(false)
                    });
                    let table_type = if has_date_columns { "transactional" } else { "master-data" };

                    // Calculate health score
                    let mut score: i64 = 100;
                    let mut issues: Vec<String> = Vec::new();

                    if row_count == 0 {
                        score -= 50;
                        issues.push("Table is empty".to_string());
                    }
                    if let Some(dsc) = days_since_created {
                        if dsc > 30 {
                            score -= 20;
                            issues.push(format!("No new records in {} days", dsc));
                        }
                    }
                    if table_type == "transactional" {
                        if let Some(dsu) = days_since_update {
                            if dsu > 7 {
                                score -= 15;
                                issues.push(format!("Data is {} days stale", dsu));
                            }
                        }
                    }

                    let status = if score >= 80 { "healthy" } else if score >= 50 { "warning" } else { "critical" };

                    Some((
                        table_type.to_string(),
                        row_count,
                        days_since_update,
                        days_since_created,
                        score.max(0),
                        status.to_string(),
                        issues,
                    ))
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };

    // Get freshness column - prefer health config, then calculated, then default
    let freshness_col = health
        .and_then(|h| h.freshness.as_ref())
        .and_then(|f| f.date_column.clone())
        .or_else(|| if date_col_used != "created_date" { Some(date_col_used.clone()) } else { None });
    let freshness_col_name = freshness_col.as_ref().and_then(|fc| {
        columns
            .iter()
            .find(|c| c.column_name.as_deref() == Some(fc.as_str()))
            .and_then(|c| c.name.clone())
    });

    // Use calculated health data if pre-computed is not available
    let (final_table_type, final_row_count, final_days_since_update, final_days_since_created, final_score, final_status, final_issues) =
        if let Some((tt, rc, dsu, dsc, score, status, issues)) = calculated_health {
            (tt, Some(rc), dsu, dsc, Some(score), status, issues)
        } else {
            (
                health.and_then(|h| h.table_type.clone()).unwrap_or_else(|| "unknown".to_string()),
                health.and_then(|h| h.stats.as_ref()).and_then(|s| s.row_count),
                health.and_then(|h| h.freshness.as_ref()).and_then(|f| f.days_since_update),
                health.and_then(|h| h.row_created_date.as_ref()).and_then(|r| r.days_since_insert),
                health.and_then(|h| h.health.as_ref()).and_then(|h| h.score.map(|s| s as i64)),
                health.and_then(|h| h.health.as_ref()).and_then(|h| h.status.as_ref()).and_then(|s| s.description.clone()).unwrap_or_else(|| "unknown".to_string()),
                health.and_then(|h| h.health.as_ref()).and_then(|h| h.issues.clone()).unwrap_or_default(),
            )
        };

    // Scan for dependencies
    let global_path_obj = Path::new(global_path);
    eprintln!("[val_prepare_table_overview] Scanning dependencies for table '{}' in {:?}", table_name, global_path_obj);
    let workflow_deps = scan_workflow_dependencies(global_path_obj, &table_name);
    let query_deps = scan_query_dependencies(global_path_obj, &table_name);

    // Get query dsids for dashboard scanning
    // dsid can be either a number or a string, so handle both cases
    let query_dsids: Vec<i64> = query_deps
        .iter()
        .filter_map(|q| {
            q.get("dsid").and_then(|v| {
                // Try as i64 first
                if let Some(n) = v.as_i64() {
                    return Some(n);
                }
                // Try as string and parse
                if let Some(s) = v.as_str() {
                    return s.parse::<i64>().ok();
                }
                None
            })
        })
        .collect();
    let dashboard_deps = scan_dashboard_dependencies(global_path_obj, &query_dsids);

    eprintln!("[val_prepare_table_overview] Found {} workflows, {} queries, {} dashboards for table '{}'",
        workflow_deps.len(), query_deps.len(), dashboard_deps.len(), table_name);

    // Build overview data
    let now: DateTime<Utc> = Utc::now();
    let overview_data = json!({
        "meta": {
            "tableName": table_name,
            "displayName": meta.display_name,
            "space": meta.space,
            "zone": meta.zone,
            "tableType": final_table_type,
            "dataSource": data_source,
            "generatedAt": now.to_rfc3339(),
            "generatedBy": "tv-client"
        },
        "health": {
            "score": final_score,
            "status": final_status,
            "rowCount": final_row_count,
            "freshnessColumn": freshness_col,
            "freshnessColumnName": freshness_col_name,
            "daysSinceUpdate": final_days_since_update,
            "daysSinceCreated": final_days_since_created,
            "issues": final_issues
        },
        "coverage": sql_data.as_ref().and_then(|d| d.get("range")).cloned(),
        "columns": {
            "system": system_cols.iter().map(|c| json!({
                "name": c.name.clone().or(c.column_name.clone()),
                "column": c.column_name,
                "type": c.raw_data_type.clone().or(c.col_type.clone())
            })).collect::<Vec<_>>(),
            "data": data_cols.iter().map(|c| json!({
                "name": c.name.clone().or(c.column_name.clone()),
                "column": c.column_name,
                "type": c.raw_data_type.clone().or(c.col_type.clone())
            })).collect::<Vec<_>>(),
            "calculated": calc_cols.iter().map(|c| {
                let field_name = c.name.clone().or(c.column_name.clone()).unwrap_or_default();
                let details = calc_field_details.get(&field_name);
                json!({
                    "name": field_name,
                    "column": c.column_name,
                    "type": c.raw_data_type.clone().or(c.col_type.clone()),
                    "ruleType": details.and_then(|d| d.get("ruleType")).unwrap_or(&json!("rule")),
                    "lookupTable": details.and_then(|d| d.get("lookupTable")),
                    "rules": details.and_then(|d| d.get("rules"))
                })
            }).collect::<Vec<_>>()
        },
        "relationships": {
            "relatedTables": lookup_tables.values().cloned().collect::<Vec<_>>(),
            "sourceWorkflow": source_workflow,
            "downstreamWorkflows": downstream_workflows,
            "dependencies": health.and_then(|h| h.dependencies.clone()).map(|deps| {
                deps.iter().map(|d| json!({
                    "type": d.dep_type,
                    "id": d.id,
                    "name": d.name
                })).collect::<Vec<_>>()
            }).unwrap_or_default(),
            "workflows": workflow_deps,
            "queries": query_deps,
            "dashboards": dashboard_deps
        },
        "summary": {
            "short": Value::Null,
            "full": Value::Null,
            "useCases": Vec::<String>::new()
        }
    });

    // Write definition_details.json
    let content = serde_json::to_string_pretty(&overview_data)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    fs::write(&details_path, content)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(TablePipelineResult {
        domain,
        table_name,
        step: "prepare-table-overview".to_string(),
        status: "created".to_string(),
        file_path: Some(details_path.to_string_lossy().to_string()),
        message: format!(
            "{} system, {} data, {} calculated columns",
            system_cols.len(),
            data_cols.len(),
            calc_cols.len()
        ),
        duration_ms: start.elapsed().as_millis() as u64,
    })
}

// ============================================================================
// Step 2: Sample Table Data (definition_sample.json)
// ============================================================================

#[command]
pub async fn val_sample_table_data(
    domain: String,
    table_name: String,
    row_count: Option<usize>,
    order_by: Option<String>,
    overwrite: bool,
) -> Result<TablePipelineResult, String> {
    let start = std::time::Instant::now();
    let domain_config = get_domain_config(&domain)?;
    let global_path = &domain_config.global_path;

    let table_folder = Path::new(global_path)
        .join("data_models")
        .join(format!("table_{}", table_name));
    let sample_path = table_folder.join("definition_sample.json");
    let definition_path = table_folder.join("definition.json");

    let limit = row_count.unwrap_or(20).min(50).max(1);

    // Skip if exists and not overwriting
    if !overwrite && sample_path.exists() {
        return Ok(TablePipelineResult {
            domain,
            table_name,
            step: "sample-table-data".to_string(),
            status: "skipped".to_string(),
            file_path: Some(sample_path.to_string_lossy().to_string()),
            message: "definition_sample.json already exists".to_string(),
            duration_ms: start.elapsed().as_millis() as u64,
        });
    }

    if !definition_path.exists() {
        return Err(format!("Table definition not found at {:?}", definition_path));
    }

    // Load table definition
    let columns: Vec<ColumnDef> =
        load_json_file(&definition_path).ok_or("Failed to parse definition.json")?;

    // Simple query - just SELECT * LIMIT N
    // Order by user-specified column if provided, otherwise no ordering
    let query = if let Some(ref order_col) = order_by {
        format!(
            "SELECT * FROM {} ORDER BY {} DESC LIMIT {}",
            table_name, order_col, limit
        )
    } else {
        format!("SELECT * FROM {} LIMIT {}", table_name, limit)
    };

    let sql_result = val_execute_sql(domain.clone(), query.clone(), Some(limit)).await?;

    // Get total row count with a COUNT(*) query
    let count_query = format!("SELECT COUNT(*) as total FROM {}", table_name);
    let total_row_count: Option<i64> = match val_execute_sql(domain.clone(), count_query, Some(1)).await {
        Ok(count_result) => {
            count_result.data.first()
                .and_then(|row| row.get("total"))
                .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
        }
        Err(_) => None
    };

    // Build column display name lookup (db_name -> english_name)
    let column_names: HashMap<String, String> = columns
        .iter()
        .filter_map(|c| {
            let col_name = c.column_name.as_ref()?;
            let display_name = c.name.as_ref()
                .filter(|n| !n.is_empty())
                .or(c.column_name.as_ref())?;
            Some((col_name.clone(), display_name.clone()))
        })
        .collect();

    // Build column type lookup
    let column_types: HashMap<String, String> = columns
        .iter()
        .filter_map(|c| {
            let col_name = c.column_name.as_ref()?;
            let col_type = c.raw_data_type.as_ref().or(c.col_type.as_ref())?;
            Some((col_name.clone(), col_type.to_lowercase()))
        })
        .collect();

    // Collect basic stats from sample data (no categorical analysis - that's in val_fetch_categorical_values)
    let mut column_stats: HashMap<String, Value> = HashMap::new();
    if !sql_result.data.is_empty() {
        let mut sample_distinct: HashMap<String, HashSet<String>> = HashMap::new();

        for row in &sql_result.data {
            if let Value::Object(obj) = row {
                for (col_name, value) in obj {
                    let value_str = match value {
                        Value::Null => continue,
                        Value::String(s) => s.clone(),
                        Value::Number(n) => n.to_string(),
                        Value::Bool(b) => b.to_string(),
                        _ => continue,
                    };
                    sample_distinct
                        .entry(col_name.clone())
                        .or_default()
                        .insert(value_str);
                }
            }
        }

        for (col_name, values) in sample_distinct {
            let col_type = column_types.get(&col_name).cloned().unwrap_or_default();
            let display_name = column_names.get(&col_name).cloned().unwrap_or(col_name.clone());

            let stat = json!({
                "type": col_type,
                "displayName": display_name,
                "sampleDistinctCount": values.len()
            });

            column_stats.insert(col_name, stat);
        }
    }

    let now: DateTime<Utc> = Utc::now();
    let sample_data = json!({
        "meta": {
            "tableName": table_name,
            "sampledAt": now.to_rfc3339(),
            "rowCount": sql_result.row_count,
            "totalRowCount": total_row_count,
            "requestedRows": limit,
            "orderBy": order_by,
            "queryError": sql_result.error
        },
        "columns": columns.iter().map(|c| json!({
            "name": c.name.clone().or(c.column_name.clone()),
            "column": c.column_name,
            "type": c.raw_data_type.clone().or(c.col_type.clone())
        })).collect::<Vec<_>>(),
        "columnStats": column_stats,
        "rows": sql_result.data
    });

    // Write definition_sample.json
    let content = serde_json::to_string_pretty(&sample_data)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    fs::write(&sample_path, content)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(TablePipelineResult {
        domain,
        table_name,
        step: "sample-table-data".to_string(),
        status: "created".to_string(),
        file_path: Some(sample_path.to_string_lossy().to_string()),
        message: format!("{} rows sampled (total: {})", sql_result.row_count, total_row_count.map(|c| c.to_string()).unwrap_or_else(|| "unknown".to_string())),
        duration_ms: start.elapsed().as_millis() as u64,
    })
}

// ============================================================================
// Step 2b: Fetch Categorical Values (definition_categorical.json)
// Separate from sample to allow independent refresh of categorical data
// ============================================================================

#[command]
pub async fn val_fetch_categorical_values(
    domain: String,
    table_name: String,
    overwrite: bool,
) -> Result<TablePipelineResult, String> {
    let start = std::time::Instant::now();
    let domain_config = get_domain_config(&domain)?;
    let global_path = &domain_config.global_path;

    let table_folder = Path::new(global_path)
        .join("data_models")
        .join(format!("table_{}", table_name));
    let categorical_path = table_folder.join("definition_categorical.json");
    let definition_path = table_folder.join("definition.json");

    // Skip if exists and not overwriting
    if !overwrite && categorical_path.exists() {
        return Ok(TablePipelineResult {
            domain,
            table_name,
            step: "fetch-categorical-values".to_string(),
            status: "skipped".to_string(),
            file_path: Some(categorical_path.to_string_lossy().to_string()),
            message: "definition_categorical.json already exists".to_string(),
            duration_ms: start.elapsed().as_millis() as u64,
        });
    }

    if !definition_path.exists() {
        return Err(format!("Table definition not found at {:?}", definition_path));
    }

    // Load table definition
    let columns: Vec<ColumnDef> =
        load_json_file(&definition_path).ok_or("Failed to parse definition.json")?;

    // Get total row count
    let count_query = format!("SELECT COUNT(*) as total FROM {}", table_name);
    let total_row_count: Option<i64> = match val_execute_sql(domain.clone(), count_query, Some(1)).await {
        Ok(count_result) => {
            count_result.data.first()
                .and_then(|row| row.get("total"))
                .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
        }
        Err(_) => None
    };

    // Build column type lookup and name lookup
    let column_types: HashMap<String, String> = columns
        .iter()
        .filter_map(|c| {
            let col_name = c.column_name.as_ref()?;
            let col_type = c.raw_data_type.as_ref().or(c.col_type.as_ref())?;
            Some((col_name.clone(), col_type.to_lowercase()))
        })
        .collect();

    let column_names: HashMap<String, String> = columns
        .iter()
        .filter_map(|c| {
            let col_name = c.column_name.as_ref()?;
            let display_name = c.name.as_ref()
                .filter(|n| !n.is_empty())
                .or(c.column_name.as_ref())?;
            Some((col_name.clone(), display_name.clone()))
        })
        .collect();

    // Helper: check if a column name looks like an ID/key field (not categorical)
    let is_id_like = |name: &str| -> bool {
        let lower = name.to_lowercase();
        // Exact matches
        if matches!(lower.as_str(), "id" | "uuid" | "guid" | "key" | "hash" | "token"
            | "rowid" | "row_id" | "pk" | "primary_key") {
            return true;
        }
        // Suffix patterns
        if lower.ends_with("_id") || lower.ends_with("_uuid") || lower.ends_with("_guid")
            || lower.ends_with("_key") || lower.ends_with("_ref") || lower.ends_with("_hash")
            || lower.ends_with("_token") || lower.ends_with("_code")
            || lower.ends_with("_number") || lower.ends_with("_no")
            || lower.ends_with("_num") || lower.ends_with("_pk")
            || lower.ends_with("id") && lower.len() > 2 && lower.chars().nth(lower.len() - 3).map_or(false, |c| c == '_' || c.is_uppercase())
        {
            return true;
        }
        // Prefix patterns
        if lower.starts_with("id_") || lower.starts_with("fk_") || lower.starts_with("pk_")
            || lower.starts_with("ref_")
        {
            return true;
        }
        // Contains patterns for paths, urls, descriptions (high cardinality)
        if lower.contains("path") || lower.contains("url") || lower.contains("uri")
            || lower.contains("description") || lower.contains("comment")
            || lower.contains("note") || lower.contains("remark")
            || lower.contains("address") || lower.contains("email")
            || lower.contains("filename") || lower.contains("file_name")
        {
            return true;
        }
        false
    };

    // Count all text-type columns before filtering
    let all_text_count = column_types
        .iter()
        .filter(|(_, col_type)| {
            col_type.contains("varchar")
                || col_type.contains("text")
                || col_type.contains("character")
        })
        .count();

    // Identify text-type columns, excluding ID-like columns
    let text_columns: Vec<String> = column_types
        .iter()
        .filter(|(col_name, col_type)| {
            (col_type.contains("varchar")
                || col_type.contains("text")
                || col_type.contains("character"))
                && !is_id_like(col_name)
        })
        .map(|(col_name, _)| col_name.clone())
        .collect();

    let skipped_count = all_text_count - text_columns.len();

    let mut categorical_columns: HashMap<String, Value> = HashMap::new();
    let mut categorical_count = 0;

    // Batch: get distinct counts for all text columns in a single query
    let mut distinct_counts: HashMap<String, i64> = HashMap::new();
    if !text_columns.is_empty() {
        // Build batches of up to 50 columns per query to avoid SQL length limits
        for chunk in text_columns.chunks(50) {
            let select_parts: Vec<String> = chunk
                .iter()
                .map(|col| format!("COUNT(DISTINCT \"{}\") as \"cnt_{}\"", col, col))
                .collect();
            let batch_query = format!("SELECT {} FROM {}", select_parts.join(", "), table_name);
            if let Ok(result) = val_execute_sql(domain.clone(), batch_query, Some(1)).await {
                if let Some(row) = result.data.first() {
                    for col in chunk {
                        let key = format!("cnt_{}", col);
                        let count = row.get(&key)
                            .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
                            .unwrap_or(0);
                        distinct_counts.insert(col.clone(), count);
                    }
                }
            }
        }
    }

    // Categorical threshold: distinct count < 10% of total rows (or max 1000 if unknown)
    let ratio_threshold = total_row_count
        .map(|total| (total as f64 * 0.10).max(1.0) as i64)
        .unwrap_or(1000);

    // For each text column, check if categorical and fetch distinct values if so
    for col_name in &text_columns {
        let display_name = column_names.get(col_name).cloned().unwrap_or(col_name.clone());
        let col_type = column_types.get(col_name).cloned().unwrap_or_default();
        let distinct_count = distinct_counts.get(col_name).copied().unwrap_or(0);
        let is_categorical = distinct_count > 0 && distinct_count <= ratio_threshold;

        let mut stat = json!({
            "type": col_type,
            "displayName": display_name,
            "distinctCount": distinct_count,
            "isCategorical": is_categorical
        });

        // Get actual distinct values if categorical
        if is_categorical {
            categorical_count += 1;
            let values_query = format!(
                "SELECT DISTINCT \"{}\" as val FROM {} WHERE \"{}\" IS NOT NULL ORDER BY \"{}\" LIMIT 1000",
                col_name, table_name, col_name, col_name
            );
            if let Ok(result) = val_execute_sql(domain.clone(), values_query, Some(1000)).await {
                let values: Vec<String> = result.data
                    .iter()
                    .filter_map(|row| {
                        row.get("val").and_then(|v| match v {
                            Value::String(s) => Some(s.clone()),
                            Value::Number(n) => Some(n.to_string()),
                            _ => None
                        })
                    })
                    .collect();
                stat["distinctValues"] = json!(values);
            }
        }

        categorical_columns.insert(col_name.clone(), stat);
    }

    let now: DateTime<Utc> = Utc::now();
    let categorical_data = json!({
        "meta": {
            "tableName": table_name,
            "fetchedAt": now.to_rfc3339(),
            "totalRowCount": total_row_count,
            "totalTextColumns": all_text_count,
            "skippedIdLikeColumns": skipped_count,
            "textColumnsAnalyzed": text_columns.len(),
            "categoricalColumnsFound": categorical_count
        },
        "columns": categorical_columns
    });

    // Write definition_categorical.json
    let content = serde_json::to_string_pretty(&categorical_data)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    fs::write(&categorical_path, content)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(TablePipelineResult {
        domain,
        table_name,
        step: "fetch-categorical-values".to_string(),
        status: "created".to_string(),
        file_path: Some(categorical_path.to_string_lossy().to_string()),
        message: format!("{} categorical found ({} analyzed, {} id-like skipped)", categorical_count, text_columns.len(), skipped_count),
        duration_ms: start.elapsed().as_millis() as u64,
    })
}

// ============================================================================
// Step 3: Analyze Table Data (definition_analysis.json) - AI-powered
// ============================================================================

#[command]
pub async fn val_analyze_table_data(
    domain: String,
    table_name: String,
    overwrite: bool,
) -> Result<TablePipelineResult, String> {
    let start = std::time::Instant::now();
    eprintln!("[tv-client] val_analyze_table_data: domain={}, table={}, overwrite={}", domain, table_name, overwrite);
    let domain_config = get_domain_config(&domain)?;
    let global_path = &domain_config.global_path;
    eprintln!("[tv-client]   global_path={}", global_path);

    let table_folder = Path::new(global_path)
        .join("data_models")
        .join(format!("table_{}", table_name));
    let analysis_path = table_folder.join("definition_analysis.json");
    let details_path = table_folder.join("definition_details.json");
    let sample_path = table_folder.join("definition_sample.json");

    // Skip if exists and not overwriting
    if !overwrite && analysis_path.exists() {
        return Ok(TablePipelineResult {
            domain,
            table_name,
            step: "analyze-table-data".to_string(),
            status: "skipped".to_string(),
            file_path: Some(analysis_path.to_string_lossy().to_string()),
            message: "definition_analysis.json already exists".to_string(),
            duration_ms: start.elapsed().as_millis() as u64,
        });
    }

    // Check prerequisites
    if !details_path.exists() {
        return Ok(TablePipelineResult {
            domain,
            table_name,
            step: "analyze-table-data".to_string(),
            status: "skipped".to_string(),
            file_path: None,
            message: "definition_details.json not found - run prepare-table-overview first".to_string(),
            duration_ms: start.elapsed().as_millis() as u64,
        });
    }

    // Get API key
    let api_key = settings::settings_get_anthropic_key()?
        .ok_or("Anthropic API key not configured. Add it in Settings.")?;

    // Load details and sample
    let details: Value =
        load_json_file(&details_path).ok_or("Failed to parse definition_details.json")?;
    let sample: Option<Value> = load_json_file(&sample_path);

    // Build context for AI
    let mut context_parts = Vec::new();
    context_parts.push(format!(
        "## Table: {} ({})",
        details["meta"]["displayName"].as_str().unwrap_or(&table_name),
        table_name
    ));
    context_parts.push(format!(
        "Space: {}, Zone: {}",
        details["meta"]["space"].as_str().unwrap_or("Unknown"),
        details["meta"]["zone"].as_str().unwrap_or("Unknown")
    ));
    context_parts.push(format!(
        "Table Type: {}, Data Source: {}",
        details["meta"]["tableType"].as_str().unwrap_or("unknown"),
        details["meta"]["dataSource"].as_str().unwrap_or("unknown")
    ));
    context_parts.push(format!(
        "Row Count: {}",
        details["health"]["rowCount"]
            .as_i64()
            .map(|n| n.to_string())
            .unwrap_or_else(|| "Unknown".to_string())
    ));
    context_parts.push(String::new());

    // Add data columns
    context_parts.push("### Data Columns:".to_string());
    if let Some(cols) = details["columns"]["data"].as_array() {
        for col in cols.iter().take(30) {
            context_parts.push(format!(
                "- {} ({}): {}",
                col["name"].as_str().unwrap_or("?"),
                col["column"].as_str().unwrap_or("?"),
                col["type"].as_str().unwrap_or("?")
            ));
        }
        if cols.len() > 30 {
            context_parts.push(format!("... and {} more columns", cols.len() - 30));
        }
    }

    // Add calculated columns
    if let Some(cols) = details["columns"]["calculated"].as_array() {
        if !cols.is_empty() {
            context_parts.push(String::new());
            context_parts.push("### Calculated Columns:".to_string());
            for col in cols.iter().take(20) {
                let lookup_info = col["lookupTable"]
                    .as_object()
                    .map(|lt| format!(" from {}", lt.get("displayName").and_then(|v| v.as_str()).unwrap_or("?")))
                    .unwrap_or_default();
                context_parts.push(format!(
                    "- {}: {}{}",
                    col["name"].as_str().unwrap_or("?"),
                    col["ruleType"].as_str().unwrap_or("?"),
                    lookup_info
                ));
            }
        }
    }

    // Add related tables
    if let Some(tables) = details["relationships"]["relatedTables"].as_array() {
        if !tables.is_empty() {
            context_parts.push(String::new());
            context_parts.push("### Related Tables:".to_string());
            for t in tables {
                context_parts.push(format!(
                    "- {} ({} fields)",
                    t["displayName"].as_str().unwrap_or("?"),
                    t["fieldCount"].as_i64().unwrap_or(0)
                ));
            }
        }
    }

    // Build mapping from db column ID to field name (from definition_details.json)
    // This ensures AI uses exact field names that appear in overview.md
    let mut db_col_to_field_name: HashMap<String, String> = HashMap::new();
    if let Some(data_cols) = details["columns"]["data"].as_array() {
        for col in data_cols {
            if let (Some(db_col), Some(field_name)) = (
                col["column"].as_str(),
                col["name"].as_str()
            ) {
                db_col_to_field_name.insert(db_col.to_lowercase(), field_name.to_string());
            }
        }
    }

    // Add sample data and column stats for field descriptions
    if let Some(ref s) = sample {
        // Add column stats with sample values for AI to describe
        if let Some(stats) = s["columnStats"].as_object() {
            context_parts.push(String::new());
            context_parts.push("### Column Details (use exact field name as key):".to_string());

            // Collect and sort by field name
            let mut col_entries: Vec<_> = stats.iter().collect();
            col_entries.sort_by(|(a, _), (b, _)| a.cmp(b));

            for (col_id, stat) in col_entries.iter() {
                // Use field name from definition_details.json (exact match for overview.md)
                let field_name = db_col_to_field_name
                    .get(&col_id.to_lowercase())
                    .map(|s| s.as_str())
                    .unwrap_or(col_id);
                let col_type = stat["type"].as_str().unwrap_or("?");
                let distinct_count = stat["distinctCount"].as_i64().unwrap_or(0);

                let values_str = if let Some(values) = stat["distinctValues"].as_array() {
                    let vals: Vec<&str> = values.iter()
                        .take(5)
                        .filter_map(|v| v.as_str())
                        .collect();
                    if vals.is_empty() {
                        String::new()
                    } else {
                        format!(" values: {}", vals.join(", "))
                    }
                } else {
                    String::new()
                };

                // Show field name exactly as it appears in definition_details.json
                context_parts.push(format!(
                    "- {}: {} type, {} distinct{}",
                    field_name, col_type, distinct_count, values_str
                ));
            }
        }

        // Add a few sample rows for context
        if let Some(rows) = s["rows"].as_array() {
            if !rows.is_empty() {
                context_parts.push(String::new());
                context_parts.push(format!("### Sample Rows ({} rows available):", rows.len()));
                let sample_cols: Vec<&str> = s["columns"]
                    .as_array()
                    .map(|cols| {
                        cols.iter()
                            .take(10)
                            .filter_map(|c| c["column"].as_str())
                            .collect()
                    })
                    .unwrap_or_default();

                for row in rows.iter().take(3) {
                    let row_data: Vec<String> = sample_cols
                        .iter()
                        .map(|col| {
                            let val = &row[*col];
                            if val.is_null() {
                                "-".to_string()
                            } else if val.is_object() {
                                let s = val.to_string();
                                if s.len() > 20 {
                                    format!("{}...", &s[..17])
                                } else {
                                    s
                                }
                            } else {
                                let s = val.to_string().replace('"', "");
                                if s.len() > 20 {
                                    format!("{}...", &s[..17])
                                } else {
                                    s
                                }
                            }
                        })
                        .collect();
                    context_parts.push(format!("  {}", row_data.join(" | ")));
                }
            }
        }
    }

    let table_context = context_parts.join("\n");

    // Build system prompt
    let data_types_list = STANDARD_DATA_TYPES
        .iter()
        .map(|t| format!("- {}", t))
        .collect::<Vec<_>>()
        .join("\n");

    let system_prompt = format!(
        r#"You are a data analyst expert. Analyze the provided table metadata and sample data to classify and describe the table AND its columns.

Standard data types to classify into:
{}

Data categories: Mapping, Master List, Transaction, Report, Staging, Archive, System, GL, AP, AR, Receipt, Payment, Fee, Tax, Product, Stock, Order, Delivery, Customer, Employee, Other
Data sub-categories: Outlet, Brand, Platform, Fulfilment Type, Other
Tags (use 3-6 relevant tags): Mapping, Outlet, Brand, Platform, Manual Upload, Outlet Mapping, GL Entry, Journal, In Use, Receipt, Transaction, POS, Delivery, Payment, Refund, Settlement, Commission, Fee, Tax, Master Data, Configuration, Historical, Archive
Usage status: In Use (table has recent data/actively used), Not Used (appears unused), Historically Used (has old data only), I Dunno (unclear)

Respond ONLY with valid JSON in this exact format:
{{
  "classification": {{
    "dataType": "one of the standard types above",
    "confidence": "high | medium | low",
    "reasoning": "brief explanation"
  }},
  "dataCategory": "one of the data categories above",
  "dataSubCategory": "one of the data sub-categories above",
  "tags": "comma-separated tags describing the table (3-6 tags from the list above or new relevant tags)",
  "usageStatus": "one of: In Use, Not Used, Historically Used, I Dunno - based on row count and data freshness",
  "suggestedName": "A clear, descriptive name for this table",
  "summary": {{
    "short": "One line description (max 100 chars)",
    "full": "2-3 sentence detailed description"
  }},
  "useCases": {{
    "operational": ["3-5 operational use cases"],
    "strategic": ["3-5 strategic/analytical use cases"]
  }},
  "columnDescriptions": {{
    "Fieldname": "Brief description of what this column contains and its purpose",
    "Anotherfield": "Description based on the name and sample values"
  }}
}}

For columnDescriptions:
- Use the EXACT field name as the key (e.g., "Businessdate", "Totalamount" - exactly as shown in the column list)
- Describe what the column stores based on its name and sample values
- Keep descriptions concise (1 sentence)
- Describe ALL columns provided, not just a subset"#,
        data_types_list
    );

    let user_prompt = format!("Analyze this table:\n\n{}", table_context);

    // Call Anthropic API
    eprintln!("[tv-client]   Calling Anthropic API for table: {} (context len: {} chars)", table_name, table_context.len());
    let client = reqwest::Client::new();
    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("Content-Type", "application/json")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&json!({
            "model": "claude-haiku-4-5-20251001",
            "max_tokens": 16000,
            "temperature": 0.3,
            "system": system_prompt,
            "messages": [
                {
                    "role": "user",
                    "content": user_prompt
                }
            ]
        }))
        .send()
        .await
        .map_err(|e| {
            eprintln!("[tv-client]   API request failed: {}", e);
            format!("API request failed: {}", e)
        })?;

    eprintln!("[tv-client]   API response status: {}", response.status());
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        eprintln!("[tv-client]   API error body: {}", &body[..body.len().min(500)]);
        return Err(format!("Anthropic API error ({}): {}", status, body));
    }

    let api_response: AnthropicResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse API response: {}", e))?;

    let ai_text = api_response
        .content
        .first()
        .and_then(|c| c.text.clone())
        .ok_or("No text in API response")?;

    // Parse AI response
    let analysis: Value = {
        let text = ai_text.trim();
        // Try to extract JSON from markdown code blocks
        let json_str = if let Some(start) = text.find("```json") {
            let after = &text[start + 7..];
            if let Some(end) = after.find("```") {
                &after[..end]
            } else {
                text
            }
        } else if let Some(start) = text.find("```") {
            let after = &text[start + 3..];
            let json_start = after.find('\n').map(|i| i + 1).unwrap_or(0);
            let after = &after[json_start..];
            if let Some(end) = after.find("```") {
                &after[..end]
            } else {
                text
            }
        } else {
            text
        };

        serde_json::from_str(json_str.trim())
            .map_err(|e| format!("Failed to parse AI response as JSON: {}", e))?
    };

    // Build output
    let now: DateTime<Utc> = Utc::now();
    let analysis_data = json!({
        "meta": {
            "tableName": table_name,
            "displayName": details["meta"]["displayName"],
            "analyzedAt": now.to_rfc3339(),
            "model": "claude-haiku-4-5-20251001",
            "basedOn": {
                "detailsJson": true,
                "sampleJson": sample.is_some()
            }
        },
        "classification": analysis["classification"],
        "dataCategory": analysis["dataCategory"],
        "dataSubCategory": analysis["dataSubCategory"],
        "tags": analysis["tags"],
        "usageStatus": analysis["usageStatus"],
        "suggestedName": analysis["suggestedName"],
        "summary": analysis["summary"],
        "useCases": analysis["useCases"],
        "columnDescriptions": analysis["columnDescriptions"]
    });

    // Write definition_analysis.json
    let content = serde_json::to_string_pretty(&analysis_data)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    fs::write(&analysis_path, content)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    let data_type = analysis["classification"]["dataType"]
        .as_str()
        .unwrap_or("Unknown");

    Ok(TablePipelineResult {
        domain,
        table_name,
        step: "analyze-table-data".to_string(),
        status: "created".to_string(),
        file_path: Some(analysis_path.to_string_lossy().to_string()),
        message: format!("Classified as: {}", data_type),
        duration_ms: start.elapsed().as_millis() as u64,
    })
}

// ============================================================================
// Step 4: Extract Table Calc Fields (definition_calculated_fields.json)
// ============================================================================

#[command]
pub async fn val_extract_table_calc_fields(
    domain: String,
    table_name: String,
    overwrite: bool,
) -> Result<TablePipelineResult, String> {
    let start = std::time::Instant::now();
    let domain_config = get_domain_config(&domain)?;
    let global_path = &domain_config.global_path;

    let table_folder = Path::new(global_path)
        .join("data_models")
        .join(format!("table_{}", table_name));
    let output_path = table_folder.join("definition_calculated_fields.json");
    let all_calc_fields_path = Path::new(global_path).join("all_calculated_fields.json");
    let all_tables_path = Path::new(global_path).join("all_tables.json");

    // Skip if exists and not overwriting
    if !overwrite && output_path.exists() {
        return Ok(TablePipelineResult {
            domain,
            table_name,
            step: "extract-table-calc-fields".to_string(),
            status: "skipped".to_string(),
            file_path: Some(output_path.to_string_lossy().to_string()),
            message: "definition_calculated_fields.json already exists".to_string(),
            duration_ms: start.elapsed().as_millis() as u64,
        });
    }

    if !table_folder.exists() {
        return Ok(TablePipelineResult {
            domain,
            table_name,
            step: "extract-table-calc-fields".to_string(),
            status: "skipped".to_string(),
            file_path: None,
            message: "table folder not found".to_string(),
            duration_ms: start.elapsed().as_millis() as u64,
        });
    }

    if !all_calc_fields_path.exists() {
        return Err(format!(
            "all_calculated_fields.json not found at {:?}",
            all_calc_fields_path
        ));
    }

    // Load data
    let all_calc_fields: Vec<CalcFieldEntry> =
        load_json_file(&all_calc_fields_path).ok_or("Failed to parse all_calculated_fields.json")?;
    let all_tables: Vec<AllTablesNode> =
        load_json_file(&all_tables_path).unwrap_or_default();

    // Build table display names lookup
    let mut table_display_names: HashMap<String, String> = HashMap::new();
    let mut table_metadata: HashMap<String, TableMeta> = HashMap::new();
    traverse_all_tables(&all_tables, "", "", &mut table_metadata);
    for (k, v) in &table_metadata {
        table_display_names.insert(k.clone(), v.display_name.clone());
    }

    // Filter calc fields for this table
    let table_calc_fields: Vec<_> = all_calc_fields
        .iter()
        .filter(|cf| {
            cf.temp_id.as_ref() == Some(&table_name) || cf.id.as_ref() == Some(&table_name)
        })
        .collect();

    if table_calc_fields.is_empty() {
        // Write empty result
        let now: DateTime<Utc> = Utc::now();
        let empty_output = json!({
            "meta": {
                "tableName": table_name,
                "displayName": table_display_names.get(&table_name).cloned().unwrap_or_else(|| table_name.clone()),
                "extractedAt": now.to_rfc3339(),
                "extractedBy": "tv-client",
                "sourceFile": "all_calculated_fields.json"
            },
            "summary": {
                "totalFields": 0,
                "byRuleType": {},
                "lookupTables": []
            },
            "fields": []
        });

        let content = serde_json::to_string_pretty(&empty_output)
            .map_err(|e| format!("Failed to serialize: {}", e))?;
        fs::write(&output_path, content)
            .map_err(|e| format!("Failed to write file: {}", e))?;

        return Ok(TablePipelineResult {
            domain,
            table_name,
            step: "extract-table-calc-fields".to_string(),
            status: "created".to_string(),
            file_path: Some(output_path.to_string_lossy().to_string()),
            message: "0 calculated fields".to_string(),
            duration_ms: start.elapsed().as_millis() as u64,
        });
    }

    // Parse each calculated field
    let mut fields: Vec<Value> = Vec::new();
    let mut rule_type_counts: HashMap<String, i32> = HashMap::new();
    let mut lookup_tables_map: HashMap<String, Value> = HashMap::new();

    for cf in &table_calc_fields {
        if let Some(ref settings) = cf.settings {
            if let Some(ref rf) = settings.rule_field {
                let field_name = rf.name.clone().unwrap_or_default();
                let rules = rf.rules.as_ref();
                let rule_type = rules
                    .and_then(|r| r.get("rule_name"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string();

                let db_column = cf
                    .db_column_name
                    .clone()
                    .or_else(|| {
                        rules
                            .and_then(|r| r.get("db_column_name"))
                            .and_then(|v| v.as_str())
                            .map(String::from)
                    })
                    .or_else(|| {
                        settings
                            .db_column_name
                            .clone()
                    });

                let data_type = settings
                    .data_type
                    .clone()
                    .or_else(|| {
                        rules
                            .and_then(|r| r.get("data_type"))
                            .and_then(|v| v.as_str())
                            .map(String::from)
                    })
                    .unwrap_or_else(|| "unknown".to_string());

                // Count rule types
                *rule_type_counts.entry(rule_type.clone()).or_insert(0) += 1;

                let mut field = json!({
                    "name": field_name,
                    "column": db_column,
                    "type": data_type,
                    "ruleType": rule_type,
                    "rawDefinition": rules
                });

                // Parse rule-specific details
                if rule_type == "vlookup" || rule_type == "rollup" {
                    if let Some(lookup_data) = rules.and_then(|r| r.get("data")).and_then(|d| d.get(0)) {
                        let lookup_table_name = lookup_data
                            .get("table")
                            .and_then(|v| v.as_str())
                            .or_else(|| rules.and_then(|r| r.get("table")).and_then(|v| v.as_str()));

                        if let Some(lt) = lookup_table_name {
                            let display = table_display_names.get(lt).cloned().unwrap_or_else(|| lt.to_string());
                            field["lookup"] = json!({
                                "tableName": lt,
                                "displayName": display,
                                "refColumn": lookup_data.get("ref_column"),
                                "valueColumn": lookup_data.get("value_column"),
                                "elseValue": lookup_data.get("else_value")
                            });

                            // Track lookup table
                            let entry = lookup_tables_map.entry(lt.to_string()).or_insert_with(|| {
                                json!({
                                    "tableName": lt,
                                    "displayName": display,
                                    "fieldCount": 0
                                })
                            });
                            if let Some(count) = entry.get_mut("fieldCount") {
                                *count = json!(count.as_i64().unwrap_or(0) + 1);
                            }
                        }
                    }
                } else if rule_type == "constant" {
                    field["constantValue"] = rules
                        .and_then(|r| r.get("value"))
                        .cloned()
                        .unwrap_or(Value::Null);
                } else if rule_type == "formula" {
                    field["formula"] = rules
                        .and_then(|r| r.get("formula"))
                        .or(rf.formula.as_ref().map(|f| Value::String(f.clone())).as_ref())
                        .cloned()
                        .unwrap_or(Value::Null);
                }

                fields.push(field);
            }
        }
    }

    // Build output
    let now: DateTime<Utc> = Utc::now();
    let output = json!({
        "meta": {
            "tableName": table_name,
            "displayName": table_display_names.get(&table_name).cloned().unwrap_or_else(|| table_name.clone()),
            "extractedAt": now.to_rfc3339(),
            "extractedBy": "tv-client",
            "sourceFile": "all_calculated_fields.json"
        },
        "summary": {
            "totalFields": fields.len(),
            "byRuleType": rule_type_counts,
            "lookupTables": lookup_tables_map.values().cloned().collect::<Vec<_>>()
        },
        "fields": fields
    });

    // Write file
    let content = serde_json::to_string_pretty(&output)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    fs::write(&output_path, content)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    let rule_types_str: String = rule_type_counts
        .iter()
        .map(|(k, v)| format!("{}:{}", k, v))
        .collect::<Vec<_>>()
        .join(", ");

    Ok(TablePipelineResult {
        domain,
        table_name,
        step: "extract-table-calc-fields".to_string(),
        status: "created".to_string(),
        file_path: Some(output_path.to_string_lossy().to_string()),
        message: format!(
            "{} fields ({}), {} lookup tables",
            fields.len(),
            rule_types_str,
            lookup_tables_map.len()
        ),
        duration_ms: start.elapsed().as_millis() as u64,
    })
}

// ============================================================================
// Step 5: Generate Table Overview (overview.md)
// ============================================================================

#[command]
pub async fn val_generate_table_overview_md(
    domain: String,
    table_name: String,
    overwrite: bool,
) -> Result<TablePipelineResult, String> {
    let start = std::time::Instant::now();
    let domain_config = get_domain_config(&domain)?;
    let global_path = &domain_config.global_path;

    let table_folder = Path::new(global_path)
        .join("data_models")
        .join(format!("table_{}", table_name));
    let overview_path = table_folder.join("overview.md");
    let details_path = table_folder.join("definition_details.json");
    let analysis_path = table_folder.join("definition_analysis.json");
    let calc_fields_path = table_folder.join("definition_calculated_fields.json");
    let sample_path = table_folder.join("definition_sample.json");
    let categorical_path = table_folder.join("definition_categorical.json");

    // Skip if exists and not overwriting
    if !overwrite && overview_path.exists() {
        return Ok(TablePipelineResult {
            domain,
            table_name,
            step: "generate-table-overview".to_string(),
            status: "skipped".to_string(),
            file_path: Some(overview_path.to_string_lossy().to_string()),
            message: "overview.md already exists".to_string(),
            duration_ms: start.elapsed().as_millis() as u64,
        });
    }

    if !details_path.exists() {
        return Ok(TablePipelineResult {
            domain,
            table_name,
            step: "generate-table-overview".to_string(),
            status: "skipped".to_string(),
            file_path: None,
            message: "no definition_details.json".to_string(),
            duration_ms: start.elapsed().as_millis() as u64,
        });
    }

    // Load JSON files
    let details: Value =
        load_json_file(&details_path).ok_or("Failed to parse definition_details.json")?;
    let analysis: Option<Value> = load_json_file(&analysis_path);
    let calc_fields: Option<Value> = load_json_file(&calc_fields_path);
    let sample: Option<Value> = load_json_file(&sample_path);
    let categorical: Option<Value> = load_json_file(&categorical_path);

    // Get today's date
    let today = Utc::now().format("%Y-%m-%d").to_string();

    // Build overview markdown
    let mut lines: Vec<String> = Vec::new();

    // Frontmatter
    let display_name = details["meta"]["displayName"]
        .as_str()
        .unwrap_or(&table_name);
    let suggested_name = analysis
        .as_ref()
        .and_then(|a| a["suggestedName"].as_str())
        .unwrap_or(display_name);
    let data_type = analysis
        .as_ref()
        .and_then(|a| a["classification"]["dataType"].as_str())
        .unwrap_or("Unknown");
    let summary_fallback = format!("Data table for {}", display_name);
    let summary = analysis
        .as_ref()
        .and_then(|a| a["summary"]["short"].as_str())
        .unwrap_or(&summary_fallback);

    lines.push("---".to_string());
    lines.push(format!("title: \"{}\"", display_name));
    lines.push(format!("summary: \"{}\"", summary.replace('"', "\\\"")));
    lines.push(String::new());
    lines.push(format!("created: {}", today));
    lines.push(format!("updated: {}", today));
    lines.push("author: \"tv-client\"".to_string());
    lines.push(format!(
        "tags: [data-model, {}, {}]",
        details["meta"]["tableType"].as_str().unwrap_or("unknown"),
        domain
    ));
    lines.push("status: published".to_string());
    lines.push("category: platform".to_string());
    lines.push(String::new());
    lines.push("ai_generated: true".to_string());
    lines.push("last_reviewed:".to_string());
    lines.push("reviewed_by: \"\"".to_string());
    lines.push("---".to_string());
    lines.push(String::new());

    // Title
    lines.push(format!("# {}", display_name));
    lines.push(String::new());
    lines.push(format!("**Suggested Name:** `{}`", suggested_name));
    lines.push(String::new());

    // Metadata table
    lines.push("| Property | Value |".to_string());
    lines.push("|----------|-------|".to_string());
    lines.push(format!("| **Table Name** | `{}` |", table_name));
    lines.push(format!("| **Display Name** | {} |", display_name));
    lines.push(format!(
        "| **Space** | {} |",
        details["meta"]["space"].as_str().unwrap_or("Unknown")
    ));
    lines.push(format!(
        "| **Zone** | {} |",
        details["meta"]["zone"].as_str().unwrap_or("Unknown")
    ));
    lines.push(format!(
        "| **Table Type** | {} |",
        capitalize_first(details["meta"]["tableType"].as_str().unwrap_or("Unknown"))
    ));
    lines.push(format!("| **Data Category** | {} |",
        analysis.as_ref().and_then(|a| a["dataCategory"].as_str()).unwrap_or(data_type)
    ));

    // Add Sub Category if available
    if let Some(sub_cat) = analysis.as_ref().and_then(|a| a["dataSubCategory"].as_str()) {
        lines.push(format!("| **Data Sub Category** | {} |", sub_cat));
    }

    lines.push(format!(
        "| **Data Source** | {} |",
        format_data_source(details["meta"]["dataSource"].as_str().unwrap_or("unknown"))
    ));

    // Add Usage Status if available
    if let Some(status) = analysis.as_ref().and_then(|a| a["usageStatus"].as_str()) {
        lines.push(format!("| **Usage Status** | {} |", status));
    }

    // Add Action if available
    if let Some(action) = analysis.as_ref().and_then(|a| a["action"].as_str()) {
        lines.push(format!("| **Action** | {} |", action));
    }

    // Add Tags if available
    if let Some(tags) = analysis.as_ref().and_then(|a| a["tags"].as_str()) {
        if !tags.is_empty() {
            lines.push(format!("| **Tags** | {} |", tags));
        }
    }

    lines.push(String::new());

    // Summary section
    lines.push("## Summary".to_string());
    lines.push(String::new());
    if let Some(full_summary) = analysis
        .as_ref()
        .and_then(|a| a["summary"]["full"].as_str())
    {
        lines.push(full_summary.to_string());
    } else {
        lines.push(format!(
            "This table stores {} data.",
            display_name.to_lowercase()
        ));
    }
    lines.push(String::new());
    lines.push("---".to_string());
    lines.push(String::new());

    // Health Status
    lines.push("## Health Status".to_string());
    lines.push(String::new());
    let health_score = details["health"]["score"].as_i64();
    let health_status = match health_score {
        Some(s) if s >= 80 => "Good",
        Some(s) if s >= 50 => "Fair",
        Some(_) => "Needs Attention",
        None => "Unknown",
    };

    lines.push("| Metric | Value | Status |".to_string());
    lines.push("|--------|-------|--------|".to_string());
    lines.push(format!(
        "| **Health Score** | {} | {} |",
        health_score.map(|s| s.to_string()).unwrap_or_else(|| "Unknown".to_string()),
        health_status
    ));
    lines.push(format!(
        "| **Total Records** | {} | - |",
        format_number(details["health"]["rowCount"].as_i64())
    ));

    if let Some(freshness_col) = details["health"]["freshnessColumnName"].as_str() {
        lines.push(format!("| **Freshness Column** | `{}` | - |", freshness_col));
    }

    if let Some(days) = details["health"]["daysSinceCreated"].as_i64() {
        let status = if days <= 1 {
            "Fresh"
        } else if days <= 7 {
            "Recent"
        } else if days <= 30 {
            "Aging"
        } else {
            "Stale"
        };
        lines.push(format!("| **Days Since Created** | {} | {} |", days, status));
    }

    if let Some(days) = details["health"]["daysSinceUpdate"].as_i64() {
        let freshness_col = details["health"]["freshnessColumnName"].as_str();
        if freshness_col.is_some() && freshness_col != Some("created_date") {
            let status = if days <= 1 {
                "Fresh"
            } else if days <= 7 {
                "Recent"
            } else if days <= 30 {
                "Aging"
            } else {
                "Stale"
            };
            lines.push(format!("| **Days Since Update** | {} | {} |", days, status));
        }
    }
    lines.push(String::new());

    // Dependencies
    if let Some(deps) = details["relationships"]["dependencies"].as_array() {
        if !deps.is_empty() {
            lines.push("### Dependencies".to_string());
            lines.push(String::new());

            let workflows: Vec<_> = deps
                .iter()
                .filter(|d| d["type"].as_str() == Some("workflow"))
                .collect();
            let queries: Vec<_> = deps
                .iter()
                .filter(|d| d["type"].as_str() == Some("query"))
                .collect();

            if !workflows.is_empty() {
                lines.push("**Workflows:**".to_string());
                for wf in workflows.iter().take(5) {
                    lines.push(format!(
                        "- Workflow {}: {}",
                        wf["id"].to_string().replace('"', ""),
                        wf["name"].as_str().unwrap_or("?")
                    ));
                }
                if workflows.len() > 5 {
                    lines.push(format!("- ... and {} more", workflows.len() - 5));
                }
                lines.push(String::new());
            }

            if !queries.is_empty() {
                lines.push(format!("**Queries ({} total):**", queries.len()));
                for q in queries.iter().take(5) {
                    lines.push(format!("- {}", q["name"].as_str().unwrap_or("?")));
                }
                if queries.len() > 5 {
                    lines.push(format!("- ... and {} more", queries.len() - 5));
                }
                lines.push(String::new());
            }
        }
    }

    lines.push("---".to_string());
    lines.push(String::new());

    // Column Reference
    lines.push("## Column Reference".to_string());
    lines.push(String::new());

    // System columns
    if let Some(cols) = details["columns"]["system"].as_array() {
        if !cols.is_empty() {
            lines.push(format!("### System Columns ({})", cols.len()));
            lines.push(String::new());
            lines.push("| Column | Type |".to_string());
            lines.push("|--------|------|".to_string());
            for col in cols {
                // Use name if non-empty, otherwise fall back to column
                let col_name = col["name"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .or(col["column"].as_str())
                    .unwrap_or("?");
                lines.push(format!(
                    "| `{}` | {} |",
                    col_name,
                    col["type"].as_str().unwrap_or("?")
                ));
            }
            lines.push(String::new());
        }
    }

    // Data fields - include AI descriptions if available
    // Always show column name (usr_xxx) for AI to map sample data
    if let Some(cols) = details["columns"]["data"].as_array() {
        if !cols.is_empty() {
            lines.push(format!("### Data Fields ({})", cols.len()));
            lines.push(String::new());

            // Check if we have column descriptions
            let col_descriptions = analysis
                .as_ref()
                .and_then(|a| a["columnDescriptions"].as_object());
            let has_descriptions = col_descriptions.is_some();

            if has_descriptions {
                lines.push("| Field Name | Column | Type | Description |".to_string());
                lines.push("|------------|--------|------|-------------|".to_string());
            } else {
                lines.push("| Field Name | Column | Type |".to_string());
                lines.push("|------------|--------|------|".to_string());
            }

            for col in cols.iter().take(30) {
                let field_name = col["name"].as_str().unwrap_or("?");
                let col_name = col["column"].as_str().unwrap_or("?");
                let col_type = col["type"].as_str().unwrap_or("?");

                if has_descriptions {
                    // Look up by exact field name (AI now uses exact field names from definition_details.json)
                    let desc = col_descriptions
                        .and_then(|d| d.get(field_name))
                        .and_then(|v| v.as_str())
                        .unwrap_or("-");
                    lines.push(format!(
                        "| {} | `{}` | {} | {} |",
                        field_name, col_name, col_type, desc
                    ));
                } else {
                    lines.push(format!(
                        "| {} | `{}` | {} |",
                        field_name, col_name, col_type
                    ));
                }
            }
            if cols.len() > 30 {
                if has_descriptions {
                    lines.push(format!("| ... | | ({} more fields) | |", cols.len() - 30));
                } else {
                    lines.push(format!("| ... | ({} more fields) | |", cols.len() - 30));
                }
            }
            lines.push(String::new());
        }
    }

    // Calculated fields
    let calc_field_count = calc_fields
        .as_ref()
        .and_then(|cf| cf["summary"]["totalFields"].as_i64())
        .or_else(|| {
            details["columns"]["calculated"]
                .as_array()
                .map(|a| a.len() as i64)
        })
        .unwrap_or(0);

    if calc_field_count > 0 {
        lines.push(format!("### Calculated Fields ({})", calc_field_count));
        lines.push(String::new());

        if let Some(ref cf) = calc_fields {
            if let Some(fields) = cf["fields"].as_array() {
                lines.push("| Field Name | Rule Type | Lookup Table |".to_string());
                lines.push("|------------|-----------|--------------|".to_string());
                for field in fields.iter().take(20) {
                    let lookup_info = field["lookup"]["displayName"]
                        .as_str()
                        .unwrap_or("-");
                    lines.push(format!(
                        "| {} | {} | {} |",
                        field["name"].as_str().unwrap_or("?"),
                        field["ruleType"].as_str().unwrap_or("?"),
                        lookup_info
                    ));
                }
                if fields.len() > 20 {
                    lines.push(format!("| ... | ({} more) | |", fields.len() - 20));
                }
            }
        } else if let Some(cols) = details["columns"]["calculated"].as_array() {
            lines.push("| Field Name | Rule Type | Lookup Table |".to_string());
            lines.push("|------------|-----------|--------------|".to_string());
            for col in cols.iter().take(20) {
                let lookup_info = col["lookupTable"]["displayName"]
                    .as_str()
                    .unwrap_or("-");
                lines.push(format!(
                    "| {} | {} | {} |",
                    col["name"].as_str().unwrap_or("?"),
                    col["ruleType"].as_str().unwrap_or("?"),
                    lookup_info
                ));
            }
            if cols.len() > 20 {
                lines.push(format!("| ... | ({} more) | |", cols.len() - 20));
            }
        }
        lines.push(String::new());
    }

    // Lineage
    let has_source = details["relationships"]["sourceWorkflow"].is_object();
    let has_downstream = details["relationships"]["downstreamWorkflows"]
        .as_array()
        .map(|a| !a.is_empty())
        .unwrap_or(false);
    let has_related = details["relationships"]["relatedTables"]
        .as_array()
        .map(|a| !a.is_empty())
        .unwrap_or(false);

    if has_source || has_downstream || has_related {
        lines.push("---".to_string());
        lines.push(String::new());
        lines.push("## Lineage".to_string());
        lines.push(String::new());

        if has_source {
            let sw = &details["relationships"]["sourceWorkflow"];
            lines.push("### Source Workflow".to_string());
            lines.push(String::new());
            lines.push(format!(
                "This table is populated by **{}**.",
                sw["name"].as_str().unwrap_or("Unknown workflow")
            ));
            lines.push(String::new());

            if let Some(sources) = sw["sourceTables"].as_array() {
                if !sources.is_empty() {
                    lines.push("**Source Tables:**".to_string());
                    for src in sources {
                        lines.push(format!(
                            "- {} (`{}`)",
                            src["displayName"].as_str().unwrap_or("?"),
                            src["tableName"].as_str().unwrap_or("?")
                        ));
                    }
                    lines.push(String::new());
                }
            }
        }

        if has_downstream {
            if let Some(downstream) = details["relationships"]["downstreamWorkflows"].as_array() {
                lines.push("### Downstream Usage".to_string());
                lines.push(String::new());
                lines.push("This table is used as a source for:".to_string());
                for wf in downstream {
                    let target = wf["targetTable"]["displayName"]
                        .as_str()
                        .unwrap_or("Unknown");
                    lines.push(format!(
                        "- **{}** → {}",
                        wf["name"].as_str().unwrap_or("Unknown workflow"),
                        target
                    ));
                }
                lines.push(String::new());
            }
        }

        if has_related {
            if let Some(related) = details["relationships"]["relatedTables"].as_array() {
                lines.push("### Related Tables (via Lookups)".to_string());
                lines.push(String::new());
                for t in related {
                    lines.push(format!(
                        "- **{}** ({} fields)",
                        t["displayName"].as_str().unwrap_or("?"),
                        t["fieldCount"].as_i64().unwrap_or(0)
                    ));
                }
                lines.push(String::new());
            }
        }
    }

    // Categorical Columns section (for AI consumption)
    // Prefer data from definition_categorical.json, fall back to definition_sample.json
    let categorical_stats = categorical
        .as_ref()
        .and_then(|c| c["columns"].as_object())
        .or_else(|| sample.as_ref().and_then(|s| s["columnStats"].as_object()));

    if let Some(stats) = categorical_stats {
        // Collect categorical columns
        let mut categorical_cols: Vec<(&String, &Value)> = stats
            .iter()
            .filter(|(_, v)| v["isCategorical"].as_bool() == Some(true))
            .collect();
        categorical_cols.sort_by_key(|(name, _)| *name);

        if !categorical_cols.is_empty() {
            lines.push("## Categorical Columns".to_string());
            lines.push(String::new());
            lines.push("Columns with a limited set of distinct values:".to_string());
            lines.push(String::new());

            for (_col_name, stat) in categorical_cols {
                if let Some(values) = stat["distinctValues"].as_array() {
                    let display_name = stat["displayName"].as_str().unwrap_or(_col_name);
                    let distinct_count = stat["distinctCount"].as_i64().unwrap_or(values.len() as i64);
                    let values_str: Vec<&str> = values
                        .iter()
                        .filter_map(|v| v.as_str())
                        .collect();
                    lines.push(format!(
                        "- **{}** ({} values): {}",
                        display_name,
                        distinct_count,
                        values_str.join(", ")
                    ));
                }
            }
            lines.push(String::new());
        }
    }

    // Sample Data section (for AI consumption)
    // Transform internal column names (usr_xxx) to display names for AI readability
    if let Some(ref sample_data) = sample {
        if let Some(rows) = sample_data["rows"].as_array() {
            if !rows.is_empty() {
                lines.push("## Sample Data".to_string());
                lines.push(String::new());
                lines.push(format!(
                    "Representative sample of {} rows for AI/documentation purposes:",
                    rows.len().min(5)
                ));
                lines.push(String::new());
                lines.push("```json".to_string());

                // Build column name to display name mapping from columnStats
                let col_name_map: std::collections::HashMap<String, String> = sample_data["columnStats"]
                    .as_object()
                    .map(|stats| {
                        stats.iter()
                            .filter_map(|(col_name, stat)| {
                                stat["displayName"].as_str().map(|display| {
                                    (col_name.clone(), display.to_string())
                                })
                            })
                            .collect()
                    })
                    .unwrap_or_default();

                // Transform rows to use display names
                let transformed_rows: Vec<serde_json::Map<String, Value>> = rows
                    .iter()
                    .take(5)
                    .filter_map(|row| row.as_object())
                    .map(|row| {
                        row.iter()
                            .map(|(key, value)| {
                                let display_key = col_name_map.get(key).cloned().unwrap_or_else(|| key.clone());
                                (display_key, value.clone())
                            })
                            .collect()
                    })
                    .collect();

                if let Ok(json_str) = serde_json::to_string_pretty(&transformed_rows) {
                    lines.push(json_str);
                }

                lines.push("```".to_string());
                lines.push(String::new());
            }
        }
    }

    // Footer
    lines.push("---".to_string());
    lines.push(String::new());
    lines.push(format!("*Generated by tv-client on {}*", today));

    // Write overview.md
    let content = lines.join("\n");
    fs::write(&overview_path, content)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(TablePipelineResult {
        domain,
        table_name,
        step: "generate-table-overview".to_string(),
        status: "created".to_string(),
        file_path: Some(overview_path.to_string_lossy().to_string()),
        message: "overview.md generated".to_string(),
        duration_ms: start.elapsed().as_millis() as u64,
    })
}

// ============================================================================
// Pipeline Orchestrator: Run all steps
// ============================================================================

#[command]
pub async fn val_run_table_pipeline(
    domain: String,
    table_name: String,
    overwrite: bool,
    skip_steps: Option<String>,
) -> Result<PipelineRunResult, String> {
    let start = std::time::Instant::now();
    let domain_config = get_domain_config(&domain)?;
    let global_path = &domain_config.global_path;

    let data_models_path = Path::new(global_path).join("data_models");
    if !data_models_path.exists() {
        return Err(format!("data_models folder not found at {:?}", data_models_path));
    }

    // Parse skip steps
    let steps_to_skip: HashSet<String> = skip_steps
        .unwrap_or_default()
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    // Get tables to process
    let tables_to_process = get_tables_to_process(&data_models_path, &table_name);
    let total_tables = tables_to_process.len();

    let mut results: Vec<TablePipelineStepResult> = Vec::new();
    let mut processed = 0;
    let mut skipped = 0;
    let mut errored = 0;

    for (i, tbl) in tables_to_process.iter().enumerate() {
        let table_folder = data_models_path.join(format!("table_{}", tbl));
        if !table_folder.exists() {
            results.push(TablePipelineStepResult {
                table_name: tbl.clone(),
                status: "skipped".to_string(),
                steps: HashMap::new(),
                error: Some("folder not found".to_string()),
                output_folder: None,
                output_files: vec![],
            });
            skipped += 1;
            continue;
        }

        eprintln!(
            "[tv-client] Processing table {}/{}: {}",
            i + 1,
            total_tables,
            tbl
        );

        let mut table_result = TablePipelineStepResult {
            table_name: tbl.clone(),
            status: "completed".to_string(),
            steps: HashMap::new(),
            error: None,
            output_folder: Some(table_folder.to_string_lossy().to_string()),
            output_files: vec![],
        };

        // Step 1: prepare-table-overview
        if !steps_to_skip.contains("1") {
            eprintln!("[tv-client]   Step 1: prepare-table-overview");
            match val_prepare_table_overview(domain.clone(), tbl.clone(), overwrite, false, None).await {
                Ok(r) => {
                    table_result.steps.insert("1_details".to_string(), r.status);
                    if let Some(fp) = r.file_path {
                        table_result.output_files.push(fp);
                    }
                }
                Err(e) => {
                    table_result.steps.insert("1_details".to_string(), "error".to_string());
                    table_result.error = Some(e);
                    table_result.status = "error".to_string();
                }
            }
        } else {
            table_result.steps.insert("1_details".to_string(), "skipped".to_string());
        }

        // Step 2: sample-table-data
        if !steps_to_skip.contains("2") && table_result.status != "error" {
            eprintln!("[tv-client]   Step 2: sample-table-data");
            match val_sample_table_data(domain.clone(), tbl.clone(), Some(20), None, overwrite).await {
                Ok(r) => {
                    table_result.steps.insert("2_sample".to_string(), r.status);
                    if let Some(fp) = r.file_path {
                        table_result.output_files.push(fp);
                    }
                }
                Err(e) => {
                    table_result.steps.insert("2_sample".to_string(), "error".to_string());
                    table_result.error = Some(e);
                }
            }
        } else if steps_to_skip.contains("2") {
            table_result.steps.insert("2_sample".to_string(), "skipped".to_string());
        }

        // Step 3: analyze-table-data (requires Anthropic key)
        if !steps_to_skip.contains("3") && table_result.status != "error" {
            eprintln!("[tv-client]   Step 3: analyze-table-data");
            match val_analyze_table_data(domain.clone(), tbl.clone(), overwrite).await {
                Ok(r) => {
                    table_result.steps.insert("3_analyze".to_string(), r.status);
                    if let Some(fp) = r.file_path {
                        table_result.output_files.push(fp);
                    }
                }
                Err(e) => {
                    // Don't fail the whole pipeline if AI analysis fails
                    if e.contains("API key") {
                        table_result.steps.insert("3_analyze".to_string(), "skipped (no API key)".to_string());
                    } else {
                        table_result.steps.insert("3_analyze".to_string(), "error".to_string());
                        eprintln!("[tv-client]   Warning: analyze step failed: {}", e);
                    }
                }
            }
        } else if steps_to_skip.contains("3") {
            table_result.steps.insert("3_analyze".to_string(), "skipped".to_string());
        }

        // Step 4: extract-table-calc-fields
        if !steps_to_skip.contains("4") && table_result.status != "error" {
            eprintln!("[tv-client]   Step 4: extract-table-calc-fields");
            match val_extract_table_calc_fields(domain.clone(), tbl.clone(), overwrite).await {
                Ok(r) => {
                    table_result.steps.insert("4_calc_fields".to_string(), r.status);
                    if let Some(fp) = r.file_path {
                        table_result.output_files.push(fp);
                    }
                }
                Err(e) => {
                    table_result.steps.insert("4_calc_fields".to_string(), "error".to_string());
                    table_result.error = Some(e);
                }
            }
        } else if steps_to_skip.contains("4") {
            table_result.steps.insert("4_calc_fields".to_string(), "skipped".to_string());
        }

        // Step 5: generate overview.md
        if !steps_to_skip.contains("5") && table_result.status != "error" {
            eprintln!("[tv-client]   Step 5: generate overview.md");
            match val_generate_table_overview_md(domain.clone(), tbl.clone(), overwrite).await {
                Ok(r) => {
                    table_result.steps.insert("5_overview".to_string(), r.status);
                    if let Some(fp) = r.file_path {
                        table_result.output_files.push(fp);
                    }
                }
                Err(e) => {
                    table_result.steps.insert("5_overview".to_string(), "error".to_string());
                    table_result.error = Some(e);
                }
            }
        } else if steps_to_skip.contains("5") {
            table_result.steps.insert("5_overview".to_string(), "skipped".to_string());
        }

        if table_result.status == "error" {
            errored += 1;
        } else {
            processed += 1;
        }

        results.push(table_result);
    }

    Ok(PipelineRunResult {
        domain,
        tables_processed: processed,
        tables_skipped: skipped,
        tables_errored: errored,
        results,
        total_duration_ms: start.elapsed().as_millis() as u64,
    })
}

// ============================================================================
// Category Library Scanner
// ============================================================================

#[derive(Debug, Serialize)]
pub struct CategoryLibrary {
    pub data_types: Vec<CategoryEntry>,
    pub data_categories: Vec<CategoryEntry>,
    pub data_sub_categories: Vec<CategoryEntry>,
    pub usage_statuses: Vec<CategoryEntry>,
    pub actions: Vec<CategoryEntry>,
    pub data_sources: Vec<CategoryEntry>,
    pub total_tables_scanned: usize,
    pub domains_scanned: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct CategoryEntry {
    pub value: String,
    pub count: usize,
    pub domains: Vec<String>,
}

/// Scan all definition_analysis.json files across all domains to extract unique classification values
#[command]
pub async fn val_scan_category_library(state: State<'_, AppState>) -> Result<CategoryLibrary, String> {
    let base_path = &state.knowledge_path;

    let domains_path = Path::new(base_path).join("0_Platform/domains/production");

    let mut data_types: HashMap<String, (usize, HashSet<String>)> = HashMap::new();
    let mut data_categories: HashMap<String, (usize, HashSet<String>)> = HashMap::new();
    let mut data_sub_categories: HashMap<String, (usize, HashSet<String>)> = HashMap::new();
    let mut usage_statuses: HashMap<String, (usize, HashSet<String>)> = HashMap::new();
    let mut actions: HashMap<String, (usize, HashSet<String>)> = HashMap::new();
    let mut data_sources: HashMap<String, (usize, HashSet<String>)> = HashMap::new();

    let mut total_tables = 0;
    let mut domains_scanned: Vec<String> = Vec::new();

    // Read domains directory
    let domains_dir = fs::read_dir(&domains_path)
        .map_err(|e| format!("Failed to read domains directory: {}", e))?;

    for domain_entry in domains_dir.flatten() {
        if !domain_entry.path().is_dir() {
            continue;
        }

        let domain_name = domain_entry.file_name().to_string_lossy().to_string();
        let data_models_path = domain_entry.path().join("data_models");

        if !data_models_path.exists() {
            continue;
        }

        domains_scanned.push(domain_name.clone());

        // Read table directories
        let tables_dir = match fs::read_dir(&data_models_path) {
            Ok(dir) => dir,
            Err(_) => continue,
        };

        for table_entry in tables_dir.flatten() {
            if !table_entry.path().is_dir() {
                continue;
            }

            // Try to read from overview.md first (has the markdown table with all values)
            let overview_path = table_entry.path().join("overview.md");
            if overview_path.exists() {
                if let Ok(content) = fs::read_to_string(&overview_path) {
                    total_tables += 1;

                    // Parse markdown table rows: | **Property** | Value |
                    for line in content.lines() {
                        let line = line.trim();
                        if !line.starts_with('|') || !line.contains('|') {
                            continue;
                        }

                        // Extract value from: | **Data Category** | Mapping |
                        let parts: Vec<&str> = line.split('|').collect();
                        if parts.len() < 3 {
                            continue;
                        }

                        let key = parts[1].trim().replace("**", "").to_lowercase();
                        let value = parts[2].trim().to_string();

                        // Skip empty values, headers, or separator rows
                        if value.is_empty() || value == "Value" || value.starts_with('-') {
                            continue;
                        }

                        match key.as_str() {
                            "table type" | "data type" => {
                                let entry = data_types.entry(value).or_insert((0, HashSet::new()));
                                entry.0 += 1;
                                entry.1.insert(domain_name.clone());
                            }
                            "data category" => {
                                let entry = data_categories.entry(value).or_insert((0, HashSet::new()));
                                entry.0 += 1;
                                entry.1.insert(domain_name.clone());
                            }
                            "data sub category" => {
                                let entry = data_sub_categories.entry(value).or_insert((0, HashSet::new()));
                                entry.0 += 1;
                                entry.1.insert(domain_name.clone());
                            }
                            "data source" => {
                                let entry = data_sources.entry(value).or_insert((0, HashSet::new()));
                                entry.0 += 1;
                                entry.1.insert(domain_name.clone());
                            }
                            "usage status" => {
                                let entry = usage_statuses.entry(value).or_insert((0, HashSet::new()));
                                entry.0 += 1;
                                entry.1.insert(domain_name.clone());
                            }
                            "action" => {
                                let entry = actions.entry(value).or_insert((0, HashSet::new()));
                                entry.0 += 1;
                                entry.1.insert(domain_name.clone());
                            }
                            _ => {}
                        }
                    }
                    continue; // Skip definition_analysis.json if we got overview.md
                }
            }

            // Fallback to definition_analysis.json
            let analysis_path = table_entry.path().join("definition_analysis.json");
            if !analysis_path.exists() {
                continue;
            }

            let content = match fs::read_to_string(&analysis_path) {
                Ok(c) => c,
                Err(_) => continue,
            };

            let analysis: Value = match serde_json::from_str(&content) {
                Ok(v) => v,
                Err(_) => continue,
            };

            total_tables += 1;

            // Extract dataType from classification
            if let Some(dt) = analysis["classification"]["dataType"].as_str() {
                let entry = data_types.entry(dt.to_string()).or_insert((0, HashSet::new()));
                entry.0 += 1;
                entry.1.insert(domain_name.clone());
            }

            // Extract dataCategory
            if let Some(cat) = analysis["dataCategory"].as_str() {
                let entry = data_categories.entry(cat.to_string()).or_insert((0, HashSet::new()));
                entry.0 += 1;
                entry.1.insert(domain_name.clone());
            }

            // Extract dataSubCategory
            if let Some(sub) = analysis["dataSubCategory"].as_str() {
                let entry = data_sub_categories.entry(sub.to_string()).or_insert((0, HashSet::new()));
                entry.0 += 1;
                entry.1.insert(domain_name.clone());
            }

            // Extract usageStatus
            if let Some(status) = analysis["usageStatus"].as_str() {
                let entry = usage_statuses.entry(status.to_string()).or_insert((0, HashSet::new()));
                entry.0 += 1;
                entry.1.insert(domain_name.clone());
            }

            // Extract action
            if let Some(action) = analysis["action"].as_str() {
                let entry = actions.entry(action.to_string()).or_insert((0, HashSet::new()));
                entry.0 += 1;
                entry.1.insert(domain_name.clone());
            }

            // Also check meta.dataSource from definition_details.json
            let details_path = table_entry.path().join("definition_details.json");
            if details_path.exists() {
                if let Ok(details_content) = fs::read_to_string(&details_path) {
                    if let Ok(details) = serde_json::from_str::<Value>(&details_content) {
                        if let Some(src) = details["meta"]["dataSource"].as_str() {
                            let entry = data_sources.entry(src.to_string()).or_insert((0, HashSet::new()));
                            entry.0 += 1;
                            entry.1.insert(domain_name.clone());
                        }
                    }
                }
            }
        }
    }

    // Convert HashMaps to sorted vectors
    let to_entries = |map: HashMap<String, (usize, HashSet<String>)>| -> Vec<CategoryEntry> {
        let mut entries: Vec<_> = map
            .into_iter()
            .map(|(value, (count, domains))| CategoryEntry {
                value,
                count,
                domains: domains.into_iter().collect(),
            })
            .collect();
        entries.sort_by(|a, b| b.count.cmp(&a.count)); // Sort by count descending
        entries
    };

    Ok(CategoryLibrary {
        data_types: to_entries(data_types),
        data_categories: to_entries(data_categories),
        data_sub_categories: to_entries(data_sub_categories),
        usage_statuses: to_entries(usage_statuses),
        actions: to_entries(actions),
        data_sources: to_entries(data_sources),
        total_tables_scanned: total_tables,
        domains_scanned,
    })
}
