// Notion → Markdown file export
// Writes Notion pages as .md files to {knowledge_path}/_notion/{config-slug}/
// Runs as a side-effect of the normal Notion sync — same data, written to disk
// so Claude Code can read it directly.

use crate::commands::settings::{settings_get_key, KEY_KNOWLEDGE_PATH};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

use super::mapping;

/// Get the export directory for a sync config.
/// Returns None if knowledge_path is not configured.
pub fn get_export_dir(config_name: &str) -> Option<PathBuf> {
    let knowledge_path = settings_get_key(KEY_KNOWLEDGE_PATH.to_string())
        .ok()
        .flatten()?;
    if knowledge_path.is_empty() {
        return None;
    }
    Some(Path::new(&knowledge_path).join("_notion").join(slugify(config_name)))
}

/// Export a single Notion page as a markdown file.
/// Called per-page during sync, alongside the Supabase upsert.
pub fn export_page_as_markdown(
    export_dir: &Path,
    page: &super::types::NotionPage,
    field_mapping: &Value,
    body_md: Option<&str>,
) -> Result<String, String> {
    // Ensure directory exists
    fs::create_dir_all(export_dir).map_err(|e| format!("mkdir: {}", e))?;

    // Map properties using the same mapping logic as the Supabase sync
    let mapped = mapping::map_page_to_task(&page.properties, field_mapping);
    let title = mapped["title"]
        .as_str()
        .map(|s| s.to_string())
        .unwrap_or_else(|| extract_title(&page.properties));

    // Collect all raw property values for the properties table
    let all_props = extract_all_properties(&page.properties);

    // Build markdown content
    let mut md = String::new();

    // Frontmatter
    md.push_str("---\n");
    md.push_str(&format!("title: {}\n", quote_yaml(&title)));
    md.push_str(&format!("notion_id: \"{}\"\n", page.id));
    md.push_str(&format!("notion_url: \"{}\"\n", page.url.as_deref().unwrap_or("")));
    md.push_str(&format!("status: {}\n", quote_yaml(mapped_str(&mapped, "status_id"))));
    md.push_str(&format!("priority: {}\n", quote_yaml(mapped_str(&mapped, "priority"))));
    md.push_str(&format!("due_date: \"{}\"\n", mapped_str(&mapped, "due_date")));
    md.push_str(&format!("assignee: {}\n", quote_yaml(mapped_str(&mapped, "assignee_id"))));
    md.push_str(&format!("company: {}\n", quote_yaml(mapped_str(&mapped, "company_id"))));
    md.push_str(&format!("created: \"{}\"\n", page.created_time.as_deref().unwrap_or("")));
    md.push_str(&format!("updated: \"{}\"\n", page.last_edited_time.as_deref().unwrap_or("")));
    md.push_str("---\n\n");

    // Title
    md.push_str(&format!("# {}\n\n", title));

    // Properties table
    let prop_entries: Vec<_> = all_props
        .iter()
        .filter(|(k, _)| *k != "Name" && *k != "Title")
        .collect();
    if !prop_entries.is_empty() {
        md.push_str("## Properties\n\n");
        md.push_str("| Property | Value |\n|----------|-------|\n");
        for (k, v) in &prop_entries {
            md.push_str(&format!("| {} | {} |\n", k, v.replace('|', "\\|")));
        }
        md.push_str("\n");
    }

    // Description field (if mapped)
    if let Some(desc) = mapped.get("description").and_then(|v| v.as_str()) {
        if !desc.is_empty() {
            md.push_str(&format!("## Description\n\n{}\n\n", desc));
        }
    }

    // Page body content
    if let Some(body) = body_md {
        let trimmed = body.trim();
        if !trimmed.is_empty() {
            md.push_str(&format!("## Content\n\n{}\n", trimmed));
        }
    }

    // Write file
    let filename = format!("{}.md", slugify(&title));
    let filepath = export_dir.join(&filename);
    fs::write(&filepath, &md).map_err(|e| format!("write: {}", e))?;

    Ok(filename)
}

