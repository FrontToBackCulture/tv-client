// VAL Sync Overview - Generate HTML overview page for a domain
// Shows sync status, artifact counts, and recent history

use super::config::get_domain_config;
use super::metadata::load_metadata;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::Instant;
use tauri::command;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverviewResult {
    pub domain: String,
    pub file_path: String,
    pub duration_ms: u64,
}

// ============================================================================
// Helper functions
// ============================================================================

fn format_relative_time(iso_date: &str) -> String {
    let date = match chrono::DateTime::parse_from_rfc3339(iso_date) {
        Ok(d) => d.with_timezone(&chrono::Utc),
        Err(_) => return "Never".to_string(),
    };

    let now = chrono::Utc::now();
    let diff = now.signed_duration_since(date);
    let secs = diff.num_seconds();

    if secs < 60 {
        "Just now".to_string()
    } else if secs < 3600 {
        let mins = secs / 60;
        format!("{} minute{} ago", mins, if mins != 1 { "s" } else { "" })
    } else if secs < 86400 {
        let hours = secs / 3600;
        format!("{} hour{} ago", hours, if hours != 1 { "s" } else { "" })
    } else if secs < 2592000 {
        let days = secs / 86400;
        format!("{} day{} ago", days, if days != 1 { "s" } else { "" })
    } else {
        date.format("%Y-%m-%d").to_string()
    }
}

fn get_status_badge(status: &str) -> &'static str {
    match status {
        "ok" | "success" => r#"<span class="badge badge-success">Success</span>"#,
        "partial" => r#"<span class="badge badge-warning">Partial</span>"#,
        "error" | "failed" => r#"<span class="badge badge-error">Failed</span>"#,
        _ => r#"<span class="badge badge-neutral">Never</span>"#,
    }
}

