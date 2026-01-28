// VAL Sync Metadata - Tracks sync history per domain
// Stored at {globalPath}/.sync-metadata.json

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use tauri::command;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactStatus {
    pub last_sync: String,
    pub count: usize,
    pub status: String,
    pub duration_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub timestamp: String,
    pub operation: String,
    pub status: String,
    pub details: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncMetadata {
    pub domain: String,
    pub created: String,
    #[serde(default)]
    pub artifacts: HashMap<String, ArtifactStatus>,
    #[serde(default)]
    pub extractions: HashMap<String, ArtifactStatus>,
    #[serde(default)]
    pub history: Vec<HistoryEntry>,
}

// ============================================================================
// Internal helpers
// ============================================================================

fn metadata_path(global_path: &str) -> std::path::PathBuf {
    Path::new(global_path).join(".sync-metadata.json")
}

fn now_iso() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

pub fn load_metadata(global_path: &str) -> SyncMetadata {
    let path = metadata_path(global_path);
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(meta) = serde_json::from_str(&content) {
                return meta;
            }
        }
    }
    // Default empty metadata
    SyncMetadata {
        domain: String::new(),
        created: now_iso(),
        artifacts: HashMap::new(),
        extractions: HashMap::new(),
        history: Vec::new(),
    }
}

fn save_metadata(global_path: &str, metadata: &SyncMetadata) -> Result<(), String> {
    let path = metadata_path(global_path);
    if let Some(dir) = path.parent() {
        if !dir.exists() {
            fs::create_dir_all(dir)
                .map_err(|e| format!("Failed to create metadata directory: {}", e))?;
        }
    }
    let content = serde_json::to_string_pretty(metadata)
        .map_err(|e| format!("Failed to serialize metadata: {}", e))?;
    fs::write(&path, content)
        .map_err(|e| format!("Failed to write metadata: {}", e))
}

fn add_history(metadata: &mut SyncMetadata, operation: &str, status: &str, details: Option<String>) {
    metadata.history.push(HistoryEntry {
        timestamp: now_iso(),
        operation: operation.to_string(),
        status: status.to_string(),
        details,
    });
    // Keep last 50 entries
    if metadata.history.len() > 50 {
        let excess = metadata.history.len() - 50;
        metadata.history.drain(..excess);
    }
}

// ============================================================================
// Public API
// ============================================================================

pub fn update_artifact_sync(
    global_path: &str,
    domain: &str,
    artifact_type: &str,
    count: usize,
    status: &str,
    duration_ms: u64,
) {
    let mut meta = load_metadata(global_path);
    meta.domain = domain.to_string();
    meta.artifacts.insert(
        artifact_type.to_string(),
        ArtifactStatus {
            last_sync: now_iso(),
            count,
            status: status.to_string(),
            duration_ms: Some(duration_ms),
        },
    );
    add_history(
        &mut meta,
        &format!("sync:{}", artifact_type),
        status,
        Some(format!("{} items in {}ms", count, duration_ms)),
    );
    let _ = save_metadata(global_path, &meta);
}

pub fn update_extraction_sync(
    global_path: &str,
    domain: &str,
    extraction_type: &str,
    count: usize,
    status: &str,
    duration_ms: u64,
) {
    let mut meta = load_metadata(global_path);
    meta.domain = domain.to_string();
    meta.extractions.insert(
        extraction_type.to_string(),
        ArtifactStatus {
            last_sync: now_iso(),
            count,
            status: status.to_string(),
            duration_ms: Some(duration_ms),
        },
    );
    add_history(
        &mut meta,
        &format!("extract:{}", extraction_type),
        status,
        Some(format!("{} items in {}ms", count, duration_ms)),
    );
    let _ = save_metadata(global_path, &meta);
}

// ============================================================================
// Commands
// ============================================================================

/// Get sync status/metadata for a domain
#[command]
pub fn val_sync_get_status(domain: String) -> Result<SyncMetadata, String> {
    let domain_config = super::config::get_domain_config(&domain)?;
    Ok(load_metadata(&domain_config.global_path))
}

// ============================================================================
// Output File Status
// ============================================================================

