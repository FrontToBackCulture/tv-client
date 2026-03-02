use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoCommit {
    pub sha: String,
    pub message: String,
    pub author_name: String,
    pub author_avatar: String,
    pub author_login: String,
    pub date: String,
    pub html_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoRelease {
    pub id: i64,
    pub tag_name: String,
    pub name: String,
    pub body: String,
    pub published_at: String,
    pub html_url: String,
    pub author_login: String,
    pub prerelease: bool,
    pub draft: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRun {
    pub id: i64,
    pub name: String,
    pub head_branch: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub run_number: i64,
    pub html_url: String,
    pub created_at: String,
    pub updated_at: String,
    pub head_sha: String,
    pub head_commit_message: String,
}
