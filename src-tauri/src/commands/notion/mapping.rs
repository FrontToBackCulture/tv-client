// Notion Field Mapping
// Maps Notion property values to Work task fields using sync config's field_mapping

use serde_json::{json, Value};

/// Extract a typed value from a Notion property based on its type
pub fn extract_property_value(property: &Value) -> Option<String> {
    let prop_type = property["type"].as_str()?;

    match prop_type {
        "title" => {
            let arr = property["title"].as_array()?;
            let text: String = arr
                .iter()
                .filter_map(|rt| rt["plain_text"].as_str())
                .collect();
            if text.is_empty() { None } else { Some(text) }
        }
        "rich_text" => {
            let arr = property["rich_text"].as_array()?;
            let text: String = arr
                .iter()
                .filter_map(|rt| rt["plain_text"].as_str())
                .collect();
            if text.is_empty() { None } else { Some(text) }
        }
        "status" => property["status"]["name"].as_str().map(|s| s.to_string()),
        "select" => property["select"]["name"].as_str().map(|s| s.to_string()),
        "multi_select" => {
            let arr = property["multi_select"].as_array()?;
            let names: Vec<&str> = arr
                .iter()
                .filter_map(|opt| opt["name"].as_str())
                .collect();
            if names.is_empty() { None } else { Some(names.join(", ")) }
        }
        "date" => property["date"]["start"].as_str().map(|s| s.to_string()),
        "people" => {
            let arr = property["people"].as_array()?;
            let names: Vec<&str> = arr
                .iter()
                .filter_map(|p| p["name"].as_str())
                .collect();
            if names.is_empty() { None } else { Some(names.join(", ")) }
        }
        "checkbox" => {
            let checked = property["checkbox"].as_bool()?;
            Some(checked.to_string())
        }
        "number" => {
            property["number"].as_f64().map(|n| {
                if n.fract() == 0.0 {
                    format!("{}", n as i64)
                } else {
                    format!("{}", n)
                }
            })
        }
        "url" => property["url"].as_str().map(|s| s.to_string()),
        "email" => property["email"].as_str().map(|s| s.to_string()),
        "phone_number" => property["phone_number"].as_str().map(|s| s.to_string()),
        "relation" => {
            let arr = property["relation"].as_array()?;
            let ids: Vec<&str> = arr
                .iter()
                .filter_map(|r| r["id"].as_str())
                .collect();
            if ids.is_empty() { None } else { Some(ids.join(", ")) }
        }
        _ => None,
    }
}

/// Apply value mapping (e.g., Notion "Upnext" → Work status UUID)
/// Returns the mapped value, or the original if no mapping found.
/// Uses case-insensitive key matching to handle Notion status name variations.
pub fn apply_value_map(raw_value: &str, value_map: Option<&Value>) -> String {
    if let Some(map) = value_map {
        if let Some(obj) = map.as_object() {
            // Try exact match first, then case-insensitive
            let matched = obj.get(raw_value).or_else(|| {
                let lower = raw_value.to_lowercase();
                obj.iter()
                    .find(|(k, _)| k.to_lowercase() == lower)
                    .map(|(_, v)| v)
            });
            if let Some(mapped) = matched {
                if let Some(s) = mapped.as_str() {
                    return s.to_string();
                }
                if let Some(n) = mapped.as_i64() {
                    return n.to_string();
                }
            }
        }
    }
    raw_value.to_string()
}

