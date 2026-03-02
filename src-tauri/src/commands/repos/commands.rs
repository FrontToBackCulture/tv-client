use tauri::command;

use super::types::{RepoCommit, RepoRelease, WorkflowRun};

const GITHUB_API: &str = "https://api.github.com";

fn github_client(token: &str) -> Result<(reqwest::Client, Vec<(String, String)>), String> {
    let client = reqwest::Client::new();
    let headers = vec![
        ("Authorization".into(), format!("Bearer {}", token)),
        ("Accept".into(), "application/vnd.github.v3+json".into()),
        ("User-Agent".into(), "tv-client".into()),
    ];
    Ok((client, headers))
}

async fn github_get(
    token: &str,
    url: &str,
) -> Result<serde_json::Value, String> {
    let (client, _) = github_client(token)?;
    let response = client
        .get(url)
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

    response
        .json()
        .await
        .map_err(|e| format!("Failed to parse GitHub response: {}", e))
}

#[command]
pub async fn repos_get_commits(
    token: String,
    owner: String,
    repo: String,
    branch: Option<String>,
    per_page: Option<u32>,
) -> Result<Vec<RepoCommit>, String> {
    let per_page = per_page.unwrap_or(20).min(100);
    let mut url = format!(
        "{}/repos/{}/{}/commits?per_page={}",
        GITHUB_API, owner, repo, per_page
    );
    if let Some(ref b) = branch {
        url.push_str(&format!("&sha={}", b));
    }

    let data = github_get(&token, &url).await?;
    let arr = data
        .as_array()
        .ok_or_else(|| "Expected array from commits endpoint".to_string())?;

    let commits: Vec<RepoCommit> = arr
        .iter()
        .filter_map(|item| {
            let sha = item.get("sha")?.as_str()?.to_string();
            let commit = item.get("commit")?;
            let message = commit
                .get("message")?
                .as_str()?
                .lines()
                .next()
                .unwrap_or("")
                .to_string();
            let date = commit
                .pointer("/author/date")
                .and_then(|d| d.as_str())
                .unwrap_or("")
                .to_string();
            let author = item.get("author");
            let author_login = author
                .and_then(|a| a.get("login"))
                .and_then(|l| l.as_str())
                .unwrap_or("")
                .to_string();
            let author_avatar = author
                .and_then(|a| a.get("avatar_url"))
                .and_then(|u| u.as_str())
                .unwrap_or("")
                .to_string();
            let author_name = commit
                .pointer("/author/name")
                .and_then(|n| n.as_str())
                .unwrap_or(&author_login)
                .to_string();
            let html_url = item.get("html_url")?.as_str()?.to_string();

            Some(RepoCommit {
                sha,
                message,
                author_name,
                author_avatar,
                author_login,
                date,
                html_url,
            })
        })
        .collect();

    Ok(commits)
}

#[command]
pub async fn repos_get_releases(
    token: String,
    owner: String,
    repo: String,
    per_page: Option<u32>,
) -> Result<Vec<RepoRelease>, String> {
    let per_page = per_page.unwrap_or(10).min(100);
    let url = format!(
        "{}/repos/{}/{}/releases?per_page={}",
        GITHUB_API, owner, repo, per_page
    );

    let data = github_get(&token, &url).await?;
    let arr = data
        .as_array()
        .ok_or_else(|| "Expected array from releases endpoint".to_string())?;

    let releases: Vec<RepoRelease> = arr
        .iter()
        .filter_map(|item| {
            let id = item.get("id")?.as_i64()?;
            let tag_name = item.get("tag_name")?.as_str()?.to_string();
            let name = item
                .get("name")
                .and_then(|n| n.as_str())
                .unwrap_or("")
                .to_string();
            let body = item
                .get("body")
                .and_then(|b| b.as_str())
                .unwrap_or("")
                .to_string();
            let published_at = item
                .get("published_at")
                .and_then(|p| p.as_str())
                .unwrap_or("")
                .to_string();
            let html_url = item.get("html_url")?.as_str()?.to_string();
            let author_login = item
                .pointer("/author/login")
                .and_then(|l| l.as_str())
                .unwrap_or("")
                .to_string();
            let prerelease = item
                .get("prerelease")
                .and_then(|p| p.as_bool())
                .unwrap_or(false);
            let draft = item
                .get("draft")
                .and_then(|d| d.as_bool())
                .unwrap_or(false);

            Some(RepoRelease {
                id,
                tag_name,
                name,
                body,
                published_at,
                html_url,
                author_login,
                prerelease,
                draft,
            })
        })
        .collect();

    Ok(releases)
}

#[command]
pub async fn repos_get_workflow_runs(
    token: String,
    owner: String,
    repo: String,
    per_page: Option<u32>,
) -> Result<Vec<WorkflowRun>, String> {
    let per_page = per_page.unwrap_or(10).min(100);
    let url = format!(
        "{}/repos/{}/{}/actions/runs?per_page={}",
        GITHUB_API, owner, repo, per_page
    );

    let data = github_get(&token, &url).await?;
    let arr = data
        .get("workflow_runs")
        .and_then(|w| w.as_array())
        .ok_or_else(|| "Expected workflow_runs array".to_string())?;

    let runs: Vec<WorkflowRun> = arr
        .iter()
        .filter_map(|item| {
            let id = item.get("id")?.as_i64()?;
            let name = item.get("name")?.as_str()?.to_string();
            let head_branch = item
                .get("head_branch")
                .and_then(|b| b.as_str())
                .unwrap_or("")
                .to_string();
            let status = item.get("status")?.as_str()?.to_string();
            let conclusion = item
                .get("conclusion")
                .and_then(|c| c.as_str())
                .map(|s| s.to_string());
            let run_number = item.get("run_number")?.as_i64()?;
            let html_url = item.get("html_url")?.as_str()?.to_string();
            let created_at = item.get("created_at")?.as_str()?.to_string();
            let updated_at = item.get("updated_at")?.as_str()?.to_string();
            let head_sha = item
                .get("head_sha")
                .and_then(|s| s.as_str())
                .unwrap_or("")
                .to_string();
            let head_commit_message = item
                .pointer("/head_commit/message")
                .and_then(|m| m.as_str())
                .unwrap_or("")
                .lines()
                .next()
                .unwrap_or("")
                .to_string();

            Some(WorkflowRun {
                id,
                name,
                head_branch,
                status,
                conclusion,
                run_number,
                html_url,
                created_at,
                updated_at,
                head_sha,
                head_commit_message,
            })
        })
        .collect();

    Ok(runs)
}
