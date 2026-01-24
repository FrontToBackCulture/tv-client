// Data models - shared types between Rust and TypeScript

use serde::{Deserialize, Serialize};

/// File entry in a directory listing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub size: u64,
    pub modified: Option<String>,
    // Optional metadata for markdown files (from frontmatter)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
}

/// Detailed file information with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub size: u64,
    pub created: Option<String>,
    pub modified: Option<String>,
    pub extension: Option<String>,
}

/// Tree node for recursive file tree
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TreeNode {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub children: Option<Vec<TreeNode>>,
}

/// Search result from file or content search
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub size: Option<u64>,
    pub match_type: String, // "filename" or "content"
    pub preview: Option<String>,
    pub line_number: Option<usize>,
}