/// Map a Notion page's properties to Work task insert data using field mapping config
///
/// field_mapping shape (new — work field as key):
/// {
///   "title": "Name",                    // shorthand — just source notion prop
///   "status_id": { "source": "Status", "value_map": { "Upnext": "uuid-123" } }
/// }
///
/// Also supports legacy format (notion prop as key):
/// {
///   "Name": "title",
///   "Status": { "target": "status_id", "value_map": { ... } }
/// }
///
/// Returns a JSON object with Work task fields set
pub fn map_page_to_task(
    page_properties: &Value,
    field_mapping: &Value,
) -> Value {
    let mut task = serde_json::Map::new();

    let mapping_obj = match field_mapping.as_object() {
        Some(o) => o,
        None => return Value::Object(task),
    };

    let props_obj = match page_properties.as_object() {
        Some(o) => o,
        None => return Value::Object(task),
    };

    // Known work fields — used to detect new vs legacy format
    let work_fields = [
        "title", "description", "status_id", "priority",
        "due_date", "assignee_id", "assignees", "milestone_id",
        "company_id", "created_at", "updated_at",
    ];

    for (key, mapping) in mapping_obj {
        // Detect format: if key is a known work field, it's the new format
        // Otherwise it's the legacy format (notion prop name as key)
        let is_new_format = work_fields.contains(&key.as_str())
            || mapping.as_object().map_or(false, |o| o.contains_key("source"));

        let (target_field, notion_prop_name, value_map) = if is_new_format {
            // New format: key = work_field, value = notion_prop_name or { source, value_map }
            if let Some(source) = mapping.as_str() {
                (key.clone(), source.to_string(), None)
            } else if let Some(obj) = mapping.as_object() {
                let source = obj
                    .get("source")
                    .and_then(|s| s.as_str())
                    .unwrap_or("")
                    .to_string();
                let vmap = obj.get("value_map");
                (key.clone(), source, vmap)
            } else {
                continue;
            }
        } else {
            // Legacy format: key = notion_prop_name, value = work_field or { target, value_map }
            if let Some(target) = mapping.as_str() {
                (target.to_string(), key.clone(), None)
            } else if let Some(obj) = mapping.as_object() {
                let target = obj
                    .get("target")
                    .and_then(|t| t.as_str())
                    .unwrap_or("")
                    .to_string();
                let vmap = obj.get("value_map");
                (target, key.clone(), vmap)
            } else {
                continue;
            }
        };

        if target_field.is_empty() || notion_prop_name.is_empty() {
            continue;
        }

        // Get the Notion property value
        let notion_prop = match props_obj.get(&notion_prop_name) {
            Some(p) => p,
            None => continue,
        };

        let raw_value = match extract_property_value(notion_prop) {
            Some(v) => v,
            None => continue,
        };

        // Apply value mapping if present
        let mapped_value = apply_value_map(&raw_value, value_map);

        // Set the field on the task object
        match target_field.as_str() {
            "title" => {
                task.insert("title".to_string(), Value::String(mapped_value));
            }
            "description" => {
                task.insert("description".to_string(), Value::String(mapped_value));
            }
            "status_id" => {
                task.insert("status_id".to_string(), Value::String(mapped_value));
            }
            "priority" => {
                if let Ok(p) = mapped_value.parse::<i64>() {
                    task.insert("priority".to_string(), Value::Number(p.into()));
                }
            }
            "due_date" => {
                task.insert("due_date".to_string(), Value::String(mapped_value));
            }
            "assignee_id" | "assignees" => {
                task.insert("assignee_id".to_string(), Value::String(mapped_value));
            }
            "milestone_id" => {
                task.insert("milestone_id".to_string(), Value::String(mapped_value));
            }
            _ => {
                // Unknown target field — store as-is (allows future extensibility)
                task.insert(target_field, Value::String(mapped_value));
            }
        }
    }

    Value::Object(task)
}

