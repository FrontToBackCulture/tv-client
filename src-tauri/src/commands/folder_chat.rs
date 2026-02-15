// Folder Chat - AI-powered folder Q&A using Anthropic Claude
// Replaces the old tv-tools HTTP server folder-ask endpoint

use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs;
use std::path::Path;
use tauri::command;

use super::settings;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSource {
    pub path: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String, // "user" or "assistant"
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderChatResponse {
    pub answer: String,
    pub sources: Vec<ChatSource>,
}

// ============================================================================
// File helpers (local to folder scope)
// ============================================================================

fn list_folder_contents(folder_path: &str) -> Vec<(String, bool)> {
    let mut results = Vec::new();
    let entries = match fs::read_dir(folder_path) {
        Ok(e) => e,
        Err(_) => return results,
    };

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let is_dir = entry.metadata().map(|m| m.is_dir()).unwrap_or(false);
        results.push((name, is_dir));
    }
    results.sort_by(|a, b| {
        match (a.1, b.1) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.0.to_lowercase().cmp(&b.0.to_lowercase()),
        }
    });
    results
}

fn read_file_content(path: &str, max_length: usize) -> Option<String> {
    let content = fs::read_to_string(path).ok()?;
    if content.len() > max_length {
        Some(format!("{}\n\n... (truncated)", &content[..max_length]))
    } else {
        Some(content)
    }
}

fn search_in_folder(folder_path: &str, term: &str, max_results: usize) -> String {
    let term_lower = term.to_lowercase();
    let mut matches: Vec<(String, Vec<String>)> = Vec::new();

    fn search_recursive(dir: &Path, term: &str, matches: &mut Vec<(String, Vec<String>)>, depth: usize) {
        if depth > 4 || matches.len() >= 20 {
            return;
        }
        let entries = match fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || name == "node_modules" || name == "target" {
                continue;
            }
            let path = entry.path();
            if path.is_dir() {
                search_recursive(&path, term, matches, depth + 1);
            } else {
                let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
                if !["md", "json", "txt", "csv", "sql"].contains(&ext) {
                    continue;
                }
                if let Ok(content) = fs::read_to_string(&path) {
                    let content_lower = content.to_lowercase();
                    if content_lower.contains(term) {
                        let snippets: Vec<String> = content
                            .lines()
                            .filter(|line| line.to_lowercase().contains(term))
                            .take(3)
                            .map(|l| l.trim().to_string())
                            .collect();
                        matches.push((path.to_string_lossy().to_string(), snippets));
                    }
                }
            }
        }
    }

    search_recursive(Path::new(folder_path), &term_lower, &mut matches, 0);

    if matches.is_empty() {
        return format!("No files found containing \"{}\"", term);
    }

    let mut result = format!("Found \"{}\" in {} files:\n", term, matches.len());
    for (path, snippets) in matches.iter().take(max_results) {
        let rel_path = path.strip_prefix(folder_path).unwrap_or(path).trim_start_matches('/');
        result.push_str(&format!("\n- {}\n", rel_path));
        for snippet in snippets {
            let truncated = if snippet.len() > 200 { &snippet[..200] } else { snippet };
            result.push_str(&format!("  > {}\n", truncated));
        }
    }
    if matches.len() > max_results {
        result.push_str(&format!("\n... and {} more files\n", matches.len() - max_results));
    }
    result
}

// ============================================================================
// Tool execution
// ============================================================================

