// Token utilities for email campaigns
// Scans HTML templates for {{...}} tokens and classifies them as system or custom.

/** Tokens that are auto-populated at send time — not editable by the user */
export const SYSTEM_TOKENS = new Set([
  "first_name",
  "subject",
  "unsubscribe_url",
]);

/** Extract all unique {{token_name}} patterns from HTML */
export function extractTokens(html: string): string[] {
  const matches = html.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g);
  const seen = new Set<string>();
  for (const m of matches) seen.add(m[1]);
  return Array.from(seen);
}

/** Split tokens into system (auto-populated, read-only) and custom (user-editable) */
export function classifyTokens(tokens: string[]): {
  system: string[];
  custom: string[];
} {
  const system: string[] = [];
  const custom: string[] = [];
  for (const t of tokens) {
    if (SYSTEM_TOKENS.has(t)) system.push(t);
    else custom.push(t);
  }
  return { system, custom };
}

/** Replace all tokens in HTML with values from system + custom maps */
export function applyTokens(
  html: string,
  systemValues: Record<string, string>,
  customValues: Record<string, string>
): string {
  let result = html;
  // System tokens first (cannot be overridden by custom)
  for (const [key, val] of Object.entries(systemValues)) {
    result = result.split(`{{${key}}}`).join(val);
  }
  // Custom tokens
  for (const [key, val] of Object.entries(customValues)) {
    if (!SYSTEM_TOKENS.has(key)) {
      result = result.split(`{{${key}}}`).join(val);
    }
  }
  return result;
}