/// Build/rebuild the _index.md for an export directory by scanning all .md files on disk.
pub fn rebuild_index(export_dir: &Path, config_name: &str, database_id: &str) {
    let files: Vec<String> = match fs::read_dir(export_dir) {
        Ok(entries) => entries
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|f| f.ends_with(".md") && f != "_index.md")
            .collect(),
        Err(_) => return,
    };

    let mut sorted = files;
    sorted.sort();

    let now = chrono::Utc::now().to_rfc3339();
    let mut index = String::new();
    index.push_str(&format!("# {}\n", config_name));
    index.push_str(&format!("Synced from Notion database `{}`\n", database_id));
    index.push_str(&format!("Last synced: {}\n", now));
    index.push_str(&format!("Total pages: {}\n\n", sorted.len()));
    index.push_str("| Task | Status | Priority | Assignee | Due |\n");
    index.push_str("|------|--------|----------|----------|-----|\n");

    for file in &sorted {
        let filepath = export_dir.join(file);
        let fm = match fs::read_to_string(&filepath) {
            Ok(content) => parse_frontmatter(&content),
            Err(_) => std::collections::HashMap::new(),
        };
        let title = fm.get("title").cloned().unwrap_or_else(|| file.clone());
        let status = fm.get("status").cloned().unwrap_or_default();
        let priority = fm.get("priority").cloned().unwrap_or_default();
        let assignee = fm.get("assignee").cloned().unwrap_or_default();
        let due = fm.get("due_date").cloned().unwrap_or_default();
        index.push_str(&format!(
            "| [{}]({}) | {} | {} | {} | {} |\n",
            title, file, status, priority, assignee, due
        ));
    }

    let _ = fs::write(export_dir.join("_index.md"), &index);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn slugify(text: &str) -> String {
    let s: String = text
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let trimmed = s.trim_matches('-').to_string();
    // Collapse consecutive dashes
    let mut result = String::new();
    let mut prev_dash = false;
    for c in trimmed.chars() {
        if c == '-' {
            if !prev_dash {
                result.push(c);
            }
            prev_dash = true;
        } else {
            result.push(c);
            prev_dash = false;
        }
    }
    if result.len() > 80 {
        result.truncate(80);
        result = result.trim_end_matches('-').to_string();
    }
    result
}

fn quote_yaml(s: &str) -> String {
    if s.is_empty() {
        "\"\"".to_string()
    } else if s.contains(':') || s.contains('#') || s.contains('"') || s.contains('\'') || s.contains('\n') {
        format!("\"{}\"", s.replace('"', "\\\""))
    } else {
        format!("\"{}\"", s)
    }
}

fn mapped_str<'a>(mapped: &'a Value, key: &str) -> &'a str {
    mapped.get(key).and_then(|v| v.as_str()).unwrap_or("")
}

fn extract_title(properties: &Value) -> String {
    if let Some(obj) = properties.as_object() {
        for (_, prop) in obj {
            if prop["type"].as_str() == Some("title") {
                if let Some(arr) = prop["title"].as_array() {
                    let text: String = arr
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

fn extract_all_properties(properties: &Value) -> Vec<(String, String)> {
    let mut result = Vec::new();
    if let Some(obj) = properties.as_object() {
        let mut keys: Vec<&String> = obj.keys().collect();
        keys.sort();
        for key in keys {
            if let Some(val) = extract_property_value(&obj[key]) {
                result.push((key.clone(), val));
            }
        }
    }
    result
}

fn extract_property_value(prop: &Value) -> Option<String> {
    let prop_type = prop["type"].as_str()?;
    match prop_type {
        "title" => {
            let text: String = prop["title"]
                .as_array()?
                .iter()
                .filter_map(|rt| rt["plain_text"].as_str())
                .collect();
            if text.is_empty() { None } else { Some(text) }
        }
        "rich_text" => {
            let text: String = prop["rich_text"]
                .as_array()?
                .iter()
                .filter_map(|rt| rt["plain_text"].as_str())
                .collect();
            if text.is_empty() { None } else { Some(text) }
        }
        "status" => prop["status"]["name"].as_str().map(|s| s.to_string()),
        "select" => prop["select"]["name"].as_str().map(|s| s.to_string()),
        "multi_select" => {
            let names: Vec<&str> = prop["multi_select"]
                .as_array()?
                .iter()
                .filter_map(|o| o["name"].as_str())
                .collect();
            if names.is_empty() { None } else { Some(names.join(", ")) }
        }
        "date" => prop["date"]["start"].as_str().map(|s| s.to_string()),
        "people" => {
            let names: Vec<&str> = prop["people"]
                .as_array()?
                .iter()
                .filter_map(|p| p["name"].as_str())
                .collect();
            if names.is_empty() { None } else { Some(names.join(", ")) }
        }
        "checkbox" => Some(prop["checkbox"].as_bool()?.to_string()),
        "number" => prop["number"].as_f64().map(|n| {
            if n.fract() == 0.0 { format!("{}", n as i64) } else { format!("{}", n) }
        }),
        "url" => prop["url"].as_str().map(|s| s.to_string()),
        "email" => prop["email"].as_str().map(|s| s.to_string()),
        "relation" => {
            let ids: Vec<&str> = prop["relation"]
                .as_array()?
                .iter()
                .filter_map(|r| r["id"].as_str())
                .collect();
            if ids.is_empty() { None } else { Some(ids.join(", ")) }
        }
        _ => None,
    }
}

fn parse_frontmatter(content: &str) -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    if let Some(start) = content.find("---\n") {
        let rest = &content[start + 4..];
        if let Some(end) = rest.find("\n---") {
            for line in rest[..end].lines() {
                if let Some(idx) = line.find(':') {
                    let key = line[..idx].trim().to_string();
                    let mut val = line[idx + 1..].trim().to_string();
                    // Strip surrounding quotes
                    if (val.starts_with('"') && val.ends_with('"'))
                        || (val.starts_with('\'') && val.ends_with('\''))
                    {
                        val = val[1..val.len() - 1].to_string();
                    }
                    map.insert(key, val);
                }
            }
        }
    }
    map
}
