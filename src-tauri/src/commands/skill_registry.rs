// src-tauri/src/commands/skill_registry.rs
// Skill registry commands: init migration, distribute, check drift, pull

use crate::AppState;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{command, State};

// ─── Types ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SkillCategory {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SkillDistribution {
    pub path: String,
    #[serde(rename = "type")]
    pub dist_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SkillEntry {
    pub name: String,
    pub description: String,
    pub category: String,
    pub target: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verified: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rating: Option<u8>,
    pub distributions: Vec<SkillDistribution>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SkillRegistry {
    pub version: u32,
    pub updated: String,
    pub categories: Vec<SkillCategory>,
    pub skills: BTreeMap<String, SkillEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SkillSourceMarker {
    pub source: String,
    pub distributed_at: String,
    pub content_hash: String,
}

#[derive(Debug, Serialize)]
pub struct SkillDriftStatus {
    pub slug: String,
    pub distribution_path: String,
    pub status: String, // "in_sync", "source_updated", "target_modified", "not_distributed", "missing"
    pub source_hash: String,
    pub target_hash: String,
    pub stored_hash: String,
    pub source_modified: String, // ISO 8601
    pub target_modified: String, // ISO 8601
}

#[derive(Debug, Serialize)]
pub struct SkillInitResult {
    pub skills_created: u32,
    pub bot_skills: u32,
    pub platform_skills: u32,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct BotInfo {
    pub name: String,
    pub label: String,
    pub skills_path: String,
    pub has_skills_dir: bool,
}

#[derive(Debug, Serialize)]
pub struct SkillModInfo {
    pub slug: String,
    pub last_modified: String, // ISO 8601
    pub file_count: u32,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/// Compute SHA-256 hash of all files in a skill folder (excluding .skill-source.json, .DS_Store)
fn hash_skill_folder(folder: &Path) -> Result<String, String> {
    let mut entries: Vec<PathBuf> = Vec::new();
    collect_files(folder, &mut entries)?;
    entries.sort();

    let mut hasher = Sha256::new();
    for entry in &entries {
        let rel = entry.strip_prefix(folder).unwrap_or(entry);
        let name = rel.to_string_lossy();
        // Skip marker and OS files
        if name == ".skill-source.json" || name.contains(".DS_Store") || name.starts_with('.') {
            continue;
        }
        let content = fs::read(entry)
            .map_err(|e| format!("Failed to read {}: {}", entry.display(), e))?;
        hasher.update(name.as_bytes());
        hasher.update(&content);
    }

    let result = hasher.finalize();
    Ok(format!("sha256:{:x}", result))
}

fn collect_files(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
    if !dir.is_dir() {
        return Ok(());
    }
    let entries = fs::read_dir(dir)
        .map_err(|e| format!("Failed to read dir {}: {}", dir.display(), e))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.starts_with('.') {
                collect_files(&path, out)?;
            }
        } else {
            out.push(path);
        }
    }
    Ok(())
}

/// Get the most recent file modification time in a folder as ISO 8601 string
fn get_folder_latest_modified(path: &Path) -> String {
    let mut files: Vec<PathBuf> = Vec::new();
    if collect_files(path, &mut files).is_err() {
        return String::new();
    }
    let mut latest: Option<std::time::SystemTime> = None;
    for file in &files {
        let name = file.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        if name == ".skill-source.json" || name.contains(".DS_Store") || name.starts_with('.') {
            continue;
        }
        if let Ok(meta) = fs::metadata(file) {
            if let Ok(modified) = meta.modified() {
                latest = Some(match latest {
                    Some(prev) if modified > prev => modified,
                    Some(prev) => prev,
                    None => modified,
                });
            }
        }
    }
    latest
        .map(|t| {
            chrono::DateTime::<chrono::Utc>::from(t)
                .format("%Y-%m-%dT%H:%M:%SZ")
                .to_string()
        })
        .unwrap_or_default()
}

/// Copy a folder recursively, excluding .skill-source.json and .DS_Store
fn copy_skill_folder(src: &Path, dst: &Path) -> Result<(), String> {
    if dst.exists() {
        // Remove existing contents (except .skill-source.json which we'll write later)
        let old_marker = dst.join(".skill-source.json");
        let marker_content = if old_marker.exists() {
            fs::read_to_string(&old_marker).ok()
        } else {
            None
        };
        fs::remove_dir_all(dst).map_err(|e| format!("Failed to clear {}: {}", dst.display(), e))?;
        fs::create_dir_all(dst).map_err(|e| format!("Failed to create {}: {}", dst.display(), e))?;
        // Restore marker temporarily (will be overwritten by caller)
        if let Some(content) = marker_content {
            let _ = fs::write(&old_marker, content);
        }
    } else {
        fs::create_dir_all(dst).map_err(|e| format!("Failed to create {}: {}", dst.display(), e))?;
    }

    copy_dir_contents(src, dst)
}

fn copy_dir_contents(src: &Path, dst: &Path) -> Result<(), String> {
    let entries = fs::read_dir(src)
        .map_err(|e| format!("Failed to read {}: {}", src.display(), e))?;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name == ".skill-source.json" || name == ".DS_Store" || name.starts_with('.') {
            continue;
        }
        let src_path = entry.path();
        let dst_path = dst.join(&name);
        if src_path.is_dir() {
            fs::create_dir_all(&dst_path)
                .map_err(|e| format!("Failed to create dir {}: {}", dst_path.display(), e))?;
            copy_dir_contents(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)
                .map_err(|e| format!("Failed to copy {}: {}", src_path.display(), e))?;
        }
    }
    Ok(())
}

/// Parse YAML frontmatter value from SKILL.md content
fn parse_frontmatter_field(content: &str, key: &str) -> Option<String> {
    let fm = content.strip_prefix("---\n")?;
    let end = fm.find("\n---")?;
    let block = &fm[..end];
    for line in block.lines() {
        if let Some(rest) = line.strip_prefix(key) {
            let rest = rest.trim_start();
            if let Some(val) = rest.strip_prefix(':') {
                let val = val.trim().trim_matches('"').trim_matches('\'');
                if !val.is_empty() {
                    return Some(val.to_string());
                }
            }
        }
    }
    None
}

/// Get current SGT timestamp
fn now_sgt() -> String {
    chrono::Utc::now()
        .with_timezone(&chrono::FixedOffset::east_opt(8 * 3600).unwrap())
        .format("%Y-%m-%dT%H:%M:%S+08:00")
        .to_string()
}

/// Extract domain from a platform skill slug (e.g., "analytics-grain-l1-sales-kpi" → "grain")
fn extract_domain(slug: &str) -> Option<String> {
    // Pattern: {type}-{domain}-{rest}
    let parts: Vec<&str> = slug.splitn(3, '-').collect();
    if parts.len() >= 2 {
        Some(parts[1].to_string())
    } else {
        None
    }
}

/// Determine category from platform skill slug prefix
fn platform_skill_category(slug: &str) -> String {
    if slug.starts_with("analytics-") {
        "analytics".to_string()
    } else if slug.starts_with("insights-") {
        "insights".to_string()
    } else if slug.starts_with("recon-") {
        "recon".to_string()
    } else {
        "platform".to_string()
    }
}

// ─── Commands ────────────────────────────────────────────────────────────────

/// One-time migration: copy existing skills into _skills/ and generate registry.json
#[command]
pub async fn skill_init(state: State<'_, AppState>) -> Result<SkillInitResult, String> {
    let kb = &state.knowledge_path;
    let skills_dir = PathBuf::from(kb).join("_skills");
    fs::create_dir_all(&skills_dir)
        .map_err(|e| format!("Failed to create _skills/: {}", e))?;

    let mut registry = SkillRegistry {
        version: 1,
        updated: now_sgt(),
        categories: vec![
            SkillCategory { id: "val".into(), label: "VAL".into() },
            SkillCategory { id: "sales".into(), label: "Sales".into() },
            SkillCategory { id: "dev".into(), label: "Dev".into() },
            SkillCategory { id: "ops".into(), label: "Ops".into() },
            SkillCategory { id: "utility".into(), label: "Utility".into() },
            SkillCategory { id: "modules".into(), label: "Modules".into() },
            SkillCategory { id: "external".into(), label: "External".into() },
            SkillCategory { id: "personal".into(), label: "Personal".into() },
            SkillCategory { id: "analytics".into(), label: "Analytics".into() },
            SkillCategory { id: "insights".into(), label: "Insights".into() },
            SkillCategory { id: "recon".into(), label: "Recon".into() },
        ],
        skills: BTreeMap::new(),
    };

    let mut result = SkillInitResult {
        skills_created: 0,
        bot_skills: 0,
        platform_skills: 0,
        errors: Vec::new(),
    };

    // ── Read bot skill categories ──
    let bot_skills_dir = PathBuf::from(kb).join("_team/melvin/bot-mel/skills");
    let mut bot_categories: BTreeMap<String, String> = BTreeMap::new();
    let categories_path = bot_skills_dir.join("_categories.json");
    if categories_path.exists() {
        if let Ok(content) = fs::read_to_string(&categories_path) {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(skills) = parsed.get("skills").and_then(|s| s.as_object()) {
                    for (slug, cat) in skills {
                        if let Some(cat_str) = cat.as_str() {
                            bot_categories.insert(slug.clone(), cat_str.to_string());
                        }
                    }
                }
            }
        }
    }

    // ── Migrate bot skills ──
    if bot_skills_dir.exists() {
        if let Ok(entries) = fs::read_dir(&bot_skills_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if !entry.path().is_dir() || name.starts_with('_') || name.starts_with('.') {
                    continue;
                }

                let slug = name.clone();
                let src = entry.path();
                let dst = skills_dir.join(&slug);

                // Copy skill folder
                if let Err(e) = copy_skill_folder(&src, &dst) {
                    result.errors.push(format!("Bot skill {}: {}", slug, e));
                    continue;
                }

                // Parse SKILL.md for metadata
                let skill_md_path = dst.join("SKILL.md");
                let (skill_name, description, status, cmd) = if skill_md_path.exists() {
                    let content = fs::read_to_string(&skill_md_path).unwrap_or_default();
                    let name = parse_frontmatter_field(&content, "title")
                        .or_else(|| parse_frontmatter_field(&content, "name"))
                        .unwrap_or_else(|| slug.clone());
                    let desc = parse_frontmatter_field(&content, "description")
                        .or_else(|| parse_frontmatter_field(&content, "summary"))
                        .unwrap_or_default();
                    let status = parse_frontmatter_field(&content, "status")
                        .unwrap_or_else(|| "active".to_string());
                    let cmd = parse_frontmatter_field(&content, "command");
                    (name, desc, status, cmd)
                } else {
                    (slug.clone(), String::new(), "active".to_string(), None)
                };

                let category = bot_categories.get(&slug)
                    .cloned()
                    .unwrap_or_else(|| "val".to_string());

                registry.skills.insert(slug.clone(), SkillEntry {
                    name: skill_name,
                    description,
                    category,
                    target: "bot".to_string(),
                    status,
                    command: cmd,
                    domain: None,
                    verified: None,
                    rating: None,
                    distributions: vec![SkillDistribution {
                        path: format!("_team/melvin/bot-mel/skills/{}", slug),
                        dist_type: "bot".to_string(),
                    }],
                });

                result.bot_skills += 1;
                result.skills_created += 1;
            }
        }
    }

    // ── Migrate platform skills ──
    let platform_skills_dir = PathBuf::from(kb).join("0_Platform/skills");
    if platform_skills_dir.exists() {
        if let Ok(entries) = fs::read_dir(&platform_skills_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if !entry.path().is_dir() || name.starts_with('_') || name.starts_with('.') {
                    continue;
                }

                let slug = name.clone();
                let src = entry.path();
                let dst = skills_dir.join(&slug);

                // Copy skill folder
                if let Err(e) = copy_skill_folder(&src, &dst) {
                    result.errors.push(format!("Platform skill {}: {}", slug, e));
                    continue;
                }

                // Read metadata from skill.json
                let skill_json_path = dst.join("skill.json");
                let (skill_name, description) = if skill_json_path.exists() {
                    let content = fs::read_to_string(&skill_json_path).unwrap_or_default();
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&content) {
                        let name = parsed.get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or(&slug)
                            .to_string();
                        let desc = parsed.get("description")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        (name, desc)
                    } else {
                        (slug.clone(), String::new())
                    }
                } else {
                    (slug.clone(), String::new())
                };

                let category = platform_skill_category(&slug);
                let domain = extract_domain(&slug);

                registry.skills.insert(slug.clone(), SkillEntry {
                    name: skill_name,
                    description,
                    category,
                    target: "platform".to_string(),
                    status: "active".to_string(),
                    command: None,
                    domain,
                    verified: None,
                    rating: None,
                    distributions: vec![SkillDistribution {
                        path: format!("0_Platform/skills/{}", slug),
                        dist_type: "platform".to_string(),
                    }],
                });

                result.platform_skills += 1;
                result.skills_created += 1;
            }
        }
    }

    // ── Write registry.json ──
    let registry_json = serde_json::to_string_pretty(&registry)
        .map_err(|e| format!("Failed to serialize registry: {}", e))?;
    fs::write(skills_dir.join("registry.json"), registry_json)
        .map_err(|e| format!("Failed to write registry.json: {}", e))?;

    Ok(result)
}

