// VAL Sync SQL Generation - AI-powered SQL query generation using Claude Haiku
// Reads domain schema from synced files and generates SQL based on natural language

use super::config::get_domain_config;
use crate::commands::settings;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::command;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Serialize)]
pub struct SqlGenerateResult {
    pub domain: String,
    pub prompt: String,
    pub sql: String,
    pub explanation: String,
    pub tables_used: Vec<String>,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    content: Vec<ContentBlock>,
}

#[derive(Debug, Deserialize)]
struct ContentBlock {
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TableEntry {
    // id can be integer (for zones/phases) or string (for tables)
    #[serde(default)]
    id: serde_json::Value,
    name: Option<String>,
    table_name: Option<String>,
    #[serde(rename = "type")]
    table_type: Option<String>,
    children: Option<Vec<TableEntry>>,
}

#[derive(Debug, Deserialize)]
struct TableDetails {
    meta: Option<TableMeta>,
    columns: Option<TableColumns>,
}

#[derive(Debug, Deserialize)]
struct TableMeta {
    #[serde(rename = "tableName")]
    table_name: Option<String>,
    #[serde(rename = "displayName")]
    display_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TableColumns {
    data: Option<Vec<ColumnDef>>,
}

#[derive(Debug, Deserialize)]
struct ColumnDef {
    name: Option<String>,
    column: Option<String>,
    #[serde(rename = "type")]
    column_type: Option<String>,
}

// ============================================================================
// Helpers
// ============================================================================

/// Extract all tables from the hierarchical all_tables.json structure
/// Returns: Vec<(table_name, display_name, id)>
fn extract_tables(entries: &[TableEntry]) -> Vec<(String, String, String)> {
    let mut tables = Vec::new();

    for entry in entries {
        if let Some(ref t) = entry.table_type {
            if t == "repoTable" {
                // table_name is the SQL identifier (e.g., "custom_tbl_793_331")
                // name is the display name (e.g., "01 DH-RR Raw Data Checks")
                if let Some(ref table_name) = entry.table_name {
                    let display_name = entry.name.clone().unwrap_or_else(|| table_name.clone());
                    // id can be string or integer
                    let id = match &entry.id {
                        serde_json::Value::String(s) => s.clone(),
                        serde_json::Value::Number(n) => n.to_string(),
                        _ => String::new(),
                    };
                    tables.push((table_name.clone(), display_name, id));
                }
            }
        }

        // Recurse into children
        if let Some(ref children) = entry.children {
            tables.extend(extract_tables(children));
        }
    }

    tables
}

/// Load table definitions with columns from definition_details.json
/// Returns: Vec<(table_name, display_name, Vec<(column_name, display_name, type)>)>
fn load_table_schemas(global_path: &str, limit: usize) -> Vec<(String, String, Vec<(String, String, String)>)> {
    let data_models_path = Path::new(global_path).join("data_models");
    let mut schemas = Vec::new();

    if !data_models_path.exists() {
        return schemas;
    }

    let entries = match fs::read_dir(&data_models_path) {
        Ok(e) => e,
        Err(_) => return schemas,
    };

    for entry in entries.flatten().take(limit) {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        // Use definition_details.json which has display names
        let def_path = path.join("definition_details.json");
        if !def_path.exists() {
            continue;
        }

        if let Ok(content) = fs::read_to_string(&def_path) {
            if let Ok(details) = serde_json::from_str::<TableDetails>(&content) {
                let table_name = details.meta
                    .as_ref()
                    .and_then(|m| m.table_name.clone())
                    .unwrap_or_default();

                let display_name = details.meta
                    .as_ref()
                    .and_then(|m| m.display_name.clone())
                    .unwrap_or_else(|| table_name.clone());

                let columns: Vec<(String, String, String)> = details.columns
                    .and_then(|c| c.data)
                    .unwrap_or_default()
                    .into_iter()
                    .filter_map(|c| {
                        let col_name = c.column?;
                        let col_display = c.name.unwrap_or_else(|| col_name.clone());
                        let col_type = c.column_type.unwrap_or_else(|| "unknown".to_string());
                        Some((col_name, col_display, col_type))
                    })
                    .collect();

                if !table_name.is_empty() && !columns.is_empty() {
                    schemas.push((table_name, display_name, columns));
                }
            }
        }
    }

    schemas
}

/// Build the system prompt with domain schema context
fn build_system_prompt(tables: &[(String, String, String)], schemas: &[(String, String, Vec<(String, String, String)>)]) -> String {
    let mut prompt = String::from(
r#"You are a SQL query generator for VAL, a data platform. Generate SELECT queries based on the user's natural language request.

CRITICAL RULES:
1. Only generate SELECT queries (no INSERT, UPDATE, DELETE, DROP, etc.)
2. USE ONLY the exact column names from the TABLE SCHEMAS below
3. DO NOT invent or guess column names - only use columns explicitly listed
4. Table names look like: custom_tbl_XXX_YYY
5. Column names look like: usr_XXX (these are the ACTUAL column names to use in SQL)
6. Always include helpful column aliases using AS with the display name
7. Limit results to 100 rows unless user specifies otherwise
8. For dates, use: column_name >= CURRENT_DATE - INTERVAL '1 day'

RESPONSE FORMAT:
Return the SQL query followed by "---" and then a brief English explanation.
The explanation should describe the query using the DISPLAY NAMES (not column codes).

Example:
SELECT usr_abc AS outlet_name FROM custom_tbl_1
---
This query retrieves the Outlet Name from the Outlet Mapping table.

"#);

    // Add detailed schemas FIRST (most important)
    if !schemas.is_empty() {
        prompt.push_str("TABLE SCHEMAS (USE THESE EXACT COLUMN NAMES):\n");
        prompt.push_str("================================================\n\n");
        for (table_name, display_name, columns) in schemas {
            prompt.push_str(&format!("TABLE: {} ({})\n", table_name, display_name));
            prompt.push_str("Columns:\n");
            for (col_name, col_display, col_type) in columns.iter() {
                prompt.push_str(&format!("  {} = \"{}\" [{}]\n", col_name, col_display, col_type));
            }
            prompt.push_str("\n");
        }
    }

    // Add table list for tables without detailed schemas
    let schema_tables: std::collections::HashSet<_> = schemas.iter().map(|(t, _, _)| t.as_str()).collect();
    let other_tables: Vec<_> = tables.iter()
        .filter(|(name, _, _)| !schema_tables.contains(name.as_str()))
        .collect();

    if !other_tables.is_empty() {
        prompt.push_str("\nOTHER AVAILABLE TABLES (no column details):\n");
        for (name, display, _id) in other_tables.iter().take(50) {
            prompt.push_str(&format!("- {} ({})\n", name, display));
        }
    }

    prompt
}

// ============================================================================
// Commands
// ============================================================================

/// Generate SQL query from natural language using Claude Haiku
#[command]
pub async fn val_generate_sql(
    domain: String,
    prompt: String,
) -> Result<SqlGenerateResult, String> {
    // Get API key
    let api_key = settings::settings_get_anthropic_key()?
        .ok_or("Anthropic API key not configured. Add it in Settings.")?;

    // Get domain config
    let domain_config = get_domain_config(&domain)?;
    let global_path = &domain_config.global_path;

    // Load all_tables.json
    let all_tables_path = Path::new(global_path).join("all_tables.json");
    if !all_tables_path.exists() {
        return Err(format!(
            "all_tables.json not found for domain '{}'. Run sync first.",
            domain
        ));
    }

    let tables_content = fs::read_to_string(&all_tables_path)
        .map_err(|e| format!("Failed to read all_tables.json: {}", e))?;

    let table_entries: Vec<TableEntry> = serde_json::from_str(&tables_content)
        .map_err(|e| format!("Failed to parse all_tables.json: {}", e))?;

    let tables = extract_tables(&table_entries);

    if tables.is_empty() {
        return Err("No tables found in domain. Run sync first.".to_string());
    }

    // Load table schemas (limit to 30 for context size)
    let schemas = load_table_schemas(global_path, 30);

    // Build system prompt
    let system_prompt = build_system_prompt(&tables, &schemas);

    // Call Anthropic API
    let client = reqwest::Client::new();
    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("Content-Type", "application/json")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&serde_json::json!({
            "model": "claude-3-5-haiku-20241022",
            "max_tokens": 1024,
            "system": system_prompt,
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        }))
        .send()
        .await
        .map_err(|e| format!("API request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Anthropic API error ({}): {}", status, body));
    }

