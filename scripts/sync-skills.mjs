#!/usr/bin/env node

/**
 * Sync skills: _skills/SKILL.md -> registry.json -> Supabase `skills` table
 *
 * Usage:
 *   node scripts/sync-skills.mjs [--dry-run] [--verbose]
 *
 * What it does:
 * 1. Scans _skills/{slug}/SKILL.md and parses frontmatter (name, description)
 * 2. Inspects each skill directory for demo/, examples/, docs/, assets/
 * 3. Auto-classifies skill_type from slug pattern
 * 4. Fetches current Supabase state to preserve DB-only fields (rating, verified, etc.)
 * 5. Writes merged registry.json to _skills/
 * 6. Upserts file-owned fields to Supabase (does NOT overwrite DB-owned fields)
 *
 * Ownership split:
 *   FILES own: slug, name, description, has_demo, has_examples, has_guide, has_deck, skill_type
 *   SUPABASE owns: rating, verified, last_audited, owner, needs_work, work_notes, action, outcome,
 *                   gallery_pinned, gallery_order, demo_uploaded, demo_url
 *   SHARED (file wins on create, DB wins on update): category, subcategory, target, status, domain, command
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync } from "fs";
import { resolve, join } from "path";
import matter from "gray-matter";

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = "https://sabrnwuhgkqfwunbrnrt.supabase.co";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhYnJud3VoZ2txZnd1bmJybnJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1NTE3NTQsImV4cCI6MjA4NDEyNzc1NH0.ZPUkYRsVzrFKW5jFutm7HkauRW-mkbXPyPhix4q083k";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TV_KNOWLEDGE = resolve(
  process.env.HOME,
  "Library/CloudStorage/Dropbox-Thinkval/ThinkVAL team folder/SkyNet/tv-knowledge"
);
const SKILLS_DIR = resolve(TV_KNOWLEDGE, "_skills");
const REGISTRY_PATH = resolve(SKILLS_DIR, "registry.json");

// Parse args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Classify skill_type from slug pattern */
function classifySkillType(slug) {
  if (slug.startsWith("analyzing-")) return "chat";
  if (slug.startsWith("diagnosing-") || slug.startsWith("recon-")) return "diagnostic";
  if (slug.startsWith("generating-") || slug.startsWith("reporting-")) return "report";
  return "other";
}

/** Infer category from slug and directory contents */
function inferCategory(slug, dirPath) {
  // Bot-only skills
  const botSlugs = [
    "auditing-skills", "building-analyzing-skill-from-dashboard",
    "populating-gallery-writeups", "preparing-release-notes",
  ];
  if (botSlugs.includes(slug)) return { category: "Bot", subcategory: "internal" };

  // Domain-specific → extract domain
  const domainMatch = slug.match(/^(?:analyzing|generating|reporting|recon-diagnostics|diagnosing)-(.+?)(?:-report|-v\d+)?$/);
  if (domainMatch) {
    return { category: "Delivery", subcategory: domainMatch[1] };
  }

  return { category: "Uncategorized", subcategory: null };
}

/** Check which asset directories exist */
function inspectAssets(dirPath) {
  return {
    has_demo: existsSync(join(dirPath, "demo")),
    has_examples: existsSync(join(dirPath, "examples")),
    has_guide: existsSync(join(dirPath, "docs")),
    has_deck: existsSync(join(dirPath, "deck")) || existsSync(join(dirPath, "assets", "deck")),
  };
}

/** Get distributions by checking for skill copies in bot directories */
function getDistributions(slug) {
  const distributions = [];
  const teamDir = resolve(TV_KNOWLEDGE, "_team");

  if (!existsSync(teamDir)) return distributions;

  for (const person of readdirSync(teamDir)) {
    const personDir = join(teamDir, person);
    if (!statSync(personDir).isDirectory()) continue;

    // Check each bot under this person
    for (const item of readdirSync(personDir)) {
      const botSkillDir = join(personDir, item, "_skills", slug);
      if (existsSync(botSkillDir)) {
        distributions.push({
          path: `_team/${person}/${item}/_skills/${slug}`,
          type: "bot",
        });
      }
    }
  }

  return distributions;
}

// ─── Scan Skills ─────────────────────────────────────────────────────────────