/// Distribute a skill from _skills/{slug} to its target paths
#[command]
pub async fn skill_distribute(
    state: State<'_, AppState>,
    slug: String,
) -> Result<Vec<SkillDriftStatus>, String> {
    let kb = &state.knowledge_path;
    let skills_dir = PathBuf::from(kb).join("_skills");
    let source_dir = skills_dir.join(&slug);

    if !source_dir.exists() {
        return Err(format!("Skill '{}' not found in _skills/", slug));
    }

    // Read registry
    let registry_path = skills_dir.join("registry.json");
    let registry_content = fs::read_to_string(&registry_path)
        .map_err(|e| format!("Failed to read registry.json: {}", e))?;
    let registry: SkillRegistry = serde_json::from_str(&registry_content)
        .map_err(|e| format!("Failed to parse registry.json: {}", e))?;

    let entry = registry.skills.get(&slug)
        .ok_or_else(|| format!("Skill '{}' not found in registry", slug))?;

    let source_hash = hash_skill_folder(&source_dir)?;
    let mut results = Vec::new();

    for dist in &entry.distributions {
        let target_path = PathBuf::from(kb).join(&dist.path);

        // Copy source → target
        copy_skill_folder(&source_dir, &target_path)?;

        // Write .skill-source.json marker
        let marker = SkillSourceMarker {
            source: format!("_skills/{}", slug),
            distributed_at: now_sgt(),
            content_hash: source_hash.clone(),
        };
        let marker_json = serde_json::to_string_pretty(&marker)
            .map_err(|e| format!("Failed to serialize marker: {}", e))?;
        fs::write(target_path.join(".skill-source.json"), marker_json)
            .map_err(|e| format!("Failed to write marker: {}", e))?;

        let mod_time = get_folder_latest_modified(&source_dir);
        results.push(SkillDriftStatus {
            slug: slug.clone(),
            distribution_path: dist.path.clone(),
            status: "in_sync".to_string(),
            source_hash: source_hash.clone(),
            target_hash: source_hash.clone(),
            stored_hash: source_hash.clone(),
            source_modified: mod_time.clone(),
            target_modified: mod_time,
        });
    }

    // After distributing, regenerate _categories.json for each bot target
    for dist in &entry.distributions {
        if dist.dist_type == "bot" {
            // dist.path is like "_team/melvin/bot-mel/skills/accounting"
            // We need the parent: "_team/melvin/bot-mel/skills"
            if let Some(parent) = Path::new(&dist.path).parent() {
                let _ = regenerate_bot_categories_for(kb, &parent.to_string_lossy(), &registry);
            }
        }
    }

    Ok(results)
}

