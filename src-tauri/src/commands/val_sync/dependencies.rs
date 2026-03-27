// VAL Domain Dependency Computation
// Parses all definition.json files in a domain folder, extracts cross-references,
// and outputs dependencies.json with the full resource dependency graph.

use crate::commands::error::{CmdResult, CommandError};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::time::Instant;
use tauri::command;

use super::config::get_domain_config;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyResult {
    pub domain: String,
    pub resource_count: usize,
    pub edge_count: usize,
    pub orphaned_count: usize,
    pub duration_ms: u64,
    pub status: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceNode {
    pub id: String,
    pub resource_type: String, // "table", "query", "dashboard", "workflow"
    pub name: String,
    pub depends_on: Vec<DependencyEdge>,
    pub depended_by: Vec<DependencyEdge>,
    // Workflow-specific fields for cost analysis
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cron_expression: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_scheduled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_run_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_run_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_deleted: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plugin_count: Option<usize>,
    // Table-specific: calculated field stats
    #[serde(skip_serializing_if = "Option::is_none")]
    pub calc_field_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub calc_field_rules: Option<HashMap<String, usize>>, // rule_name -> count (vlookup, rollup, linked, ifelse, etc.)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub calc_field_lookup_tables: Option<Vec<String>>, // tables referenced by vlookups
    #[serde(skip_serializing_if = "Option::is_none")]
    pub column_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub calc_fields: Option<Vec<CalcFieldInfo>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyEdge {
    pub id: String,
    pub resource_type: String,
    pub name: String,
    pub reference_type: String, // "table_ref", "query_ref", "dashboard_ref", "workflow_ref", "calc_lookup", "sql_ref"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyReport {
    pub computed_at: String,
    pub domain: String,
    pub resources: HashMap<String, ResourceNode>,
    pub summary: DependencySummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencySummary {
    pub total_resources: usize,
    pub total_edges: usize,
    pub by_type: HashMap<String, usize>,
    pub orphaned: OrphanedResources,
    pub critical: Vec<CriticalResource>,
    pub heavy_calc_tables: Vec<HeavyCalcTable>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeavyCalcTable {
    pub id: String,
    pub name: String,
    pub calc_field_count: usize,
    pub rules: HashMap<String, usize>,
    pub lookup_tables: Vec<String>,
    pub column_count: usize,
    pub fields: Vec<CalcFieldInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalcFieldInfo {
    pub name: String,
    pub rule_type: String,
    pub lookup_table: Option<String>,
    pub lookup_table_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrphanedResources {
    pub tables: Vec<String>,
    pub queries: Vec<String>,
    pub dashboards: Vec<String>,
    pub workflows: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CriticalResource {
    pub id: String,
    pub resource_type: String,
    pub name: String,
    pub dependent_count: usize,
}

// ============================================================================
// Internal: Resource name registry
// ============================================================================

/// Builds a map of resource_id -> display_name from all definition files
fn build_name_registry(global_path: &str) -> HashMap<String, (String, String)> {
    let mut registry: HashMap<String, (String, String)> = HashMap::new(); // id -> (type, name)

    // Tables from data_models
    let dm_dir = format!("{}/data_models", global_path);
    if let Ok(entries) = fs::read_dir(&dm_dir) {
        for entry in entries.flatten() {
            let fname = entry.file_name().to_string_lossy().to_string();
            if !fname.starts_with("table_") {
                continue;
            }
            let table_id = fname.trim_start_matches("table_").to_string();
            let def_path = format!("{}/{}/definition.json", dm_dir, fname);
            let name = read_json_field(&def_path, &["table_name"])
                .or_else(|| {
                    // Try definition_analysis for display name
                    let analysis_path = format!("{}/{}/definition_analysis.json", dm_dir, fname);
                    read_json_field(&analysis_path, &["meta", "displayName"])
                })
                .unwrap_or_else(|| table_id.clone());
            registry.insert(table_id, ("table".to_string(), name));
        }
    }

    // Queries
    let q_dir = format!("{}/queries", global_path);
    if let Ok(entries) = fs::read_dir(&q_dir) {
        for entry in entries.flatten() {
            let fname = entry.file_name().to_string_lossy().to_string();
            if !fname.starts_with("query_") {
                continue;
            }
            let query_id = fname.clone(); // keep as "query_123"
            let def_path = format!("{}/{}/definition.json", q_dir, fname);
            let name = read_json_field(&def_path, &["name"]).unwrap_or_else(|| query_id.clone());
            registry.insert(query_id, ("query".to_string(), name));
        }
    }

    // Dashboards
    let d_dir = format!("{}/dashboards", global_path);
    if let Ok(entries) = fs::read_dir(&d_dir) {
        for entry in entries.flatten() {
            let fname = entry.file_name().to_string_lossy().to_string();
            if !fname.starts_with("dashboard_") {
                continue;
            }
            let dashboard_id = fname.clone();
            let def_path = format!("{}/{}/definition.json", d_dir, fname);
            let name =
                read_json_field(&def_path, &["name"]).unwrap_or_else(|| dashboard_id.clone());
            registry.insert(dashboard_id, ("dashboard".to_string(), name));
        }
    }

    // Workflows
    let w_dir = format!("{}/workflows", global_path);
    if let Ok(entries) = fs::read_dir(&w_dir) {
        for entry in entries.flatten() {
            let fname = entry.file_name().to_string_lossy().to_string();
            if !fname.starts_with("workflow_") {
                continue;
            }
            let workflow_id = fname.clone();
            let def_path = format!("{}/{}/definition.json", w_dir, fname);
            let name =
                read_json_field(&def_path, &["name"]).unwrap_or_else(|| workflow_id.clone());
            registry.insert(workflow_id, ("workflow".to_string(), name));
        }
    }

    registry
}

// ============================================================================
// Internal: Reference extraction
// ============================================================================

/// Extract table references from calculated fields
fn extract_calc_field_refs(global_path: &str) -> Vec<(String, String, String)> {
    // Returns (source_table_id, target_table_id, ref_type)
    let mut refs = Vec::new();
    let dm_dir = format!("{}/data_models", global_path);

    let entries = match fs::read_dir(&dm_dir) {
        Ok(e) => e,
        Err(_) => return refs,
    };

    for entry in entries.flatten() {
        let fname = entry.file_name().to_string_lossy().to_string();
        if !fname.starts_with("table_") {
            continue;
        }
        let source_table = fname.trim_start_matches("table_").to_string();
        let cf_path = format!("{}/{}/definition_calculated_fields.json", dm_dir, fname);

        if let Ok(content) = fs::read_to_string(&cf_path) {
            if let Ok(data) = serde_json::from_str::<Value>(&content) {
                // Extract lookupTables from summary
                if let Some(lookups) = data
                    .get("summary")
                    .and_then(|s| s.get("lookupTables"))
                    .and_then(|l| l.as_array())
                {
                    for lookup in lookups {
                        if let Some(target) =
                            lookup.get("tableName").and_then(|t| t.as_str())
                        {
                            refs.push((
                                source_table.clone(),
                                target.to_string(),
                                "calc_lookup".to_string(),
                            ));
                        }
                    }
                }

                // Also scan field definitions for table references
                if let Some(fields) = data.get("fields").and_then(|f| f.as_array()) {
                    for field in fields {
                        if let Some(target) = field
                            .get("referenceTable")
                            .or_else(|| field.get("lookupTable"))
                            .and_then(|t| t.as_str())
                        {
                            if target != source_table {
                                refs.push((
                                    source_table.clone(),
                                    target.to_string(),
                                    "calc_lookup".to_string(),
                                ));
                            }
                        }
                    }
                }
            }
        }
    }

    refs
}

/// Extract query -> table references
fn extract_query_refs(global_path: &str) -> Vec<(String, String, String)> {
    let mut refs = Vec::new();
    let q_dir = format!("{}/queries", global_path);

    let entries = match fs::read_dir(&q_dir) {
        Ok(e) => e,
        Err(_) => return refs,
    };

    for entry in entries.flatten() {
        let fname = entry.file_name().to_string_lossy().to_string();
        if !fname.starts_with("query_") {
            continue;
        }
        let query_id = fname.clone();
        let def_path = format!("{}/{}/definition.json", q_dir, fname);

        if let Ok(content) = fs::read_to_string(&def_path) {
            if let Ok(data) = serde_json::from_str::<Value>(&content) {
                // Primary: datasource.queryInfo.tableInfo.id
                if let Some(table_id) = data
                    .get("datasource")
                    .and_then(|ds| ds.get("queryInfo"))
                    .and_then(|qi| qi.get("tableInfo"))
                    .and_then(|ti| ti.get("id"))
                    .and_then(|id| id.as_str())
                {
                    refs.push((
                        query_id.clone(),
                        table_id.to_string(),
                        "table_ref".to_string(),
                    ));
                }
            }
        }
    }

    refs
}

/// Extract dashboard -> query and dashboard -> table references
fn extract_dashboard_refs(global_path: &str) -> Vec<(String, String, String)> {
    let mut refs = Vec::new();
    let d_dir = format!("{}/dashboards", global_path);

    let entries = match fs::read_dir(&d_dir) {
        Ok(e) => e,
        Err(_) => return refs,
    };

    for entry in entries.flatten() {
        let fname = entry.file_name().to_string_lossy().to_string();
        if !fname.starts_with("dashboard_") {
            continue;
        }
        let dashboard_id = fname.clone();
        let def_path = format!("{}/{}/definition.json", d_dir, fname);

        if let Ok(content) = fs::read_to_string(&def_path) {
            if let Ok(data) = serde_json::from_str::<Value>(&content) {
                if let Some(widgets) = data.get("widgets").and_then(|w| w.as_array()) {
                    for widget in widgets {
                        // Widget -> query via datasource.dsid
                        if let Some(dsid) = widget
                            .get("settings")
                            .and_then(|s| s.get("datasource"))
                            .and_then(|ds| ds.get("dsid"))
                        {
                            let dsid_str = dsid
                                .as_u64()
                                .map(|n| format!("query_{}", n))
                                .or_else(|| dsid.as_str().map(|s| {
                                    if s.starts_with("query_") {
                                        s.to_string()
                                    } else {
                                        format!("query_{}", s)
                                    }
                                }));

                            if let Some(qid) = dsid_str {
                                refs.push((
                                    dashboard_id.clone(),
                                    qid,
                                    "query_ref".to_string(),
                                ));
                            }
                        }

                        // Widget -> table via column definitions
                        if let Some(encoding) = widget.get("settings").and_then(|s| s.get("encoding")) {
                            let encoding_str = encoding.to_string();
                            extract_table_ids_from_text(&encoding_str, &dashboard_id, &mut refs);
                        }
                    }
                }
            }
        }
    }

    refs
}

/// Extract workflow references using structured params + brute-force regex
fn extract_workflow_refs(global_path: &str) -> Vec<(String, String, String)> {
    let mut refs = Vec::new();
    let w_dir = format!("{}/workflows", global_path);

    let table_re = Regex::new(r"custom_tbl_\w+").unwrap();
    let query_re = Regex::new(r#""query_id"\s*:\s*(\d+)"#).unwrap();
    let dashboard_re = Regex::new(r#""dashboard_id"\s*:\s*(\d+)"#).unwrap();

    let entries = match fs::read_dir(&w_dir) {
        Ok(e) => e,
        Err(_) => return refs,
    };

    for entry in entries.flatten() {
        let fname = entry.file_name().to_string_lossy().to_string();
        if !fname.starts_with("workflow_") {
            continue;
        }
        let workflow_id = fname.clone();
        let def_path = format!("{}/{}/definition.json", w_dir, fname);

        if let Ok(content) = fs::read_to_string(&def_path) {
            // Structured extraction: workflow_executor_plugin -> child workflows
            if let Ok(data) = serde_json::from_str::<Value>(&content) {
                if let Some(plugins) = data
                    .get("data")
                    .and_then(|d| d.get("workflow"))
                    .and_then(|w| w.get("plugins"))
                    .and_then(|p| p.as_array())
                {
                    for plugin in plugins {
                        let plugin_name = plugin
                            .get("name")
                            .and_then(|n| n.as_str())
                            .unwrap_or("");

                        if plugin_name == "WorkflowExecutorPlugin" {
                            if let Some(params) = plugin.get("params") {
                                // workflow_id can be a single value or array
                                if let Some(wf_ids) = params.get("workflow_id") {
                                    extract_workflow_id_refs(
                                        wf_ids,
                                        &workflow_id,
                                        &mut refs,
                                    );
                                }
                            }
                        }

                        // MultiTabExcelReportPluginV2 -> datasource references
                        if plugin_name == "MultiTabExcelReportPluginV2"
                            || plugin_name == "ReportGeneratorPluginV2"
                        {
                            if let Some(params) = plugin.get("params") {
                                // Scan tabs for query datasources
                                let tabs = params
                                    .get("input")
                                    .and_then(|i| i.get("tabs"))
                                    .and_then(|t| t.as_array())
                                    .or_else(|| {
                                        params.get("tabs").and_then(|t| t.as_array())
                                    });

                                if let Some(tabs) = tabs {
                                    for tab in tabs {
                                        if let Some(ds) = tab.get("dataSource") {
                                            if let Some(dsid) = ds.get("dsid").or_else(|| ds.get("id")) {
                                                let qid = dsid
                                                    .as_u64()
                                                    .map(|n| format!("query_{}", n))
                                                    .or_else(|| {
                                                        dsid.as_str().map(|s| format!("query_{}", s))
                                                    });
                                                if let Some(qid) = qid {
                                                    refs.push((
                                                        workflow_id.clone(),
                                                        qid,
                                                        "query_ref".to_string(),
                                                    ));
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

            // Brute-force: scan entire workflow JSON for table references
            let mut seen_tables: HashSet<String> = HashSet::new();
            for m in table_re.find_iter(&content) {
                let table_id = m.as_str().to_string();
                if seen_tables.insert(table_id.clone()) {
                    refs.push((
                        workflow_id.clone(),
                        table_id,
                        "table_ref".to_string(),
                    ));
                }
            }

            // Brute-force: query_id references
            for cap in query_re.captures_iter(&content) {
                if let Some(id) = cap.get(1) {
                    refs.push((
                        workflow_id.clone(),
                        format!("query_{}", id.as_str()),
                        "query_ref".to_string(),
                    ));
                }
            }

            // Brute-force: dashboard_id references
            for cap in dashboard_re.captures_iter(&content) {
                if let Some(id) = cap.get(1) {
                    refs.push((
                        workflow_id.clone(),
                        format!("dashboard_{}", id.as_str()),
                        "dashboard_ref".to_string(),
                    ));
                }
            }

            // Also check SQL content for table references
            if let Ok(data) = serde_json::from_str::<Value>(&content) {
                extract_sql_table_refs(&data, &workflow_id, &table_re, &mut refs);
            }
        }
    }

    refs
}

/// Extract workflow IDs from WorkflowExecutorPlugin params
fn extract_workflow_id_refs(
    value: &Value,
    source_workflow: &str,
    refs: &mut Vec<(String, String, String)>,
) {
    match value {
        Value::Array(arr) => {
            for item in arr {
                extract_workflow_id_refs(item, source_workflow, refs);
            }
        }
        Value::Number(n) => {
            if let Some(id) = n.as_u64() {
                refs.push((
                    source_workflow.to_string(),
                    format!("workflow_{}", id),
                    "workflow_ref".to_string(),
                ));
            }
        }
        Value::String(s) => {
            if let Ok(id) = s.parse::<u64>() {
                refs.push((
                    source_workflow.to_string(),
                    format!("workflow_{}", id),
                    "workflow_ref".to_string(),
                ));
            }
        }
        Value::Object(obj) => {
            // Sometimes it's { "id": 123 } or { "workflow_id": 123 }
            for (_, v) in obj {
                extract_workflow_id_refs(v, source_workflow, refs);
            }
        }
        _ => {}
    }
}

/// Extract table IDs from SQL strings embedded in workflow plugins
fn extract_sql_table_refs(
    data: &Value,
    workflow_id: &str,
    table_re: &Regex,
    refs: &mut Vec<(String, String, String)>,
) {
    if let Some(plugins) = data
        .get("data")
        .and_then(|d| d.get("workflow"))
        .and_then(|w| w.get("plugins"))
        .and_then(|p| p.as_array())
    {
        for plugin in plugins {
            if let Some(params) = plugin.get("params") {
                // sql_query field
                if let Some(sql) = params.get("sql_query").and_then(|s| s.as_str()) {
                    for m in table_re.find_iter(sql) {
                        refs.push((
                            workflow_id.to_string(),
                            m.as_str().to_string(),
                            "sql_ref".to_string(),
                        ));
                    }
                }
            }
        }
    }
}

/// Brute-force extract custom_tbl references from any text
fn extract_table_ids_from_text(
    text: &str,
    source_id: &str,
    refs: &mut Vec<(String, String, String)>,
) {
    let table_re = Regex::new(r"custom_tbl_\w+").unwrap();
    for m in table_re.find_iter(text) {
        refs.push((
            source_id.to_string(),
            m.as_str().to_string(),
            "table_ref".to_string(),
        ));
    }
}

/// Read a nested JSON field by path
fn read_json_field(path: &str, keys: &[&str]) -> Option<String> {
    let content = fs::read_to_string(path).ok()?;
    let data: Value = serde_json::from_str(&content).ok()?;
    let mut current = &data;
    for key in keys {
        current = current.get(*key)?;
    }
    // Handle both array of objects (definition.json for tables) and direct values
    if let Some(arr) = current.as_array() {
        // For table definitions, get table_name from first element
        if let Some(first) = arr.first() {
            return first.get("table_name").and_then(|t| t.as_str()).map(|s| s.to_string());
        }
    }
    current.as_str().map(|s| s.to_string())
}

// ============================================================================
// Core: Build dependency graph
// ============================================================================

fn build_dependency_graph(global_path: &str, domain: &str) -> CmdResult<DependencyReport> {
    let registry = build_name_registry(global_path);

    // Collect all edges
    let mut all_refs: Vec<(String, String, String)> = Vec::new();

    // Table -> Table (calc field lookups)
    all_refs.extend(extract_calc_field_refs(global_path));

    // Query -> Table
    all_refs.extend(extract_query_refs(global_path));

    // Dashboard -> Query, Dashboard -> Table
    all_refs.extend(extract_dashboard_refs(global_path));

    // Workflow -> Table, Query, Dashboard, Workflow
    all_refs.extend(extract_workflow_refs(global_path));

    // Deduplicate edges
    let mut seen_edges: HashSet<(String, String, String)> = HashSet::new();
    let mut unique_refs: Vec<(String, String, String)> = Vec::new();
    for r in all_refs {
        if seen_edges.insert(r.clone()) {
            unique_refs.push(r);
        }
    }

    // Build resource nodes
    let mut resources: HashMap<String, ResourceNode> = HashMap::new();

    // Initialize all known resources
    for (id, (rtype, name)) in &registry {
        let mut node = ResourceNode {
            id: id.clone(),
            resource_type: rtype.clone(),
            name: name.clone(),
            depends_on: Vec::new(),
            depended_by: Vec::new(),
            cron_expression: None,
            is_scheduled: None,
            last_run_at: None,
            last_run_status: None,
            is_deleted: None,
            plugin_count: None,
            calc_field_count: None,
            calc_field_rules: None,
            calc_field_lookup_tables: None,
            column_count: None,
            calc_fields: None,
        };

        // Enrich table nodes with calc field stats
        if rtype == "table" {
            let cf_path = format!("{}/data_models/table_{}/definition_calculated_fields.json", global_path, id);
            if let Ok(content) = fs::read_to_string(&cf_path) {
                if let Ok(data) = serde_json::from_str::<Value>(&content) {
                    let total = data.get("summary")
                        .and_then(|s| s.get("totalFields"))
                        .and_then(|t| t.as_u64())
                        .unwrap_or(0) as usize;
                    if total > 0 {
                        node.calc_field_count = Some(total);
                        // Extract rule type counts
                        if let Some(by_rule) = data.get("summary").and_then(|s| s.get("byRuleType")).and_then(|b| b.as_object()) {
                            let mut rules: HashMap<String, usize> = HashMap::new();
                            for (rule_name, count) in by_rule {
                                if let Some(c) = count.as_u64() {
                                    rules.insert(rule_name.clone(), c as usize);
                                }
                            }
                            if !rules.is_empty() {
                                node.calc_field_rules = Some(rules);
                            }
                        }
                        // Extract lookup table names
                        if let Some(lookups) = data.get("summary").and_then(|s| s.get("lookupTables")).and_then(|l| l.as_array()) {
                            let tables: Vec<String> = lookups.iter()
                                .filter_map(|l| l.get("tableName").and_then(|t| t.as_str()).map(|s| s.to_string()))
                                .collect();
                            if !tables.is_empty() {
                                node.calc_field_lookup_tables = Some(tables);
                            }
                        }
                        // Extract individual field info
                        if let Some(fields) = data.get("fields").and_then(|f| f.as_array()) {
                            let mut field_infos: Vec<CalcFieldInfo> = Vec::new();
                            for field in fields {
                                let fname = field.get("name").and_then(|n| n.as_str()).unwrap_or("unnamed").to_string();
                                let rule_type = field.get("ruleType").and_then(|r| r.as_str()).unwrap_or("unknown").to_string();
                                let lookup_table = field.get("lookupTable")
                                    .and_then(|lt| lt.get("tableName"))
                                    .and_then(|t| t.as_str())
                                    .map(|s| s.to_string());
                                let lookup_table_name = field.get("lookupTable")
                                    .and_then(|lt| lt.get("displayName"))
                                    .and_then(|t| t.as_str())
                                    .map(|s| s.to_string());
                                field_infos.push(CalcFieldInfo { name: fname, rule_type, lookup_table, lookup_table_name });
                            }
                            if !field_infos.is_empty() {
                                node.calc_fields = Some(field_infos);
                            }
                        }
                    }
                }
            }
            // Get column count from definition_details.json
            let details_path = format!("{}/data_models/table_{}/definition_details.json", global_path, id);
            if let Ok(content) = fs::read_to_string(&details_path) {
                if let Ok(data) = serde_json::from_str::<Value>(&content) {
                    let data_cols = data.get("columns").and_then(|c| c.get("data")).and_then(|d| d.as_array()).map(|a| a.len()).unwrap_or(0);
                    let calc_cols = data.get("columns").and_then(|c| c.get("calculated")).and_then(|d| d.as_array()).map(|a| a.len()).unwrap_or(0);
                    let sys_cols = data.get("columns").and_then(|c| c.get("system")).and_then(|d| d.as_array()).map(|a| a.len()).unwrap_or(0);
                    node.column_count = Some(data_cols + calc_cols + sys_cols);
                }
            }
        }

        // Enrich workflow nodes with scheduling info
        if rtype == "workflow" {
            let def_path = format!("{}/workflows/{}/definition.json", global_path, id);
            if let Ok(content) = fs::read_to_string(&def_path) {
                if let Ok(data) = serde_json::from_str::<Value>(&content) {
                    node.cron_expression = data
                        .get("cron_expression")
                        .and_then(|c| c.as_str())
                        .map(|s| s.to_string());
                    node.is_scheduled = Some(node.cron_expression.is_some());
                    node.last_run_at = data
                        .get("run_completed_at")
                        .and_then(|r| r.as_str())
                        .map(|s| s.to_string());
                    node.last_run_status = data
                        .get("latest_run_status")
                        .and_then(|r| r.as_str())
                        .map(|s| s.to_string());
                    node.is_deleted = data.get("deleted").and_then(|d| d.as_bool());
                    node.plugin_count = data
                        .get("data")
                        .and_then(|d| d.get("workflow"))
                        .and_then(|w| w.get("plugins"))
                        .and_then(|p| p.as_array())
                        .map(|a| a.len());
                }
            }
        }

        resources.insert(id.clone(), node);
    }

    // Apply edges
    let edge_count = unique_refs.len();
    for (source, target, ref_type) in &unique_refs {
        // Ensure target exists in resources (might be referenced but not in registry)
        if !resources.contains_key(target) {
            let (rtype, name) = infer_resource_type(target);
            resources.insert(
                target.clone(),
                ResourceNode {
                    id: target.clone(),
                    resource_type: rtype,
                    name,
                    depends_on: Vec::new(),
                    depended_by: Vec::new(),
                    cron_expression: None,
                    is_scheduled: None,
                    last_run_at: None,
                    last_run_status: None,
                    is_deleted: None,
                    plugin_count: None,
                    calc_field_count: None,
                    calc_field_rules: None,
                    calc_field_lookup_tables: None,
                    column_count: None,
                    calc_fields: None,
                },
            );
        }

        // Get target info for the edge
        let target_info = resources.get(target).map(|r| (r.resource_type.clone(), r.name.clone()));
        let source_info = resources.get(source).map(|r| (r.resource_type.clone(), r.name.clone()));

        // Add depends_on to source
        if let Some(node) = resources.get_mut(source) {
            if let Some((rt, rn)) = &target_info {
                node.depends_on.push(DependencyEdge {
                    id: target.clone(),
                    resource_type: rt.clone(),
                    name: rn.clone(),
                    reference_type: ref_type.clone(),
                });
            }
        }

        // Add depended_by to target
        if let Some(node) = resources.get_mut(target) {
            if let Some((rt, rn)) = &source_info {
                node.depended_by.push(DependencyEdge {
                    id: source.clone(),
                    resource_type: rt.clone(),
                    name: rn.clone(),
                    reference_type: ref_type.clone(),
                });
            }
        }
    }

    // Build summary
    let mut by_type: HashMap<String, usize> = HashMap::new();
    let mut orphaned = OrphanedResources {
        tables: Vec::new(),
        queries: Vec::new(),
        dashboards: Vec::new(),
        workflows: Vec::new(),
    };
    let mut critical: Vec<CriticalResource> = Vec::new();

    for (id, node) in &resources {
        *by_type.entry(node.resource_type.clone()).or_insert(0) += 1;

        // Orphaned: no dependents (nothing depends on this)
        if node.depended_by.is_empty() {
            match node.resource_type.as_str() {
                "table" => orphaned.tables.push(id.clone()),
                "query" => orphaned.queries.push(id.clone()),
                "dashboard" => orphaned.dashboards.push(id.clone()),
                "workflow" => orphaned.workflows.push(id.clone()),
                _ => {}
            }
        }

        // Critical: many dependents (>= 3)
        if node.depended_by.len() >= 3 {
            critical.push(CriticalResource {
                id: id.clone(),
                resource_type: node.resource_type.clone(),
                name: node.name.clone(),
                dependent_count: node.depended_by.len(),
            });
        }
    }

    // Sort critical by dependent count desc
    critical.sort_by(|a, b| b.dependent_count.cmp(&a.dependent_count));

    // Collect tables with calculated fields (any table with at least 1 calc field)
    let mut heavy_calc_tables: Vec<HeavyCalcTable> = Vec::new();
    for (id, node) in &resources {
        if node.resource_type == "table" {
            if let Some(count) = node.calc_field_count {
                if count > 0 {
                    heavy_calc_tables.push(HeavyCalcTable {
                        id: id.clone(),
                        name: node.name.clone(),
                        calc_field_count: count,
                        rules: node.calc_field_rules.clone().unwrap_or_default(),
                        lookup_tables: node.calc_field_lookup_tables.clone().unwrap_or_default(),
                        column_count: node.column_count.unwrap_or(0),
                        fields: node.calc_fields.clone().unwrap_or_default(),
                    });
                }
            }
        }
    }
    // Sort by calc field count desc
    heavy_calc_tables.sort_by(|a, b| b.calc_field_count.cmp(&a.calc_field_count));

    let total_resources = resources.len();

    Ok(DependencyReport {
        computed_at: chrono::Utc::now().to_rfc3339(),
        domain: domain.to_string(),
        resources,
        summary: DependencySummary {
            total_resources,
            total_edges: edge_count,
            by_type,
            orphaned,
            critical,
            heavy_calc_tables,
        },
    })
}

/// Infer resource type from ID pattern
fn infer_resource_type(id: &str) -> (String, String) {
    if id.starts_with("query_") {
        ("query".to_string(), id.to_string())
    } else if id.starts_with("dashboard_") {
        ("dashboard".to_string(), id.to_string())
    } else if id.starts_with("workflow_") {
        ("workflow".to_string(), id.to_string())
    } else if id.starts_with("custom_tbl_") || id.contains("tbl_") {
        ("table".to_string(), id.to_string())
    } else {
        ("unknown".to_string(), id.to_string())
    }
}

// ============================================================================
// Commands
// ============================================================================

#[command]
pub async fn val_compute_dependencies(domain: String) -> CmdResult<DependencyResult> {
    let start = Instant::now();
    let domain_config = get_domain_config(&domain)?;
    let global_path = &domain_config.global_path;

    let report = build_dependency_graph(global_path, &domain)?;

    let orphaned_count = report.summary.orphaned.tables.len()
        + report.summary.orphaned.queries.len()
        + report.summary.orphaned.dashboards.len()
        + report.summary.orphaned.workflows.len();

    // Write to dependencies.json in domain folder
    let output_path = format!("{}/dependencies.json", global_path);
    let json_value = serde_json::to_value(&report)?;
    super::sync::write_json(&output_path, &json_value)?;

    let duration_ms = start.elapsed().as_millis() as u64;

    Ok(DependencyResult {
        domain,
        resource_count: report.summary.total_resources,
        edge_count: report.summary.total_edges,
        orphaned_count,
        duration_ms,
        status: "ok".to_string(),
        message: format!(
            "Computed dependencies: {} resources, {} edges, {} orphaned",
            report.summary.total_resources, report.summary.total_edges, orphaned_count
        ),
    })
}
