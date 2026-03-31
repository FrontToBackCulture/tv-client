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
#[allow(dead_code)]
pub async fn query_database(
    database_id: &str,
    filter: Option<&Value>,
    since: Option<&str>,
) -> CmdResult<QueryResult> {
    query_database_ex(database_id, filter, since, false).await
}

/// Query with option to use created_time instead of last_edited_time for the since filter
pub async fn query_database_ex(
    database_id: &str,
    filter: Option<&Value>,
    since: Option<&str>,
    use_created_time: bool,
) -> CmdResult<QueryResult> {
    // Clone filter so we can own it for the retry path
    let filter_owned = filter.cloned();
    let since_owned = since.map(|s| s.to_string());

    match query_database_with_filter_ex(database_id, filter_owned.as_ref(), since_owned.as_deref(), use_created_time).await {
        Ok(pages) => Ok(QueryResult { pages, filter_warning: None }),
        Err(CommandError::Http { status: 400, body }) if filter.is_some() => {
            // Filter was rejected — extract error message and retry without it
            let warning = parse_notion_error(&body);
            eprintln!(
                "[notion:query] Filter rejected (400), retrying without filter. Error: {}",
                warning
            );
            let pages = query_database_with_filter_ex(database_id, None, since_owned.as_deref(), use_created_time).await?;
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

#[allow(dead_code)]
/// Query implementation with optional filter (legacy wrapper)
async fn query_database_with_filter(
    database_id: &str,
    filter: Option<&Value>,
    since: Option<&str>,
) -> CmdResult<Vec<NotionPage>> {
    query_database_with_filter_ex(database_id, filter, since, false).await
}

/// Query implementation with optional filter and timestamp type selection
async fn query_database_with_filter_ex(
    database_id: &str,
    filter: Option<&Value>,
    since: Option<&str>,
    use_created_time: bool,
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
        let combined_filter = build_query_filter(filter, since, use_created_time);
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
fn build_query_filter(user_filter: Option<&Value>, since: Option<&str>, use_created_time: bool) -> Option<Value> {
    let since_filter = since.map(|ts| {
        if use_created_time {
            json!({
                "timestamp": "created_time",
                "created_time": { "after": ts }
            })
        } else {
            json!({
                "timestamp": "last_edited_time",
                "last_edited_time": { "after": ts }
            })
        }
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

/// Fetch block children with 2 levels of recursion for UI rendering.
/// Children are nested inside the block type content (e.g., toggle.children)
/// so they're compatible with react-notion-render.
pub async fn fetch_block_children(block_id: &str) -> CmdResult<Vec<Value>> {
    let mut blocks = fetch_blocks_recursive(block_id, 0, 2).await?;
    // Move _children into the block type content (e.g., toggle.children)
    // so react-notion-render can find them
    nest_children(&mut blocks);
    Ok(blocks)
}

/// Recursively move `_children` into `block[type].children` for react-notion-render compatibility
fn nest_children(blocks: &mut [Value]) {
    for block in blocks.iter_mut() {
        if let Some(children) = block.get("_children").cloned() {
            if let Some(block_type) = block.get("type").and_then(|t| t.as_str()).map(|s| s.to_string()) {
                // Move children into the type-specific content
                if let Some(type_content) = block.get_mut(&block_type) {
                    type_content["children"] = children.clone();
                }
                // Also recursively nest for deeper levels
                if let Some(kids) = block.get_mut(&block_type)
                    .and_then(|tc| tc.get_mut("children"))
                    .and_then(|c| c.as_array_mut())
                {
                    nest_children(kids);
                }
            }
            // Remove _children to keep response clean
            if let Some(obj) = block.as_object_mut() {
                obj.remove("_children");
            }
        }
    }
}

/// Fetch all block children for a page and convert to markdown
pub async fn get_page_content_as_markdown(page_id: &str) -> CmdResult<String> {
    let blocks = fetch_blocks_recursive(page_id, 0, 5).await?;
    Ok(blocks_to_markdown(&blocks, 0))
}

/// Fetch page blocks recursively (raw with _children), for TipTap conversion
pub async fn get_page_blocks_raw(page_id: &str) -> CmdResult<Vec<Value>> {
    fetch_blocks_recursive(page_id, 0, 5).await
}

/// Fetch block children with pagination, recursively fetching nested children
/// up to `max_depth` levels deep. Each block with children gets a "_children" key added.
fn fetch_blocks_recursive(block_id: &str, depth: u32, max_depth: u32) -> std::pin::Pin<Box<dyn std::future::Future<Output = CmdResult<Vec<Value>>> + Send + '_>> {
    Box::pin(async move { fetch_blocks_inner(block_id, depth, max_depth).await })
}

async fn fetch_blocks_inner(block_id: &str, depth: u32, max_depth: u32) -> CmdResult<Vec<Value>> {
    let api_key = get_api_key()?;
    let mut all_blocks: Vec<Value> = Vec::new();
    let mut cursor: Option<String> = None;

    loop {
        let mut url = format!("{}/blocks/{}/children?page_size=100", NOTION_API_BASE, block_id);
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

    // Recursively fetch children for blocks that have them
    if depth < max_depth {
        for block in &mut all_blocks {
            if block["has_children"].as_bool() == Some(true) {
                let block_id = match block["id"].as_str() {
                    Some(id) => id.to_string(),
                    None => continue,
                };
                // Skip child_page and child_database — those are separate pages
                let block_type = block["type"].as_str().unwrap_or("");
                if block_type == "child_page" || block_type == "child_database" {
                    continue;
                }
                if let Ok(children) = fetch_blocks_recursive(&block_id, depth + 1, max_depth).await {
                    block["_children"] = Value::Array(children);
                }
                // Rate limit
                tokio::time::sleep(std::time::Duration::from_millis(30)).await;
            }
        }
    }

    Ok(all_blocks)
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

    let markdown = blocks_to_markdown(&all_blocks, 0);
    let attachments = extract_attachments(&all_blocks);
    Ok((markdown, attachments))
}

/// Convert Notion blocks to clean, simple markdown.
/// Uses bullet points for all list types with 4-space indentation for nesting.
fn blocks_to_markdown(blocks: &[Value], depth: usize) -> String {
    let mut out = String::new();
    let indent = "    ".repeat(depth); // 4 spaces per level — standard markdown nesting

    for block in blocks {
        let bt = block["type"].as_str().unwrap_or("");
        let children = block.get("_children").and_then(|c| c.as_array());

        match bt {
            "paragraph" => {
                let text = rich_text_to_md(&block["paragraph"]["rich_text"]);
                if text.is_empty() {
                    out.push('\n');
                } else {
                    out.push_str(&format!("{}{}\n", indent, text));
                }
            }
            "heading_1" => out.push_str(&format!("# {}\n", rich_text_to_md(&block["heading_1"]["rich_text"]))),
            "heading_2" => out.push_str(&format!("## {}\n", rich_text_to_md(&block["heading_2"]["rich_text"]))),
            "heading_3" => out.push_str(&format!("### {}\n", rich_text_to_md(&block["heading_3"]["rich_text"]))),

            "bulleted_list_item" | "numbered_list_item" => {
                let key = if bt == "bulleted_list_item" { "bulleted_list_item" } else { "numbered_list_item" };
                let text = rich_text_to_md(&block[key]["rich_text"]);
                out.push_str(&format!("{}- {}\n", indent, text));
                if let Some(kids) = children {
                    out.push_str(&blocks_to_markdown(kids, depth + 1));
                }
            }

            "to_do" => {
                let checked = block["to_do"]["checked"].as_bool().unwrap_or(false);
                let marker = if checked { "[x]" } else { "[ ]" };
                out.push_str(&format!("{}- {} {}\n", indent, marker, rich_text_to_md(&block["to_do"]["rich_text"])));
            }

            "toggle" => {
                let text = rich_text_to_md(&block["toggle"]["rich_text"]);
                out.push_str(&format!("\n{}**{}**\n", indent, text));
                if let Some(kids) = children {
                    out.push_str(&blocks_to_markdown(kids, depth + 1));
                }
                out.push('\n');
            }

            "quote" => out.push_str(&format!("{}> {}\n", indent, rich_text_to_md(&block["quote"]["rich_text"]))),
            "callout" => out.push_str(&format!("{}> {}\n", indent, rich_text_to_md(&block["callout"]["rich_text"]))),

            "code" => {
                let lang = block["code"]["language"].as_str().unwrap_or("");
                let code = rich_text_to_md(&block["code"]["rich_text"]);
                out.push_str(&format!("```{}\n{}\n```\n", lang, code));
            }

            "divider" => out.push_str("\n---\n\n"),

            "image" => {
                let url = extract_file_url(&block["image"]);
                let caption = rich_text_to_md(&block["image"]["caption"]);
                let label = if caption.is_empty() { "image".to_string() } else { caption };
                out.push_str(&format!("{}![{}]({})\n", indent, label, url));
            }

            "file" => {
                // Show filename only — Notion file URLs are temporary signed URLs
                let name = block["file"]["name"].as_str()
                    .or_else(|| block["file"]["caption"].as_array()
                        .and_then(|a| a.first())
                        .and_then(|t| t["plain_text"].as_str()))
                    .unwrap_or("file");
                out.push_str(&format!("{}- {}\n", indent, name));
            }
            "pdf" => {
                out.push_str(&format!("{}- PDF attachment\n", indent));
            }

            "bookmark" | "link_preview" => {
                let url_key = if bt == "bookmark" { "bookmark" } else { "link_preview" };
                let url = block[url_key]["url"].as_str().unwrap_or("");
                let caption = if bt == "bookmark" {
                    rich_text_to_md(&block["bookmark"]["caption"])
                } else { String::new() };
                if caption.is_empty() {
                    out.push_str(&format!("{}{}\n", indent, url));
                } else {
                    out.push_str(&format!("{}[{}]({})\n", indent, caption, url));
                }
            }

            "table" => {
                if let Some(rows) = children {
                    out.push('\n');
                    for (i, row) in rows.iter().enumerate() {
                        if let Some(cells) = row.get("table_row")
                            .and_then(|tr| tr.get("cells"))
                            .and_then(|c| c.as_array())
                        {
                            let cell_texts: Vec<String> = cells.iter()
                                .map(|cell| rich_text_to_md(cell).replace('|', "/"))
                                .collect();
                            out.push_str(&format!("| {} |\n", cell_texts.join(" | ")));
                            if i == 0 {
                                let sep = cell_texts.iter().map(|_| "---").collect::<Vec<_>>().join(" | ");
                                out.push_str(&format!("| {} |\n", sep));
                            }
                        }
                    }
                    out.push('\n');
                }
                // table handles its own children — skip the generic handler below
                continue;
            }

            "child_page" => {
                let title = block["child_page"]["title"].as_str().unwrap_or("Untitled");
                out.push_str(&format!("{}- **{}**\n", indent, title));
            }
            "child_database" => {
                let title = block["child_database"]["title"].as_str().unwrap_or("Untitled");
                out.push_str(&format!("{}- **{}**\n", indent, title));
            }

            "column_list" => {
                if let Some(cols) = children {
                    for col in cols {
                        if let Some(col_kids) = col.get("_children").and_then(|c| c.as_array()) {
                            out.push_str(&blocks_to_markdown(col_kids, depth));
                        }
                    }
                }
                continue; // already handled children
            }
            "column" => continue,

            _ => {}
        }

        // Generic child handler for block types that don't handle their own children
        let self_handled = matches!(bt,
            "bulleted_list_item" | "numbered_list_item" | "toggle" | "table" |
            "column_list" | "column" | "child_page" | "child_database"
        );
        if !self_handled {
            if let Some(kids) = children {
                out.push_str(&blocks_to_markdown(kids, depth + 1));
            }
        }
    }

    // Collapse 3+ consecutive newlines into 2
    let mut result = String::new();
    let mut newline_count = 0;
    for ch in out.chars() {
        if ch == '\n' {
            newline_count += 1;
            if newline_count <= 2 {
                result.push(ch);
            }
        } else {
            newline_count = 0;
            result.push(ch);
        }
    }

    result
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

// ─── TipTap JSON converter ───────────────────────────────────────────────
// Converts Notion API blocks to TipTap-compatible JSON with proper
// details/summary nodes for toggle blocks.

/// Convert Notion blocks to TipTap JSON document
pub fn blocks_to_tiptap_json(blocks: &[Value]) -> Value {
    let content = blocks_to_tiptap_nodes(blocks);
    serde_json::json!({
        "type": "doc",
        "content": content
    })
}

fn blocks_to_tiptap_nodes(blocks: &[Value]) -> Vec<Value> {
    let mut nodes: Vec<Value> = Vec::new();

    for block in blocks {
        let bt = block["type"].as_str().unwrap_or("");
        let children = block.get("_children").and_then(|c| c.as_array());

        match bt {
            "paragraph" => {
                let content = rich_text_to_tiptap(&block["paragraph"]["rich_text"]);
                nodes.push(serde_json::json!({
                    "type": "paragraph",
                    "content": content
                }));
                if let Some(kids) = children {
                    nodes.extend(blocks_to_tiptap_nodes(kids));
                }
            }

            "heading_1" | "heading_2" | "heading_3" => {
                let key = bt;
                let content = rich_text_to_tiptap(&block[key]["rich_text"]);
                let is_toggleable = block[key]["is_toggleable"].as_bool() == Some(true);

                if is_toggleable && children.is_some() {
                    // Toggle heading → details/summary node
                    let mut details_body = blocks_to_tiptap_nodes(children.unwrap());
                    if details_body.is_empty() {
                        details_body.push(serde_json::json!({ "type": "paragraph" }));
                    }
                    nodes.push(serde_json::json!({
                        "type": "details",
                        "attrs": { "open": true },
                        "content": [
                            { "type": "detailsSummary", "content": content },
                            { "type": "detailsContent", "content": details_body }
                        ]
                    }));
                } else {
                    let level = match bt {
                        "heading_1" => 1,
                        "heading_2" => 2,
                        _ => 3,
                    };
                    nodes.push(serde_json::json!({
                        "type": "heading",
                        "attrs": { "level": level },
                        "content": content
                    }));
                    // Non-toggleable headings with children (rare but possible)
                    if let Some(kids) = children {
                        nodes.extend(blocks_to_tiptap_nodes(kids));
                    }
                }
            }

            "bulleted_list_item" => {
                let content = rich_text_to_tiptap(&block["bulleted_list_item"]["rich_text"]);
                let mut li_content = vec![serde_json::json!({
                    "type": "paragraph",
                    "content": content
                })];
                if let Some(kids) = children {
                    li_content.push(serde_json::json!({
                        "type": "bulletList",
                        "content": kids.iter().map(|k| {
                            let kid_content = rich_text_to_tiptap(&k[k["type"].as_str().unwrap_or("")]["rich_text"]);
                            let kid_children = k.get("_children").and_then(|c| c.as_array());
                            let mut inner = vec![serde_json::json!({ "type": "paragraph", "content": kid_content })];
                            if let Some(grandkids) = kid_children {
                                inner.extend(blocks_to_tiptap_nodes(grandkids));
                            }
                            serde_json::json!({ "type": "listItem", "content": inner })
                        }).collect::<Vec<_>>()
                    }));
                }
                nodes.push(serde_json::json!({
                    "type": "bulletList",
                    "content": [{ "type": "listItem", "content": li_content }]
                }));
            }

            "numbered_list_item" => {
                let content = rich_text_to_tiptap(&block["numbered_list_item"]["rich_text"]);
                let mut li_content = vec![serde_json::json!({
                    "type": "paragraph",
                    "content": content
                })];
                if let Some(kids) = children {
                    li_content.extend(blocks_to_tiptap_nodes(kids));
                }
                nodes.push(serde_json::json!({
                    "type": "orderedList",
                    "content": [{ "type": "listItem", "content": li_content }]
                }));
            }

            "to_do" => {
                let checked = block["to_do"]["checked"].as_bool().unwrap_or(false);
                let content = rich_text_to_tiptap(&block["to_do"]["rich_text"]);
                nodes.push(serde_json::json!({
                    "type": "taskList",
                    "content": [{
                        "type": "taskItem",
                        "attrs": { "checked": checked },
                        "content": [{ "type": "paragraph", "content": content }]
                    }]
                }));
            }

            "toggle" => {
                let summary_content = rich_text_to_tiptap(&block["toggle"]["rich_text"]);
                let mut details_body = vec![];
                if let Some(kids) = children {
                    details_body = blocks_to_tiptap_nodes(kids);
                }
                if details_body.is_empty() {
                    details_body.push(serde_json::json!({ "type": "paragraph" }));
                }
                nodes.push(serde_json::json!({
                    "type": "details",
                    "content": [
                        {
                            "type": "detailsSummary",
                            "content": summary_content
                        },
                        {
                            "type": "detailsContent",
                            "content": details_body
                        }
                    ]
                }));
            }

            "quote" => {
                let content = rich_text_to_tiptap(&block["quote"]["rich_text"]);
                nodes.push(serde_json::json!({
                    "type": "blockquote",
                    "content": [{ "type": "paragraph", "content": content }]
                }));
            }

            "callout" => {
                let content = rich_text_to_tiptap(&block["callout"]["rich_text"]);
                nodes.push(serde_json::json!({
                    "type": "blockquote",
                    "content": [{ "type": "paragraph", "content": content }]
                }));
            }

            "code" => {
                let lang = block["code"]["language"].as_str().unwrap_or("");
                let text = block["code"]["rich_text"].as_array()
                    .map(|arr| arr.iter().map(|rt| rt["plain_text"].as_str().unwrap_or("")).collect::<Vec<_>>().join(""))
                    .unwrap_or_default();
                nodes.push(serde_json::json!({
                    "type": "codeBlock",
                    "attrs": { "language": lang },
                    "content": [{ "type": "text", "text": text }]
                }));
            }

            "divider" => {
                nodes.push(serde_json::json!({ "type": "horizontalRule" }));
            }

            "image" => {
                let url = extract_file_url(&block["image"]);
                let caption = block["image"]["caption"].as_array()
                    .map(|arr| arr.iter().map(|rt| rt["plain_text"].as_str().unwrap_or("")).collect::<Vec<_>>().join(""))
                    .unwrap_or_default();
                // Render as a paragraph with the image link for now
                nodes.push(serde_json::json!({
                    "type": "paragraph",
                    "content": [{
                        "type": "text",
                        "text": if caption.is_empty() { format!("[image]({})", url) } else { format!("[{}]({})", caption, url) },
                        "marks": [{ "type": "link", "attrs": { "href": url } }]
                    }]
                }));
            }

            "table" => {
                if let Some(rows) = children {
                    let mut table_rows = Vec::new();
                    for (i, row) in rows.iter().enumerate() {
                        if let Some(cells) = row.get("table_row")
                            .and_then(|tr| tr.get("cells"))
                            .and_then(|c| c.as_array())
                        {
                            let cell_type = if i == 0 { "tableHeader" } else { "tableCell" };
                            let tiptap_cells: Vec<Value> = cells.iter().map(|cell| {
                                let content = rich_text_to_tiptap(cell);
                                serde_json::json!({
                                    "type": cell_type,
                                    "content": [{ "type": "paragraph", "content": content }]
                                })
                            }).collect();
                            table_rows.push(serde_json::json!({
                                "type": "tableRow",
                                "content": tiptap_cells
                            }));
                        }
                    }
                    nodes.push(serde_json::json!({
                        "type": "table",
                        "content": table_rows
                    }));
                }
            }

            "bookmark" | "link_preview" => {
                let url_key = if bt == "bookmark" { "bookmark" } else { "link_preview" };
                let url = block[url_key]["url"].as_str().unwrap_or("");
                let caption = if bt == "bookmark" {
                    block["bookmark"]["caption"].as_array()
                        .map(|arr| arr.iter().map(|rt| rt["plain_text"].as_str().unwrap_or("")).collect::<Vec<_>>().join(""))
                        .unwrap_or_default()
                } else { String::new() };
                let label = if caption.is_empty() { url.to_string() } else { caption };
                nodes.push(serde_json::json!({
                    "type": "paragraph",
                    "content": [{
                        "type": "text",
                        "text": label,
                        "marks": [{ "type": "link", "attrs": { "href": url } }]
                    }]
                }));
            }

            "child_page" | "child_database" => {
                let key = bt;
                let title = block[key]["title"].as_str().unwrap_or("Untitled");
                nodes.push(serde_json::json!({
                    "type": "paragraph",
                    "content": [{ "type": "text", "text": title, "marks": [{ "type": "bold" }] }]
                }));
            }

            "column_list" => {
                if let Some(cols) = children {
                    for col in cols {
                        if let Some(col_kids) = col.get("_children").and_then(|c| c.as_array()) {
                            nodes.extend(blocks_to_tiptap_nodes(col_kids));
                        }
                    }
                }
            }
            "column" => {} // handled by column_list

            _ => {
                // Unknown block type — skip but process children
                if let Some(kids) = children {
                    nodes.extend(blocks_to_tiptap_nodes(kids));
                }
            }
        }
    }

    nodes
}

/// Convert Notion rich_text array to TipTap inline content nodes
fn rich_text_to_tiptap(rich_text: &Value) -> Vec<Value> {
    let arr = match rich_text.as_array() {
        Some(a) => a,
        None => return vec![],
    };

    arr.iter()
        .filter_map(|rt| {
            let text = rt["plain_text"].as_str().unwrap_or("");
            if text.is_empty() { return None; }

            let annotations = &rt["annotations"];
            let mut marks: Vec<Value> = Vec::new();

            if annotations["bold"].as_bool() == Some(true) {
                marks.push(serde_json::json!({ "type": "bold" }));
            }
            if annotations["italic"].as_bool() == Some(true) {
                marks.push(serde_json::json!({ "type": "italic" }));
            }
            if annotations["strikethrough"].as_bool() == Some(true) {
                marks.push(serde_json::json!({ "type": "strike" }));
            }
            if annotations["code"].as_bool() == Some(true) {
                marks.push(serde_json::json!({ "type": "code" }));
            }
            if let Some(url) = rt["href"].as_str() {
                marks.push(serde_json::json!({ "type": "link", "attrs": { "href": url } }));
            }

            let mut node = serde_json::json!({ "type": "text", "text": text });
            if !marks.is_empty() {
                node["marks"] = serde_json::json!(marks);
            }
            Some(node)
        })
        .collect()
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

/// Get a full Notion page (properties + metadata)
pub async fn get_page(page_id: &str) -> CmdResult<NotionPage> {
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
    Ok(NotionPage {
        id: page["id"].as_str().unwrap_or(page_id).to_string(),
        properties: page.get("properties").cloned().unwrap_or_default(),
        last_edited_time: page["last_edited_time"].as_str().map(|s| s.to_string()),
        created_time: page["created_time"].as_str().map(|s| s.to_string()),
        url: page["url"].as_str().map(|s| s.to_string()),
    })
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

/// Check if a Notion page is archived
pub async fn get_page_archived(page_id: &str) -> CmdResult<bool> {
    let api_key = get_api_key()?;
    let url = format!("{}/pages/{}", NOTION_API_BASE, page_id);

    let response = HTTP_CLIENT
        .get(&url)
        .headers(notion_headers(&api_key))
        .send()
        .await?;

    if !response.status().is_success() {
        return Ok(false); // If we can't fetch, assume not archived
    }

    let page: Value = response.json().await?;
    Ok(page["archived"].as_bool().unwrap_or(false))
}

/// List all pages from a database (titles + IDs) — for relation field value mapping
pub async fn list_database_pages(database_id: &str) -> CmdResult<Vec<(String, String)>> {
    let api_key = get_api_key()?;
    let mut all_pages: Vec<(String, String)> = Vec::new();
    let mut cursor: Option<String> = None;

    loop {
        let url = format!("{}/databases/{}/query", NOTION_API_BASE, database_id);
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

// ============================================================================
// Push: tv-client → Notion
// ============================================================================

/// Convert TipTap JSON content to Notion block objects
pub fn tiptap_json_to_blocks(doc: &Value) -> Vec<Value> {
    let content = match doc.get("content").and_then(|c| c.as_array()) {
        Some(c) => c,
        None => return vec![],
    };
    tiptap_nodes_to_blocks(content)
}

fn tiptap_nodes_to_blocks(nodes: &[Value]) -> Vec<Value> {
    let mut blocks = Vec::new();

    for node in nodes {
        let node_type = node["type"].as_str().unwrap_or("");
        match node_type {
            "paragraph" => {
                let rich_text = tiptap_inline_to_rich_text(node.get("content"));
                blocks.push(serde_json::json!({
                    "object": "block",
                    "type": "paragraph",
                    "paragraph": { "rich_text": rich_text }
                }));
            }

            "heading" => {
                let level = node["attrs"]["level"].as_u64().unwrap_or(1);
                let rich_text = tiptap_inline_to_rich_text(node.get("content"));
                let ht = match level { 1 => "heading_1", 2 => "heading_2", _ => "heading_3" };
                blocks.push(serde_json::json!({
                    "object": "block",
                    "type": ht,
                    ht: { "rich_text": rich_text }
                }));
            }

            "bulletList" => {
                if let Some(items) = node.get("content").and_then(|c| c.as_array()) {
                    for item in items {
                        let (text, children) = extract_list_item_content(item);
                        let mut block = serde_json::json!({
                            "object": "block",
                            "type": "bulleted_list_item",
                            "bulleted_list_item": { "rich_text": text }
                        });
                        if !children.is_empty() {
                            block["bulleted_list_item"]["children"] = serde_json::json!(children);
                        }
                        blocks.push(block);
                    }
                }
            }

            "orderedList" => {
                if let Some(items) = node.get("content").and_then(|c| c.as_array()) {
                    for item in items {
                        let (text, children) = extract_list_item_content(item);
                        let mut block = serde_json::json!({
                            "object": "block",
                            "type": "numbered_list_item",
                            "numbered_list_item": { "rich_text": text }
                        });
                        if !children.is_empty() {
                            block["numbered_list_item"]["children"] = serde_json::json!(children);
                        }
                        blocks.push(block);
                    }
                }
            }

            "details" => {
                // TipTap details → Notion toggle block
                let content = node.get("content").and_then(|c| c.as_array());
                let summary_text = content.and_then(|c| c.iter().find(|n| n["type"].as_str() == Some("detailsSummary")))
                    .map(|s| tiptap_inline_to_rich_text(s.get("content")))
                    .unwrap_or_default();
                let body_nodes = content.and_then(|c| c.iter().find(|n| n["type"].as_str() == Some("detailsContent")))
                    .and_then(|dc| dc.get("content").and_then(|c| c.as_array()))
                    .map(|nodes| tiptap_nodes_to_blocks(nodes))
                    .unwrap_or_default();

                let mut block = serde_json::json!({
                    "object": "block",
                    "type": "toggle",
                    "toggle": { "rich_text": summary_text }
                });
                if !body_nodes.is_empty() {
                    block["toggle"]["children"] = serde_json::json!(body_nodes);
                }
                blocks.push(block);
            }

            "blockquote" => {
                let inner = node.get("content").and_then(|c| c.as_array());
                let rich_text = inner.and_then(|nodes| nodes.first())
                    .map(|p| tiptap_inline_to_rich_text(p.get("content")))
                    .unwrap_or_default();
                blocks.push(serde_json::json!({
                    "object": "block",
                    "type": "quote",
                    "quote": { "rich_text": rich_text }
                }));
            }

            "codeBlock" => {
                let lang = node["attrs"]["language"].as_str().unwrap_or("plain text");
                let text = node.get("content").and_then(|c| c.as_array())
                    .map(|arr| arr.iter().map(|n| n["text"].as_str().unwrap_or("")).collect::<Vec<_>>().join(""))
                    .unwrap_or_default();
                blocks.push(serde_json::json!({
                    "object": "block",
                    "type": "code",
                    "code": {
                        "rich_text": [{ "type": "text", "text": { "content": text } }],
                        "language": lang
                    }
                }));
            }

            "horizontalRule" => {
                blocks.push(serde_json::json!({
                    "object": "block",
                    "type": "divider",
                    "divider": {}
                }));
            }

            "table" => {
                if let Some(rows) = node.get("content").and_then(|c| c.as_array()) {
                    let mut table_rows = Vec::new();
                    for row in rows {
                        if let Some(cells) = row.get("content").and_then(|c| c.as_array()) {
                            let cell_texts: Vec<Value> = cells.iter().map(|cell| {
                                let inner = cell.get("content").and_then(|c| c.as_array())
                                    .and_then(|nodes| nodes.first())
                                    .map(|p| tiptap_inline_to_rich_text(p.get("content")))
                                    .unwrap_or_default();
                                serde_json::json!(inner)
                            }).collect();
                            table_rows.push(serde_json::json!({
                                "type": "table_row",
                                "table_row": { "cells": cell_texts }
                            }));
                        }
                    }
                    let width = table_rows.first()
                        .and_then(|r| r["table_row"]["cells"].as_array())
                        .map(|c| c.len())
                        .unwrap_or(1);
                    blocks.push(serde_json::json!({
                        "object": "block",
                        "type": "table",
                        "table": {
                            "table_width": width,
                            "has_column_header": true,
                            "children": table_rows
                        }
                    }));
                }
            }

            _ => {
                // Unknown node — try to convert children
                if let Some(content) = node.get("content").and_then(|c| c.as_array()) {
                    blocks.extend(tiptap_nodes_to_blocks(content));
                }
            }
        }
    }
    blocks
}

fn extract_list_item_content(item: &Value) -> (Vec<Value>, Vec<Value>) {
    let content = item.get("content").and_then(|c| c.as_array());
    let mut rich_text = vec![];
    let mut children = vec![];

    if let Some(nodes) = content {
        for node in nodes {
            match node["type"].as_str().unwrap_or("") {
                "paragraph" => {
                    rich_text = tiptap_inline_to_rich_text(node.get("content"));
                }
                _ => {
                    children.extend(tiptap_nodes_to_blocks(&[node.clone()]));
                }
            }
        }
    }
    (rich_text, children)
}

fn tiptap_inline_to_rich_text(content: Option<&Value>) -> Vec<Value> {
    let arr = match content.and_then(|c| c.as_array()) {
        Some(a) => a,
        None => return vec![],
    };

    arr.iter().filter_map(|node| {
        let text = node["text"].as_str()?;
        if text.is_empty() { return None; }

        let mut annotations = serde_json::json!({
            "bold": false, "italic": false, "strikethrough": false,
            "underline": false, "code": false, "color": "default"
        });
        let mut href: Option<String> = None;

        if let Some(marks) = node.get("marks").and_then(|m| m.as_array()) {
            for mark in marks {
                match mark["type"].as_str().unwrap_or("") {
                    "bold" => annotations["bold"] = serde_json::json!(true),
                    "italic" => annotations["italic"] = serde_json::json!(true),
                    "strike" => annotations["strikethrough"] = serde_json::json!(true),
                    "code" => annotations["code"] = serde_json::json!(true),
                    "link" => href = mark["attrs"]["href"].as_str().map(|s| s.to_string()),
                    _ => {}
                }
            }
        }

        let mut rt = serde_json::json!({
            "type": "text",
            "text": { "content": text },
            "annotations": annotations
        });
        if let Some(url) = href {
            rt["text"]["link"] = serde_json::json!({ "url": url });
        }
        Some(rt)
    }).collect()
}

/// Convert markdown text to Notion block objects
pub fn markdown_to_blocks(markdown: &str) -> Vec<Value> {
    let mut blocks: Vec<Value> = Vec::new();

    for line in markdown.lines() {
        let trimmed = line.trim_end();

        if trimmed.is_empty() {
            // Empty paragraph
            blocks.push(json!({
                "object": "block",
                "type": "paragraph",
                "paragraph": { "rich_text": [] }
            }));
            continue;
        }

        // Headings
        if let Some(text) = trimmed.strip_prefix("### ") {
            blocks.push(json!({
                "object": "block",
                "type": "heading_3",
                "heading_3": { "rich_text": md_inline_to_rich_text(text) }
            }));
        } else if let Some(text) = trimmed.strip_prefix("## ") {
            blocks.push(json!({
                "object": "block",
                "type": "heading_2",
                "heading_2": { "rich_text": md_inline_to_rich_text(text) }
            }));
        } else if let Some(text) = trimmed.strip_prefix("# ") {
            blocks.push(json!({
                "object": "block",
                "type": "heading_1",
                "heading_1": { "rich_text": md_inline_to_rich_text(text) }
            }));
        }
        // Bulleted list
        else if let Some(text) = trimmed.strip_prefix("- [ ] ") {
            blocks.push(json!({
                "object": "block",
                "type": "to_do",
                "to_do": { "rich_text": md_inline_to_rich_text(text), "checked": false }
            }));
        } else if let Some(text) = trimmed.strip_prefix("- [x] ") {
            blocks.push(json!({
                "object": "block",
                "type": "to_do",
                "to_do": { "rich_text": md_inline_to_rich_text(text), "checked": true }
            }));
        } else if let Some(text) = trimmed.strip_prefix("- ") {
            blocks.push(json!({
                "object": "block",
                "type": "bulleted_list_item",
                "bulleted_list_item": { "rich_text": md_inline_to_rich_text(text) }
            }));
        }
        // Numbered list (e.g., "1. text")
        else if trimmed.len() > 2 && trimmed.chars().next().map_or(false, |c| c.is_ascii_digit()) {
            if let Some(pos) = trimmed.find(". ") {
                if trimmed[..pos].chars().all(|c| c.is_ascii_digit()) {
                    let text = &trimmed[pos + 2..];
                    blocks.push(json!({
                        "object": "block",
                        "type": "numbered_list_item",
                        "numbered_list_item": { "rich_text": md_inline_to_rich_text(text) }
                    }));
                    continue;
                }
            }
            // Not a numbered list, fall through to paragraph
            blocks.push(json!({
                "object": "block",
                "type": "paragraph",
                "paragraph": { "rich_text": md_inline_to_rich_text(trimmed) }
            }));
        }
        // Blockquote
        else if let Some(text) = trimmed.strip_prefix("> ") {
            blocks.push(json!({
                "object": "block",
                "type": "quote",
                "quote": { "rich_text": md_inline_to_rich_text(text) }
            }));
        }
        // Divider
        else if trimmed == "---" || trimmed == "***" || trimmed == "___" {
            blocks.push(json!({
                "object": "block",
                "type": "divider",
                "divider": {}
            }));
        }
        // Regular paragraph
        else {
            blocks.push(json!({
                "object": "block",
                "type": "paragraph",
                "paragraph": { "rich_text": md_inline_to_rich_text(trimmed) }
            }));
        }
    }

    blocks
}

/// Convert inline markdown to Notion rich_text array
/// Handles **bold**, *italic*, `code`, ~~strikethrough~~, and [links](url)
fn md_inline_to_rich_text(text: &str) -> Vec<Value> {
    // Simple approach: parse inline formatting segments
    let mut result: Vec<Value> = Vec::new();
    let mut remaining = text;

    while !remaining.is_empty() {
        // Bold
        if remaining.starts_with("**") {
            if let Some(end) = remaining[2..].find("**") {
                let content = &remaining[2..2 + end];
                result.push(json!({
                    "type": "text",
                    "text": { "content": content },
                    "annotations": { "bold": true }
                }));
                remaining = &remaining[4 + end..];
                continue;
            }
        }
        // Italic
        if remaining.starts_with('*') && !remaining.starts_with("**") {
            if let Some(end) = remaining[1..].find('*') {
                let content = &remaining[1..1 + end];
                result.push(json!({
                    "type": "text",
                    "text": { "content": content },
                    "annotations": { "italic": true }
                }));
                remaining = &remaining[2 + end..];
                continue;
            }
        }
        // Code
        if remaining.starts_with('`') && !remaining.starts_with("```") {
            if let Some(end) = remaining[1..].find('`') {
                let content = &remaining[1..1 + end];
                result.push(json!({
                    "type": "text",
                    "text": { "content": content },
                    "annotations": { "code": true }
                }));
                remaining = &remaining[2 + end..];
                continue;
            }
        }
        // Strikethrough
        if remaining.starts_with("~~") {
            if let Some(end) = remaining[2..].find("~~") {
                let content = &remaining[2..2 + end];
                result.push(json!({
                    "type": "text",
                    "text": { "content": content },
                    "annotations": { "strikethrough": true }
                }));
                remaining = &remaining[4 + end..];
                continue;
            }
        }
        // Link [text](url)
        if remaining.starts_with('[') {
            if let Some(bracket_end) = remaining.find("](") {
                if let Some(paren_end) = remaining[bracket_end + 2..].find(')') {
                    let link_text = &remaining[1..bracket_end];
                    let url = &remaining[bracket_end + 2..bracket_end + 2 + paren_end];
                    result.push(json!({
                        "type": "text",
                        "text": { "content": link_text, "link": { "url": url } }
                    }));
                    remaining = &remaining[bracket_end + 3 + paren_end..];
                    continue;
                }
            }
        }

        // Plain text: consume until next special char
        let next_special = remaining
            .find(|c: char| c == '*' || c == '`' || c == '~' || c == '[')
            .unwrap_or(remaining.len());
        let plain = if next_special == 0 {
            // Special char that didn't match a pattern — consume one char
            &remaining[..1]
        } else {
            &remaining[..next_special]
        };
        result.push(json!({
            "type": "text",
            "text": { "content": plain }
        }));
        remaining = &remaining[plain.len()..];
    }

    if result.is_empty() {
        result.push(json!({
            "type": "text",
            "text": { "content": "" }
        }));
    }

    result
}

/// Create a new page in a Notion database
pub async fn create_page(
    database_id: &str,
    properties: &Value,
    children: &[Value],
) -> CmdResult<String> {
    let api_key = get_api_key()?;
    let url = format!("{}/pages", NOTION_API_BASE);

    let mut body = json!({
        "parent": { "database_id": database_id },
        "properties": properties,
    });

    if !children.is_empty() {
        body["children"] = Value::Array(children.to_vec());
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

    let page: Value = response.json().await?;
    let page_id = page["id"].as_str().unwrap_or("").to_string();
    Ok(page_id)
}

/// Update properties on an existing Notion page
pub async fn update_page_properties(
    page_id: &str,
    properties: &Value,
) -> CmdResult<()> {
    let api_key = get_api_key()?;
    let url = format!("{}/pages/{}", NOTION_API_BASE, page_id);

    let body = json!({ "properties": properties });

    let response = HTTP_CLIENT
        .patch(&url)
        .headers(notion_headers(&api_key))
        .json(&body)
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        return Err(CommandError::Http { status, body });
    }

    Ok(())
}

#[allow(dead_code)]
/// Delete all blocks from a page, then append new ones
pub async fn replace_page_blocks(
    page_id: &str,
    new_blocks: &[Value],
) -> CmdResult<()> {
    let api_key = get_api_key()?;

    // 1. Get existing block children
    let list_url = format!("{}/blocks/{}/children?page_size=100", NOTION_API_BASE, page_id);
    let response = HTTP_CLIENT
        .get(&list_url)
        .headers(notion_headers(&api_key))
        .send()
        .await?;

    if response.status().is_success() {
        let body: Value = response.json().await?;
        if let Some(results) = body["results"].as_array() {
            // Delete each existing block
            for block in results {
                if let Some(block_id) = block["id"].as_str() {
                    let delete_url = format!("{}/blocks/{}", NOTION_API_BASE, block_id);
                    let _ = HTTP_CLIENT
                        .delete(&delete_url)
                        .headers(notion_headers(&api_key))
                        .send()
                        .await;
                    // Small delay to avoid rate limits
                    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                }
            }
        }
    }

    // 2. Append new blocks (Notion allows max 100 blocks per request)
    if !new_blocks.is_empty() {
        let append_url = format!("{}/blocks/{}/children", NOTION_API_BASE, page_id);
        for chunk in new_blocks.chunks(100) {
            let body = json!({ "children": chunk });
            let response = HTTP_CLIENT
                .patch(&append_url)
                .headers(notion_headers(&api_key))
                .json(&body)
                .send()
                .await?;

            if !response.status().is_success() {
                let status = response.status().as_u16();
                let body = response.text().await.unwrap_or_default();
                return Err(CommandError::Http { status, body });
            }
        }
    }

    Ok(())
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
