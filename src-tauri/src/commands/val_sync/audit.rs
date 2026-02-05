// VAL Sync Audit - Compare local artifacts against remote VAL artifacts
// Identifies stale artifacts that exist locally but not in VAL

use super::api::val_api_fetch;
use super::auth;
use super::config::get_domain_config;
use super::sync::write_json;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::time::Instant;
use tauri::command;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StaleArtifact {
    pub id: String,
    pub name: String,
    pub folder_name: String,
    pub folder_path: String,
    pub last_modified: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactTypeResult {
    pub artifact_type: String,
    pub local_count: usize,
    pub remote_count: usize,
    pub stale_count: usize,
    pub current_count: usize,
    pub stale_artifacts: Vec<StaleArtifact>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditSummary {
    pub total_local: usize,
    pub total_remote: usize,
    pub total_stale: usize,
    pub total_current: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditResult {
    pub domain: String,
    pub global_path: String,
    pub timestamp: String,
    pub summary: AuditSummary,
    pub by_type: HashMap<String, ArtifactTypeResult>,
    pub file_path: String,
    pub duration_ms: u64,
}

// ============================================================================
// Artifact type configurations
// ============================================================================

struct ArtifactTypeConfig {
    remote_endpoint: &'static str,
    subfolder: &'static str,
    folder_prefix: &'static str,
}

fn get_artifact_configs() -> HashMap<&'static str, ArtifactTypeConfig> {
    let mut configs = HashMap::new();
    configs.insert("queries", ArtifactTypeConfig {
        remote_endpoint: "all-queries",
        subfolder: "queries",
        folder_prefix: "query_",
    });
    configs.insert("dashboards", ArtifactTypeConfig {
        remote_endpoint: "all-dashboards",
        subfolder: "dashboards",
        folder_prefix: "dashboard_",
    });
    configs.insert("workflows", ArtifactTypeConfig {
        remote_endpoint: "all-workflows",
        subfolder: "workflows",
        folder_prefix: "workflow_",
    });
    configs.insert("tables", ArtifactTypeConfig {
        remote_endpoint: "all-tables",
        subfolder: "data_models",
        folder_prefix: "table_",
    });
    configs
}

// ============================================================================
// Helper functions
// ============================================================================

/// Extract IDs from remote artifacts response
fn extract_remote_ids(data: &serde_json::Value, artifact_type: &str) -> HashSet<String> {
    let mut ids = HashSet::new();

    if artifact_type == "tables" {
        // Tables have nested structure - extract table_name
        fn extract_table_names(value: &serde_json::Value, ids: &mut HashSet<String>) {
            if let Some(arr) = value.as_array() {
                for item in arr {
                    if let Some(table_name) = item.get("table_name").and_then(|v| v.as_str()) {
                        ids.insert(table_name.to_string());
                    }
                    if let Some(children) = item.get("children") {
                        extract_table_names(children, ids);
                    }
                }
            }
        }
        extract_table_names(data, &mut ids);
    } else {
        // Standard flat array response
        let items = if let Some(arr) = data.as_array() {
            arr.clone()
        } else if let Some(data_arr) = data.get("data").and_then(|d| d.as_array()) {
            data_arr.clone()
        } else {
            vec![]
        };

        for item in items {
            if let Some(id) = item.get("id") {
                let id_str = if let Some(n) = id.as_i64() {
                    n.to_string()
                } else if let Some(s) = id.as_str() {
                    s.to_string()
                } else {
                    continue;
                };
                ids.insert(id_str);
            }
        }
    }

    ids
}

/// Scan local artifacts in a folder
fn scan_local_artifacts(global_path: &str, config: &ArtifactTypeConfig) -> Vec<StaleArtifact> {
    let scan_path = Path::new(global_path).join(config.subfolder);

    if !scan_path.exists() {
        return vec![];
    }

    let mut artifacts = vec![];

    if let Ok(entries) = fs::read_dir(&scan_path) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();

            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false)
                && name.starts_with(config.folder_prefix)
            {
                let id = name.replace(config.folder_prefix, "");
                let folder_path = entry.path().to_string_lossy().to_string();

                // Try to get name from definition.json
                let artifact_name = {
                    let def_path = entry.path().join("definition.json");
                    if def_path.exists() {
                        fs::read_to_string(&def_path)
                            .ok()
                            .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
                            .and_then(|json| {
                                json.get("name")
                                    .or_else(|| json.get("title"))
                                    .or_else(|| json.get("query_name"))
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string())
                            })
                    } else {
                        None
                    }
                }.unwrap_or_else(|| format!("{} {}", config.subfolder, id));

                // Get last modified time
                let last_modified = entry.metadata().ok()
                    .and_then(|m| m.modified().ok())
                    .map(|t| {
                        let datetime: chrono::DateTime<chrono::Utc> = t.into();
                        datetime.format("%Y-%m-%dT%H:%M:%SZ").to_string()
                    });

                artifacts.push(StaleArtifact {
                    id,
                    name: artifact_name,
                    folder_name: name,
                    folder_path,
                    last_modified,
                });
            }
        }
    }

    artifacts
}

