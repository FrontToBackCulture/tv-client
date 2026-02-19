// VAL Sync MCP Tools
// 16 tools for syncing VAL platform data via Claude Code

use crate::commands::val_sync::{config, errors, extract, metadata, monitoring, sql, sync};
use crate::mcp::protocol::{InputSchema, Tool, ToolResult};
use chrono::Timelike;
use serde_json::{json, Value};

macro_rules! require_domain {
    ($args:expr) => {
        match $args.get("domain").and_then(|d| d.as_str()) {
            Some(d) => d.to_string(),
            None => return ToolResult::error("'domain' parameter is required".to_string()),
        }
    };
}

// ============================================================================
// Tool Definitions
// ============================================================================

pub fn tools() -> Vec<Tool> {
    vec![
        Tool {
            name: "sync-val-list-domains".to_string(),
            description: "List all configured VAL domains with their global paths. Use this to see which domains are available for syncing.".to_string(),
            input_schema: InputSchema::empty(),
        },
        Tool {
            name: "sync-val-fields".to_string(),
            description: "Sync field definitions from a VAL domain. Downloads all field metadata to all_fields.json.".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "domain": {
                        "type": "string",
                        "description": "VAL domain name (e.g., 'koi', 'suntec')"
                    }
                }),
                vec!["domain".to_string()],
            ),
        },
        Tool {
            name: "sync-val-queries".to_string(),
            description: "Sync query definitions from a VAL domain. Downloads all queries to all_queries.json.".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "domain": {
                        "type": "string",
                        "description": "VAL domain name (e.g., 'koi', 'suntec')"
                    }
                }),
                vec!["domain".to_string()],
            ),
        },
        Tool {
            name: "sync-val-workflows".to_string(),
            description: "Sync workflow definitions from a VAL domain. Downloads all workflows to all_workflows.json.".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "domain": {
                        "type": "string",
                        "description": "VAL domain name (e.g., 'koi', 'suntec')"
                    }
                }),
                vec!["domain".to_string()],
            ),
        },
        Tool {
            name: "sync-val-dashboards".to_string(),
            description: "Sync dashboard definitions from a VAL domain. Downloads all dashboards to all_dashboards.json.".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "domain": {
                        "type": "string",
                        "description": "VAL domain name (e.g., 'koi', 'suntec')"
                    }
                }),
                vec!["domain".to_string()],
            ),
        },
        Tool {
            name: "sync-val-tables".to_string(),
            description: "Sync table/data model definitions from a VAL domain. Downloads the admin tree to all_tables.json.".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "domain": {
                        "type": "string",
                        "description": "VAL domain name (e.g., 'koi', 'suntec')"
                    }
                }),
                vec!["domain".to_string()],
            ),
        },
        Tool {
            name: "sync-val-calc-fields".to_string(),
            description: "Sync calculated field definitions from a VAL domain. Downloads to all_calculated_fields.json.".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "domain": {
                        "type": "string",
                        "description": "VAL domain name (e.g., 'koi', 'suntec')"
                    }
                }),
                vec!["domain".to_string()],
            ),
        },
        Tool {
            name: "sync-val-all".to_string(),
            description: "Full sync + extract for a VAL domain. Runs all 6 sync operations followed by all 6 extract operations. This is the recommended way to fully sync a domain.".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "domain": {
                        "type": "string",
                        "description": "VAL domain name (e.g., 'koi', 'suntec')"
                    }
                }),
                vec!["domain".to_string()],
            ),
        },
        Tool {
            name: "sync-val-extract".to_string(),
            description: "Run extract operations on already-synced data. Extracts individual definitions from aggregated JSON files. Types: queries, workflows, dashboards, tables, sql, calc-fields. Omit type to run all extracts.".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "domain": {
                        "type": "string",
                        "description": "VAL domain name (e.g., 'koi', 'suntec')"
                    },
                    "type": {
                        "type": "string",
                        "description": "Extract type: queries, workflows, dashboards, tables, sql, calc-fields. Omit to run all.",
                        "enum": ["queries", "workflows", "dashboards", "tables", "sql", "calc-fields"]
                    }
                }),
                vec!["domain".to_string()],
            ),
        },
        Tool {
            name: "sync-val-status".to_string(),
            description: "Get sync status and metadata for a domain. Shows last sync times, item counts, and recent history.".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "domain": {
                        "type": "string",
                        "description": "VAL domain name. If omitted, shows status for all domains."
                    }
                }),
                vec![],
            ),
        },
        Tool {
            name: "sync-all-domain-workflows".to_string(),
            description: "Sync workflow definitions for ALL production domains. Downloads workflow metadata for each domain. Takes time to complete.".to_string(),
            input_schema: InputSchema::empty(),
        },
        Tool {
            name: "sync-all-domain-monitoring".to_string(),
            description: "Sync workflow execution/monitoring data for ALL production domains. Fetches recent workflow execution history (11pm yesterday to now) from VAL API. Takes a few minutes to complete.".to_string(),
            input_schema: InputSchema::empty(),
        },
        Tool {
            name: "sync-all-domain-importers".to_string(),
            description: "Sync custom importer error logs for ALL production domains. Fetches from centralized tv domain and saves to each domain's analytics folder. Takes time to complete.".to_string(),
            input_schema: InputSchema::empty(),
        },
        Tool {
            name: "sync-all-domain-integration-errors".to_string(),
            description: "Sync integration/API error logs (POS, bank, delivery platforms) for ALL production domains. Fetches from centralized tv domain and saves to each domain's analytics folder. Takes time to complete.".to_string(),
            input_schema: InputSchema::empty(),
        },
        Tool {
            name: "sync-all-domain-sod-tables".to_string(),
            description: "Sync SOD (Start of Day) table calculation status for eligible domains (dapaolo, saladstop, spaespritgroup, grain). Shows completed/incomplete/errored tables.".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "date": {
                        "type": "string",
                        "description": "Date in YYYY-MM-DD format (defaults to today SGT)"
                    }
                }),
                vec![],
            ),
        },
        Tool {
            name: "execute-val-sql".to_string(),
            description: "Execute a SQL query on a VAL domain. Provide SQL directly or as a file path. Returns summary and data. Only SELECT queries are allowed.".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "domain": {
                        "type": "string",
                        "description": "VAL domain name (e.g., 'suntec', 'koi', 'tryval', 'jfh')"
                    },
                    "sql": {
                        "type": "string",
                        "description": "SQL query (SELECT only) OR path to a .sql file"
                    },
                    "limit": {
                        "type": "number",
                        "description": "Max rows to return (default: 100)"
                    }
                }),
                vec!["domain".to_string(), "sql".to_string()],
            ),
        },
    ]
}

