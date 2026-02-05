// CRM Module Types
// Data structures for companies, contacts, deals, activities

use serde::{Deserialize, Serialize};

// ============================================================================
// Companies
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Company {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub industry: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub website: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stage: Option<String>, // prospect | opportunity | client | churned | partner
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>, // apollo | inbound | referral | manual | existing
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_folder_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    // Nested data (from joins)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contacts: Option<Vec<Contact>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deals: Option<Vec<Deal>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub activities: Option<Vec<Activity>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateCompany {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub industry: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub website: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stage: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UpdateCompany {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub industry: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub website: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stage: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_folder_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
}

// ============================================================================
// Contacts
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Contact {
    pub id: String,
    pub company_id: String,
    pub name: String,
    pub email: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phone: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub department: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_primary: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_active: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub linkedin_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    // Nested data
    #[serde(skip_serializing_if = "Option::is_none")]
    pub company: Option<Box<Company>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateContact {
    pub company_id: String,
    pub name: String,
    pub email: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phone: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub department: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_primary: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub linkedin_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UpdateContact {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phone: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub department: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_primary: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_active: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub linkedin_url: Option<String>,
}

// ============================================================================
// Deals
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Deal {
    pub id: String,
    pub company_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stage: Option<String>, // prospect | lead | qualified | pilot | proposal | negotiation | won | lost
    #[serde(skip_serializing_if = "Option::is_none")]
    pub solution: Option<String>, // ar_automation | free_invoice_scan | analytics | revenue_reconciliation | other
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub currency: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expected_close_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actual_close_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lost_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub won_notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proposal_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order_form_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contact_ids: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stage_changed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stale_snoozed_until: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    // Nested data
    #[serde(skip_serializing_if = "Option::is_none")]
    pub company: Option<Box<Company>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contacts: Option<Vec<Contact>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateDeal {
    pub company_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stage: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub solution: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub currency: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expected_close_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UpdateDeal {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stage: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub solution: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expected_close_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actual_close_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lost_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub won_notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proposal_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order_form_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    /// Manually set stage_changed_at (use with preserve_stage_date to override automatic update)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stage_changed_at: Option<String>,
    /// If true, don't update stage_changed_at when stage changes (preserves days-in-stage counter)
    #[serde(skip_serializing)]
    pub preserve_stage_date: Option<bool>,
}

// ============================================================================
// Activities
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Activity {
    pub id: String,
    pub company_id: String,
    #[serde(rename = "type")]
    pub activity_type: String, // email | note | meeting | call | task | stage_change
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contact_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deal_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub activity_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateActivity {
    pub company_id: String,
    #[serde(rename = "type")]
    pub activity_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contact_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deal_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub activity_date: Option<String>,
}

// ============================================================================
// Email Links
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailCompanyLink {
    pub id: String,
    pub email_id: String,
    pub company_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contact_id: Option<String>,
    pub match_type: String, // contact_email | domain | manual
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    // Nested data
    #[serde(skip_serializing_if = "Option::is_none")]
    pub company: Option<Box<Company>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkEmailRequest {
    pub email_id: String,
    pub company_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contact_id: Option<String>,
    pub match_type: String,
}

// ============================================================================
// Pipeline Stats
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineStage {
    pub stage: String,
    pub count: i32,
    pub value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineStats {
    pub by_stage: Vec<PipelineStage>,
    pub total_value: f64,
    pub total_deals: i32,
}