/// Audit a single artifact type
async fn audit_artifact_type(
    _domain: &str,
    global_path: &str,
    artifact_type: &str,
    config: &ArtifactTypeConfig,
    base_url: &str,
    token: &str,
) -> ArtifactTypeResult {
    // Fetch remote artifacts
    let remote_ids = match val_api_fetch(base_url, token, config.remote_endpoint, None).await {
        Ok(data) => extract_remote_ids(&data, artifact_type),
        Err(e) => {
            return ArtifactTypeResult {
                artifact_type: artifact_type.to_string(),
                local_count: 0,
                remote_count: 0,
                stale_count: 0,
                current_count: 0,
                stale_artifacts: vec![],
                error: Some(format!("Failed to fetch remote {}: {}", artifact_type, e)),
            };
        }
    };

    // Scan local artifacts
    let local_artifacts = scan_local_artifacts(global_path, config);

    // Identify stale artifacts (local but not remote)
    let stale_artifacts: Vec<StaleArtifact> = local_artifacts
        .into_iter()
        .filter(|a| !remote_ids.contains(&a.id))
        .collect();

    let local_count = stale_artifacts.len() + remote_ids.len(); // Approximation
    let stale_count = stale_artifacts.len();

    ArtifactTypeResult {
        artifact_type: artifact_type.to_string(),
        local_count,
        remote_count: remote_ids.len(),
        stale_count,
        current_count: local_count.saturating_sub(stale_count),
        stale_artifacts,
        error: None,
    }
}

// ============================================================================
// Commands
// ============================================================================

/// Run artifact audit for a domain - compares local vs remote artifacts
#[command]
pub async fn val_run_artifact_audit(domain: String) -> Result<AuditResult, String> {
    let start = Instant::now();
    let domain_config = get_domain_config(&domain)?;
    let global_path = &domain_config.global_path;
    let base_url = format!("https://{}.thinkval.io", domain_config.api_domain());

    // Ensure auth
    let (token, _) = auth::ensure_auth(&domain).await?;

    let configs = get_artifact_configs();
    let mut by_type = HashMap::new();
    let mut total_local = 0;
    let mut total_remote = 0;
    let mut total_stale = 0;

    for (artifact_type, config) in &configs {
        let result = audit_artifact_type(
            &domain,
            global_path,
            artifact_type,
            config,
            &base_url,
            &token,
        ).await;

        total_local += result.local_count;
        total_remote += result.remote_count;
        total_stale += result.stale_count;

        by_type.insert(artifact_type.to_string(), result);
    }

    let timestamp = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let file_path = Path::new(global_path).join("audit-results.json");

    let result = AuditResult {
        domain: domain.clone(),
        global_path: global_path.clone(),
        timestamp,
        summary: AuditSummary {
            total_local,
            total_remote,
            total_stale,
            total_current: total_local.saturating_sub(total_stale),
        },
        by_type,
        file_path: file_path.to_string_lossy().to_string(),
        duration_ms: start.elapsed().as_millis() as u64,
    };

    // Write results to file
    let output_value = serde_json::to_value(&result)
        .map_err(|e| format!("Failed to serialize audit results: {}", e))?;
    write_json(&file_path.to_string_lossy(), &output_value)?;

    Ok(result)
}