/// Check drift status for a skill
#[command]
pub async fn skill_check(
    state: State<'_, AppState>,
    slug: String,
) -> Result<Vec<SkillDriftStatus>, String> {
    let kb = &state.knowledge_path;
    let skills_dir = PathBuf::from(kb).join("_skills");
    let source_dir = skills_dir.join(&slug);

    if !source_dir.exists() {
        return Err(format!("Skill '{}' not found in _skills/", slug));
    }

    // Read registry
    let registry_path = skills_dir.join("registry.json");
    let registry_content = fs::read_to_string(&registry_path)
        .map_err(|e| format!("Failed to read registry.json: {}", e))?;
    let registry: SkillRegistry = serde_json::from_str(&registry_content)
        .map_err(|e| format!("Failed to parse registry.json: {}", e))?;

    let entry = registry.skills.get(&slug)
        .ok_or_else(|| format!("Skill '{}' not found in registry", slug))?;

    let source_hash = hash_skill_folder(&source_dir)?;
    let mut results = Vec::new();

    for dist in &entry.distributions {
        let target_path = PathBuf::from(kb).join(&dist.path);

        if !target_path.exists() {
            results.push(SkillDriftStatus {
                slug: slug.clone(),
                distribution_path: dist.path.clone(),
                status: "not_distributed".to_string(),
                source_hash: source_hash.clone(),
                target_hash: String::new(),
                stored_hash: String::new(),
                source_modified: get_folder_latest_modified(&source_dir),
                target_modified: String::new(),
            });
            continue;
        }

        let target_hash = hash_skill_folder(&target_path)?;

        // Read stored marker
        let marker_path = target_path.join(".skill-source.json");
        let stored_hash = if marker_path.exists() {
            let content = fs::read_to_string(&marker_path).unwrap_or_default();
            serde_json::from_str::<SkillSourceMarker>(&content)
                .map(|m| m.content_hash)
                .unwrap_or_default()
        } else {
            String::new()
        };

        let status = if source_hash == target_hash {
            "in_sync".to_string()
        } else if source_hash != stored_hash && target_hash == stored_hash {
            "source_updated".to_string()
        } else if source_hash == stored_hash && target_hash != stored_hash {
            "target_modified".to_string()
        } else {
            // Both changed
            "target_modified".to_string()
        };

        results.push(SkillDriftStatus {
            slug: slug.clone(),
            distribution_path: dist.path.clone(),
            status,
            source_hash: source_hash.clone(),
            target_hash,
            stored_hash,
            source_modified: get_folder_latest_modified(&source_dir),
            target_modified: get_folder_latest_modified(&target_path),
        });
    }

    Ok(results)
}

