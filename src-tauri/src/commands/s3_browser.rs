// S3 Browser — generic bucket browser with list + delete
// Supports multiple buckets (production.thinkval.static, signalval)

use aws_sdk_s3::config::{BehaviorVersion, Credentials, Region};
use aws_sdk_s3::presigning::PresigningConfig;
use aws_sdk_s3::types::{Delete, ObjectIdentifier};
use crate::commands::error::{CmdResult, CommandError};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::command;

const S3_REGION: &str = "ap-southeast-1";

/// Known buckets the app uses
const ALLOWED_BUCKETS: &[&str] = &["production.thinkval.static", "signalval"];

fn build_s3_client(access_key: &str, secret_key: &str) -> aws_sdk_s3::Client {
    let creds = Credentials::new(access_key, secret_key, None, None, "tv-client-settings");
    let config = aws_sdk_s3::Config::builder()
        .behavior_version(BehaviorVersion::latest())
        .region(Region::new(S3_REGION))
        .credentials_provider(creds)
        .build();
    aws_sdk_s3::Client::from_conf(config)
}

fn load_credentials() -> CmdResult<(String, String)> {
    let settings = crate::commands::settings::load_settings()?;
    let access_key = settings.keys.get("aws_access_key_id")
        .ok_or_else(|| CommandError::Config("AWS Access Key ID not configured. Go to Settings to add it.".to_string()))?
        .clone();
    let secret_key = settings.keys.get("aws_secret_access_key")
        .ok_or_else(|| CommandError::Config("AWS Secret Access Key not configured. Go to Settings to add it.".to_string()))?
        .clone();
    Ok((access_key, secret_key))
}

