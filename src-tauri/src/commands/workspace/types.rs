// Workspace Module Types
// Data structures for workspaces, sessions, artifacts, and context

use serde::{Deserialize, Serialize};

// ============================================================================
// Workspaces
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub status: String, // open | active | in_progress | done | paused
    pub owner: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub intent: Option<String>, // skill_review | skill_creation | feature_build
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
// Workspace Sessions
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceSession {
    pub id: String,
    pub workspace_id: String,
    pub date: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decisions: Option<serde_json::Value>, // jsonb array of {decision, rationale}
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_steps: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub open_questions: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conversation_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateWorkspaceSession {
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

// ============================================================================
// Workspace Artifacts
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceArtifact {
    pub id: String,
    pub workspace_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(rename = "type")]
    pub artifact_type: String, // skill | doc | crm_deal | crm_company | task | domain | code | report | proposal | order_form | other
    pub reference: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateWorkspaceArtifact {
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

// ============================================================================
// Workspace Context (rolling summary for cold-start)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceContext {
    pub workspace_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_state: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key_decisions: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpsertWorkspaceContext {
    pub workspace_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_state: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key_decisions: Option<serde_json::Value>,
}
