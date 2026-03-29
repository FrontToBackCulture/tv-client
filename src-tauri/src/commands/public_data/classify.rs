// Classify MCF job postings using AI (OpenRouter / Qwen3.5-Flash)
//
// Fetches unclassified rows from public_data.mcf_job_postings,
// sends batches to Qwen3.5-Flash for structured classification,
// writes back finance_function, seniority, industry_tag + classified_at.
//
// Runs as a background task with progress events via jobs:update.

use crate::commands::error::{CmdResult, CommandError};
use crate::commands::settings::{settings_get_key, KEY_OPENROUTER_API, KEY_SUPABASE_ANON_KEY, KEY_SUPABASE_URL};
use crate::HTTP_CLIENT;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};

const OPENROUTER_URL: &str = "https://openrouter.ai/api/v1/chat/completions";
const MODEL: &str = "qwen/qwen3.5-flash-02-23";
const BATCH_SIZE: usize = 10; // jobs per LLM call
const CONCURRENT: usize = 5; // parallel LLM calls
const FETCH_LIMIT: usize = 200; // rows per DB fetch round

const SYSTEM_PROMPT: &str = r#"You are a job posting classifier. For each job, return a JSON object with these fields:

- finance_function: The specific finance function this role performs. Use one of: ar, ap, ar_ap, gl, fullset, tax, audit, cost, fpa, reporting, treasury, payroll, general. Use null if this is NOT a finance/accounting role at all.
- seniority: The seniority level. Use one of: intern, junior, executive, senior, manager, director.
- industry_tag: The industry of the HIRING COMPANY or END CLIENT (not the job function). Use one of: fnb, hospitality, retail, logistics, healthcare, construction, tech, manufacturing, financial_services, professional_services, government, education, real_estate, other.

Rules:
- "fullset" means the role covers AR + AP + GL + month-end — a one-person finance team.
- "general" means it IS a finance role but doesn't fit a specific function (e.g. "Finance Admin").
- "fpa" = financial planning & analysis, budgeting, forecasting.
- "reporting" = financial reporting, management reporting, consolidation.
- For seniority: "Account Assistant" / "Clerk" = junior, "Executive" = executive, "Senior Executive" / "Senior Accountant" = senior, "Manager" / "Assistant Manager" = manager, "Director" / "VP" / "CFO" = director, "Intern" / "Trainee" = intern.
- For industry: use company name, SSIC code, and job description as signals. SSIC codes starting with 56 = fnb, 55 = hospitality, 47 = retail, 49-53 = logistics/transport, 86 = healthcare, 41-43 = construction, 62-63 = tech, 10-33 = manufacturing, 64-66 = financial_services, 69-75 = professional_services, 84 = government, 85 = education, 68 = real_estate.
- If a recruitment/staffing agency is hiring on behalf of a client, classify the INDUSTRY of the client if apparent from the description.

Return a JSON array with one object per job, in the same order as input. No markdown, no explanation — just the JSON array."#;

// ─── Types ─────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct McfRow {
    id: String,
    title: String,
    company_name: Option<String>,
    company_ssic_code: Option<String>,
    description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct Classification {
    finance_function: Option<String>,
    seniority: Option<String>,
    industry_tag: Option<String>,
}

#[derive(Debug, Serialize)]
struct ClassifyUpdate {
    finance_function: Option<String>,
    seniority: Option<String>,
    industry_tag: Option<String>,
    classified_at: String,
}

#[derive(Debug, Serialize)]
pub struct ClassifyResult {
    pub status: String,
    pub classified: usize,
    pub errors: usize,
    pub total: usize,
    pub message: String,
}

// OpenRouter types
#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<Message>,
    temperature: f32,
    max_tokens: u32,
}

#[derive(Serialize)]
struct Message {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: ResponseMessage,
}

#[derive(Deserialize)]
struct ResponseMessage {
    content: String,
}

// ─── Valid values ──────────────────────────────────────

