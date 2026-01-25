// CRM Module - Activity and Email Link Commands

use super::types::*;
use crate::commands::supabase::get_client;

/// List activities with optional filters
#[tauri::command]
pub async fn crm_list_activities(
    company_id: Option<String>,
    deal_id: Option<String>,
    activity_type: Option<String>,
    limit: Option<i32>,
) -> Result<Vec<Activity>, String> {
    let client = get_client().await?;

    let mut filters = vec![];

    if let Some(cid) = company_id {
        filters.push(format!("company_id=eq.{}", cid));
    }
    if let Some(did) = deal_id {
        filters.push(format!("deal_id=eq.{}", did));
    }
    if let Some(t) = activity_type {
        filters.push(format!("type=eq.{}", t));
    }

    let limit_val = limit.unwrap_or(50);
    filters.push(format!("limit={}", limit_val));
    filters.push("order=activity_date.desc".to_string());

    let query = filters.join("&");
    client.select("crm_activities", &query).await
}

/// Log an activity (note, call, meeting, etc.)
#[tauri::command]
pub async fn crm_log_activity(data: CreateActivity) -> Result<Activity, String> {
    let client = get_client().await?;

    // Set activity_date if not provided
    let mut insert_data = serde_json::to_value(&data).map_err(|e| e.to_string())?;
    if let Some(obj) = insert_data.as_object_mut() {
        if obj.get("activity_date").map_or(true, |v| v.is_null()) {
            obj.insert(
                "activity_date".to_string(),
                serde_json::Value::String(chrono::Utc::now().to_rfc3339()),
            );
        }
    }

    // Create the activity
    let activity: Activity = client.insert("crm_activities", &insert_data).await?;

    // Update company's updated_at
    let now = chrono::Utc::now().to_rfc3339();
    let company_update = serde_json::json!({ "updated_at": now });
    let _: Company = client
        .update("crm_companies", &format!("id=eq.{}", data.company_id), &company_update)
        .await?;

    Ok(activity)
}

/// Delete an activity
#[tauri::command]
pub async fn crm_delete_activity(activity_id: String) -> Result<(), String> {
    let client = get_client().await?;

    let query = format!("id=eq.{}", activity_id);
    client.delete("crm_activities", &query).await
}

// ============================================================================
// Email Linking
// ============================================================================

/// Get email-company link for an email
#[tauri::command]
pub async fn crm_get_email_link(email_id: String) -> Result<Option<EmailCompanyLink>, String> {
    let client = get_client().await?;

    let query = format!(
        "select=*,company:crm_companies(*)&email_id=eq.{}",
        email_id
    );

    client.select_single("crm_email_company_links", &query).await
}

/// Link an email to a company
#[tauri::command]
pub async fn crm_link_email(data: LinkEmailRequest) -> Result<EmailCompanyLink, String> {
    let client = get_client().await?;

    // Check if link already exists
    let existing: Option<EmailCompanyLink> = client
        .select_single(
            "crm_email_company_links",
            &format!("email_id=eq.{}", data.email_id),
        )
        .await?;

    if existing.is_some() {
        return Err("Email is already linked to a company".to_string());
    }

    // Create the link
    let link: EmailCompanyLink = client.insert("crm_email_company_links", &data).await?;

    // Create activity for the email
    let activity = serde_json::json!({
        "company_id": data.company_id,
        "contact_id": data.contact_id,
        "type": "email",
        "email_id": data.email_id,
        "activity_date": chrono::Utc::now().to_rfc3339()
    });
    let _: Activity = client.insert("crm_activities", &activity).await?;

    // Update company's updated_at
    let now = chrono::Utc::now().to_rfc3339();
    let company_update = serde_json::json!({ "updated_at": now });
    let _: Company = client
        .update("crm_companies", &format!("id=eq.{}", data.company_id), &company_update)
        .await?;

    Ok(link)
}

/// Unlink an email from a company
#[tauri::command]
pub async fn crm_unlink_email(email_id: String, company_id: String) -> Result<(), String> {
    let client = get_client().await?;

    let query = format!("email_id=eq.{}&company_id=eq.{}", email_id, company_id);
    client.delete("crm_email_company_links", &query).await
}

/// Auto-link email by matching sender/recipients to contacts or domains
#[tauri::command]
pub async fn crm_auto_link_email(
    email_id: String,
    sender_email: String,
    recipient_emails: Option<Vec<String>>,
) -> Result<Option<EmailCompanyLink>, String> {
    let client = get_client().await?;

    // Check if already linked
    let existing: Option<EmailCompanyLink> = client
        .select_single(
            "crm_email_company_links",
            &format!("email_id=eq.{}", email_id),
        )
        .await?;

    if existing.is_some() {
        return Ok(existing);
    }

    // Strategy 1: Match sender email to contact
    let sender_lower = sender_email.to_lowercase();
    let sender_contact: Option<Contact> = client
        .select_single("crm_contacts", &format!("email=eq.{}", sender_lower))
        .await?;

    if let Some(contact) = sender_contact {
        let link_data = LinkEmailRequest {
            email_id: email_id.clone(),
            company_id: contact.company_id.clone(),
            contact_id: Some(contact.id),
            match_type: "contact_email".to_string(),
        };
        return Ok(Some(crm_link_email(link_data).await?));
    }

    // Strategy 2: Match recipient emails to contacts
    if let Some(recipients) = recipient_emails {
        for recipient in recipients {
            let recipient_lower = recipient.to_lowercase();
            let recipient_contact: Option<Contact> = client
                .select_single("crm_contacts", &format!("email=eq.{}", recipient_lower))
                .await?;

            if let Some(contact) = recipient_contact {
                let link_data = LinkEmailRequest {
                    email_id: email_id.clone(),
                    company_id: contact.company_id.clone(),
                    contact_id: Some(contact.id),
                    match_type: "contact_email".to_string(),
                };
                return Ok(Some(crm_link_email(link_data).await?));
            }
        }
    }

    // Strategy 3: Match sender domain to company website
    let sender_domain = extract_domain(&sender_email);
    if let Some(domain) = sender_domain {
        // Skip common email providers
        let skip_domains = [
            "gmail.com", "outlook.com", "hotmail.com", "yahoo.com",
            "icloud.com", "me.com", "live.com", "msn.com",
        ];

        if !skip_domains.contains(&domain.as_str()) {
            // Search for company with matching website domain
            let companies: Vec<Company> = client
                .select("crm_companies", &format!("website.ilike.*{}*&limit=1", domain))
                .await?;

            if let Some(company) = companies.into_iter().next() {
                let link_data = LinkEmailRequest {
                    email_id: email_id.clone(),
                    company_id: company.id,
                    contact_id: None,
                    match_type: "domain".to_string(),
                };
                return Ok(Some(crm_link_email(link_data).await?));
            }
        }
    }

    // No match found
    Ok(None)
}

/// Extract domain from email address
fn extract_domain(email: &str) -> Option<String> {
    email.split('@').nth(1).map(|d| d.to_lowercase())
}