/// Reverse-map a task's fields to Notion page properties using the field mapping config.
/// Returns a Notion-API-compatible properties object.
///
/// `status_name_map`: status UUID → status name (reverse of what pull uses)
/// `user_name_map`: user UUID → Notion person name or ID
pub fn map_task_to_page(
    task: &Value,
    field_mapping: &Value,
    status_id_to_name: &std::collections::HashMap<String, String>,
    user_id_to_notion: &std::collections::HashMap<String, String>,
    company_id_to_name: &std::collections::HashMap<String, String>,
    database_schema: &[super::types::NotionPropertySchema],
) -> Value {
    let mut properties = serde_json::Map::new();

    let mapping_obj = match field_mapping.as_object() {
        Some(o) => o,
        None => return Value::Object(properties),
    };

    let work_fields = [
        "title", "description", "status_id", "priority",
        "due_date", "assignee_id", "assignees", "milestone_id",
        "company_id", "created_at", "updated_at",
    ];

    // Build schema lookup: prop name → type
    let schema_map: std::collections::HashMap<&str, &str> = database_schema
        .iter()
        .map(|s| (s.name.as_str(), s.prop_type.as_str()))
        .collect();

    for (key, mapping) in mapping_obj {
        let is_new_format = work_fields.contains(&key.as_str())
            || mapping.as_object().map_or(false, |o| o.contains_key("source"));

        let (task_field, notion_prop_name, value_map) = if is_new_format {
            if let Some(source) = mapping.as_str() {
                (key.clone(), source.to_string(), None)
            } else if let Some(obj) = mapping.as_object() {
                let source = obj.get("source").and_then(|s| s.as_str()).unwrap_or("").to_string();
                let vmap = obj.get("value_map");
                (key.clone(), source, vmap)
            } else {
                continue;
            }
        } else {
            if let Some(target) = mapping.as_str() {
                (target.to_string(), key.clone(), None)
            } else if let Some(obj) = mapping.as_object() {
                let target = obj.get("target").and_then(|t| t.as_str()).unwrap_or("").to_string();
                let vmap = obj.get("value_map");
                (target, key.clone(), vmap)
            } else {
                continue;
            }
        };

        if task_field.is_empty() || notion_prop_name.is_empty() {
            continue;
        }

        // Get the task field value
        let raw_value = match task.get(&task_field).and_then(|v| v.as_str()) {
            Some(v) => v.to_string(),
            None => {
                // Try as number
                if let Some(n) = task.get(&task_field).and_then(|v| v.as_i64()) {
                    n.to_string()
                } else {
                    continue;
                }
            }
        };

        // Resolve UUIDs to human-readable values first, then reverse value_map
        let resolved_value = match task_field.as_str() {
            "status_id" => status_id_to_name.get(&raw_value).cloned().unwrap_or(raw_value.clone()),
            "assignee_id" | "assignees" => user_id_to_notion.get(&raw_value).cloned().unwrap_or(raw_value.clone()),
            "company_id" => company_id_to_name.get(&raw_value).cloned().unwrap_or(raw_value.clone()),
            _ => raw_value.clone(),
        };

        // Try reverse value_map (Notion name → task value), but fall back to the resolved name
        let notion_value = if let Some(vmap) = value_map {
            // First try reversing with the raw UUID (exact match for same-project)
            reverse_value_map(&raw_value, vmap)
                // Then try reversing with the resolved name
                .or_else(|| reverse_value_map(&resolved_value, vmap))
                // Fall back to the resolved name directly (works for cross-project)
                .unwrap_or(resolved_value)
        } else {
            resolved_value
        };

        // Convert to Notion property format based on schema type
        let prop_type = schema_map.get(notion_prop_name.as_str()).copied().unwrap_or("rich_text");

        let prop_value = match prop_type {
            "title" => json!({
                "title": [{ "type": "text", "text": { "content": notion_value } }]
            }),
            "rich_text" => json!({
                "rich_text": [{ "type": "text", "text": { "content": notion_value } }]
            }),
            "status" => json!({
                "status": { "name": notion_value }
            }),
            "select" => json!({
                "select": { "name": notion_value }
            }),
            "date" => {
                if notion_value.is_empty() {
                    json!({ "date": null })
                } else {
                    json!({ "date": { "start": notion_value } })
                }
            }
            "number" => {
                if let Ok(n) = notion_value.parse::<f64>() {
                    json!({ "number": n })
                } else {
                    continue;
                }
            }
            "checkbox" => json!({
                "checkbox": notion_value == "true"
            }),
            "people" => {
                // People need Notion user IDs — skip if we don't have one
                if notion_value.len() == 36 && notion_value.contains('-') {
                    json!({ "people": [{ "id": notion_value }] })
                } else {
                    continue;
                }
            }
            _ => continue, // Skip unsupported property types
        };

        properties.insert(notion_prop_name, prop_value);
    }

    Value::Object(properties)
}

/// Reverse a value_map: given a task value, find the Notion value that maps to it
fn reverse_value_map(task_value: &str, value_map: &Value) -> Option<String> {
    let obj = value_map.as_object()?;
    for (notion_val, mapped_val) in obj {
        let matched = if let Some(s) = mapped_val.as_str() {
            s == task_value
        } else if let Some(n) = mapped_val.as_i64() {
            n.to_string() == task_value
        } else {
            false
        };
        if matched {
            return Some(notion_val.clone());
        }
    }
    None
}
