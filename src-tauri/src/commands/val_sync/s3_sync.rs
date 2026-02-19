// S3 Sync - Push domain AI folders to S3 and check status
// Runs `aws s3 sync` to upload ai/ folder contents to production.thinkval.static/solutions/{domain}/

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Instant;
use tauri::command;

const S3_BUCKET: &str = "production.thinkval.static";
const S3_REGION: &str = "ap-southeast-1";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct S3SyncResult {
    pub domain: String,
    pub status: String,
    pub message: String,
    pub files_uploaded: usize,
    pub duration_ms: u64,
}

/// Sync a single domain's ai/ folder to S3
#[command]
pub async fn val_sync_ai_to_s3(domain: String, global_path: String) -> Result<S3SyncResult, String> {
    let start = Instant::now();

    // Load AWS credentials from settings
    let settings = crate::commands::settings::load_settings()
        .map_err(|e| format!("Failed to load settings: {}", e))?;

    let access_key = settings.keys.get("aws_access_key_id")
        .ok_or_else(|| "AWS Access Key ID not configured. Go to Settings to add it.".to_string())?;
    let secret_key = settings.keys.get("aws_secret_access_key")
        .ok_or_else(|| "AWS Secret Access Key not configured. Go to Settings to add it.".to_string())?;

    // Check ai/ folder exists
    let ai_path = std::path::Path::new(&global_path).join("ai");
    if !ai_path.exists() {
        return Ok(S3SyncResult {
            domain,
            status: "skipped".to_string(),
            message: "No ai/ folder found".to_string(),
            files_uploaded: 0,
            duration_ms: start.elapsed().as_millis() as u64,
        });
    }

    let s3_dest = format!("s3://{}/solutions/{}/", S3_BUCKET, domain);

    // Step 1: Remove existing S3 folder to avoid orphan files
    let rm_output = tokio::process::Command::new("aws")
        .args([
            "s3", "rm",
            &s3_dest,
            "--recursive",
            "--region", S3_REGION,
        ])
        .env("AWS_ACCESS_KEY_ID", access_key)
        .env("AWS_SECRET_ACCESS_KEY", secret_key)
        .output()
        .await
        .map_err(|e| format!("Failed to run aws CLI: {}. Is aws CLI installed?", e))?;

    // rm is allowed to fail (folder might not exist yet)
    if !rm_output.status.success() {
        let stderr = String::from_utf8_lossy(&rm_output.stderr);
        // Only fail on real errors, not "folder doesn't exist"
        if !stderr.is_empty() && !stderr.contains("NoSuchKey") {
            eprintln!("[s3-sync] Warning: rm failed for {}: {}", domain, stderr.trim());
        }
    }

    // Step 2: Upload fresh copy
    let output = tokio::process::Command::new("aws")
        .args([
            "s3", "sync",
            &ai_path.to_string_lossy(),
            &s3_dest,
            "--region", S3_REGION,
            "--exclude", ".DS_Store",
        ])
        .env("AWS_ACCESS_KEY_ID", access_key)
        .env("AWS_SECRET_ACCESS_KEY", secret_key)
        .output()
        .await
        .map_err(|e| format!("Failed to run aws CLI: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(format!("aws s3 sync failed: {}", stderr.trim()));
    }

    // Count uploaded files from stdout (lines containing "upload:")
    let files_uploaded = stdout.lines().filter(|l| l.contains("upload:")).count();

    Ok(S3SyncResult {
        domain,
        status: "success".to_string(),
        message: if files_uploaded > 0 {
            format!("{} files synced to S3", files_uploaded)
        } else {
            "Already up to date".to_string()
        },
        files_uploaded,
        duration_ms: start.elapsed().as_millis() as u64,
    })
}

// ============================================================================
// S3 Status - Compare local AI files with S3
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct S3FileStatus {
    /// Relative path (e.g. "instructions.md", "tables/foo.md")
    pub path: String,
    pub in_local: bool,
    pub in_s3: bool,
    /// S3 last modified (ISO string), None if not in S3
    pub s3_last_modified: Option<String>,
    /// S3 file size in bytes
    pub s3_size: Option<u64>,
    /// Local file size in bytes
    pub local_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct S3StatusResult {
    pub domain: String,
    pub has_ai_folder: bool,
    pub local_count: usize,
    pub s3_count: usize,
    pub files: Vec<S3FileStatus>,
}

/// Get S3 status for a domain - compare local ai/ folder with S3 contents
#[command]
pub async fn val_s3_ai_status(domain: String, global_path: String) -> Result<S3StatusResult, String> {
    // Load AWS credentials
    let settings = crate::commands::settings::load_settings()
        .map_err(|e| format!("Failed to load settings: {}", e))?;

    let access_key = settings.keys.get("aws_access_key_id")
        .ok_or_else(|| "AWS Access Key ID not configured".to_string())?;
    let secret_key = settings.keys.get("aws_secret_access_key")
        .ok_or_else(|| "AWS Secret Access Key not configured".to_string())?;

    let ai_path = std::path::Path::new(&global_path).join("ai");
    let has_ai_folder = ai_path.exists();

    // Collect local files (relative paths)
    let mut local_files: HashMap<String, u64> = HashMap::new();
    if has_ai_folder {
        collect_local_files(&ai_path, &ai_path, &mut local_files);
    }

    // List S3 files
    let s3_prefix = format!("solutions/{}/", domain);
    let s3_files = list_s3_files(access_key, secret_key, &s3_prefix).await?;

    // Merge into combined status
    let mut all_paths: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
    for path in local_files.keys() {
        all_paths.insert(path.clone());
    }
    for (path, _, _) in &s3_files {
        all_paths.insert(path.clone());
    }

    let s3_map: HashMap<String, (String, u64)> = s3_files
        .into_iter()
        .map(|(path, modified, size)| (path, (modified, size)))
        .collect();

    let files: Vec<S3FileStatus> = all_paths
        .into_iter()
        .map(|path| {
            let in_local = local_files.contains_key(&path);
            let s3_entry = s3_map.get(&path);
            S3FileStatus {
                path: path.clone(),
                in_local,
                in_s3: s3_entry.is_some(),
                s3_last_modified: s3_entry.map(|(m, _)| m.clone()),
                s3_size: s3_entry.map(|(_, s)| *s),
                local_size: local_files.get(&path).copied(),
            }
        })
        .collect();

    let local_count = local_files.len();
    let s3_count = s3_map.len();

    Ok(S3StatusResult {
        domain,
        has_ai_folder,
        local_count,
        s3_count,
        files,
    })
}

/// Recursively collect files under a directory, storing relative paths and sizes
fn collect_local_files(base: &std::path::Path, dir: &std::path::Path, out: &mut HashMap<String, u64>) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        // Skip hidden files
        if name.starts_with('.') {
            continue;
        }
        if path.is_dir() {
            collect_local_files(base, &path, out);
        } else {
            let rel = path.strip_prefix(base)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            if !rel.is_empty() {
                out.insert(rel, size);
            }
        }
    }
}

