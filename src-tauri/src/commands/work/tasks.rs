// Work Module - Task Commands

use super::types::*;
use crate::commands::error::{CmdResult, CommandError};
use crate::commands::supabase::get_client;
use crate::AppState;
use chrono::{Datelike, Timelike};

/// List tasks with optional filters
#[tauri::command]
pub async fn work_list_tasks(
    project_id: Option<String>,
    status_id: Option<String>,
    status_type: Option<String>,
    milestone_id: Option<String>,
    company_id: Option<String>,
    task_type: Option<String>,
) -> CmdResult<Vec<Task>> {
    let client = get_client().await?;

    let mut filters = vec!["select=*,project:projects(*),status:task_statuses(*),assignees:task_assignees(user:users(*))".to_string()];

    if let Some(pid) = project_id {
        filters.push(format!("project_id=eq.{}", pid));
    }
    if let Some(sid) = status_id {
        filters.push(format!("status_id=eq.{}", sid));
    }
    if let Some(st) = status_type {
        filters.push(format!("status.type=eq.{}", st));
    }
    if let Some(mid) = milestone_id {
        filters.push(format!("milestone_id=eq.{}", mid));
    }
    if let Some(cid) = company_id {
        filters.push(format!("company_id=eq.{}", cid));
    }
    if let Some(tt) = task_type {
        filters.push(format!("task_type=eq.{}", tt));
    }

    filters.push("order=sort_order.asc,created_at.desc".to_string());

    let query = filters.join("&");
    client.select("tasks", &query).await
}

/// Get a single task by ID
#[tauri::command]
pub async fn work_get_task(task_id: String) -> CmdResult<Task> {
    let client = get_client().await?;

    let query = format!(
        "select=*,project:projects(*),status:task_statuses(*),assignees:task_assignees(user:users(*))&id=eq.{}",
        task_id
    );

    client
        .select_single("tasks", &query)
        .await?
        .ok_or_else(|| CommandError::NotFound(format!("Task not found: {}", task_id)))
}

/// Create a new task
#[tauri::command]
pub async fn work_create_task(data: CreateTask) -> CmdResult<Task> {
    let client = get_client().await?;

    // Get next task number for the project
    let project: Project = client
        .select_single(
            "projects",
            &format!("id=eq.{}", data.project_id),
        )
        .await?
        .ok_or_else(|| CommandError::NotFound("Project not found".into()))?;

    let next_number = project.next_task_number.unwrap_or(1);

    // Build insert data
    let insert_data = serde_json::json!({
        "project_id": data.project_id,
        "status_id": data.status_id,
        "title": data.title,
        "description": data.description,
        "priority": data.priority.unwrap_or(0),
        "due_date": data.due_date,
        "milestone_id": data.milestone_id,
        "depends_on": data.depends_on,
        "session_ref": data.session_ref,
        "requires_review": data.requires_review,
        "company_id": data.company_id,
        "contact_id": data.contact_id,
        "task_type": data.task_type,
        "task_type_changed_at": if data.task_type.is_some() { Some(chrono::Utc::now().to_rfc3339()) } else { None },
        "task_number": next_number
    });

    // Create task
    let task: Task = client.insert("tasks", &insert_data).await?;

    // Increment project's next_task_number
    let update_data = serde_json::json!({ "next_task_number": next_number + 1 });
    let _: Project = client
        .update("projects", &format!("id=eq.{}", data.project_id), &update_data)
        .await?;

    // Insert assignees into junction table
    if let Some(assignee_ids) = &data.assignee_ids {
        for user_id in assignee_ids {
            let row = serde_json::json!({ "task_id": task.id, "user_id": user_id });
            let result: Result<serde_json::Value, _> = client.insert("task_assignees", &row).await;
            if let Err(e) = result {
                let msg = e.to_string();
                if !msg.contains("duplicate") && !msg.contains("23505") {
                    return Err(e);
                }
            }
        }
    }

    // Return task with joins
    work_get_task(task.id).await
}

