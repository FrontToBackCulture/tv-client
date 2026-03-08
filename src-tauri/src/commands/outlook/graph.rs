// MS Graph API HTTP client
// All Graph API calls go through this module

use super::auth;
use super::types::*;
use crate::commands::error::{CmdResult, CommandError};

const GRAPH_BASE: &str = "https://graph.microsoft.com/v1.0";

pub struct GraphClient {
    client: reqwest::Client,
}

impl GraphClient {
    pub fn new() -> Self {
        Self {
            client: crate::HTTP_CLIENT.clone(),
        }
    }

    async fn get_token(&self) -> CmdResult<String> {
        auth::get_valid_token().await
    }

    // ========================================================================
    // Folders
    // ========================================================================

    pub async fn list_folders(&self) -> CmdResult<Vec<GraphFolder>> {
        let token = self.get_token().await?;
        let url = format!("{}/me/mailFolders?$top=100", GRAPH_BASE);

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(CommandError::Http { status: status.as_u16(), body });
        }

        let data: GraphFolderList = response
            .json()
            .await
            .map_err(|e| CommandError::Parse(format!("Failed to parse folders: {}", e)))?;

        Ok(data.value)
    }

    // ========================================================================
    // Messages
    // ========================================================================

    /// Fetch messages with pagination. Returns all messages up to max_count.
    pub async fn fetch_messages(
        &self,
        max_count: usize,
        filter: Option<&str>,
    ) -> CmdResult<Vec<GraphMessage>> {
        let token = self.get_token().await?;

        let select = "id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,importance,isRead,hasAttachments,bodyPreview,parentFolderId,categories";
        let mut url = format!(
            "{}/me/messages?$top=100&$orderby=receivedDateTime%20desc&$select={}",
            GRAPH_BASE, select,
        );

        if let Some(f) = filter {
            url.push_str(&format!("&$filter={}", urlencoding::encode(f)));
        }

        let mut all_messages = Vec::new();

        loop {
            let response = self
                .client
                .get(&url)
                .header("Authorization", format!("Bearer {}", token))
                .send()
                .await?;

            if !response.status().is_success() {
                let status = response.status();
                let body = response.text().await.unwrap_or_default();
                return Err(CommandError::Http { status: status.as_u16(), body });
            }

            let data: GraphMessageList = response
                .json()
                .await
                .map_err(|e| CommandError::Parse(format!("Failed to parse messages: {}", e)))?;

            all_messages.extend(data.value);

            if all_messages.len() >= max_count {
                all_messages.truncate(max_count);
                break;
            }

            match data.next_link {
                Some(next) => url = next,
                None => break,
            }
        }

        Ok(all_messages)
    }

    /// Delta query for incremental sync
    #[allow(dead_code)]
    pub async fn delta_messages(
        &self,
        delta_link: Option<&str>,
    ) -> CmdResult<(Vec<GraphMessage>, Option<String>)> {
        let token = self.get_token().await?;

        let select = "id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,importance,isRead,hasAttachments,bodyPreview,parentFolderId,categories";

        let mut url = match delta_link {
            Some(link) => link.to_string(),
            None => format!(
                "{}/me/messages/delta?$top=100&$select={}",
                GRAPH_BASE, select,
            ),
        };

        let mut all_messages = Vec::new();
        let mut final_delta_link = None;

        loop {
            let response = self
                .client
                .get(&url)
                .header("Authorization", format!("Bearer {}", token))
                .send()
                .await?;

            if !response.status().is_success() {
                let status = response.status();
                let body = response.text().await.unwrap_or_default();
                return Err(CommandError::Http { status: status.as_u16(), body });
            }

            let data: GraphMessageList = response
                .json()
                .await
                .map_err(|e| CommandError::Parse(format!("Failed to parse delta: {}", e)))?;

            all_messages.extend(data.value);

            if let Some(dl) = data.delta_link {
                final_delta_link = Some(dl);
                break;
            }

            match data.next_link {
                Some(next) => url = next,
                None => break,
            }
        }

        Ok((all_messages, final_delta_link))
    }

    /// Fetch a single message body (lazy load)
    pub async fn fetch_message_body(&self, message_id: &str) -> CmdResult<GraphBody> {
        let token = self.get_token().await?;
        let url = format!(
            "{}/me/messages/{}?$select=body",
            GRAPH_BASE, message_id
        );

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(CommandError::Http { status: status.as_u16(), body });
        }

        let msg: GraphMessage = response
            .json()
            .await
            .map_err(|e| CommandError::Parse(format!("Failed to parse body: {}", e)))?;

        msg.body
            .ok_or_else(|| CommandError::NotFound("No body in message".to_string()))
    }

    // ========================================================================
    // Actions
    // ========================================================================

    /// Mark message as read
    pub async fn mark_as_read(&self, message_id: &str) -> CmdResult<()> {
        let token = self.get_token().await?;
        let url = format!("{}/me/messages/{}", GRAPH_BASE, message_id);

        let response = self
            .client
            .patch(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .body(r#"{"isRead": true}"#)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(CommandError::Http { status: status.as_u16(), body });
        }

        Ok(())
    }

    /// Send email
    pub async fn send_email(
        &self,
        to: &[EmailAddress],
        cc: &[EmailAddress],
        subject: &str,
        body_html: &str,
    ) -> CmdResult<()> {
        let token = self.get_token().await?;
        let url = format!("{}/me/sendMail", GRAPH_BASE);

        let to_recipients: Vec<serde_json::Value> = to
            .iter()
            .map(|a| {
                serde_json::json!({
                    "emailAddress": { "name": a.name, "address": a.email }
                })
            })
            .collect();

        let cc_recipients: Vec<serde_json::Value> = cc
            .iter()
            .map(|a| {
                serde_json::json!({
                    "emailAddress": { "name": a.name, "address": a.email }
                })
            })
            .collect();

        let payload = serde_json::json!({
            "message": {
                "subject": subject,
                "body": {
                    "contentType": "HTML",
                    "content": body_html
                },
                "toRecipients": to_recipients,
                "ccRecipients": cc_recipients
            }
        });

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(CommandError::Http { status: status.as_u16(), body });
        }

        Ok(())
    }

    /// Reply to email
    pub async fn reply_to_email(
        &self,
        message_id: &str,
        comment_html: &str,
    ) -> CmdResult<()> {
        let token = self.get_token().await?;
        let url = format!("{}/me/messages/{}/reply", GRAPH_BASE, message_id);

        let payload = serde_json::json!({
            "comment": comment_html
        });

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(CommandError::Http { status: status.as_u16(), body });
        }

        Ok(())
    }
}
