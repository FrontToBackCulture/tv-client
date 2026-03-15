// CRM Module - Deal Commands
// Now thin wrappers around the unified projects table (project_type='deal')

use super::types::*;
use crate::commands::error::{CmdResult, CommandError};
use crate::commands::supabase::get_client;
use crate::commands::work::types::{
    CreateProject, Project, UpdateProject, PipelineStats,
};

/// Convert a Project to a Deal for backward compatibility
fn project_to_deal(p: &Project) -> Deal {
    Deal {
        id: p.id.clone(),
        company_id: p.company_id.clone().unwrap_or_default(),
        name: p.name.clone(),
        description: p.description.clone(),
        stage: p.deal_stage.clone(),
        solution: p.deal_solution.clone(),
        value: p.deal_value,
        currency: p.deal_currency.clone(),
        expected_close_date: p.deal_expected_close.clone(),
        actual_close_date: p.deal_actual_close.clone(),
        lost_reason: p.deal_lost_reason.clone(),
        won_notes: p.deal_won_notes.clone(),
        proposal_path: p.deal_proposal_path.clone(),
        order_form_path: p.deal_order_form_path.clone(),
        contact_ids: p.deal_contact_ids.clone(),
        notes: p.deal_notes.clone(),
        tags: p.deal_tags.clone(),
        stage_changed_at: p.deal_stage_changed_at.clone(),
        stale_snoozed_until: p.deal_stale_snoozed_until.clone(),
        created_at: p.created_at.clone(),
        updated_at: p.updated_at.clone(),
        company: p.company.as_ref().map(|c| Box::new(super::types::Company {
            id: c.id.clone(),
            name: c.name.clone(),
            display_name: c.display_name.clone(),
            industry: c.industry.clone(),
            website: c.website.clone(),
            stage: c.stage.clone(),
            source: None,
            source_id: None,
            client_folder_path: None,
            domain_id: None,
            notes: None,
            tags: None,
            created_at: None,
            updated_at: None,
            referred_by: c.referred_by.clone(),
            contacts: None,
            deals: None,
            activities: None,
        })),
        contacts: None,
    }
}

/// List deals with optional filters (queries projects table)
#[tauri::command]
pub async fn crm_list_deals(
    company_id: Option<String>,
    stage: Option<String>,
) -> CmdResult<Vec<Deal>> {
    let client = get_client().await?;

    let mut filters = vec![
        "select=*,company:crm_companies(id,name,display_name,referred_by)".to_string(),
        "project_type=eq.deal".to_string(),
        "archived_at=is.null".to_string(),
    ];

    if let Some(cid) = company_id {
        filters.push(format!("company_id=eq.{}", cid));
    }
    if let Some(st) = stage {
        filters.push(format!("deal_stage=eq.{}", st));
    }

    filters.push("order=updated_at.desc".to_string());

    let query = filters.join("&");
    let projects: Vec<Project> = client.select("projects", &query).await?;
    Ok(projects.iter().map(project_to_deal).collect())
}

/// Get a single deal by ID
#[tauri::command]
pub async fn crm_get_deal(deal_id: String, include_relations: Option<bool>) -> CmdResult<Deal> {
    let client = get_client().await?;

    let query = if include_relations.unwrap_or(false) {
        format!(
            "select=*,company:crm_companies(*),contacts:crm_contacts(*)&id=eq.{}",
            deal_id
        )
    } else {
        format!("select=*,company:crm_companies(id,name,display_name,referred_by)&id=eq.{}", deal_id)
    };

    let project: Project = client
        .select_single("projects", &query)
        .await?
        .ok_or_else(|| CommandError::NotFound(format!("Deal not found: {}", deal_id)))?;

    Ok(project_to_deal(&project))
}

/// Create a new deal (creates a project with project_type='deal')
#[tauri::command]
pub async fn crm_create_deal(data: CreateDeal) -> CmdResult<Deal> {
    let create_data = CreateProject {
        name: data.name,
        description: data.description,
        project_type: Some("deal".to_string()),
        company_id: Some(data.company_id),
        deal_stage: data.stage,
        deal_solution: data.solution,
        deal_value: data.value,
        deal_currency: data.currency,
        deal_expected_close: data.expected_close_date,
        deal_notes: data.notes,
        ..Default::default()
    };

    let project = crate::commands::work::work_create_project(create_data).await?;
    Ok(project_to_deal(&project))
}

/// Update a deal
#[tauri::command]
pub async fn crm_update_deal(deal_id: String, data: UpdateDeal) -> CmdResult<Deal> {
    let update_data = UpdateProject {
        name: data.name,
        description: data.description,
        deal_stage: data.stage,
        deal_solution: data.solution,
        deal_value: data.value,
        deal_expected_close: data.expected_close_date,
        deal_actual_close: data.actual_close_date,
        deal_lost_reason: data.lost_reason,
        deal_won_notes: data.won_notes,
        deal_proposal_path: data.proposal_path,
        deal_order_form_path: data.order_form_path,
        deal_notes: data.notes,
        deal_stage_changed_at: data.stage_changed_at,
        preserve_stage_date: data.preserve_stage_date,
        ..Default::default()
    };

    let project = crate::commands::work::work_update_project(deal_id, update_data).await?;
    Ok(project_to_deal(&project))
}

/// Delete a deal
#[tauri::command]
pub async fn crm_delete_deal(deal_id: String) -> CmdResult<()> {
    crate::commands::work::work_delete_project(deal_id).await
}

/// Get pipeline statistics (delegates to work module)
#[tauri::command]
pub async fn crm_get_pipeline() -> CmdResult<PipelineStats> {
    crate::commands::work::work_get_pipeline().await
}

/// Link a task to a deal via the junction table (delegates to work module)
#[tauri::command]
pub async fn crm_link_task_to_deal(task_id: String, deal_id: String) -> CmdResult<serde_json::Value> {
    crate::commands::work::work_link_task_to_deal(task_id, deal_id).await
}
