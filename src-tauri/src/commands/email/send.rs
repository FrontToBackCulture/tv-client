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
const S3_BUCKET: &str = "production.thinkval.static";
const S3_REGION: &str = "ap-southeast-1";

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

/// Build an S3 client from stored credentials
fn build_s3_client(access_key: &str, secret_key: &str) -> aws_sdk_s3::Client {
    let creds = aws_sdk_s3::config::Credentials::new(access_key, secret_key, None, None, "tv-client-settings");
    let config = aws_sdk_s3::Config::builder()
        .behavior_version(aws_sdk_s3::config::BehaviorVersion::latest())
        .region(aws_sdk_s3::config::Region::new(S3_REGION))
        .credentials_provider(creds)
        .build();
    aws_sdk_s3::Client::from_conf(config)
}

// ── Types ──────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct Campaign {
    id: String,
    subject: String,
    from_name: String,
    from_email: String,
    html_body: Option<String>,
    content_path: Option<String>,
    report_path: Option<String>,
    report_url: Option<String>,
    bcc_email: Option<String>,
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

// ── S3 report upload ─────────────────────────────────────────────

/// Upload a report file to S3 with a UUID-based path and return the public URL
async fn upload_report_to_s3(
    s3: &aws_sdk_s3::Client,
    report_path: &str,
    knowledge_path: &str,
    campaign_id: &str,
) -> CmdResult<String> {
    let full_path = std::path::Path::new(knowledge_path).join(report_path);
    let content = std::fs::read_to_string(&full_path)
        .map_err(|e| CommandError::Internal(format!(
            "Failed to read report file {}: {}", full_path.display(), e
        )))?;

    // Generate unguessable S3 key: reports/{campaign_id}/{random}/report.html
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    chrono::Utc::now().timestamp_nanos_opt().hash(&mut hasher);
    campaign_id.hash(&mut hasher);
    report_path.hash(&mut hasher);
    let uuid = format!("{:016x}", hasher.finish());
    let file_name = std::path::Path::new(report_path)
        .file_name()
        .and_then(|f| f.to_str())
        .unwrap_or("report.html");
    let s3_key = format!("email-reports/{}/{}/{}", campaign_id, uuid, file_name);

    s3.put_object()
        .bucket(S3_BUCKET)
        .key(&s3_key)
        .body(aws_sdk_s3::primitives::ByteStream::from(content.into_bytes()))
        .content_type("text/html; charset=utf-8")
        .cache_control("public, max-age=86400")
        .send()
        .await
        .map_err(|e| CommandError::Network(format!("S3 upload failed: {:?}", e)))?;

    let url = format!("https://s3.{}.amazonaws.com/{}/{}", S3_REGION, S3_BUCKET, s3_key);
    Ok(url)
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
    report_url: Option<&str>,
) -> String {
    let mut result = html.to_string();

    // Replace {{first_name}}
    let first_name = contact.first_name.as_deref().unwrap_or("there");
    result = result.replace("{{first_name}}", first_name);

    // Replace {{subject}} — templates use this in hero headings
    result = result.replace("{{subject}}", subject);

    // Replace {{report_url}} — link to the uploaded report
    if let Some(url) = report_url {
        result = result.replace("{{report_url}}", url);
    }

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
    report_url: Option<&str>,
) -> String {
    let mut result = html.to_string();
    result = result.replace("{{first_name}}", first_name);
    result = result.replace("{{subject}}", subject);
    result = result.replace("{{unsubscribe_url}}", "#unsubscribe");
    if let Some(url) = report_url {
        result = result.replace("{{report_url}}", url);
    } else {
        result = result.replace("{{report_url}}", "#report");
    }
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

// ── Upload report command ─────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct UploadReportResult {
    pub url: String,
}

#[command]
pub async fn email_upload_report(
    campaign_id: String,
    knowledge_path: String,
) -> CmdResult<UploadReportResult> {
    let settings = crate::commands::settings::load_settings()?;
    let access_key = settings
        .keys
        .get("aws_access_key_id")
        .ok_or_else(|| CommandError::Config("AWS Access Key ID not configured".into()))?;
    let secret_key = settings
        .keys
        .get("aws_secret_access_key")
        .ok_or_else(|| CommandError::Config("AWS Secret Access Key not configured".into()))?;

    let db = get_client().await?;

    // Fetch campaign to get report_path
    let campaign: Campaign = db
        .select_single::<Campaign>(
            "email_campaigns",
            &format!("id=eq.{}&select=*", campaign_id),
        )
        .await?
        .ok_or_else(|| CommandError::NotFound("Campaign not found".into()))?;

    let report_path = campaign
        .report_path
        .as_ref()
        .ok_or_else(|| CommandError::Internal("Campaign has no report_path set".into()))?;

    let s3 = build_s3_client(access_key, secret_key);
    let url = upload_report_to_s3(&s3, report_path, &knowledge_path, &campaign_id).await?;

    // Save report_url and upload timestamp to campaign
    let now = chrono::Utc::now().to_rfc3339();
    db.update::<serde_json::Value, serde_json::Value>(
        "email_campaigns",
        &format!("id=eq.{}", campaign_id),
        &serde_json::json!({ "report_url": url, "report_uploaded_at": now }),
    )
    .await?;

    Ok(UploadReportResult { url })
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

    // Use pre-uploaded report_url (uploaded via email_upload_report command)
    let report_url = campaign.report_url.clone();

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
            report_url.as_deref(),
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

// ── SES connection test ───────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct SesTestConnectionResult {
    pub success: bool,
    pub verified_email: Option<String>,
    pub send_result: Option<String>,
    pub error: Option<String>,
}