fn generate_overview_html(domain: &str, global_path: &str) -> String {
    let metadata = load_metadata(global_path);

    // Calculate totals
    let total_artifacts: usize = metadata.artifacts.values().map(|a| a.count).sum();
    let total_extractions: usize = metadata.extractions.values().map(|e| e.count).sum();

    // Generate artifact cards
    let artifact_cards: String = metadata.artifacts.iter()
        .map(|(name, status)| {
            format!(r#"
            <div class="card">
                <h3>{}</h3>
                <div class="count">{}</div>
                <div class="timestamp">Last sync: {}</div>
                {}
            </div>
            "#,
                name.replace("-", " ").replace("_", " "),
                status.count,
                if status.last_sync.is_empty() { "Never".to_string() } else { format_relative_time(&status.last_sync) },
                get_status_badge(&status.status)
            )
        })
        .collect();

    // Generate extraction cards
    let extraction_cards: String = metadata.extractions.iter()
        .map(|(name, status)| {
            format!(r#"
            <div class="card">
                <h3>{}</h3>
                <div class="count">{}</div>
                <div class="timestamp">Last sync: {}</div>
                {}
            </div>
            "#,
                name.replace("-", " ").replace("_", " "),
                status.count,
                if status.last_sync.is_empty() { "Never".to_string() } else { format_relative_time(&status.last_sync) },
                get_status_badge(&status.status)
            )
        })
        .collect();

    // Generate history rows
    let history_rows: String = metadata.history.iter()
        .rev()
        .take(20)
        .map(|entry| {
            format!(r#"
            <tr>
                <td>{}</td>
                <td>{}</td>
                <td>{}</td>
                <td>{}</td>
            </tr>
            "#,
                format_relative_time(&entry.timestamp),
                entry.operation,
                entry.details.as_deref().unwrap_or("-"),
                get_status_badge(&entry.status)
            )
        })
        .collect();

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC").to_string();

    format!(r#"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{domain} - Sync Overview</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: #f5f7fa;
            color: #2d3748;
            line-height: 1.6;
            padding: 20px;
        }}
        .container {{
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }}
        .header {{
            background: linear-gradient(135deg, #14b8a6 0%, #0d9488 100%);
            color: white;
            padding: 30px;
        }}
        .header h1 {{ font-size: 32px; font-weight: 600; margin-bottom: 8px; }}
        .header p {{ opacity: 0.9; font-size: 14px; }}
        .content {{ padding: 30px; }}
        .section {{ margin-bottom: 40px; }}
        .section h2 {{
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 20px;
            color: #2d3748;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 10px;
        }}
        .summary-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 30px;
        }}
        .summary-card {{
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 15px;
            text-align: center;
        }}
        .summary-card .label {{ font-size: 12px; color: #718096; margin-bottom: 8px; }}
        .summary-card .value {{ font-size: 24px; font-weight: 700; color: #2d3748; }}
        .cards {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }}
        .card {{
            background: #f7fafc;
            border-radius: 8px;
            padding: 20px;
            border-left: 4px solid #14b8a6;
        }}
        .card h3 {{
            font-size: 14px;
            font-weight: 600;
            color: #718096;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 12px;
        }}
        .card .count {{ font-size: 32px; font-weight: 700; color: #2d3748; margin-bottom: 8px; }}
        .card .timestamp {{ font-size: 13px; color: #718096; margin-bottom: 8px; }}
        .badge {{
            display: inline-block;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
        }}
        .badge-success {{ background: #c6f6d5; color: #22543d; }}
        .badge-warning {{ background: #feebc8; color: #744210; }}
        .badge-error {{ background: #fed7d7; color: #742a2a; }}
        .badge-neutral {{ background: #e2e8f0; color: #4a5568; }}
        .history-table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
        }}
        .history-table th {{
            background: #f7fafc;
            padding: 12px;
            text-align: left;
            font-weight: 600;
            color: #4a5568;
            border-bottom: 2px solid #e2e8f0;
        }}
        .history-table td {{ padding: 12px; border-bottom: 1px solid #e2e8f0; }}
        .history-table tr:hover {{ background: #f7fafc; }}
        .footer {{
            padding: 20px 30px;
            background: #f7fafc;
            border-top: 1px solid #e2e8f0;
            font-size: 13px;
            color: #718096;
            text-align: center;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{domain}</h1>
            <p>VAL Sync Overview • Generated: {now}</p>
        </div>
        <div class="content">
            <div class="section">
                <h2>Summary</h2>
                <div class="summary-grid">
                    <div class="summary-card">
                        <div class="label">Total Artifacts</div>
                        <div class="value">{total_artifacts}</div>
                    </div>
                    <div class="summary-card">
                        <div class="label">Total Extractions</div>
                        <div class="value">{total_extractions}</div>
                    </div>
                    <div class="summary-card">
                        <div class="label">Sync History</div>
                        <div class="value">{history_count}</div>
                    </div>
                </div>
            </div>
            <div class="section">
                <h2>Artifacts</h2>
                <div class="cards">{artifact_cards}</div>
            </div>
            <div class="section">
                <h2>Extractions</h2>
                <div class="cards">{extraction_cards}</div>
            </div>
            <div class="section">
                <h2>Recent Sync History</h2>
                <table class="history-table">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Operation</th>
                            <th>Details</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>{history_rows}</tbody>
                </table>
            </div>
        </div>
        <div class="footer">
            Generated by tv-desktop • {now}
        </div>
    </div>
</body>
</html>"#,
        domain = domain,
        now = now,
        total_artifacts = total_artifacts,
        total_extractions = total_extractions,
        history_count = metadata.history.len(),
        artifact_cards = artifact_cards,
        extraction_cards = extraction_cards,
        history_rows = history_rows,
    )
}

// ============================================================================
// Commands
// ============================================================================

/// Generate HTML overview page for a domain
#[command]
pub async fn val_generate_overview(domain: String) -> Result<OverviewResult, String> {
    let start = Instant::now();
    let domain_config = get_domain_config(&domain)?;
    let global_path = &domain_config.global_path;

    // Generate HTML content
    let html = generate_overview_html(&domain, global_path);

    // Write to file
    let file_path = Path::new(global_path).join("overview.html");
    fs::write(&file_path, html)
        .map_err(|e| format!("Failed to write overview.html: {}", e))?;

    Ok(OverviewResult {
        domain,
        file_path: file_path.to_string_lossy().to_string(),
        duration_ms: start.elapsed().as_millis() as u64,
    })
}