fn validate_bucket(bucket: &str) -> CmdResult<()> {
    if !ALLOWED_BUCKETS.contains(&bucket) {
        return Err(CommandError::Config(format!(
            "Bucket '{}' is not in the allowed list: {:?}", bucket, ALLOWED_BUCKETS
        )));
    }
    Ok(())
}

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct S3BucketInfo {
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct S3BrowseObject {
    pub key: String,
    pub size: u64,
    pub last_modified: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct S3BrowseResult {
    pub bucket: String,
    pub prefix: String,
    /// Common prefixes (folders) at this level
    pub folders: Vec<String>,
    /// Objects (files) at this level
    pub objects: Vec<S3BrowseObject>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct S3DeleteResult {
    pub deleted_count: usize,
}

// ============================================================================
// Commands
// ============================================================================

/// List known S3 buckets
#[command]
pub fn s3_browse_buckets() -> CmdResult<Vec<S3BucketInfo>> {
    Ok(vec![
        S3BucketInfo {
            name: "production.thinkval.static".to_string(),
            description: "Static assets, demo reports, email images, domain solutions".to_string(),
        },
        S3BucketInfo {
            name: "signalval".to_string(),
            description: "Scheduled job outputs".to_string(),
        },
    ])
}

/// List objects and folders at a given prefix.
/// Builds virtual folder structure by splitting keys on both `/` and `\`,
/// since some keys were uploaded from Windows with backslash separators.
#[command]
pub async fn s3_browse_list(bucket: String, prefix: String) -> CmdResult<S3BrowseResult> {
    validate_bucket(&bucket)?;
    let (access_key, secret_key) = load_credentials()?;
    let client = build_s3_client(&access_key, &secret_key);

    // Fetch ALL keys under prefix (no delimiter — we'll build folders ourselves)
    let mut all_objects: Vec<(String, u64, String)> = Vec::new(); // (key, size, last_modified)
    let mut continuation_token: Option<String> = None;

    loop {
        let mut req = client
            .list_objects_v2()
            .bucket(&bucket)
            .prefix(&prefix);

        if let Some(token) = &continuation_token {
            req = req.continuation_token(token);
        }

        let resp = req.send().await
            .map_err(|e| CommandError::Network(format!("Failed to list S3 objects: {}", e)))?;

        for obj in resp.contents() {
            let key = obj.key().unwrap_or("").to_string();
            if key == prefix || key.is_empty() {
                continue;
            }
            let last_modified = obj.last_modified()
                .map(|dt| {
                    dt.fmt(aws_sdk_s3::primitives::DateTimeFormat::DateTime)
                        .unwrap_or_default()
                })
                .unwrap_or_default();
            let size = obj.size().unwrap_or(0) as u64;
            all_objects.push((key, size, last_modified));
        }

        match resp.next_continuation_token() {
            Some(token) => continuation_token = Some(token.to_string()),
            None => break,
        }
    }

    // Build virtual folder structure from all keys.
    // For each key, strip the current prefix, then find the first separator (/ or \).
    // If there's a separator, the part before it is a folder. Otherwise it's a file.
    let mut folder_set = std::collections::BTreeSet::new();
    let mut objects: Vec<S3BrowseObject> = Vec::new();

    for (key, size, last_modified) in &all_objects {
        let rel = key.strip_prefix(&prefix).unwrap_or(key);
        if rel.is_empty() {
            continue;
        }

        // Find the first separator (either / or \)
        let sep_pos = rel.find(|c: char| c == '/' || c == '\\');

        match sep_pos {
            Some(pos) => {
                // This key is inside a subfolder — extract the folder name
                let folder_name = &rel[..pos];
                let sep_char = &rel[pos..pos+1];
                let folder_prefix = format!("{}{}{}", prefix, folder_name, sep_char);
                folder_set.insert(folder_prefix);
            }
            None => {
                // Direct file at this level
                objects.push(S3BrowseObject {
                    key: key.clone(),
                    size: *size,
                    last_modified: last_modified.clone(),
                });
            }
        }
    }

    let folders: Vec<String> = folder_set.into_iter().collect();
    objects.sort_by(|a, b| a.key.cmp(&b.key));

    Ok(S3BrowseResult { bucket, prefix, folders, objects })
}

/// Delete specific S3 keys (files). For folders, the frontend should list all keys under the prefix first.
#[command]
pub async fn s3_browse_delete(bucket: String, keys: Vec<String>) -> CmdResult<S3DeleteResult> {
    validate_bucket(&bucket)?;
    if keys.is_empty() {
        return Ok(S3DeleteResult { deleted_count: 0 });
    }

    let (access_key, secret_key) = load_credentials()?;
    let client = build_s3_client(&access_key, &secret_key);

    let mut deleted_count = 0usize;

    // Delete in batches of 1000 (S3 limit)
    for chunk in keys.chunks(1000) {
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
            .bucket(&bucket)
            .delete(delete)
            .send()
            .await
            .map_err(|e| CommandError::Network(format!("Failed to delete S3 objects: {}", e)))?;

        deleted_count += chunk.len();
    }

    Ok(S3DeleteResult { deleted_count })
}

/// List ALL keys under a prefix (recursive, no delimiter). Used before deleting a folder.
#[command]
pub async fn s3_browse_list_all_keys(bucket: String, prefix: String) -> CmdResult<Vec<String>> {
    validate_bucket(&bucket)?;
    let (access_key, secret_key) = load_credentials()?;
    let client = build_s3_client(&access_key, &secret_key);

    let mut keys = Vec::new();
    let mut continuation_token: Option<String> = None;

    loop {
        let mut req = client
            .list_objects_v2()
            .bucket(&bucket)
            .prefix(&prefix);

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

/// Generate a presigned URL for an S3 object (valid for 1 hour)
#[command]
pub async fn s3_browse_presign(bucket: String, key: String) -> CmdResult<String> {
    validate_bucket(&bucket)?;
    let (access_key, secret_key) = load_credentials()?;
    let client = build_s3_client(&access_key, &secret_key);

    let presigning = PresigningConfig::expires_in(Duration::from_secs(3600))
        .map_err(|e| CommandError::Internal(format!("Failed to build presigning config: {}", e)))?;

    let presigned = client
        .get_object()
        .bucket(&bucket)
        .key(&key)
        .presigned(presigning)
        .await
        .map_err(|e| CommandError::Network(format!("Failed to generate presigned URL: {}", e)))?;

    Ok(presigned.uri().to_string())
}

/// Fetch the text content of an S3 object (for previewing text files in the UI).
/// Returns the content as a UTF-8 string. Max 5MB to avoid memory issues.
#[command]
pub async fn s3_browse_get_text(bucket: String, key: String) -> CmdResult<String> {
    validate_bucket(&bucket)?;
    let (access_key, secret_key) = load_credentials()?;
    let client = build_s3_client(&access_key, &secret_key);

    let resp = client
        .get_object()
        .bucket(&bucket)
        .key(&key)
        .send()
        .await
        .map_err(|e| CommandError::Network(format!("Failed to get S3 object: {}", e)))?;

    let content_length = resp.content_length().unwrap_or(0);
    if content_length > 5 * 1024 * 1024 {
        return Err(CommandError::Internal("File too large to preview (max 5MB)".to_string()));
    }

    let bytes = resp.body.collect().await
        .map_err(|e| CommandError::Io(format!("Failed to read S3 object body: {}", e)))?;

    let text = String::from_utf8_lossy(&bytes.into_bytes()).to_string();
    Ok(text)
}
