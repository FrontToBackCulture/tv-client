#!/usr/bin/env node
// Converts a Notion page to markdown using notion-to-md
// Usage: node notion-to-md.mjs <page_id> <api_key>
// Outputs markdown to stdout

import { Client } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";

const [pageId, apiKey] = process.argv.slice(2);

if (!pageId || !apiKey) {
  console.error("Usage: node notion-to-md.mjs <page_id> <api_key>");
  process.exit(1);
}

const notion = new Client({ auth: apiKey });
const n2m = new NotionToMarkdown({ notionClient: notion });

try {
  const mdBlocks = await n2m.pageToMarkdown(pageId);
  const mdString = n2m.toMarkdownString(mdBlocks);
  // mdString is Record<string, string> — the main page content is under the page key or "parent"
  const content = mdString.parent || Object.values(mdString).join("\n\n");
  process.stdout.write(content);
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
}