/// Update a task
#[tauri::command]
pub async fn work_update_task(task_id: String, data: UpdateTask) -> CmdResult<Task> {
    let client = get_client().await?;

    // Handle assignee replacement first (independent of other fields)
    if let Some(assignee_ids) = &data.assignee_ids {
        client.delete("task_assignees", &format!("task_id=eq.{}", task_id)).await?;
        for user_id in assignee_ids {
            let row = serde_json::json!({ "task_id": task_id, "user_id": user_id });
            let result: Result<serde_json::Value, _> = client.insert("task_assignees", &row).await;
            if let Err(e) = result {
                let msg = e.to_string();
                if !msg.contains("duplicate") && !msg.contains("23505") {
                    return Err(e);
                }
            }
        }
    }

    // If task_type is changing, update task_type_changed_at
    if data.task_type.is_some() {
        let mut update_data = serde_json::to_value(&data)?;
        if let Some(obj) = update_data.as_object_mut() {
            obj.insert(
                "task_type_changed_at".to_string(),
                serde_json::Value::String(chrono::Utc::now().to_rfc3339()),
            );
        }
        let _: Task = client
            .update("tasks", &format!("id=eq.{}", task_id), &update_data)
            .await?;
        return work_get_task(task_id).await;
    }

    // Check if status is changing to completed
    if let Some(status_id) = &data.status_id {
        // Get the new status to check its type
        let status: Option<TaskStatus> = client
            .select_single("task_statuses", &format!("id=eq.{}", status_id))
            .await?;

        if let Some(s) = status {
            if s.status_type == "completed" {
                // Set completed_at timestamp
                let mut update_data = serde_json::to_value(&data)?;
                if let Some(obj) = update_data.as_object_mut() {
                    obj.insert(
                        "completed_at".to_string(),
                        serde_json::Value::String(chrono::Utc::now().to_rfc3339()),
                    );
                }

                let _: Task = client
                    .update("tasks", &format!("id=eq.{}", task_id), &update_data)
                    .await?;
                return work_get_task(task_id).await;
            }
        }
    }

    let _: Task = client
        .update("tasks", &format!("id=eq.{}", task_id), &data)
        .await?;

    work_get_task(task_id).await
}

/// Delete a task
#[tauri::command]
pub async fn work_delete_task(task_id: String) -> CmdResult<()> {
    let client = get_client().await?;

    let query = format!("id=eq.{}", task_id);
    client.delete("tasks", &query).await
}

/// Add labels to a task
#[tauri::command]
pub async fn work_add_task_labels(task_id: String, label_ids: Vec<String>) -> CmdResult<()> {
    let client = get_client().await?;

    for label_id in label_ids {
        let data = serde_json::json!({
            "task_id": task_id,
            "label_id": label_id
        });
        // Use upsert behavior by catching conflicts
        let result: Result<serde_json::Value, _> = client.insert("task_labels", &data).await;
        if let Err(e) = result {
            // Ignore duplicate key errors
            let msg = e.to_string();
            if !msg.contains("duplicate") && !msg.contains("23505") {
                return Err(e);
            }
        }
    }

    Ok(())
}

/// Remove labels from a task
#[tauri::command]
pub async fn work_remove_task_labels(task_id: String, label_ids: Vec<String>) -> CmdResult<()> {
    let client = get_client().await?;

    for label_id in label_ids {
        let query = format!("task_id=eq.{}&label_id=eq.{}", task_id, label_id);
        client.delete("task_labels", &query).await?;
    }

    Ok(())
}

/// Add assignees to a task
#[tauri::command]
pub async fn work_add_task_assignees(task_id: String, user_ids: Vec<String>) -> CmdResult<()> {
    let client = get_client().await?;
    for user_id in user_ids {
        let data = serde_json::json!({ "task_id": task_id, "user_id": user_id });
        let result: Result<serde_json::Value, _> = client.insert("task_assignees", &data).await;
        if let Err(e) = result {
            let msg = e.to_string();
            if !msg.contains("duplicate") && !msg.contains("23505") {
                return Err(e);
            }
        }
    }
    Ok(())
}

/// Remove assignees from a task
#[tauri::command]
pub async fn work_remove_task_assignees(task_id: String, user_ids: Vec<String>) -> CmdResult<()> {
    let client = get_client().await?;
    for user_id in user_ids {
        let query = format!("task_id=eq.{}&user_id=eq.{}", task_id, user_id);
        client.delete("task_assignees", &query).await?;
    }
    Ok(())
}

