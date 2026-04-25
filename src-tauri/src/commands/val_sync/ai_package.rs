// AI Package Generator — assembles domain AI skill packages.
// Copies skill templates into a domain's ai/ folder and generates instructions.md
// for use by Claude Code.
// Skills are assigned per-domain via ai_config.json.

use super::config::load_config_internal;
use crate::commands::error::{CmdResult, CommandError};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use tauri::command;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillDomainDeployment {
    pub domain: String,
    pub domain_type: String,
    pub configured: bool,
    pub generated: bool,
    pub on_s3: bool,
    /// "in_sync", "drifted", "missing", "not_configured"
    pub drift_status: String,
    pub local_file_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillDeploymentResult {
    pub skill: String,
    pub master_file_count: usize,
    pub domains: Vec<SkillDomainDeployment>,
}

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

/// Read the description field from _skills/registry.json for a given skill slug
fn read_skill_description(skills_path: &Path, slug: &str) -> Option<String> {
    let registry_path = skills_path.join("registry.json");
    let raw = fs::read_to_string(&registry_path).ok()?;
    let parsed: serde_json::Value = serde_json::from_str(&raw).ok()?;
    parsed.get("skills")?
        .get(slug)?
        .get("description")?
        .as_str()
        .map(|s| s.to_string())
}

/// Files/dirs to skip when copying skill contents into a domain package
const SKIP_FILES: &[&str] = &["SKILL.md", "README.md", "AUDIT.md", "evals.json", "guide.html", ".DS_Store", ".claude.local.md"];
const SKIP_DIRS: &[&str] = &["__pycache__", ".claude", "demo", "examples", "evals", "_catalog", "_archive", "prompts"];

/// Strip full frontmatter from a SKILL.md and replace with only name + description.
/// This keeps the distributed copy lean for AI consumption.
fn strip_skill_frontmatter(content: &str) -> String {
    // Check if content starts with frontmatter
    if !content.starts_with("---") {
        return content.to_string();
    }

    // Find the closing ---
    let rest = &content[3..];
    let end = match rest.find("\n---") {
        Some(pos) => pos,
        None => return content.to_string(), // malformed, return as-is
    };

    let frontmatter_block = &rest[..end];
    let body = &rest[end + 4..]; // skip past \n---

    // Extract name and description from the frontmatter
    let mut name = String::new();
    let mut description = String::new();

    for line in frontmatter_block.lines() {
        let trimmed = line.trim();
        if let Some(val) = trimmed.strip_prefix("name:") {
            name = val.trim().trim_matches('"').to_string();
        } else if let Some(val) = trimmed.strip_prefix("description:") {
            description = val.trim().trim_matches('"').to_string();
        }
    }

    // Rebuild with minimal frontmatter
    let mut result = String::from("---\n");
    if !name.is_empty() {
        result.push_str(&format!("name: \"{}\"\n", name));
    }
    if !description.is_empty() {
        result.push_str(&format!("description: \"{}\"\n", description));
    }
    result.push_str("---");
    result.push_str(body);
    result
}

/// Recursively copy all files from a skill source dir to the domain's ai/skills/{slug}/ dir.
/// Text files (.md, .py, .sql, .txt, .json, .csv, .html) get {{DOMAIN}} replacement.
/// Binary files (.xlsx, .pdf, .png, etc.) are copied as-is.
fn copy_skill_dir_recursive(
    src_dir: &Path,
    dest_dir: &Path,
    domain: &str,
    skill: &str,
    errors: &mut Vec<String>,
) {
    let entries = match fs::read_dir(src_dir) {
        Ok(e) => e,
        Err(e) => {
            errors.push(format!("Failed to read skill dir {}: {}", skill, e));
            return;
        }
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let fname = path.file_name().unwrap_or_default().to_string_lossy().to_string();

        if path.is_dir() {
            if SKIP_DIRS.contains(&fname.as_str()) { continue; }
            let sub_dest = dest_dir.join(&fname);
            if let Err(e) = fs::create_dir_all(&sub_dest) {
                errors.push(format!("Failed to create {}/{}/: {}", skill, fname, e));
                continue;
            }
            copy_skill_dir_recursive(&path, &sub_dest, domain, skill, errors);
        } else {
            if SKIP_FILES.contains(&fname.as_str()) { continue; }
            if fname.ends_with(".excalidraw") { continue; }
            let dest_file = dest_dir.join(&fname);

            // Text files: do {{DOMAIN}} replacement. Binary files: raw copy.
            let is_text = matches!(
                path.extension().and_then(|e| e.to_str()),
                Some("md" | "py" | "sql" | "txt" | "json" | "csv" | "html" | "css" | "js" | "ts" | "yaml" | "yml" | "toml" | "sh")
            );

            if is_text {
                match fs::read_to_string(&path) {
                    Ok(content) => {
                        let replaced = content.replace("{{DOMAIN}}", domain);
                        if let Err(e) = fs::write(&dest_file, &replaced) {
                            errors.push(format!("Failed to write {}/{}: {}", skill, fname, e));
                        }
                    }
                    Err(e) => errors.push(format!("Failed to read {}/{}: {}", skill, fname, e)),
                }
            } else {
                if let Err(e) = fs::copy(&path, &dest_file) {
                    errors.push(format!("Failed to copy {}/{}: {}", skill, fname, e));
                }
            }
        }
    }
}

/// Extract table IDs and display names from skill reference files.
/// Scans .md and .sql files for `custom_tbl_*` and `perspective_tbl_*` patterns.
/// Tries to pull display names from markdown table rows like `| Name | \`table_id\` |`.
fn extract_tables_from_skills(
    skills_path: &Path,
    skills: &[String],
) -> Vec<(String, String)> {
    let table_id_re = Regex::new(r"(?:custom_tbl_\d+_\d+|perspective_tbl_\d+)").unwrap();
    // Match markdown table rows: | Display Name | `table_id` | ...
    let table_row_re = Regex::new(
        r"\|\s*([^|]+?)\s*\|\s*`((?:custom_tbl_\d+_\d+|perspective_tbl_\d+))`\s*\|"
    ).unwrap();

    // table_id -> display_name (BTreeMap for sorted output)
    let mut tables: BTreeMap<String, String> = BTreeMap::new();

    for skill in skills {
        let skill_dir = skills_path.join(skill);
        if !skill_dir.exists() { continue; }
        collect_tables_recursive(&skill_dir, &table_id_re, &table_row_re, &mut tables);
    }

    tables.into_iter().collect()
}

/// Recursively scan a directory for table IDs in .md and .sql files.
fn collect_tables_recursive(
    dir: &Path,
    table_id_re: &Regex,
    table_row_re: &Regex,
    tables: &mut BTreeMap<String, String>,
) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_tables_recursive(&path, table_id_re, table_row_re, tables);
            continue;
        }

        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if ext != "md" && ext != "sql" {
            continue;
        }

        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        // First pass: extract table IDs with display names from markdown table rows
        for cap in table_row_re.captures_iter(&content) {
            let display_name = cap[1].trim().to_string();
            let table_id = cap[2].to_string();
            // Only set if we don't already have a display name, or if current is just the ID
            if !tables.contains_key(&table_id) || tables[&table_id] == table_id {
                tables.insert(table_id, display_name);
            }
        }

        // Second pass: catch any table IDs not in markdown table rows (e.g. in SQL or prose)
        for mat in table_id_re.find_iter(&content) {
            let table_id = mat.as_str().to_string();
            tables.entry(table_id.clone()).or_insert(table_id);
        }
    }
}