// ============================================================================
// Tool Dispatch
// ============================================================================

pub async fn call(name: &str, args: Value) -> ToolResult {
    match name {
        "sync-val-list-domains" => {
            match config::val_sync_list_domains() {
                Ok(domains) => {
                    if domains.is_empty() {
                        return ToolResult::text(
                            "No domains configured. Import config with val_sync_import_config or add domains manually.".to_string(),
                        );
                    }
                    let list: Vec<String> = domains
                        .iter()
                        .map(|d| {
                            let alias = if d.has_actual_domain {
                                " (has API alias)"
                            } else {
                                ""
                            };
                            format!("- **{}**{}: `{}`", d.domain, alias, d.global_path)
                        })
                        .collect();
                    ToolResult::text(format!(
                        "## VAL Domains ({} configured)\n\n{}",
                        domains.len(),
                        list.join("\n")
                    ))
                }
                Err(e) => ToolResult::error(format!("Failed to list domains: {}", e)),
            }
        }

        "sync-val-fields" => {
            let domain = require_domain!(args);
            match sync::val_sync_fields(domain.clone()).await {
                Ok(r) => ToolResult::text(format_sync_result(&r)),
                Err(e) => ToolResult::error(format!("Sync fields failed: {}", e)),
            }
        }

        "sync-val-queries" => {
            let domain = require_domain!(args);
            match sync::val_sync_queries(domain.clone()).await {
                Ok(r) => ToolResult::text(format_sync_result(&r)),
                Err(e) => ToolResult::error(format!("Sync queries failed: {}", e)),
            }
        }

        "sync-val-workflows" => {
            let domain = require_domain!(args);
            match sync::val_sync_workflows(domain.clone()).await {
                Ok(r) => ToolResult::text(format_sync_result(&r)),
                Err(e) => ToolResult::error(format!("Sync workflows failed: {}", e)),
            }
        }

        "sync-val-dashboards" => {
            let domain = require_domain!(args);
            match sync::val_sync_dashboards(domain.clone()).await {
                Ok(r) => ToolResult::text(format_sync_result(&r)),
                Err(e) => ToolResult::error(format!("Sync dashboards failed: {}", e)),
            }
        }

        "sync-val-tables" => {
            let domain = require_domain!(args);
            match sync::val_sync_tables(domain.clone()).await {
                Ok(r) => ToolResult::text(format_sync_result(&r)),
                Err(e) => ToolResult::error(format!("Sync tables failed: {}", e)),
            }
        }

        "sync-val-calc-fields" => {
            let domain = require_domain!(args);
            match sync::val_sync_calc_fields(domain.clone()).await {
                Ok(r) => ToolResult::text(format_sync_result(&r)),
                Err(e) => ToolResult::error(format!("Sync calc fields failed: {}", e)),
            }
        }

        "sync-val-all" => {
            let domain = require_domain!(args);
            match sync::val_sync_all(domain.clone()).await {
                Ok(r) => {
                    let mut lines = vec![format!(
                        "## Full Sync: {} ({})\n",
                        r.domain, r.status
                    )];

                    lines.push("### Sync Results".to_string());
                    for sr in &r.results {
                        lines.push(format!(
                            "- **{}**: {} items ({}ms) [{}]",
                            sr.artifact_type, sr.count, sr.duration_ms, sr.status
                        ));
                    }

                    lines.push("\n### Extract Results".to_string());
                    for er in &r.extract_results {
                        lines.push(format!(
                            "- **{}**: {} items ({}ms) [{}]",
                            er.extract_type, er.count, er.duration_ms, er.status
                        ));
                    }

                    lines.push(format!("\n**Total: {}ms**", r.total_duration_ms));
                    ToolResult::text(lines.join("\n"))
                }
                Err(e) => ToolResult::error(format!("Full sync failed: {}", e)),
            }
        }

        "sync-val-extract" => {
            let domain = require_domain!(args);
            let extract_type = args.get("type").and_then(|t| t.as_str());

            match extract_type {
                Some(t) => {
                    match extract::run_extract(&domain, t).await {
                        Ok(r) => ToolResult::text(format!(
                            "Extracted **{}** {}: {} items in {}ms",
                            r.domain, r.extract_type, r.count, r.duration_ms
                        )),
                        Err(e) => ToolResult::error(format!("Extract {} failed: {}", t, e)),
                    }
                }
                None => {
                    // Run all extracts
                    let types = ["queries", "workflows", "dashboards", "tables", "sql", "calc-fields"];
                    let mut lines = vec![format!("## Extract All: {}\n", domain)];

                    for t in &types {
                        match extract::run_extract(&domain, t).await {
                            Ok(r) => lines.push(format!(
                                "- **{}**: {} items ({}ms) [{}]",
                                r.extract_type, r.count, r.duration_ms, r.status
                            )),
                            Err(e) => lines.push(format!("- **{}**: ERROR - {}", t, e)),
                        }
                    }

                    ToolResult::text(lines.join("\n"))
                }
            }
        }

        "sync-val-status" => {
            let domain = args.get("domain").and_then(|d| d.as_str());

            match domain {
                Some(d) => {
                    match metadata::val_sync_get_status(d.to_string()) {
                        Ok(meta) => ToolResult::json(&meta),
                        Err(e) => ToolResult::error(format!("Failed to get status: {}", e)),
                    }
                }
                None => {
                    // Show status for all domains
                    match config::val_sync_list_domains() {
                        Ok(domains) => {
                            let mut lines = vec!["## Sync Status (All Domains)\n".to_string()];
                            for d in &domains {
                                match metadata::val_sync_get_status(d.domain.clone()) {
                                    Ok(meta) => {
                                        let artifact_count = meta.artifacts.len();
                                        let last_sync = meta
                                            .history
                                            .last()
                                            .map(|h| h.timestamp.as_str())
                                            .unwrap_or("never");
                                        lines.push(format!(
                                            "- **{}**: {} artifact types synced, last: {}",
                                            d.domain, artifact_count, last_sync
                                        ));
                                    }
                                    Err(_) => {
                                        lines.push(format!("- **{}**: no sync data", d.domain));
                                    }
                                }
                            }
                            ToolResult::text(lines.join("\n"))
                        }
                        Err(e) => ToolResult::error(format!("Failed to list domains: {}", e)),
                    }
                }
            }
        }

        "execute-val-sql" => {
            let domain = require_domain!(args);
            let sql_query = match args.get("sql").and_then(|s| s.as_str()) {
                Some(s) => s.to_string(),
                None => return ToolResult::error("'sql' parameter is required".to_string()),
            };
            let limit = args.get("limit").and_then(|l| l.as_u64()).map(|l| l as usize);

            match sql::val_execute_sql(domain.clone(), sql_query, limit).await {
                Ok(result) => {
                    if let Some(err) = &result.error {
                        return ToolResult::error(format!("SQL error: {}", err));
                    }

                    let mut lines = vec![
                        format!("## SQL Results: {} ({})", domain, result.row_count),
                        format!("Columns: {}", result.columns.join(", ")),
                        String::new(),
                    ];

                    if result.truncated {
                        lines.push(format!("*Results truncated to {} rows*\n", result.data.len()));
                    }

                    // Format data as markdown table
                    if !result.data.is_empty() && !result.columns.is_empty() {
                        // Header
                        lines.push(format!("| {} |", result.columns.join(" | ")));
                        lines.push(format!("| {} |", result.columns.iter().map(|_| "---").collect::<Vec<_>>().join(" | ")));

                        // Rows (max 500 for display)
                        for row in result.data.iter().take(500) {
                            let cells: Vec<String> = result.columns.iter().map(|col| {
                                row.get(col)
                                    .map(|v| {
                                        if v.is_null() {
                                            "NULL".to_string()
                                        } else if let Some(s) = v.as_str() {
                                            s.to_string()
                                        } else {
                                            v.to_string()
                                        }
                                    })
                                    .unwrap_or_default()
                            }).collect();
                            lines.push(format!("| {} |", cells.join(" | ")));
                        }

                        if result.data.len() > 500 {
                            lines.push(format!("\n*...and {} more rows*", result.data.len() - 500));
                        }
                    } else {
                        lines.push("No rows returned.".to_string());
                    }

                    ToolResult::text(lines.join("\n"))
                }
                Err(e) => ToolResult::error(format!("SQL execution failed: {}", e)),
            }
        }

        "sync-all-domain-workflows" => {
            handle_sync_all_domain_workflows().await
        }

        "sync-all-domain-monitoring" => {
            handle_sync_all_domain_monitoring().await
        }

        "sync-all-domain-importers" => {
            handle_sync_all_domain_errors("importer").await
        }

        "sync-all-domain-integration-errors" => {
            handle_sync_all_domain_errors("integration").await
        }

        "sync-all-domain-sod-tables" => {
            let date = args
                .get("date")
                .and_then(|d| d.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| {
                    chrono::Utc::now()
                        .with_timezone(&chrono::FixedOffset::east_opt(8 * 3600).unwrap())
                        .format("%Y-%m-%d")
                        .to_string()
                });
            handle_sync_all_domain_sod_tables(&date).await
        }

        _ => ToolResult::error(format!("Unknown val-sync tool: {}", name)),
    }
}

