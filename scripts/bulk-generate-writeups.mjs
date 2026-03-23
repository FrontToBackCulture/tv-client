#!/usr/bin/env node
// Bulk-generate writeups for skill_library entries missing them.
// Reads HTML demo files, calls Claude API, upserts to Supabase.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";

// ── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://sabrnwuhgkqfwunbrnrt.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhYnJud3VoZ2txZnd1bmJybnJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1NTE3NTQsImV4cCI6MjA4NDEyNzc1NH0.ZPUkYRsVzrFKW5jFutm7HkauRW-mkbXPyPhix4q083k";

const settingsJson = readFileSync(
  new URL("file://" + process.env.HOME + "/.tv-desktop/settings.json")
);
const ANTHROPIC_KEY = JSON.parse(settingsJson).keys.anthropic_api_key;
if (!ANTHROPIC_KEY) {
  console.error("No Anthropic API key found");
  process.exit(1);
}

const SKILLS_DIR =
  "/Users/melvinwang/Library/CloudStorage/Dropbox-Thinkval/ThinkVAL team folder/SkyNet/tv-knowledge/_skills";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Helpers ─────────────────────────────────────────────────────────────────

function extractTextFromHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, "")
    .replace(/<canvas[^>]*>[\s\S]*?<\/canvas>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, " | ")
    .replace(/<\/th>/gi, " | ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function generateContent(skillName, htmlContent) {
  const textContent = extractTextFromHtml(htmlContent);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `You are writing website content for a data analytics platform (VAL by ThinkVAL). Given this report, generate metadata for the website library page.

Report skill name: ${skillName}

Report content (text extracted from HTML):
${textContent.slice(0, 30000)}

Return a JSON object with these fields:
- title: Clean display title for the report (short, no company names)
- description: 1-2 sentence summary of what insights this report provides (for a card view)
- writeup: 2-3 paragraph description for a detail page. Explain what the report covers, what insights it surfaces, and who benefits from it. Write for a prospect evaluating the platform.
- category: One of: delivery, analytics, workforce, reconciliation, insights, operations
- subcategory: Specific platform or domain (e.g. grab, foodpanda, seg, generic)
- metrics: Array of 3-5 key metric labels shown in the report
- sources: Array of data sources (e.g. POS, GrabFood, HR Systems)

Return ONLY the JSON object, no markdown fences.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error("Empty response");

  const jsonStr = text
    .replace(/^```json?\n?/, "")
    .replace(/\n?```$/, "")
    .trim();
  return JSON.parse(jsonStr);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Fetch all entries missing writeups
  const { data: entries, error } = await sb
    .from("skill_library")
    .select("id, skill_slug, file_name, title, writeup")
    .or("writeup.is.null,writeup.eq.");

  if (error) {
    console.error("Failed to fetch:", error);
    return;
  }

  // Filter to only HTML reports (skip _meta entries)
  const htmlEntries = entries.filter((e) => e.file_name.endsWith(".html"));
  const metaEntries = entries.filter((e) => e.file_name === "_meta");

  console.log(
    `Found ${entries.length} missing writeups (${htmlEntries.length} HTML, ${metaEntries.length} meta)`
  );
  console.log("Processing HTML reports...\n");

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const entry of htmlEntries) {
    const htmlPath = `${SKILLS_DIR}/${entry.skill_slug}/demo/${entry.file_name}`;

    if (!existsSync(htmlPath)) {
      console.log(`  SKIP ${entry.skill_slug}/${entry.file_name} — file not found`);
      skipped++;
      continue;
    }

    try {
      const html = readFileSync(htmlPath, "utf8");
      console.log(
        `  GEN  ${entry.skill_slug}/${entry.file_name}...`
      );

      const result = await generateContent(entry.title || entry.skill_slug, html);

      // Upsert to Supabase
      const { error: upsertError } = await sb
        .from("skill_library")
        .update({
          title: result.title || entry.title,
          description: result.description || null,
          writeup: result.writeup || null,
          category: result.category || "uncategorized",
          subcategory: result.subcategory || null,
          metrics: result.metrics || [],
          sources: result.sources || [],
        })
        .eq("id", entry.id);

      if (upsertError) {
        console.log(`  FAIL ${entry.skill_slug}/${entry.file_name}: ${upsertError.message}`);
        failed++;
      } else {
        console.log(
          `  OK   ${result.title} — ${result.writeup?.slice(0, 60)}...`
        );
        success++;
      }

      // Rate limit: ~0.5s between calls
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.log(
        `  FAIL ${entry.skill_slug}/${entry.file_name}: ${err.message}`
      );
      failed++;
    }
  }

  console.log(`\nDone: ${success} generated, ${skipped} skipped, ${failed} failed`);
  console.log(`${metaEntries.length} meta entries skipped (chat skills without HTML)`);
}

main().catch(console.error);
