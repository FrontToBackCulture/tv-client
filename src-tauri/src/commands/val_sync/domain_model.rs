// VAL Domain Model - Scan domains for entity table presence and structural conformance.
// Schema.json is the source of truth for field definitions.
// Lab is the template domain — all other domains are compared against it for STRUCTURAL
// conformance: same columns, same order. Value differences are expected and not checked.

use super::auth;
use super::config::load_config_internal;
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

/// Schema field definition (from schema.json)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchemaField {
    pub name: String,
    pub column: String,
    #[serde(rename = "type")]
    pub field_type: String,
    pub field_id: Option<u64>,
    pub group: Option<String>,
    #[serde(default)]
    pub is_key: bool,
    #[serde(default)]
    pub is_categorical: bool,
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
}

/// Schema.json structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchemaJson {
    pub table_name: String,
    pub display_name: String,
    pub fuel_stage: Option<String>,
    pub model: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
    pub resource_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub freshness_column: Option<String>,
    pub fields: Vec<SchemaField>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub name: String,
    pub table_name: Option<String>,
    pub display_name: Option<String>,
    pub has_schema_json: bool,
    pub has_schema_md: bool,
    pub has_sql: bool,
    pub has_workflow: bool,
    pub has_domains: bool,
    pub has_categoricals: bool,
    pub field_count: Option<usize>,
    pub categorical_count: Option<usize>,
    pub domain_count: Option<usize>,
    pub active_domain_count: Option<usize>,
    pub total_records: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntityInfo {
    pub name: String,
    pub models: Vec<ModelInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub domains_found: usize,
    pub active_domains: usize,
    pub total_records: u64,
    pub duration_ms: u64,
    pub errors: Vec<String>,
}

// Internal: SQL response types
#[derive(Debug, Serialize)]
struct SqlQueryRequest {
    sql: String,
}

#[derive(Debug, Deserialize)]
struct SqlQueryResponse {
    data: Option<Vec<serde_json::Value>>,
}

/// A column from information_schema
#[derive(Debug, Clone)]
struct ColumnInfo {
    column_name: String,
    ordinal_position: i64,
    _data_type: String,
}

// ============================================================================
// Internal Helpers
// ============================================================================

/// Execute SQL against a domain's API
async fn execute_sql(token: &str, api_domain: &str, sql: &str) -> Result<Vec<serde_json::Value>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let url = format!("https://{}.thinkval.io/api/v1/sqls/execute", api_domain);

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .query(&[("token", token)])
        .json(&SqlQueryRequest { sql: sql.to_string() })
        .send()
        .await
        .map_err(|e| format!("SQL query failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("SQL error ({}): {}", status, body));
    }

    let resp: SqlQueryResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse SQL response: {}", e))?;

    Ok(resp.data.unwrap_or_default())
}

/// Parse a SQL count result that may be string or number
fn parse_count(v: &serde_json::Value) -> Option<i64> {
    v.as_i64()
        .or_else(|| v.as_f64().map(|f| f as i64))
        .or_else(|| v.as_str().and_then(|s| s.parse::<i64>().ok()))
}

/// Read schema.json from a model folder
fn read_schema_json(model_path: &Path) -> Option<SchemaJson> {
    let schema_path = model_path.join("schema.json");
    let content = fs::read_to_string(&schema_path).ok()?;
    serde_json::from_str(&content).ok()
}

/// Read summary stats from domains.json
fn read_domains_summary(domains_json_path: &Path) -> (Option<usize>, Option<usize>, Option<u64>) {
    let content = match fs::read_to_string(domains_json_path) {
        Ok(c) => c,
        Err(_) => return (None, None, None),
    };
    let json: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return (None, None, None),
    };
    let summary = json.get("summary");
    let domain_count = summary.and_then(|s| s.get("total_domains")).and_then(|v| v.as_u64()).map(|v| v as usize);
    let active_count = summary.and_then(|s| s.get("active_domains")).and_then(|v| v.as_u64()).map(|v| v as usize);
    let total_records = summary.and_then(|s| s.get("total_records")).and_then(|v| v.as_u64());
    (domain_count, active_count, total_records)
}

/// Query the user-defined columns from a domain's table via information_schema
async fn query_columns(token: &str, api_domain: &str, table_name: &str) -> Result<Vec<ColumnInfo>, String> {
    let sql = format!(
        "SELECT column_name, ordinal_position, data_type \
         FROM information_schema.columns \
         WHERE table_name = '{}' AND (column_name LIKE 'usr_%' OR column_name = 'general_record_id') \
         ORDER BY ordinal_position",
        table_name
    );

    let rows = execute_sql(token, api_domain, &sql).await?;

    let mut cols = Vec::new();
    for row in &rows {
        let name = row.get("column_name").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let pos = row.get("ordinal_position")
            .and_then(|v| parse_count(v))
            .unwrap_or(0);
        let dtype = row.get("data_type").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if !name.is_empty() {
            cols.push(ColumnInfo { column_name: name, ordinal_position: pos, _data_type: dtype });
        }
    }
    Ok(cols)
}

/// Build a column→display_name mapping from schema.json
fn build_column_display_map(schema: &SchemaJson) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for f in &schema.fields {
        map.insert(f.column.clone(), f.name.clone());
    }
    map
}

/// Enrich the display map with names from a domain's synced definition.json.
/// definition.json has entries like: {"column_name": "usr_xxx", "name": "Customer ID", ...}
/// Only adds columns NOT already in the map (schema.json takes priority).
fn enrich_display_map_from_definition(map: &mut HashMap<String, String>, definition_path: &Path) {
    let content = match fs::read_to_string(definition_path) {
        Ok(c) => c,
        Err(_) => return,
    };
    let fields: Vec<serde_json::Value> = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return,
    };
    for field in &fields {
        let col = field.get("column_name").and_then(|v| v.as_str()).unwrap_or("");
        let name = field.get("name").and_then(|v| v.as_str()).unwrap_or("");
        if !col.is_empty() && !name.is_empty() && !map.contains_key(col) {
            map.insert(col.to_string(), name.to_string());
        }
    }
}

