// AI generation hook — generates description and writeup from report HTML

import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface GeneratedContent {
  title: string;
  description: string;
  writeup: string;
  category: string;
  subcategory: string;
  metrics: string[];
  sources: string[];
}

export function useGenerateReportContent() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async (
      skillName: string,
      htmlContent: string
    ): Promise<GeneratedContent | null> => {
      setIsGenerating(true);
      setError(null);

      try {
        // Get API key from Tauri settings
        const apiKey = await invoke<string | null>(
          "settings_get_anthropic_key"
        );
        if (!apiKey) {
          setError("No Anthropic API key configured. Add it in Settings.");
          return null;
        }

        // Extract text content from HTML (strip tags, keep structure)
        const textContent = extractTextFromHtml(htmlContent);

        const response = await fetch(
          "https://api.anthropic.com/v1/messages",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "anthropic-dangerous-direct-browser-access": "true",
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
          }
        );

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`API error: ${response.status} ${err}`);
        }

        const data = await response.json();
        const text = data.content?.[0]?.text;
        if (!text) throw new Error("Empty response from API");

        // Parse JSON from response (strip markdown fences if present)
        const jsonStr = text
          .replace(/^```json?\n?/, "")
          .replace(/\n?```$/, "")
          .trim();
        const result = JSON.parse(jsonStr) as GeneratedContent;
        return result;
      } catch (err: any) {
        setError(err.message || "Generation failed");
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    []
  );

  return { generate, isGenerating, error };
}

function extractTextFromHtml(html: string): string {
  // Simple text extraction — strip tags but keep structure
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
