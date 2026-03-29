// Shared types for the Analytics module (GA4 OAuth2)

use serde::{Deserialize, Serialize};

// ============================================================================
// OAuth types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ga4Tokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: i64, // Unix timestamp (seconds)
    pub scope: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ga4AuthStatus {
    pub is_authenticated: bool,
    pub user_email: Option<String>,
    pub expires_at: Option<i64>,
}

// ============================================================================
// Google OAuth2 response types
// ============================================================================

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct GoogleTokenResponse {
    #[serde(default)]
    pub access_token: String,
    #[serde(default)]
    pub expires_in: u64,
    pub refresh_token: Option<String>,
    pub scope: Option<String>,
    pub token_type: Option<String>,
    // Error fields
    pub error: Option<String>,
    pub error_description: Option<String>,
}

/// Google userinfo response (from googleapis.com/oauth2/v2/userinfo)
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct GoogleUserInfo {
    pub email: Option<String>,
    pub name: Option<String>,
    pub picture: Option<String>,
}
