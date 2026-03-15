// Workspace Module Types
// Thin wrappers — actual data structs now live in work::types
// These types exist for backward compatibility with MCP tool parameter parsing

use serde::{Deserialize, Serialize};

// Re-export from work types for convenience
pub use crate::commands::work::types::{
    WorkspaceSession, WorkspaceArtifact, WorkspaceContext,
};

// ============================================================================
// Workspace (now a Project with project_type='workspace')
// These structs are used for MCP parameter parsing only.
// The actual storage is in the projects table.
// ============================================================================

/// Lightweight workspace summary for list views
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceSummary {
    pub id: String,
    #[serde(alias = "name")]
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub status: String,
    #[serde(default)]
    pub owner: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub intent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub initiative_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

/// Full workspace with nested data — now backed by Project
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    #[serde(alias = "name")]
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub status: String,
    #[serde(default)]
    pub owner: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub intent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub initiative_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    // Nested data (from joins)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sessions: Option<Vec<WorkspaceSession>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artifacts: Option<Vec<WorkspaceArtifact>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<WorkspaceContext>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateWorkspace {
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    pub owner: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub intent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub initiative_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UpdateWorkspace {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub intent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub initiative_id: Option<String>,
}

// ============================================================================
// Session/Artifact/Context create/update types for MCP param parsing
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateWorkspaceSession {
    /// Accept either workspace_id or project_id
    #[serde(alias = "project_id")]
    pub workspace_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decisions: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_steps: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub open_questions: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conversation_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateWorkspaceSession {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decisions: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_steps: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub open_questions: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conversation_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateWorkspaceArtifact {
    /// Accept either workspace_id or project_id
    #[serde(alias = "project_id")]
    pub workspace_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(rename = "type")]
    pub artifact_type: String,
    pub reference: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpsertWorkspaceContext {
    /// Accept either workspace_id or project_id
    #[serde(alias = "project_id")]
    pub workspace_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_state: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key_decisions: Option<serde_json::Value>,
}