/// Regenerate instructions.md from template or fallback.
/// Reads registry.json for each skill to include descriptions in the instructions.
/// If a sibling `custom.md` exists and is non-empty, its contents are appended
/// under a "## Custom Instructions" section. `custom.md` is never modified.
fn regenerate_instructions(
    ai_path: &Path,
    templates_base: &Path,
    skills_path: &Path,
    domain: &str,
    skills: &[String],
) -> CmdResult<bool> {
    let instructions_path = ai_path.join("instructions.md");
    let instructions_template = templates_base.join("instructions.md");

    // Build skill list with descriptions from registry.json
    let skill_list = skills
        .iter()
        .map(|s| {
            let desc = read_skill_description(skills_path, s);
            match desc {
                Some(d) => format!("- `skills/{}/SKILL.md` — {}", s, d),
                None => format!("- `skills/{}/SKILL.md`", s),
            }
        })
        .collect::<Vec<_>>()
        .join("\n");

    let mut content = if instructions_template.exists() {
        let template = fs::read_to_string(&instructions_template)?;
        template
            .replace("{{DOMAIN}}", domain)
            .replace("{{SKILL_LIST}}", &skill_list)
    } else {
        format!(
            "# {} AI Package\n\n\
             This folder contains AI skill documentation for the {} domain.\n\n\
             ## Skills\n\n{}\n",
            domain, domain, skill_list
        )
    };

    // Append custom.md if author has provided one.
    let custom_path = ai_path.join("custom.md");
    if let Ok(custom_raw) = fs::read_to_string(&custom_path) {
        let custom = custom_raw.trim();
        if !custom.is_empty() {
            if !content.ends_with('\n') {
                content.push('\n');
            }
            content.push_str("\n---\n\n## Custom Instructions\n\n");
            content.push_str(custom);
            content.push('\n');
        }
    }

    fs::write(&instructions_path, &content)?;
    Ok(true)
}