/// Test SES connectivity: verify credentials, check sender identity, optionally send a test email
#[command]
pub async fn email_test_ses_connection(
    test_email: Option<String>,
) -> CmdResult<SesTestConnectionResult> {
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

    // Step 1: Verify credentials by listing verified email identities
    let identities = ses
        .list_identities()
        .identity_type(aws_sdk_ses::types::IdentityType::EmailAddress)
        .send()
        .await
        .map_err(|e| CommandError::Network(format!("SES credential check failed: {}", e)))?;

    let verified_email = identities.identities().first().map(|s| s.to_string());

    // Step 2: If a test email was provided, send a simple test message
    let send_result = if let Some(ref to_email) = test_email {
        let from = verified_email.as_deref().unwrap_or("noreply@thinkval.com");
        let boundary = format!("----=_Part_{}", chrono::Utc::now().timestamp_millis());
        let raw_email = format!(
            "From: ThinkVAL <{}>\r\n\
             To: {}\r\n\
             Subject: [SES Test] Connection Verified\r\n\
             MIME-Version: 1.0\r\n\
             Content-Type: multipart/alternative; boundary=\"{}\"\r\n\
             \r\n\
             --{}\r\n\
             Content-Type: text/html; charset=UTF-8\r\n\
             Content-Transfer-Encoding: 7bit\r\n\
             \r\n\
             <html><body style=\"font-family:sans-serif;padding:24px\">\
             <h2 style=\"color:#18181b\">SES Connection Test</h2>\
             <p style=\"color:#52525b\">If you're reading this, your AWS SES configuration in tv-client is working correctly.</p>\
             <p style=\"color:#a1a1aa;font-size:12px\">Sent from tv-client settings</p>\
             </body></html>\r\n\
             \r\n\
             --{}--",
            from, to_email, boundary, boundary, boundary,
        );

        match ses
            .send_raw_email()
            .raw_message(
                RawMessage::builder()
                    .data(Blob::new(raw_email.as_bytes()))
                    .build()
                    .map_err(|e| CommandError::Internal(format!("Failed to build message: {}", e)))?,
            )
            .send()
            .await
        {
            Ok(output) => Some(format!("Sent! Message ID: {}", output.message_id())),
            Err(e) => {
                return Ok(SesTestConnectionResult {
                    success: false,
                    verified_email,
                    send_result: None,
                    error: Some(format!("Credentials OK but send failed: {}", e)),
                });
            }
        }
    } else {
        None
    };

    Ok(SesTestConnectionResult {
        success: true,
        verified_email,
        send_result,
        error: None,
    })
}

// ── Test send command ─────────────────────────────────────────────

#[command]
pub async fn email_send_test(
    campaign_id: String,
    test_email: String,
    _api_base_url: String,
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

    // Use pre-uploaded report_url
    let report_url = campaign.report_url.clone();

    // Replace tokens with test values (no tracking injection for test sends)
    let personalized = replace_tokens_preview(
        &html_body,
        "Test User",
        &campaign.subject,
        report_url.as_deref(),
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
        Err(e) => {
            let msg = if let Some(service_err) = e.as_service_error() {
                format!("SES: {}", service_err.meta().message().unwrap_or(&format!("{}", service_err)))
            } else {
                format!("SES error: {:?}", e)
            };
            Ok(SendTestResult { success: false, error: Some(msg) })
        }
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
    report_url: Option<&str>,
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
    let personalized = replace_tokens(html_body, contact, &event.id, campaign_id, api_base_url, &campaign.subject, report_url);

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
        .map_err(|e| {
            let msg = if let Some(service_err) = e.as_service_error() {
                format!("SES: {}", service_err.meta().message().unwrap_or(&format!("{}", service_err)))
            } else {
                format!("SES error: {:?}", e)
            };
            CommandError::Network(msg)
        })?;

    // Send untracked BCC copy (no open pixel, no click tracking, no event row)
    if let Some(bcc) = &campaign.bcc_email {
        if !bcc.is_empty() {
            let bcc_html = replace_tokens_preview(html_body, contact.first_name.as_deref().unwrap_or("there"), &campaign.subject, report_url);
            let bcc_boundary = format!("----=_Part_bcc_{}", chrono::Utc::now().timestamp_millis());
            let bcc_raw = format!(
                "From: {} <{}>\r\n\
                 To: {}\r\n\
                 Subject: {}\r\n\
                 X-Campaign-Id: {}\r\n\
                 X-BCC-Copy: true\r\n\
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
                bcc,
                campaign.subject,
                campaign_id,
                bcc_boundary,
                bcc_boundary,
                bcc_html,
                bcc_boundary,
            );
            // Best-effort: don't fail the main send if BCC fails
            let _ = ses.send_raw_email()
                .raw_message(
                    RawMessage::builder()
                        .data(Blob::new(bcc_raw.as_bytes()))
                        .build()
                        .unwrap(),
                )
                .send()
                .await;
        }
    }

    Ok(())
}
