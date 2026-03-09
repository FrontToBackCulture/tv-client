// Notion Field Mapping
// Maps Notion property values to Work task fields using sync config's field_mapping

use serde_json::Value;

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
/// Returns the mapped value, or the original if no mapping found
pub fn apply_value_map(raw_value: &str, value_map: Option<&Value>) -> String {
    if let Some(map) = value_map {
        if let Some(obj) = map.as_object() {
            if let Some(mapped) = obj.get(raw_value) {
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
/// field_mapping shape:
/// {
///   "NotionPropName": { "target": "work_field", "value_map": { "NotionVal": "WorkVal" } }
///   "Title": "title"  // shorthand — just target, no value mapping
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

    for (notion_prop_name, mapping) in mapping_obj {
        // Get the Notion property value
        let notion_prop = match props_obj.get(notion_prop_name) {
            Some(p) => p,
            None => continue,
        };

        let raw_value = match extract_property_value(notion_prop) {
            Some(v) => v,
            None => continue,
        };

        // Parse mapping — either string shorthand or object with target + value_map
        let (target_field, value_map) = if let Some(target) = mapping.as_str() {
            (target.to_string(), None)
        } else if let Some(obj) = mapping.as_object() {
            let target = obj
                .get("target")
                .and_then(|t| t.as_str())
                .unwrap_or("")
                .to_string();
            let vmap = obj.get("value_map");
            (target, vmap)
        } else {
            continue;
        };

        if target_field.is_empty() {
            continue;
        }

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
            "assignee_id" => {
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