/// Pull changes from a distributed target back to _skills/{slug}
#[command]
pub async fn skill_pull(
    state: State<'_, AppState>,
    slug: String,
    target_path: String,
) -> Result<SkillDriftStatus, String> {
    let kb = &state.knowledge_path;
    let skills_dir = PathBuf::from(kb).join("_skills");
    let source_dir = skills_dir.join(&slug);
    let target_dir = PathBuf::from(kb).join(&target_path);

    if !target_dir.exists() {
        return Err(format!("Target path '{}' not found", target_path));
    }

    // Copy target → source
    copy_skill_folder(&target_dir, &source_dir)?;

    // Now redistribute to update hash
    let source_hash = hash_skill_folder(&source_dir)?;

    // Write marker at target
    let marker = SkillSourceMarker {
        source: format!("_skills/{}", slug),
        distributed_at: now_sgt(),
        content_hash: source_hash.clone(),
    };
    let marker_json = serde_json::to_string_pretty(&marker)
        .map_err(|e| format!("Failed to serialize marker: {}", e))?;
    fs::write(target_dir.join(".skill-source.json"), marker_json)
        .map_err(|e| format!("Failed to write marker: {}", e))?;

    let mod_time = get_folder_latest_modified(&source_dir);
    Ok(SkillDriftStatus {
        slug,
        distribution_path: target_path,
        status: "in_sync".to_string(),
        source_hash: source_hash.clone(),
        target_hash: source_hash.clone(),
        stored_hash: source_hash,
        source_modified: mod_time.clone(),
        target_modified: mod_time,
    })
}