#[derive(Debug, Clone, Serialize)]
pub struct OutputFileStatus {
    pub name: String,
    pub path: String,
    pub relative_path: String,
    pub category: String,
    pub is_folder: bool,
    pub exists: bool,
    pub modified: Option<String>,
    pub size: Option<u64>,
    pub item_count: Option<usize>,
    pub created_by: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct OutputStatusResult {
    pub domain: String,
    pub global_path: String,
    pub outputs: Vec<OutputFileStatus>,
}

fn get_expected_outputs(_global_path: &str) -> Vec<(String, String, String, bool, String)> {
    // (name, relative_path, category, is_folder, created_by)
    vec![
        // Schema Sync - aggregate JSON files from VAL API (Sync All / individual sync buttons)
        ("Fields".to_string(), "all_fields.json".to_string(), "Schema Sync".to_string(), false, "Sync All".to_string()),
        ("Queries".to_string(), "all_queries.json".to_string(), "Schema Sync".to_string(), false, "Sync All".to_string()),
        ("Workflows".to_string(), "all_workflows.json".to_string(), "Schema Sync".to_string(), false, "Sync All".to_string()),
        ("Dashboards".to_string(), "all_dashboards.json".to_string(), "Schema Sync".to_string(), false, "Sync All".to_string()),
        ("Tables".to_string(), "all_tables.json".to_string(), "Schema Sync".to_string(), false, "Sync All".to_string()),
        ("Calc Fields".to_string(), "all_calculated_fields.json".to_string(), "Schema Sync".to_string(), false, "Sync All".to_string()),
        // Extractions - individual definition files (Sync All auto-extracts)
        ("Queries".to_string(), "queries/".to_string(), "Extractions".to_string(), true, "Sync All".to_string()),
        ("Workflows".to_string(), "workflows/".to_string(), "Extractions".to_string(), true, "Sync All".to_string()),
        ("Dashboards".to_string(), "dashboards/".to_string(), "Extractions".to_string(), true, "Sync All".to_string()),
        ("Data Models".to_string(), "data_models/".to_string(), "Extractions".to_string(), true, "Sync All".to_string()),
        // Monitoring - workflow executions and SOD status
        ("Executions".to_string(), "monitoring/".to_string(), "Monitoring".to_string(), true, "Monitoring / SOD".to_string()),
        // Analytics - error tracking
        ("Errors".to_string(), "analytics/".to_string(), "Analytics".to_string(), true, "Importer Err / Integration Err".to_string()),
        // Health Checks - config and results at root level
        ("Config".to_string(), "health-config.json".to_string(), "Health Checks".to_string(), false, "/generate-health-config (AI curated)".to_string()),
        ("Template".to_string(), "health-config.template.json".to_string(), "Health Checks".to_string(), false, "Data Health (template)".to_string()),
        ("Data Model".to_string(), "data-model-health.json".to_string(), "Health Checks".to_string(), false, "Data Health".to_string()),
        ("Workflow".to_string(), "workflow-health.json".to_string(), "Health Checks".to_string(), false, "Workflow Health".to_string()),
        ("Dashboard".to_string(), "dashboard-health-results.json".to_string(), "Health Checks".to_string(), false, "Dashboard Health".to_string()),
        ("Query".to_string(), "query-health-results.json".to_string(), "Health Checks".to_string(), false, "Query Health".to_string()),
        // Analysis - audit and overview
        ("Audit".to_string(), "audit-results.json".to_string(), "Analysis".to_string(), false, "Audit".to_string()),
        ("Overview".to_string(), "overview.html".to_string(), "Analysis".to_string(), false, "Overview".to_string()),
    ]
}

fn check_file_status(
    global_path: &str,
    name: &str,
    relative_path: &str,
    category: &str,
    is_folder: bool,
    created_by: &str,
) -> OutputFileStatus {
    let full_path = Path::new(global_path).join(relative_path);
    let exists = full_path.exists();

    let (modified, size, item_count) = if exists {
        let metadata = fs::metadata(&full_path).ok();
        let modified = metadata.as_ref().and_then(|m| {
            m.modified().ok().map(|t| {
                let datetime: chrono::DateTime<chrono::Utc> = t.into();
                datetime.format("%Y-%m-%dT%H:%M:%SZ").to_string()
            })
        });
        let size = metadata.as_ref().map(|m| m.len());

        // Count items if it's a folder
        let item_count = if is_folder {
            fs::read_dir(&full_path)
                .map(|entries| entries.filter_map(|e| e.ok()).count())
                .ok()
        } else {
            None
        };

        (modified, size, item_count)
    } else {
        (None, None, None)
    };

    OutputFileStatus {
        name: name.to_string(),
        path: full_path.to_string_lossy().to_string(),
        relative_path: relative_path.to_string(),
        category: category.to_string(),
        is_folder,
        exists,
        modified,
        size,
        item_count,
        created_by: created_by.to_string(),
    }
}

/// Get status of all expected output files/folders for a domain
#[command]
pub fn val_get_output_status(domain: String) -> Result<OutputStatusResult, String> {
    let domain_config = super::config::get_domain_config(&domain)?;
    let global_path = &domain_config.global_path;

    let expected = get_expected_outputs(global_path);
    let outputs: Vec<OutputFileStatus> = expected
        .iter()
        .map(|(name, rel_path, category, is_folder, created_by)| {
            check_file_status(global_path, name, rel_path, category, *is_folder, created_by)
        })
        .collect();

    Ok(OutputStatusResult {
        domain,
        global_path: global_path.clone(),
        outputs,
    })
}
