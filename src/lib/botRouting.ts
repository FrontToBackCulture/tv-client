// Maps the user's currently-selected entity (or active module) to a specific
// bot, then resolves where that bot's CLAUDE.md lives on disk.
//
// To add or change a route: edit BOT_ROUTING below — first matching rule wins.
// To override a bot's path on a non-standard layout: drop a JSON file at
// `~/.tv-client/bot-paths.json` of shape { "bot-name": "/abs/path/to/CLAUDE.md" }.

import type { EntityType } from "../stores/selectedEntityStore";

export type BotName =
  | "bot-mel"
  | "bot-delivery"
  | "bot-sales"
  | "bot-domain"
  | "bot-builder";

/** Every bot the UI can route to. Used by Settings to render rows. */
export const ALL_BOTS: BotName[] = [
  "bot-mel",
  "bot-delivery",
  "bot-sales",
  "bot-domain",
  "bot-builder",
];

interface EntityMatch {
  entityType: EntityType;
  /** Optional disambiguator — e.g. tasks: "deal" vs "work" parent */
  subtype?: string;
}

interface ModuleMatch {
  module: string;
}

interface Rule {
  match: EntityMatch | ModuleMatch;
  bot: BotName;
}

/**
 * JSON-friendly version of Rule used by the Settings UI and store. The store
 * persists overrides in this shape; we convert to the discriminated `Rule`
 * type when matching.
 */
export interface SerializedRule {
  match:
    | { kind: "entity"; entityType: string; subtype?: string }
    | { kind: "module"; module: string };
  bot: BotName;
}

// Order matters — first match wins.
export const BOT_ROUTING: Rule[] = [
  // Tasks routed by parent project type (subtype set in useSelectedEntity).
  // Default to bot-delivery when subtype isn't loaded yet — avoids flickering
  // through bot-mel on the initial render before the parent project_type
  // fetch resolves. Once subtype arrives the more specific rule takes over.
  { match: { entityType: "task", subtype: "deal" }, bot: "bot-sales" },
  { match: { entityType: "task", subtype: "work" }, bot: "bot-delivery" },
  { match: { entityType: "task" }, bot: "bot-delivery" },

  // Direct entity types.
  { match: { entityType: "deal" }, bot: "bot-sales" },
  { match: { entityType: "project" }, bot: "bot-delivery" },
  { match: { entityType: "initiative" }, bot: "bot-delivery" },
  { match: { entityType: "company" }, bot: "bot-sales" },
  { match: { entityType: "contact" }, bot: "bot-sales" },
  { match: { entityType: "domain" }, bot: "bot-domain" },
  { match: { entityType: "skill" }, bot: "bot-builder" },
  { match: { entityType: "mcp_tool" }, bot: "bot-builder" },
  { match: { entityType: "blog_article" }, bot: "bot-mel" },

  // Module-level fallbacks (no specific entity selected).
  { match: { module: "projects" }, bot: "bot-delivery" },
  { match: { module: "work" }, bot: "bot-delivery" },
  { match: { module: "crm" }, bot: "bot-sales" },
  { match: { module: "companies" }, bot: "bot-sales" },
  { match: { module: "contacts" }, bot: "bot-sales" },
  { match: { module: "email" }, bot: "bot-sales" },
  { match: { module: "domains" }, bot: "bot-domain" },
  { match: { module: "skills" }, bot: "bot-builder" },
  { match: { module: "mcp-tools" }, bot: "bot-builder" },
];

export const FALLBACK_BOT: BotName = "bot-mel";

export interface ScopeInput {
  entityType: EntityType;
  /** For type === "module", the moduleId (e.g. "crm"). Else the entity id. */
  id: string;
  subtype?: string;
}

/**
 * Walk a rule table top-to-bottom, return the first matching bot AND the
 * rule index that matched (or -1 for fallback). Useful for the Settings UI
 * to highlight which rule the current scope hits.
 */
