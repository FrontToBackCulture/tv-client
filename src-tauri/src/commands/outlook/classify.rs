// Email classification + priority scoring
// Ported from outlook-sync/index.js (lines 809-941)

use super::db::EmailDb;

pub struct Classification {
    pub category: String,
    #[allow(dead_code)]
    pub confidence: f32,
    pub entity_name: Option<String>,
    pub entity_path: Option<String>,
}

/// Classify an email based on contacts and patterns
pub fn classify_email(
    from_email: &str,
    subject: &str,
    body_preview: &str,
    db: &EmailDb,
) -> Classification {
    let from_email_lower = from_email.to_lowercase();
    let from_domain = from_email_lower
        .split('@')
        .nth(1)
        .unwrap_or("")
        .to_string();
    let subject_lower = subject.to_lowercase();
    let preview_lower = body_preview.to_lowercase();

    // 1. Exact email match (95% confidence)
    if let Ok(Some(contact)) = db.find_contact_by_email(&from_email_lower) {
        return Classification {
            category: contact.entity_type,
            confidence: 0.95,
            entity_name: Some(contact.entity_name),
            entity_path: contact.entity_path,
        };
    }

    // 2. Domain match (85% confidence)
    if let Ok(Some(contact)) = db.find_contact_by_domain(&from_domain) {
        return Classification {
            category: contact.entity_type,
            confidence: 0.85,
            entity_name: Some(contact.entity_name),
            entity_path: contact.entity_path,
        };
    }

    // 3. Noise domain check (90% confidence)
    if let Ok(true) = db.is_noise_domain(&from_domain) {
        return Classification {
            category: "noise".to_string(),
            confidence: 0.9,
            entity_name: None,
            entity_path: None,
        };
    }

    // Also check if from_email contains noise indicators
    if from_email_lower.contains("noreply")
        || from_email_lower.contains("no-reply")
        || from_email_lower.contains("mailer-daemon")
        || from_email_lower.contains("postmaster")
    {
        return Classification {
            category: "noise".to_string(),
            confidence: 0.9,
            entity_name: None,
            entity_path: None,
        };
    }

    // 4. Noise patterns in content (75% confidence)
    let noise_patterns = [
        "unsubscribe",
        "view in browser",
        "email preferences",
        "marketing",
        "newsletter",
        "promotional",
        "noreply",
        "no-reply",
        "donotreply",
    ];

    for pattern in &noise_patterns {
        if preview_lower.contains(pattern) || from_email_lower.contains(pattern) {
            return Classification {
                category: "noise".to_string(),
                confidence: 0.75,
                entity_name: None,
                entity_path: None,
            };
        }
    }

    // 5. Lead signals (70% confidence) - only if business domain
    let personal_domains = [
        "gmail.com",
        "yahoo.com",
        "hotmail.com",
        "outlook.com",
        "icloud.com",
        "live.com",
        "aol.com",
        "yahoo.co",
        "hotmail.co",
        "gmail.co",
    ];
    let is_business_domain = !personal_domains
        .iter()
        .any(|d| from_domain.contains(d));

    if is_business_domain {
        let lead_signals = [
            "interest",
            "demo",
            "pricing",
            "learn more",
            "schedule a call",
            "would like to",
            "looking for a solution",
            "recommendation",
        ];

        for signal in &lead_signals {
            if subject_lower.contains(signal) || preview_lower.contains(signal) {
                return Classification {
                    category: "lead".to_string(),
                    confidence: 0.7,
                    entity_name: None,
                    entity_path: None,
                };
            }
        }
    }

    // 6. Default: unknown
    Classification {
        category: "unknown".to_string(),
        confidence: 0.5,
        entity_name: None,
        entity_path: None,
    }
}

/// Calculate priority score (0-100)
pub fn calculate_priority(
    category: &str,
    received_at: &str,
    is_read: bool,
    importance: &str,
) -> (i32, String) {
    let mut score: i32 = 50;

    // Category adjustments
    score += match category {
        "client" => 30,
        "deal" => 25,
        "lead" => 20,
        "internal" => 10,
        "unknown" => 5,
        "vendor" => 0,
        "noise" => -30,
        _ => 0,
    };

    // Time-based modifiers
    if let Ok(received) = chrono::DateTime::parse_from_rfc3339(received_at) {
        let hours_ago = (chrono::Utc::now() - received.with_timezone(&chrono::Utc))
            .num_hours();
        if hours_ago < 2 {
            score += 10;
        } else if hours_ago > 48 {
            score -= 10;
        }
    }

    // Unread bonus
    if !is_read {
        score += 5;
    }

    // High importance
    if importance == "high" {
        score += 15;
    }

    // Clamp to 0-100
    score = score.clamp(0, 100);

    let level = if score >= 70 {
        "high"
    } else if score >= 40 {
        "medium"
    } else {
        "low"
    };

    (score, level.to_string())
}

/// Determine if action is required based on classification
pub fn is_action_required(category: &str, priority_score: i32) -> bool {
    matches!(category, "client" | "deal" | "lead") && priority_score >= 50
}
