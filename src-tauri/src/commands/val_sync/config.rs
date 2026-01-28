// VAL Sync Config - Domain configuration management
// Stores domain configs in ~/.tv-desktop/val-sync-config.json

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::command;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectConfig {
    pub solution: String,
    #[serde(default, rename = "useCase")]
    pub use_case: Option<String>,
    #[serde(default, rename = "configPath")]
    pub config_path: Option<String>,
    #[serde(default, rename = "metadataTypes")]
    pub metadata_types: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainConfig {
    pub domain: String,
    #[serde(default, rename = "actualDomain")]
    pub actual_domain: Option<String>,
    #[serde(default, rename = "globalPath")]
    pub global_path: String,
    #[serde(default)]
    pub projects: Vec<ProjectConfig>,
    #[serde(default, rename = "monitoringPath")]
    pub monitoring_path: Option<String>,
    #[serde(default, rename = "domainType")]
    pub domain_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValSyncConfig {
    pub domains: Vec<DomainConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainSummary {
    pub domain: String,
    pub global_path: String,
    pub has_actual_domain: bool,
    pub domain_type: String,
    pub has_metadata: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredDomain {
    pub domain: String,
    pub domain_type: String,
    pub global_path: String,
    pub has_metadata: bool,
    pub has_actual_domain: bool,
}

impl DomainConfig {
    /// Get the domain used for API calls (actualDomain if set, otherwise domain)
    pub fn api_domain(&self) -> &str {
        self.actual_domain.as_deref().unwrap_or(&self.domain)
    }
}

// ============================================================================
// Internal helpers
// ============================================================================

fn get_config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".tv-desktop")
        .join("val-sync-config.json")
}

pub fn load_config_internal() -> Result<ValSyncConfig, String> {
    let path = get_config_path();
    if !path.exists() {
        return Ok(ValSyncConfig { domains: vec![] });
    }
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read val-sync config: {}", e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse val-sync config: {}", e))
}

fn save_config_internal(config: &ValSyncConfig) -> Result<(), String> {
    let path = get_config_path();
    if let Some(dir) = path.parent() {
        if !dir.exists() {
            fs::create_dir_all(dir)
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
        }
    }
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    fs::write(&path, content)
        .map_err(|e| format!("Failed to write config: {}", e))
}

pub fn get_domain_config(domain: &str) -> Result<DomainConfig, String> {
    let config = load_config_internal()?;
    config
        .domains
        .into_iter()
        .find(|d| d.domain == domain)
        .ok_or_else(|| format!("Domain '{}' not found in val-sync config", domain))
}

/// Resolve ${tv-knowledge} in paths.
/// The tv-knowledge path is inferred from global_path patterns or defaults to home.
fn resolve_path_variable(path: &str, tv_knowledge_path: Option<&str>) -> String {
    if !path.contains("${tv-knowledge}") {
        return path.to_string();
    }

    let resolved = if let Some(tk_path) = tv_knowledge_path {
        tk_path.to_string()
    } else {
        // Default: try common locations
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        // Try Google Drive path first (macOS)
        let gdrive = home.join("Library/CloudStorage/GoogleDrive-melvin@thinkval.ai/Shared drives/ThinkVAL/SkyNet/tv-knowledge");
        if gdrive.exists() {
            gdrive.to_string_lossy().to_string()
        } else {
            // Fallback to Code path
            home.join("Code/SkyNet/tv-knowledge")
                .to_string_lossy()
                .to_string()
        }
    };

    path.replace("${tv-knowledge}", &resolved)
}

// ============================================================================
// Commands
// ============================================================================

/// Load val-sync configuration
#[command]
pub fn val_sync_load_config() -> Result<ValSyncConfig, String> {
    load_config_internal()
}

/// Save val-sync configuration
#[command]
pub fn val_sync_save_config(config: ValSyncConfig) -> Result<(), String> {
    save_config_internal(&config)
}

/// List all configured domains (summary)
#[command]
pub fn val_sync_list_domains() -> Result<Vec<DomainSummary>, String> {
    let config = load_config_internal()?;
    Ok(config
        .domains
        .iter()
        .map(|d| {
            let has_metadata = {
                let p = std::path::Path::new(&d.global_path).join(".sync-metadata.json");
                p.exists()
            };
            DomainSummary {
                domain: d.domain.clone(),
                global_path: d.global_path.clone(),
                has_actual_domain: d.actual_domain.is_some(),
                domain_type: d.domain_type.clone().unwrap_or_default(),
                has_metadata,
            }
        })
        .collect())
}

