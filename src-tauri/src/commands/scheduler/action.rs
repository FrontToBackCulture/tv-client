// Action node executor — runs data operations (insert/update/upsert/delete)
// directly against Supabase without spawning Claude.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::commands::error::{CmdResult, CommandError};
use crate::commands::supabase;

// ============================================================================
// Action config (mirrors TypeScript ActionConfig)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionConfig {
    pub operation: String, // insert | update | upsert | delete
    pub target_schema: String,
    pub target_table: String,
    pub match_key: Option<String>,
    pub source_query: Option<String>,
    pub field_mapping: Option<HashMap<String, String>>,
    pub static_values: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Serialize)]
pub struct ActionResult {
    pub rows_read: usize,
    pub rows_written: usize,
    pub rows_skipped: usize,
    pub errors: Vec<String>,
    pub summary: String,
    pub source_data: Vec<serde_json::Value>,
}

// ============================================================================
// Execute an action node
// ============================================================================

pub async fn execute_action(config: &ActionConfig) -> CmdResult<ActionResult> {
    // Step 1: Execute source query to get data
    let source_rows = if let Some(ref query) = config.source_query {
        execute_source_query(query).await?
    } else {
        vec![]
    };

    let rows_read = source_rows.len();

    if source_rows.is_empty() {
        return Ok(ActionResult {
            rows_read: 0,
            rows_written: 0,
            rows_skipped: 0,
            errors: vec![],
            summary: "No rows returned from source query.".to_string(),
            source_data: vec![],
        });
    }

    // Step 2: Map fields and apply static values
    let mapped_rows = map_rows(&source_rows, &config.field_mapping, &config.static_values);

    // Step 3: Execute the operation against the target table
    let client = supabase::get_client().await?;
    let table_path = if config.target_schema == "public" || config.target_schema.is_empty() {
        config.target_table.clone()
    } else {
        // For non-public schemas, we'll need to set the Content-Profile header
        config.target_table.clone()
    };

    let mut rows_written = 0usize;
    let mut rows_skipped = 0usize;
    let mut errors: Vec<String> = vec![];

    match config.operation.as_str() {
        "update" => {
            let match_key = config.match_key.as_deref().unwrap_or("id");
            for row in &mapped_rows {
                match update_row(&client, &table_path, &config.target_schema, match_key, row).await {
                    Ok(true) => rows_written += 1,
                    Ok(false) => rows_skipped += 1,
                    Err(e) => errors.push(format!("Update failed: {}", e)),
                }
            }
        }
        "insert" => {
            // Batch insert all rows
            match insert_rows(&client, &table_path, &config.target_schema, &mapped_rows).await {
                Ok(count) => rows_written = count,
                Err(e) => errors.push(format!("Insert failed: {}", e)),
            }
        }
        "upsert" => {
            let match_key = config.match_key.as_deref().unwrap_or("id");
            match upsert_rows(&client, &table_path, &config.target_schema, match_key, &mapped_rows).await {
                Ok(count) => rows_written = count,
                Err(e) => errors.push(format!("Upsert failed: {}", e)),
            }
        }
        "delete" => {
            let match_key = config.match_key.as_deref().unwrap_or("id");
            for row in &mapped_rows {
                match delete_row(&client, &table_path, &config.target_schema, match_key, row).await {
                    Ok(true) => rows_written += 1,
                    Ok(false) => rows_skipped += 1,
                    Err(e) => errors.push(format!("Delete failed: {}", e)),
                }
            }
        }
        other => {
            return Err(CommandError::Internal(format!("Unknown operation: {}", other)));
        }
    }

    let summary = format!(
        "Action completed: {} rows read, {} rows {}, {} skipped, {} errors.",
        rows_read,
        rows_written,
        config.operation,
        rows_skipped,
        errors.len(),
    );

    // Include source data (truncated to 50 rows to avoid massive payloads)
    let truncated_source: Vec<serde_json::Value> = source_rows.into_iter().take(50).collect();

    Ok(ActionResult {
        rows_read,
        rows_written,
        rows_skipped,
        errors,
        summary,
        source_data: truncated_source,
    })
}

// ============================================================================
// Source query execution via RPC
// ============================================================================

/// Public wrapper for executing a source query (used by loop runner).
pub async fn execute_source_query_public(query: &str) -> CmdResult<Vec<serde_json::Value>> {
    execute_source_query(query).await
}

async fn execute_source_query(query: &str) -> CmdResult<Vec<serde_json::Value>> {
    let client = supabase::get_client().await?;
    let params = serde_json::json!({ "query_text": query });
    let result: serde_json::Value = client.rpc("execute_custom_query", &params).await?;

    match result {
        serde_json::Value::Array(arr) => Ok(arr),
        other => {
            // execute_custom_query returns jsonb which might be a single array
            if let Some(arr) = other.as_array() {
                Ok(arr.clone())
            } else {
                Ok(vec![other])
            }
        }
    }
}

// ============================================================================
// Field mapping
// ============================================================================

