// S3 Sync - Push domain AI folders to S3 and check status
// Uses aws-sdk-s3 directly — no external AWS CLI dependency needed.

use aws_sdk_s3::config::{BehaviorVersion, Credentials, Region};
use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::types::{Delete, ObjectIdentifier};
use crate::commands::error::{CmdResult, CommandError};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Instant;
use tauri::command;

const S3_BUCKET: &str = "production.thinkval.static";
const S3_REGION: &str = "ap-southeast-1";

/// Build an S3 client from stored credentials (no env/profile lookup needed)
fn build_s3_client(access_key: &str, secret_key: &str) -> aws_sdk_s3::Client {
    let creds = Credentials::new(access_key, secret_key, None, None, "tv-client-settings");
    let config = aws_sdk_s3::Config::builder()
        .behavior_version(BehaviorVersion::latest())
        .region(Region::new(S3_REGION))
        .credentials_provider(creds)
        .build();
    aws_sdk_s3::Client::from_conf(config)
}

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
pub async fn val_sync_ai_to_s3(domain: String, global_path: String) -> CmdResult<S3SyncResult> {
    let start = Instant::now();

    // Load AWS credentials from settings
    let settings = crate::commands::settings::load_settings()?;

    let access_key = settings.keys.get("aws_access_key_id")
        .ok_or_else(|| CommandError::Config("AWS Access Key ID not configured. Go to Settings to add it.".to_string()))?;
    let secret_key = settings.keys.get("aws_secret_access_key")
        .ok_or_else(|| CommandError::Config("AWS Secret Access Key not configured. Go to Settings to add it.".to_string()))?;

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

    let client = build_s3_client(access_key, secret_key);
    let s3_prefix = format!("solutions/{}/", domain);

    // Step 1: Remove existing S3 folder to avoid orphan files
    delete_s3_prefix(&client, &s3_prefix).await?;

    // Step 2: Upload all local files
    // Flatten skills/ prefix: local ai/skills/{slug}/SKILL.md → S3 solutions/{domain}/{slug}/SKILL.md
    let mut local_files: HashMap<String, u64> = HashMap::new();
    collect_local_files(&ai_path, &ai_path, &mut local_files);

    let mut files_uploaded = 0usize;
    for rel_path in local_files.keys() {
        let full_path = ai_path.join(rel_path);
        let body = tokio::fs::read(&full_path)
            .await
            .map_err(|e| CommandError::Io(format!("Failed to read {}: {}", rel_path, e)))?;

        // Strip "skills/" prefix so each skill folder sits directly under the domain
        let s3_rel = rel_path.strip_prefix("skills/").unwrap_or(rel_path);
        let s3_key = format!("{}{}", s3_prefix, s3_rel);
        client
            .put_object()
            .bucket(S3_BUCKET)
            .key(&s3_key)
            .body(ByteStream::from(body))
            .send()
            .await
            .map_err(|e| CommandError::Network(format!("Failed to upload {}: {}", rel_path, e)))?;

        files_uploaded += 1;
    }

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
pub async fn val_s3_ai_status(domain: String, global_path: String) -> CmdResult<S3StatusResult> {
    // Load AWS credentials
    let settings = crate::commands::settings::load_settings()?;

    let access_key = settings.keys.get("aws_access_key_id")
        .ok_or_else(|| CommandError::Config("AWS Access Key ID not configured".to_string()))?;
    let secret_key = settings.keys.get("aws_secret_access_key")
        .ok_or_else(|| CommandError::Config("AWS Secret Access Key not configured".to_string()))?;

    let ai_path = std::path::Path::new(&global_path).join("ai");
    let has_ai_folder = ai_path.exists();

    // Collect local files (relative paths), then strip skills/ prefix to match S3 layout
    let mut raw_local: HashMap<String, u64> = HashMap::new();
    if has_ai_folder {
        collect_local_files(&ai_path, &ai_path, &mut raw_local);
    }
    let local_files: HashMap<String, u64> = raw_local
        .into_iter()
        .map(|(path, size)| {
            let normalized = path.strip_prefix("skills/").unwrap_or(&path).to_string();
            (normalized, size)
        })
        .collect();

    // List S3 files
    let client = build_s3_client(access_key, secret_key);
    let s3_prefix = format!("solutions/{}/", domain);
    let s3_files = list_s3_files(&client, &s3_prefix).await?;

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
        // Skip hidden files and ai_config.json (local-only config)
        if name.starts_with('.') || name == "ai_config.json" {
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

/// Delete all objects under an S3 prefix
async fn delete_s3_prefix(client: &aws_sdk_s3::Client, prefix: &str) -> CmdResult<()> {
    // List all objects under the prefix
    let objects = list_s3_keys(client, prefix).await?;
    if objects.is_empty() {
        return Ok(());
    }

    // Delete in batches of 1000 (S3 limit)
    for chunk in objects.chunks(1000) {
        let ids: Vec<ObjectIdentifier> = chunk
            .iter()
            .map(|key| ObjectIdentifier::builder().key(key).build()
                .expect("ObjectIdentifier build"))
            .collect();

        let delete = Delete::builder()
            .set_objects(Some(ids))
            .quiet(true)
            .build()
            .map_err(|e| CommandError::Internal(format!("Failed to build delete request: {}", e)))?;

        client
            .delete_objects()
            .bucket(S3_BUCKET)
            .delete(delete)
            .send()
            .await
            .map_err(|e| CommandError::Network(format!("Failed to delete S3 objects: {}", e)))?;
    }

    Ok(())
}

/// List all object keys under a prefix (handles pagination)
async fn list_s3_keys(client: &aws_sdk_s3::Client, prefix: &str) -> CmdResult<Vec<String>> {
    let mut keys = Vec::new();
    let mut continuation_token: Option<String> = None;

    loop {
        let mut req = client
            .list_objects_v2()
            .bucket(S3_BUCKET)
            .prefix(prefix);

        if let Some(token) = &continuation_token {
            req = req.continuation_token(token);
        }

        let resp = req.send().await
            .map_err(|e| CommandError::Network(format!("Failed to list S3 objects: {}", e)))?;

        for obj in resp.contents() {
            if let Some(key) = obj.key() {
                keys.push(key.to_string());
            }
        }

        match resp.next_continuation_token() {
            Some(token) => continuation_token = Some(token.to_string()),
            None => break,
        }
    }

    Ok(keys)
}

// ============================================================================
// Gallery - Upload demo HTML report to S3
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GalleryUploadResult {
    pub url: String,
    pub s3_key: String,
    pub size_bytes: u64,
}

/// Upload a single demo HTML file to S3 for tv-website to serve.
/// S3 key: `reports/{skill_slug}/{file_name}`
/// Returns the public URL.
#[command]
pub async fn gallery_upload_demo_report(
    file_path: String,
    skill_slug: String,
    file_name: String,
) -> CmdResult<GalleryUploadResult> {
    let settings = crate::commands::settings::load_settings()?;
    let access_key = settings.keys.get("aws_access_key_id")
        .ok_or_else(|| CommandError::Config("AWS Access Key ID not configured".to_string()))?;
    let secret_key = settings.keys.get("aws_secret_access_key")
        .ok_or_else(|| CommandError::Config("AWS Secret Access Key not configured".to_string()))?;

    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err(CommandError::NotFound(format!("File not found: {}", file_path)));
    }

    let body = tokio::fs::read(&path)
        .await
        .map_err(|e| CommandError::Io(format!("Failed to read {}: {}", file_path, e)))?;
    let size_bytes = body.len() as u64;

    let s3_key = format!("demo-reports/{}/{}", skill_slug, file_name);
    let client = build_s3_client(access_key, secret_key);

    client
        .put_object()
        .bucket(S3_BUCKET)
        .key(&s3_key)
        .body(ByteStream::from(body))
        .content_type("text/html")
        .send()
        .await
        .map_err(|e| {
            let msg = e.into_service_error().meta().message().unwrap_or("unknown error").to_string();
            CommandError::Network(format!("S3: {}", msg))
        })?;

    let url = format!("https://s3.{}.amazonaws.com/{}/{}", S3_REGION, S3_BUCKET, s3_key);

    Ok(GalleryUploadResult { url, s3_key, size_bytes })
}

/// List files in S3 under a prefix, returns (relative_path, last_modified, size)
async fn list_s3_files(
    client: &aws_sdk_s3::Client,
    prefix: &str,
) -> CmdResult<Vec<(String, String, u64)>> {
    let mut files = Vec::new();
    let mut continuation_token: Option<String> = None;

    loop {
        let mut req = client
            .list_objects_v2()
            .bucket(S3_BUCKET)
            .prefix(prefix);

        if let Some(token) = &continuation_token {
            req = req.continuation_token(token);
        }

        let resp = req.send().await
            .map_err(|e| CommandError::Network(format!("Failed to list S3 objects: {}", e)))?;

        for obj in resp.contents() {
            let key = obj.key().unwrap_or("");
            let last_modified = obj.last_modified()
                .map(|dt: &aws_sdk_s3::primitives::DateTime| {
                    dt.fmt(aws_sdk_s3::primitives::DateTimeFormat::DateTime)
                        .unwrap_or_default()
                })
                .unwrap_or_default();
            let size = obj.size().unwrap_or(0) as u64;

            // Strip the prefix to get relative path
            let rel = key.strip_prefix(prefix).unwrap_or(key).to_string();
            // Skip empty keys (the folder itself), .DS_Store, and ai_config.json (local-only)
            if rel.is_empty() || rel == ".DS_Store" || rel == "ai_config.json" {
                continue;
            }
            files.push((rel, last_modified, size));
        }

        match resp.next_continuation_token() {
            Some(token) => continuation_token = Some(token.to_string()),
            None => break,
        }
    }

    Ok(files)
}
