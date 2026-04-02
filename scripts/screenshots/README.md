---
title: "Screenshot Capture Scripts"
summary: "Playwright scripts to capture VAL screenshots for guides and emails"
created: 2026-04-01
updated: 2026-04-01
author: "bot-mel"
tags: [playwright, screenshots, guides]
status: published
category: tooling
ai_generated: true
last_reviewed: 2026-04-01
reviewed_by: "melvin"
---

# Screenshot Capture

Automated screenshot capture from VAL domains using Playwright. Used to generate images for customer guides, onboarding emails, and documentation.

## Setup

Playwright is a dev dependency of tv-client:

```bash
npx playwright install chromium  # one-time browser install
```

## Usage

```bash
# Capture all screenshots from tryval
node scripts/screenshots/capture.mjs tryval

# Specific preset
node scripts/screenshots/capture.mjs tryval --preset mcp-guide

# Custom output directory
node scripts/screenshots/capture.mjs jlm --preset chat-intro --output /tmp/screenshots
```

## Presets

| Preset | Screenshots | Used by |
|--------|------------|---------|
| `mcp-guide` | Landing page, sidebar, Settings > Integrations | Claude MCP Connect guide |
| `chat-intro` | Landing page, chat full, chat welcome (cropped) | VAL Agent guide, onboarding emails |
| `all` | Everything above | Full refresh |

## Output

Default output: `tv-website/public/images/guides/` (served at `/images/guides/` on the website).

## Adding Presets

Edit `capture.mjs` and add a new entry to the `PRESETS` object. Each preset is an async function receiving `(page, baseUrl, outputDir)`.

## Credentials

Loaded from `val-credentials.env` (managed by tv-client settings). Each domain has `VAL_DOMAIN_{DOMAIN}_EMAIL` and `VAL_DOMAIN_{DOMAIN}_PASSWORD`.
