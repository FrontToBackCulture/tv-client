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

            let relation_database_id = prop["relation"]["database_id"]
                .as_str()
                .map(|s| s.to_string());

            NotionPropertySchema {
                name: name.clone(),
                prop_type,
                options,
                groups,
                relation_database_id,
            }
        })
        .collect();

    result.sort_by(|a, b| a.name.cmp(&b.name));
    result
}

/// Result from query_database including any filter warnings
pub struct QueryResult {
    pub pages: Vec<NotionPage>,
    /// If the user filter was invalid and we retried without it
    pub filter_warning: Option<String>,
}

/// Query a database with optional filter and pagination
/// Returns all pages (handles pagination internally)
/// If the filter is rejected by Notion (400), retries without the user filter and returns a warning
pub async fn query_database(
    database_id: &str,
    filter: Option<&Value>,
    since: Option<&str>,
) -> CmdResult<QueryResult> {
    // Clone filter so we can own it for the retry path
    let filter_owned = filter.cloned();
    let since_owned = since.map(|s| s.to_string());

    match query_database_with_filter(database_id, filter_owned.as_ref(), since_owned.as_deref()).await {
        Ok(pages) => Ok(QueryResult { pages, filter_warning: None }),
        Err(CommandError::Http { status: 400, body }) if filter.is_some() => {
            // Filter was rejected — extract error message and retry without it
            let warning = parse_notion_error(&body);
            eprintln!(
                "[notion:query] Filter rejected (400), retrying without filter. Error: {}",
                warning
            );
            let pages = query_database_with_filter(database_id, None, since_owned.as_deref()).await?;
            Ok(QueryResult {
                pages,
                filter_warning: Some(warning),
            })
        }
        Err(e) => Err(e),
    }
}

/// Parse Notion API error body for a human-readable message
fn parse_notion_error(body: &str) -> String {
    if let Ok(parsed) = serde_json::from_str::<Value>(body) {
        if let Some(msg) = parsed["message"].as_str() {
            return msg.to_string();
        }
    }
    body.to_string()
}