fn execute_tool(tool_name: &str, input: &serde_json::Value, folder_path: &str) -> String {
    match tool_name {
        "list_files" => {
            let subfolder = input.get("subfolder").and_then(|v| v.as_str()).unwrap_or("");
            let target = if subfolder.is_empty() {
                folder_path.to_string()
            } else {
                format!("{}/{}", folder_path, subfolder)
            };
            let contents = list_folder_contents(&target);
            if contents.is_empty() {
                return "No files found in this directory.".to_string();
            }
            let list: Vec<String> = contents
                .iter()
                .map(|(name, is_dir)| {
                    if *is_dir {
                        format!("- [DIR] {}", name)
                    } else {
                        format!("- {}", name)
                    }
                })
                .collect();
            format!("Files in {}:\n{}", subfolder.is_empty().then_some("root").unwrap_or(subfolder), list.join("\n"))
        }
        "read_file" => {
            let file_path = match input.get("file_path").and_then(|v| v.as_str()) {
                Some(p) => p,
                None => return "No file_path provided".to_string(),
            };
            // Build absolute path - handle both relative and absolute
            let abs_path = if file_path.starts_with('/') {
                file_path.to_string()
            } else {
                format!("{}/{}", folder_path, file_path)
            };
            match read_file_content(&abs_path, 50000) {
                Some(content) => format!("Content of {}:\n\n{}", file_path, content),
                None => format!("Could not read file: {}", file_path),
            }
        }
        "search_files" => {
            let search_term = input.get("search_term").and_then(|v| v.as_str()).unwrap_or("");
            if search_term.is_empty() {
                return "No search term provided".to_string();
            }
            search_in_folder(folder_path, search_term, 10)
        }
        _ => format!("Unknown tool: {}", tool_name),
    }
}

// ============================================================================
// Anthropic API with tool use
// ============================================================================

#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    content: Vec<ContentBlock>,
    stop_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum ContentBlock {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
}

const TOOLS_SCHEMA: &str = r#"[
    {
        "name": "list_files",
        "description": "List all files and folders in the current directory or a subdirectory",
        "input_schema": {
            "type": "object",
            "properties": {
                "subfolder": {
                    "type": "string",
                    "description": "Optional subfolder path to list (relative to current folder). Leave empty for current folder."
                }
            }
        }
    },
    {
        "name": "read_file",
        "description": "Read the content of a specific file to get detailed information",
        "input_schema": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "The path to the file to read (relative to the folder root)"
                }
            },
            "required": ["file_path"]
        }
    },
    {
        "name": "search_files",
        "description": "Search for a specific term across all files in the folder. Use this to find where a topic, keyword, or term is mentioned.",
        "input_schema": {
            "type": "object",
            "properties": {
                "search_term": {
                    "type": "string",
                    "description": "The term to search for (case-insensitive)"
                }
            },
            "required": ["search_term"]
        }
    }
]"#;

// ============================================================================
// Main command
// ============================================================================

