// Notion API Client
// Uses reqwest to communicate with the Notion API

use crate::commands::error::{CmdResult, CommandError};
use crate::commands::settings::{settings_get_key, KEY_NOTION_API};
use crate::HTTP_CLIENT;
use serde_json::{json, Value};

use super::types::*;

const NOTION_API_BASE: &str = "https://api.notion.com/v1";
const NOTION_API_VERSION: &str = "2022-06-28";

/// Get the Notion API key from settings
fn get_api_key() -> CmdResult<String> {
    settings_get_key(KEY_NOTION_API.to_string())?
        .ok_or_else(|| CommandError::Config("Notion API key not configured. Go to Settings to add it.".into()))
}

/// Build authorization headers for Notion API
fn notion_headers(api_key: &str) -> reqwest::header::HeaderMap {
    let mut headers = reqwest::header::HeaderMap::new();
    if let Ok(val) = reqwest::header::HeaderValue::from_str(&format!("Bearer {}", api_key)) {
        headers.insert(reqwest::header::AUTHORIZATION, val);
    }
    headers.insert(
        "Notion-Version",
        reqwest::header::HeaderValue::from_static(NOTION_API_VERSION),
    );
    headers.insert(
        reqwest::header::CONTENT_TYPE,
        reqwest::header::HeaderValue::from_static("application/json"),
    );
    headers
}

/// Search for databases accessible to the integration
pub async fn search_databases(query: &str) -> CmdResult<Vec<NotionDatabaseInfo>> {
    let api_key = get_api_key()?;
    let url = format!("{}/search", NOTION_API_BASE);

    let body = json!({
        "query": query,
        "filter": {
            "property": "object",
            "value": "database"
        },
        "sort": {
            "direction": "descending",
            "timestamp": "last_edited_time"
        }
    });

    let response = HTTP_CLIENT
        .post(&url)
        .headers(notion_headers(&api_key))
        .json(&body)
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        return Err(CommandError::Http { status, body });
    }

    let search_response: NotionSearchResponse = response.json().await?;

    let databases = search_response
        .results
        .into_iter()
        .filter(|obj| obj.object == "database")
        .map(|obj| {
            let title = obj
                .title
                .as_ref()
                .and_then(|t| t.first())
                .and_then(|rt| rt.plain_text.clone())
                .unwrap_or_else(|| "Untitled".to_string());

            NotionDatabaseInfo {
                id: obj.id,
                title,
                properties: vec![], // Populated by get_database_schema
                last_edited_time: obj.last_edited_time,
            }
        })
        .collect();

    Ok(databases)
}

/// Get the full schema (properties) of a database
pub async fn get_database_schema(database_id: &str) -> CmdResult<NotionDatabaseInfo> {
    let api_key = get_api_key()?;
    let url = format!("{}/databases/{}", NOTION_API_BASE, database_id);

    let response = HTTP_CLIENT
        .get(&url)
        .headers(notion_headers(&api_key))
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        return Err(CommandError::Http { status, body });
    }

    let db: Value = response.json().await?;

    let title = db["title"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|rt| rt["plain_text"].as_str())
        .unwrap_or("Untitled")
        .to_string();

    let properties = parse_database_properties(&db["properties"]);

    Ok(NotionDatabaseInfo {
        id: database_id.to_string(),
        title,
        properties,
        last_edited_time: db["last_edited_time"].as_str().map(|s| s.to_string()),
    })
}

/// Parse Notion database properties into typed schemas
fn parse_database_properties(props: &Value) -> Vec<NotionPropertySchema> {
    let obj = match props.as_object() {
        Some(o) => o,
        None => return vec![],
    };

    let mut result: Vec<NotionPropertySchema> = obj
        .iter()
        .map(|(name, prop)| {
            let prop_type = prop["type"].as_str().unwrap_or("unknown").to_string();

            let options = match prop_type.as_str() {
                "select" => prop["select"]["options"]
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .map(|opt| NotionSelectOption {
                                name: opt["name"].as_str().unwrap_or("").to_string(),
                                color: opt["color"].as_str().map(|s| s.to_string()),
                            })
                            .collect()
                    }),
                "multi_select" => prop["multi_select"]["options"]
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .map(|opt| NotionSelectOption {
                                name: opt["name"].as_str().unwrap_or("").to_string(),
                                color: opt["color"].as_str().map(|s| s.to_string()),
                            })
                            .collect()
                    }),
                "status" => prop["status"]["options"]
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .map(|opt| NotionSelectOption {
                                name: opt["name"].as_str().unwrap_or("").to_string(),
                                color: opt["color"].as_str().map(|s| s.to_string()),
                            })
                            .collect()
                    }),
                _ => None,
            };

            let groups = if prop_type == "status" {
                prop["status"]["groups"].as_array().map(|arr| {
                    arr.iter()
                        .map(|g| NotionStatusGroup {
                            name: g["name"].as_str().unwrap_or("").to_string(),
                            color: g["color"].as_str().map(|s| s.to_string()),
                            option_ids: g["option_ids"].as_array().map(|ids| {
                                ids.iter()
                                    .filter_map(|id| id.as_str().map(|s| s.to_string()))
                                    .collect()
                            }),
                        })
                        .collect()
                })
            } else {
                None
            };

            NotionPropertySchema {
                name: name.clone(),
                prop_type,
                options,
                groups,
            }
        })
        .collect();

    result.sort_by(|a, b| a.name.cmp(&b.name));
    result
}

