// SES campaign sending engine
// Replaces the tv-api sendCampaign — runs entirely in-process via Tauri command.

use aws_sdk_ses::config::{BehaviorVersion, Credentials, Region};
use aws_sdk_ses::types::RawMessage;
use aws_sdk_ses::primitives::Blob;
use crate::commands::error::{CmdResult, CommandError};
use crate::commands::supabase::get_client;
use serde::{Deserialize, Serialize};
use tauri::command;

const SES_REGION: &str = "ap-southeast-1";

/// Build an SES client from stored credentials
fn build_ses_client(access_key: &str, secret_key: &str) -> aws_sdk_ses::Client {
    let creds = Credentials::new(access_key, secret_key, None, None, "tv-client-settings");
    let config = aws_sdk_ses::Config::builder()
        .behavior_version(BehaviorVersion::latest())
        .region(Region::new(SES_REGION))
        .credentials_provider(creds)
        .build();
    aws_sdk_ses::Client::from_conf(config)
}

// ── Types ──────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct Campaign {
    id: String,
    subject: String,
    from_name: String,
    from_email: String,
    html_body: Option<String>,
    content_path: Option<String>,
    group_id: Option<String>,
    status: String,
}

#[derive(Debug, Deserialize)]
struct Contact {
    id: String,
    email: String,
    first_name: Option<String>,
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ContactLink {
    email_contacts: Option<Contact>,
}

#[derive(Debug, Deserialize)]
struct EventRow {
    id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SendCampaignResult {
    pub sent: usize,
    pub failed: usize,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SendTestResult {
    pub success: bool,
    pub error: Option<String>,
}

// ── Resolve campaign HTML body ────────────────────────────────────

/// Get the HTML body for a campaign, reading from content_path file if set
fn resolve_html_body(campaign: &Campaign, knowledge_path: Option<&str>) -> CmdResult<String> {
    // If content_path is set, read from file
    if let Some(content_path) = &campaign.content_path {
        if let Some(kp) = knowledge_path {
            let full_path = std::path::Path::new(kp).join(content_path);
            match std::fs::read_to_string(&full_path) {
                Ok(content) => return Ok(content),
                Err(e) => {
                    eprintln!("Failed to read content_path {}: {}", full_path.display(), e);
                    // Fall through to html_body
                }
            }
        }
    }

    // Fall back to html_body stored in database
    campaign
        .html_body
        .clone()
        .ok_or_else(|| CommandError::Internal("Campaign has no HTML body or content file".into()))
}

// ── Token replacement ──────────────────────────────────────────────

fn replace_tokens(
    html: &str,
    contact: &Contact,
    event_id: &str,
    campaign_id: &str,
    api_base_url: &str,
    subject: &str,
) -> String {
    let mut result = html.to_string();

    // Replace {{first_name}}
    let first_name = contact.first_name.as_deref().unwrap_or("there");
    result = result.replace("{{first_name}}", first_name);

    // Replace {{subject}} — templates use this in hero headings
    result = result.replace("{{subject}}", subject);

    // Replace {{unsubscribe_url}}
    let unsub_url = format!(
        "{}/email/unsubscribe?cid={}&mid={}",
        api_base_url, contact.id, campaign_id
    );
    result = result.replace("{{unsubscribe_url}}", &unsub_url);

    // Inject open tracking pixel before </body>
    let open_pixel = format!(
        r#"<img src="{}/email/track/open?eid={}" width="1" height="1" style="display:none" alt="" />"#,
        api_base_url, event_id
    );
    if result.contains("</body>") {
        result = result.replace("</body>", &format!("{}</body>", open_pixel));
    } else {
        result.push_str(&open_pixel);
    }

    // Rewrite links for click tracking (skip unsubscribe links)
    result = rewrite_links(&result, event_id, api_base_url);

    result
}

/// Simple token replacement for preview (no tracking injection)
fn replace_tokens_preview(
    html: &str,
    first_name: &str,
    subject: &str,
) -> String {
    let mut result = html.to_string();
    result = result.replace("{{first_name}}", first_name);
    result = result.replace("{{subject}}", subject);
    result = result.replace("{{unsubscribe_url}}", "#unsubscribe");
    result
}

/// Rewrite href="https://..." links to go through click tracker
fn rewrite_links(html: &str, event_id: &str, api_base_url: &str) -> String {
    let re = regex::Regex::new(r#"href="(https?://[^"]+)""#).unwrap();
    re.replace_all(html, |caps: &regex::Captures| {
        let url = &caps[1];
        // Don't wrap unsubscribe links
        if url.contains("/email/unsubscribe") {
            return caps[0].to_string();
        }
        let encoded = urlencoding::encode(url);
        format!(
            r#"href="{}/email/track/click?eid={}&url={}""#,
            api_base_url, event_id, encoded
        )
    })
    .to_string()
}

// ── Main send command ─────────────────────────────────────────────

#[command]
pub async fn email_send_campaign(
    campaign_id: String,
    api_base_url: String,
    knowledge_path: Option<String>,
) -> CmdResult<SendCampaignResult> {
    // Load AWS credentials from settings
    let settings = crate::commands::settings::load_settings()?;
    let access_key = settings
        .keys
        .get("aws_access_key_id")
        .ok_or_else(|| CommandError::Config("AWS Access Key ID not configured".into()))?;
    let secret_key = settings
        .keys
        .get("aws_secret_access_key")
        .ok_or_else(|| CommandError::Config("AWS Secret Access Key not configured".into()))?;

    let ses = build_ses_client(access_key, secret_key);
    let db = get_client().await?;

    // Fetch campaign
    let campaign: Campaign = db
        .select_single::<Campaign>(
            "email_campaigns",
            &format!("id=eq.{}&select=*", campaign_id),
        )
        .await?
        .ok_or_else(|| CommandError::NotFound("Campaign not found".into()))?;

    if campaign.status != "draft" && campaign.status != "scheduled" {
        return Err(CommandError::Internal(format!(
            "Campaign is already {}",
            campaign.status
        )));
    }

    let html_body = resolve_html_body(&campaign, knowledge_path.as_deref())?;

    let group_id = campaign
        .group_id
        .as_ref()
        .ok_or_else(|| CommandError::Internal("Campaign has no target group".into()))?;

    // Update status to sending
    db.update::<serde_json::Value, serde_json::Value>(
        "email_campaigns",
        &format!("id=eq.{}", campaign_id),
        &serde_json::json!({ "status": "sending" }),
    )
    .await?;

    // Fetch active contacts in the target group
    let contact_links: Vec<ContactLink> = db
        .select(
            "email_contact_groups",
            &format!(
                "group_id=eq.{}&select=email_contacts(*)",
                group_id
            ),
        )
        .await?;

    let contacts: Vec<&Contact> = contact_links
        .iter()
        .filter_map(|link| link.email_contacts.as_ref())
        .filter(|c| c.email.contains('@')) // basic sanity
        .filter(|c| {
            let status = c.status.as_deref().unwrap_or("active");
            status == "active"
        })
        .collect();

    let mut sent = 0usize;
    let mut failed = 0usize;
    let mut errors: Vec<String> = Vec::new();

    for contact in &contacts {
        match send_to_contact(
            &ses,
            &db,
            &campaign,
            &html_body,
            contact,
            &campaign_id,
            &api_base_url,
        )
        .await
        {
            Ok(()) => sent += 1,
            Err(e) => {
                errors.push(format!("{}: {}", contact.email, e));
                failed += 1;
            }
        }

        // Small delay to respect SES rate limits (14/sec)
        tokio::time::sleep(std::time::Duration::from_millis(75)).await;
    }

    // Update campaign status based on results
    let now = chrono::Utc::now().to_rfc3339();
    let new_status = if failed == 0 { "sent" } else if sent == 0 { "failed" } else { "partial" };
    db.update::<serde_json::Value, serde_json::Value>(
        "email_campaigns",
        &format!("id=eq.{}", campaign_id),
        &serde_json::json!({ "status": new_status, "sent_at": now }),
    )
    .await?;

    Ok(SendCampaignResult {
        sent,
        failed,
        errors,
    })
}

// ── Test send command ─────────────────────────────────────────────

#[command]
pub async fn email_send_test(
    campaign_id: String,
    test_email: String,
    api_base_url: String,
    knowledge_path: Option<String>,
) -> CmdResult<SendTestResult> {
    // Load AWS credentials from settings
    let settings = crate::commands::settings::load_settings()?;
    let access_key = settings
        .keys
        .get("aws_access_key_id")
        .ok_or_else(|| CommandError::Config("AWS Access Key ID not configured".into()))?;
    let secret_key = settings
        .keys
        .get("aws_secret_access_key")
        .ok_or_else(|| CommandError::Config("AWS Secret Access Key not configured".into()))?;

    let ses = build_ses_client(access_key, secret_key);
    let db = get_client().await?;

    // Fetch campaign
    let campaign: Campaign = db
        .select_single::<Campaign>(
            "email_campaigns",
            &format!("id=eq.{}&select=*", campaign_id),
        )
        .await?
        .ok_or_else(|| CommandError::NotFound("Campaign not found".into()))?;

    let html_body = resolve_html_body(&campaign, knowledge_path.as_deref())?;

    // Replace tokens with test values (no tracking injection for test sends)
    let personalized = replace_tokens_preview(
        &html_body,
        "Test User",
        &campaign.subject,
    );

    // Build raw MIME email
    let boundary = format!("----=_Part_{}", chrono::Utc::now().timestamp_millis());
    let subject = format!("[TEST] {}", campaign.subject);
    let raw_email = format!(
        "From: {} <{}>\r\n\
         To: {}\r\n\
         Subject: {}\r\n\
         MIME-Version: 1.0\r\n\
         Content-Type: multipart/alternative; boundary=\"{}\"\r\n\
         \r\n\
         --{}\r\n\
         Content-Type: text/html; charset=UTF-8\r\n\
         Content-Transfer-Encoding: 7bit\r\n\
         \r\n\
         {}\r\n\
         \r\n\
         --{}--",
        campaign.from_name,
        campaign.from_email,
        test_email,
        subject,
        boundary,
        boundary,
        personalized,
        boundary,
    );

    // Send via SES
    match ses.send_raw_email()
        .raw_message(
            RawMessage::builder()
                .data(Blob::new(raw_email.as_bytes()))
                .build()
                .map_err(|e| CommandError::Internal(format!("Failed to build raw message: {}", e)))?,
        )
        .send()
        .await
    {
        Ok(_) => Ok(SendTestResult { success: true, error: None }),
        Err(e) => Ok(SendTestResult { success: false, error: Some(format!("SES error: {}", e)) }),
    }
}

/// Send a single email to one contact
async fn send_to_contact(
    ses: &aws_sdk_ses::Client,
    db: &crate::commands::supabase::SupabaseClient,
    campaign: &Campaign,
    html_body: &str,
    contact: &Contact,
    campaign_id: &str,
    api_base_url: &str,
) -> CmdResult<()> {
    // Create sent event (need the ID for tracking URLs)
    let event: EventRow = db
        .insert(
            "email_events",
            &serde_json::json!({
                "campaign_id": campaign_id,
                "contact_id": contact.id,
                "event_type": "sent",
            }),
        )
        .await?;

    // Replace tokens in HTML
    let personalized = replace_tokens(html_body, contact, &event.id, campaign_id, api_base_url, &campaign.subject);

    // Build raw MIME email with X-Campaign-Id header
    let boundary = format!("----=_Part_{}", chrono::Utc::now().timestamp_millis());
    let raw_email = format!(
        "From: {} <{}>\r\n\
         To: {}\r\n\
         Subject: {}\r\n\
         X-Campaign-Id: {}\r\n\
         MIME-Version: 1.0\r\n\
         Content-Type: multipart/alternative; boundary=\"{}\"\r\n\
         \r\n\
         --{}\r\n\
         Content-Type: text/html; charset=UTF-8\r\n\
         Content-Transfer-Encoding: 7bit\r\n\
         \r\n\
         {}\r\n\
         \r\n\
         --{}--",
        campaign.from_name,
        campaign.from_email,
        contact.email,
        campaign.subject,
        campaign_id,
        boundary,
        boundary,
        personalized,
        boundary,
    );

    // Send via SES
    ses.send_raw_email()
        .raw_message(
            RawMessage::builder()
                .data(Blob::new(raw_email.as_bytes()))
                .build()
                .map_err(|e| CommandError::Internal(format!("Failed to build raw message: {}", e)))?,
        )
        .send()
        .await
        .map_err(|e| CommandError::Network(format!("SES error: {}", e)))?;

    Ok(())
}
