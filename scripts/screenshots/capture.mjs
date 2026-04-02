#!/usr/bin/env node

/**
 * VAL Screenshot Capture
 *
 * Takes screenshots from a VAL domain for use in guides, emails, and docs.
 * Credentials are loaded from the val-credentials.env file managed by tv-client.
 *
 * Usage:
 *   node scripts/screenshots/capture.mjs <domain> [--preset <name>] [--output <dir>]
 *
 * Examples:
 *   node scripts/screenshots/capture.mjs tryval --preset mcp-guide
 *   node scripts/screenshots/capture.mjs jlm --preset chat-intro
 *   node scripts/screenshots/capture.mjs tryval --preset all
 *
 * Presets define which pages/actions to screenshot. Add new presets in the
 * PRESETS object below.
 */

import { chromium } from "playwright";
import { mkdirSync, readFileSync, existsSync, writeFileSync, statSync } from "fs";
import { resolve, join } from "path";
import { homedir } from "os";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CREDENTIALS_PATH = join(
  homedir(),
  "Library/CloudStorage/Dropbox-Thinkval/ThinkVAL team folder/SkyNet/tv-knowledge/_team/melvin/working/confidential/val-credentials.env"
);

const DEFAULT_OUTPUT = resolve("../tv-website/public/images/guides");
const VIEWPORT = { width: 1440, height: 900 };
const SCALE = 2; // Retina screenshots

// ---------------------------------------------------------------------------
// Credential loader
// ---------------------------------------------------------------------------

function loadCredentials(domain) {
  if (!existsSync(CREDENTIALS_PATH)) {
    console.error(`Credentials file not found: ${CREDENTIALS_PATH}`);
    process.exit(1);
  }
  const env = readFileSync(CREDENTIALS_PATH, "utf-8");
  const key = domain.toUpperCase();
  const emailMatch = env.match(new RegExp(`VAL_DOMAIN_${key}_EMAIL=(.+)`));
  const passMatch = env.match(new RegExp(`VAL_DOMAIN_${key}_PASSWORD=(.+)`));
  if (!emailMatch || !passMatch) {
    console.error(`No credentials found for domain: ${domain}`);
    process.exit(1);
  }
  return { email: emailMatch[1].trim(), password: passMatch[1].trim() };
}

// ---------------------------------------------------------------------------
// Login helper
// ---------------------------------------------------------------------------

async function login(page, baseUrl, email, password) {
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector("input", { timeout: 10000 });
  await page.waitForTimeout(2000);
  const inputs = await page.$$("input");
  await inputs[0].fill(email);
  await inputs[1].fill(password);
  await page.click('button:has-text("SIGN IN")');
  await page.waitForURL((url) => !url.toString().includes("/login"), {
    timeout: 30000,
  });
  await page.waitForTimeout(5000);
  console.log("  Logged in:", page.url());
}

// ---------------------------------------------------------------------------
// Screenshot presets
// ---------------------------------------------------------------------------

// Preset metadata — describes what each preset captures and how.
// This is written into manifest.json so the Guides module can display it.
const PRESET_META = {
  "mcp-guide": {
    description: "Screenshots for the Claude MCP Connect guide",
    outputs: [
      { file: "val-landing.png", label: "Landing page with sidebar and Ask Val bar", steps: ["Navigate to /landingpage", "Wait for page load", "Full page screenshot"] },
      { file: "val-sidebar.png", label: "Sidebar showing navigation icons and gear icon", steps: ["Crop sidebar area (x:0 y:0 w:68 h:900) from landing page"] },
      { file: "val-settings-integrations.png", label: "Settings modal — Integrations tab with MCP Connector URL", steps: ["Dispatch val:open-settings event with tab='Integrations'", "Wait 3s for modal render", "Full page screenshot"] },
    ],
  },
  "chat-intro": {
    description: "Screenshots for the VAL Agent getting started guide",
    outputs: [
      { file: "val-landing.png", label: "Landing page with Ask Val bar and quick actions", steps: ["Navigate to /landingpage", "Wait for page load", "Full page screenshot"] },
      { file: "val-chat-full.png", label: "Chat page — full view with sidebar", steps: ["Navigate to /chat", "Wait for page load", "Full page screenshot"] },
      { file: "val-chat-welcome.png", label: "Chat page — welcome area with input and quick action buttons", steps: ["Crop center area (x:68 y:150 w:1300 h:550) from chat page"] },
    ],
  },
  "password-reset": {
    description: "Screenshots for the password reset guide (no login required)",
    outputs: [
      { file: "val-login.png", label: "Login page", steps: ["Navigate to /login (no auth)", "Wait for page load", "Full page screenshot"] },
      { file: "val-forgot-password.png", label: "Forgot password page", steps: ["Navigate to /forgotPassword", "Wait for page load", "Full page screenshot"] },
    ],
  },
  all: {
    description: "All presets combined (mcp-guide + chat-intro)",
    outputs: [],
  },
};

