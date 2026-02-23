// GitHub API client - fetch repo tree and file content

use super::mapping::GitHubFile;

const GITHUB_API_BASE: &str = "https://api.github.com";
const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024; // 10MB

/// Fetch the full recursive tree of a repository
pub async fn fetch_tree(
    token: &str,
    owner: &str,
    repo: &str,
    branch: &str,
) -> Result<Vec<GitHubFile>, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "{}/repos/{}/{}/git/trees/{}",
        GITHUB_API_BASE, owner, repo, branch
    );

    let response = client
        .get(&url)
        .query(&[("recursive", "1")])
        .header("Authorization", format!("Bearer {}", token))
        .header("Accept", "application/vnd.github.v3+json")
        .header("User-Agent", "tv-client")
        .send()
        .await
        .map_err(|e| format!("GitHub API request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("GitHub API error {}: {}", status, body));
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse GitHub response: {}", e))?;

    let tree = data
        .get("tree")
        .and_then(|t| t.as_array())
        .ok_or_else(|| "No tree in GitHub response".to_string())?;

    let files: Vec<GitHubFile> = tree
        .iter()
        .filter_map(|item| {
            let item_type = item.get("type")?.as_str()?;
            if item_type != "blob" {
                return None;
            }

            let path = item.get("path")?.as_str()?.to_string();
            let size = item.get("size").and_then(|s| s.as_u64()).unwrap_or(0);
            let sha = item
                .get("sha")
                .and_then(|s| s.as_str())
                .unwrap_or("")
                .to_string();

            // Decompose path into folder, filename, extension
            let parts: Vec<&str> = path.rsplitn(2, '/').collect();
            let (filename, folder) = if parts.len() == 2 {
                (parts[0].to_string(), parts[1].to_string())
            } else {
                (path.clone(), String::new())
            };

            let extension = filename
                .rfind('.')
                .map(|i| filename[i..].to_string())
                .unwrap_or_default();

            Some(GitHubFile {
                path,
                folder,
                filename,
                extension,
                size,
                sha,
            })
        })
        .collect();

    Ok(files)
}

/// Fetch the content of a single file from GitHub
pub async fn fetch_file_content(
    token: &str,
    owner: &str,
    repo: &str,
    path: &str,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "{}/repos/{}/{}/contents/{}",
        GITHUB_API_BASE, owner, repo, path
    );

    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Accept", "application/vnd.github.v3+json")
        .header("User-Agent", "tv-client")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch file content: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        return Err(format!("GitHub API error {} for {}", status, path));
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse file response: {}", e))?;

    let size = data.get("size").and_then(|s| s.as_u64()).unwrap_or(0);
    if size > MAX_FILE_SIZE {
        return Err(format!("File too large: {} bytes", size));
    }

    // Content is base64 encoded
    let content_b64 = data
        .get("content")
        .and_then(|c| c.as_str())
        .ok_or_else(|| "No content in response".to_string())?;

    // GitHub returns base64 with newlines
    let cleaned = content_b64.replace('\n', "");
    let bytes = base64_decode(&cleaned)?;
    String::from_utf8(bytes).map_err(|e| format!("File is not valid UTF-8: {}", e))
}

fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(input)
        .map_err(|e| format!("Base64 decode error: {}", e))
}