// ============================================================================
// Helpers
// ============================================================================

fn format_sync_result(r: &sync::SyncResult) -> String {
    format!(
        "Synced **{}** {}: {} items in {}ms\nFile: `{}`",
        r.domain, r.artifact_type, r.count, r.duration_ms, r.file_path
    )
}

/// Get default date range for error queries: 11pm yesterday to now (SGT)
fn get_default_error_date_range() -> (String, String) {
    let sgt = chrono::FixedOffset::east_opt(8 * 3600).unwrap();
    let now = chrono::Utc::now().with_timezone(&sgt);
    let yesterday_11pm = now - chrono::Duration::hours(now.hour() as i64 + 1);
    let yesterday_11pm = yesterday_11pm
        .date_naive()
        .and_hms_opt(23, 0, 0)
        .unwrap();
    let from = yesterday_11pm.format("%Y-%m-%d %H:%M:%S").to_string();
    let to = now.format("%Y-%m-%d %H:%M:%S").to_string();
    (from, to)
}

/// Filter config to production domains (exclude documentation, lab, templates)
fn get_production_domains() -> Result<Vec<config::DomainSummary>, String> {
    let domains = config::val_sync_list_domains()?;
    let excluded = ["documentation", "lab", "templates"];
    Ok(domains
        .into_iter()
        .filter(|d| !excluded.contains(&d.domain.to_lowercase().as_str()))
        .collect())
}

