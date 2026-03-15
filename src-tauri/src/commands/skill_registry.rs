// src-tauri/src/commands/skill_registry.rs
// Skill registry commands: init migration, distribute, check drift, pull, diff

use crate::commands::error::{CmdResult, CommandError};
use crate::commands::settings;
use crate::commands::supabase::get_client;
use crate::AppState;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{command, State};

/// Resolve skills directory — folder name always provided by frontend
fn resolve_skills_dir(kb: &str, skills_folder: &str) -> PathBuf {
    PathBuf::from(kb).join(skills_folder)
}

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
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub target: String,
    #[serde(default)]
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verified: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rating: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_audited: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub needs_work: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub work_notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outcome: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gallery_pinned: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gallery_order: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_demo: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_examples: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_deck: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_guide: Option<bool>,
    #[serde(default)]
    pub distributions: Vec<SkillDistribution>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SkillRegistry {
    pub version: u32,
    pub updated: String,
    pub categories: Vec<SkillCategory>,
    pub skills: BTreeMap<String, SkillEntry>,
}

/// Row shape from Supabase `skills` table
#[derive(Debug, Deserialize)]
struct SkillDbRow {
    slug: String,
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    category: String,
    #[serde(default)]
    distributions: Vec<SkillDistribution>,
}

/// Load skills from Supabase and build a BTreeMap keyed by slug
async fn load_skills_from_db() -> CmdResult<BTreeMap<String, SkillEntry>> {
    let client = get_client().await?;
    let rows: Vec<SkillDbRow> = client
        .select("skills", "select=slug,name,description,category,distributions&order=slug.asc")
        .await?;

    let mut map = BTreeMap::new();
    for row in rows {
        map.insert(row.slug, SkillEntry {
            name: row.name,
            description: row.description,
            category: row.category,
            target: String::new(),
            status: String::new(),
            command: None,
            domain: None,
            verified: None,
            rating: None,
            last_audited: None,
            needs_work: None,
            work_notes: None,
            action: None,
            outcome: None,
            gallery_pinned: None,
            gallery_order: None,
            has_demo: None,
            has_examples: None,
            has_deck: None,
            has_guide: None,
            distributions: row.distributions,
        });
    }
    Ok(map)
}

/// Load a single skill's distributions from Supabase
async fn load_skill_from_db(slug: &str) -> CmdResult<SkillEntry> {
    let client = get_client().await?;
    let rows: Vec<SkillDbRow> = client
        .select("skills", &format!("slug=eq.{}&select=slug,name,description,category,distributions", slug))
        .await?;

    let row = rows.into_iter().next()
        .ok_or_else(|| CommandError::NotFound(format!("Skill '{}' not found in database", slug)))?;

    Ok(SkillEntry {
        name: row.name,
        description: row.description,
        category: row.category,
        target: String::new(),
        status: String::new(),
        command: None,
        domain: None,
        verified: None,
        rating: None,
        last_audited: None,
        needs_work: None,
        work_notes: None,
        action: None,
        outcome: None,
        gallery_pinned: None,
        gallery_order: None,
        has_demo: None,
        has_examples: None,
        has_deck: None,
        has_guide: None,
        distributions: row.distributions,
    })
}

#[derive(Debug, Serialize)]
pub struct SkillDriftStatus {
    pub slug: String,
    pub distribution_path: String,
    pub status: String, // "in_sync", "drifted", "not_distributed", "missing"
    pub source_hash: String,
    pub target_hash: String,
    pub source_modified: String, // ISO 8601
    pub target_modified: String, // ISO 8601
}

#[derive(Debug, Serialize)]
pub struct SkillInitResult {
    pub skills_created: u32,
    pub bot_skills: u32,
    pub platform_skills: u32,
    pub errors: Vec<String>,
    pub skills: BTreeMap<String, SkillEntry>,
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

#[derive(Debug, Serialize)]
pub struct DiffHunk {
    pub source_start: u32,
    pub target_start: u32,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Serialize)]
