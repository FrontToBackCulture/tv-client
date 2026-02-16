// AI Package Generator — assembles domain AI skill packages from tagged entities.
// Reads schema.json ai_package flags, copies table docs and skill templates
// into a domain's ai/ folder for use by Claude Code.
// Skills are assigned per-domain via ai_config.json, not from entity tags.

use super::config::load_config_internal;
use super::domain_model::read_schema_json_pub;
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
    pub tables_copied: Vec<String>,
    pub skills_copied: Vec<String>,
    pub instructions_generated: bool,
    pub errors: Vec<String>,
}

/// Per-domain AI config stored in {domain}/ai/ai_config.json
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DomainAiConfig {
    #[serde(default)]
    pub skills: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub disabled_tables: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiTableInfo {
    /// Slugified filename in ai/tables/ (e.g. "raw-receipt-payments.md")
    pub file_name: String,
    /// VAL table ID (e.g. "custom_tbl_1_19")
    pub table_id: String,
    /// Human-readable display name from schema.json (domain-specific)
    pub display_name: String,
    /// Which skills this table is tagged for (from entity ai_skills)
    pub ai_skills: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainAiStatus {
    pub domain: String,
    pub domain_type: String,
    pub global_path: String,
    pub has_ai_folder: bool,
    pub table_count: usize,
    pub skill_count: usize,
    pub has_instructions: bool,
    pub table_files: Vec<AiTableInfo>,
    pub skill_files: Vec<String>,
    /// Skills configured for this domain (from ai_config.json)
    pub configured_skills: Vec<String>,
    /// Tables disabled for this domain (from ai_config.json)
    pub disabled_tables: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractTemplatesResult {
    pub skills_extracted: Vec<String>,
    pub instructions_extracted: bool,
}

// ============================================================================
// Helpers
// ============================================================================

/// Slugify a display name for use as a filename: lowercase, spaces to hyphens, strip non-alphanum
fn slugify(name: &str) -> String {
    name.to_lowercase()
        .replace(' ', "-")
        .replace('/', "-")
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

/// Read ai_config.json from a domain's ai/ folder
fn read_ai_config(ai_path: &Path) -> DomainAiConfig {
    let config_path = ai_path.join("ai_config.json");
    match fs::read_to_string(&config_path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => DomainAiConfig::default(),
    }
}

// ============================================================================
// Commands
// ============================================================================

/// Generate an AI package for a specific domain.
/// Scans entity schemas for ai_package=true (tables), uses explicit skills list (per-domain).
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

    let mut tables_copied: Vec<String> = Vec::new();
    let mut skills_copied: Vec<String> = Vec::new();
    let mut errors: Vec<String> = Vec::new();

    // Clean out old tables and skills before regenerating
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

    // Scan all entity/model folders for ai_package == true → copy table docs
    let entity_dirs = fs::read_dir(entities_base)
        .map_err(|e| format!("Failed to read entities dir: {}", e))?;

    for entity_entry in entity_dirs.flatten() {
        if !entity_entry.path().is_dir() { continue; }
        if entity_entry.file_name().to_string_lossy().starts_with('.') { continue; }
        if entity_entry.file_name().to_string_lossy().starts_with('_') { continue; }

        let model_entries = match fs::read_dir(entity_entry.path()) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for model_entry in model_entries.flatten() {
            if !model_entry.path().is_dir() { continue; }

            let schema = match read_schema_json_pub(&model_entry.path()) {
                Some(s) => s,
                None => continue,
            };

            if schema.ai_package != Some(true) { continue; }

            // Find the domain's table overview.md
            let table_name = &schema.table_name;
            let overview_path = global_path
                .join("data_models")
                .join(format!("table_{}", table_name))
                .join("overview.md");

            let slug = slugify(&schema.display_name);
            let dest_filename = format!("{}.md", slug);

            if overview_path.exists() {
                if let Err(e) = fs::create_dir_all(&ai_tables_path) {
                    errors.push(format!("Failed to create ai/tables/: {}", e));
                    continue;
                }

                let dest = ai_tables_path.join(&dest_filename);
                match fs::copy(&overview_path, &dest) {
                    Ok(_) => tables_copied.push(dest_filename.clone()),
                    Err(e) => errors.push(format!(
                        "Failed to copy {} overview: {}",
                        schema.display_name, e
                    )),
                }
            } else {
                // No overview.md — generate a minimal stub from schema.json
                if let Err(e) = fs::create_dir_all(&ai_tables_path) {
                    errors.push(format!("Failed to create ai/tables/: {}", e));
                    continue;
                }

                let stub = format!(
                    "# {}\n\n**Table:** `{}`\n\n{}\n\n## Fields\n\n{}\n",
                    schema.display_name,
                    schema.table_name,
                    schema.description.as_deref().unwrap_or(""),
                    schema.fields.iter()
                        .map(|f| format!("- **{}** (`{}`, {}) — {}",
                            f.name, f.column, f.field_type,
                            f.description.as_deref().unwrap_or("")
                        ))
                        .collect::<Vec<_>>()
                        .join("\n"),
                );

                let dest = ai_tables_path.join(&dest_filename);
                match fs::write(&dest, &stub) {
                    Ok(_) => tables_copied.push(dest_filename.clone()),
                    Err(e) => errors.push(format!(
                        "Failed to write stub for {}: {}",
                        schema.display_name, e
                    )),
                }
            }
        }
    }

    // Remove disabled tables (persisted from prior config)
    let existing_config = read_ai_config(&ai_path);
    let disabled = &existing_config.disabled_tables;
    if !disabled.is_empty() {
        tables_copied.retain(|t| {
            if disabled.contains(t) {
                // Delete the file we just copied
                let dest = ai_tables_path.join(t);
                let _ = fs::remove_file(&dest);
                false
            } else {
                true
            }
        });
    }

    // Copy skill templates — only the skills explicitly passed for this domain
    let templates_base = Path::new(&templates_path);
    let templates_skills = templates_base.join("skills");

    for skill in &skills {
        let src = templates_skills.join(format!("{}.md", skill));
        if !src.exists() {
            errors.push(format!("Skill template not found: {}.md", skill));
            continue;
        }

        if let Err(e) = fs::create_dir_all(&ai_skills_path) {
            errors.push(format!("Failed to create ai/skills/: {}", e));
            continue;
        }

        let dest = ai_skills_path.join(format!("{}.md", skill));

        match fs::read_to_string(&src) {
            Ok(content) => {
                let replaced = content.replace("{{DOMAIN}}", &domain);
                match fs::write(&dest, &replaced) {
                    Ok(_) => skills_copied.push(format!("{}.md", skill)),
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
            disabled_tables: existing_config.disabled_tables.clone(),
        };
        let config_path = ai_path.join("ai_config.json");
        let config_json = serde_json::to_string_pretty(&ai_config)
            .unwrap_or_else(|_| "{}".to_string());
        if let Err(e) = fs::write(&config_path, &config_json) {
            errors.push(format!("Failed to write ai_config.json: {}", e));
        }
    }

    // Always (re)generate instructions.md so table/skill lists stay current
    let instructions_path = ai_path.join("instructions.md");
    let instructions_generated = {
        let instructions_template = templates_base.join("instructions.md");
        let table_list = tables_copied
            .iter()
            .map(|t| format!("- `tables/{}`", t))
            .collect::<Vec<_>>()
            .join("\n");
        let skill_list = skills_copied
            .iter()
            .map(|s| format!("- `skills/{}`", s))
            .collect::<Vec<_>>()
            .join("\n");

        if let Err(e) = fs::create_dir_all(&ai_path) {
            errors.push(format!("Failed to create ai/ dir: {}", e));
            false
        } else if instructions_template.exists() {
            match fs::read_to_string(&instructions_template) {
                Ok(template) => {
                    let content = template
                        .replace("{{DOMAIN}}", &domain)
                        .replace("{{TABLE_LIST}}", &table_list)
                        .replace("{{SKILL_LIST}}", &skill_list);
                    match fs::write(&instructions_path, &content) {
                        Ok(_) => true,
                        Err(e) => {
                            errors.push(format!("Failed to write instructions.md: {}", e));
                            false
                        }
                    }
                }
                Err(e) => {
                    errors.push(format!("Failed to read instructions template: {}", e));
                    false
                }
            }
        } else {
            let content = format!(
                "# {} AI Package\n\n\
                 This folder contains AI skill documentation for the {} domain.\n\n\
                 ## Tables\n\n{}\n\n\
                 ## Skills\n\n{}\n",
                domain, domain, table_list, skill_list
            );
            match fs::write(&instructions_path, &content) {
                Ok(_) => true,
                Err(e) => {
                    errors.push(format!("Failed to write instructions.md: {}", e));
                    false
                }
            }
        }
    };

    Ok(AiPackageResult {
        domain,
        tables_copied,
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
    disabled_tables: Option<Vec<String>>,
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

    // Preserve existing disabled_tables if not explicitly provided
    let existing = read_ai_config(&ai_path);
    let ai_config = DomainAiConfig {
        skills,
        disabled_tables: disabled_tables.unwrap_or(existing.disabled_tables),
    };
    let config_json = serde_json::to_string_pretty(&ai_config)
        .map_err(|e| format!("Failed to serialize ai_config: {}", e))?;

    let config_path = ai_path.join("ai_config.json");
    fs::write(&config_path, &config_json)
        .map_err(|e| format!("Failed to write ai_config.json: {}", e))?;

    Ok(())
}

/// Toggle a single table's enabled/disabled state for a domain.
/// When disabling: deletes the file from ai/tables/, adds to disabled_tables.
/// When enabling: re-copies from data_models or regenerates from schema, removes from disabled_tables.
/// Always regenerates instructions.md afterward.
#[command]
pub fn val_toggle_ai_table(
    domain: String,
    entities_path: String,
    templates_path: String,
    file_name: String,
    enabled: bool,
) -> Result<AiPackageResult, String> {
    let entities_base = Path::new(&entities_path);
    let config = load_config_internal()?;
    let domain_config = config
        .domains
        .iter()
        .find(|d| d.domain == domain)
        .ok_or_else(|| format!("Domain '{}' not found in config", domain))?;

    let global_path = Path::new(&domain_config.global_path);
    let ai_path = global_path.join("ai");
    let ai_tables_path = ai_path.join("tables");
    let mut errors: Vec<String> = Vec::new();

    let mut ai_config = read_ai_config(&ai_path);

    if enabled {
        // Remove from disabled list
        ai_config.disabled_tables.retain(|t| t != &file_name);

        // Re-copy the file from source
        let entity_lookup = build_entity_lookup(entities_base);
        if let Some((table_name, display_name, _)) = entity_lookup.get(&file_name) {
            let overview_path = global_path
                .join("data_models")
                .join(format!("table_{}", table_name))
                .join("overview.md");

            if let Err(e) = fs::create_dir_all(&ai_tables_path) {
                errors.push(format!("Failed to create ai/tables/: {}", e));
            } else if overview_path.exists() {
                let dest = ai_tables_path.join(&file_name);
                if let Err(e) = fs::copy(&overview_path, &dest) {
                    errors.push(format!("Failed to copy {}: {}", display_name, e));
                }
            } else {
                // Regenerate stub from schema — scan entities to find the schema
                let stub = generate_stub_from_entities(entities_base, table_name);
                if let Some(content) = stub {
                    let dest = ai_tables_path.join(&file_name);
                    if let Err(e) = fs::write(&dest, &content) {
                        errors.push(format!("Failed to write stub for {}: {}", display_name, e));
                    }
                } else {
                    errors.push(format!("Could not find schema for table {}", table_name));
                }
            }
        } else {
            errors.push(format!("Table '{}' not found in entity schemas", file_name));
        }
    } else {
        // Add to disabled list (if not already there)
        if !ai_config.disabled_tables.contains(&file_name) {
            ai_config.disabled_tables.push(file_name.clone());
        }

        // Delete the file
        let file_path = ai_tables_path.join(&file_name);
        if file_path.exists() {
            if let Err(e) = fs::remove_file(&file_path) {
                errors.push(format!("Failed to delete {}: {}", file_name, e));
            }
        }
    }

    // Save updated config
    let config_json = serde_json::to_string_pretty(&ai_config)
        .unwrap_or_else(|_| "{}".to_string());
    let config_path = ai_path.join("ai_config.json");
    if let Err(e) = fs::write(&config_path, &config_json) {
        errors.push(format!("Failed to write ai_config.json: {}", e));
    }

    // Collect current enabled tables
    let tables_on_disk = list_table_files(&ai_tables_path);

    // Regenerate instructions.md
    let templates_base = Path::new(&templates_path);
    let ai_skills_path = ai_path.join("skills");
    let skills_on_disk = list_skill_files(&ai_skills_path);
    let instructions_generated = regenerate_instructions(
        &ai_path, templates_base, &domain, &tables_on_disk, &skills_on_disk,
    );
    if let Err(ref e) = instructions_generated {
        errors.push(e.clone());
    }

    Ok(AiPackageResult {
        domain,
        tables_copied: tables_on_disk,
        skills_copied: skills_on_disk,
        instructions_generated: instructions_generated.unwrap_or(false),
        errors,
    })
}

/// Generate a stub markdown file from entity schema fields
fn generate_stub_from_entities(entities_base: &Path, target_table: &str) -> Option<String> {
    let entity_dirs = fs::read_dir(entities_base).ok()?;
    for entity_entry in entity_dirs.flatten() {
        if !entity_entry.path().is_dir() { continue; }
        let model_entries = match fs::read_dir(entity_entry.path()) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for model_entry in model_entries.flatten() {
            if !model_entry.path().is_dir() { continue; }
            let schema = match read_schema_json_pub(&model_entry.path()) {
                Some(s) => s,
                None => continue,
            };
            if schema.table_name == target_table {
                return Some(format!(
                    "# {}\n\n**Table:** `{}`\n\n{}\n\n## Fields\n\n{}\n",
                    schema.display_name,
                    schema.table_name,
                    schema.description.as_deref().unwrap_or(""),
                    schema.fields.iter()
                        .map(|f| format!("- **{}** (`{}`, {}) — {}",
                            f.name, f.column, f.field_type,
                            f.description.as_deref().unwrap_or("")
                        ))
                        .collect::<Vec<_>>()
                        .join("\n"),
                ));
            }
        }
    }
    None
}

/// List .md files in a directory
fn list_table_files(dir: &Path) -> Vec<String> {
    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".md") {
                files.push(name);
            }
        }
    }
    files.sort();
    files
}

/// List .md files in skills directory
fn list_skill_files(dir: &Path) -> Vec<String> {
    list_table_files(dir) // Same logic
}

/// Regenerate instructions.md from template or fallback
fn regenerate_instructions(
    ai_path: &Path,
    templates_base: &Path,
    domain: &str,
    tables: &[String],
    skills: &[String],
) -> Result<bool, String> {
    let instructions_path = ai_path.join("instructions.md");
    let instructions_template = templates_base.join("instructions.md");

    let table_list = tables
        .iter()
        .map(|t| format!("- `tables/{}`", t))
        .collect::<Vec<_>>()
        .join("\n");
    let skill_list = skills
        .iter()
        .map(|s| format!("- `skills/{}`", s))
        .collect::<Vec<_>>()
        .join("\n");

    if instructions_template.exists() {
        let template = fs::read_to_string(&instructions_template)
            .map_err(|e| format!("Failed to read instructions template: {}", e))?;
        let content = template
            .replace("{{DOMAIN}}", domain)
            .replace("{{TABLE_LIST}}", &table_list)
            .replace("{{SKILL_LIST}}", &skill_list);
        fs::write(&instructions_path, &content)
            .map_err(|e| format!("Failed to write instructions.md: {}", e))?;
        Ok(true)
    } else {
        let content = format!(
            "# {} AI Package\n\n\
             This folder contains AI skill documentation for the {} domain.\n\n\
             ## Tables\n\n{}\n\n\
             ## Skills\n\n{}\n",
            domain, domain, table_list, skill_list
        );
        fs::write(&instructions_path, &content)
            .map_err(|e| format!("Failed to write instructions.md: {}", e))?;
        Ok(true)
    }
}

/// Build a lookup of slug → (table_id, display_name, ai_skills) from entity schemas.
fn build_entity_lookup(entities_path: &Path) -> std::collections::HashMap<String, (String, String, Vec<String>)> {
    let mut map = std::collections::HashMap::new();
    if !entities_path.exists() { return map; }

    let entity_dirs = match fs::read_dir(entities_path) {
        Ok(d) => d,
        Err(_) => return map,
    };

    for entity_entry in entity_dirs.flatten() {
        if !entity_entry.path().is_dir() { continue; }
        let name = entity_entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name.starts_with('_') { continue; }

        let model_entries = match fs::read_dir(entity_entry.path()) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for model_entry in model_entries.flatten() {
            if !model_entry.path().is_dir() { continue; }

            let schema = match read_schema_json_pub(&model_entry.path()) {
                Some(s) => s,
                None => continue,
            };

            if schema.ai_package != Some(true) { continue; }

            let slug = format!("{}.md", slugify(&schema.display_name));
            let skills = schema.ai_skills.unwrap_or_default();
            map.insert(slug, (schema.table_name.clone(), schema.display_name.clone(), skills));
        }
    }

    map
}

/// List AI package status for all configured domains.
/// Includes configured_skills from each domain's ai_config.json.
/// entities_path is used to resolve table_id and display_name from schema.json.
#[command]
pub fn val_list_domain_ai_status(
    entities_path: Option<String>,
) -> Result<Vec<DomainAiStatus>, String> {
    let config = load_config_internal()?;

    // Build entity lookup once (shared across all domains)
    let entity_lookup = match &entities_path {
        Some(p) => build_entity_lookup(Path::new(p)),
        None => std::collections::HashMap::new(),
    };

    let mut statuses: Vec<DomainAiStatus> = Vec::new();

    for dc in &config.domains {
        let global_path = Path::new(&dc.global_path);
        let ai_path = global_path.join("ai");
        let has_ai_folder = ai_path.exists();

        let mut table_files: Vec<AiTableInfo> = Vec::new();
        let mut skill_files: Vec<String> = Vec::new();
        let has_instructions = ai_path.join("instructions.md").exists();
        let ai_config = read_ai_config(&ai_path);

        if has_ai_folder {
            // Scan tables/
            let tables_dir = ai_path.join("tables");
            if tables_dir.exists() {
                if let Ok(entries) = fs::read_dir(&tables_dir) {
                    for entry in entries.flatten() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if !name.ends_with(".md") { continue; }

                        // Look up rich info from entity schemas
                        let (table_id, display_name, ai_skills) = match entity_lookup.get(&name) {
                            Some((tid, dn, skills)) => (tid.clone(), dn.clone(), skills.clone()),
                            None => {
                                // Fallback: derive from filename
                                let fallback_name = name.trim_end_matches(".md").to_string();
                                (fallback_name.clone(), fallback_name, Vec::new())
                            }
                        };

                        table_files.push(AiTableInfo {
                            file_name: name,
                            table_id,
                            display_name,
                            ai_skills,
                        });
                    }
                }
            }
            table_files.sort_by(|a, b| a.display_name.cmp(&b.display_name));

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
            table_count: table_files.len(),
            skill_count: skill_files.len(),
            has_instructions,
            table_files,
            skill_files,
            configured_skills: ai_config.skills,
            disabled_tables: ai_config.disabled_tables,
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
