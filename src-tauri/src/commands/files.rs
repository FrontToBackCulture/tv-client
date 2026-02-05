// src-tauri/src/commands/files.rs
// File system operations for the Library module

use crate::models::{FileEntry, FileInfo, TreeNode};
use crate::AppState;
use std::fs;
use std::path::Path;
use tauri::{command, State, Emitter};

#[command]
pub async fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

#[command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    // Ensure parent directory exists
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    fs::write(&path, content).map_err(|e| format!("Failed to write file: {}", e))
}

#[command]
pub async fn delete_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(&path).map_err(|e| format!("Failed to delete directory: {}", e))
    } else {
        fs::remove_file(&path).map_err(|e| format!("Failed to delete file: {}", e))
    }
}

#[command]
pub async fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let entries = fs::read_dir(&path).map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut files: Vec<FileEntry> = Vec::new();
    for entry in entries.flatten() {
        let metadata = entry.metadata().ok();
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files and common ignore patterns
        if name.starts_with('.') || name == "node_modules" || name == "__pycache__" || name == "target" {
            continue;
        }

        files.push(FileEntry {
            name,
            path: entry.path().to_string_lossy().to_string(),
            is_directory: metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false),
            size: metadata.as_ref().map(|m| m.len()).unwrap_or(0),
            modified: metadata
                .and_then(|m| m.modified().ok())
                .map(|t| {
                    chrono::DateTime::<chrono::Utc>::from(t)
                        .format("%Y-%m-%dT%H:%M:%SZ")
                        .to_string()
                }),
            title: None,
            summary: None,
        });
    }

    // Sort: directories first, then alphabetically
    files.sort_by(|a, b| {
        match (a.is_directory, b.is_directory) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(files)
}

#[command]
pub async fn get_file_tree(
    state: State<'_, AppState>,
    path: Option<String>,
    max_depth: Option<usize>,
) -> Result<TreeNode, String> {
    let root_path = path.unwrap_or_else(|| state.knowledge_path.clone());
    let depth = max_depth.unwrap_or(3);

    fn build_tree(path: &Path, current_depth: usize, max_depth: usize) -> Option<TreeNode> {
        let name = path.file_name()?.to_string_lossy().to_string();

        // Skip hidden and ignored directories/files
        if name.starts_with('.') || name == "node_modules" || name == "__pycache__" || name == "target" {
            return None;
        }

        let is_directory = path.is_dir();

        // For directories at max depth, return None for children to signal lazy loading needed
        let children = if is_directory {
            if current_depth < max_depth {
                let mut children = Vec::new();
                if let Ok(entries) = fs::read_dir(path) {
                    for entry in entries.flatten() {
                        if let Some(child) = build_tree(&entry.path(), current_depth + 1, max_depth) {
                            children.push(child);
                        }
                    }
                    // Sort children: directories first, then alphabetically
                    children.sort_by(|a, b| {
                        match (a.is_directory, b.is_directory) {
                            (true, false) => std::cmp::Ordering::Less,
                            (false, true) => std::cmp::Ordering::Greater,
                            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
                        }
                    });
                }
                Some(children)
            } else {
                // At max depth - return None to indicate children need lazy loading
                None
            }
        } else {
            None
        };

        Some(TreeNode {
            name,
            path: path.to_string_lossy().to_string(),
            is_directory,
            children,
        })
    }

    build_tree(Path::new(&root_path), 0, depth)
        .ok_or_else(|| "Failed to build file tree".to_string())
}

#[command]
pub async fn create_directory(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("Failed to create directory: {}", e))
}

#[command]
pub async fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(&old_path, &new_path).map_err(|e| format!("Failed to rename: {}", e))
}

#[command]
pub async fn get_file_info(path: String) -> Result<FileInfo, String> {
    let metadata = fs::metadata(&path).map_err(|e| format!("Failed to get file info: {}", e))?;
    let p = Path::new(&path);

    Ok(FileInfo {
        name: p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
        path: path.clone(),
        is_directory: metadata.is_dir(),
        size: metadata.len(),
        created: metadata.created().ok().map(|t| {
            chrono::DateTime::<chrono::Utc>::from(t)
                .format("%Y-%m-%dT%H:%M:%SZ")
                .to_string()
        }),
        modified: metadata.modified().ok().map(|t| {
            chrono::DateTime::<chrono::Utc>::from(t)
                .format("%Y-%m-%dT%H:%M:%SZ")
                .to_string()
        }),
        extension: p.extension().map(|e| e.to_string_lossy().to_string()),
    })
}

/// Watch a directory for file changes and emit events
#[command]
pub async fn watch_directory(
    app: tauri::AppHandle,
    path: String,
) -> Result<(), String> {
    use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
    use std::sync::mpsc::channel;

    let (tx, rx) = channel();

    let mut watcher = RecommendedWatcher::new(tx, Config::default())
        .map_err(|e| format!("Failed to create watcher: {}", e))?;

    watcher
        .watch(Path::new(&path), RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch directory: {}", e))?;

    // Spawn a thread to handle file events
    std::thread::spawn(move || {
        // Keep watcher alive
        let _watcher = watcher;
        for res in rx {
            match res {
                Ok(event) => {
                    // Emit a simple event with the paths that changed
                    let paths: Vec<String> = event.paths
                        .iter()
                        .map(|p| p.to_string_lossy().to_string())
                        .collect();
                    let _ = app.emit("file-change", paths);
                }
                Err(e) => {
                    log::error!("Watch error: {:?}", e);
                }
            }
        }
    });

    Ok(())
}

/// Open a file or folder in Finder (macOS)
#[command]
pub async fn open_in_finder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R") // Reveal in Finder
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open in Finder: {}", e))?;
        Ok(())
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open in Explorer: {}", e))?;
        Ok(())
    }

    #[cfg(target_os = "linux")]
    {
        // Try xdg-open on the parent directory
        let parent = Path::new(&path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone());
        std::process::Command::new("xdg-open")
            .arg(&parent)
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {}", e))?;
        Ok(())
    }
}

