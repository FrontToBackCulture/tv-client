// Shared types for the Outlook module

use serde::{Deserialize, Serialize};

// ============================================================================
// Email types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailAddress {
    pub name: String,
    pub email: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailEntry {
    pub id: String,
    pub conversation_id: Option<String>,
    pub subject: String,
    pub from_name: String,
    pub from_email: String,
    pub to_addresses: Vec<EmailAddress>,
    pub cc_addresses: Vec<EmailAddress>,
    pub received_at: String,
    pub folder_name: String,
    pub importance: String,
    pub is_read: bool,
    pub has_attachments: bool,
    pub body_preview: String,
    pub body_path: Option<String>,

    // Classification
    pub category: String,
    pub priority_score: i32,
    pub priority_level: String,
    pub ai_summary: Option<String>,
    pub action_required: bool,

    // Status
    pub status: String,

    // CRM linking
    pub linked_company_id: Option<String>,
    pub linked_company_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailStats {
    pub total: i64,
    pub unread: i64,
    pub inbox: i64,
    pub archived: i64,
    pub action_required: i64,
    pub by_category: std::collections::HashMap<String, i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailFolder {
    pub id: String,
    pub display_name: String,
    pub total_count: i64,
    pub unread_count: i64,
}

// ============================================================================
// OAuth types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutlookTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: i64, // Unix timestamp
    pub scope: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutlookAuthStatus {
    pub is_authenticated: bool,
    pub user_email: Option<String>,
    pub expires_at: Option<i64>,
}

// ============================================================================
// Sync types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub is_syncing: bool,
    pub last_sync: Option<String>,
    pub emails_synced: i64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncProgress {
    pub phase: String,
    pub current: i64,
    pub total: i64,
    pub message: String,
}

// ============================================================================
// Contact types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContactRule {
    pub match_type: String,  // "email", "domain", "noise_domain"
    pub match_value: String,
    pub entity_type: String, // "client", "internal", "vendor", "noise"
    pub entity_name: String,
    pub entity_path: Option<String>,
}

// ============================================================================
// Graph API response types
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct GraphTokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: u64,
    pub scope: Option<String>,
    pub token_type: Option<String>,
    pub error: Option<String>,
    pub error_description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GraphMessageList {
    pub value: Vec<GraphMessage>,
    #[serde(rename = "@odata.nextLink")]
    pub next_link: Option<String>,
    #[serde(rename = "@odata.deltaLink")]
    pub delta_link: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GraphMessage {
    pub id: String,
    #[serde(rename = "conversationId")]
    pub conversation_id: Option<String>,
    pub subject: Option<String>,
    pub from: Option<GraphRecipient>,
    #[serde(rename = "toRecipients")]
    pub to_recipients: Option<Vec<GraphRecipient>>,
    #[serde(rename = "ccRecipients")]
    pub cc_recipients: Option<Vec<GraphRecipient>>,
    #[serde(rename = "receivedDateTime")]
    pub received_date_time: Option<String>,
    pub importance: Option<String>,
    #[serde(rename = "isRead")]
    pub is_read: Option<bool>,
    #[serde(rename = "hasAttachments")]
    pub has_attachments: Option<bool>,
    #[serde(rename = "bodyPreview")]
    pub body_preview: Option<String>,
    pub body: Option<GraphBody>,
    #[serde(rename = "parentFolderId")]
    pub parent_folder_id: Option<String>,
    pub categories: Option<Vec<String>>,
    #[serde(rename = "@removed")]
    pub removed: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct GraphRecipient {
    #[serde(rename = "emailAddress")]
    pub email_address: GraphEmailAddress,
}

#[derive(Debug, Deserialize)]
pub struct GraphEmailAddress {
    pub name: Option<String>,
    pub address: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GraphBody {
    #[serde(rename = "contentType")]
    pub content_type: Option<String>,
    pub content: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GraphFolder {
    pub id: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    #[serde(rename = "totalItemCount")]
    pub total_item_count: Option<i64>,
    #[serde(rename = "unreadItemCount")]
    pub unread_item_count: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct GraphFolderList {
    pub value: Vec<GraphFolder>,
    #[serde(rename = "@odata.nextLink")]
    pub next_link: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GraphUserProfile {
    pub mail: Option<String>,
    #[serde(rename = "userPrincipalName")]
    pub user_principal_name: Option<String>,
    #[serde(rename = "displayName")]
    pub display_name: Option<String>,
}