export function matchRoutingRule(
  scope: ScopeInput,
  overrides?: SerializedRule[] | null,
): { bot: BotName; ruleIndex: number; isFallback: boolean } {
  if (overrides && overrides.length > 0) {
    for (let i = 0; i < overrides.length; i++) {
      const rule = overrides[i];
      if (rule.match.kind === "module") {
        if (scope.entityType === "module" && scope.id === rule.match.module) {
          return { bot: rule.bot, ruleIndex: i, isFallback: false };
        }
        continue;
      }
      if (rule.match.entityType !== scope.entityType) continue;
      if (rule.match.subtype !== undefined && rule.match.subtype !== scope.subtype) continue;
      return { bot: rule.bot, ruleIndex: i, isFallback: false };
    }
    return { bot: FALLBACK_BOT, ruleIndex: -1, isFallback: true };
  }
  for (let i = 0; i < BOT_ROUTING.length; i++) {
    const rule = BOT_ROUTING[i];
    if ("module" in rule.match) {
      if (scope.entityType === "module" && scope.id === rule.match.module) {
        return { bot: rule.bot, ruleIndex: i, isFallback: false };
      }
      continue;
    }
    if (rule.match.entityType !== scope.entityType) continue;
    if (rule.match.subtype !== undefined && rule.match.subtype !== scope.subtype) continue;
    return { bot: rule.bot, ruleIndex: i, isFallback: false };
  }
  return { bot: FALLBACK_BOT, ruleIndex: -1, isFallback: true };
}

/** Walk a rule table top-to-bottom, return the first matching bot. */
export function resolveBot(scope: ScopeInput, overrides?: SerializedRule[] | null): BotName {
  // If the caller supplied overrides, use them exclusively (Settings is the
  // source of truth when configured). Otherwise fall back to baked rules.
  if (overrides && overrides.length > 0) {
    for (const rule of overrides) {
      if (rule.match.kind === "module") {
        if (scope.entityType === "module" && scope.id === rule.match.module) return rule.bot;
        continue;
      }
      if (rule.match.entityType !== scope.entityType) continue;
      if (rule.match.subtype !== undefined && rule.match.subtype !== scope.subtype) continue;
      return rule.bot;
    }
    return FALLBACK_BOT;
  }
  for (const rule of BOT_ROUTING) {
    if ("module" in rule.match) {
      if (scope.entityType === "module" && scope.id === rule.match.module) {
        return rule.bot;
      }
      continue;
    }
    if (rule.match.entityType !== scope.entityType) continue;
    if (rule.match.subtype !== undefined && rule.match.subtype !== scope.subtype) continue;
    return rule.bot;
  }
  return FALLBACK_BOT;
}

/** Baked rules in serialized form — used by Settings to seed the editor. */
export function getDefaultSerializedRules(): SerializedRule[] {
  return BOT_ROUTING.map((rule) => {
    if ("module" in rule.match) {
      return { match: { kind: "module" as const, module: rule.match.module }, bot: rule.bot };
    }
    return {
      match: {
        kind: "entity" as const,
        entityType: rule.match.entityType,
        subtype: rule.match.subtype,
      },
      bot: rule.bot,
    };
  });
}

// ---------------------------------------------------------------------------
// Path resolution
//
// Convention:
//   bot-mel   →  ${knowledgeRoot}/_team/{teamFolder}/bot-mel/CLAUDE.md
//   bot-*     →  ${knowledgeRoot}/../tv-bots/{botName}/CLAUDE.md
//
// Override:
//   ~/.tv-client/bot-paths.json
//   { "bot-mel": "/abs/path", "bot-delivery": "/abs/path", ... }
// ---------------------------------------------------------------------------

export interface BotPathInputs {
  knowledgeRoot: string;
  /** users.team_folder (e.g. "melvin"); only used for bot-mel resolution. */
  teamFolder?: string | null;
  /** Optional per-bot path overrides (from Settings). */
  overrides?: Partial<Record<BotName, string>>;
  /** Optional fleet folder override (e.g. "/abs/path/tv-bots"). Empty/null
   *  → use convention `${knowledgeRoot}/../tv-bots`. */
  fleetFolderPath?: string | null;
}

export function resolveBotPath(bot: BotName, inputs: BotPathInputs): string | null {
  const override = inputs.overrides?.[bot];
  if (override) return override;

  if (bot === "bot-mel") {
    if (!inputs.knowledgeRoot || !inputs.teamFolder) return null;
    return `${inputs.knowledgeRoot}/_team/${inputs.teamFolder}/bot-mel/CLAUDE.md`;
  }

  // Specialist fleet (delivery / sales / domain / builder).
  // Prefer explicit fleet override; else convention.
  const fleet = inputs.fleetFolderPath?.replace(/\/$/, "");
  if (fleet) return `${fleet}/${bot}/CLAUDE.md`;
  if (!inputs.knowledgeRoot) return null;
  const idx = inputs.knowledgeRoot.lastIndexOf("/");
  if (idx <= 0) return null;
  const parent = inputs.knowledgeRoot.slice(0, idx);
  return `${parent}/tv-bots/${bot}/CLAUDE.md`;
}