/// Sync importer or integration errors across all production domains
/// Sync workflow definitions across all production domains
async fn handle_sync_all_domain_workflows() -> ToolResult {
    let domains = match get_production_domains() {
        Ok(d) => d,
        Err(e) => return ToolResult::error(format!("Failed to list domains: {}", e)),
    };

    if domains.is_empty() {
        return ToolResult::error("No production domains found in config".to_string());
    }

    let mut results = Vec::new();
    let mut success_count = 0u32;
    let mut failed_count = 0u32;
    let mut total_workflows = 0usize;

    for d in &domains {
        match sync::val_sync_workflows(d.domain.clone()).await {
            Ok(r) => {
                success_count += 1;
                total_workflows += r.count;
                results.push(format!("{}: {} workflows", d.domain, r.count));
            }
            Err(e) => {
                failed_count += 1;
                let short_err = if e.len() > 100 { &e[..100] } else { &e };
                results.push(format!("{}: FAILED - {}", d.domain, short_err));
            }
        }
    }

    let status = if failed_count == 0 {
        "All domains synced successfully"
    } else {
        "Completed with errors"
    };

    let mut lines = vec![
        "## Sync All Domain Workflows".to_string(),
        String::new(),
        format!("**Status:** {}", status),
        format!("**Domains processed:** {}", domains.len()),
        format!("**Successful:** {}", success_count),
    ];
    if failed_count > 0 {
        lines.push(format!("**Failed:** {}", failed_count));
    }
    lines.push(format!("**Total workflows:** {}", total_workflows));
    lines.push(String::new());
    lines.push("**Results:**".to_string());
    for r in &results {
        lines.push(format!("- {}", r));
    }

    ToolResult::text(lines.join("\n"))
}

