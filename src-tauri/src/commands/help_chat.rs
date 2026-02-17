// Help Chat - Single-turn Anthropic API call for in-app help bot
// Simpler than folder_chat: no tools, no agentic loop
// Knowledge base is read from tv-knowledge at runtime (not baked into the build)

use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::PathBuf;
use tauri::command;

use super::settings;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HelpChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    content: Vec<ContentBlock>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum ContentBlock {
    #[serde(rename = "text")]
    Text { text: String },
}

/// Read the help bot knowledge base markdown from tv-knowledge.
/// Falls back to a minimal prompt if the file is missing.
fn read_knowledge_base(knowledge_base_path: &str) -> String {
    let path = PathBuf::from(knowledge_base_path);
    match std::fs::read_to_string(&path) {
        Ok(content) => {
            // Strip YAML frontmatter (between --- markers)
            if content.starts_with("---") {
                if let Some(end) = content[3..].find("---") {
                    return content[end + 6..].trim_start().to_string();
                }
            }
            content
        }
        Err(_) => {
            "You are the TV Desktop help assistant. Answer questions about the app concisely. If you don't know something, say so.".to_string()
        }
    }
}

#[command]
pub async fn help_chat_ask(
    question: String,
    history: Vec<HelpChatMessage>,
    system_prompt: String,
    knowledge_base_path: Option<String>,
) -> Result<String, String> {
    let api_key = settings::settings_get_anthropic_key()?
        .ok_or_else(|| "Anthropic API key not configured. Go to Settings (⌘,) to add it.".to_string())?;

    // Build full system prompt: knowledge base + module context
    let full_prompt = if let Some(kb_path) = knowledge_base_path {
        let knowledge = read_knowledge_base(&kb_path);
        format!("{}\n\n{}", knowledge, system_prompt)
    } else {
        system_prompt
    };

    // Build messages: last 10 history + current question
    let mut messages = Vec::new();
    let start = if history.len() > 10 { history.len() - 10 } else { 0 };
    for msg in &history[start..] {
        messages.push(json!({
            "role": msg.role,
            "content": msg.content,
        }));
    }
    messages.push(json!({
        "role": "user",
        "content": question,
    }));

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("Content-Type", "application/json")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&json!({
            "model": "claude-haiku-4-5-20251001",
            "max_tokens": 1024,
            "temperature": 0.3,
            "system": full_prompt,
            "messages": messages,
        }))
        .send()
        .await
        .map_err(|e| format!("API request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Anthropic API error ({}): {}", status, &body[..body.len().min(500)]));
    }

    let api_response: AnthropicResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse API response: {}", e))?;

    let answer = api_response
        .content
        .iter()
        .filter_map(|b| match b {
            ContentBlock::Text { text } => Some(text.as_str()),
        })
        .collect::<Vec<_>>()
        .join("\n");

    if answer.is_empty() {
        Ok("Sorry, I couldn't generate a response. Please try again.".to_string())
    } else {
        Ok(answer)
    }
}
