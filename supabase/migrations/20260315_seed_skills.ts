#!/usr/bin/env npx tsx
// One-time migration: seed Supabase `skills` table from registry.json
// Run with: npx tsx supabase/migrations/20260315_seed_skills.ts

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const SUPABASE_URL = "https://sabrnwuhgkqfwunbrnrt.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhYnJud3VoZ2txZnd1bmJybnJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1NTE3NTQsImV4cCI6MjA4NDEyNzc1NH0.ZPUkYRsVzrFKW5jFutm7HkauRW-mkbXPyPhix4q083k";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface SkillCategory {
  id: string;
  label: string;
  parent?: string;
}

interface SkillEntry {
  name: string;
  description: string;
  category: string;
  target: string;
  status: string;
  command?: string;
  domain?: string;
  verified?: boolean;
  rating?: number;
  last_audited?: string;
  owner?: string;
  has_demo?: boolean;
  has_examples?: boolean;
  has_deck?: boolean;
  has_guide?: boolean;
  needs_work?: string;
  work_notes?: string;
  action?: string;
  outcome?: string;
  gallery_pinned?: boolean;
  gallery_order?: number;
  distributions?: { path: string; type: string }[];
}

interface Registry {
  categories: SkillCategory[];
  skills: Record<string, SkillEntry>;
}

function resolveCategory(categoryId: string, categories: SkillCategory[]): { category: string; subcategory: string | null } {
  if (!categoryId) return { category: "Uncategorized", subcategory: null };

  const cat = categories.find(c => c.id === categoryId);
  if (!cat) return { category: categoryId, subcategory: null };

  if (cat.parent) {
    const parent = categories.find(c => c.id === cat.parent);
    return {
      category: parent?.label ?? cat.parent,
      subcategory: cat.label,
    };
  }

  return { category: cat.label, subcategory: null };
}

async function main() {
  // Find registry.json
  const registryPath = path.resolve(
    __dirname,
    "../../../../Library/CloudStorage/Dropbox-Thinkval/ThinkVAL team folder/SkyNet/tv-knowledge/_skills/registry.json"
  );

  if (!fs.existsSync(registryPath)) {
    // Try relative path from tv-client
    const altPath = path.resolve(__dirname, "../../_skills/registry.json");
    if (!fs.existsSync(altPath)) {
      console.error("Cannot find registry.json. Please provide the path as an argument.");
      console.error("Tried:", registryPath);
      process.exit(1);
    }
  }

  const registry: Registry = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
  console.log(`Found ${Object.keys(registry.skills).length} skills, ${registry.categories.length} categories`);

  // Build rows
  const rows = Object.entries(registry.skills).map(([slug, skill]) => {
    const { category, subcategory } = resolveCategory(skill.category, registry.categories);
    return {
      slug,
      name: skill.name,
      description: skill.description || "",
      category,
      subcategory,
      target: skill.target || "platform",
      status: skill.status || "active",
      command: skill.command || null,
      domain: skill.domain || null,
      verified: skill.verified ?? false,
      owner: skill.owner || null,
      last_audited: skill.last_audited || null,
      rating: skill.rating ?? null,
      has_demo: skill.has_demo ?? false,
      has_examples: skill.has_examples ?? false,
      has_deck: skill.has_deck ?? false,
      has_guide: skill.has_guide ?? false,
      demo_uploaded: false,
      demo_url: null,
      needs_work: skill.needs_work || null,
      work_notes: skill.work_notes || null,
      action: skill.action || null,
      outcome: skill.outcome || null,
      gallery_pinned: skill.gallery_pinned ?? false,
      gallery_order: skill.gallery_order ?? null,
      distributions: JSON.stringify(skill.distributions || []),
    };
  });

  console.log(`Upserting ${rows.length} skills to Supabase...`);

  // Upsert in batches of 50
  const BATCH_SIZE = 50;
  let total = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("skills")
      .upsert(batch, { onConflict: "slug" });

    if (error) {
      console.error(`Batch ${i / BATCH_SIZE + 1} failed:`, error.message);
      // Try one by one
      for (const row of batch) {
        const { error: singleError } = await supabase
          .from("skills")
          .upsert(row, { onConflict: "slug" });
        if (singleError) {
          console.error(`  Failed: ${row.slug} — ${singleError.message}`);
        } else {
          total++;
        }
      }
    } else {
      total += batch.length;
      console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} skills upserted`);
    }
  }

  console.log(`Done. ${total}/${rows.length} skills migrated.`);
}

main().catch(console.error);
