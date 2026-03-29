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
