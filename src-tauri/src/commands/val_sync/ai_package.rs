// AI Package Generator — assembles domain AI skill packages.
// Copies skill templates into a domain's ai/ folder and generates instructions.md
// for use by Claude Code.
// Skills are assigned per-domain via ai_config.json.

use super::config::load_config_internal;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::command;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiPackageResult {
    pub domain: String,
    pub skills_copied: Vec<String>,
    pub instructions_generated: bool,
    pub errors: Vec<String>,
}

/// Per-domain AI config stored in {domain}/ai/ai_config.json
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DomainAiConfig {
    #[serde(default)]
    pub skills: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainAiStatus {
    pub domain: String,
    pub domain_type: String,
    pub global_path: String,
    pub has_ai_folder: bool,
    pub skill_count: usize,
    pub has_instructions: bool,
    pub skill_files: Vec<String>,
    /// Skills configured for this domain (from ai_config.json)
    pub configured_skills: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractTemplatesResult {
    pub skills_extracted: Vec<String>,
    pub instructions_extracted: bool,
}

// ============================================================================
// Helpers
// ============================================================================

/// Read ai_config.json from a domain's ai/ folder
fn read_ai_config(ai_path: &Path) -> DomainAiConfig {
    let config_path = ai_path.join("ai_config.json");
    match fs::read_to_string(&config_path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => DomainAiConfig::default(),
    }
}

/// Read the description field from a skill's skill.json
fn read_skill_description(platform_skills_path: &Path, slug: &str) -> Option<String> {
    let skill_json_path = platform_skills_path.join(slug).join("skill.json");
    let raw = fs::read_to_string(&skill_json_path).ok()?;
    let parsed: serde_json::Value = serde_json::from_str(&raw).ok()?;
    parsed.get("description")?.as_str().map(|s| s.to_string())
}

/// Regenerate instructions.md from template or fallback.
/// Reads skill.json for each skill to include descriptions in the instructions.
fn regenerate_instructions(
    ai_path: &Path,
    templates_base: &Path,
    platform_skills_path: &Path,
    domain: &str,
    skills: &[String],
) -> Result<bool, String> {
    let instructions_path = ai_path.join("instructions.md");
    let instructions_template = templates_base.join("instructions.md");

    // Build skill list with descriptions from skill.json
    let skill_list = skills
        .iter()
        .map(|s| {
            let desc = read_skill_description(platform_skills_path, s);
            match desc {
                Some(d) => format!("- `skills/{}/SKILL.md` — {}", s, d),
                None => format!("- `skills/{}/SKILL.md`", s),
            }
        })
        .collect::<Vec<_>>()
        .join("\n");

    if instructions_template.exists() {
        let template = fs::read_to_string(&instructions_template)
            .map_err(|e| format!("Failed to read instructions template: {}", e))?;
        let content = template
            .replace("{{DOMAIN}}", domain)
            .replace("{{SKILL_LIST}}", &skill_list);
        fs::write(&instructions_path, &content)
            .map_err(|e| format!("Failed to write instructions.md: {}", e))?;
        Ok(true)
    } else {
        let content = format!(
            "# {} AI Package\n\n\
             This folder contains AI skill documentation for the {} domain.\n\n\
             ## Skills\n\n{}\n",
            domain, domain, skill_list
        );
        fs::write(&instructions_path, &content)
            .map_err(|e| format!("Failed to write instructions.md: {}", e))?;
        Ok(true)
    }
}

// ============================================================================
// Commands
// ============================================================================

/// Generate an AI package for a specific domain.
/// Copies skill templates and generates instructions.md.
#[command]
pub fn val_generate_ai_package(
    domain: String,
    entities_path: String,
    templates_path: String,
    skills: Vec<String>,
) -> Result<AiPackageResult, String> {
    let entities_base = Path::new(&entities_path);
    if !entities_base.exists() {
        return Err(format!("Entities path does not exist: {}", entities_path));
    }

    // Find the domain's global_path from config
    let config = load_config_internal()?;
    let domain_config = config
        .domains
        .iter()
        .find(|d| d.domain == domain)
        .ok_or_else(|| format!("Domain '{}' not found in config", domain))?;

    let global_path = Path::new(&domain_config.global_path);
    let ai_path = global_path.join("ai");
    let ai_tables_path = ai_path.join("tables");
    let ai_skills_path = ai_path.join("skills");

    let mut skills_copied: Vec<String> = Vec::new();
    let mut errors: Vec<String> = Vec::new();

    // Clean out old tables folder (no longer generated) and skills before regenerating
    if ai_tables_path.exists() {
        if let Err(e) = fs::remove_dir_all(&ai_tables_path) {
            errors.push(format!("Failed to clean ai/tables/: {}", e));
        }
    }
    if ai_skills_path.exists() {
        if let Err(e) = fs::remove_dir_all(&ai_skills_path) {
            errors.push(format!("Failed to clean ai/skills/: {}", e));
        }
    }

    // Copy skill templates — only the skills explicitly passed for this domain
    // Look in 0_Platform/skills/{slug}/SKILL.md (new structure), fall back to templates/skills/{slug}.md
    let platform_skills = entities_base.join("../../../skills");
    let templates_base = Path::new(&templates_path);
    let templates_skills = templates_base.join("skills");

    for skill in &skills {
        // New structure: 0_Platform/skills/{slug}/SKILL.md
        let new_src = platform_skills.join(skill).join("SKILL.md");
        // Legacy: templates/skills/{slug}.md
        let legacy_src = templates_skills.join(format!("{}.md", skill));
        let src = if new_src.exists() { new_src } else { legacy_src };
        if !src.exists() {
            errors.push(format!("Skill template not found: {}/SKILL.md", skill));
            continue;
        }

        let skill_dir = ai_skills_path.join(skill);
        if let Err(e) = fs::create_dir_all(&skill_dir) {
            errors.push(format!("Failed to create ai/skills/{}/: {}", skill, e));
            continue;
        }

        let dest = skill_dir.join("SKILL.md");

        match fs::read_to_string(&src) {
            Ok(content) => {
                let replaced = content.replace("{{DOMAIN}}", &domain);
                match fs::write(&dest, &replaced) {
                    Ok(_) => skills_copied.push(skill.clone()),
                    Err(e) => errors.push(format!("Failed to write skill {}: {}", skill, e)),
                }
            }
            Err(e) => errors.push(format!("Failed to read skill template {}: {}", skill, e)),
        }
    }

    // Save ai_config.json with the skills selection
    if let Err(e) = fs::create_dir_all(&ai_path) {
        errors.push(format!("Failed to create ai/ dir: {}", e));
    } else {
        let ai_config = DomainAiConfig {
            skills: skills.clone(),
        };
        let config_path = ai_path.join("ai_config.json");
        let config_json = serde_json::to_string_pretty(&ai_config)
            .unwrap_or_else(|_| "{}".to_string());
        if let Err(e) = fs::write(&config_path, &config_json) {
            errors.push(format!("Failed to write ai_config.json: {}", e));
        }
    }

    // Always (re)generate instructions.md so skill lists stay current
    let instructions_generated = match regenerate_instructions(
        &ai_path, &templates_base, &platform_skills, &domain, &skills_copied,
    ) {
        Ok(v) => v,
        Err(e) => {
            errors.push(e);
            false
        }
    };

    Ok(AiPackageResult {
        domain,
        skills_copied,
        instructions_generated,
        errors,
    })
}

/// Save the AI skill configuration for a specific domain.
/// Writes ai_config.json to {domain}/ai/ with the selected skills.
#[command]
pub fn val_save_domain_ai_config(
    domain: String,
    skills: Vec<String>,
) -> Result<(), String> {
    let config = load_config_internal()?;
    let domain_config = config
        .domains
        .iter()
        .find(|d| d.domain == domain)
        .ok_or_else(|| format!("Domain '{}' not found in config", domain))?;

    let global_path = Path::new(&domain_config.global_path);
    let ai_path = global_path.join("ai");

    fs::create_dir_all(&ai_path)
        .map_err(|e| format!("Failed to create ai/ dir: {}", e))?;

    let ai_config = DomainAiConfig { skills };
    let config_json = serde_json::to_string_pretty(&ai_config)
        .map_err(|e| format!("Failed to serialize ai_config: {}", e))?;

    let config_path = ai_path.join("ai_config.json");
    fs::write(&config_path, &config_json)
        .map_err(|e| format!("Failed to write ai_config.json: {}", e))?;

    Ok(())
}

/// List AI package status for all configured domains.
/// Includes configured_skills from each domain's ai_config.json.
#[command]
pub fn val_list_domain_ai_status(
    _entities_path: Option<String>,
) -> Result<Vec<DomainAiStatus>, String> {
    let config = load_config_internal()?;

    let mut statuses: Vec<DomainAiStatus> = Vec::new();

    for dc in &config.domains {
        let global_path = Path::new(&dc.global_path);
        let ai_path = global_path.join("ai");
        let has_ai_folder = ai_path.exists();

        let mut skill_files: Vec<String> = Vec::new();
        let has_instructions = ai_path.join("instructions.md").exists();
        let ai_config = read_ai_config(&ai_path);

        if has_ai_folder {
            // Scan skills/
            let skills_dir = ai_path.join("skills");
            if skills_dir.exists() {
                if let Ok(entries) = fs::read_dir(&skills_dir) {
                    for entry in entries.flatten() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if name.ends_with(".md") {
                            skill_files.push(name);
                        }
                    }
                }
            }
            skill_files.sort();
        }

        statuses.push(DomainAiStatus {
            domain: dc.domain.clone(),
            domain_type: dc.domain_type.clone().unwrap_or_else(|| "production".to_string()),
            global_path: dc.global_path.clone(),
            has_ai_folder,
            skill_count: skill_files.len(),
            has_instructions,
            skill_files,
            configured_skills: ai_config.skills,
        });
    }

    // Sort: domains with ai/ first, then alphabetical
    statuses.sort_by(|a, b| {
        b.has_ai_folder.cmp(&a.has_ai_folder)
            .then(a.domain.cmp(&b.domain))
    });

    Ok(statuses)
}

/// Extract templates from an existing domain's AI package.
/// Copies skills and instructions to a templates folder, replacing domain name with {{DOMAIN}}.
#[command]
pub fn val_extract_ai_templates(
    domain: String,
    templates_output_path: String,
) -> Result<ExtractTemplatesResult, String> {
    let config = load_config_internal()?;
    let domain_config = config
        .domains
        .iter()
        .find(|d| d.domain == domain)
        .ok_or_else(|| format!("Domain '{}' not found in config", domain))?;

    let global_path = Path::new(&domain_config.global_path);
    let ai_path = global_path.join("ai");

    if !ai_path.exists() {
        return Err(format!("No ai/ folder in domain '{}'", domain));
    }

    let output_path = Path::new(&templates_output_path);
    let output_skills = output_path.join("skills");

    let mut skills_extracted: Vec<String> = Vec::new();

    // Extract skills
    let skills_dir = ai_path.join("skills");
    if skills_dir.exists() {
        fs::create_dir_all(&output_skills)
            .map_err(|e| format!("Failed to create templates/skills/: {}", e))?;

        if let Ok(entries) = fs::read_dir(&skills_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if !name.ends_with(".md") { continue; }

                match fs::read_to_string(entry.path()) {
                    Ok(content) => {
                        let templatized = content.replace(&domain, "{{DOMAIN}}");
                        let dest = output_skills.join(&name);
                        match fs::write(&dest, &templatized) {
                            Ok(_) => skills_extracted.push(name),
                            Err(e) => eprintln!("Failed to write template {}: {}", name, e),
                        }
                    }
                    Err(e) => eprintln!("Failed to read skill {}: {}", name, e),
                }
            }
        }
    }

    // Extract instructions
    let instructions_src = ai_path.join("instructions.md");
    let instructions_extracted = if instructions_src.exists() {
        match fs::read_to_string(&instructions_src) {
            Ok(content) => {
                fs::create_dir_all(output_path)
                    .map_err(|e| format!("Failed to create templates dir: {}", e))?;
                let templatized = content.replace(&domain, "{{DOMAIN}}");
                let dest = output_path.join("instructions.md");
                fs::write(&dest, &templatized)
                    .map_err(|e| format!("Failed to write instructions template: {}", e))?;
                true
            }
            Err(e) => {
                eprintln!("Failed to read instructions.md: {}", e);
                false
            }
        }
    } else {
        false
    };

    Ok(ExtractTemplatesResult {
        skills_extracted,
        instructions_extracted,
    })
}
