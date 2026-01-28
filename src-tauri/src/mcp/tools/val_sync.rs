// VAL Sync MCP Tools
// 10 tools for syncing VAL platform data via Claude Code

use crate::commands::val_sync::{config, extract, metadata, sync};
use crate::mcp::protocol::{InputSchema, Tool, ToolResult};
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