/// Sync workflow execution monitoring data across all production domains
/// Default window: 11pm yesterday to now (SGT)
async fn handle_sync_all_domain_monitoring() -> ToolResult {
    let domains = match get_production_domains() {
        Ok(d) => d,
        Err(e) => return ToolResult::error(format!("Failed to list domains: {}", e)),
    };

    if domains.is_empty() {
        return ToolResult::error("No production domains found in config".to_string());
    }

    // Default window: 11pm yesterday to now (SGT)
    let (from, to) = get_default_error_date_range();

    let mut results = Vec::new();
    let mut success_count = 0u32;
    let mut failed_count = 0u32;
    let mut total_executions = 0usize;

    for d in &domains {
        match monitoring::val_sync_workflow_executions(
            d.domain.clone(),
            from.clone(),
            to.clone(),
        )
        .await
        {
            Ok(r) => {
                success_count += 1;
                total_executions += r.count;
                results.push(format!("{}: {} executions", d.domain, r.count));
            }
            Err(e) => {
                failed_count += 1;
                let short_err = if e.len() > 100 { &e[..100] } else { &e };
                results.push(format!("{}: FAILED - {}", d.domain, short_err));
            }
        }
    }

    let status = if failed_count == 0 {
        "All domains synced successfully"
    } else {
        "Completed with errors"
    };

    let mut lines = vec![
        "## Sync All Domain Monitoring".to_string(),
        String::new(),
        format!("**Status:** {}", status),
        format!("**Window:** {} to {}", from, to),
        format!("**Domains processed:** {}", domains.len()),
        format!("**Successful:** {}", success_count),
    ];
    if failed_count > 0 {
        lines.push(format!("**Failed:** {}", failed_count));
    }
    lines.push(format!("**Total executions:** {}", total_executions));
    lines.push(String::new());
    lines.push("**Results:**".to_string());
    for r in &results {
        lines.push(format!("- {}", r));
    }

    ToolResult::text(lines.join("\n"))
}