fn map_rows(
    source_rows: &[serde_json::Value],
    field_mapping: &Option<HashMap<String, String>>,
    static_values: &Option<HashMap<String, serde_json::Value>>,
) -> Vec<serde_json::Value> {
    source_rows
        .iter()
        .map(|row| {
            let obj = row.as_object();
            let mut mapped = serde_json::Map::new();

            if let Some(mapping) = field_mapping {
                // Apply explicit mapping: source_col → target_col
                if let Some(obj) = obj {
                    for (src, tgt) in mapping {
                        if let Some(val) = obj.get(src) {
                            mapped.insert(tgt.clone(), val.clone());
                        }
                    }
                }
            } else {
                // No mapping — pass through all fields
                if let Some(obj) = obj {
                    for (k, v) in obj {
                        mapped.insert(k.clone(), v.clone());
                    }
                }
            }

            // Apply static values (overrides mapped values)
            if let Some(statics) = static_values {
                for (k, v) in statics {
                    mapped.insert(k.clone(), v.clone());
                }
            }

            serde_json::Value::Object(mapped)
        })
        .collect()
}

// ============================================================================
// Write operations
// ============================================================================

async fn update_row(
    client: &supabase::SupabaseClient,
    table: &str,
    schema: &str,
    match_key: &str,
    row: &serde_json::Value,
) -> CmdResult<bool> {
    let obj = row.as_object().ok_or_else(|| CommandError::Internal("Row is not an object".into()))?;
    let match_val = obj.get(match_key)
        .ok_or_else(|| CommandError::Internal(format!("Match key '{}' not found in row", match_key)))?;

    let match_str = match match_val {
        serde_json::Value::String(s) => s.clone(),
        other => other.to_string().trim_matches('"').to_string(),
    };

    let query = format!("{}=eq.{}", match_key, match_str);
    let url = build_table_url(client, table, schema, &query);

    // Remove match_key from the update payload
    let mut update_data = obj.clone();
    update_data.remove(match_key);

    let response = client
        .http_client()
        .patch(&url)
        .headers(build_headers(client, schema))
        .json(&update_data)
        .send()
        .await?;

    if response.status().is_success() {
        let body: Vec<serde_json::Value> = response.json().await.unwrap_or_default();
        Ok(!body.is_empty())
    } else {
        let body = response.text().await.unwrap_or_default();
        Err(CommandError::Internal(format!("Update failed: {}", body)))
    }
}

async fn insert_rows(
    client: &supabase::SupabaseClient,
    table: &str,
    schema: &str,
    rows: &[serde_json::Value],
) -> CmdResult<usize> {
    if rows.is_empty() {
        return Ok(0);
    }

    let url = build_table_url(client, table, schema, "");

    let response = client
        .http_client()
        .post(&url)
        .headers(build_headers(client, schema))
        .json(rows)
        .send()
        .await?;

    if response.status().is_success() {
        let body: Vec<serde_json::Value> = response.json().await.unwrap_or_default();
        Ok(body.len())
    } else {
        let body = response.text().await.unwrap_or_default();
        Err(CommandError::Internal(format!("Insert failed: {}", body)))
    }
}

async fn upsert_rows(
    client: &supabase::SupabaseClient,
    table: &str,
    schema: &str,
    match_key: &str,
    rows: &[serde_json::Value],
) -> CmdResult<usize> {
    if rows.is_empty() {
        return Ok(0);
    }

    let url = build_table_url(client, table, schema, &format!("on_conflict={}", match_key));

    let mut headers = build_headers(client, schema);
    headers.insert(
        "Prefer",
        reqwest::header::HeaderValue::from_static("return=representation,resolution=merge-duplicates"),
    );

    let response = client
        .http_client()
        .post(&url)
        .headers(headers)
        .json(rows)
        .send()
        .await?;

    if response.status().is_success() {
        let body: Vec<serde_json::Value> = response.json().await.unwrap_or_default();
        Ok(body.len())
    } else {
        let body = response.text().await.unwrap_or_default();
        Err(CommandError::Internal(format!("Upsert failed: {}", body)))
    }
}

async fn delete_row(
    client: &supabase::SupabaseClient,
    table: &str,
    schema: &str,
    match_key: &str,
    row: &serde_json::Value,
) -> CmdResult<bool> {
    let obj = row.as_object().ok_or_else(|| CommandError::Internal("Row is not an object".into()))?;
    let match_val = obj.get(match_key)
        .ok_or_else(|| CommandError::Internal(format!("Match key '{}' not found in row", match_key)))?;

    let match_str = match match_val {
        serde_json::Value::String(s) => s.clone(),
        other => other.to_string().trim_matches('"').to_string(),
    };

    let query = format!("{}=eq.{}", match_key, match_str);
    let url = build_table_url(client, table, schema, &query);

    let response = client
        .http_client()
        .delete(&url)
        .headers(build_headers(client, schema))
        .send()
        .await?;

    Ok(response.status().is_success())
}

// ============================================================================
// Helpers
// ============================================================================

fn build_table_url(client: &supabase::SupabaseClient, table: &str, _schema: &str, query: &str) -> String {
    if query.is_empty() {
        format!("{}/rest/v1/{}", client.base_url(), table)
    } else {
        format!("{}/rest/v1/{}?{}", client.base_url(), table, query)
    }
}

fn build_headers(client: &supabase::SupabaseClient, schema: &str) -> reqwest::header::HeaderMap {
    let mut headers = client.auth_headers();
    // Set schema for non-public tables
    if !schema.is_empty() && schema != "public" {
        if let Ok(val) = reqwest::header::HeaderValue::from_str(schema) {
            headers.insert("Content-Profile", val.clone());
            headers.insert("Accept-Profile", val);
        }
    }
    headers
}