/// Compute structural conformance: compare domain columns against reference columns.
/// Returns JSON with status, missing, extra, order mismatches.
fn compute_structural_conformance(
    domain_cols: &[ColumnInfo],
    ref_cols: &[ColumnInfo],
    display_map: &HashMap<String, String>,
) -> serde_json::Value {
    // Build maps: column_name → ordinal_position
    let ref_map: HashMap<&str, i64> = ref_cols.iter()
        .map(|c| (c.column_name.as_str(), c.ordinal_position))
        .collect();
    let domain_map: HashMap<&str, i64> = domain_cols.iter()
        .map(|c| (c.column_name.as_str(), c.ordinal_position))
        .collect();

    let ref_order: Vec<&str> = ref_cols.iter().map(|c| c.column_name.as_str()).collect();
    let domain_order: Vec<&str> = domain_cols.iter().map(|c| c.column_name.as_str()).collect();

    // Missing: in ref but not in domain
    let mut missing: Vec<serde_json::Value> = Vec::new();
    for rc in ref_cols {
        if !domain_map.contains_key(rc.column_name.as_str()) {
            let display = display_map.get(&rc.column_name).cloned().unwrap_or_else(|| rc.column_name.clone());
            missing.push(serde_json::json!({
                "column": rc.column_name,
                "display_name": display,
                "ref_position": rc.ordinal_position,
            }));
        }
    }

    // Extra: in domain but not in ref
    let mut extra: Vec<serde_json::Value> = Vec::new();
    for dc in domain_cols {
        if !ref_map.contains_key(dc.column_name.as_str()) {
            let display = display_map.get(&dc.column_name).cloned().unwrap_or_else(|| dc.column_name.clone());
            extra.push(serde_json::json!({
                "column": dc.column_name,
                "display_name": display,
                "domain_position": dc.ordinal_position,
            }));
        }
    }

    // Order mismatches: same columns, different sequence
    // Compare the sequence of shared columns (by their relative order, not absolute position)
    let ref_shared: Vec<&str> = ref_order.iter().copied().filter(|c| domain_map.contains_key(c)).collect();
    let domain_shared: Vec<&str> = domain_order.iter().copied().filter(|c| ref_map.contains_key(c)).collect();

    let mut order_mismatches: Vec<serde_json::Value> = Vec::new();
    if ref_shared != domain_shared {
        // Find columns that are in a different position
        for (i, col) in ref_shared.iter().enumerate() {
            if let Some(domain_idx) = domain_shared.iter().position(|c| c == col) {
                if domain_idx != i {
                    let display = display_map.get(*col).cloned().unwrap_or_else(|| col.to_string());
                    order_mismatches.push(serde_json::json!({
                        "column": col,
                        "display_name": display,
                        "ref_index": i,
                        "domain_index": domain_idx,
                    }));
                }
            }
        }
    }

    let status = if missing.is_empty() && extra.is_empty() && order_mismatches.is_empty() {
        "aligned"
    } else {
        "diverged"
    };

    serde_json::json!({
        "status": status,
        "ref_columns": ref_cols.len(),
        "domain_columns": domain_cols.len(),
        "missing": missing,
        "extra": extra,
        "order_mismatches": order_mismatches,
    })
}