async fn handle_sync_all_domain_errors(error_type: &str) -> ToolResult {
    let domains = match get_production_domains() {
        Ok(d) => d,
        Err(e) => return ToolResult::error(format!("Failed to list domains: {}", e)),
    };

    if domains.is_empty() {
        return ToolResult::error("No production domains found in config".to_string());
    }

    let (from, to) = get_default_error_date_range();
    let mut results = Vec::new();
    let mut success_count = 0u32;
    let mut failed_count = 0u32;
    let mut total_errors = 0usize;

    for d in &domains {
        let result = if error_type == "importer" {
            errors::val_sync_importer_errors(d.domain.clone(), from.clone(), to.clone()).await
        } else {
            errors::val_sync_integration_errors(d.domain.clone(), from.clone(), to.clone()).await
        };

        match result {
            Ok(r) => {
                success_count += 1;
                total_errors += r.count;
                results.push(format!("{}: {} errors", d.domain, r.count));
            }
            Err(e) => {
                failed_count += 1;
                let short_err = if e.len() > 100 { &e[..100] } else { &e };
                results.push(format!("{}: FAILED - {}", d.domain, short_err));
            }
        }
    }

    let status = if failed_count == 0 {
        "All domains synced successfully"
    } else {
        "Completed with errors"
    };

    let label = if error_type == "importer" {
        "Importer Errors"
    } else {
        "Integration Errors"
    };

    let mut lines = vec![
        format!("## Sync All Domain {}", label),
        String::new(),
        format!("**Status:** {}", status),
        format!("**Domains processed:** {}", domains.len()),
        format!("**Successful:** {}", success_count),
    ];
    if failed_count > 0 {
        lines.push(format!("**Failed:** {}", failed_count));
    }
    lines.push(format!("**Total errors found:** {}", total_errors));
    lines.push(String::new());
    lines.push("**Results:**".to_string());
    for r in &results {
        lines.push(format!("- {}", r));
    }

    ToolResult::text(lines.join("\n"))
}

