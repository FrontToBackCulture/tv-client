// LinkedIn REST API client
// Handles posting, reading posts, and engagement data
//
// Uses UGC Posts API (/v2/ugcPosts) for the "Share on LinkedIn" product (w_member_social scope).
// The newer /v2/posts endpoint requires Community Management API access.

use super::auth;
use super::types::*;
use crate::commands::error::{CmdResult, CommandError};

const LINKEDIN_API_BASE: &str = "https://api.linkedin.com";

// ============================================================================
// Posts API (UGC)
// ============================================================================

/// Create a new LinkedIn post on the authenticated user's profile
#[tauri::command]
pub async fn linkedin_create_post(text: String, visibility: Option<String>) -> CmdResult<String> {
    let token = auth::get_valid_token().await?;

    // Get the user's person URN
    let user_info = get_userinfo(&token).await?;
    let author = format!("urn:li:person:{}", user_info.sub);

    let vis = visibility.unwrap_or_else(|| "PUBLIC".to_string());
    let vis_code = if vis == "CONNECTIONS" {
        "CONNECTIONS"
    } else {
        "PUBLIC"
    };

    // UGC Posts API — works with w_member_social scope
    let body = serde_json::json!({
        "author": author,
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {
                    "text": text
                },
                "shareMediaCategory": "NONE"
            }
        },
        "visibility": {
            "com.linkedin.ugc.MemberNetworkVisibility": vis_code
        }
    });

    let client = crate::HTTP_CLIENT.clone();
    let response = client
        .post(format!("{}/v2/ugcPosts", LINKEDIN_API_BASE))
        .header("Authorization", format!("Bearer {}", token))
        .header("X-Restli-Protocol-Version", "2.0.0")
        .json(&body)
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(CommandError::Http {
            status: status.as_u16(),
            body,
        });
    }

    // The post ID comes from the x-restli-id header
    let post_id = response
        .headers()
        .get("x-restli-id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "unknown".to_string());

    Ok(post_id)
}

/// Get the authenticated user's recent posts
#[tauri::command]
pub async fn linkedin_get_posts(count: Option<i64>) -> CmdResult<Vec<LinkedInPost>> {
    let token = auth::get_valid_token().await?;
    let user_info = get_userinfo(&token).await?;
    let author_urn = format!("urn:li:person:{}", user_info.sub);
    let limit = count.unwrap_or(20);

    let client = crate::HTTP_CLIENT.clone();

    // UGC Posts API — q=authors works with w_member_social
    let url = format!(
        "{}/v2/ugcPosts?q=authors&authors=List({})&count={}&sortBy=LAST_MODIFIED",
        LINKEDIN_API_BASE,
        urlencoding::encode(&author_urn),
        limit,
    );

    eprintln!("[linkedin:api] Fetching posts: {}", url);

    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("X-Restli-Protocol-Version", "2.0.0")
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        eprintln!("[linkedin:api] Posts API error: {} {}", status, body);
        return Err(CommandError::Http {
            status: status.as_u16(),
            body,
        });
    }

    let raw: serde_json::Value = response.json().await.map_err(|e| {
        CommandError::Parse(format!("Failed to parse LinkedIn posts: {}", e))
    })?;

    eprintln!("[linkedin:api] Posts response keys: {:?}", raw.as_object().map(|o| o.keys().collect::<Vec<_>>()));

    let elements = raw.get("elements").and_then(|v| v.as_array()).cloned().unwrap_or_default();

    let posts = elements
        .into_iter()
        .filter_map(|el| {
            let id = el.get("id")?.as_str()?.to_string();

            // Extract text from UGC specificContent
            let text = el
                .get("specificContent")
                .and_then(|sc| sc.get("com.linkedin.ugc.ShareContent"))
                .and_then(|share| share.get("shareCommentary"))
                .and_then(|c| c.get("text"))
                .and_then(|t| t.as_str())
                .unwrap_or("")
                .to_string();

            let created_at = el
                .get("created")
                .and_then(|c| c.get("time"))
                .and_then(|t| t.as_i64())
                .and_then(|ms| chrono::DateTime::from_timestamp_millis(ms))
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_default();

            let lifecycle_state = el
                .get("lifecycleState")
                .and_then(|v| v.as_str())
                .unwrap_or("PUBLISHED")
                .to_string();

            let visibility = el
                .get("visibility")
                .and_then(|v| v.get("com.linkedin.ugc.MemberNetworkVisibility"))
                .and_then(|v| v.as_str())
                .unwrap_or("PUBLIC")
                .to_string();

            Some(LinkedInPost {
                id,
                text,
                created_at,
                lifecycle_state,
                visibility,
                num_likes: 0,
                num_comments: 0,
                num_shares: 0,
                num_impressions: 0,
            })
        })
        .collect();

    Ok(posts)
}

/// Delete a post
#[tauri::command]
pub async fn linkedin_delete_post(post_id: String) -> CmdResult<()> {
    let token = auth::get_valid_token().await?;

    let client = crate::HTTP_CLIENT.clone();
    let response = client
        .delete(format!(
            "{}/v2/ugcPosts/{}",
            LINKEDIN_API_BASE,
            urlencoding::encode(&post_id)
        ))
        .header("Authorization", format!("Bearer {}", token))
        .header("X-Restli-Protocol-Version", "2.0.0")
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(CommandError::Http {
            status: status.as_u16(),
            body,
        });
    }

    Ok(())
}

// ============================================================================
// Profile
// ============================================================================

/// Get the authenticated user's profile info
#[tauri::command]
pub async fn linkedin_get_profile() -> CmdResult<LinkedInUserInfo> {
    let token = auth::get_valid_token().await?;
    get_userinfo(&token).await
}

// ============================================================================
// Helpers
// ============================================================================

async fn get_userinfo(token: &str) -> CmdResult<LinkedInUserInfo> {
    let client = crate::HTTP_CLIENT.clone();
    let response = client
        .get(format!("{}/v2/userinfo", LINKEDIN_API_BASE))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(CommandError::Http {
            status: status.as_u16(),
            body,
        });
    }

    let info: LinkedInUserInfo = response
        .json()
        .await
        .map_err(|e| CommandError::Parse(format!("Failed to parse userinfo: {}", e)))?;

    Ok(info)
}