// ============================================================================
// Task Triage (Claude-powered)
// ============================================================================

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TaskTriageProgress {
    pub message: String,
    pub phase: String, // "starting", "running", "complete", "error"
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TriageProposal {
    pub task_id: String,
    pub title: String,
    pub project: String,
    #[serde(default = "default_type")]
    #[serde(rename = "type")]
    pub item_type: String,          // "task" or "deal"
    pub triage_score: i32,
    pub triage_action: String,      // do_now, do_this_week, defer, delegate, kill
    pub triage_reason: String,      // actionable next step
    // Structured metadata
    pub due_date: Option<String>,           // original due date
    pub days_overdue: Option<i32>,          // positive = overdue, 0 = today, negative = days until
    pub suggested_due_date: Option<String>, // if recommending a reschedule
    // Deal-specific
    pub deal_stage: Option<String>,
    pub deal_value: Option<f64>,
    pub days_stale: Option<i32>,            // days since last CRM activity
    pub company: Option<String>,
}

fn default_type() -> String {
    "task".to_string()
}

#[derive(Debug, serde::Serialize)]
pub struct TaskTriageResult {
    pub success: bool,
    pub proposals: Vec<TriageProposal>,
    pub output_text: String,
    pub error: Option<String>,
    pub cost_usd: Option<f64>,
}

/// Run triage entirely in Rust — no Claude CLI. Scores tasks and deals instantly.
#[tauri::command]
pub async fn work_task_triage(
    app: tauri::AppHandle,
    _state: tauri::State<'_, AppState>,
    _model: Option<String>,
) -> CmdResult<TaskTriageResult> {
    use tauri::Emitter;

    let _ = app.emit("task-triage:progress", TaskTriageProgress {
        message: "Fetching tasks and deals...".into(),
        phase: "starting".into(),
    });

    let now = chrono::Utc::now();
    let today = now.format("%Y-%m-%d").to_string();
    let cutoff = (now + chrono::Duration::days(3)).format("%Y-%m-%d").to_string();

    // ── 1. Fetch urgent tasks (overdue + today + next 3 days) ───────────
    let client = get_client().await?;
    // !inner on status join ensures we only get rows with matching status
    let task_query = format!(
        "select=id,title,priority,due_date,task_type,description,\
        project:projects(name,project_type),\
        status:task_statuses!inner(type),\
        company:crm_companies(name)\
        &status.type=in.(backlog,unstarted,started,review)\
        &due_date=lte.{}\
        &order=due_date.asc",
        cutoff
    );
    eprintln!("[task_triage] Task query: {}", task_query);
    let tasks: Vec<serde_json::Value> = client.select("tasks", &task_query).await.unwrap_or_default();
    let tasks: Vec<serde_json::Value> = tasks.into_iter().filter(|t| {
        let pn = t.get("project").and_then(|p| p.get("name")).and_then(|n| n.as_str()).unwrap_or("");
        pn != "tv-notion-tasks"
    }).collect();

    let _ = app.emit("task-triage:progress", TaskTriageProgress {
        message: format!("{} urgent tasks found. Fetching deals...", tasks.len()),
        phase: "running".into(),
    });

    // ── 2. Fetch active deals (exclude won/lost/completed) ─────────────
    let deals: Vec<serde_json::Value> = client.select(
        "projects",
        "select=id,name,deal_stage,deal_value,deal_stage_changed_at,status,company_id\
        &project_type=eq.deal\
        &status=eq.active\
        &deal_stage=not.in.(won,lost)"
    ).await.unwrap_or_default();

    // ── 3. Fetch recent CRM activities (for deal staleness) ─────────────
    let two_weeks_ago = (now - chrono::Duration::days(14)).format("%Y-%m-%dT00:00:00Z").to_string();
    let activities: Vec<serde_json::Value> = client.select(
        "crm_activities",
        &format!("select=project_id,created_at&created_at=gte.{}&order=created_at.desc&limit=500", two_weeks_ago)
    ).await.unwrap_or_default();

    // Build project_id → last activity date map
    let mut last_activity: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for a in &activities {
        if let (Some(pid), Some(date)) = (
            a.get("project_id").and_then(|v| v.as_str()),
            a.get("created_at").and_then(|v| v.as_str()),
        ) {
            last_activity.entry(pid.to_string()).or_insert_with(|| date.to_string());
        }
    }

    // ── 4. Fetch calendar (today + next 3 days) for meeting awareness ──
    let meetings: Vec<String> = {
        let start = now.format("%Y-%m-%dT00:00:00Z").to_string();
        let end = (now + chrono::Duration::days(4)).format("%Y-%m-%dT23:59:59Z").to_string();
        match crate::commands::outlook::db::EmailDb::open()
            .and_then(|db| db.list_events(&start, &end, 50))
        {
            Ok(events) => {
                eprintln!("[task_triage] {} upcoming meetings", events.len());
                events.iter().map(|e| {
                    format!("{}", e.subject.to_lowercase())
                }).collect()
            }
            Err(_) => vec![],
        }
    };

    // Calculate SGT time and hours left in workday (assume 6pm end)
    let sgt_hour = (now.hour() + 8) % 24; // rough SGT offset
    let hours_left = if sgt_hour >= 18 { 0 } else { 18 - sgt_hour };

    let _ = app.emit("task-triage:progress", TaskTriageProgress {
        message: format!("Scoring {} tasks + {} deals... (~{}h left today)", tasks.len(), deals.len(), hours_left),
        phase: "running".into(),
    });

    // ── 4. Score tasks ──────────────────────────────────────────────────
    let mut proposals: Vec<TriageProposal> = Vec::new();

    for t in &tasks {
        let id = t.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let title = t.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let project = t.get("project").and_then(|p| p.get("name")).and_then(|n| n.as_str()).unwrap_or("").to_string();
        let priority = t.get("priority").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
        let due_date = t.get("due_date").and_then(|v| v.as_str()).unwrap_or("");
        let task_type = t.get("task_type").and_then(|v| v.as_str()).unwrap_or("");
        let desc = t.get("description").and_then(|v| v.as_str()).unwrap_or("");
        let company = t.get("company").and_then(|c| c.get("name")).and_then(|n| n.as_str()).unwrap_or("");
        let proj_type = t.get("project").and_then(|p| p.get("project_type")).and_then(|v| v.as_str()).unwrap_or("");
        let combined = format!("{} {}", title, desc);

        // Revenue proximity (×3)
        let rev_keywords = ["Chase after PO", "Send quote", "Send proposal", "order form", "Send SOW", "pricing", "invoice"];
        let rev = if rev_keywords.iter().any(|k| combined.contains(k)) { 10 }
            else if proj_type == "deal" || ["follow_up", "prospect", "target"].contains(&task_type) { 5 }
            else { 0 };

        // Staleness (×2)
        let stale = if due_date.is_empty() { 2 }
            else if due_date < today.as_str() {
                let days_over = chrono::NaiveDate::parse_from_str(&today, "%Y-%m-%d")
                    .and_then(|t| chrono::NaiveDate::parse_from_str(due_date, "%Y-%m-%d").map(|d| (t - d).num_days()))
                    .unwrap_or(1);
                if days_over > 3 { 10 } else { 9 }
            }
            else if due_date == today.as_str() { 8 }
            else { 5 }; // 1-3 days away

        // Someone waiting (×2)
        let wait_keywords = ["chasing", "waiting", "boss feedback", "response for data", "they've been waiting"];
        let waiting = if wait_keywords.iter().any(|k| combined.to_lowercase().contains(&k.to_lowercase())) { 10 }
            else if combined.contains("Follow up") || combined.contains("follow up") { 7 }
            else if combined.contains("Send") || combined.contains("Reach out") { 5 }
            else { 0 };

        // Priority alignment (×1)
        let prio = match priority { 1 => 10, 2 => 7, 3 => 4, 4 => 2, _ => 0 };

        // Effort/impact (×1) — boost quick wins when time is short
        let is_quick = ["Send", "Chase", "Follow up"].iter().any(|k| title.contains(k));
        let effort = if is_quick { 8 }
            else if ["Build", "Scaffold", "Refactor"].iter().any(|k| title.contains(k)) { 3 }
            else { 5 };
        // If < 2 hours left, extra boost for quick wins
        let time_bonus: i32 = if hours_left <= 2 && is_quick { 5 } else { 0 };

        // Meeting relevance bonus — if task title matches any upcoming meeting subject
        let meeting_bonus: i32 = {
            let title_lower = title.to_lowercase();
            let company_lower = company.to_lowercase();
            if meetings.iter().any(|m| {
                (!company_lower.is_empty() && m.contains(&company_lower)) ||
                title_lower.split_whitespace().any(|w| w.len() > 3 && m.contains(w))
            }) { 10 } else { 0 }
        };

        let score = (rev * 3 + stale * 2 + waiting * 2 + prio + effort + time_bonus + meeting_bonus).min(100);

        // Override: P1 + overdue = always do_now
        let score = if priority == 1 && due_date < today.as_str() { score.max(90) } else { score };
        let score = if waiting >= 7 && due_date < today.as_str() { score.max(85) } else { score };

        let action = if score >= 80 { "do_now" } else if score >= 60 { "do_this_week" } else { "defer" };
        let has_meeting = meeting_bonus > 0;

        // Calculate structured date info
        let days_diff: i32 = if due_date.is_empty() { 0 } else {
            chrono::NaiveDate::parse_from_str(&today, "%Y-%m-%d")
                .and_then(|t| chrono::NaiveDate::parse_from_str(due_date, "%Y-%m-%d").map(|d| (t - d).num_days() as i32))
                .unwrap_or(0)
        };

        // Suggest new due date for overdue/deferred tasks
        let suggested_due: Option<String> = if action == "defer" && days_diff > 0 {
            // Overdue + deferred → suggest next Monday
            chrono::NaiveDate::parse_from_str(&today, "%Y-%m-%d")
                .map(|t| {
                    let days_to_mon = (8 - t.weekday().num_days_from_monday()) % 7;
                    let days_to_mon = if days_to_mon == 0 { 7 } else { days_to_mon };
                    (t + chrono::Duration::days(days_to_mon as i64)).format("%Y-%m-%d").to_string()
                })
                .ok()
        } else if action == "do_this_week" && days_diff > 3 {
            // Very overdue but do_this_week → suggest day after tomorrow
            chrono::NaiveDate::parse_from_str(&today, "%Y-%m-%d")
                .ok()
                .map(|t| (t + chrono::Duration::days(2)).format("%Y-%m-%d").to_string())
        } else {
            None
        };

        // Build concise actionable reason (just the next step)
        let reason = if waiting >= 10 {
            format!("{} is waiting. Do this now.", if !company.is_empty() { company.to_string() } else { "Client".to_string() })
        } else if waiting >= 7 {
            format!("Follow up with {}.", if !company.is_empty() { company.to_string() } else { "them".to_string() })
        } else if is_quick {
            "Quick action — send/chase and move on.".to_string()
        } else if has_meeting {
            "Related to an upcoming meeting — prep now.".to_string()
        } else if rev >= 10 {
            "Directly impacts revenue. Prioritize.".to_string()
        } else if action == "defer" {
            "Not urgent this week. Reschedule.".to_string()
        } else {
            "Complete this task.".to_string()
        };

        proposals.push(TriageProposal {
            task_id: id,
            title,
            project,
            item_type: "task".to_string(),
            triage_score: score,
            triage_action: action.to_string(),
            triage_reason: reason,
            due_date: if due_date.is_empty() { None } else { Some(due_date.to_string()) },
            days_overdue: if due_date.is_empty() { None } else { Some(days_diff) },
            suggested_due_date: suggested_due,
            deal_stage: None,
            deal_value: None,
            days_stale: None,
            company: if company.is_empty() { None } else { Some(company.to_string()) },
        });
    }

    // ── 5. Score deals (staleness check) ────────────────────────────────
    let urgent_stages = ["proposal", "negotiation", "pilot", "qualified"];

    for d in &deals {
        let id = d.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let name = d.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let stage = d.get("deal_stage").and_then(|v| v.as_str()).unwrap_or("");
        let value = d.get("deal_value").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let stage_changed = d.get("deal_stage_changed_at").and_then(|v| v.as_str()).unwrap_or("");

        // Calculate days since last activity
        let last_act = last_activity.get(&id).map(|s| s.as_str()).unwrap_or(stage_changed);
        let days_stale = if last_act.is_empty() { 30 } else {
            chrono::DateTime::parse_from_rfc3339(last_act)
                .map(|d| (now - d.with_timezone(&chrono::Utc)).num_days())
                .unwrap_or(30)
        };

        // Only flag stale deals (> 7 days) or urgent-stage deals (> 3 days)
        let is_urgent_stage = urgent_stages.contains(&stage);
        if days_stale <= 3 { continue; }
        if days_stale <= 7 && !is_urgent_stage { continue; }

        // Score: stale × 3, stage urgency × 2, value × 2
        let stale_score = if days_stale > 14 { 10 } else if days_stale > 7 { 8 } else { 5 };
        let stage_score = if is_urgent_stage { 10 } else { 3 };
        let value_score = if value > 10000.0 { 10 } else if value > 1000.0 { 5 } else { 2 };

        let score = (stale_score * 3 + stage_score * 2 + value_score * 2).min(100);
        let action = if score >= 80 { "do_now" } else if score >= 60 { "do_this_week" } else { "defer" };

        // Suggest follow-up date
        let suggested_follow_up = chrono::NaiveDate::parse_from_str(&today, "%Y-%m-%d")
            .ok()
            .map(|t| (t + chrono::Duration::days(2)).format("%Y-%m-%d").to_string());

        let reason = if days_stale > 14 {
            "Going cold. Re-engage or mark as lost.".to_string()
        } else if is_urgent_stage {
            format!("In {} stage with no recent activity. Follow up.", stage)
        } else {
            "No recent activity. Check if still alive.".to_string()
        };

        proposals.push(TriageProposal {
            task_id: id,
            title: name.clone(),
            project: name.clone(),
            item_type: "deal".to_string(),
            triage_score: score,
            triage_action: action.to_string(),
            triage_reason: reason,
            due_date: None,
            days_overdue: None,
            suggested_due_date: suggested_follow_up,
            deal_stage: Some(stage.to_string()),
            deal_value: if value > 0.0 { Some(value) } else { None },
            days_stale: Some(days_stale as i32),
            company: Some(name),
        });
    }

    // Sort by score descending
    proposals.sort_by(|a, b| b.triage_score.cmp(&a.triage_score));

    // Proposals are returned as suggestions — not saved until user accepts
    let count = proposals.len();
    let _ = app.emit("task-triage:progress", TaskTriageProgress {
        message: format!("{} items scored. Claude is refining reasons...", count),
        phase: "complete".into(),
    });

    let task_count = proposals.iter().filter(|p| p.item_type == "task").count();
    let deal_count = proposals.iter().filter(|p| p.item_type == "deal").count();
    eprintln!("[task_triage] Instant scoring done. {} proposals ({} tasks + {} deals). Spawning Claude for reasoning...", count, task_count, deal_count);

    // ── 7. Background: Claude enriches reasons with strategic thinking ──
    let proposals_for_claude = proposals.clone();
    // Build set of deal IDs so enrichment doesn't write deal (project) UUIDs to tasks table
    let deal_ids: std::collections::HashSet<String> = proposals_for_claude.iter()
        .filter(|p| p.item_type == "deal")
        .map(|p| p.task_id.clone())
        .collect();
    let app_bg = app.clone();
    let kb_clone = _state.knowledge_path.clone();
    tokio::spawn(async move {
        use std::process::Stdio;
        use tokio::io::AsyncWriteExt;
        use tokio::process::Command;

        // Build a compact summary for Claude — just scores + titles, ask for better reasons
        let items: Vec<String> = proposals_for_claude.iter().map(|p| {
            format!("{{\"id\":\"{}\",\"type\":\"{}\",\"title\":\"{}\",\"project\":\"{}\",\"score\":{},\"action\":\"{}\",\"reason\":\"{}\"}}",
                p.task_id, p.item_type, p.title.replace('"', "'"), p.project.replace('"', "'"),
                p.triage_score, p.triage_action, p.triage_reason.replace('"', "'"))
        }).collect();
        let items_json = format!("[{}]", items.join(","));

        // Read priorities for context
        let priorities = {
            let path = std::path::Path::new(&kb_clone).join("_team/melvin/priorities.md");
            std::fs::read_to_string(&path).unwrap_or_default()
        };

        let prompt = format!(
            "You are Melvin's strategic advisor. Below are his triaged tasks and deals, already scored.\n\
            Your job: rewrite each triage_reason to be more strategic and actionable.\n\n\
            PRIORITIES:\n{}\n\n\
            SCORED ITEMS:\n{}\n\n\
            For each item:\n\
            1. Rewrite triage_reason with strategic thinking — not just factors, but WHY it matters\n\
            2. Name the person/company and the specific next step\n\
            3. You CAN override the score if you think the formula got it wrong\n\
               - A low-scored task that's actually critical? Bump it up and explain why\n\
               - A high-scored task that's less important than it looks? Lower it\n\
            4. You CAN override the action (do_now/do_this_week/defer/delegate/kill)\n\
            5. If you see patterns (e.g., 5 overdue follow-ups), call it out in the first item\n\n\
            OUTPUT: ONLY a JSON array. Start with [ end with ]. No other text.\n\
            Each element: {{\"id\":\"<same id>\",\"score\":<adjusted or same>,\"action\":\"<adjusted or same>\",\"reason\":\"<your strategic reason>\"}}\n\
            Keep the same order.",
            priorities, items_json
        );

        let mut cmd = Command::new("claude");
        cmd.arg("-p").arg("--model").arg("sonnet").arg("--output-format").arg("json");
        cmd.current_dir(&kb_clone);
        cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());

        let child = cmd.spawn();
        if let Ok(mut child) = child {
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(prompt.as_bytes()).await;
                let _ = stdin.shutdown().await;
            }
            if let Ok(output) = child.wait_with_output().await {
                if output.status.success() {
                    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                    // Parse Claude's JSON output
                    let text = serde_json::from_str::<serde_json::Value>(&stdout)
                        .ok()
                        .and_then(|j| j.get("result").and_then(|v| v.as_str()).map(|s| s.to_string()))
                        .unwrap_or(stdout);

                    // Extract JSON array of improved reasons
                    let reasons: Vec<serde_json::Value> = {
                        let t = text.trim();
                        serde_json::from_str(t)
                            .or_else(|_| {
                                if let (Some(s), Some(e)) = (t.find('['), t.rfind(']')) {
                                    serde_json::from_str(&t[s..=e])
                                } else {
                                    Err(serde_json::Error::io(std::io::Error::new(std::io::ErrorKind::InvalidData, "no array")))
                                }
                            })
                            .unwrap_or_default()
                    };

                    if !reasons.is_empty() {
                        // Update reasons in DB
                        if let Ok(client) = get_client().await {
                            let mut updated = 0;
                            for r in &reasons {
                                let id = r.get("id").and_then(|v| v.as_str());
                                let reason = r.get("reason").and_then(|v| v.as_str());
                                let score = r.get("score").and_then(|v| v.as_i64());
                                let action = r.get("action").and_then(|v| v.as_str());
                                if let (Some(id), Some(reason)) = (id, reason) {
                                    // Skip deal proposals — their IDs are project UUIDs, not task UUIDs
                                    if deal_ids.contains(id) { continue; }
                                    let mut update = serde_json::json!({ "triage_reason": reason });
                                    if let Some(s) = score { update["triage_score"] = serde_json::json!(s); }
                                    if let Some(a) = action { update["triage_action"] = serde_json::json!(a); }
                                    let res: Result<serde_json::Value, _> = client.update("tasks", &format!("id=eq.{}", id), &update).await;
                                    if res.is_ok() { updated += 1; }
                                }
                            }
                            eprintln!("[task_triage] Claude enriched {} items (reasons + score overrides)", updated);
                        }
                        // Emit special event so frontend refreshes task data
                        let _ = app_bg.emit("task-triage:enriched", serde_json::json!({
                            "count": reasons.len()
                        }));
                        let _ = app_bg.emit("task-triage:progress", TaskTriageProgress {
                            message: format!("Claude refined {} reasons with strategic insights", reasons.len()),
                            phase: "complete".into(),
                        });
                    } else {
                        eprintln!("[task_triage] Claude returned no parseable reasons");
                    }
                }
            }
        }
    });

    Ok(TaskTriageResult {
        success: !proposals.is_empty(),
        proposals,
        output_text: format!("{} tasks + {} deals triaged", tasks.len(), deals.len()),
        error: None,
        cost_usd: None,
    })
}