const VALID_FINANCE: &[&str] = &[
    "ar", "ap", "ar_ap", "gl", "fullset", "tax", "audit", "cost",
    "fpa", "reporting", "treasury", "payroll", "general",
];
const VALID_SENIORITY: &[&str] = &[
    "intern", "junior", "executive", "senior", "manager", "director",
];
const VALID_INDUSTRY: &[&str] = &[
    "fnb", "hospitality", "retail", "logistics", "healthcare", "construction",
    "tech", "manufacturing", "financial_services", "professional_services",
    "government", "education", "real_estate", "other",
];

fn sanitize(raw: &serde_json::Value) -> Classification {
    let ff = raw.get("finance_function")
        .and_then(|v| v.as_str())
        .map(|s| s.to_lowercase())
        .filter(|s| VALID_FINANCE.contains(&s.as_str()));
    let sen = raw.get("seniority")
        .and_then(|v| v.as_str())
        .map(|s| s.to_lowercase())
        .filter(|s| VALID_SENIORITY.contains(&s.as_str()));
    let ind = raw.get("industry_tag")
        .and_then(|v| v.as_str())
        .map(|s| s.to_lowercase())
        .filter(|s| VALID_INDUSTRY.contains(&s.as_str()));
    Classification {
        finance_function: ff,
        seniority: sen,
        industry_tag: ind,
    }
}

// ─── Supabase helpers (public_data schema) ─────────────

fn supabase_headers(anon_key: &str) -> HeaderMap {
    let mut headers = HeaderMap::new();
    if let Ok(val) = HeaderValue::from_str(anon_key) {
        headers.insert("apikey", val);
    }
    if let Ok(val) = HeaderValue::from_str(&format!("Bearer {}", anon_key)) {
        headers.insert(AUTHORIZATION, val);
    }
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    // Target public_data schema
    headers.insert("Accept-Profile", HeaderValue::from_static("public_data"));
    headers.insert("Content-Profile", HeaderValue::from_static("public_data"));
    headers
}

async fn fetch_unclassified(base_url: &str, anon_key: &str, limit: usize) -> CmdResult<Vec<McfRow>> {
    let url = format!(
        "{}/rest/v1/mcf_job_postings?classified_at=is.null&select=id,title,company_name,company_ssic_code,description&limit={}",
        base_url, limit
    );
    let resp = HTTP_CLIENT
        .get(&url)
        .headers(supabase_headers(anon_key))
        .send()
        .await?;
    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        return Err(CommandError::Http { status, body });
    }
    Ok(resp.json().await?)
}

async fn count_unclassified(base_url: &str, anon_key: &str) -> CmdResult<usize> {
    let url = format!(
        "{}/rest/v1/mcf_job_postings?classified_at=is.null&select=id&limit=0",
        base_url
    );
    let mut headers = supabase_headers(anon_key);
    headers.insert("Prefer", HeaderValue::from_static("count=exact"));

    let resp = HTTP_CLIENT
        .get(&url)
        .headers(headers)
        .send()
        .await?;

    // Count is in the Content-Range header: "0-0/82337"
    let count = resp
        .headers()
        .get("content-range")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split('/').last())
        .and_then(|n| n.parse::<usize>().ok())
        .unwrap_or(0);
    Ok(count)
}

async fn update_classification(
    base_url: &str,
    anon_key: &str,
    id: &str,
    classification: &Classification,
    now: &str,
) -> CmdResult<()> {
    let url = format!(
        "{}/rest/v1/mcf_job_postings?id=eq.{}",
        base_url, id
    );
    let update = ClassifyUpdate {
        finance_function: classification.finance_function.clone(),
        seniority: classification.seniority.clone(),
        industry_tag: classification.industry_tag.clone(),
        classified_at: now.to_string(),
    };

    let mut headers = supabase_headers(anon_key);
    headers.insert("Prefer", HeaderValue::from_static("return=minimal"));

    let resp = HTTP_CLIENT
        .patch(&url)
        .headers(headers)
        .json(&update)
        .send()
        .await?;
    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        return Err(CommandError::Http { status, body });
    }
    Ok(())
}

