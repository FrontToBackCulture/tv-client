// GitHub Sync Config - sync configuration management
// Stores config in ~/.tv-client/github-sync-config.json

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::command;

use crate::commands::error::{CmdResult, CommandError};

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
        .join(".tv-client")
        .join("github-sync-config.json")
}

pub fn load_config_internal() -> CmdResult<GitHubSyncConfig> {
    let path = get_config_path();
    if !path.exists() {
        return Ok(GitHubSyncConfig {
            repositories: vec![],
        });
    }
    let content = fs::read_to_string(&path)?;
    let config = serde_json::from_str(&content)?;
    Ok(config)
}

fn save_config_internal(config: &GitHubSyncConfig) -> CmdResult<()> {
    let path = get_config_path();
    if let Some(dir) = path.parent() {
        if !dir.exists() {
            fs::create_dir_all(dir)?;
        }
    }
    let content = serde_json::to_string_pretty(config)?;
    fs::write(&path, content)?;
    Ok(())
}

/// Resolve ${tv-knowledge} in paths using knowledge_path from settings.json
pub fn resolve_path_variable(path: &str) -> String {
    if !path.contains("${tv-knowledge}") {
        return path.to_string();
    }

    let resolved = crate::commands::settings::load_settings()
        .ok()
        .and_then(|s| s.keys.get(crate::commands::settings::KEY_KNOWLEDGE_PATH).cloned())
        .filter(|p| !p.is_empty())
        .unwrap_or_default();

    path.replace("${tv-knowledge}", &resolved)
}

// ============================================================================
// Commands
// ============================================================================

/// Load github-sync configuration
#[command]
pub fn github_sync_load_config() -> CmdResult<GitHubSyncConfig> {
    load_config_internal()
}

/// Save github-sync configuration
#[command]
pub fn github_sync_save_config(config: GitHubSyncConfig) -> CmdResult<()> {
    save_config_internal(&config)
}

/// Initialize config from bundled default, resolve path variables, save
#[command]
pub fn github_sync_init_default_config() -> CmdResult<GitHubSyncConfig> {
    let raw_json = include_str!("../../../resources/github-sync-default.json");
    import_and_resolve_config(raw_json)
}

/// Import config from tv-tools/github-sync/sync-config.json, resolve path variables, save
#[command]
pub fn github_sync_import_config(file_path: String) -> CmdResult<GitHubSyncConfig> {
    let content = fs::read_to_string(&file_path)?;
    import_and_resolve_config(&content)
}

/// Parse raw JSON config, resolve path variables, save to disk
fn import_and_resolve_config(raw_json: &str) -> CmdResult<GitHubSyncConfig> {
    let raw: serde_json::Value = serde_json::from_str(raw_json)?;

    let repos_array = raw
        .get("repositories")
        .and_then(|r| r.as_array())
        .ok_or_else(|| CommandError::Config("Config must have a 'repositories' array".into()))?;

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
                        if let Some(obj) = m.as_object_mut() {
                            obj.insert("knowledgePath".to_string(), serde_json::json!(resolved));
                        }
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
                        if let Some(obj) = r.as_object_mut() {
                            obj.insert("targetPath".to_string(), serde_json::json!(resolved));
                        }
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