pub struct DiffLine {
    pub kind: String,       // "add", "remove", "context"
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct FileDiffEntry {
    pub path: String,        // relative path within skill folder
    pub status: String,      // "added", "removed", "modified", "unchanged"
    pub source_size: u64,
    pub target_size: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hunks: Option<Vec<DiffHunk>>,  // only for modified text files
}

#[derive(Debug, Serialize)]
pub struct SkillDiffResult {
    pub slug: String,
    pub distribution_path: String,
    pub drift_status: String,
    pub files: Vec<FileDiffEntry>,
    pub summary: String,     // e.g. "2 modified, 1 added"
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/// Compute SHA-256 hash of all files in a skill folder (excluding non-distributed files)
fn hash_skill_folder(folder: &Path) -> CmdResult<String> {
    let mut entries: Vec<PathBuf> = Vec::new();
    collect_files(folder, &mut entries)?;
    entries.sort();

    let mut hasher = Sha256::new();
    for entry in &entries {
        let rel = entry.strip_prefix(folder).unwrap_or(entry);
        let name = rel.to_string_lossy();
        // Skip marker, OS files, and authoring-only artifacts
        if name.contains(".DS_Store") || name.starts_with('.') {
            continue;
        }
        let file_name = entry.file_name().unwrap_or_default().to_string_lossy();
        if file_name == "README.md" || file_name == "AUDIT.md" || file_name == "evals.json" || file_name == "guide.html" || file_name.ends_with(".excalidraw") {
            continue;
        }
        let content = fs::read(entry)
            .map_err(|e| CommandError::Io(format!("Failed to read {}: {}", entry.display(), e)))?;
        hasher.update(name.as_bytes());
        hasher.update(&content);
    }

    let result = hasher.finalize();
    Ok(format!("sha256:{:x}", result))
}

fn collect_files(dir: &Path, out: &mut Vec<PathBuf>) -> CmdResult<()> {
    if !dir.is_dir() {
        return Ok(());
    }
    let entries = fs::read_dir(dir)
        .map_err(|e| CommandError::Io(format!("Failed to read dir {}: {}", dir.display(), e)))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.starts_with('.')
                && !matches!(name.as_str(), "evals" | "demo" | "examples" | "__pycache__" | "_catalog" | "_archive")
            {
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
        if name.contains(".DS_Store") || name.starts_with('.') {
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

/// Copy a folder recursively, excluding dotfiles and authoring artifacts
fn copy_skill_folder(src: &Path, dst: &Path) -> CmdResult<()> {
    if dst.exists() {
        fs::remove_dir_all(dst)
            .map_err(|e| CommandError::Io(format!("Failed to clear {}: {}", dst.display(), e)))?;
    }
    fs::create_dir_all(dst)
        .map_err(|e| CommandError::Io(format!("Failed to create {}: {}", dst.display(), e)))?;

    copy_dir_contents(src, dst)
}

fn copy_dir_contents(src: &Path, dst: &Path) -> CmdResult<()> {
    let entries = fs::read_dir(src)
        .map_err(|e| CommandError::Io(format!("Failed to read {}: {}", src.display(), e)))?;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name == ".DS_Store" || name.starts_with('.') {
            continue;
        }
        // Skip authoring/maintenance artifacts — only distribute execution files
        if name == "README.md" || name == "AUDIT.md" || name == "evals.json" || name == "guide.html" || name.ends_with(".excalidraw") {
            continue;
        }
        let src_path = entry.path();
        let dst_path = dst.join(&name);
        if src_path.is_dir() {
            // Skip non-distribution directories
            if matches!(name.as_str(), "evals" | "demo" | "examples" | "__pycache__" | "_catalog" | "_archive") {
                continue;
            }
            fs::create_dir_all(&dst_path)
                .map_err(|e| CommandError::Io(format!("Failed to create dir {}: {}", dst_path.display(), e)))?;
            copy_dir_contents(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)
                .map_err(|e| CommandError::Io(format!("Failed to copy {}: {}", src_path.display(), e)))?;
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

// ─── Commands ────────────────────────────────────────────────────────────────

/// Scan filesystem skills and return results (Supabase is the source of truth)
#[command]
pub async fn skill_init(state: State<'_, AppState>, skills_folder: String) -> CmdResult<SkillInitResult> {
    let kb = &state.knowledge_path;
    let skills_dir = resolve_skills_dir(kb, &skills_folder);
    fs::create_dir_all(&skills_dir)
        .map_err(|e| CommandError::Io(format!("Failed to create skills dir: {}", e)))?;

    // Load existing registry to preserve categories, status, and other metadata
    let default_categories = vec![
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
    ];
    // Start with empty registry — skill_init scans filesystem and returns results
    // Metadata (category, status, owner, etc.) lives in Supabase, not here
    let mut registry = SkillRegistry {
        version: 1,
        updated: now_sgt(),
        categories: default_categories,
        skills: BTreeMap::new(),
    };

    let mut result = SkillInitResult {
        skills_created: 0,
        bot_skills: 0,
        platform_skills: 0,
        errors: Vec::new(),
        skills: BTreeMap::new(),
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

                // Parse SKILL.md for name/description/command (content metadata)
                let skill_md_path = dst.join("SKILL.md");
                let (skill_name, description, cmd) = if skill_md_path.exists() {
                    let content = fs::read_to_string(&skill_md_path).unwrap_or_default();
                    let name = parse_frontmatter_field(&content, "title")
                        .or_else(|| parse_frontmatter_field(&content, "name"))
                        .unwrap_or_else(|| slug.clone());
                    let desc = parse_frontmatter_field(&content, "description")
                        .or_else(|| parse_frontmatter_field(&content, "summary"))
                        .unwrap_or_default();
                    let cmd = parse_frontmatter_field(&content, "command");
                    (name, desc, cmd)
                } else {
                    (slug.clone(), String::new(), None)
                };

                // Create entry from filesystem scan — metadata lives in Supabase
                let category = bot_categories.get(&slug).cloned()
                    .unwrap_or_else(|| "val".to_string());
                let skill_dir = skills_dir.join(&slug);
                let entry = SkillEntry {
                    name: skill_name,
                    description,
                    category,
                    target: "bot".to_string(),
                    status: "active".to_string(),
                    command: cmd,
                    domain: None,
                    verified: None,
                    rating: None,
                    last_audited: None,
                    needs_work: None,
                    work_notes: None,
                    action: None,
                    outcome: None,
                    gallery_pinned: None,
                    gallery_order: None,
                    has_demo: Some(skill_dir.join("demo").exists() || skill_dir.join("demo-data").exists()),
                    has_examples: Some(skill_dir.join("examples").exists()),
                    has_deck: Some(skill_dir.join("deck.html").exists()),
                    has_guide: Some(skill_dir.join("guide.html").exists()),
                    distributions: vec![SkillDistribution {
                        path: format!("_team/melvin/bot-mel/skills/{}", slug),
                        dist_type: "bot".to_string(),
                    }],
                };
                registry.skills.insert(slug.clone(), entry);

                result.bot_skills += 1;
                result.skills_created += 1;
            }
        }
    }

    // ── Scan _skills/ to sync all skill directories with the registry ──
    // Update existing entries and add new ones
    if let Ok(entries) = fs::read_dir(&skills_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !entry.path().is_dir() || name.starts_with('_') || name.starts_with('.') {
                continue;
            }

            let slug = name.clone();
            let skill_dir = entry.path();

            // Parse SKILL.md for name/description/command
            let skill_md_path = skill_dir.join("SKILL.md");
            let (skill_name, description, cmd) = if skill_md_path.exists() {
                let content = fs::read_to_string(&skill_md_path).unwrap_or_default();
                let sname = parse_frontmatter_field(&content, "title")
                    .or_else(|| parse_frontmatter_field(&content, "name"))
                    .unwrap_or_else(|| slug.clone());
                let desc = parse_frontmatter_field(&content, "description")
                    .or_else(|| parse_frontmatter_field(&content, "summary"))
                    .unwrap_or_default();
                let cmd = parse_frontmatter_field(&content, "command");
                (sname, desc, cmd)
            } else {
                (slug.clone(), String::new(), None)
            };

            // Detect artifacts
            let has_demo = Some(skill_dir.join("demo").exists() || skill_dir.join("demo-data").exists());
            let has_examples = Some(skill_dir.join("examples").exists());
            let has_deck = Some(skill_dir.join("deck.html").exists());
            let has_guide = Some(skill_dir.join("guide.html").exists());

            if let Some(existing) = registry.skills.get_mut(&slug) {
                // Update content fields and artifacts, preserve all metadata
                existing.name = skill_name;
                existing.description = description;
                existing.command = cmd;
                existing.has_demo = has_demo;
                existing.has_examples = has_examples;
                existing.has_deck = has_deck;
                existing.has_guide = has_guide;
            } else {
                // New skill not in registry
                registry.skills.insert(slug, SkillEntry {
                    name: skill_name,
                    description,
                    category: "val".to_string(),
                    target: "platform".to_string(),
                    status: "active".to_string(),
                    command: cmd,
                    domain: None,
                    verified: None,
                    rating: None,
                    last_audited: None,
                    needs_work: None,
                    work_notes: None,
                    action: None,
                    outcome: None,
                    gallery_pinned: None,
                    gallery_order: None,
                    has_demo,
                    has_examples,
                    has_deck,
                    has_guide,
                    distributions: Vec::new(),
                });
                result.platform_skills += 1;
                result.skills_created += 1;
            }
        }
    }

    // ── Remove registry entries whose _skills/ folder no longer exists ──
    let stale_slugs: Vec<String> = registry.skills.keys()
        .filter(|slug| !skills_dir.join(slug).exists())
        .cloned()
        .collect();
    for slug in &stale_slugs {
        registry.skills.remove(slug);
    }
    if !stale_slugs.is_empty() {
        result.errors.push(format!("Removed {} stale entries: {}", stale_slugs.len(), stale_slugs.join(", ")));
    }

    // Return scanned skills (no file write — Supabase is the source of truth)
    result.skills = registry.skills;

    Ok(result)
}

/// Distribute a skill from _skills/{slug} to its target paths
#[command]
pub async fn skill_distribute(
    state: State<'_, AppState>,
    slug: String,
    skills_folder: String,
) -> CmdResult<Vec<SkillDriftStatus>> {
    let kb = &state.knowledge_path;
    let skills_dir = resolve_skills_dir(kb, &skills_folder);
    let source_dir = skills_dir.join(&slug);

    if !source_dir.exists() {
        return Err(CommandError::NotFound(format!("Skill '{}' not found in skills dir", slug)));
    }

    // Load skill from Supabase
    let entry = load_skill_from_db(&slug).await?;

    let source_hash = hash_skill_folder(&source_dir)?;
    let mut results = Vec::new();

    for dist in &entry.distributions {
        let target_path = PathBuf::from(kb).join(&dist.path);

        // Copy source → target
        copy_skill_folder(&source_dir, &target_path)?;

        let mod_time = get_folder_latest_modified(&source_dir);
        results.push(SkillDriftStatus {
            slug: slug.clone(),
            distribution_path: dist.path.clone(),
            status: "in_sync".to_string(),
            source_hash: source_hash.clone(),
            target_hash: source_hash.clone(),
            source_modified: mod_time.clone(),
            target_modified: mod_time,
        });
    }

    // After distributing, regenerate _categories.json for each bot target
    let has_bot_dist = entry.distributions.iter().any(|d| d.dist_type == "bot");
    if has_bot_dist {
        let all_skills = load_skills_from_db().await?;
        let registry = SkillRegistry {
            version: 1,
            updated: String::new(),
            categories: Vec::new(),
            skills: all_skills,
        };
        for dist in &entry.distributions {
            if dist.dist_type == "bot" {
                if let Some(parent) = Path::new(&dist.path).parent() {
                    let _ = regenerate_bot_categories_for(kb, &parent.to_string_lossy(), &registry);
                }
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
    skills_folder: String,
) -> CmdResult<Vec<SkillDriftStatus>> {
    let kb = &state.knowledge_path;
    let skills_dir = resolve_skills_dir(kb, &skills_folder);
    let source_dir = skills_dir.join(&slug);

    if !source_dir.exists() {
        return Err(CommandError::NotFound(format!("Skill '{}' not found in skills dir", slug)));
    }

    // Load skill from Supabase
    let entry = load_skill_from_db(&slug).await?;

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
                source_modified: get_folder_latest_modified(&source_dir),
                target_modified: String::new(),
            });
            continue;
        }

        let target_hash = hash_skill_folder(&target_path)?;

        let status = if source_hash == target_hash {
            "in_sync".to_string()
        } else {
            "drifted".to_string()
        };

        results.push(SkillDriftStatus {
            slug: slug.clone(),
            distribution_path: dist.path.clone(),
            status,
            source_hash: source_hash.clone(),
            target_hash,
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
    skills_folder: String,
) -> CmdResult<SkillDriftStatus> {
    let kb = &state.knowledge_path;
    let skills_dir = resolve_skills_dir(kb, &skills_folder);
    let source_dir = skills_dir.join(&slug);
    let target_dir = PathBuf::from(kb).join(&target_path);

    if !target_dir.exists() {
        return Err(CommandError::NotFound(format!("Target path '{}' not found", target_path)));
    }

    // Copy target → source
    copy_skill_folder(&target_dir, &source_dir)?;

    // Now hash to confirm sync
    let source_hash = hash_skill_folder(&source_dir)?;

    let mod_time = get_folder_latest_modified(&source_dir);
    Ok(SkillDriftStatus {
        slug,
        distribution_path: target_path,
        status: "in_sync".to_string(),
        source_hash: source_hash.clone(),
        target_hash: source_hash,
        source_modified: mod_time.clone(),
        target_modified: mod_time,
    })
}

/// Compare source and target file-by-file to show what's different
#[command]
pub async fn skill_diff(
    state: State<'_, AppState>,
    slug: String,
    target_path: String,
    skills_folder: String,
) -> CmdResult<SkillDiffResult> {
    let kb = &state.knowledge_path;
    let skills_dir = resolve_skills_dir(kb, &skills_folder);
    let source_dir = skills_dir.join(&slug);
    let target_dir = PathBuf::from(kb).join(&target_path);

    if !source_dir.exists() {
        return Err(CommandError::NotFound(format!("Skill '{}' not found in skills dir", slug)));
    }

    // Collect files from both sides (using the same filter as hashing)
    let source_files = collect_distributed_files(&source_dir)?;
    let target_files = if target_dir.exists() {
        collect_distributed_files(&target_dir)?
    } else {
        BTreeMap::new()
    };

    let mut files = Vec::new();
    let mut added = 0u32;
    let mut removed = 0u32;
    let mut modified = 0u32;

    // Check all source files
    for (rel, source_path) in &source_files {
        let source_size = fs::metadata(source_path).map(|m| m.len()).unwrap_or(0);
        if let Some(target_p) = target_files.get(rel) {
            let target_size = fs::metadata(target_p).map(|m| m.len()).unwrap_or(0);
            let src_bytes = fs::read(source_path).unwrap_or_default();
            let tgt_bytes = fs::read(target_p).unwrap_or_default();
            if src_bytes == tgt_bytes {
                files.push(FileDiffEntry {
                    path: rel.clone(),
                    status: "unchanged".to_string(),
                    source_size,
                    target_size,
                    hunks: None,
                });
            } else {
                modified += 1;
                // Compute text hunks for text files
                let hunks = compute_text_hunks(&src_bytes, &tgt_bytes);
                files.push(FileDiffEntry {
                    path: rel.clone(),
                    status: "modified".to_string(),
                    source_size,
                    target_size,
                    hunks,
                });
            }
        } else {
            added += 1;
            files.push(FileDiffEntry {
                path: rel.clone(),
                status: "added".to_string(),
                source_size,
                target_size: 0,
                hunks: None,
            });
        }
    }

    // Check files only in target (removed from source)
    for (rel, target_p) in &target_files {
        if !source_files.contains_key(rel) {
            removed += 1;
            let target_size = fs::metadata(target_p).map(|m| m.len()).unwrap_or(0);
            files.push(FileDiffEntry {
                path: rel.clone(),
                status: "removed".to_string(),
                source_size: 0,
                target_size,
                hunks: None,
            });
        }
    }

    // Sort: changed files first, then alphabetical
    files.sort_by(|a, b| {
        let order = |s: &str| match s { "modified" => 0, "added" => 1, "removed" => 2, _ => 3 };
        order(&a.status).cmp(&order(&b.status)).then(a.path.cmp(&b.path))
    });

    let drift_status = if modified == 0 && added == 0 && removed == 0 {
        "in_sync".to_string()
    } else {
        "drifted".to_string()
    };

    let mut parts = Vec::new();
    if modified > 0 { parts.push(format!("{} modified", modified)); }
    if added > 0 { parts.push(format!("{} added", added)); }
    if removed > 0 { parts.push(format!("{} removed", removed)); }
    let summary = if parts.is_empty() { "No changes".to_string() } else { parts.join(", ") };

    Ok(SkillDiffResult {
        slug,
        distribution_path: target_path,
        drift_status,
        files,
        summary,
    })
}

/// Compute unified diff hunks between two byte slices (if both are valid UTF-8 text)
fn compute_text_hunks(source: &[u8], target: &[u8]) -> Option<Vec<DiffHunk>> {
    let src_str = std::str::from_utf8(source).ok()?;
    let tgt_str = std::str::from_utf8(target).ok()?;

    use similar::{ChangeTag, TextDiff};
    let diff = TextDiff::from_lines(tgt_str, src_str);
    let mut hunks = Vec::new();

    for group in diff.grouped_ops(3) {
        let mut lines = Vec::new();
        let mut source_start = 0u32;
        let mut target_start = 0u32;
        let mut first = true;

        for op in &group {
            if first {
                source_start = op.new_range().start as u32 + 1;
                target_start = op.old_range().start as u32 + 1;
                first = false;
            }
            for change in diff.iter_changes(op) {
                let content = change.value().trim_end_matches('\n').to_string();
                let kind = match change.tag() {
                    ChangeTag::Insert => "add",
                    ChangeTag::Delete => "remove",
                    ChangeTag::Equal => "context",
                };
                lines.push(DiffLine {
                    kind: kind.to_string(),
                    content,
                });
            }
        }

        if lines.iter().any(|l| l.kind != "context") {
            hunks.push(DiffHunk {
                source_start,
                target_start,
                lines,
            });
        }
    }

    if hunks.is_empty() { None } else { Some(hunks) }
}

/// Collect distributed files as a map of relative_path -> absolute_path
/// Uses the same filters as hash_skill_folder
fn collect_distributed_files(folder: &Path) -> CmdResult<BTreeMap<String, PathBuf>> {
    let mut entries: Vec<PathBuf> = Vec::new();
    collect_files(folder, &mut entries)?;
    entries.sort();

    let mut map = BTreeMap::new();
    for entry in entries {
        let rel = entry.strip_prefix(folder).unwrap_or(&entry);
        let name = rel.to_string_lossy().to_string();
        // Same filters as hash_skill_folder
        if name.contains(".DS_Store") || name.starts_with('.') {
            continue;
        }
        let file_name = entry.file_name().unwrap_or_default().to_string_lossy();
        if file_name == "README.md" || file_name == "AUDIT.md" || file_name == "evals.json" || file_name == "guide.html" || file_name.ends_with(".excalidraw") {
            continue;
        }
        map.insert(name, entry);
    }
    Ok(map)
}

/// Check drift status for ALL skills in the registry (batch).
/// Also scans all bot skills/ directories and platform skills/ for copies
/// that aren't registered as distributions yet.
#[command]
pub async fn skill_check_all(
    state: State<'_, AppState>,
    skills_folder: String,
) -> CmdResult<Vec<SkillDriftStatus>> {
    let kb = &state.knowledge_path;
    let skills_dir = resolve_skills_dir(kb, &skills_folder);

    // Load all skills from Supabase
    let db_skills = load_skills_from_db().await.unwrap_or_default();
    if db_skills.is_empty() {
        return Ok(Vec::new());
    }

    let registry = SkillRegistry {
        version: 1,
        updated: String::new(),
        categories: Vec::new(),
        skills: db_skills,
    };

    let mut all_results = Vec::new();
    let mut dbg_lines: Vec<String> = Vec::new();
    dbg_lines.push(format!("kb={}", kb));
    dbg_lines.push(format!("skills_dir={}", skills_dir.display()));
    dbg_lines.push(format!("registry has {} skills", registry.skills.len()));

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
            dbg_lines.push(format!("SKIP {}: source not found at {}", slug, source_dir.display()));
            continue;
        }
        let source_hash = hash_skill_folder(&source_dir).unwrap_or_default();

        if let Some(entry) = registry.skills.get(slug) {
            for dist in &entry.distributions {
                let target_path = PathBuf::from(kb).join(&dist.path);
                let result = check_distribution(slug, &dist.path, &source_hash, &source_dir, &target_path);
                dbg_lines.push(format!("{} -> {} = {}", slug, dist.path, result.status));
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

    dbg_lines.push(format!("returning {} results", all_results.len()));
    let _ = fs::write("/tmp/skill_check_all_debug.txt", dbg_lines.join("\n"));
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
            source_modified,
            target_modified: String::new(),
        };
    }

    let target_hash = hash_skill_folder(target_path).unwrap_or_default();
    let target_modified = get_folder_latest_modified(target_path);

    let status = if source_hash == &target_hash {
        "in_sync".to_string()
    } else {
        "drifted".to_string()
    };

    SkillDriftStatus {
        slug: slug.to_string(),
        distribution_path: dist_path.to_string(),
        status,
        source_hash: source_hash.to_string(),
        target_hash,
        source_modified,
        target_modified,
    }
}

/// Regenerate _categories.json for a specific bot's skills directory.
/// Scans which skills from the registry are actually present in this bot's skills dir.
fn regenerate_bot_categories_for(kb: &str, bot_skills_dir: &str, registry: &SkillRegistry) -> CmdResult<()> {
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
        .map_err(|e| CommandError::Parse(format!("Failed to serialize categories: {}", e)))?;
    fs::write(&categories_path, json)
        .map_err(|e| CommandError::Io(format!("Failed to write categories: {}", e)))?;

    Ok(())
}

/// Discover all bots under _team/ that have (or could have) a skills/ directory.
/// Skips _templates and _deprecated.
#[command]
pub async fn skill_list_bots(state: State<'_, AppState>) -> CmdResult<Vec<BotInfo>> {
    let kb = &state.knowledge_path;
    let team_dir = PathBuf::from(kb).join("_team");

    let mut bots = Vec::new();

    if !team_dir.exists() {
        return Ok(bots);
    }

    // Scan _team/{person}/ for bot-* dirs
    let persons = fs::read_dir(&team_dir)
        .map_err(|e| CommandError::Io(format!("Failed to read _team/: {}", e)))?;

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
/// This copies the skill, writes the marker, adds the distribution to Supabase,
/// and regenerates _categories.json for bot targets.
#[command]
pub async fn skill_distribute_to(
    state: State<'_, AppState>,
    slug: String,
    target_path: String,
    dist_type: String,
    skills_folder: String,
) -> CmdResult<SkillDriftStatus> {
    let kb = &state.knowledge_path;
    let skills_dir = resolve_skills_dir(kb, &skills_folder);
    let source_dir = skills_dir.join(&slug);

    if !source_dir.exists() {
        return Err(CommandError::NotFound(format!("Skill '{}' not found in skills dir", slug)));
    }

    // Build full target: for bot, target_path is like "_team/melvin/bot-mel/skills"
    // and we append the slug. For platform, target_path is "0_Platform/skills".
    let full_target = format!("{}/{}", target_path, slug);
    let target_dir = PathBuf::from(kb).join(&full_target);

    // Copy source → target
    copy_skill_folder(&source_dir, &target_dir)?;

    let source_hash = hash_skill_folder(&source_dir)?;

    // Update Supabase — add this distribution if not already present
    let mut entry = load_skill_from_db(&slug).await?;
    let already_exists = entry.distributions.iter().any(|d| d.path == full_target);
    if !already_exists {
        entry.distributions.push(SkillDistribution {
            path: full_target.clone(),
            dist_type: dist_type.clone(),
        });
        // Write updated distributions back to Supabase
        let client = get_client().await?;
        let update_data = serde_json::json!({
            "distributions": entry.distributions,
        });
        let _: Vec<serde_json::Value> = client
            .update("skills", &format!("slug=eq.{}", slug), &update_data)
            .await?;
    }

    // Regenerate _categories.json for bot targets
    if dist_type == "bot" {
        let all_skills = load_skills_from_db().await?;
        let registry = SkillRegistry {
            version: 1,
            updated: String::new(),
            categories: Vec::new(),
            skills: all_skills,
        };
        let _ = regenerate_bot_categories_for(kb, &target_path, &registry);
    }

    let mod_time = get_folder_latest_modified(&source_dir);
    Ok(SkillDriftStatus {
        slug,
        distribution_path: full_target,
        status: "in_sync".to_string(),
        source_hash: source_hash.clone(),
        target_hash: source_hash,
        source_modified: mod_time.clone(),
        target_modified: mod_time,
    })
}

/// Get modification info for all skills in the registry (for dashboard display).
/// Returns slug, last modified time (most recent file in the skill folder), and file count.
#[command]
pub async fn skill_summary(
    state: State<'_, AppState>,
    skills_folder: String,
) -> CmdResult<Vec<SkillModInfo>> {
    let kb = &state.knowledge_path;
    let skills_dir = resolve_skills_dir(kb, &skills_folder);

    if !skills_dir.exists() {
        return Ok(Vec::new());
    }

    let mut results = Vec::new();
    let entries = fs::read_dir(&skills_dir)
        .map_err(|e| CommandError::Io(format!("Failed to read skills dir: {}", e)))?;

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

// ─── Report Gallery ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct SkillExample {
    pub slug: String,
    pub skill_name: String,
    pub file_name: String,
    pub file_path: String,
    pub modified: String,
    pub demo_type: String, // "report" or "deck"
}

#[command]
pub async fn skill_list_examples(
    state: State<'_, AppState>,
    skills_folder: String,
) -> CmdResult<Vec<SkillExample>> {
    let kb = &state.knowledge_path;
    let skills_dir = resolve_skills_dir(kb, &skills_folder);

    if !skills_dir.exists() {
        return Ok(Vec::new());
    }

    // Load skill names from Supabase
    let db_skills = load_skills_from_db().await.unwrap_or_default();

    let mut results = Vec::new();

    let entries = fs::read_dir(&skills_dir)
        .map_err(|e| CommandError::Io(format!("Failed to read skills dir: {}", e)))?;

    for entry in entries.flatten() {
        let slug = entry.file_name().to_string_lossy().to_string();
        if !entry.path().is_dir() || slug.starts_with('_') || slug.starts_with('.') {
            continue;
        }

        let examples_dir = entry.path().join("demo");
        if !examples_dir.exists() || !examples_dir.is_dir() {
            continue;
        }

        let skill_entry = db_skills.get(&slug);
        let skill_name = skill_entry
            .map(|s| s.name.clone())
            .unwrap_or_else(|| slug.clone());

        // Determine demo type from skill category
        let demo_type = if skill_entry.map_or(false, |s| s.category.contains("deck")) {
            "deck".to_string()
        } else {
            "report".to_string()
        };

        if let Ok(files) = fs::read_dir(&examples_dir) {
            for file in files.flatten() {
                let fname = file.file_name().to_string_lossy().to_string();
                if !fname.ends_with(".html") {
                    continue;
                }

                let modified = file
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .map(|t| {
                        chrono::DateTime::<chrono::Utc>::from(t)
                            .format("%Y-%m-%dT%H:%M:%SZ")
                            .to_string()
                    })
                    .unwrap_or_default();

                results.push(SkillExample {
                    slug: slug.clone(),
                    skill_name: skill_name.clone(),
                    file_name: fname,
                    file_path: file.path().to_string_lossy().to_string(),
                    modified,
                    demo_type: demo_type.clone(),
                });
            }
        }
    }

    // Sort by most recently modified first
    results.sort_by(|a, b| b.modified.cmp(&a.modified));

    Ok(results)
}

// ─── AI Diff Summary ────────────────────────────────────────────────────────

#[command]
pub async fn ai_summarize_diff(
    skill_name: String,
    diff_text: String,
) -> CmdResult<String> {
    let api_key = settings::settings_get_anthropic_key()?
        .ok_or_else(|| CommandError::Config("Anthropic API key not configured. Set it in Settings.".into()))?;

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 300,
        "messages": [{
            "role": "user",
            "content": format!(
                "Summarize the following diff for the skill \"{}\". \
                 Lines starting with + are additions (new version), lines starting with - are removals (old version). \
                 Give a concise 2-3 sentence plain text summary of what changed and why it matters. \
                 Do NOT use markdown formatting — no headings, no bullet points, no backticks. \
                 Just plain sentences.\n\n{}",
                skill_name, diff_text
            )
        }]
    });

    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| CommandError::Network(format!("API request failed: {}", e)))?;

    let status = resp.status();
    let text = resp.text().await
        .map_err(|e| CommandError::Network(format!("Failed to read response: {}", e)))?;

    if !status.is_success() {
        return Err(CommandError::Network(format!("API returned {}: {}", status, text)));
    }

    let parsed: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| CommandError::Parse(format!("Failed to parse response: {}", e)))?;

    let summary = parsed["content"][0]["text"]
        .as_str()
        .unwrap_or("Could not parse summary.")
        .to_string();

    Ok(summary)
}