// ============================================================================
// Commands
// ============================================================================

/// Generate an AI package for a specific domain.
/// Copies skill files from _skills/ and generates instructions.md.
#[command]
pub fn val_generate_ai_package(
    domain: String,
    skills_path: String,
    templates_path: String,
    skills: Vec<String>,
) -> CmdResult<AiPackageResult> {
    let skills_base = Path::new(&skills_path);
    if !skills_base.exists() {
        return Err(CommandError::NotFound(format!("Skills path does not exist: {}", skills_path)));
    }

    // Find the domain's global_path from config
    let config = load_config_internal()?;
    let domain_config = config
        .domains
        .iter()
        .find(|d| d.domain == domain)
        .ok_or_else(|| CommandError::NotFound(format!("Domain '{}' not found in config", domain)))?;

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

    // Copy skill files from _skills/{slug}/
    let templates_base = Path::new(&templates_path);

    for skill in &skills {
        let skill_src_dir = skills_base.join(skill);
        let skill_src_md = skill_src_dir.join("SKILL.md");
        if !skill_src_md.exists() {
            errors.push(format!("Skill not found: {}/SKILL.md", skill));
            continue;
        }

        let skill_dir = ai_skills_path.join(skill);
        if let Err(e) = fs::create_dir_all(&skill_dir) {
            errors.push(format!("Failed to create ai/skills/{}/: {}", skill, e));
            continue;
        }

        let dest = skill_dir.join("SKILL.md");

        match fs::read_to_string(&skill_src_md) {
            Ok(content) => {
                let stripped = strip_skill_frontmatter(&content);
                let replaced = stripped.replace("{{DOMAIN}}", &domain);
                match fs::write(&dest, &replaced) {
                    Ok(_) => skills_copied.push(skill.clone()),
                    Err(e) => errors.push(format!("Failed to write skill {}: {}", skill, e)),
                }
            }
            Err(e) => errors.push(format!("Failed to read skill {}: {}", skill, e)),
        }

        // Copy all additional files recursively (references/, assets/, scripts/, etc.)
        copy_skill_dir_recursive(&skill_src_dir, &skill_dir, &domain, skill, &mut errors);
    }

    // Ensure ai/ dir exists (ai_config.json is managed separately by val_save_domain_ai_config)
    if let Err(e) = fs::create_dir_all(&ai_path) {
        errors.push(format!("Failed to create ai/ dir: {}", e));
    }

    // Always (re)generate instructions.md so skill lists stay current
    let instructions_generated = match regenerate_instructions(
        &ai_path, &templates_base, &skills_base, &domain, &skills_copied,
    ) {
        Ok(v) => v,
        Err(e) => {
            errors.push(e.to_string());
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
) -> CmdResult<()> {
    let config = load_config_internal()?;
    let domain_config = config
        .domains
        .iter()
        .find(|d| d.domain == domain)
        .ok_or_else(|| CommandError::NotFound(format!("Domain '{}' not found in config", domain)))?;

    let global_path = Path::new(&domain_config.global_path);
    let ai_path = global_path.join("ai");

    fs::create_dir_all(&ai_path)?;

    let ai_config = DomainAiConfig { skills };
    let config_json = serde_json::to_string_pretty(&ai_config)?;

    let config_path = ai_path.join("ai_config.json");
    fs::write(&config_path, &config_json)?;

    Ok(())
}

/// List AI package status for all configured domains.
/// Includes configured_skills from each domain's ai_config.json.
#[command]
pub fn val_list_domain_ai_status(
    _entities_path: Option<String>,
) -> CmdResult<Vec<DomainAiStatus>> {
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

// ============================================================================
// AI Table Coverage — which domain tables are/aren't used by AI skills
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableEntry {
    pub table_id: String,
    pub display_name: String,
    pub space: String,
    pub zone: String,
    /// How this table was discovered: "skill" (direct reference in skill files),
    /// "workflow" (used by a workflow that feeds a skill table)
    #[serde(default)]
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiTableCoverageResult {
    pub ai_tables: Vec<TableEntry>,
    pub unused_tables: Vec<TableEntry>,
}

/// Recursively flatten all tables from all_tables.json tree structure.
fn flatten_domain_tables(nodes: &[serde_json::Value]) -> Vec<TableEntry> {
    let mut tables = Vec::new();
    for node in nodes {
        let node_type = node.get("type").and_then(|t| t.as_str()).unwrap_or("");
        if node_type == "repoTable" {
            let table_id = node.get("table_name").and_then(|t| t.as_str()).unwrap_or("").to_string();
            let display_name = node.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string();
            let space = node.get("spaceName").and_then(|s| s.as_str()).unwrap_or("").to_string();
            let zone = node.get("zoneName").and_then(|z| z.as_str()).unwrap_or("").to_string();
            if !table_id.is_empty() {
                tables.push(TableEntry { table_id, display_name, space, zone, source: String::new() });
            }
        }
        // Recurse into children
        if let Some(children) = node.get("children").and_then(|c| c.as_array()) {
            tables.extend(flatten_domain_tables(children));
        }
        // Also recurse into repo_phase_data (phases contain repos which contain tables)
        if let Some(rpd) = node.get("repo_phase_data").and_then(|r| r.as_array()) {
            tables.extend(flatten_domain_tables(rpd));
        }
    }
    tables
}

/// Get AI table coverage for a domain — tables used by AI skills vs all domain tables.
#[command]
pub fn val_ai_table_coverage(
    domain: String,
    skills_path: String,
) -> CmdResult<AiTableCoverageResult> {
    let skills_base = Path::new(&skills_path);
    let config = load_config_internal()?;
    let domain_config = config
        .domains
        .iter()
        .find(|d| d.domain == domain)
        .ok_or_else(|| CommandError::NotFound(format!("Domain '{}' not found", domain)))?;

    let global_path = Path::new(&domain_config.global_path);

    // Read ai_config to get assigned skills
    let ai_path = global_path.join("ai");
    let ai_config = read_ai_config(&ai_path);

    // Extract tables referenced by AI skills
    let ai_table_map = extract_tables_from_skills(skills_base, &ai_config.skills);
    let ai_table_ids: std::collections::HashSet<String> = ai_table_map.iter().map(|(id, _)| id.clone()).collect();

    // Read all_tables.json for the domain
    let schema_path = global_path.join("schema").join("all_tables.json");
    let all_domain_tables = if schema_path.exists() {
        let raw = fs::read_to_string(&schema_path)?;
        let parsed: Vec<serde_json::Value> = serde_json::from_str(&raw)?;
        let mut flat = flatten_domain_tables(&parsed);
        // Deduplicate by table_id
        let mut seen = std::collections::HashSet::new();
        flat.retain(|t| seen.insert(t.table_id.clone()));
        flat.sort_by(|a, b| a.table_id.cmp(&b.table_id));
        flat
    } else {
        Vec::new()
    };

    // Build the domain table lookup for enriching AI tables with space/zone
    let domain_lookup: std::collections::HashMap<String, &TableEntry> = all_domain_tables
        .iter()
        .map(|t| (t.table_id.clone(), t))
        .collect();

    // AI tables — always prefer domain display name over skill file name
    let ai_tables: Vec<TableEntry> = ai_table_map
        .iter()
        .map(|(table_id, display_name)| {
            let (dn, space, zone) = if let Some(dt) = domain_lookup.get(table_id) {
                (
                    if !dt.display_name.is_empty() { dt.display_name.clone() } else { display_name.clone() },
                    dt.space.clone(),
                    dt.zone.clone(),
                )
            } else {
                (display_name.clone(), String::new(), String::new())
            };
            TableEntry {
                table_id: table_id.clone(),
                display_name: dn,
                space,
                zone,
                source: "skill".to_string(),
            }
        })
        .collect();

    // Unused tables — domain tables not in AI skills
    let unused_tables: Vec<TableEntry> = all_domain_tables
        .into_iter()
        .filter(|t| !ai_table_ids.contains(&t.table_id))
        .map(|t| TableEntry { source: String::new(), ..t })
        .collect();

    Ok(AiTableCoverageResult { ai_tables, unused_tables })
}

// ============================================================================
// Skill Deployment Status — cross-domain view of a single skill
// ============================================================================

/// Count deployable files in a skill directory (excluding metadata/junk)
fn count_skill_files(dir: &Path) -> usize {
    if !dir.exists() {
        return 0;
    }
    let mut count = 0;
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if SKIP_FILES.contains(&name.as_str())
                || SKIP_DIRS.contains(&name.as_str())
                || name.starts_with('.')
            {
                continue;
            }
            if entry.path().is_dir() {
                count += count_skill_files(&entry.path());
            } else {
                count += 1;
            }
        }
    }
    count
}

/// Check which domains have a given skill on S3 (single API call).
/// Returns a list of domain names that have the skill present.
async fn check_s3_skill_presence(skill: &str) -> CmdResult<Vec<String>> {
    let settings = crate::commands::settings::load_settings()?;

    let access_key = match settings.keys.get("aws_access_key_id") {
        Some(k) => k.clone(),
        None => return Ok(vec![]), // No AWS creds — skip S3 check silently
    };
    let secret_key = match settings.keys.get("aws_secret_access_key") {
        Some(k) => k.clone(),
        None => return Ok(vec![]),
    };

    // List all objects under solutions/ prefix
    let output = tokio::process::Command::new("aws")
        .args([
            "s3api",
            "list-objects-v2",
            "--bucket",
            "production.thinkval.static",
            "--prefix",
            "solutions/",
            "--region",
            "ap-southeast-1",
            "--output",
            "json",
        ])
        .env("AWS_ACCESS_KEY_ID", &access_key)
        .env("AWS_SECRET_ACCESS_KEY", &secret_key)
        .output()
        .await
        .map_err(|e| CommandError::Internal(format!("Failed to run aws CLI: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(CommandError::Internal(format!("aws s3api failed: {}", stderr.trim())));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    if stdout.trim().is_empty() {
        return Ok(vec![]);
    }

    let json: serde_json::Value =
        serde_json::from_str(&stdout)?;

    let contents = match json.get("Contents").and_then(|c| c.as_array()) {
        Some(arr) => arr,
        None => return Ok(vec![]),
    };

    // Find keys containing {skill}/ (skills are stored directly under domain, no skills/ prefix)
    let skill_pattern = format!("{}/", skill);
    let mut domains: std::collections::HashSet<String> = std::collections::HashSet::new();

    for obj in contents {
        let key = obj.get("Key").and_then(|k| k.as_str()).unwrap_or("");
        // Key format: solutions/{domain}/{skill}/...
        if let Some(rest) = key.strip_prefix("solutions/") {
            // rest = "{domain}/{skill}/..."
            let parts: Vec<&str> = rest.splitn(3, '/').collect();
            if parts.len() >= 2 && rest[parts[0].len() + 1..].starts_with(&skill_pattern) {
                domains.insert(parts[0].to_string());
            }
        }
    }

    Ok(domains.into_iter().collect())
}

/// Get deployment status for a specific skill across all configured domains.
/// Shows configured, generated, S3 presence, and content drift per domain.
#[command]
pub async fn val_skill_deployment_status(
    skill: String,
    skills_path: String,
) -> CmdResult<SkillDeploymentResult> {
    let config = load_config_internal()?;
    let skills_base = Path::new(&skills_path);
    let master_skill_dir = skills_base.join(&skill);

    // Read master SKILL.md (strip frontmatter to match distributed copy)
    let master_skill_md = master_skill_dir.join("SKILL.md");
    let master_raw = fs::read_to_string(&master_skill_md)?;
    let master_content = strip_skill_frontmatter(&master_raw);

    let master_file_count = count_skill_files(&master_skill_dir);

    // Check S3 for all domains at once (one API call)
    let s3_domains = check_s3_skill_presence(&skill).await.unwrap_or_default();

    let mut domains = Vec::new();

    for dc in &config.domains {
        let global_path = Path::new(&dc.global_path);
        let ai_path = global_path.join("ai");
        let domain_skill_dir = ai_path.join("skills").join(&skill);
        let domain_skill_md = domain_skill_dir.join("SKILL.md");

        let ai_config = read_ai_config(&ai_path);
        let configured = ai_config.skills.contains(&skill);
        let generated = domain_skill_md.exists();
        let on_s3 = s3_domains.contains(&dc.domain);

        let drift_status = if !configured {
            "not_configured".to_string()
        } else if !generated {
            "missing".to_string()
        } else {
            // Compare master SKILL.md (with {{DOMAIN}} replaced) vs domain copy
            let expected = master_content.replace("{{DOMAIN}}", &dc.domain);
            match fs::read_to_string(&domain_skill_md) {
                Ok(actual) => {
                    if actual.trim() == expected.trim() {
                        "in_sync".to_string()
                    } else {
                        "drifted".to_string()
                    }
                }
                Err(_) => "error".to_string(),
            }
        };

        let local_file_count = if generated {
            count_skill_files(&domain_skill_dir)
        } else {
            0
        };

        domains.push(SkillDomainDeployment {
            domain: dc.domain.clone(),
            domain_type: dc.domain_type
                .clone()
                .unwrap_or_else(|| "production".to_string()),
            configured,
            generated,
            on_s3,
            drift_status,
            local_file_count,
        });
    }

    // Sort: configured first, then alphabetical
    domains.sort_by(|a, b| {
        b.configured
            .cmp(&a.configured)
            .then(a.domain.cmp(&b.domain))
    });

    Ok(SkillDeploymentResult {
        skill,
        master_file_count,
        domains,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn unique_tmp_dir(label: &str) -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = env::temp_dir().join(format!("ai_package_test_{}_{}", label, nanos));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn regenerate_falls_back_when_no_template_or_custom() {
        let dir = unique_tmp_dir("fallback");
        let ai_path = dir.join("ai");
        let templates = dir.join("templates_missing");
        let skills = dir.join("skills_missing");
        fs::create_dir_all(&ai_path).unwrap();

        regenerate_instructions(&ai_path, &templates, &skills, "demo", &["foo".into()]).unwrap();

        let out = fs::read_to_string(ai_path.join("instructions.md")).unwrap();
        assert!(out.contains("# demo AI Package"));
        assert!(out.contains("- `skills/foo/SKILL.md`"));
        assert!(!out.contains("Custom Instructions"));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn regenerate_appends_custom_when_present() {
        let dir = unique_tmp_dir("with_custom");
        let ai_path = dir.join("ai");
        fs::create_dir_all(&ai_path).unwrap();
        fs::write(ai_path.join("custom.md"), "Call me bubble boy.\nNever apologize.").unwrap();

        regenerate_instructions(&ai_path, &dir.join("nope"), &dir.join("nope"), "demo", &[]).unwrap();

        let out = fs::read_to_string(ai_path.join("instructions.md")).unwrap();
        assert!(out.contains("# demo AI Package"));
        assert!(out.contains("---\n\n## Custom Instructions"));
        assert!(out.contains("Call me bubble boy."));
        assert!(out.contains("Never apologize."));

        // custom.md must be untouched
        let custom = fs::read_to_string(ai_path.join("custom.md")).unwrap();
        assert_eq!(custom, "Call me bubble boy.\nNever apologize.");
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn regenerate_skips_empty_or_whitespace_custom() {
        let dir = unique_tmp_dir("empty_custom");
        let ai_path = dir.join("ai");
        fs::create_dir_all(&ai_path).unwrap();
        fs::write(ai_path.join("custom.md"), "   \n\n  ").unwrap();

        regenerate_instructions(&ai_path, &dir.join("nope"), &dir.join("nope"), "demo", &[]).unwrap();

        let out = fs::read_to_string(ai_path.join("instructions.md")).unwrap();
        assert!(!out.contains("Custom Instructions"));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn regenerate_uses_template_and_appends_custom() {
        let dir = unique_tmp_dir("template_plus_custom");
        let ai_path = dir.join("ai");
        let templates = dir.join("templates");
        fs::create_dir_all(&ai_path).unwrap();
        fs::create_dir_all(&templates).unwrap();
        fs::write(
            templates.join("instructions.md"),
            "# {{DOMAIN}}\n\nSkills:\n{{SKILL_LIST}}\n",
        )
        .unwrap();
        fs::write(ai_path.join("custom.md"), "Custom block").unwrap();

        regenerate_instructions(&ai_path, &templates, &dir.join("nope"), "demo", &["a".into()])
            .unwrap();

        let out = fs::read_to_string(ai_path.join("instructions.md")).unwrap();
        assert!(out.starts_with("# demo\n"));
        assert!(out.contains("- `skills/a/SKILL.md`"));
        assert!(out.contains("\n---\n\n## Custom Instructions\n\nCustom block\n"));
        fs::remove_dir_all(&dir).ok();
    }
}