#[command]
pub async fn folder_chat_ask(
    folder_path: String,
    question: String,
    conversation_history: Vec<ChatMessage>,
) -> Result<FolderChatResponse, String> {
    let api_key = settings::settings_get_anthropic_key()?
        .ok_or_else(|| "Anthropic API key not configured. Set it in Settings.".to_string())?;

    let folder_name = Path::new(&folder_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "folder".to_string());

    // Get folder contents for context
    let contents = list_folder_contents(&folder_path);
    let file_list: String = contents
        .iter()
        .map(|(name, is_dir)| {
            if *is_dir {
                format!("- [DIR] {}", name)
            } else {
                format!("- {}", name)
            }
        })
        .collect::<Vec<_>>()
        .join("\n");

    // Check for context files (CLAUDE.md, README.md, CONTEXT.md)
    let mut context_content = String::new();
    for name in &["CLAUDE.md", "CONTEXT.md", "README.md", "claude.md"] {
        let ctx_path = format!("{}/{}", folder_path, name);
        if let Some(content) = read_file_content(&ctx_path, 3000) {
            context_content = content;
            break;
        }
    }

    let system_prompt = format!(
        r#"You are a helpful assistant exploring a folder called "{}" to answer questions.

## Available Tools
You have access to tools to explore the folder:
- **list_files**: See what files are in a directory
- **read_file**: Read a file's content to find information
- **search_files**: Search for keywords across all files in the folder

## Your Approach
1. First, consider using search_files to find relevant files quickly
2. Read the most promising files (usually 1-3 files)
3. Extract specific details to answer the question
4. Always cite which file(s) your answer comes from

## Current Folder Contents
{}
{}
## Guidelines
- Use search_files when looking for specific terms or topics
- Read files that seem relevant to the question
- Be thorough - extract specific details, not vague summaries
- If you can't find the answer, say so and suggest what might help
- Always mention which files you found the information in"#,
        folder_name,
        file_list,
        if context_content.is_empty() {
            String::new()
        } else {
            format!("\n## Folder Context\n{}\n", context_content)
        }
    );

    let tools: serde_json::Value =
        serde_json::from_str(TOOLS_SCHEMA).map_err(|e| format!("Failed to parse tools schema: {}", e))?;

    // Build messages array
    let mut messages = Vec::new();

    // Add conversation history (last 10 messages)
    let history_start = if conversation_history.len() > 10 {
        conversation_history.len() - 10
    } else {
        0
    };
    for msg in &conversation_history[history_start..] {
        messages.push(json!({
            "role": msg.role,
            "content": msg.content,
        }));
    }

    // Add current question
    messages.push(json!({
        "role": "user",
        "content": question,
    }));

    // Track read files for sources
    let mut read_files: Vec<String> = Vec::new();

    let client = reqwest::Client::new();
    let max_iterations = 10;

    for iteration in 0..max_iterations {
        let tool_choice = if iteration == max_iterations - 1 {
            json!({"type": "none"})
        } else {
            json!({"type": "auto"})
        };

        let response = client
            .post("https://api.anthropic.com/v1/messages")
            .header("Content-Type", "application/json")
            .header("x-api-key", &api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&json!({
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 4096,
                "temperature": 0.3,
                "system": system_prompt,
                "tools": tools,
                "tool_choice": tool_choice,
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

        // Check if there are tool calls
        let has_tool_use = api_response.content.iter().any(|b| matches!(b, ContentBlock::ToolUse { .. }));

        if !has_tool_use || api_response.stop_reason.as_deref() == Some("end_turn") {
            // Final answer - extract text
            let answer = api_response
                .content
                .iter()
                .filter_map(|b| match b {
                    ContentBlock::Text { text } => Some(text.as_str()),
                    _ => None,
                })
                .collect::<Vec<_>>()
                .join("\n");

            let sources: Vec<ChatSource> = read_files
                .iter()
                .map(|path| {
                    let file_name = path.rsplit('/').next().unwrap_or(path);
                    let title = file_name
                        .trim_end_matches(".md")
                        .replace('_', " ");
                    // Return relative path from folder
                    let rel_path = path.strip_prefix(&folder_path).unwrap_or(path).trim_start_matches('/');
                    ChatSource {
                        path: rel_path.to_string(),
                        title,
                    }
                })
                .collect();

            return Ok(FolderChatResponse {
                answer: if answer.is_empty() {
                    "I couldn't find an answer to your question in this folder.".to_string()
                } else {
                    answer
                },
                sources,
            });
        }

        // Build assistant message content for the messages array
        let mut assistant_content = Vec::new();
        let mut tool_results = Vec::new();

        for block in &api_response.content {
            match block {
                ContentBlock::Text { text } => {
                    assistant_content.push(json!({
                        "type": "text",
                        "text": text,
                    }));
                }
                ContentBlock::ToolUse { id, name, input } => {
                    assistant_content.push(json!({
                        "type": "tool_use",
                        "id": id,
                        "name": name,
                        "input": input,
                    }));

                    // Execute the tool
                    let result = execute_tool(name, input, &folder_path);

                    // Track read files
                    if name == "read_file" {
                        if let Some(file_path) = input.get("file_path").and_then(|v| v.as_str()) {
                            let abs_path = if file_path.starts_with('/') {
                                file_path.to_string()
                            } else {
                                format!("{}/{}", folder_path, file_path)
                            };
                            if !read_files.contains(&abs_path) {
                                read_files.push(abs_path);
                            }
                        }
                    }

                    tool_results.push(json!({
                        "type": "tool_result",
                        "tool_use_id": id,
                        "content": result,
                    }));
                }
            }
        }

        // Add assistant message with tool use
        messages.push(json!({
            "role": "assistant",
            "content": assistant_content,
        }));

        // Add tool results
        messages.push(json!({
            "role": "user",
            "content": tool_results,
        }));
    }

    // If we exhausted iterations
    Ok(FolderChatResponse {
        answer: "I ran out of exploration steps. Try asking a more specific question.".to_string(),
        sources: Vec::new(),
    })
}