/// List files in S3 under a prefix, returns (relative_path, last_modified, size)
async fn list_s3_files(
    access_key: &str,
    secret_key: &str,
    prefix: &str,
) -> Result<Vec<(String, String, u64)>, String> {
    let output = tokio::process::Command::new("aws")
        .args([
            "s3api", "list-objects-v2",
            "--bucket", S3_BUCKET,
            "--prefix", prefix,
            "--region", S3_REGION,
            "--output", "json",
        ])
        .env("AWS_ACCESS_KEY_ID", access_key)
        .env("AWS_SECRET_ACCESS_KEY", secret_key)
        .output()
        .await
        .map_err(|e| format!("Failed to run aws CLI: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("aws s3api failed: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    if stdout.trim().is_empty() {
        return Ok(vec![]);
    }

    let json: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse S3 response: {}", e))?;

    let contents = match json.get("Contents").and_then(|c| c.as_array()) {
        Some(arr) => arr,
        None => return Ok(vec![]),
    };

    let mut files = Vec::new();
    for obj in contents {
        let key = obj.get("Key").and_then(|k| k.as_str()).unwrap_or("");
        let last_modified = obj.get("LastModified").and_then(|m| m.as_str()).unwrap_or("").to_string();
        let size = obj.get("Size").and_then(|s| s.as_u64()).unwrap_or(0);

        // Strip the prefix to get relative path
        let rel = key.strip_prefix(prefix).unwrap_or(key).to_string();
        // Skip empty keys (the folder itself) and .DS_Store
        if rel.is_empty() || rel == ".DS_Store" {
            continue;
        }
        files.push((rel, last_modified, size));
    }

    Ok(files)
}
