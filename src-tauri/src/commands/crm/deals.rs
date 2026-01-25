// CRM Module - Deal Commands

use super::types::*;
use crate::commands::supabase::get_client;

/// List deals with optional filters
#[tauri::command]
pub async fn crm_list_deals(
    company_id: Option<String>,
    stage: Option<String>,
) -> Result<Vec<Deal>, String> {
    let client = get_client().await?;

    let mut filters = vec!["select=*,company:crm_companies(name,display_name)".to_string()];

    if let Some(cid) = company_id {
        filters.push(format!("company_id=eq.{}", cid));
    }
    if let Some(st) = stage {
        filters.push(format!("stage=eq.{}", st));
    }

    filters.push("order=updated_at.desc".to_string());

    let query = filters.join("&");
    client.select("crm_deals", &query).await
}

/// Get a single deal by ID
#[tauri::command]
pub async fn crm_get_deal(deal_id: String, include_relations: Option<bool>) -> Result<Deal, String> {
    let client = get_client().await?;

    let query = if include_relations.unwrap_or(false) {
        format!(
            "select=*,company:crm_companies(*),contacts:crm_contacts(*)&id=eq.{}",
            deal_id
        )
    } else {
        format!("select=*,company:crm_companies(name,display_name)&id=eq.{}", deal_id)
    };

    client
        .select_single("crm_deals", &query)
        .await?
        .ok_or_else(|| format!("Deal not found: {}", deal_id))
}

/// Create a new deal
#[tauri::command]
pub async fn crm_create_deal(data: CreateDeal) -> Result<Deal, String> {
    let client = get_client().await?;

    // Set defaults
    let mut insert_data = serde_json::to_value(&data).map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    if let Some(obj) = insert_data.as_object_mut() {
        if obj.get("stage").map_or(true, |v| v.is_null()) {
            obj.insert("stage".to_string(), serde_json::Value::String("prospect".to_string()));
        }
        if obj.get("currency").map_or(true, |v| v.is_null()) {
            obj.insert("currency".to_string(), serde_json::Value::String("SGD".to_string()));
        }
        obj.insert("stage_changed_at".to_string(), serde_json::Value::String(now));
    }

    // Create the deal
    let deal: Deal = client.insert("crm_deals", &insert_data).await?;

    // Check if company stage should be updated (prospect -> opportunity)
    let company: Company = client
        .select_single("crm_companies", &format!("id=eq.{}", data.company_id))
        .await?
        .ok_or("Company not found")?;

    if company.stage.as_deref() == Some("prospect") {
        let update_data = serde_json::json!({ "stage": "opportunity" });
        let _: Company = client
            .update("crm_companies", &format!("id=eq.{}", data.company_id), &update_data)
            .await?;

        // Log the stage change activity
        let activity = serde_json::json!({
            "company_id": data.company_id,
            "type": "stage_change",
            "old_value": "prospect",
            "new_value": "opportunity",
            "activity_date": chrono::Utc::now().to_rfc3339()
        });
        let _: Activity = client.insert("crm_activities", &activity).await?;
    }

    Ok(deal)
}

/// Update a deal
#[tauri::command]
pub async fn crm_update_deal(deal_id: String, data: UpdateDeal) -> Result<Deal, String> {
    let client = get_client().await?;

    // Get current deal for stage change detection
    let current: Deal = crm_get_deal(deal_id.clone(), None).await?;
    let now = chrono::Utc::now().to_rfc3339();

    // Build update data
    let mut update_data = serde_json::to_value(&data).map_err(|e| e.to_string())?;

    // Check if stage is changing
    if let Some(new_stage) = &data.stage {
        if let Some(old_stage) = &current.stage {
            if old_stage != new_stage {
                // Update stage_changed_at and clear stale_snoozed_until
                if let Some(obj) = update_data.as_object_mut() {
                    obj.insert("stage_changed_at".to_string(), serde_json::Value::String(now.clone()));
                    obj.insert("stale_snoozed_until".to_string(), serde_json::Value::Null);
                }

                // Log stage change activity
                let activity = serde_json::json!({
                    "company_id": current.company_id,
                    "deal_id": deal_id,
                    "type": "stage_change",
                    "old_value": old_stage,
                    "new_value": new_stage,
                    "activity_date": now
                });
                let _: Activity = client.insert("crm_activities", &activity).await?;

                // If deal is won, update company stage to client
                if new_stage == "won" {
                    let company_update = serde_json::json!({ "stage": "client" });
                    let _: Company = client
                        .update("crm_companies", &format!("id=eq.{}", current.company_id), &company_update)
                        .await?;

                    // Log company stage change
                    let company_activity = serde_json::json!({
                        "company_id": current.company_id,
                        "type": "stage_change",
                        "old_value": "opportunity",
                        "new_value": "client",
                        "activity_date": chrono::Utc::now().to_rfc3339()
                    });
                    let _: Activity = client.insert("crm_activities", &company_activity).await?;
                }
            }
        }
    }

    let query = format!("id=eq.{}", deal_id);
    client.update("crm_deals", &query, &update_data).await
}

/// Delete a deal
#[tauri::command]
pub async fn crm_delete_deal(deal_id: String) -> Result<(), String> {
    let client = get_client().await?;

    // Delete related activities first
    client.delete("crm_activities", &format!("deal_id=eq.{}", deal_id)).await?;

    // Delete the deal
    client.delete("crm_deals", &format!("id=eq.{}", deal_id)).await
}

/// Get pipeline statistics
#[tauri::command]
pub async fn crm_get_pipeline() -> Result<PipelineStats, String> {
    let client = get_client().await?;

    // Get all active deals (not won/lost)
    let deals: Vec<Deal> = client
        .select(
            "crm_deals",
            "stage=in.(lead,qualified,pilot,proposal,negotiation)&select=stage,value",
        )
        .await?;

    // Calculate stats by stage
    let stages = ["lead", "qualified", "pilot", "proposal", "negotiation"];
    let mut by_stage = Vec::new();
    let mut total_value = 0.0;
    let mut total_deals = 0;

    for stage in stages {
        let stage_deals: Vec<&Deal> = deals.iter().filter(|d| d.stage.as_deref() == Some(stage)).collect();
        let count = stage_deals.len() as i32;
        let value: f64 = stage_deals.iter().filter_map(|d| d.value).sum();

        by_stage.push(PipelineStage {
            stage: stage.to_string(),
            count,
            value,
        });

        total_deals += count;
        total_value += value;
    }

    Ok(PipelineStats {
        by_stage,
        total_value,
        total_deals,
    })
}
