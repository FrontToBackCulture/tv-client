// Shared types for the LinkedIn module

use serde::{Deserialize, Serialize};

// ============================================================================
// OAuth types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkedInTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: i64, // Unix timestamp
    pub scope: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkedInAuthStatus {
    pub is_authenticated: bool,
    pub user_name: Option<String>,
    pub user_sub: Option<String>, // LinkedIn member URN (e.g. "person:abc123")
    pub expires_at: Option<i64>,
}

// ============================================================================
// LinkedIn API response types
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct LinkedInTokenResponse {
    pub access_token: String,
    pub expires_in: u64,
    pub refresh_token: Option<String>,
    pub refresh_token_expires_in: Option<u64>,
    pub scope: Option<String>,
    pub token_type: Option<String>,
    // Error fields
    pub error: Option<String>,
    pub error_description: Option<String>,
}

/// OpenID Connect userinfo response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkedInUserInfo {
    pub sub: String, // LinkedIn member ID
    pub name: Option<String>,
    pub given_name: Option<String>,
    pub family_name: Option<String>,
    pub picture: Option<String>,
    pub email: Option<String>,
    pub email_verified: Option<bool>,
}

// ============================================================================
// Post types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkedInPost {
    pub id: String,
    pub text: String,
    pub created_at: String,
    pub lifecycle_state: String,
    pub visibility: String,
    // Engagement
    pub num_likes: i64,
    pub num_comments: i64,
    pub num_shares: i64,
    pub num_impressions: i64,
}

/// Request to create a new post
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePostRequest {
    pub text: String,
    pub visibility: Option<String>, // "PUBLIC" or "CONNECTIONS", defaults to PUBLIC
}

// ============================================================================
// LinkedIn REST API response types
// ============================================================================

/// Response from creating a post (Posts API)
#[derive(Debug, Deserialize)]
pub struct LinkedInCreatePostResponse {
    pub id: Option<String>,
    #[serde(rename = "x-restli-id")]
    pub restli_id: Option<String>,
}

/// Posts API list response
#[derive(Debug, Deserialize)]
pub struct LinkedInPostsResponse {
    pub elements: Vec<LinkedInPostElement>,
    pub paging: Option<LinkedInPaging>,
}

#[derive(Debug, Deserialize)]
pub struct LinkedInPaging {
    pub count: Option<i64>,
    pub start: Option<i64>,
    pub total: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkedInPostElement {
    pub id: Option<String>,
    pub author: Option<String>,
    pub commentary: Option<String>,
    pub visibility: Option<String>,
    pub lifecycle_state: Option<String>,
    pub created_at: Option<i64>,  // epoch ms
    pub last_modified_at: Option<i64>,
    pub distribution: Option<serde_json::Value>,
}

/// Social action counts (likes, comments, shares)
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkedInSocialCounts {
    pub num_likes: Option<i64>,
    pub num_comments: Option<i64>,
    pub num_shares: Option<i64>,
}