/// Check drift status for ALL skills in the registry (batch).
/// Also scans all bot skills/ directories and platform skills/ for copies
/// that aren't registered as distributions yet.
#[command]
pub async fn skill_check_all(
    state: State<'_, AppState>,
) -> Result<Vec<SkillDriftStatus>, String> {
    let kb = &state.knowledge_path;
    let skills_dir = PathBuf::from(kb).join("_skills");
    let registry_path = skills_dir.join("registry.json");

    if !registry_path.exists() {
        return Ok(Vec::new());
    }

    let registry_content = fs::read_to_string(&registry_path)
        .map_err(|e| format!("Failed to read registry.json: {}", e))?;
    let registry: SkillRegistry = serde_json::from_str(&registry_content)
        .map_err(|e| format!("Failed to parse registry.json: {}", e))?;

    let mut all_results = Vec::new();

    // Build a set of all registered distribution paths for quick lookup
    let mut registered_paths: std::collections::HashSet<String> = std::collections::HashSet::new();
    for entry in registry.skills.values() {
        for dist in &entry.distributions {
            registered_paths.insert(dist.path.clone());
        }
    }

    // 1. Check all registered distributions
    for slug in registry.skills.keys() {
        let source_dir = skills_dir.join(slug);
        if !source_dir.exists() {
            continue;
        }
        let source_hash = hash_skill_folder(&source_dir).unwrap_or_default();

        if let Some(entry) = registry.skills.get(slug) {
            for dist in &entry.distributions {
                let target_path = PathBuf::from(kb).join(&dist.path);
                let result = check_distribution(slug, &dist.path, &source_hash, &source_dir, &target_path);
                all_results.push(result);
            }
        }
    }

    // 2. Scan all bots for unregistered skill copies
    let team_dir = PathBuf::from(kb).join("_team");
    if team_dir.exists() {
        if let Ok(persons) = fs::read_dir(&team_dir) {
            for person_entry in persons.flatten() {
                let person_name = person_entry.file_name().to_string_lossy().to_string();
                if !person_entry.path().is_dir()
                    || person_name.starts_with('_')
                    || person_name.starts_with('.')
                {
                    continue;
                }

                if let Ok(contents) = fs::read_dir(person_entry.path()) {
                    for bot_entry in contents.flatten() {
                        let bot_name = bot_entry.file_name().to_string_lossy().to_string();
                        if !bot_entry.path().is_dir() || !bot_name.starts_with("bot-") {
                            continue;
                        }

                        let bot_skills = bot_entry.path().join("skills");
                        if !bot_skills.exists() {
                            continue;
                        }

                        if let Ok(skill_dirs) = fs::read_dir(&bot_skills) {
                            for skill_entry in skill_dirs.flatten() {
                                let skill_name = skill_entry.file_name().to_string_lossy().to_string();
                                if !skill_entry.path().is_dir()
                                    || skill_name.starts_with('_')
                                    || skill_name.starts_with('.')
                                {
                                    continue;
                                }

                                // Only check if this skill exists in the registry
                                if !registry.skills.contains_key(&skill_name) {
                                    continue;
                                }

                                let dist_path = format!(
                                    "_team/{}/{}/skills/{}",
                                    person_name, bot_name, skill_name
                                );

                                // Skip if already registered
                                if registered_paths.contains(&dist_path) {
                                    continue;
                                }

                                let source_dir = skills_dir.join(&skill_name);
                                let source_hash = if source_dir.exists() {
                                    hash_skill_folder(&source_dir).unwrap_or_default()
                                } else {
                                    String::new()
                                };

                                let target_path = PathBuf::from(kb).join(&dist_path);
                                let result = check_distribution(&skill_name, &dist_path, &source_hash, &source_dir, &target_path);
                                all_results.push(result);
                            }
                        }
                    }
                }
            }
        }
    }

    // 3. Scan platform skills for unregistered copies
    let platform_skills_dir = PathBuf::from(kb).join("0_Platform/skills");
    if platform_skills_dir.exists() {
        if let Ok(entries) = fs::read_dir(&platform_skills_dir) {
            for entry in entries.flatten() {
                let skill_name = entry.file_name().to_string_lossy().to_string();
                if !entry.path().is_dir()
                    || skill_name.starts_with('_')
                    || skill_name.starts_with('.')
                {
                    continue;
                }

                if !registry.skills.contains_key(&skill_name) {
                    continue;
                }

                let dist_path = format!("0_Platform/skills/{}", skill_name);

                if registered_paths.contains(&dist_path) {
                    continue;
                }

                let source_dir = skills_dir.join(&skill_name);
                let source_hash = if source_dir.exists() {
                    hash_skill_folder(&source_dir).unwrap_or_default()
                } else {
                    String::new()
                };

                let target_path = PathBuf::from(kb).join(&dist_path);
                let result = check_distribution(&skill_name, &dist_path, &source_hash, &source_dir, &target_path);
                all_results.push(result);
            }
        }
    }

    Ok(all_results)
}