// ============================================================================
// Field Master types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MasterFieldEntity {
    entity: String,
    model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MasterField {
    key: String,
    field_id: Option<u64>,
    column: String,
    name: String,
    #[serde(rename = "type")]
    field_type: String,
    group: Option<String>,
    #[serde(default)]
    is_categorical: bool,
    description: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    tags: Vec<String>,
    entities: Vec<MasterFieldEntity>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldMasterJson {
    generated: String,
    total_fields: usize,
    total_entities: usize,
    fields: Vec<MasterField>,
}

/// Compute the dedup key for a field: fid_{field_id} if present, else col_{column}
fn field_master_key(field_id: Option<u64>, column: &str) -> String {
    match field_id {
        Some(id) => format!("fid_{}", id),
        None => format!("col_{}", column),
    }
}

/// Read existing _field_master.json if it exists
fn read_field_master(entities_path: &Path) -> Option<FieldMasterJson> {
    let master_path = entities_path.join("_field_master.json");
    let content = fs::read_to_string(&master_path).ok()?;
    serde_json::from_str(&content).ok()
}

// ============================================================================
// Commands
// ============================================================================

/// List all documented domain model entities by reading the folder structure.
#[command]
pub fn val_list_domain_model_entities(entities_path: String) -> Result<Vec<EntityInfo>, String> {
    let base = Path::new(&entities_path);
    if !base.exists() {
        return Err(format!("Entities path does not exist: {}", entities_path));
    }

    let mut entities = Vec::new();

    let entries = fs::read_dir(base)
        .map_err(|e| format!("Failed to read entities dir: {}", e))?;

    let mut entity_dirs: Vec<_> = entries
        .flatten()
        .filter(|e| e.path().is_dir())
        .filter(|e| !e.file_name().to_string_lossy().starts_with('.'))
        .collect();
    entity_dirs.sort_by(|a, b| a.file_name().cmp(&b.file_name()));

    for entry in entity_dirs {
        let entity_name = entry.file_name().to_string_lossy().to_string();
        let entity_path = entry.path();
        let mut models = Vec::new();

        if let Ok(model_entries) = fs::read_dir(&entity_path) {
            let mut model_dirs: Vec<_> = model_entries
                .flatten()
                .filter(|e| e.path().is_dir())
                .filter(|e| !e.file_name().to_string_lossy().starts_with('.'))
                .collect();
            model_dirs.sort_by(|a, b| a.file_name().cmp(&b.file_name()));

            for model_entry in model_dirs {
                let model_name = model_entry.file_name().to_string_lossy().to_string();
                let model_path = model_entry.path();

                let has_schema_json = model_path.join("schema.json").exists();
                let has_schema_md = model_path.join("schema.md").exists();
                let has_sql = model_path.join("sql.md").exists();
                let has_workflow = model_path.join("workflow.md").exists();
                let has_domains = model_path.join("domains.json").exists();
                let has_categoricals = model_path.join("categoricals.json").exists();

                let schema = read_schema_json(&model_path);
                let (table_name, display_name, field_count, categorical_count) = match &schema {
                    Some(s) => {
                        let cat_count = s.fields.iter().filter(|f| f.is_categorical).count();
                        (Some(s.table_name.clone()), Some(s.display_name.clone()), Some(s.fields.len()), Some(cat_count))
                    }
                    None => {
                        let domains_path = model_path.join("domains.json");
                        let tn = if has_domains {
                            fs::read_to_string(&domains_path).ok().and_then(|c| {
                                let json: serde_json::Value = serde_json::from_str(&c).ok()?;
                                json.get("table_name")?.as_str().map(|s| s.to_string())
                            })
                        } else { None };
                        (tn, None, None, None)
                    }
                };

                let (domain_count, active_domain_count, total_records) = if has_domains {
                    read_domains_summary(&model_path.join("domains.json"))
                } else {
                    (None, None, None)
                };

                models.push(ModelInfo {
                    name: model_name,
                    table_name,
                    display_name,
                    has_schema_json,
                    has_schema_md,
                    has_sql,
                    has_workflow,
                    has_domains,
                    has_categoricals,
                    field_count,
                    categorical_count,
                    domain_count,
                    active_domain_count,
                    total_records,
                });
            }
        }

        entities.push(EntityInfo { name: entity_name, models });
    }

    Ok(entities)
}

/// Scan all configured domains for a specific table using schema.json.
/// Checks table presence, record counts, and STRUCTURAL conformance against the reference domain.
/// Structural conformance = same columns in the same order.
#[command]
pub async fn val_scan_domain_model_table(
    schema_path: String,
    domain_types: Option<Vec<String>>,
    reference_domain: Option<String>,
) -> Result<ScanResult, String> {
    let start = Instant::now();
    let ref_domain = reference_domain.unwrap_or_else(|| "lab".to_string());

    // Read schema.json
    let schema_file = Path::new(&schema_path);
    if !schema_file.exists() {
        return Err(format!("schema.json not found: {}", schema_path));
    }
    let schema_content = fs::read_to_string(schema_file)
        .map_err(|e| format!("Failed to read schema.json: {}", e))?;
    let schema: SchemaJson = serde_json::from_str(&schema_content)
        .map_err(|e| format!("Failed to parse schema.json: {}", e))?;

    let table_name = &schema.table_name;
    let table_display = &schema.display_name;
    let model = schema.model.as_deref().unwrap_or("udt");
    let mut display_map = build_column_display_map(&schema);

    // Categorical fields for the optional value collection
    let categorical_fields: Vec<&SchemaField> = schema.fields.iter()
        .filter(|f| f.is_categorical)
        .collect();

    let output_dir = schema_file.parent()
        .ok_or_else(|| "Cannot determine output directory from schema path".to_string())?;

    // Load all domain configs
    let config = load_config_internal()?;

    // Enrich display map from reference domain's synced definition.json
    // This catches columns that exist in the DB but aren't documented in schema.json
    if let Some(ref_config) = config.domains.iter().find(|d| d.domain == ref_domain) {
        let def_path = Path::new(&ref_config.global_path)
            .join("data_models")
            .join(format!("table_{}", table_name))
            .join("definition.json");
        enrich_display_map_from_definition(&mut display_map, &def_path);
    }
    let scan_domains: Vec<_> = config.domains.iter()
        .filter(|d| {
            match &domain_types {
                Some(types) => match d.domain_type.as_deref() {
                    Some(t) => types.iter().any(|ft| ft == t),
                    None => true,
                },
                None => true,
            }
        })
        .collect();

    struct DomainData {
        domain: String,
        json: serde_json::Value,
        columns: Vec<ColumnInfo>,
    }

    let mut all_domain_data: Vec<DomainData> = Vec::new();
    // Categorical field data (field name → { column, field_id, group, by_domain })
    let mut cat_field_data: HashMap<String, serde_json::Value> = HashMap::new();
    let mut errors: Vec<String> = Vec::new();
    let mut total_records: u64 = 0;
    let mut active_count: usize = 0;
    let mut empty_count: usize = 0;
    let mut unknown_count: usize = 0;

    // Initialize categorical field data
    for field in &categorical_fields {
        cat_field_data.insert(field.name.clone(), serde_json::json!({
            "column": field.column,
            "field_id": field.field_id,
            "group": field.group,
            "by_domain": {},
        }));
    }

    // Also enrich display map from all scanned domains' definition.json (for extra columns)
    for dc in &scan_domains {
        let def_path = Path::new(&dc.global_path)
            .join("data_models")
            .join(format!("table_{}", table_name))
            .join("definition.json");
        enrich_display_map_from_definition(&mut display_map, &def_path);
    }

    for domain_config in &scan_domains {
        let domain = &domain_config.domain;

        // Auth
        let (token, api_domain) = match auth::ensure_auth(domain).await {
            Ok(pair) => pair,
            Err(e) => {
                let msg = format!("{}: auth failed - {}", domain, e);
                errors.push(msg.clone());
                unknown_count += 1;
                all_domain_data.push(DomainData {
                    domain: domain.clone(),
                    json: serde_json::json!({
                        "domain": domain, "status": "unknown",
                        "records": null, "first_record": null, "latest_record": null,
                        "source_systems": [], "brands": [], "notes": msg,
                    }),
                    columns: Vec::new(),
                });
                continue;
            }
        };

        // Check if table exists
        let check_sql = format!(
            "SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_name = '{}'",
            table_name
        );
        let exists = match execute_sql(&token, &api_domain, &check_sql).await {
            Ok(rows) => rows.first()
                .and_then(|r| r.get("cnt"))
                .and_then(|v| parse_count(v))
                .map(|n| n > 0)
                .unwrap_or(false),
            Err(e) => {
                let msg = format!("{}: table check failed - {}", domain, e);
                errors.push(msg.clone());
                unknown_count += 1;
                all_domain_data.push(DomainData {
                    domain: domain.clone(),
                    json: serde_json::json!({
                        "domain": domain, "status": "unknown",
                        "records": null, "first_record": null, "latest_record": null,
                        "source_systems": [], "brands": [], "notes": msg,
                    }),
                    columns: Vec::new(),
                });
                continue;
            }
        };

        if !exists {
            all_domain_data.push(DomainData {
                domain: domain.clone(),
                json: serde_json::json!({
                    "domain": domain, "status": "not_found",
                    "records": null, "first_record": null, "latest_record": null,
                    "source_systems": [], "brands": [],
                }),
                columns: Vec::new(),
            });
            continue;
        }

        // Get coverage stats
        let coverage_sql = format!(
            "SELECT COUNT(*) as records, MIN(created_date) as first_record, MAX(created_date) as latest_record FROM {}",
            table_name
        );
        let (records, first_record, latest_record) = match execute_sql(&token, &api_domain, &coverage_sql).await {
            Ok(rows) => {
                let row = rows.first();
                let records = row.and_then(|r| r.get("records")).and_then(|v| parse_count(v)).unwrap_or(0) as u64;
                let first = row.and_then(|r| r.get("first_record")).and_then(|v| v.as_str()).map(|s| s.chars().take(10).collect::<String>());
                let latest = row.and_then(|r| r.get("latest_record")).and_then(|v| v.as_str()).map(|s| s.chars().take(10).collect::<String>());
                (records, first, latest)
            }
            Err(e) => {
                errors.push(format!("{}: coverage query failed - {}", domain, e));
                (0, None, None)
            }
        };

        let status = if records > 0 { "active" } else { "empty" };
        if records > 0 { active_count += 1; total_records += records; }
        else { empty_count += 1; }

        // Query actual columns for structural conformance
        let columns = match query_columns(&token, &api_domain, table_name).await {
            Ok(cols) => cols,
            Err(e) => {
                errors.push(format!("{}: column query failed - {}", domain, e));
                Vec::new()
            }
        };

        // Query categorical values (for reference — no conformance checking)
        let mut source_systems: Vec<String> = Vec::new();
        let mut brands: Vec<String> = Vec::new();

        if records > 0 {
            for field in &categorical_fields {
                let cat_sql = format!(
                    "SELECT {} as val, COUNT(*) as cnt FROM {} WHERE {} IS NOT NULL GROUP BY {} ORDER BY cnt DESC LIMIT 200",
                    field.column, table_name, field.column, field.column
                );

                match execute_sql(&token, &api_domain, &cat_sql).await {
                    Ok(rows) => {
                        let values: Vec<serde_json::Value> = rows.iter()
                            .filter_map(|r| {
                                let val = r.get("val")?.as_str()?.to_string();
                                let cnt = r.get("cnt").and_then(|v| parse_count(v)).unwrap_or(0) as u64;
                                if val.is_empty() { return None; }
                                Some(serde_json::json!({ "value": val, "count": cnt }))
                            })
                            .collect();

                        if !values.is_empty() {
                            // Extract source_systems and brands for domain summary
                            if field.name == "Source System" {
                                source_systems = values.iter()
                                    .filter_map(|v| v.get("value").and_then(|s| s.as_str()).map(|s| s.to_string()))
                                    .collect();
                            }
                            if field.name == "Brand" {
                                brands = values.iter()
                                    .filter_map(|v| v.get("value").and_then(|s| s.as_str()).map(|s| s.to_string()))
                                    .collect();
                            }

                            if let Some(field_data) = cat_field_data.get_mut(&field.name) {
                                if let Some(by_domain) = field_data.get_mut("by_domain").and_then(|bd| bd.as_object_mut()) {
                                    by_domain.insert(domain.clone(), serde_json::json!(values));
                                }
                            }
                        }
                    }
                    Err(e) => {
                        errors.push(format!("{}: categorical query for {} failed - {}", domain, field.name, e));
                    }
                }
            }
        }

        all_domain_data.push(DomainData {
            domain: domain.clone(),
            json: serde_json::json!({
                "domain": domain,
                "status": status,
                "records": records,
                "first_record": first_record,
                "latest_record": latest_record,
                "source_systems": source_systems,
                "brands": brands,
            }),
            columns,
        });
    }

    // ── Structural conformance: compare columns against reference (lab) ──
    let ref_columns: Vec<ColumnInfo> = all_domain_data.iter()
        .find(|d| d.domain == ref_domain)
        .map(|d| d.columns.clone())
        .unwrap_or_default();

    let has_reference = !ref_columns.is_empty();

    // Build domain results with conformance
    let mut domain_results: Vec<serde_json::Value> = Vec::new();

    for dd in &all_domain_data {
        let mut json = dd.json.clone();
        let obj = json.as_object_mut().unwrap();

        if dd.domain == ref_domain && has_reference {
            obj.insert("conformance".to_string(), serde_json::json!({
                "status": "reference",
                "ref_columns": ref_columns.len(),
                "domain_columns": dd.columns.len(),
                "missing": [],
                "extra": [],
                "order_mismatches": [],
            }));
        } else if has_reference && !dd.columns.is_empty() {
            let conf = compute_structural_conformance(&dd.columns, &ref_columns, &display_map);
            obj.insert("conformance".to_string(), conf);
        }

        domain_results.push(json);
    }

    // Sort: reference first, then active > empty > not_found > unknown, then by records desc
    domain_results.sort_by(|a, b| {
        let da = a.get("domain").and_then(|s| s.as_str()).unwrap_or("");
        let db = b.get("domain").and_then(|s| s.as_str()).unwrap_or("");
        let is_ref_a = da == ref_domain;
        let is_ref_b = db == ref_domain;
        if is_ref_a && !is_ref_b { return std::cmp::Ordering::Less; }
        if !is_ref_a && is_ref_b { return std::cmp::Ordering::Greater; }

        let sa = a.get("status").and_then(|s| s.as_str()).unwrap_or("");
        let sb = b.get("status").and_then(|s| s.as_str()).unwrap_or("");
        let ra = a.get("records").and_then(|r| r.as_u64()).unwrap_or(0);
        let rb = b.get("records").and_then(|r| r.as_u64()).unwrap_or(0);
        let order = |s: &str| -> u8 { match s { "active" => 0, "test" => 1, "empty" => 2, "not_found" => 3, _ => 4 } };
        order(sa).cmp(&order(sb)).then(rb.cmp(&ra))
    });

    let domains_found = domain_results.len();
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();

    // ── Write domains.json ──
    let domains_json = serde_json::json!({
        "table_name": table_name,
        "display_name": table_display,
        "fuel_stage": schema.fuel_stage.as_deref().unwrap_or("unify"),
        "model": model,
        "last_scanned": &today,
        "reference_domain": &ref_domain,
        "summary": {
            "total_domains": domains_found,
            "active_domains": active_count,
            "empty_domains": empty_count,
            "unknown_domains": unknown_count,
            "total_records": total_records,
        },
        "domains": domain_results,
    });

    if !output_dir.exists() {
        fs::create_dir_all(output_dir)
            .map_err(|e| format!("Failed to create output directory: {}", e))?;
    }

    let domains_file = output_dir.join("domains.json").to_string_lossy().to_string();
    write_json(&domains_file, &domains_json)?;

    // ── Write categoricals.json (values only, no conformance) ──
    let categoricals_json = serde_json::json!({
        "table_name": table_name,
        "display_name": table_display,
        "last_scanned": &today,
        "fields": cat_field_data,
    });

    let categoricals_file = output_dir.join("categoricals.json").to_string_lossy().to_string();
    write_json(&categoricals_file, &categoricals_json)?;

    Ok(ScanResult {
        domains_found,
        active_domains: active_count,
        total_records,
        duration_ms: start.elapsed().as_millis() as u64,
        errors,
    })
}

/// Read a domain model JSON file (domains.json, categoricals.json, or schema.json)
#[command]
pub fn val_read_domain_model_file(file_path: String) -> Result<serde_json::Value, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse JSON: {}", e))
}