/// Read a file as base64 encoded string (for binary files like images, PDFs)
#[command]
pub async fn read_file_binary(path: String) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};

    let bytes = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    Ok(STANDARD.encode(bytes))
}

/// Get files in a folder, sorted by modified time (most recent first)
/// For markdown files, extracts title and summary from frontmatter
/// Always searches recursively to find nested files (e.g., sessions/2026-01-01/notes.md)
#[command]
pub async fn get_folder_files(path: String, limit: Option<u32>) -> Result<Vec<FileEntry>, String> {
    let limit = limit.unwrap_or(20) as usize;

    // Always search recursively - depth 4 to handle nested structures like sessions/_archive/date/notes.md
    let mut files = collect_files_recursive(&path, 4)?;

    // Sort by modified time (most recent first)
    files.sort_by(|a, b| {
        match (&b.modified, &a.modified) {
            (Some(b_mod), Some(a_mod)) => b_mod.cmp(a_mod),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => std::cmp::Ordering::Equal,
        }
    });

    // Limit results
    files.truncate(limit);

    Ok(files)
}

/// Collect files from a single directory (non-recursive)
#[allow(dead_code)]
fn collect_files_in_dir(path: &str) -> Result<Vec<FileEntry>, String> {
    let entries = fs::read_dir(path).map_err(|e| format!("Failed to read directory: {}", e))?;
    let mut files: Vec<FileEntry> = Vec::new();

    for entry in entries.flatten() {
        let metadata = entry.metadata().ok();
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files and directories
        if name.starts_with('.') || name == "node_modules" || name == "__pycache__" || name == "target" {
            continue;
        }

        // Skip directories - we only want files
        let is_dir = metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        if is_dir {
            continue;
        }

        let file_path = entry.path();
        let modified = metadata
            .as_ref()
            .and_then(|m| m.modified().ok())
            .map(|t| {
                chrono::DateTime::<chrono::Utc>::from(t)
                    .format("%Y-%m-%dT%H:%M:%SZ")
                    .to_string()
            });

        // Extract title and summary from markdown frontmatter
        let (title, summary) = if name.ends_with(".md") || name.ends_with(".markdown") {
            extract_frontmatter(&file_path)
        } else {
            (None, None)
        };

        files.push(FileEntry {
            name,
            path: file_path.to_string_lossy().to_string(),
            is_directory: false,
            size: metadata.as_ref().map(|m| m.len()).unwrap_or(0),
            modified,
            title,
            summary,
        });
    }

    Ok(files)
}

/// Collect files recursively from subdirectories
fn collect_files_recursive(path: &str, max_depth: usize) -> Result<Vec<FileEntry>, String> {
    let mut files: Vec<FileEntry> = Vec::new();
    collect_files_recursive_impl(Path::new(path), 0, max_depth, &mut files);
    Ok(files)
}

fn collect_files_recursive_impl(path: &Path, current_depth: usize, max_depth: usize, files: &mut Vec<FileEntry>) {
    if current_depth > max_depth {
        return;
    }

    let entries = match fs::read_dir(path) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let metadata = entry.metadata().ok();
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files and directories
        if name.starts_with('.') || name == "node_modules" || name == "__pycache__" || name == "target" {
            continue;
        }

        let is_dir = metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let file_path = entry.path();

        if is_dir {
            // Recurse into subdirectories
            collect_files_recursive_impl(&file_path, current_depth + 1, max_depth, files);
        } else {
            let modified = metadata
                .as_ref()
                .and_then(|m| m.modified().ok())
                .map(|t| {
                    chrono::DateTime::<chrono::Utc>::from(t)
                        .format("%Y-%m-%dT%H:%M:%SZ")
                        .to_string()
                });

            // Extract title and summary from markdown frontmatter
            let (title, summary) = if name.ends_with(".md") || name.ends_with(".markdown") {
                extract_frontmatter(&file_path)
            } else {
                (None, None)
            };

            files.push(FileEntry {
                name,
                path: file_path.to_string_lossy().to_string(),
                is_directory: false,
                size: metadata.as_ref().map(|m| m.len()).unwrap_or(0),
                modified,
                title,
                summary,
            });
        }
    }
}

/// Extract title and summary from markdown frontmatter
fn extract_frontmatter(path: &Path) -> (Option<String>, Option<String>) {
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return (None, None),
    };

    // Check for frontmatter delimiter
    if !content.starts_with("---") {
        return (None, None);
    }

    // Find the closing delimiter
    let rest = &content[3..];
    let end_idx = match rest.find("\n---") {
        Some(idx) => idx,
        None => return (None, None),
    };

    let frontmatter = &rest[..end_idx];

    let mut title = None;
    let mut summary = None;

    // Parse YAML-like frontmatter (simple line-by-line)
    for line in frontmatter.lines() {
        let line = line.trim();
        if let Some(value) = line.strip_prefix("title:") {
            let value = value.trim().trim_matches('"').trim_matches('\'');
            if !value.is_empty() {
                title = Some(value.to_string());
            }
        } else if let Some(value) = line.strip_prefix("summary:") {
            let value = value.trim().trim_matches('"').trim_matches('\'');
            if !value.is_empty() {
                summary = Some(value.to_string());
            }
        }
    }

    (title, summary)
}

/// Open a file with its default application
#[command]
pub async fn open_with_default_app(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
        Ok(())
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path])
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
        Ok(())
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
        Ok(())
    }
}