/// Query a database with optional filter and pagination
/// Returns all pages (handles pagination internally)
pub async fn query_database(
    database_id: &str,
    filter: Option<&Value>,
    since: Option<&str>,
) -> CmdResult<Vec<NotionPage>> {
    let api_key = get_api_key()?;
    let url = format!("{}/databases/{}/query", NOTION_API_BASE, database_id);

    let mut all_pages = Vec::new();
    let mut cursor: Option<String> = None;

    loop {
        let mut body = json!({
            "page_size": 100,
            "sorts": [{
                "timestamp": "last_edited_time",
                "direction": "descending"
            }]
        });

        // Build filter combining user filter and since timestamp
        let combined_filter = build_query_filter(filter, since);
        if let Some(f) = &combined_filter {
            body["filter"] = f.clone();
        }

        if let Some(c) = &cursor {
            body["start_cursor"] = json!(c);
        }

        let response = HTTP_CLIENT
            .post(&url)
            .headers(notion_headers(&api_key))
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status().as_u16();
            let body = response.text().await.unwrap_or_default();
            return Err(CommandError::Http { status, body });
        }

        let query_response: NotionQueryResponse = response.json().await?;

        all_pages.extend(query_response.results);

        if query_response.has_more {
            cursor = query_response.next_cursor;
            // Rate limit: 100ms between requests
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        } else {
            break;
        }
    }

    Ok(all_pages)
}

/// Build a combined filter for user-defined filter + incremental since timestamp
fn build_query_filter(user_filter: Option<&Value>, since: Option<&str>) -> Option<Value> {
    let since_filter = since.map(|ts| {
        json!({
            "timestamp": "last_edited_time",
            "last_edited_time": {
                "after": ts
            }
        })
    });

    match (user_filter, since_filter) {
        (Some(uf), Some(sf)) => {
            // Combine with AND
            if uf.get("and").is_some() {
                // User filter is already an AND — append since filter
                let mut combined = uf.clone();
                if let Some(arr) = combined["and"].as_array_mut() {
                    arr.push(sf);
                }
                Some(combined)
            } else {
                Some(json!({
                    "and": [uf, sf]
                }))
            }
        }
        (Some(uf), None) => Some(uf.clone()),
        (None, Some(sf)) => Some(sf),
        (None, None) => None,
    }
}

/// Query a database for preview (limited to 10 results)
pub async fn preview_database(
    database_id: &str,
    filter: Option<&Value>,
) -> CmdResult<Vec<PreviewCard>> {
    let api_key = get_api_key()?;
    let url = format!("{}/databases/{}/query", NOTION_API_BASE, database_id);

    let mut body = json!({
        "page_size": 10,
        "sorts": [{
            "timestamp": "last_edited_time",
            "direction": "descending"
        }]
    });

    if let Some(f) = filter {
        body["filter"] = f.clone();
    }

    let response = HTTP_CLIENT
        .post(&url)
        .headers(notion_headers(&api_key))
        .json(&body)
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        return Err(CommandError::Http { status, body });
    }

    let query_response: NotionQueryResponse = response.json().await?;

    let cards: Vec<PreviewCard> = query_response
        .results
        .into_iter()
        .map(|page| {
            let title = extract_page_title(&page.properties);
            PreviewCard {
                notion_page_id: page.id,
                title,
                properties: page.properties,
                last_edited_time: page.last_edited_time,
            }
        })
        .collect();

    Ok(cards)
}

/// Extract the title from a page's properties
pub fn extract_page_title(properties: &Value) -> String {
    if let Some(props) = properties.as_object() {
        for (_name, prop) in props {
            if prop["type"].as_str() == Some("title") {
                if let Some(title_arr) = prop["title"].as_array() {
                    let text: String = title_arr
                        .iter()
                        .filter_map(|rt| rt["plain_text"].as_str())
                        .collect();
                    if !text.is_empty() {
                        return text;
                    }
                }
            }
        }
    }
    "Untitled".to_string()
}