/// Generate schema.md from schema.json
#[command]
pub fn val_generate_schema_md(schema_json_path: String) -> Result<String, String> {
    let path = Path::new(&schema_json_path);
    if !path.exists() {
        return Err(format!("schema.json not found: {}", schema_json_path));
    }

    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read schema.json: {}", e))?;
    let schema: SchemaJson = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse schema.json: {}", e))?;

    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let model_upper = schema.model.as_deref().unwrap_or("UDT").to_uppercase();

    let mut md = String::new();

    // Frontmatter
    md.push_str("---\n");
    md.push_str(&format!("title: \"{} {} - Schema\"\n", model_upper, schema.display_name));
    md.push_str(&format!("summary: \"Field reference for {} ({})\"\n", schema.display_name, schema.table_name));
    md.push_str(&format!("created: {}\nupdated: {}\n", &today, &today));
    md.push_str("author: \"\"\n");
    md.push_str(&format!("tags: [domain-model, {}, schema, fuel]\n", model_upper.to_lowercase()));
    md.push_str("status: published\ncategory: platform\nai_generated: true\nlast_reviewed:\nreviewed_by: \"\"\n");
    md.push_str("---\n\n");

    md.push_str(&format!("# {} - Schema\n\n", schema.display_name));

    // Overview
    md.push_str("## Overview\n\n| Property | Value |\n| --- | --- |\n");
    md.push_str(&format!("| Display Name | {} |\n| Table Name | {} |\n", schema.display_name, schema.table_name));
    md.push_str(&format!("| FUEL Stage | {} |\n| Model | {} |\n", schema.fuel_stage.as_deref().unwrap_or("Unify"), model_upper));
    if let Some(ref status) = schema.status { md.push_str(&format!("| Status | {} |\n", status)); }
    md.push_str(&format!("| Total Fields | {} |\n", schema.fields.len()));
    let cat_count = schema.fields.iter().filter(|f| f.is_categorical).count();
    md.push_str(&format!("| Categorical Fields | {} |\n\n", cat_count));

    if let Some(ref desc) = schema.description { md.push_str(&format!("{}\n\n", desc)); }

    // Group fields
    let groups: Vec<&str> = {
        let mut seen = Vec::new();
        for f in &schema.fields {
            let g = f.group.as_deref().unwrap_or("other");
            if !seen.contains(&g) { seen.push(g); }
        }
        seen
    };

    md.push_str("## Field Reference\n\n");
    for group in &groups {
        let group_fields: Vec<&SchemaField> = schema.fields.iter()
            .filter(|f| f.group.as_deref().unwrap_or("other") == *group).collect();
        if group_fields.is_empty() { continue; }

        let title = match *group {
            "identifiers" => "Identifiers", "organization" => "Organization Dimensions",
            "transaction" => "Transaction Dimensions", "time" => "Time Fields",
            "measures" => "Measures", "metadata" => "Metadata", other => other,
        };

        md.push_str(&format!("### {}\n\n", title));
        md.push_str("| Field | Column | Type | Field ID | Cat | Tags | Description |\n| --- | --- | --- | --- | --- | --- | --- |\n");
        for f in &group_fields {
            let tags_str = if f.tags.is_empty() { String::new() } else { f.tags.join(", ") };
            md.push_str(&format!("| {} | `{}` | {} | {} | {} | {} | {} |\n",
                f.name, f.column, f.field_type,
                f.field_id.map(|id| id.to_string()).unwrap_or_default(),
                if f.is_categorical { "Y" } else { "" },
                tags_str,
                f.description.as_deref().unwrap_or(""),
            ));
        }
        md.push_str("\n");
    }

    let output_path = path.with_file_name("schema.md");
    fs::write(&output_path, &md)
        .map_err(|e| format!("Failed to write schema.md: {}", e))?;
    Ok(output_path.to_string_lossy().to_string())
}

