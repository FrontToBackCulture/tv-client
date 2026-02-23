// GitHub Sync Config - sync configuration management
// Stores config in ~/.tv-desktop/github-sync-config.json

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::command;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubSyncConfig {
    pub repositories: Vec<RepoConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoConfig {
    pub owner: String,
    pub repo: String,
    #[serde(default = "default_branch")]
    pub branch: String,
    #[serde(default)]
    pub mappings: Vec<Mapping>,
    #[serde(default)]
    pub rules: Vec<Rule>,
}

fn default_branch() -> String {
    "main".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mapping {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(rename = "githubPath")]
    pub github_path: StringOrVec,
    #[serde(rename = "knowledgePath")]
    pub knowledge_path: String,
    #[serde(default, rename = "fileTypes")]
    pub file_types: Option<Vec<String>>,
    #[serde(default, rename = "flattenStructure")]
    pub flatten_structure: Option<bool>,
    #[serde(default, rename = "isScopeOnly")]
    pub is_scope_only: Option<bool>,
    #[serde(default, rename = "includeContent")]
    pub include_content: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rule {
    #[serde(default)]
    pub name: Option<String>,
    pub condition: RuleCondition,
    #[serde(rename = "targetPath")]
    pub target_path: String,
    #[serde(default, rename = "flattenStructure")]
    pub flatten_structure: Option<bool>,
    #[serde(default, rename = "includeContent")]
    pub include_content: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleCondition {
    #[serde(default, rename = "folderContains")]
    pub folder_contains: Option<StringOrVec>,
    #[serde(default, rename = "folderContainsMode")]
    pub folder_contains_mode: Option<String>,
    #[serde(default, rename = "folderEquals")]
    pub folder_equals: Option<StringOrVec>,
    #[serde(default, rename = "folderExcludes")]
    pub folder_excludes: Option<StringOrVec>,
    #[serde(default, rename = "folderExcludesMode")]
    pub folder_excludes_mode: Option<String>,
    #[serde(default, rename = "filenameContains")]
    pub filename_contains: Option<StringOrVec>,
    #[serde(default, rename = "filenameContainsMode")]
    pub filename_contains_mode: Option<String>,
    #[serde(default, rename = "pathMatches")]
    pub path_matches: Option<String>,
    #[serde(default, rename = "fileTypes")]
    pub file_types: Option<Vec<String>>,
}

/// A value that can be either a single string or a vec of strings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum StringOrVec {
    Single(String),
    Multiple(Vec<String>),
}

impl StringOrVec {
    pub fn as_vec(&self) -> Vec<&str> {
        match self {
            StringOrVec::Single(s) => vec![s.as_str()],
            StringOrVec::Multiple(v) => v.iter().map(|s| s.as_str()).collect(),
        }
    }
}

// ============================================================================
// Internal helpers
// ============================================================================

fn get_config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".tv-desktop")
        .join("github-sync-config.json")
}

pub fn load_config_internal() -> Result<GitHubSyncConfig, String> {
    let path = get_config_path();
    if !path.exists() {
        return Ok(GitHubSyncConfig {
            repositories: vec![],
        });
    }
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read github-sync config: {}", e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse github-sync config: {}", e))
}

fn save_config_internal(config: &GitHubSyncConfig) -> Result<(), String> {
    let path = get_config_path();
    if let Some(dir) = path.parent() {
        if !dir.exists() {
            fs::create_dir_all(dir)
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
        }
    }
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("Failed to write config: {}", e))
}

/// Resolve ${tv-knowledge} in paths
pub fn resolve_path_variable(path: &str) -> String {
    if !path.contains("${tv-knowledge}") {
        return path.to_string();
    }

    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    // Try Dropbox path first (macOS)
    let dropbox = home.join("Thinkval Dropbox/ThinkVAL team folder/SkyNet/tv-knowledge");
    let resolved = if dropbox.exists() {
        dropbox.to_string_lossy().to_string()
    } else {
        home.join("Code/SkyNet/tv-knowledge")
            .to_string_lossy()
            .to_string()
    };

    path.replace("${tv-knowledge}", &resolved)
}

// ============================================================================
// Commands
// ============================================================================

/// Load github-sync configuration
#[command]
pub fn github_sync_load_config() -> Result<GitHubSyncConfig, String> {
    load_config_internal()
}

/// Save github-sync configuration
#[command]
pub fn github_sync_save_config(config: GitHubSyncConfig) -> Result<(), String> {
    save_config_internal(&config)
}

/// Initialize config from bundled default, resolve path variables, save
#[command]
pub fn github_sync_init_default_config() -> Result<GitHubSyncConfig, String> {
    let raw_json = include_str!("../../../resources/github-sync-default.json");
    import_and_resolve_config(raw_json)
}

/// Import config from tv-tools/github-sync/sync-config.json, resolve path variables, save
#[command]
pub fn github_sync_import_config(file_path: String) -> Result<GitHubSyncConfig, String> {
    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read config file: {}", e))?;
    import_and_resolve_config(&content)
}

/// Parse raw JSON config, resolve path variables, save to disk
fn import_and_resolve_config(raw_json: &str) -> Result<GitHubSyncConfig, String> {
    let raw: serde_json::Value = serde_json::from_str(raw_json)
        .map_err(|e| format!("Failed to parse config JSON: {}", e))?;

    let repos_array = raw
        .get("repositories")
        .and_then(|r| r.as_array())
        .ok_or_else(|| "Config must have a 'repositories' array".to_string())?;

    let mut repositories = Vec::new();

    for repo_val in repos_array {
        let owner = repo_val
            .get("owner")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let repo = repo_val
            .get("repo")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let branch = repo_val
            .get("branch")
            .and_then(|v| v.as_str())
            .unwrap_or("main")
            .to_string();

        // Parse mappings
        let mappings = if let Some(arr) = repo_val.get("mappings").and_then(|m| m.as_array()) {
            arr.iter()
                .filter_map(|m| {
                    // Resolve paths in the mapping
                    let mut m = m.clone();
                    if let Some(kp) = m.get("knowledgePath").and_then(|v| v.as_str()) {
                        let resolved = resolve_path_variable(kp);
                        m.as_object_mut()
                            .unwrap()
                            .insert("knowledgePath".to_string(), serde_json::json!(resolved));
                    }
                    serde_json::from_value::<Mapping>(m).ok()
                })
                .collect()
        } else {
            vec![]
        };

        // Parse rules
        let rules = if let Some(arr) = repo_val.get("rules").and_then(|r| r.as_array()) {
            arr.iter()
                .filter_map(|r| {
                    // Resolve paths in the rule
                    let mut r = r.clone();
                    if let Some(tp) = r.get("targetPath").and_then(|v| v.as_str()) {
                        let resolved = resolve_path_variable(tp);
                        r.as_object_mut()
                            .unwrap()
                            .insert("targetPath".to_string(), serde_json::json!(resolved));
                    }
                    serde_json::from_value::<Rule>(r).ok()
                })
                .collect()
        } else {
            vec![]
        };

        if !owner.is_empty() && !repo.is_empty() {
            repositories.push(RepoConfig {
                owner,
                repo,
                branch,
                mappings,
                rules,
            });
        }
    }

    let config = GitHubSyncConfig { repositories };
    save_config_internal(&config)?;
    Ok(config)
}