function scanSkillsFromFiles() {
  const skills = {};

  const entries = readdirSync(SKILLS_DIR).filter((name) => {
    const fullPath = join(SKILLS_DIR, name);
    return (
      statSync(fullPath).isDirectory() &&
      existsSync(join(fullPath, "SKILL.md")) &&
      !name.startsWith("_") &&
      !name.startsWith(".")
    );
  });

  for (const slug of entries) {
    const skillPath = join(SKILLS_DIR, slug, "SKILL.md");
    const raw = readFileSync(skillPath, "utf-8");
    const { data: frontmatter } = matter(raw);

    const dirPath = join(SKILLS_DIR, slug);
    const assets = inspectAssets(dirPath);
    const { category, subcategory } = inferCategory(slug, dirPath);
    const distributions = getDistributions(slug);

    skills[slug] = {
      name: frontmatter.name || slug,
      description: frontmatter.description || "",
      category,
      subcategory,
      target: frontmatter.target || "platform",
      status: frontmatter.status || "active",
      skill_type: classifySkillType(slug),
      command: frontmatter.command || null,
      domain: frontmatter.domain || null,
      ...assets,
      distributions,
    };
  }

  return skills;
}

// ─── Fetch Supabase State ────────────────────────────────────────────────────

async function fetchSupabaseSkills() {
  const { data, error } = await supabase.from("skills").select("*");
  if (error) {
    console.error("Failed to fetch Supabase skills:", error.message);
    return {};
  }
  const map = {};
  for (const row of data) {
    map[row.slug] = row;
  }
  return map;
}

// ─── Merge ───────────────────────────────────────────────────────────────────

// Fields that files always own (overwrite DB on sync)
const FILE_OWNED = [
  "name", "description", "skill_type",
  "has_demo", "has_examples", "has_guide", "has_deck",
  "distributions",
];

// Fields that DB owns (never overwritten by file sync)
const DB_OWNED = [
  "rating", "verified", "last_audited", "owner",
  "needs_work", "work_notes", "action", "outcome",
  "gallery_pinned", "gallery_order",
  "demo_uploaded", "demo_url",
];

// Fields where file wins on create, DB wins on update
const SHARED_FIELDS = [
  "category", "subcategory", "target", "status", "domain", "command",
];

function mergeSkills(fileSkills, dbSkills) {
  const merged = {};
  const stats = { created: 0, updated: 0, unchanged: 0, db_only: 0 };

  // Process all file-based skills
  for (const [slug, fileData] of Object.entries(fileSkills)) {
    const dbData = dbSkills[slug];

    if (!dbData) {
      // New skill — file owns everything
      merged[slug] = { ...fileData };
      stats.created++;
    } else {
      // Existing skill — merge by ownership
      const result = {};

      // File-owned fields: always from file
      for (const field of FILE_OWNED) {
        result[field] = fileData[field];
      }

      // DB-owned fields: always from DB
      for (const field of DB_OWNED) {
        if (dbData[field] !== undefined) {
          result[field] = dbData[field];
        }
      }

      // Shared fields: DB wins if set, file provides defaults
      for (const field of SHARED_FIELDS) {
        result[field] = dbData[field] ?? fileData[field];
      }

      merged[slug] = result;

      // Check if anything actually changed
      const fileChanged = FILE_OWNED.some(
        (f) => JSON.stringify(fileData[f]) !== JSON.stringify(dbData[f])
      );
      if (fileChanged) {
        stats.updated++;
      } else {
        stats.unchanged++;
      }
    }
  }

  // Track DB-only skills (exist in Supabase but not in files)
  const dbOnly = [];
  for (const slug of Object.keys(dbSkills)) {
    if (!fileSkills[slug]) {
      stats.db_only++;
      dbOnly.push(slug);
      if (verbose) console.log(`  ! DB-only (no SKILL.md): ${slug}`);
    }
  }

  return { merged, stats, dbOnly };
}

// ─── Write Registry ──────────────────────────────────────────────────────────

function writeRegistry(skills) {
  const registry = {
    version: 1,
    updated: new Date().toISOString(),
    categories: buildCategories(skills),
    skills,
  };

  if (dryRun) {
    console.log(`[dry-run] Would write registry.json with ${Object.keys(skills).length} skills`);
  } else {
    writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
    console.log(`Wrote ${REGISTRY_PATH}`);
  }

  return registry;
}

function buildCategories(skills) {
  const seen = new Map();
  for (const skill of Object.values(skills)) {
    const cat = skill.category || "Uncategorized";
    if (!seen.has(cat)) {
      seen.set(cat, { id: cat.toLowerCase().replace(/\s+/g, "-"), label: cat });
    }
  }
  return [...seen.values()];
}

// ─── Upsert to Supabase ─────────────────────────────────────────────────────

