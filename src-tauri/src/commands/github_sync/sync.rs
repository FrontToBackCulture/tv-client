// Sync orchestrator - preview (dry run) + full sync with progress events

use serde::Serialize;
use std::fs;
use std::path::Path;
use tauri::command;
use tauri::Emitter;

use super::api;
use super::config::load_config_internal;
use super::mapping::{
    apply_mappings_and_rules, generate_mapping_summary, GitHubFile, MappedFile, MappingSummary,
};

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize)]
pub struct SyncProgress {
    pub phase: String,
    pub current: usize,
    pub total: usize,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PreviewResult {
    pub owner: String,
    pub repo: String,
    pub branch: String,
    pub tree_files: usize,
    pub summary: MappingSummary,
    pub mapped_files: Vec<PreviewFile>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PreviewFile {
    pub path: String,
    pub target_path: String,
    pub mapping_name: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SyncResult {
    pub owner: String,
    pub repo: String,
    pub synced: usize,
    pub skipped: usize,
    pub failed: usize,
    pub errors: Vec<String>,
}

// ============================================================================
// Commands
// ============================================================================

/// Preview sync - fetch tree, apply mappings, return summary without downloading
#[command]
pub async fn github_sync_preview(
    token: String,
    owner: String,
    repo: String,
) -> Result<PreviewResult, String> {
    // Load config to find this repo
    let config = load_config_internal()?;
    let repo_config = config
        .repositories
        .iter()
        .find(|r| r.owner == owner && r.repo == repo)
        .ok_or_else(|| format!("Repository {}/{} not found in config", owner, repo))?;

    // Fetch tree
    let files = api::fetch_tree(&token, &owner, &repo, &repo_config.branch).await?;
    let tree_files = files.len();

    // Apply mappings and rules
    let mapped = apply_mappings_and_rules(&files, repo_config);
    let summary = generate_mapping_summary(&mapped);

    // Build preview file list
    let mapped_files: Vec<PreviewFile> = mapped
        .iter()
        .filter_map(|f| {
            let target = f.target_path.as_ref()?;
            Some(PreviewFile {
                path: f.file.path.clone(),
                target_path: target.clone(),
                mapping_name: f.mapping_name.clone().unwrap_or_default(),
                size: f.file.size,
            })
        })
        .collect();

    Ok(PreviewResult {
        owner,
        repo,
        branch: repo_config.branch.clone(),
        tree_files,
        summary,
        mapped_files,
    })
}

/// Run full sync - fetch tree, apply mappings, download files, write to disk
#[command]
pub async fn github_sync_run(
    app_handle: tauri::AppHandle,
    token: String,
    owner: String,
    repo: String,
) -> Result<SyncResult, String> {
    // Load config
    let config = load_config_internal()?;
    let repo_config = config
        .repositories
        .iter()
        .find(|r| r.owner == owner && r.repo == repo)
        .ok_or_else(|| format!("Repository {}/{} not found in config", owner, repo))?
        .clone();

    // Phase 1: Fetch tree
    emit_progress(&app_handle, "tree", 0, 0, "Fetching repository tree...");
    let files = api::fetch_tree(&token, &owner, &repo, &repo_config.branch).await?;

    // Phase 2: Apply mappings
    emit_progress(
        &app_handle,
        "mapping",
        0,
        files.len(),
        &format!("Applying mappings to {} files...", files.len()),
    );
    let mapped = apply_mappings_and_rules(&files, &repo_config);
    let to_sync: Vec<&MappedFile> = mapped.iter().filter(|f| f.target_path.is_some()).collect();
    let total = to_sync.len();

    // Phase 3: Download and write files
    let mut synced = 0usize;
    let skipped = 0usize;
    let mut failed = 0usize;
    let mut errors = Vec::new();

    for (i, file) in to_sync.iter().enumerate() {
        let target_path = file.target_path.as_ref().unwrap();

        emit_progress(
            &app_handle,
            "downloading",
            i + 1,
            total,
            &format!("({}/{}) {}", i + 1, total, file.file.filename),
        );

        if !file.include_content {
            // Write placeholder
            if let Err(e) = write_placeholder(target_path, &file.file, &owner, &repo) {
                errors.push(format!("{}: {}", file.file.path, e));
                failed += 1;
            } else {
                synced += 1;
            }
            continue;
        }

        // Fetch content from GitHub
        match api::fetch_file_content(&token, &owner, &repo, &file.file.path).await {
            Ok(content) => {
                if let Err(e) = write_file(target_path, &content) {
                    errors.push(format!("{}: {}", file.file.path, e));
                    failed += 1;
                } else {
                    synced += 1;
                }
            }
            Err(e) => {
                errors.push(format!("{}: {}", file.file.path, e));
                failed += 1;
            }
        }
    }

    // Phase 4: Complete
    emit_progress(
        &app_handle,
        "complete",
        total,
        total,
        &format!("Synced {} files ({} failed)", synced, failed),
    );

    Ok(SyncResult {
        owner,
        repo,
        synced,
        skipped,
        failed,
        errors,
    })
}

// ============================================================================
// Internal helpers
// ============================================================================

fn emit_progress(
    app_handle: &tauri::AppHandle,
    phase: &str,
    current: usize,
    total: usize,
    message: &str,
) {
    let _ = app_handle.emit(
        "github-sync:progress",
        SyncProgress {
            phase: phase.to_string(),
            current,
            total,
            message: message.to_string(),
        },
    );
}

fn write_file(target_path: &str, content: &str) -> Result<(), String> {
    let path = Path::new(target_path);
    if let Some(dir) = path.parent() {
        if !dir.exists() {
            fs::create_dir_all(dir)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }
    }
    fs::write(path, content).map_err(|e| format!("Failed to write file: {}", e))
}

fn write_placeholder(
    target_path: &str,
    file: &GitHubFile,
    owner: &str,
    repo: &str,
) -> Result<(), String> {
    let content = format!(
        "# {}\n\n\
         **Source:** [{}/{}](https://github.com/{}/{})\n\
         **Path:** `{}`\n\
         **Size:** {} bytes\n\
         **Extension:** {}\n\n\
         *Content not synced. To include file contents, set `includeContent: true` in the mapping configuration.*\n",
        file.filename, owner, repo, owner, repo, file.path, file.size,
        if file.extension.is_empty() { "none" } else { &file.extension }
    );
    write_file(target_path, &content)
}