    let api_response: AnthropicResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse API response: {}", e))?;

    // Extract text from response
    let text = api_response.content
        .first()
        .and_then(|c| c.text.clone())
        .ok_or("No text in API response")?;

    // Clean up the response - extract SQL and explanation
    let (sql, explanation) = extract_sql_and_explanation(&text);

    if sql.is_empty() {
        return Err(format!("No valid SQL in response: {}", text));
    }

    Ok(SqlGenerateResult {
        domain,
        prompt,
        sql,
        explanation,
        tables_used: Vec::new(),
        error: None,
    })
}

/// Extract SQL and explanation from AI response
/// Format expected: SQL query followed by "---" and explanation
fn extract_sql_and_explanation(text: &str) -> (String, String) {
    let text = text.trim();

    // Try to split by "---" separator
    if let Some(separator_pos) = text.find("\n---") {
        let sql_part = text[..separator_pos].trim();
        let explanation_part = text[separator_pos + 4..].trim();
        let sql = extract_sql_from_text(sql_part);
        return (sql, explanation_part.to_string());
    }

    // No separator, try to extract just SQL
    let sql = extract_sql_from_text(text);
    (sql, String::new())
}

/// Extract SQL from text, handling markdown code blocks
fn extract_sql_from_text(text: &str) -> String {
    let text = text.trim();

    // Try to extract from markdown code block first
    if let Some(start) = text.find("```sql") {
        let after_marker = &text[start + 6..];
        if let Some(end) = after_marker.find("```") {
            return after_marker[..end].trim().to_string();
        }
    }

    // Try generic code block
    if let Some(start) = text.find("```") {
        let after_marker = &text[start + 3..];
        // Skip language identifier if present
        let sql_start = after_marker.find('\n').map(|i| i + 1).unwrap_or(0);
        let after_lang = &after_marker[sql_start..];
        if let Some(end) = after_lang.find("```") {
            return after_lang[..end].trim().to_string();
        }
    }

    // Find SELECT or WITH statement directly
    let upper = text.to_uppercase();
    if let Some(select_pos) = upper.find("SELECT") {
        return text[select_pos..].trim().to_string();
    }
    if let Some(with_pos) = upper.find("WITH") {
        return text[with_pos..].trim().to_string();
    }

    // Return as-is if nothing found
    text.to_string()
}