/// Apply a single triage proposal to a task
#[tauri::command]
pub async fn work_apply_triage(
    task_id: String,
    triage_score: i32,
    triage_action: String,
    triage_reason: String,
) -> CmdResult<Task> {
    let client = get_client().await?;

    let now = chrono::Utc::now().to_rfc3339();
    let update_data = serde_json::json!({
        "triage_score": triage_score,
        "triage_action": triage_action,
        "triage_reason": triage_reason,
        "last_triaged_at": now
    });

    let _: Task = client
        .update("tasks", &format!("id=eq.{}", task_id), &update_data)
        .await?;

    work_get_task(task_id).await
}

/// Read today's task sequence (list of task IDs)
#[tauri::command]
pub async fn work_get_priorities(
    _state: tauri::State<'_, AppState>,
) -> CmdResult<serde_json::Value> {
    let path = std::path::Path::new(&_state.knowledge_path).join("_team/melvin/today_tasks.json");
    let content = std::fs::read_to_string(&path).unwrap_or_else(|_| "{}".to_string());
    let data: serde_json::Value = serde_json::from_str(&content).unwrap_or(serde_json::json!({}));
    Ok(data)
}

/// Reprioritise today's focus using Claude — picks and orders tasks by ID
#[tauri::command]
pub async fn work_reprioritise(
    app: tauri::AppHandle,
    _state: tauri::State<'_, AppState>,
) -> CmdResult<serde_json::Value> {
    use tauri::Emitter;
    let client = get_client().await?;
    let now = chrono::Utc::now();
    let today = (now + chrono::Duration::hours(8)).format("%Y-%m-%d").to_string();

    // Fetch active tasks with due dates
    let tasks: Vec<serde_json::Value> = client
        .select("tasks", "id, title, due_date, priority, triage_action, triage_score, triage_reason, status:task_statuses(type), project:projects(name), company:crm_companies!tasks_company_id_fkey(display_name)")
        .await?;

    // Build task list for Claude — include ID so it can reference them
    let relevant: Vec<String> = tasks.iter().filter_map(|t| {
        let status_type = t.get("status").and_then(|s| s.get("type")).and_then(|v| v.as_str()).unwrap_or("");
        if status_type == "completed" || status_type == "canceled" { return None; }
        let id = t.get("id").and_then(|v| v.as_str()).unwrap_or("");
        let title = t.get("title").and_then(|v| v.as_str()).unwrap_or("");
        let due = t.get("due_date").and_then(|v| v.as_str()).unwrap_or("");
        let project = t.get("project").and_then(|p| p.get("name")).and_then(|v| v.as_str()).unwrap_or("");
        let company = t.get("company").and_then(|c| c.get("display_name")).and_then(|v| v.as_str()).unwrap_or("");
        let triage = t.get("triage_action").and_then(|v| v.as_str()).unwrap_or("");
        let score = t.get("triage_score").and_then(|v| v.as_i64()).unwrap_or(0);
        let priority = t.get("priority").and_then(|v| v.as_i64()).unwrap_or(0);
        let dominated = !due.is_empty() && due <= today.as_str();
        let end_of_week = format!("{}", (now + chrono::Duration::hours(8) + chrono::Duration::days(5)).format("%Y-%m-%d"));
        let due_soon = !due.is_empty() && due > today.as_str() && due <= end_of_week.as_str();
        let is_now = triage == "do_now";
        let is_high = priority >= 1 && priority <= 2;
        if dominated || due_soon || is_now || is_high {
            Some(format!("{{\"id\":\"{}\",\"title\":\"{}\",\"project\":\"{}\",\"company\":\"{}\",\"due\":\"{}\",\"triage\":\"{}\",\"score\":{},\"priority\":{}}}",
                id, title.replace('"', "'"), project.replace('"', "'"), company.replace('"', "'"),
                if due.is_empty() { "none" } else { due }, triage, score, priority))
        } else {
            None
        }
    }).collect();

    let prompt = format!(
        "Pick 5-8 tasks for Melvin to complete TODAY, ordered by urgency.\n\
        Most tasks are quick actions (send email, chase PO, follow up) — he can do many in a day.\n\n\
        TASKS:\n[{}]\n\n\
        Rules:\n\
        - Pick 5-8 tasks. These are mostly quick follow-ups, not deep work.\n\
        - Revenue-impacting and client-waiting tasks first\n\
        - Overdue client-facing > internal work\n\
        - Quick wins can fill gaps\n\
        - Include a mix of sales and work tasks if both exist\n\n\
        OUTPUT: ONLY a JSON array of objects. Each: {{\"id\":\"<task uuid>\",\"reason\":\"<1 sentence: why today, in plain English, no metadata>\"}}\n\
        Start with [ end with ]. No other text.",
        relevant.join(",")
    );

    let _ = app.emit("work:reprioritise:progress", "Running Claude to reprioritise...");

    let output = tokio::process::Command::new("claude")
        .args(["--model", "haiku", "--output-format", "text", "-p", &prompt])
        .output()
        .await
        .map_err(|e| CommandError::Internal(format!("Failed to run claude: {}", e)))?;

    let result = String::from_utf8_lossy(&output.stdout).to_string();
    let result = result.trim();

    // Strip code fence if present
    let json_str = if result.starts_with("```") {
        result.trim_start_matches("```json").trim_start_matches("```").trim_end_matches("```").trim()
    } else {
        result
    };

    // Parse the task sequence
    let sequence: Vec<serde_json::Value> = serde_json::from_str(json_str)
        .map_err(|e| CommandError::Internal(format!("Failed to parse Claude response: {} — raw: {}", e, json_str)))?;

    let task_ids: Vec<String> = sequence.iter()
        .filter_map(|v| v.get("id").and_then(|id| id.as_str()).map(|s| s.to_string()))
        .collect();
    let reasons: Vec<String> = sequence.iter()
        .filter_map(|v| v.get("reason").and_then(|r| r.as_str()).map(|s| s.to_string()))
        .collect();

    let now_sgt = (now + chrono::Duration::hours(8)).format("%Y-%m-%d %H:%M SGT").to_string();

    let data = serde_json::json!({
        "task_ids": task_ids,
        "reasons": reasons,
        "last_confirmed": now_sgt,
    });

    // Save to simple JSON file
    let path = std::path::Path::new(&_state.knowledge_path).join("_team/melvin/today_tasks.json");
    std::fs::write(&path, serde_json::to_string_pretty(&data).unwrap_or_default())
        .map_err(|e| CommandError::Internal(format!("Failed to write today_tasks.json: {}", e)))?;

    Ok(data)
}
