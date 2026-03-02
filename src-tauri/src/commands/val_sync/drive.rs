// VAL Drive - Browse files in VAL Drive (S3-backed file storage)
// Lists folders and files via VAL Drive HTTP API

use super::auth;
use super::config::{get_domain_config, val_sync_list_domains};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::command;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriveFolder {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub last_modified: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriveFile {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub size: Option<u64>,
    #[serde(default, rename = "type")]
    pub file_type: Option<String>,
    #[serde(default)]
    pub last_modified: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriveFilesResult {
    pub files: Vec<DriveFile>,
    #[serde(default)]
    pub last_key: Option<String>,
    pub is_last_page: bool,
}

// ============================================================================
// Helpers
// ============================================================================

fn is_auth_status(status: u16) -> bool {
    status == 401 || status == 403
}

fn is_auth_body(body: &str) -> bool {
    body.contains("token not authentic")
        || body.contains("jwt expired")
        || body.contains("invalid signature")
}

// ============================================================================
// Commands
// ============================================================================

/// List folders in a VAL Drive path
#[command]
pub async fn val_drive_list_folders(
    domain: String,
    folder_id: Option<String>,
) -> Result<Vec<DriveFolder>, String> {
    let domain_config = get_domain_config(&domain)?;
    let api_domain = domain_config.api_domain().to_string();
    let base_url = format!("https://{}.thinkval.io", api_domain);
    let folder = folder_id.unwrap_or_else(|| "val_drive".to_string());

    let (token, _) = auth::ensure_auth(&domain).await?;

    match fetch_folders(&base_url, &api_domain, &token, &folder).await {
        Ok(folders) => Ok(folders),
        Err(e) if e.contains("auth") || e.contains("401") || e.contains("403") => {
            let (new_token, _) = auth::reauth(&domain).await?;
            fetch_folders(&base_url, &api_domain, &new_token, &folder)
                .await
                .map_err(|e| format!("Drive list folders failed after reauth: {}", e))
        }
        Err(e) => Err(format!("Drive list folders failed: {}", e)),
    }
}

/// List files in a VAL Drive folder
#[command]
pub async fn val_drive_list_files(
    domain: String,
    folder_id: String,
    page_size: Option<u32>,
) -> Result<DriveFilesResult, String> {
    let domain_config = get_domain_config(&domain)?;
    let api_domain = domain_config.api_domain().to_string();
    let base_url = format!("https://{}.thinkval.io", api_domain);
    let size = page_size.unwrap_or(200);

    let (token, _) = auth::ensure_auth(&domain).await?;

    match fetch_files(&base_url, &api_domain, &token, &folder_id, size).await {
        Ok(result) => Ok(result),
        Err(e) if e.contains("auth") || e.contains("401") || e.contains("403") => {
            let (new_token, _) = auth::reauth(&domain).await?;
            fetch_files(&base_url, &api_domain, &new_token, &folder_id, size)
                .await
                .map_err(|e| format!("Drive list files failed after reauth: {}", e))
        }
        Err(e) => Err(format!("Drive list files failed: {}", e)),
    }
}

// ============================================================================
// Fetch helpers
// ============================================================================

async fn fetch_folders(
    base_url: &str,
    api_domain: &str,
    token: &str,
    folder_id: &str,
) -> Result<Vec<DriveFolder>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let url = format!("{}/api/v1/val_drive/folders", base_url);

    let response = client
        .get(&url)
        .header("sub_domain", api_domain)
        .query(&[("folderId", folder_id), ("token", token)])
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    let status = response.status().as_u16();
    if is_auth_status(status) {
        return Err(format!("auth error (HTTP {})", status));
    }
    if !response.status().is_success() {
        let body = response.text().await.unwrap_or_default();
        if is_auth_body(&body) {
            return Err(format!("auth error: {}", body));
        }
        return Err(format!("HTTP {}: {}", status, body));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse folders response: {}", e))?;

    // API returns { data: [...] } or just [...]
    let items = if let Some(arr) = body.get("data").and_then(|d| d.as_array()) {
        arr.clone()
    } else if let Some(arr) = body.as_array() {
        arr.clone()
    } else {
        return Ok(vec![]);
    };

    let folders: Vec<DriveFolder> = items
        .into_iter()
        .filter_map(|item| {
            let name = item
                .get("name")
                .or_else(|| item.get("folderName"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let id = item
                .get("id")
                .or_else(|| item.get("folderId"))
                .or_else(|| item.get("prefix"))
                .and_then(|v| v.as_str())
                .unwrap_or(&name)
                .to_string();
            let last_modified = item
                .get("lastModified")
                .or_else(|| item.get("last_modified"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            if name.is_empty() && id.is_empty() {
                return None;
            }

            Some(DriveFolder {
                id,
                name,
                last_modified,
            })
        })
        .collect();

    Ok(folders)
}

async fn fetch_files(
    base_url: &str,
    api_domain: &str,
    token: &str,
    folder_id: &str,
    page_size: u32,
) -> Result<DriveFilesResult, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    // URL-encode the folder_id for path usage
    let encoded_folder = urlencoding::encode(folder_id);
    let url = format!("{}/api/v1/val_drive/folders/{}/files", base_url, encoded_folder);

    let response = client
        .get(&url)
        .header("sub_domain", api_domain)
        .query(&[
            ("token", token),
            ("pageSize", &page_size.to_string()),
        ])
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    let status = response.status().as_u16();
    if is_auth_status(status) {
        return Err(format!("auth error (HTTP {})", status));
    }
    if !response.status().is_success() {
        let body = response.text().await.unwrap_or_default();
        if is_auth_body(&body) {
            return Err(format!("auth error: {}", body));
        }
        return Err(format!("HTTP {}: {}", status, body));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse files response: {}", e))?;

    // Parse files from response
    let items = if let Some(arr) = body.get("data").and_then(|d| d.as_array()) {
        arr.clone()
    } else if let Some(arr) = body.get("files").and_then(|d| d.as_array()) {
        arr.clone()
    } else if let Some(arr) = body.as_array() {
        arr.clone()
    } else {
        vec![]
    };

    let files: Vec<DriveFile> = items
        .into_iter()
        .filter_map(|item| {
            let name = item
                .get("name")
                .or_else(|| item.get("fileName"))
                .or_else(|| item.get("key"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            if name.is_empty() {
                return None;
            }

            let id = item
                .get("id")
                .or_else(|| item.get("fileId"))
                .or_else(|| item.get("key"))
                .and_then(|v| v.as_str())
                .unwrap_or(&name)
                .to_string();

            let size = item
                .get("size")
                .or_else(|| item.get("fileSize"))
                .and_then(|v| v.as_u64());

            let file_type = item
                .get("type")
                .or_else(|| item.get("contentType"))
                .or_else(|| item.get("mimeType"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let last_modified = item
                .get("lastModified")
                .or_else(|| item.get("last_modified"))
                .or_else(|| item.get("uploadedAt"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            Some(DriveFile {
                id,
                name,
                size,
                file_type,
                last_modified,
            })
        })
        .collect();

    let last_key = body
        .get("lastKey")
        .or_else(|| body.get("nextToken"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let is_last_page = body
        .get("isLastPage")
        .or_else(|| body.get("isTruncated").map(|v| {
            // isTruncated=true means NOT last page, so we negate
            // But we return as-is and handle below
            v
        }))
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    // If we got isTruncated instead of isLastPage, the logic is inverted
    let is_last = if body.get("isTruncated").is_some() {
        !body.get("isTruncated").and_then(|v| v.as_bool()).unwrap_or(false)
    } else {
        is_last_page
    };

    Ok(DriveFilesResult {
        files,
        last_key,
        is_last_page: is_last,
    })
}

// ============================================================================
// Workflow folder config (parsed from all_workflows.json on disk)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriveWorkflowFolder {
    pub folder_path: String,
    pub move_to_processed: bool,
    pub workflow_count: usize,
}

/// Parse all_workflows.json for a domain and extract VALDriveToVALInsertPlugin folder configs.
/// Returns which Drive folders have workflows and whether they move files to processed/.
pub fn parse_workflow_drive_folders(global_path: &str) -> Vec<DriveWorkflowFolder> {
    let wf_path = std::path::Path::new(global_path).join("all_workflows.json");
    let content = match std::fs::read_to_string(&wf_path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };
    let data: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return vec![],
    };

    let workflows = match data.get("data").and_then(|d| d.as_array()) {
        Some(arr) => arr,
        None => return vec![],
    };

    // Collect folder_path -> (move_to_processed, count) mapping
    let mut folder_map: std::collections::HashMap<String, (bool, usize)> =
        std::collections::HashMap::new();

    for wf in workflows {
        let plugins = wf
            .get("data")
            .and_then(|d| d.get("workflow"))
            .and_then(|w| w.get("plugins"))
            .and_then(|p| p.as_array());

        if let Some(plugins) = plugins {
            for plugin in plugins {
                let name = plugin.get("name").and_then(|n| n.as_str()).unwrap_or("");
                if name != "VALDriveToVALInsertPlugin" {
                    continue;
                }
                let params = match plugin.get("params") {
                    Some(p) => p,
                    None => continue,
                };
                let folder_path = params
                    .get("folderPath")
                    .and_then(|f| f.as_str())
                    .unwrap_or("")
                    .to_string();
                if folder_path.is_empty() {
                    continue;
                }
                let move_flag = params
                    .get("moveFileToProcessedFolder")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);

                let entry = folder_map.entry(folder_path).or_insert((move_flag, 0));
                entry.1 += 1;
                // If ANY workflow for this folder moves to processed, mark it true
                if move_flag {
                    entry.0 = true;
                }
            }
        }
    }

    folder_map
        .into_iter()
        .map(|(folder_path, (move_to_processed, workflow_count))| DriveWorkflowFolder {
            folder_path,
            move_to_processed,
            workflow_count,
        })
        .collect()
}

/// Tauri command: get Drive workflow folder configs for a domain
#[command]
pub async fn val_drive_workflow_folders(domain: String) -> Result<Vec<DriveWorkflowFolder>, String> {
    let domain_config = get_domain_config(&domain)?;
    Ok(parse_workflow_drive_folders(&domain_config.global_path))
}

/// Get workflow folder configs for all production domains (used by MCP tool)
pub fn get_all_domain_workflow_folders() -> HashMap<String, Vec<DriveWorkflowFolder>> {
    let domains = match val_sync_list_domains() {
        Ok(d) => d,
        Err(_) => return HashMap::new(),
    };
    let excluded = ["documentation", "lab", "templates"];
    let mut result = HashMap::new();
    for d in domains {
        if excluded.contains(&d.domain.to_lowercase().as_str()) {
            continue;
        }
        let folders = parse_workflow_drive_folders(&d.global_path);
        if !folders.is_empty() {
            result.insert(d.domain.clone(), folders);
        }
    }
    result
}

// ============================================================================
// Drive Scan Config — persisted folder list per domain
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriveScanFolder {
    pub folder_path: String,
    pub enabled: bool,
    pub move_to_processed: bool,
    pub source: String, // "workflow" | "manual"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainScanConfig {
    pub folders: Vec<DriveScanFolder>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriveScanConfig {
    pub domains: HashMap<String, DomainScanConfig>,
}

fn scan_config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".tv-desktop")
        .join("drive-scan-config.json")
}

/// Load scan config from disk. Returns empty config if file doesn't exist.
pub fn load_scan_config() -> DriveScanConfig {
    let path = scan_config_path();
    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or(DriveScanConfig {
            domains: HashMap::new(),
        }),
        Err(_) => DriveScanConfig {
            domains: HashMap::new(),
        },
    }
}

fn save_scan_config_to_disk(config: &DriveScanConfig) -> Result<(), String> {
    let path = scan_config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config dir: {}", e))?;
    }
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    std::fs::write(&path, json).map_err(|e| format!("Failed to write config: {}", e))?;
    Ok(())
}

/// Seed scan config from workflow configs, merging with existing user edits
pub fn seed_scan_config() -> Result<DriveScanConfig, String> {
    let mut config = load_scan_config();
    let all_wf = get_all_domain_workflow_folders();

    for (domain, wf_folders) in &all_wf {
        let domain_config = config
            .domains
            .entry(domain.clone())
            .or_insert_with(|| DomainScanConfig {
                folders: Vec::new(),
            });

        // Index existing folders by path
        let existing_paths: HashMap<String, usize> = domain_config
            .folders
            .iter()
            .enumerate()
            .map(|(i, f)| (f.folder_path.clone(), i))
            .collect();

        // Merge workflow folders
        let mut new_folders: Vec<DriveScanFolder> = Vec::new();
        for wf in wf_folders {
            if let Some(&idx) = existing_paths.get(&wf.folder_path) {
                // Already exists — update move_to_processed from workflow, keep user's enabled state
                domain_config.folders[idx].move_to_processed = wf.move_to_processed;
            } else {
                // New workflow folder — add as enabled
                new_folders.push(DriveScanFolder {
                    folder_path: wf.folder_path.clone(),
                    enabled: true,
                    move_to_processed: wf.move_to_processed,
                    source: "workflow".to_string(),
                });
            }
        }
        domain_config.folders.extend(new_folders);

        // Sort folders by path for consistent ordering
        domain_config
            .folders
            .sort_by(|a, b| a.folder_path.cmp(&b.folder_path));
    }

    save_scan_config_to_disk(&config)?;
    Ok(config)
}

#[command]
pub async fn val_drive_scan_config_load() -> Result<DriveScanConfig, String> {
    Ok(load_scan_config())
}

#[command]
pub async fn val_drive_scan_config_save(config: DriveScanConfig) -> Result<(), String> {
    save_scan_config_to_disk(&config)
}

#[command]
pub async fn val_drive_scan_config_seed() -> Result<DriveScanConfig, String> {
    seed_scan_config()
}

// ============================================================================
// Drive Scan Results — persisted last scan output
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResultFile {
    pub folder: String,
    pub name: String,
    pub size: Option<u64>,
    pub last_modified: Option<String>,
    pub stale: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainScanResult {
    pub domain: String,
    pub status: String, // "clean" | "has-files" | "stale" | "error"
    pub files: Vec<ScanResultFile>,
    pub stale_count: usize,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedScanResults {
    pub last_scan_at: String,
    pub results: Vec<DomainScanResult>,
}

fn scan_results_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".tv-desktop")
        .join("drive-scan-results.json")
}

#[command]
pub async fn val_drive_scan_results_load() -> Result<Option<PersistedScanResults>, String> {
    let path = scan_results_path();
    match std::fs::read_to_string(&path) {
        Ok(content) => {
            let results: PersistedScanResults = serde_json::from_str(&content)
                .map_err(|e| format!("Failed to parse scan results: {}", e))?;
            Ok(Some(results))
        }
        Err(_) => Ok(None),
    }
}

#[command]
pub async fn val_drive_scan_results_save(results: PersistedScanResults) -> Result<(), String> {
    let path = scan_results_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create dir: {}", e))?;
    }
    let json = serde_json::to_string_pretty(&results)
        .map_err(|e| format!("Failed to serialize scan results: {}", e))?;
    std::fs::write(&path, json).map_err(|e| format!("Failed to write scan results: {}", e))?;
    Ok(())
}
