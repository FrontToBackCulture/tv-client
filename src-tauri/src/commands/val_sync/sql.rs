// VAL Sync SQL - Execute SQL queries against VAL domains
// Provides ad-hoc SQL execution for data exploration and analysis

use super::auth;
use super::config::get_domain_config;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::command;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Serialize)]
struct SqlQueryRequest {
    sql: String,
}

#[derive(Debug, Deserialize)]
struct SqlQueryResponse {
    data: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Serialize)]
pub struct SqlExecuteResult {
    pub domain: String,
    pub sql: String,
    pub row_count: usize,
    pub columns: Vec<String>,
    pub data: Vec<serde_json::Value>,
    pub truncated: bool,
    pub error: Option<String>,
}

// ============================================================================
// Internal Helpers
// ============================================================================

async fn execute_sql_internal(
    token: &str,
    domain: &str,
    sql: &str,
) -> Result<SqlQueryResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let url = format!("https://{}.thinkval.io/api/v1/sqls/execute", domain);

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .query(&[("token", token)])
        .json(&SqlQueryRequest { sql: sql.to_string() })
        .send()
        .await
        .map_err(|e| format!("SQL query failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("SQL error ({}): {}", status, body));
    }

    response
        .json()
        .await
        .map_err(|e| format!("Failed to parse SQL response: {}", e))
}

fn extract_columns(data: &[serde_json::Value]) -> Vec<String> {
    if data.is_empty() {
        return Vec::new();
    }

    data[0]
        .as_object()
        .map(|obj| obj.keys().cloned().collect())
        .unwrap_or_default()
}

// ============================================================================
// Commands
// ============================================================================

/// Execute a SQL query against a VAL domain
///
/// # Arguments
/// * `domain` - VAL domain name (e.g., "koi", "suntec")
/// * `sql` - SQL query (SELECT only) OR path to a .sql file
/// * `limit` - Maximum rows to return (default: 100)
#[command]
pub async fn val_execute_sql(
    domain: String,
    sql: String,
    limit: Option<usize>,
) -> Result<SqlExecuteResult, String> {
    let domain_config = get_domain_config(&domain)?;
    let api_domain = domain_config.api_domain();
    let max_rows = limit.unwrap_or(100);

    // Check if sql is a file path
    let actual_sql = if sql.ends_with(".sql") {
        let path = Path::new(&sql);
        if path.exists() {
            fs::read_to_string(path)
                .map_err(|e| format!("Failed to read SQL file: {}", e))?
        } else {
            // Try relative to global path
            let global_sql_path = Path::new(&domain_config.global_path).join(&sql);
            if global_sql_path.exists() {
                fs::read_to_string(&global_sql_path)
                    .map_err(|e| format!("Failed to read SQL file: {}", e))?
            } else {
                return Err(format!("SQL file not found: {}", sql));
            }
        }
    } else {
        sql.clone()
    };

    // Validate SELECT only
    let trimmed = actual_sql.trim().to_uppercase();
    if !trimmed.starts_with("SELECT") && !trimmed.starts_with("WITH") {
        return Err("Only SELECT queries are allowed (queries can start with SELECT or WITH)".to_string());
    }

    // Ensure auth
    let (token, _) = auth::ensure_auth(&domain).await?;

    // Execute query
    match execute_sql_internal(&token, api_domain, &actual_sql).await {
        Ok(response) => {
            let data = response.data.unwrap_or_default();
            let total_rows = data.len();
            let truncated = total_rows > max_rows;
            let limited_data: Vec<_> = data.into_iter().take(max_rows).collect();
            let columns = extract_columns(&limited_data);

            Ok(SqlExecuteResult {
                domain,
                sql: actual_sql,
                row_count: total_rows,
                columns,
                data: limited_data,
                truncated,
                error: None,
            })
        }
        Err(e) => {
            // Check for auth error and retry
            if e.contains("401") || e.contains("403") || e.contains("Unauthorized") {
                auth::reauth(&domain).await?;
                let (new_token, _) = auth::ensure_auth(&domain).await?;

                match execute_sql_internal(&new_token, api_domain, &actual_sql).await {
                    Ok(response) => {
                        let data = response.data.unwrap_or_default();
                        let total_rows = data.len();
                        let truncated = total_rows > max_rows;
                        let limited_data: Vec<_> = data.into_iter().take(max_rows).collect();
                        let columns = extract_columns(&limited_data);

                        Ok(SqlExecuteResult {
                            domain,
                            sql: actual_sql,
                            row_count: total_rows,
                            columns,
                            data: limited_data,
                            truncated,
                            error: None,
                        })
                    }
                    Err(e2) => Ok(SqlExecuteResult {
                        domain,
                        sql: actual_sql,
                        row_count: 0,
                        columns: Vec::new(),
                        data: Vec::new(),
                        truncated: false,
                        error: Some(e2),
                    }),
                }
            } else {
                Ok(SqlExecuteResult {
                    domain,
                    sql: actual_sql,
                    row_count: 0,
                    columns: Vec::new(),
                    data: Vec::new(),
                    truncated: false,
                    error: Some(e),
                })
            }
        }
    }
}
