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
// Email scan types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailScanCandidate {
    pub email_id: String,
    pub subject: String,
    pub from_email: String,
    pub from_name: String,
    pub received_at: String,
    pub folder_name: String,
    pub match_method: String, // "auto_contact" | "auto_domain"
    pub relevance_score: f64,
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
    #[allow(dead_code)]
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
    #[allow(dead_code)]
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
    #[allow(dead_code)]
    pub categories: Option<Vec<String>>,
    #[serde(rename = "@removed")]
    #[allow(dead_code)]
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
    #[allow(dead_code)]
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
    #[allow(dead_code)]
    pub next_link: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GraphUserProfile {
    pub mail: Option<String>,
    #[serde(rename = "userPrincipalName")]
    pub user_principal_name: Option<String>,
    #[serde(rename = "displayName")]
    #[allow(dead_code)]
    pub display_name: Option<String>,
}

// ============================================================================
// Calendar types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEntry {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEvent {
    pub id: String,
    pub subject: String,
    pub body_preview: String,
    pub start_at: String,
    pub start_timezone: String,
    pub end_at: String,
    pub end_timezone: String,
    pub is_all_day: bool,
    pub location: String,
    pub organizer_name: String,
    pub organizer_email: String,
    pub attendees: Vec<EventAttendee>,
    pub is_online_meeting: bool,
    pub online_meeting_url: Option<String>,
    pub show_as: String,
    pub importance: String,
    pub is_cancelled: bool,
    pub web_link: String,
    pub created_at: String,
    pub last_modified_at: String,
    pub categories: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventAttendee {
    pub name: String,
    pub email: String,
    pub response_status: String,
    pub attendee_type: String,
}

// Calendar scan types

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventScanCandidate {
    pub event_id: String,
    pub subject: String,
    pub start_at: String,
    pub end_at: String,
    pub organizer_name: String,
    pub organizer_email: String,
    pub location: String,
    pub match_method: String,
    pub relevance_score: f64,
}

// Graph API calendar response types

#[derive(Debug, Deserialize)]
pub struct GraphCalendarList {
    pub value: Vec<GraphCalendar>,
    #[serde(rename = "@odata.nextLink")]
    #[allow(dead_code)]
    pub next_link: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GraphCalendar {
    pub id: String,
    pub name: Option<String>,
    #[serde(rename = "isDefaultCalendar")]
    pub is_default_calendar: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct GraphEventList {
    pub value: Vec<GraphEvent>,
    #[serde(rename = "@odata.nextLink")]
    pub next_link: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GraphEvent {
    pub id: String,
    pub subject: Option<String>,
    #[serde(rename = "bodyPreview")]
    pub body_preview: Option<String>,
    pub start: Option<GraphDateTimeZone>,
    pub end: Option<GraphDateTimeZone>,
    #[serde(rename = "isAllDay")]
    pub is_all_day: Option<bool>,
    pub location: Option<GraphLocation>,
    pub organizer: Option<GraphRecipient>,
    pub attendees: Option<Vec<GraphAttendee>>,
    #[serde(rename = "isOnlineMeeting")]
    pub is_online_meeting: Option<bool>,
    #[serde(rename = "onlineMeeting")]
    pub online_meeting: Option<GraphOnlineMeeting>,
    #[serde(rename = "showAs")]
    pub show_as: Option<String>,
    pub importance: Option<String>,
    #[serde(rename = "isCancelled")]
    pub is_cancelled: Option<bool>,
    #[serde(rename = "webLink")]
    pub web_link: Option<String>,
    #[serde(rename = "createdDateTime")]
    pub created_date_time: Option<String>,
    #[serde(rename = "lastModifiedDateTime")]
    pub last_modified_date_time: Option<String>,
    pub categories: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct GraphDateTimeZone {
    #[serde(rename = "dateTime")]
    pub date_time: Option<String>,
    #[serde(rename = "timeZone")]
    pub time_zone: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GraphLocation {
    #[serde(rename = "displayName")]
    pub display_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GraphAttendee {
    #[serde(rename = "emailAddress")]
    pub email_address: GraphEmailAddress,
    pub status: Option<GraphResponseStatus>,
    #[serde(rename = "type")]
    pub attendee_type: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GraphResponseStatus {
    pub response: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GraphOnlineMeeting {
    #[serde(rename = "joinUrl")]
    pub join_url: Option<String>,
}