/// Query implementation with optional filter
async fn query_database_with_filter(
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
///
/// Notion only allows 2 levels of compound filter nesting (e.g. or > and > property).
/// If the user filter is already a compound filter (or/and), we can't wrap it in another
/// compound without exceeding the limit. In that case, just use the user filter as-is —
/// the user is expected to include their own date constraints.
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
            // If user filter is a compound filter (or/and), don't wrap — would exceed nesting limit
            if uf.get("or").is_some() || uf.get("and").is_some() {
                Some(uf.clone())
            } else {
                // Simple property filter — safe to combine with AND
                Some(json!({ "and": [uf, sf] }))
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

/// List all users in the Notion workspace
pub async fn list_users() -> CmdResult<Vec<NotionUser>> {
    let api_key = get_api_key()?;
    let url = format!("{}/users", NOTION_API_BASE);

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

    let body: Value = response.json().await?;
    let results = body["results"].as_array().cloned().unwrap_or_default();

    let users: Vec<NotionUser> = results
        .into_iter()
        .filter_map(|u| {
            let id = u["id"].as_str()?.to_string();
            let name = u["name"].as_str().unwrap_or("").to_string();
            let user_type = u["type"].as_str().unwrap_or("person").to_string();
            // Skip bots
            if user_type == "bot" {
                return None;
            }
            let email = u["person"]["email"].as_str().map(|s| s.to_string());
            Some(NotionUser { id, name, email })
        })
        .collect();

    Ok(users)
}

/// Fetch all block children for a page and convert to markdown
pub async fn get_page_content_as_markdown(page_id: &str) -> CmdResult<String> {
    let api_key = get_api_key()?;
    let mut all_blocks: Vec<Value> = Vec::new();
    let mut cursor: Option<String> = None;

    // Paginate through all blocks
    loop {
        let mut url = format!("{}/blocks/{}/children?page_size=100", NOTION_API_BASE, page_id);
        if let Some(ref c) = cursor {
            url.push_str(&format!("&start_cursor={}", c));
        }

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

        let body: Value = response.json().await?;
        if let Some(results) = body["results"].as_array() {
            all_blocks.extend(results.clone());
        }

        if body["has_more"].as_bool() == Some(true) {
            cursor = body["next_cursor"].as_str().map(|s| s.to_string());
        } else {
            break;
        }
    }

    Ok(blocks_to_markdown(&all_blocks))
}

/// Fetch block children and return raw blocks + extracted attachment info
pub async fn get_page_blocks(page_id: &str) -> CmdResult<(String, Vec<NotionAttachment>)> {
    let api_key = get_api_key()?;
    let mut all_blocks: Vec<Value> = Vec::new();
    let mut cursor: Option<String> = None;

    loop {
        let mut url = format!("{}/blocks/{}/children?page_size=100", NOTION_API_BASE, page_id);
        if let Some(ref c) = cursor {
            url.push_str(&format!("&start_cursor={}", c));
        }

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

        let body: Value = response.json().await?;
        if let Some(results) = body["results"].as_array() {
            all_blocks.extend(results.clone());
        }

        if body["has_more"].as_bool() == Some(true) {
            cursor = body["next_cursor"].as_str().map(|s| s.to_string());
        } else {
            break;
        }
    }

    let markdown = blocks_to_markdown(&all_blocks);
    let attachments = extract_attachments(&all_blocks);
    Ok((markdown, attachments))
}

/// Convert Notion blocks to markdown
fn blocks_to_markdown(blocks: &[Value]) -> String {
    let mut lines: Vec<String> = Vec::new();
    let mut in_numbered_list = false;
    let mut list_num = 0;

    for block in blocks {
        let block_type = block["type"].as_str().unwrap_or("");

        // Reset numbered list tracking
        if block_type != "numbered_list_item" {
            in_numbered_list = false;
            list_num = 0;
        }

        let line = match block_type {
            "paragraph" => rich_text_to_md(&block["paragraph"]["rich_text"]),
            "heading_1" => format!("# {}", rich_text_to_md(&block["heading_1"]["rich_text"])),
            "heading_2" => format!("## {}", rich_text_to_md(&block["heading_2"]["rich_text"])),
            "heading_3" => format!("### {}", rich_text_to_md(&block["heading_3"]["rich_text"])),
            "bulleted_list_item" => format!("- {}", rich_text_to_md(&block["bulleted_list_item"]["rich_text"])),
            "numbered_list_item" => {
                if !in_numbered_list { in_numbered_list = true; list_num = 0; }
                list_num += 1;
                format!("{}. {}", list_num, rich_text_to_md(&block["numbered_list_item"]["rich_text"]))
            }
            "to_do" => {
                let checked = block["to_do"]["checked"].as_bool().unwrap_or(false);
                let marker = if checked { "[x]" } else { "[ ]" };
                format!("- {} {}", marker, rich_text_to_md(&block["to_do"]["rich_text"]))
            }
            "toggle" => format!("> {}", rich_text_to_md(&block["toggle"]["rich_text"])),
            "quote" => format!("> {}", rich_text_to_md(&block["quote"]["rich_text"])),
            "callout" => {
                let text = rich_text_to_md(&block["callout"]["rich_text"]);
                format!("> **Note:** {}", text)
            }
            "code" => {
                let lang = block["code"]["language"].as_str().unwrap_or("");
                let code = rich_text_to_md(&block["code"]["rich_text"]);
                format!("```{}\n{}\n```", lang, code)
            }
            "divider" => "---".to_string(),
            "image" => {
                let url = extract_file_url(&block["image"]);
                let caption = rich_text_to_md(&block["image"]["caption"]);
                if caption.is_empty() {
                    format!("![image]({})", url)
                } else {
                    format!("![{}]({})", caption, url)
                }
            }
            "file" => {
                let url = extract_file_url(&block["file"]);
                let name = block["file"]["name"].as_str()
                    .or_else(|| block["file"]["caption"].as_array()
                        .and_then(|a| a.first())
                        .and_then(|t| t["plain_text"].as_str()))
                    .unwrap_or("file");
                format!("[{}]({})", name, url)
            }
            "pdf" => {
                let url = extract_file_url(&block["pdf"]);
                format!("[PDF]({})", url)
            }
            "bookmark" => {
                let url = block["bookmark"]["url"].as_str().unwrap_or("");
                let caption = rich_text_to_md(&block["bookmark"]["caption"]);
                if caption.is_empty() {
                    format!("[{}]({})", url, url)
                } else {
                    format!("[{}]({})", caption, url)
                }
            }
            "link_preview" => {
                let url = block["link_preview"]["url"].as_str().unwrap_or("");
                format!("[{}]({})", url, url)
            }
            "table" => {
                // Basic table support
                if let Some(rows) = block.get("table") {
                    if rows["has_column_header"].as_bool() == Some(true) {
                        "<!-- table -->".to_string()
                    } else {
                        "<!-- table -->".to_string()
                    }
                } else {
                    String::new()
                }
            }
            "child_page" => {
                let title = block["child_page"]["title"].as_str().unwrap_or("Untitled");
                format!("**[Sub-page: {}]**", title)
            }
            "child_database" => {
                let title = block["child_database"]["title"].as_str().unwrap_or("Untitled");
                format!("**[Database: {}]**", title)
            }
            _ => String::new(),
        };

        if !line.is_empty() {
            lines.push(line);
        } else if block_type == "paragraph" {
            // Empty paragraph = blank line
            lines.push(String::new());
        }
    }

    // Clean up: collapse multiple blank lines
    let mut result = String::new();
    let mut prev_blank = false;
    for line in &lines {
        if line.is_empty() {
            if !prev_blank {
                result.push('\n');
                prev_blank = true;
            }
        } else {
            result.push_str(line);
            result.push('\n');
            prev_blank = false;
        }
    }

    result.trim().to_string()
}

/// Convert Notion rich_text array to markdown string
fn rich_text_to_md(rich_text: &Value) -> String {
    let arr = match rich_text.as_array() {
        Some(a) => a,
        None => return String::new(),
    };

    arr.iter()
        .map(|rt| {
            let text = rt["plain_text"].as_str().unwrap_or("");
            let annotations = &rt["annotations"];
            let mut s = text.to_string();

            // Apply formatting
            if annotations["code"].as_bool() == Some(true) {
                s = format!("`{}`", s);
            }
            if annotations["bold"].as_bool() == Some(true) {
                s = format!("**{}**", s);
            }
            if annotations["italic"].as_bool() == Some(true) {
                s = format!("*{}*", s);
            }
            if annotations["strikethrough"].as_bool() == Some(true) {
                s = format!("~~{}~~", s);
            }

            // Handle links
            if let Some(url) = rt["href"].as_str() {
                s = format!("[{}]({})", s, url);
            }

            s
        })
        .collect()
}

/// Extract file URL from a Notion file object (handles both "file" and "external" types)
fn extract_file_url(file_obj: &Value) -> String {
    // Notion files: { "type": "file", "file": { "url": "..." } }
    // External files: { "type": "external", "external": { "url": "..." } }
    if file_obj["type"].as_str() == Some("file") {
        file_obj["file"]["url"].as_str().unwrap_or("").to_string()
    } else if file_obj["type"].as_str() == Some("external") {
        file_obj["external"]["url"].as_str().unwrap_or("").to_string()
    } else {
        // Fallback: try both paths
        file_obj["file"]["url"].as_str()
            .or_else(|| file_obj["external"]["url"].as_str())
            .unwrap_or("")
            .to_string()
    }
}

/// Extract attachment info from blocks
fn extract_attachments(blocks: &[Value]) -> Vec<NotionAttachment> {
    let mut attachments = Vec::new();

    for block in blocks {
        let block_type = block["type"].as_str().unwrap_or("");
        let block_id = block["id"].as_str().unwrap_or("").to_string();

        match block_type {
            "file" => {
                let url = extract_file_url(&block["file"]);
                let name = block["file"]["name"].as_str()
                    .unwrap_or("attachment")
                    .to_string();
                if !url.is_empty() {
                    attachments.push(NotionAttachment {
                        block_id,
                        file_name: name,
                        file_type: guess_file_type(&url),
                        url,
                    });
                }
            }
            "pdf" => {
                let url = extract_file_url(&block["pdf"]);
                if !url.is_empty() {
                    attachments.push(NotionAttachment {
                        block_id,
                        file_name: "document.pdf".to_string(),
                        file_type: Some("application/pdf".to_string()),
                        url,
                    });
                }
            }
            "image" => {
                let url = extract_file_url(&block["image"]);
                if !url.is_empty() {
                    attachments.push(NotionAttachment {
                        block_id,
                        file_name: "image".to_string(),
                        file_type: guess_file_type(&url),
                        url,
                    });
                }
            }
            _ => {}
        }
    }

    attachments
}

/// Guess file type from URL
fn guess_file_type(url: &str) -> Option<String> {
    let path = url.split('?').next().unwrap_or(url);
    if path.ends_with(".pdf") { Some("application/pdf".to_string()) }
    else if path.ends_with(".png") { Some("image/png".to_string()) }
    else if path.ends_with(".jpg") || path.ends_with(".jpeg") { Some("image/jpeg".to_string()) }
    else if path.ends_with(".gif") { Some("image/gif".to_string()) }
    else if path.ends_with(".svg") { Some("image/svg+xml".to_string()) }
    else if path.ends_with(".webp") { Some("image/webp".to_string()) }
    else if path.ends_with(".xlsx") || path.ends_with(".xls") { Some("application/vnd.ms-excel".to_string()) }
    else if path.ends_with(".docx") || path.ends_with(".doc") { Some("application/msword".to_string()) }
    else if path.ends_with(".csv") { Some("text/csv".to_string()) }
    else { None }
}

/// Get a single page's title
pub async fn get_page_title(page_id: &str) -> CmdResult<String> {
    let api_key = get_api_key()?;
    let url = format!("{}/pages/{}", NOTION_API_BASE, page_id);

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

    let page: Value = response.json().await?;
    Ok(extract_page_title(&page.get("properties").cloned().unwrap_or_default()))
}

/// List all pages from a database (titles + IDs) — for relation field value mapping
pub async fn list_database_pages(database_id: &str) -> CmdResult<Vec<(String, String)>> {
    let api_key = get_api_key()?;
    let mut all_pages: Vec<(String, String)> = Vec::new();
    let mut cursor: Option<String> = None;

    loop {
        let mut url = format!("{}/databases/{}/query", NOTION_API_BASE, database_id);
        let mut body = json!({ "page_size": 100 });

        if let Some(ref c) = cursor {
            body["start_cursor"] = Value::String(c.clone());
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

        let result: Value = response.json().await?;
        if let Some(results) = result["results"].as_array() {
            for page in results {
                let id = page["id"].as_str().unwrap_or("").to_string();
                let title = extract_page_title(&page.get("properties").cloned().unwrap_or_default());
                if !id.is_empty() && title != "Untitled" {
                    all_pages.push((id, title));
                }
            }
        }

        if result["has_more"].as_bool() == Some(true) {
            cursor = result["next_cursor"].as_str().map(|s| s.to_string());
        } else {
            break;
        }
    }

    Ok(all_pages)
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
