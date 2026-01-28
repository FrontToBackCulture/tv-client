// Contact rules + bootstrap from knowledge base
// Ported from outlook-sync/index.js (lines 706-800)

use super::db::EmailDb;
use super::types::ContactRule;
use std::fs;
use std::path::Path;

/// Bootstrap contacts from the knowledge base 3_Clients folder
pub fn bootstrap_contacts(db: &EmailDb, knowledge_path: &str) -> Result<usize, String> {
    let mut count = 0;

    // 1. Default noise domains
    let noise_domains = [
        "linkedin.com",
        "marketing.linkedin.com",
        "newsletters.medium.com",
        "amazonses.com",
        "sendgrid.net",
        "mailchimp.com",
        "hubspot.com",
        "marketo.com",
        "constantcontact.com",
        "mandrillapp.com",
        "mailgun.org",
        "sparkpostmail.com",
    ];

    for domain in &noise_domains {
        db.upsert_contact(&ContactRule {
            match_type: "noise_domain".to_string(),
            match_value: domain.to_string(),
            entity_type: "noise".to_string(),
            entity_name: "Noise".to_string(),
            entity_path: None,
        })?;
        count += 1;
    }

    // 2. Internal domain
    db.upsert_contact(&ContactRule {
        match_type: "domain".to_string(),
        match_value: "thinkval.com".to_string(),
        entity_type: "internal".to_string(),
        entity_name: "ThinkVAL".to_string(),
        entity_path: Some("1_Company".to_string()),
    })?;
    count += 1;

    // 3. Common vendor domains
    let vendors = [
        ("aws.amazon.com", "AWS"),
        ("amazonaws.com", "AWS"),
        ("google.com", "Google"),
        ("microsoft.com", "Microsoft"),
        ("github.com", "GitHub"),
        ("stripe.com", "Stripe"),
        ("vercel.com", "Vercel"),
        ("notion.so", "Notion"),
        ("slack.com", "Slack"),
        ("zoom.us", "Zoom"),
        ("anthropic.com", "Anthropic"),
        ("openai.com", "OpenAI"),
    ];

    for (domain, name) in &vendors {
        db.upsert_contact(&ContactRule {
            match_type: "domain".to_string(),
            match_value: domain.to_string(),
            entity_type: "vendor".to_string(),
            entity_name: name.to_string(),
            entity_path: None,
        })?;
        count += 1;
    }

    // 4. Scan 3_Clients/by_industry for client domains
    let clients_path = Path::new(knowledge_path).join("3_Clients").join("by_industry");
    if clients_path.exists() {
        if let Ok(industries) = fs::read_dir(&clients_path) {
            for industry_entry in industries.flatten() {
                if !industry_entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    continue;
                }
                let industry = industry_entry.file_name().to_string_lossy().to_string();

                if let Ok(clients) = fs::read_dir(industry_entry.path()) {
                    for client_entry in clients.flatten() {
                        if !client_entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                            continue;
                        }
                        let client_name = client_entry.file_name().to_string_lossy().to_string();
                        let domain_guess: String = client_name
                            .to_lowercase()
                            .chars()
                            .filter(|c| c.is_alphanumeric())
                            .collect();

                        if domain_guess.is_empty() {
                            continue;
                        }

                        let entity_path = format!(
                            "3_Clients/by_industry/{}/{}",
                            industry, client_name
                        );

                        // Common domain patterns
                        for suffix in &[".com", ".com.sg", ".sg"] {
                            let domain = format!("{}{}", domain_guess, suffix);
                            db.upsert_contact(&ContactRule {
                                match_type: "domain".to_string(),
                                match_value: domain,
                                entity_type: "client".to_string(),
                                entity_name: client_name.clone(),
                                entity_path: Some(entity_path.clone()),
                            })?;
                            count += 1;
                        }
                    }
                }
            }
        }
    }

    Ok(count)
}