const PRESETS = {
  "mcp-guide": async (page, baseUrl, outputDir) => {
    // Landing page
    await page.goto(`${baseUrl}/landingpage`, {
      timeout: 60000,
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(5000);
    await page.screenshot({
      path: join(outputDir, "val-landing.png"),
    });
    console.log("  val-landing.png");

    // Sidebar
    await page.screenshot({
      path: join(outputDir, "val-sidebar.png"),
      clip: { x: 0, y: 0, width: 68, height: 900 },
    });
    console.log("  val-sidebar.png");

    // Settings > Integrations
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("val:open-settings", {
          detail: { tab: "Integrations" },
        })
      );
    });
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: join(outputDir, "val-settings-integrations.png"),
    });
    console.log("  val-settings-integrations.png");
  },

  "chat-intro": async (page, baseUrl, outputDir) => {
    // Landing page
    await page.goto(`${baseUrl}/landingpage`, {
      timeout: 60000,
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(5000);
    await page.screenshot({
      path: join(outputDir, "val-landing.png"),
    });
    console.log("  val-landing.png");

    // Chat page full
    await page.goto(`${baseUrl}/chat`, {
      timeout: 60000,
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(5000);
    await page.screenshot({
      path: join(outputDir, "val-chat-full.png"),
    });
    console.log("  val-chat-full.png");

    // Chat cropped (welcome area only)
    await page.screenshot({
      path: join(outputDir, "val-chat-welcome.png"),
      clip: { x: 68, y: 150, width: 1300, height: 550 },
    });
    console.log("  val-chat-welcome.png");
  },

  "password-reset": async (page, baseUrl, outputDir) => {
    // Login page (no login needed — this is the public login screen)
    await page.goto(`${baseUrl}/login`, {
      timeout: 60000,
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: join(outputDir, "val-login.png"),
    });
    console.log("  val-login.png");

    // Forgot password page
    await page.goto(`${baseUrl}/forgotPassword`, {
      timeout: 60000,
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: join(outputDir, "val-forgot-password.png"),
    });
    console.log("  val-forgot-password.png");
  },

  all: async (page, baseUrl, outputDir) => {
    await PRESETS["mcp-guide"](page, baseUrl, outputDir);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1000);
    await PRESETS["chat-intro"](page, baseUrl, outputDir);
  },
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const domain = args[0];
if (!domain) {
  console.error("Usage: capture.mjs <domain> [--preset <name>] [--output <dir>]");
  console.error("Presets:", Object.keys(PRESETS).join(", "));
  process.exit(1);
}

const presetIdx = args.indexOf("--preset");
const presetName = presetIdx >= 0 ? args[presetIdx + 1] : "all";
const outputIdx = args.indexOf("--output");
const outputDir = outputIdx >= 0 ? resolve(args[outputIdx + 1]) : DEFAULT_OUTPUT;

if (!PRESETS[presetName]) {
  console.error(`Unknown preset: ${presetName}`);
  console.error("Available:", Object.keys(PRESETS).join(", "));
  process.exit(1);
}

const baseUrl = `https://${domain}.thinkval.io`;

// Presets that only need public (unauthenticated) pages
const PUBLIC_PRESETS = ["password-reset"];
const needsLogin = !PUBLIC_PRESETS.includes(presetName);

const creds = needsLogin ? loadCredentials(domain) : null;

console.log(`Capturing [${presetName}] from ${baseUrl} → ${outputDir}`);
mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: SCALE,
});
const page = await context.newPage();

if (needsLogin) {
  await login(page, baseUrl, creds.email, creds.password);
}
await PRESETS[presetName](page, baseUrl, outputDir);

await browser.close();

// ---------------------------------------------------------------------------
// Write manifest — merges new captures into existing manifest
// ---------------------------------------------------------------------------

const manifestPath = join(outputDir, "manifest.json");
let manifest = { updated: "", images: [], presets: {} };
if (existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    if (!manifest.presets) manifest.presets = {};
  } catch {}
}

// Always write all preset metadata so the UI knows what's available
for (const [name, meta] of Object.entries(PRESET_META)) {
  if (name === "all") continue;
  manifest.presets[name] = {
    description: meta.description,
    outputs: meta.outputs.map((o) => ({
      file: o.file,
      label: o.label,
      steps: o.steps,
    })),
  };
}

// Build a map of existing entries by filename for merging
const existing = new Map(manifest.images.map((img) => [img.file, img]));

// Get metadata for the preset that ran
const meta = PRESET_META[presetName];
if (meta && meta.outputs.length > 0) {
  for (const output of meta.outputs) {
    const filePath = join(outputDir, output.file);
    let size = 0;
    try {
      size = statSync(filePath).size;
    } catch {}
    existing.set(output.file, {
      file: output.file,
      label: output.label,
      preset: presetName,
      domain: domain,
      steps: output.steps,
      size,
      captured: new Date().toISOString().split("T")[0],
    });
  }
} else if (presetName === "all") {
  // "all" combines other presets — merge their metadata
  for (const [name, pmeta] of Object.entries(PRESET_META)) {
    if (name === "all") continue;
    for (const output of pmeta.outputs) {
      const filePath = join(outputDir, output.file);
      let size = 0;
      try {
        size = statSync(filePath).size;
      } catch {}
      existing.set(output.file, {
        file: output.file,
        label: output.label,
        preset: name,
        domain: domain,
        steps: output.steps,
        size,
        captured: new Date().toISOString().split("T")[0],
      });
    }
  }
}

manifest.updated = new Date().toISOString();
manifest.images = Array.from(existing.values()).sort((a, b) =>
  a.file.localeCompare(b.file)
);
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`Manifest updated: ${manifest.images.length} images tracked`);

console.log("Done!");
