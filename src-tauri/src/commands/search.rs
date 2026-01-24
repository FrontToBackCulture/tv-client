// src-tauri/src/commands/search.rs
// Search operations for the Library module

use crate::models::SearchResult;
use ignore::WalkBuilder;
use std::fs;
use std::io::{BufRead, BufReader};
use tauri::command;

/// Search files by filename pattern
#[command]
pub async fn search_files(
    root: String,
    query: String,
    extensions: Option<Vec<String>>,
    max_results: Option<usize>,
) -> Result<Vec<SearchResult>, String> {
    let query_lower = query.to_lowercase();
    let max = max_results.unwrap_or(100);
    let mut results = Vec::new();

    let walker = WalkBuilder::new(&root)
        .hidden(true)           // Respect hidden files
        .git_ignore(true)       // Respect .gitignore
        .git_global(true)
        .git_exclude(true)
        .build();

    for entry in walker.flatten() {
        if results.len() >= max {
            break;
        }

        let path = entry.path();
        let name = path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        // Skip directories for filename search
        if path.is_dir() {
            continue;
        }

        // Check extension filter
        if let Some(ref exts) = extensions {
            if let Some(ext) = path.extension() {
                if !exts.iter().any(|e| e == &ext.to_string_lossy().to_string()) {
                    continue;
                }
            } else {
                continue;
            }
        }

        // Match filename
        if name.to_lowercase().contains(&query_lower) {
            let metadata = entry.metadata().ok();
            results.push(SearchResult {
                name,
                path: path.to_string_lossy().to_string(),
                is_directory: false,
                size: metadata.as_ref().map(|m| m.len()),
                match_type: "filename".to_string(),
                preview: None,
                line_number: None,
            });
        }
    }

    Ok(results)
}

/// Search file content for a query string
#[command]
pub async fn search_content(
    root: String,
    query: String,
    extensions: Option<Vec<String>>,
    max_results: Option<usize>,
) -> Result<Vec<SearchResult>, String> {
    let query_lower = query.to_lowercase();
    let max = max_results.unwrap_or(50);
    let mut results = Vec::new();

    // Default to common text extensions
    let search_exts = extensions.unwrap_or_else(|| {
        vec![
            "md", "txt", "js", "ts", "tsx", "jsx", "json", "sql", "py", "rs",
            "yaml", "yml", "toml", "html", "css", "scss",
        ]
        .into_iter()
        .map(String::from)
        .collect()
    });

    let walker = WalkBuilder::new(&root)
        .hidden(true)
        .git_ignore(true)
        .build();

    'outer: for entry in walker.flatten() {
        if results.len() >= max {
            break;
        }

        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        // Check extension
        let ext = path.extension()
            .map(|e| e.to_string_lossy().to_string())
            .unwrap_or_default();
        if !search_exts.contains(&ext) {
            continue;
        }

        // Skip large files (> 1MB)
        if let Ok(metadata) = path.metadata() {
            if metadata.len() > 1_000_000 {
                continue;
            }
        }

        // Read and search file
        if let Ok(file) = fs::File::open(path) {
            let reader = BufReader::new(file);
            for (line_num, line) in reader.lines().enumerate() {
                if results.len() >= max {
                    break 'outer;
                }

                if let Ok(line_content) = line {
                    if line_content.to_lowercase().contains(&query_lower) {
                        results.push(SearchResult {
                            name: path.file_name()
                                .map(|n| n.to_string_lossy().to_string())
                                .unwrap_or_default(),
                            path: path.to_string_lossy().to_string(),
                            is_directory: false,
                            size: None,
                            match_type: "content".to_string(),
                            preview: Some(
                                line_content.trim().chars().take(200).collect::<String>()
                            ),
                            line_number: Some(line_num + 1),
                        });
                        break; // One result per file
                    }
                }
            }
        }
    }

    Ok(results)
}

/// Build search index for a directory (placeholder for tantivy integration)
#[command]
pub async fn index_directory(_root: String) -> Result<(), String> {
    // TODO: Build tantivy full-text index for faster search
    // For v1, we use simple search above
    Ok(())
}