// ─── LLM call ──────────────────────────────────────────

fn build_user_prompt(rows: &[McfRow]) -> String {
    rows.iter()
        .enumerate()
        .map(|(i, r)| {
            let desc = r.description.as_deref().unwrap_or("").chars().take(600).collect::<String>();
            format!(
                "[Job {}]\nTitle: {}\nCompany: {}\nSSIC: {}\nDescription: {}",
                i + 1,
                r.title,
                r.company_name.as_deref().unwrap_or("Unknown"),
                r.company_ssic_code.as_deref().unwrap_or("unknown"),
                desc,
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

async fn classify_batch(openrouter_key: &str, rows: &[McfRow]) -> CmdResult<Vec<Classification>> {
    let request = ChatRequest {
        model: MODEL.to_string(),
        messages: vec![
            Message { role: "system".to_string(), content: SYSTEM_PROMPT.to_string() },
            Message { role: "user".to_string(), content: build_user_prompt(rows) },
        ],
        temperature: 0.0,
        max_tokens: 4000,
    };

    let resp = HTTP_CLIENT
        .post(OPENROUTER_URL)
        .header(AUTHORIZATION, format!("Bearer {}", openrouter_key))
        .header(CONTENT_TYPE, "application/json")
        .header("HTTP-Referer", "https://tryval.com")
        .header("X-Title", "VAL Job Classifier")
        .json(&request)
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        return Err(CommandError::Http { status, body });
    }

    let chat_resp: ChatResponse = resp.json().await?;
    let content = &chat_resp.choices.first()
        .ok_or_else(|| CommandError::Internal("No choices in response".into()))?
        .message.content;

    // Strip thinking tags from reasoning models (e.g. <think>...</think>)
    let stripped = if let Some(end) = content.find("</think>") {
        &content[end + 8..]
    } else {
        content.as_str()
    };

    // Strip markdown code blocks if present
    let json_str = stripped
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let parsed: Vec<serde_json::Value> = serde_json::from_str(json_str)
        .map_err(|e| CommandError::Parse(format!("Failed to parse LLM response: {} — raw: {}", e, &json_str[..json_str.len().min(200)])))?;

    let results: Vec<Classification> = rows
        .iter()
        .enumerate()
        .map(|(i, _)| {
            parsed.get(i)
                .map(sanitize)
                .unwrap_or_default()
        })
        .collect();

    Ok(results)
}

// ─── Main command ──────────────────────────────────────

#[tauri::command]
pub async fn classify_job_postings(app_handle: tauri::AppHandle) -> CmdResult<ClassifyResult> {
    use tauri::Emitter;

    // Load keys
    let base_url = settings_get_key(KEY_SUPABASE_URL.to_string())?
        .ok_or_else(|| CommandError::Config("Supabase URL not configured".into()))?;
    let anon_key = settings_get_key(KEY_SUPABASE_ANON_KEY.to_string())?
        .ok_or_else(|| CommandError::Config("Supabase anon key not configured".into()))?;
    let openrouter_key = settings_get_key(KEY_OPENROUTER_API.to_string())?
        .ok_or_else(|| CommandError::Config("OpenRouter API key not configured. Go to Settings to add it.".into()))?;

    let total = count_unclassified(&base_url, &anon_key).await?;
    if total == 0 {
        return Ok(ClassifyResult {
            status: "completed".into(),
            classified: 0,
            errors: 0,
            total: 0,
            message: "No unclassified jobs found".into(),
        });
    }

    let tracking_id = format!("classify-jobs-{}", chrono::Utc::now().timestamp_millis());
    let started_at = chrono::Utc::now().to_rfc3339();

    // Emit running state
    let _ = app_handle.emit("jobs:update", serde_json::json!({
        "id": &tracking_id,
        "name": "Classify Job Postings",
        "status": "running",
        "message": format!("Starting classification of {} jobs...", total),
        "startedAt": &started_at,
    }));

    // Spawn background task
    let app = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        let mut classified = 0usize;
        let mut errors = 0usize;

        loop {
            // Fetch next batch
            let rows = match fetch_unclassified(&base_url, &anon_key, FETCH_LIMIT).await {
                Ok(r) => r,
                Err(e) => {
                    eprintln!("[classify] Fetch error: {}", e);
                    let _ = app.emit("jobs:update", serde_json::json!({
                        "id": &tracking_id,
                        "name": "Classify Job Postings",
                        "status": "failed",
                        "message": format!("{} classified before error: {}", classified, e),
                        "startedAt": &started_at,
                    }));
                    return;
                }
            };

            if rows.is_empty() {
                break; // All done
            }

            // Split into mini-batches
            let batches: Vec<&[McfRow]> = rows.chunks(BATCH_SIZE).collect();

            // Process CONCURRENT batches at a time
            for chunk in batches.chunks(CONCURRENT) {
                let mut join_handles = Vec::new();

                for batch in chunk.iter() {
                    let key = openrouter_key.clone();
                    let batch_data: Vec<McfRow> = batch.iter().map(|r| McfRow {
                        id: r.id.clone(),
                        title: r.title.clone(),
                        company_name: r.company_name.clone(),
                        company_ssic_code: r.company_ssic_code.clone(),
                        description: r.description.clone(),
                    }).collect();

                    join_handles.push(tokio::spawn(async move {
                        classify_batch(&key, &batch_data).await
                    }));
                }

                // Await all concurrent batches
                for (batch_idx, handle) in join_handles.into_iter().enumerate() {
                    let batch = chunk[batch_idx];
                    match handle.await {
                        Ok(Ok(classifications)) => {
                            let now = chrono::Utc::now().to_rfc3339();
                            // Write back in parallel
                            let mut write_handles = Vec::new();
                            for (j, row) in batch.iter().enumerate() {
                                let base = base_url.clone();
                                let key = anon_key.clone();
                                let id = row.id.clone();
                                let c = Classification {
                                    finance_function: classifications.get(j).and_then(|c| c.finance_function.clone()),
                                    seniority: classifications.get(j).and_then(|c| c.seniority.clone()),
                                    industry_tag: classifications.get(j).and_then(|c| c.industry_tag.clone()),
                                };
                                let ts = now.clone();
                                write_handles.push(tokio::spawn(async move {
                                    update_classification(&base, &key, &id, &c, &ts).await
                                }));
                            }
                            for wh in write_handles {
                                match wh.await {
                                    Ok(Ok(())) => classified += 1,
                                    _ => errors += 1,
                                }
                            }
                        }
                        Ok(Err(e)) => {
                            eprintln!("[classify] Batch LLM error: {}", e);
                            errors += batch.len();
                        }
                        Err(e) => {
                            eprintln!("[classify] Join error: {}", e);
                            errors += batch.len();
                        }
                    }
                }

            }

            // Emit progress
            let remaining = total.saturating_sub(classified + errors);
            let _ = app.emit("jobs:update", serde_json::json!({
                "id": &tracking_id,
                "name": "Classify Job Postings",
                "status": "running",
                "message": format!("{} classified, {} errors, ~{} remaining", classified, errors, remaining),
                "startedAt": &started_at,
            }));
        }

        // Done
        let msg = format!(
            "Classified {} jobs{}. All done!",
            classified,
            if errors > 0 { format!(" ({} errors)", errors) } else { String::new() },
        );
        let _ = app.emit("jobs:update", serde_json::json!({
            "id": &tracking_id,
            "name": "Classify Job Postings",
            "status": "completed",
            "message": msg,
            "startedAt": &started_at,
        }));
    });

    Ok(ClassifyResult {
        status: "started".into(),
        classified: 0,
        errors: 0,
        total,
        message: format!("Classification started for {} unclassified jobs", total),
    })
}
