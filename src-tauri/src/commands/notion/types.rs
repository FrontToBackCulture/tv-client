// Notion Sync Types

use serde::{Deserialize, Serialize};
use serde_json::Value;

// ============================================================================
// Notion API Response Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotionSearchResponse {
    pub results: Vec<NotionObject>,
    pub has_more: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotionObject {
    pub id: String,
    pub object: String, // "database" | "page"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<Vec<NotionRichText>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub properties: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_edited_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotionRichText {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plain_text: Option<String>,
    #[serde(rename = "type")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotionQueryResponse {
    pub results: Vec<NotionPage>,
    pub has_more: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotionPage {
    pub id: String,
    pub properties: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_edited_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

// ============================================================================
// Notion Database Schema
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotionDatabaseInfo {
    pub id: String,
    pub title: String,
    pub properties: Vec<NotionPropertySchema>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_edited_time: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotionPropertySchema {
    pub name: String,
    #[serde(rename = "type")]
    pub prop_type: String,
    /// For select/status: available options
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<Vec<NotionSelectOption>>,
    /// For status: available groups
    #[serde(skip_serializing_if = "Option::is_none")]
    pub groups: Option<Vec<NotionStatusGroup>>,
    /// For relation: the related database ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relation_database_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotionSelectOption {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotionStatusGroup {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub option_ids: Option<Vec<String>>,
}

// ============================================================================
// Sync Configuration (stored in Supabase)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncConfig {
    pub id: String,
    pub name: String,
    pub notion_database_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_project_id: Option<String>,
    pub field_mapping: Value, // FieldMapping JSON
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filter: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sync_interval_minutes: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_synced_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    /// Runtime-only: use created_time instead of last_edited_time for since filter
    #[serde(default, skip_serializing)]
    pub use_created_time: bool,
    /// Runtime-only: skip fetching page body content (faster for bulk sync)
    #[serde(default, skip_serializing)]
    pub skip_body: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSyncConfig {
    pub name: String,
    pub notion_database_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_project_id: Option<String>,
    pub field_mapping: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filter: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sync_interval_minutes: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateSyncConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_project_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub field_mapping: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filter: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sync_interval_minutes: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
}

// ============================================================================
// Sync Progress Events
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncProgress {
    pub phase: String,
    pub current: i64,
    pub total: i64,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncComplete {
    pub tasks_created: i64,
    pub tasks_updated: i64,
    pub timestamp: String,
    pub config_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatus {
    pub is_syncing: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_sync: Option<String>,
    pub configs_count: i64,
    pub enabled_count: i64,
}

// ============================================================================
// Preview
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviewCard {
    pub notion_page_id: String,
    pub title: String,
    pub properties: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_edited_time: Option<String>,
}

// ============================================================================
// Notion Users
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotionUser {
    pub id: String,
    pub name: String,
    pub email: Option<String>,
}

// ============================================================================
// Push Result
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushResult {
    pub action: String, // "created" | "updated"
    pub notion_page_id: String,
}

// ============================================================================
// Attachments
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotionAttachment {
    pub block_id: String,
    pub file_name: String,
    pub file_type: Option<String>,
    pub url: String,
}