/// Check drift status for a single distribution path
fn check_distribution(slug: &str, dist_path: &str, source_hash: &str, source_path: &Path, target_path: &PathBuf) -> SkillDriftStatus {
    let source_modified = get_folder_latest_modified(source_path);

    if !target_path.exists() {
        return SkillDriftStatus {
            slug: slug.to_string(),
            distribution_path: dist_path.to_string(),
            status: "not_distributed".to_string(),
            source_hash: source_hash.to_string(),
            target_hash: String::new(),
            stored_hash: String::new(),
            source_modified,
            target_modified: String::new(),
        };
    }

    let target_hash = hash_skill_folder(target_path).unwrap_or_default();
    let target_modified = get_folder_latest_modified(target_path);
    let marker_path = target_path.join(".skill-source.json");
    let stored_hash = if marker_path.exists() {
        fs::read_to_string(&marker_path).ok()
            .and_then(|c| serde_json::from_str::<SkillSourceMarker>(&c).ok())
            .map(|m| m.content_hash)
            .unwrap_or_default()
    } else {
        String::new()
    };

    let status = if source_hash == &target_hash {
        "in_sync".to_string()
    } else if source_hash != &stored_hash && target_hash == stored_hash {
        "source_updated".to_string()
    } else {
        "target_modified".to_string()
    };

    SkillDriftStatus {
        slug: slug.to_string(),
        distribution_path: dist_path.to_string(),
        status,
        source_hash: source_hash.to_string(),
        target_hash,
        stored_hash,
        source_modified,
        target_modified,
    }
}

