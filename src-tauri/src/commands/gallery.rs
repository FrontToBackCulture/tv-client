// src-tauri/src/commands/gallery.rs
// Scan the knowledge base for gallery items: images, excalidraw, videos

use serde::Serialize;
use std::path::PathBuf;
use tauri::{command, State};
use walkdir::WalkDir;

use crate::commands::error::CmdResult;
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct GalleryItem {
    pub file_name: String,
    pub file_path: String,
    pub relative_path: String,
    pub folder: String,
    pub extension: String,
    pub size_bytes: u64,
    pub modified: String,
    pub gallery_type: String, // "image" | "excalidraw" | "video"
}

const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "svg", "webp"];
const EXCALIDRAW_EXTENSIONS: &[&str] = &["excalidraw"];
const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mov", "webm", "avi"];

fn classify_extension(ext: &str) -> Option<&'static str> {
    let lower = ext.to_lowercase();
    if IMAGE_EXTENSIONS.contains(&lower.as_str()) {
        Some("image")
    } else if EXCALIDRAW_EXTENSIONS.contains(&lower.as_str()) {
        Some("excalidraw")
    } else if VIDEO_EXTENSIONS.contains(&lower.as_str()) {
        Some("video")
    } else {
        None
    }
}

#[command]
pub async fn gallery_scan(
    state: State<'_, AppState>,
) -> CmdResult<Vec<GalleryItem>> {
    let kb = &state.knowledge_path;
    let kb_path = PathBuf::from(kb);

    if !kb_path.exists() {
        return Ok(Vec::new());
    }

    let mut results = Vec::new();

    for entry in WalkDir::new(&kb_path)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        // Skip hidden dirs and common noise
        let path = entry.path();
        let rel = path.strip_prefix(&kb_path).unwrap_or(path);
        let rel_str = rel.to_string_lossy();

        // Skip hidden directories, node_modules, .git, etc.
        if rel.components().any(|c| {
            let s = c.as_os_str().to_string_lossy();
            s.starts_with('.') || s == "node_modules" || s == "target" || s == "emails"
        }) {
            continue;
        }

        if !entry.file_type().is_file() {
            continue;
        }

        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");

        let gallery_type = match classify_extension(ext) {
            Some(t) => t,
            None => continue,
        };

        let metadata = entry.metadata().ok();

        let size_bytes = metadata
            .as_ref()
            .map(|m| m.len())
            .unwrap_or(0);

        let modified = metadata
            .and_then(|m| m.modified().ok())
            .map(|t| {
                chrono::DateTime::<chrono::Utc>::from(t)
                    .format("%Y-%m-%dT%H:%M:%SZ")
                    .to_string()
            })
            .unwrap_or_default();

        let file_name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let folder = rel
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        results.push(GalleryItem {
            file_name,
            file_path: path.to_string_lossy().to_string(),
            relative_path: rel_str.to_string(),
            folder,
            extension: ext.to_lowercase(),
            size_bytes,
            modified,
            gallery_type: gallery_type.to_string(),
        });
    }

    // Sort by most recently modified first
    results.sort_by(|a, b| b.modified.cmp(&a.modified));

    Ok(results)
}