async function upsertToSupabase(fileSkills, dbSkills) {
  const rows = [];

  for (const [slug, fileData] of Object.entries(fileSkills)) {
    const dbData = dbSkills[slug];

    // Build upsert row: only file-owned + shared fields
    const row = { slug };

    // Always set file-owned fields
    for (const field of FILE_OWNED) {
      if (field === "distributions") {
        row[field] = JSON.stringify(fileData[field] || []);
      } else {
        row[field] = fileData[field];
      }
    }

    // Shared fields: only set if this is a new skill OR if file has a non-null value and DB doesn't
    for (const field of SHARED_FIELDS) {
      if (!dbData) {
        // New skill — use file value
        row[field] = fileData[field];
      }
      // Existing skill — don't touch shared fields (DB wins)
    }

    rows.push(row);
  }

  if (dryRun) {
    console.log(`[dry-run] Would upsert ${rows.length} skills to Supabase`);
    return;
  }

  // Upsert in batches
  const BATCH_SIZE = 50;
  let total = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("skills")
      .upsert(batch, { onConflict: "slug" });

    if (error) {
      console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error.message);
      // Retry one by one
      for (const row of batch) {
        const { error: singleError } = await supabase
          .from("skills")
          .upsert(row, { onConflict: "slug" });
        if (singleError) {
          console.error(`  Failed: ${row.slug} — ${singleError.message}`);
          errors++;
        } else {
          total++;
        }
      }
    } else {
      total += batch.length;
    }
  }

  console.log(`Upserted ${total} skills to Supabase${errors ? ` (${errors} errors)` : ""}`);
}

// ─── Cleanup DB-only skills ──────────────────────────────────────────────────

async function cleanupDbOnlySkills(dbOnly, dbSkills) {
  if (dbOnly.length === 0) {
    console.log("   No DB-only skills to clean up.");
    return;
  }

  // Classify DB-only skills
  const alreadyDeprecated = [];
  const toDeprecate = [];

  for (const slug of dbOnly) {
    const current = dbSkills[slug];
    if (current.status === "deprecated" || current.status === "deleted") {
      alreadyDeprecated.push(slug);
    } else {
      toDeprecate.push({ slug, currentStatus: current.status });
    }
  }

  if (alreadyDeprecated.length > 0) {
    console.log(`   Already deprecated/deleted: ${alreadyDeprecated.length}`);
  }

  if (toDeprecate.length === 0) {
    console.log("   No active DB-only skills need status change.");
    return;
  }

  console.log(`   Will mark ${toDeprecate.length} active DB-only skills as deprecated:`);
  for (const { slug, currentStatus } of toDeprecate) {
    console.log(`     ${slug} (was: ${currentStatus})`);
  }

  if (dryRun) {
    console.log(`   [dry-run] Would deprecate ${toDeprecate.length} skills`);
    return;
  }

  const slugs = toDeprecate.map((s) => s.slug);
  const now = new Date().toISOString();

  // Batch update: set status=deprecated, add work_notes explaining why
  const BATCH_SIZE = 50;
  let total = 0;

  for (let i = 0; i < slugs.length; i += BATCH_SIZE) {
    const batch = slugs.slice(i, i + BATCH_SIZE);
    for (const slug of batch) {
      const existing = dbSkills[slug];
      const note = existing.work_notes
        ? `${existing.work_notes}\n[sync ${now}] Auto-deprecated: no SKILL.md file found`
        : `[sync ${now}] Auto-deprecated: no SKILL.md file found`;

      const { error } = await supabase
        .from("skills")
        .update({ status: "deprecated", work_notes: note })
        .eq("slug", slug);

      if (error) {
        console.error(`   Failed to deprecate ${slug}: ${error.message}`);
      } else {
        total++;
      }
    }
  }

  console.log(`   Deprecated ${total}/${toDeprecate.length} DB-only skills`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Skill Sync: _skills/ -> registry.json -> Supabase");
  console.log(`Skills dir: ${SKILLS_DIR}`);
  if (dryRun) console.log("DRY RUN -- no changes will be made\n");

  // Step 1: Scan files
  console.log("\n1. Scanning _skills/{slug}/SKILL.md...");
  const fileSkills = scanSkillsFromFiles();
  console.log(`   Found ${Object.keys(fileSkills).length} skills in files`);

  // Step 2: Fetch current Supabase state
  console.log("\n2. Fetching Supabase state...");
  const dbSkills = await fetchSupabaseSkills();
  console.log(`   Found ${Object.keys(dbSkills).length} skills in Supabase`);

  // Step 3: Merge
  console.log("\n3. Merging (files own content, DB owns metadata)...");
  const { merged, stats, dbOnly } = mergeSkills(fileSkills, dbSkills);
  console.log(`   New: ${stats.created} | Updated: ${stats.updated} | Unchanged: ${stats.unchanged} | DB-only: ${stats.db_only}`);

  // Step 4: Write registry.json
  console.log("\n4. Writing registry.json...");
  writeRegistry(merged);

  // Step 5: Upsert to Supabase
  console.log("\n5. Upserting to Supabase...");
  await upsertToSupabase(fileSkills, dbSkills);

  // Step 6: Clean up DB-only skills
  console.log("\n6. Cleaning up DB-only skills (no SKILL.md)...");
  await cleanupDbOnlySkills(dbOnly, dbSkills);

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