/// Import config from val-sync config.json (with ${tv-knowledge} path resolution)
#[command]
pub fn val_sync_import_config(
    file_path: String,
    tv_knowledge_path: Option<String>,
) -> Result<ValSyncConfig, String> {
    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read config file: {}", e))?;

    // Parse the val-sync config.json format
    let raw: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config JSON: {}", e))?;

    let domains_array = raw
        .get("domains")
        .and_then(|d| d.as_array())
        .ok_or_else(|| "Config must have a 'domains' array".to_string())?;

    let tk_path = tv_knowledge_path.as_deref();
    let mut domains = Vec::new();

    for domain_val in domains_array {
        let domain = domain_val
            .get("domain")
            .and_then(|d| d.as_str())
            .unwrap_or("")
            .to_string();

        let actual_domain = domain_val
            .get("actualDomain")
            .and_then(|d| d.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());

        let global_path_raw = domain_val
            .get("globalPath")
            .and_then(|d| d.as_str())
            .unwrap_or("")
            .to_string();
        let global_path = resolve_path_variable(&global_path_raw, tk_path);

        let monitoring_path = domain_val
            .get("monitoringPath")
            .and_then(|d| d.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| resolve_path_variable(s, tk_path));

        let projects = if let Some(projs) = domain_val.get("projects").and_then(|p| p.as_array()) {
            projs
                .iter()
                .filter_map(|p| {
                    let solution = p.get("solution")?.as_str()?.to_string();
                    let use_case = p
                        .get("useCase")
                        .and_then(|u| u.as_str())
                        .map(|s| s.to_string());
                    let config_path = p
                        .get("configPath")
                        .and_then(|c| c.as_str())
                        .map(|s| resolve_path_variable(s, tk_path));
                    let metadata_types = p.get("metadataTypes").cloned().map(|mut mt| {
                        // Resolve paths in metadataTypes values
                        if let Some(obj) = mt.as_object_mut() {
                            for val in obj.values_mut() {
                                if let Some(s) = val.as_str() {
                                    *val = serde_json::Value::String(
                                        resolve_path_variable(s, tk_path),
                                    );
                                }
                            }
                        }
                        mt
                    });

                    Some(ProjectConfig {
                        solution,
                        use_case,
                        config_path,
                        metadata_types,
                    })
                })
                .collect()
        } else {
            vec![]
        };

        if !domain.is_empty() {
            domains.push(DomainConfig {
                domain,
                actual_domain,
                global_path,
                projects,
                monitoring_path,
                domain_type: None,
            });
        }
    }

    let config = ValSyncConfig { domains };
    save_config_internal(&config)?;
    Ok(config)
}

/// Discover domains from the file system at {repo}/0_Platform/domains/
/// Scans production/, demo/, templates/ subdirectories and auto-writes val-sync-config.json
#[command]
pub fn val_sync_discover_domains(domains_path: String) -> Result<Vec<DiscoveredDomain>, String> {
    let base = std::path::Path::new(&domains_path);
    if !base.exists() {
        return Err(format!("Domains path does not exist: {}", domains_path));
    }

    // Load existing config to preserve actual_domain aliases and projects
    let existing_config = load_config_internal().unwrap_or(ValSyncConfig { domains: vec![] });
    let existing_map: std::collections::HashMap<String, DomainConfig> = existing_config
        .domains
        .into_iter()
        .map(|d| (d.domain.clone(), d))
        .collect();

    // Type folder mapping: folder name -> domain_type label
    let type_folders = [
        ("production", "production"),
        ("demo", "demo"),
        ("templates", "template"),
    ];

    let mut discovered: Vec<DiscoveredDomain> = Vec::new();
    let mut new_domain_configs: Vec<DomainConfig> = Vec::new();

    for (folder_name, domain_type) in &type_folders {
        let type_dir = base.join(folder_name);
        if !type_dir.is_dir() {
            continue;
        }

        let entries = fs::read_dir(&type_dir)
            .map_err(|e| format!("Failed to read {}: {}", type_dir.display(), e))?;

        let mut folder_domains: Vec<(String, String)> = Vec::new();
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                let domain_name = entry.file_name().to_string_lossy().to_string();
                // Skip hidden folders
                if domain_name.starts_with('.') {
                    continue;
                }
                let global_path = entry.path().to_string_lossy().to_string();
                folder_domains.push((domain_name, global_path));
            }
        }
        folder_domains.sort_by(|a, b| a.0.cmp(&b.0));

        for (domain_name, global_path) in folder_domains {
            let has_metadata = entry_path_has_metadata(&global_path);
            let existing = existing_map.get(&domain_name);
            let has_actual_domain = existing.map_or(false, |d| d.actual_domain.is_some());

            discovered.push(DiscoveredDomain {
                domain: domain_name.clone(),
                domain_type: domain_type.to_string(),
                global_path: global_path.clone(),
                has_metadata,
                has_actual_domain,
            });

            // Build DomainConfig, preserving existing data if available
            if let Some(ex) = existing {
                let mut config = ex.clone();
                config.global_path = global_path;
                config.domain_type = Some(domain_type.to_string());
                new_domain_configs.push(config);
            } else {
                new_domain_configs.push(DomainConfig {
                    domain: domain_name,
                    actual_domain: None,
                    global_path,
                    projects: vec![],
                    monitoring_path: None,
                    domain_type: Some(domain_type.to_string()),
                });
            }
        }
    }

    // Save the updated config so existing auth/sync/extract commands work
    let config = ValSyncConfig {
        domains: new_domain_configs,
    };
    save_config_internal(&config)?;

    Ok(discovered)
}

fn entry_path_has_metadata(global_path: &str) -> bool {
    std::path::Path::new(global_path)
        .join(".sync-metadata.json")
        .exists()
}