/// Result from creating a domain model schema
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSchemaResult {
    pub schema_path: String,
    pub field_count: usize,
}


/// Create a schema.json for a domain model entity from a domain's definition.json.
/// Reads the definition, filters to user columns (usr_* + general_record_id),
/// maps fields, and writes schema.json to the entities folder.
#[command]
pub fn val_create_domain_model_schema(
    definition_path: String,
    entity_name: String,
    model_name: String,
    entities_base_path: String,
    table_display_name: String,
) -> Result<CreateSchemaResult, String> {
    let def_path = Path::new(&definition_path);
    if !def_path.exists() {
        return Err(format!("definition.json not found: {}", definition_path));
    }

    // Read definition.json (array of column objects)
    let content = fs::read_to_string(def_path)
        .map_err(|e| format!("Failed to read definition.json: {}", e))?;
    let fields: Vec<serde_json::Value> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse definition.json: {}", e))?;

    // Extract table_name from first entry
    let table_name = fields
        .first()
        .and_then(|f| f.get("table_name"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| "No table_name found in definition.json".to_string())?
        .to_string();

    // Filter to user columns: usr_* + general_record_id (skip system columns)
    let user_fields: Vec<&serde_json::Value> = fields
        .iter()
        .filter(|f| {
            let col = f.get("column_name").and_then(|v| v.as_str()).unwrap_or("");
            if col == "general_record_id" {
                return true;
            }
            if col.starts_with("usr_") {
                return true;
            }
            // Skip system columns and anything else
            false
        })
        .collect();

    // Map each column to a SchemaField
    let mut schema_fields: Vec<SchemaField> = user_fields
        .iter()
        .map(|f| {
            let col_name = f.get("column_name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let display_name = f.get("name").and_then(|v| v.as_str()).unwrap_or(&col_name).to_string();
            let data_type = f
                .get("raw_data_type")
                .or_else(|| f.get("data_type"))
                .and_then(|v| v.as_str())
                .unwrap_or("text")
                .to_string();
            let field_id = f.get("dft_nodefields_id").and_then(|v| v.as_u64());
            let desc = f.get("desc").and_then(|v| v.as_str()).map(|s| s.to_string());
            let is_key = col_name == "general_record_id";

            SchemaField {
                name: display_name,
                column: col_name,
                field_type: data_type,
                field_id,
                group: None,
                is_key,
                is_categorical: false,
                description: desc,
                tags: Vec::new(),
            }
        })
        .collect();

    // Auto-fill from field master if it exists
    let master_path = Path::new(&entities_base_path).join("_field_master.json");
    if master_path.exists() {
        if let Ok(master_content) = fs::read_to_string(&master_path) {
            if let Ok(master) = serde_json::from_str::<FieldMasterJson>(&master_content) {
                let master_map: HashMap<String, &MasterField> = master.fields.iter()
                    .map(|f| (f.key.clone(), f))
                    .collect();

                for sf in &mut schema_fields {
                    let key = field_master_key(sf.field_id, &sf.column);
                    if let Some(mf) = master_map.get(&key) {
                        if sf.group.is_none() {
                            sf.group = mf.group.clone();
                        }
                        if sf.description.is_none() {
                            sf.description = mf.description.clone();
                        }
                        if sf.tags.is_empty() {
                            sf.tags = mf.tags.clone();
                        }
                        // is_categorical defaults to false, so always apply master value
                        sf.is_categorical = mf.is_categorical;
                    }
                }
            }
        }
    }

    // Auto-fill descriptions from definition_analysis.json (AI-generated) if available
    let analysis_path = def_path.parent().unwrap().join("definition_analysis.json");
    if analysis_path.exists() {
        if let Ok(analysis_content) = fs::read_to_string(&analysis_path) {
            if let Ok(analysis) = serde_json::from_str::<serde_json::Value>(&analysis_content) {
                if let Some(col_descs) = analysis.get("columnDescriptions").and_then(|v| v.as_object()) {
                    for sf in &mut schema_fields {
                        // Only fill if description is empty or null
                        let is_empty = sf.description.as_ref().map_or(true, |d| d.trim().is_empty());
                        if is_empty {
                            // columnDescriptions is keyed by display name
                            if let Some(desc_val) = col_descs.get(&sf.name) {
                                if let Some(desc_str) = desc_val.as_str() {
                                    if !desc_str.is_empty() {
                                        sf.description = Some(desc_str.to_string());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let field_count = schema_fields.len();

    // Build SchemaJson
    let schema = SchemaJson {
        table_name,
        display_name: table_display_name,
        fuel_stage: Some(model_name.clone()),
        model: Some(model_name.clone()),
        description: None,
        status: Some("draft".to_string()),
        resource_url: None,
        freshness_column: None,
        fields: schema_fields,
    };

    // Create output folder: {entities_base_path}/{entity_name}/{model_name}/
    let output_dir = Path::new(&entities_base_path)
        .join(&entity_name)
        .join(&model_name);
    fs::create_dir_all(&output_dir)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    // Write schema.json — build manually to match existing key order
    let schema_path = output_dir.join("schema.json");
    let fields_json: Vec<serde_json::Value> = schema.fields.iter().map(|f| {
        let mut field = serde_json::json!({
            "name": f.name,
            "column": f.column,
            "type": f.field_type,
            "field_id": f.field_id,
            "group": f.group,
            "is_key": f.is_key,
            "is_categorical": f.is_categorical,
            "description": f.description,
        });
        if !f.tags.is_empty() {
            field.as_object_mut().unwrap().insert("tags".to_string(), serde_json::json!(f.tags));
        }
        field
    }).collect();
    let json_value = serde_json::json!({
        "table_name": schema.table_name,
        "display_name": schema.display_name,
        "fuel_stage": schema.fuel_stage,
        "model": schema.model,
        "description": schema.description,
        "status": schema.status,
        "resource_url": schema.resource_url,
        "fields": fields_json,
    });
    let schema_path_str = schema_path.to_string_lossy().to_string();
    write_json(&schema_path_str, &json_value)?;

    Ok(CreateSchemaResult {
        schema_path: schema_path_str,
        field_count,
    })
}

/// Enrich empty descriptions in an existing schema.json from domain definition_analysis.json files.
/// Scans all production domains for matching table_name and pulls AI-generated columnDescriptions.
#[command]
pub fn val_enrich_schema_descriptions(
    schema_json_path: String,
    domains_base_path: String,
) -> Result<serde_json::Value, String> {
    let schema_path = Path::new(&schema_json_path);
    if !schema_path.exists() {
        return Err(format!("schema.json not found: {}", schema_json_path));
    }

    // Read and parse schema.json
    let content = fs::read_to_string(schema_path)
        .map_err(|e| format!("Failed to read schema.json: {}", e))?;
    let mut schema_val: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse schema.json: {}", e))?;

    let table_name = schema_val["table_name"]
        .as_str()
        .ok_or_else(|| "No table_name in schema.json".to_string())?
        .to_string();

    // Scan all production domains for matching definition_analysis.json
    let domains_dir = Path::new(&domains_base_path);
    if !domains_dir.is_dir() {
        return Err(format!("Domains path not found: {}", domains_base_path));
    }

    // Collect AI descriptions from all matching domains (last one wins, they should be consistent)
    let mut ai_descs: HashMap<String, String> = HashMap::new();
    let mut source_domain: Option<String> = None;

    if let Ok(domain_entries) = fs::read_dir(domains_dir) {
        for domain_entry in domain_entries.flatten() {
            if !domain_entry.path().is_dir() { continue; }
            let domain_name = domain_entry.file_name().to_string_lossy().to_string();
            let analysis_path = domain_entry.path()
                .join("data_models")
                .join(format!("table_{}", table_name))
                .join("definition_analysis.json");

            if !analysis_path.exists() { continue; }

            if let Ok(analysis_content) = fs::read_to_string(&analysis_path) {
                if let Ok(analysis) = serde_json::from_str::<serde_json::Value>(&analysis_content) {
                    if let Some(col_descs) = analysis.get("columnDescriptions").and_then(|v| v.as_object()) {
                        for (name, desc_val) in col_descs {
                            if let Some(desc_str) = desc_val.as_str() {
                                if !desc_str.is_empty() {
                                    ai_descs.insert(name.clone(), desc_str.to_string());
                                }
                            }
                        }
                        source_domain = Some(domain_name);
                    }
                }
            }
        }
    }

    if ai_descs.is_empty() {
        return Ok(serde_json::json!({
            "enriched": 0,
            "message": format!("No AI descriptions found for table {}", table_name),
        }));
    }

    // Fill empty descriptions in schema.json
    let fields = schema_val["fields"]
        .as_array_mut()
        .ok_or_else(|| "No fields array in schema.json".to_string())?;

    let mut enriched = 0usize;
    for field in fields.iter_mut() {
        let desc = field.get("description");
        let is_empty = match desc {
            None => true,
            Some(serde_json::Value::Null) => true,
            Some(serde_json::Value::String(s)) => s.trim().is_empty(),
            _ => false,
        };
        if !is_empty { continue; }

        let name = field.get("name").and_then(|v| v.as_str()).unwrap_or("");
        if let Some(ai_desc) = ai_descs.get(name) {
            field.as_object_mut().unwrap().insert(
                "description".to_string(),
                serde_json::Value::String(ai_desc.clone()),
            );
            enriched += 1;
        }
    }

    if enriched > 0 {
        let json_str = serde_json::to_string_pretty(&schema_val)
            .map_err(|e| format!("Failed to serialize: {}", e))?;
        fs::write(schema_path, json_str)
            .map_err(|e| format!("Failed to write schema.json: {}", e))?;
    }

    Ok(serde_json::json!({
        "enriched": enriched,
        "total_ai_descriptions": ai_descs.len(),
        "source_domain": source_domain,
    }))
}

/// Build the cross-entity field master by scanning all entity schemas.
/// Merges with existing _field_master.json to preserve manual edits.
#[command]
pub fn val_build_field_master(entities_path: String) -> Result<FieldMasterJson, String> {
    let base = Path::new(&entities_path);
    if !base.exists() {
        return Err(format!("Entities path does not exist: {}", entities_path));
    }

    // Load existing master for preserving manual edits
    let existing_master = read_field_master(base);
    let mut existing_map: HashMap<String, MasterField> = HashMap::new();
    if let Some(ref master) = existing_master {
        for f in &master.fields {
            existing_map.insert(f.key.clone(), f.clone());
        }
    }

    // Scan all entity/model folders for schema.json
    let mut field_map: HashMap<String, MasterField> = HashMap::new();
    let mut entity_names: std::collections::HashSet<String> = std::collections::HashSet::new();

    let entity_dirs = fs::read_dir(base)
        .map_err(|e| format!("Failed to read entities dir: {}", e))?;

    let mut sorted_entity_dirs: Vec<_> = entity_dirs
        .flatten()
        .filter(|e| e.path().is_dir())
        .filter(|e| !e.file_name().to_string_lossy().starts_with('.'))
        .filter(|e| !e.file_name().to_string_lossy().starts_with('_'))
        .collect();
    sorted_entity_dirs.sort_by(|a, b| a.file_name().cmp(&b.file_name()));

    for entity_entry in sorted_entity_dirs {
        let entity_name = entity_entry.file_name().to_string_lossy().to_string();
        let entity_path = entity_entry.path();

        if let Ok(model_entries) = fs::read_dir(&entity_path) {
            let mut model_dirs: Vec<_> = model_entries
                .flatten()
                .filter(|e| e.path().is_dir())
                .filter(|e| !e.file_name().to_string_lossy().starts_with('.'))
                .collect();
            model_dirs.sort_by(|a, b| a.file_name().cmp(&b.file_name()));

            for model_entry in model_dirs {
                let model_name = model_entry.file_name().to_string_lossy().to_string();
                let model_path = model_entry.path();

                if let Some(schema) = read_schema_json(&model_path) {
                    entity_names.insert(entity_name.clone());

                    for field in &schema.fields {
                        let key = field_master_key(field.field_id, &field.column);

                        if let Some(existing) = field_map.get_mut(&key) {
                            // Append entity reference if not already present
                            let already = existing.entities.iter().any(|e| {
                                e.entity == entity_name && e.model == model_name
                            });
                            if !already {
                                existing.entities.push(MasterFieldEntity {
                                    entity: entity_name.clone(),
                                    model: model_name.clone(),
                                });
                            }
                        } else {
                            // First-seen: use this field's metadata as base, then overlay existing master edits
                            let mut master_field = MasterField {
                                key: key.clone(),
                                field_id: field.field_id,
                                column: field.column.clone(),
                                name: field.name.clone(),
                                field_type: field.field_type.clone(),
                                group: field.group.clone(),
                                is_categorical: field.is_categorical,
                                description: field.description.clone(),
                                tags: field.tags.clone(),
                                entities: vec![MasterFieldEntity {
                                    entity: entity_name.clone(),
                                    model: model_name.clone(),
                                }],
                            };

                            // Preserve manual edits from existing master
                            if let Some(prev) = existing_map.get(&key) {
                                if prev.group.is_some() {
                                    master_field.group = prev.group.clone();
                                }
                                if prev.description.is_some() {
                                    master_field.description = prev.description.clone();
                                }
                                if !prev.tags.is_empty() {
                                    master_field.tags = prev.tags.clone();
                                }
                                master_field.is_categorical = prev.is_categorical;
                            }

                            field_map.insert(key, master_field);
                        }
                    }
                }
            }
        }
    }

    // Sort by group then name
    let mut fields: Vec<MasterField> = field_map.into_values().collect();
    fields.sort_by(|a, b| {
        let ga = a.group.as_deref().unwrap_or("zzz");
        let gb = b.group.as_deref().unwrap_or("zzz");
        ga.cmp(gb).then(a.name.cmp(&b.name))
    });

    let master = FieldMasterJson {
        generated: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        total_fields: fields.len(),
        total_entities: entity_names.len(),
        fields,
    };

    // Write _field_master.json
    let master_path = base.join("_field_master.json").to_string_lossy().to_string();
    write_json(&master_path, &serde_json::to_value(&master)
        .map_err(|e| format!("Failed to serialize field master: {}", e))?)?;

    Ok(master)
}

/// Save the field master and propagate governed fields to all referencing entity schemas.
/// Returns the count of schema files updated.
#[command]
pub fn val_save_field_master(
    entities_path: String,
    master: FieldMasterJson,
) -> Result<u32, String> {
    let base = Path::new(&entities_path);
    if !base.exists() {
        return Err(format!("Entities path does not exist: {}", entities_path));
    }

    // Write _field_master.json
    let master_path = base.join("_field_master.json").to_string_lossy().to_string();
    write_json(&master_path, &serde_json::to_value(&master)
        .map_err(|e| format!("Failed to serialize field master: {}", e))?)?;

    // Propagate governed fields to each entity/model schema
    let mut updated_count: u32 = 0;
    let mut updated_schemas: std::collections::HashSet<String> = std::collections::HashSet::new();

    for field in &master.fields {
        for entity_ref in &field.entities {
            let schema_path = base
                .join(&entity_ref.entity)
                .join(&entity_ref.model)
                .join("schema.json");
            let schema_key = schema_path.to_string_lossy().to_string();

            // Read schema
            let content = match fs::read_to_string(&schema_path) {
                Ok(c) => c,
                Err(_) => continue,
            };
            let mut schema: SchemaJson = match serde_json::from_str(&content) {
                Ok(s) => s,
                Err(_) => continue,
            };

            // Find matching field by field_id or column
            let mut changed = false;
            for sf in &mut schema.fields {
                let sf_key = field_master_key(sf.field_id, &sf.column);
                if sf_key != field.key {
                    continue;
                }

                // Propagate governed fields
                if sf.group != field.group {
                    sf.group = field.group.clone();
                    changed = true;
                }
                if sf.is_categorical != field.is_categorical {
                    sf.is_categorical = field.is_categorical;
                    changed = true;
                }
                if sf.description != field.description {
                    sf.description = field.description.clone();
                    changed = true;
                }
                if sf.tags != field.tags {
                    sf.tags = field.tags.clone();
                    changed = true;
                }
            }

            if changed && !updated_schemas.contains(&schema_key) {
                // Write back schema.json preserving key order
                let fields_json: Vec<serde_json::Value> = schema.fields.iter().map(|f| {
                    let mut fj = serde_json::json!({
                        "name": f.name,
                        "column": f.column,
                        "type": f.field_type,
                        "field_id": f.field_id,
                        "group": f.group,
                        "is_key": f.is_key,
                        "is_categorical": f.is_categorical,
                        "description": f.description,
                    });
                    if !f.tags.is_empty() {
                        fj.as_object_mut().unwrap().insert("tags".to_string(), serde_json::json!(f.tags));
                    }
                    fj
                }).collect();

                let json_value = serde_json::json!({
                    "table_name": schema.table_name,
                    "display_name": schema.display_name,
                    "fuel_stage": schema.fuel_stage,
                    "model": schema.model,
                    "description": schema.description,
                    "status": schema.status,
                    "resource_url": schema.resource_url,
                    "fields": fields_json,
                });

                write_json(&schema_key, &json_value)?;
                updated_schemas.insert(schema_key);
                updated_count += 1;
            }
        }
    }

    Ok(updated_count)
}