/// Sync SOD table status across eligible domains
async fn handle_sync_all_domain_sod_tables(date: &str) -> ToolResult {
    const SOD_ELIGIBLE: &[&str] = &["dapaolo", "saladstop", "spaespritgroup", "grain"];

    let all_domains = match config::val_sync_list_domains() {
        Ok(d) => d,
        Err(e) => return ToolResult::error(format!("Failed to list domains: {}", e)),
    };

    let domains: Vec<_> = all_domains
        .into_iter()
        .filter(|d| SOD_ELIGIBLE.contains(&d.domain.to_lowercase().as_str()))
        .collect();

    if domains.is_empty() {
        return ToolResult::error(format!(
            "No SOD-eligible domains found in config. SOD tables only apply to: {}",
            SOD_ELIGIBLE.join(", ")
        ));
    }

    let mut results = Vec::new();
    let mut issue_results = Vec::new();
    let mut _success_count = 0u32;
    let mut failed_count = 0u32;
    let mut total_tables = 0usize;
    let mut total_completed = 0usize;
    let mut total_started = 0usize;
    let mut total_errored = 0usize;

    for d in &domains {
        match monitoring::val_sync_sod_tables_status(d.domain.clone(), date.to_string(), false)
            .await
        {
            Ok(r) => {
                _success_count += 1;

                // Read the output file to parse status breakdown
                let status_counts = parse_sod_status_from_file(&r.file_path);
                let completed = status_counts.get("completed").copied().unwrap_or(0);
                let started = status_counts.get("started").copied().unwrap_or(0);
                let errored = status_counts.get("errored").copied().unwrap_or(0);
                let table_count = r.count;

                total_tables += table_count;
                total_completed += completed;
                total_started += started;
                total_errored += errored;

                if started > 0 || errored > 0 {
                    let mut issues = Vec::new();
                    if started > 0 {
                        issues.push(format!("{} incomplete", started));
                    }
                    if errored > 0 {
                        issues.push(format!("{} errored", errored));
                    }
                    issue_results.push(format!(
                        "**{}**: {} ({}/{} completed)",
                        d.domain,
                        issues.join(", "),
                        completed,
                        table_count
                    ));
                }
                results.push(format!(
                    "{}: {}/{} completed{}{}",
                    d.domain,
                    completed,
                    table_count,
                    if started > 0 {
                        format!(", {} incomplete", started)
                    } else {
                        String::new()
                    },
                    if errored > 0 {
                        format!(", {} errored", errored)
                    } else {
                        String::new()
                    }
                ));
            }
            Err(e) => {
                failed_count += 1;
                let short_err = if e.len() > 100 { &e[..100] } else { &e };
                results.push(format!("{}: FAILED - {}", d.domain, short_err));
            }
        }
    }

    let has_issues = total_started > 0 || total_errored > 0 || failed_count > 0;
    let status = if !has_issues {
        "All SOD calculations completed"
    } else if total_started > 0 {
        "Some SOD calculations still running/incomplete"
    } else if total_errored > 0 {
        "Some SOD calculations errored"
    } else {
        "Some syncs failed"
    };

    let mut lines = vec![
        "## Sync All Domain SOD Tables".to_string(),
        String::new(),
        format!("**Status:** {}", status),
        format!("**Date:** {}", date),
        format!("**Domains processed:** {}", domains.len()),
        String::new(),
        "### Summary".to_string(),
        format!("- **Completed:** {}", total_completed),
    ];
    if total_started > 0 {
        lines.push(format!("- **Incomplete (started):** {}", total_started));
    }
    if total_errored > 0 {
        lines.push(format!("- **Errored:** {}", total_errored));
    }
    lines.push(format!("- **Total tables:** {}", total_tables));
    lines.push(String::new());

    if !issue_results.is_empty() {
        lines.push("### Domains Needing Attention".to_string());
        for r in &issue_results {
            lines.push(format!("- {}", r));
        }
        lines.push(String::new());
    }

    lines.push("### All Domains".to_string());
    for r in &results {
        lines.push(format!("- {}", r));
    }

    ToolResult::text(lines.join("\n"))
}

/// Parse SOD status counts from the saved JSON file
fn parse_sod_status_from_file(file_path: &str) -> std::collections::HashMap<String, usize> {
    let mut counts = std::collections::HashMap::new();

    let content = match std::fs::read_to_string(file_path) {
        Ok(c) => c,
        Err(_) => return counts,
    };

    let json: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return counts,
    };

    if let Some(data) = json.get("data").and_then(|d| d.as_array()) {
        for item in data {
            if let Some(status) = item.get("status").and_then(|s| s.as_str()) {
                *counts.entry(status.to_string()).or_insert(0) += 1;
            }
        }
    }

    counts
}