/// Regenerate _categories.json for a specific bot's skills directory.
/// Scans which skills from the registry are actually present in this bot's skills dir.
fn regenerate_bot_categories_for(kb: &str, bot_skills_dir: &str, registry: &SkillRegistry) -> Result<(), String> {
    let bot_dir = PathBuf::from(kb).join(bot_skills_dir);
    let categories_path = bot_dir.join("_categories.json");

    let categories: Vec<&SkillCategory> = registry.categories.iter().collect();

    // Only include skills that exist in this bot's skills directory
    let mut skill_map: BTreeMap<String, String> = BTreeMap::new();
    if let Ok(entries) = fs::read_dir(&bot_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !entry.path().is_dir() || name.starts_with('_') || name.starts_with('.') {
                continue;
            }
            if let Some(reg_entry) = registry.skills.get(&name) {
                skill_map.insert(name, reg_entry.category.clone());
            }
        }
    }

    let output = serde_json::json!({
        "categories": categories,
        "skills": skill_map,
    });

    let json = serde_json::to_string_pretty(&output)
        .map_err(|e| format!("Failed to serialize categories: {}", e))?;
    fs::write(&categories_path, json)
        .map_err(|e| format!("Failed to write categories: {}", e))?;

    Ok(())
}

/// Discover all bots under _team/ that have (or could have) a skills/ directory.
/// Skips _templates and _deprecated.
#[command]
pub async fn skill_list_bots(state: State<'_, AppState>) -> Result<Vec<BotInfo>, String> {
    let kb = &state.knowledge_path;
    let team_dir = PathBuf::from(kb).join("_team");

    let mut bots = Vec::new();

    if !team_dir.exists() {
        return Ok(bots);
    }

    // Scan _team/{person}/ for bot-* dirs
    let persons = fs::read_dir(&team_dir)
        .map_err(|e| format!("Failed to read _team/: {}", e))?;

    for person_entry in persons.flatten() {
        let person_name = person_entry.file_name().to_string_lossy().to_string();
        if !person_entry.path().is_dir()
            || person_name.starts_with('_')
            || person_name.starts_with('.')
        {
            continue;
        }

        let person_dir = person_entry.path();
        if let Ok(contents) = fs::read_dir(&person_dir) {
            for bot_entry in contents.flatten() {
                let bot_name = bot_entry.file_name().to_string_lossy().to_string();
                if !bot_entry.path().is_dir() || !bot_name.starts_with("bot-") {
                    continue;
                }

                let skills_dir = bot_entry.path().join("skills");
                let rel_skills = format!("_team/{}/{}/skills", person_name, bot_name);

                bots.push(BotInfo {
                    name: bot_name.clone(),
                    label: format!("{}/{}", person_name, bot_name),
                    skills_path: rel_skills,
                    has_skills_dir: skills_dir.exists(),
                });
            }
        }
    }

    bots.sort_by(|a, b| a.label.cmp(&b.label));
    Ok(bots)
}

