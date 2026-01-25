// CRM Module - Company Commands

use super::types::*;
use crate::commands::supabase::get_client;

/// List companies with optional filters
#[tauri::command]
pub async fn crm_list_companies(
    search: Option<String>,
    stage: Option<String>,
    industry: Option<String>,
    limit: Option<i32>,
) -> Result<Vec<Company>, String> {
    let client = get_client().await?;

    let mut filters = vec![];

    if let Some(s) = search {
        // Search in name or display_name
        filters.push(format!("or=(name.ilike.*{}*,display_name.ilike.*{}*)", s, s));
    }
    if let Some(st) = stage {
        filters.push(format!("stage=eq.{}", st));
    }
    if let Some(ind) = industry {
        filters.push(format!("industry=eq.{}", ind));
    }

    let limit_val = limit.unwrap_or(50);
    filters.push(format!("limit={}", limit_val));
    filters.push("order=updated_at.desc".to_string());

    let query = filters.join("&");
    client.select("crm_companies", &query).await
}

/// Find company by name or domain (fuzzy search)
#[tauri::command]
pub async fn crm_find_company(
    name: Option<String>,
    domain: Option<String>,
) -> Result<Option<Company>, String> {
    let client = get_client().await?;

    if let Some(n) = name {
        // Search by name (case-insensitive)
        let query = format!("or=(name.ilike.*{}*,display_name.ilike.*{}*)&limit=1", n, n);
        return client.select_single("crm_companies", &query).await;
    }

    if let Some(d) = domain {
        // Search by website domain
        let query = format!("website.ilike.*{}*&limit=1", d);
        return client.select_single("crm_companies", &query).await;
    }

    Ok(None)
}

/// Get a single company by ID with optional relations
#[tauri::command]
pub async fn crm_get_company(company_id: String, include_relations: Option<bool>) -> Result<Company, String> {
    let client = get_client().await?;

    let query = if include_relations.unwrap_or(false) {
        format!(
            "select=*,contacts:crm_contacts(*),deals:crm_deals(*),activities:crm_activities(*)&id=eq.{}",
            company_id
        )
    } else {
        format!("id=eq.{}", company_id)
    };

    client
        .select_single("crm_companies", &query)
        .await?
        .ok_or_else(|| format!("Company not found: {}", company_id))
}

/// Create a new company
#[tauri::command]
pub async fn crm_create_company(data: CreateCompany) -> Result<Company, String> {
    let client = get_client().await?;

    // Set default stage if not provided
    let mut insert_data = serde_json::to_value(&data).map_err(|e| e.to_string())?;
    if let Some(obj) = insert_data.as_object_mut() {
        if obj.get("stage").map_or(true, |v| v.is_null()) {
            obj.insert("stage".to_string(), serde_json::Value::String("prospect".to_string()));
        }
        if obj.get("source").map_or(true, |v| v.is_null()) {
            obj.insert("source".to_string(), serde_json::Value::String("manual".to_string()));
        }
    }

    client.insert("crm_companies", &insert_data).await
}

/// Update a company
#[tauri::command]
pub async fn crm_update_company(company_id: String, data: UpdateCompany) -> Result<Company, String> {
    let client = get_client().await?;

    // Check if stage is changing for activity logging
    if let Some(new_stage) = &data.stage {
        let current: Company = crm_get_company(company_id.clone(), None).await?;
        if let Some(old_stage) = &current.stage {
            if old_stage != new_stage {
                // Create stage_change activity
                let activity = serde_json::json!({
                    "company_id": company_id,
                    "type": "stage_change",
                    "old_value": old_stage,
                    "new_value": new_stage,
                    "activity_date": chrono::Utc::now().to_rfc3339()
                });
                let _: Activity = client.insert("crm_activities", &activity).await?;
            }
        }
    }

    let query = format!("id=eq.{}", company_id);
    client.update("crm_companies", &query, &data).await
}

/// Delete a company and all related records
#[tauri::command]
pub async fn crm_delete_company(company_id: String) -> Result<(), String> {
    let client = get_client().await?;

    // Delete in order: activities, email_links, deals, contacts, company
    client.delete("crm_activities", &format!("company_id=eq.{}", company_id)).await?;
    client.delete("crm_email_company_links", &format!("company_id=eq.{}", company_id)).await?;
    client.delete("crm_deals", &format!("company_id=eq.{}", company_id)).await?;
    client.delete("crm_contacts", &format!("company_id=eq.{}", company_id)).await?;
    client.delete("crm_companies", &format!("id=eq.{}", company_id)).await
}