/// Distribute a skill to a specific target path (ad-hoc push to a bot or platform).
/// This copies the skill, writes the marker, adds the distribution to registry.json,
/// and regenerates _categories.json for bot targets.
#[command]
pub async fn skill_distribute_to(
    state: State<'_, AppState>,
    slug: String,
    target_path: String,
    dist_type: String,
) -> Result<SkillDriftStatus, String> {
    let kb = &state.knowledge_path;
    let skills_dir = PathBuf::from(kb).join("_skills");
    let source_dir = skills_dir.join(&slug);

    if !source_dir.exists() {
        return Err(format!("Skill '{}' not found in _skills/", slug));
    }

    // Build full target: for bot, target_path is like "_team/melvin/bot-mel/skills"
    // and we append the slug. For platform, target_path is "0_Platform/skills".
    let full_target = format!("{}/{}", target_path, slug);
    let target_dir = PathBuf::from(kb).join(&full_target);

    // Copy source → target
    copy_skill_folder(&source_dir, &target_dir)?;

    // Write .skill-source.json marker
    let source_hash = hash_skill_folder(&source_dir)?;
    let marker = SkillSourceMarker {
        source: format!("_skills/{}", slug),
        distributed_at: now_sgt(),
        content_hash: source_hash.clone(),
    };
    let marker_json = serde_json::to_string_pretty(&marker)
        .map_err(|e| format!("Failed to serialize marker: {}", e))?;
    fs::write(target_dir.join(".skill-source.json"), marker_json)
        .map_err(|e| format!("Failed to write marker: {}", e))?;

    // Update registry.json — add this distribution if not already present
    let registry_path = skills_dir.join("registry.json");
    let registry_content = fs::read_to_string(&registry_path)
        .map_err(|e| format!("Failed to read registry.json: {}", e))?;
    let mut registry: SkillRegistry = serde_json::from_str(&registry_content)
        .map_err(|e| format!("Failed to parse registry.json: {}", e))?;

    if let Some(entry) = registry.skills.get_mut(&slug) {
        let already_exists = entry.distributions.iter().any(|d| d.path == full_target);
        if !already_exists {
            entry.distributions.push(SkillDistribution {
                path: full_target.clone(),
                dist_type: dist_type.clone(),
            });
        }
    }

    // Write updated registry
    registry.updated = now_sgt();
    let updated_json = serde_json::to_string_pretty(&registry)
        .map_err(|e| format!("Failed to serialize registry: {}", e))?;
    fs::write(&registry_path, updated_json)
        .map_err(|e| format!("Failed to write registry.json: {}", e))?;

    // Regenerate _categories.json for bot targets
    if dist_type == "bot" {
        let _ = regenerate_bot_categories_for(kb, &target_path, &registry);
    }

    let mod_time = get_folder_latest_modified(&source_dir);
    Ok(SkillDriftStatus {
        slug,
        distribution_path: full_target,
        status: "in_sync".to_string(),
        source_hash: source_hash.clone(),
        target_hash: source_hash.clone(),
        stored_hash: source_hash,
        source_modified: mod_time.clone(),
        target_modified: mod_time,
    })
}

/// Get modification info for all skills in the registry (for dashboard display).
/// Returns slug, last modified time (most recent file in the skill folder), and file count.
#[command]
pub async fn skill_summary(
    state: State<'_, AppState>,
) -> Result<Vec<SkillModInfo>, String> {
    let kb = &state.knowledge_path;
    let skills_dir = PathBuf::from(kb).join("_skills");

    if !skills_dir.exists() {
        return Ok(Vec::new());
    }

    let mut results = Vec::new();
    let entries = fs::read_dir(&skills_dir)
        .map_err(|e| format!("Failed to read _skills/: {}", e))?;

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !entry.path().is_dir() || name.starts_with('_') || name.starts_with('.') {
            continue;
        }

        let mut file_count: u32 = 0;
        let mut latest_modified: Option<std::time::SystemTime> = None;

        let mut files: Vec<PathBuf> = Vec::new();
        if let Ok(()) = collect_files(&entry.path(), &mut files) {
            file_count = files.len() as u32;
            for file in &files {
                if let Ok(meta) = fs::metadata(file) {
                    if let Ok(modified) = meta.modified() {
                        latest_modified = Some(match latest_modified {
                            Some(prev) if modified > prev => modified,
                            Some(prev) => prev,
                            None => modified,
                        });
                    }
                }
            }
        }

        let last_modified = latest_modified
            .map(|t| {
                chrono::DateTime::<chrono::Utc>::from(t)
                    .format("%Y-%m-%dT%H:%M:%SZ")
                    .to_string()
            })
            .unwrap_or_default();

        results.push(SkillModInfo {
            slug: name,
            last_modified,
            file_count,
        });
    }

    // Sort by most recently modified first
    results.sort_by(|a, b| b.last_modified.cmp(&a.last_modified));

    Ok(results)
}
