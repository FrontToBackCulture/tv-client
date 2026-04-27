// Per-thread bot overrides — when a user picks a non-default bot for a chat
// via the New Agent picker, we stash {entity_id → bot} in localStorage so
// botMentionHandler routes to that bot instead of the routing-rule default.
//
// Keyed by entity_id (the full discussion.entity_id string, e.g.
// "entity-chat:project:abc123") so it survives across sessions.

import type { BotName } from "./botRouting";

const STORAGE_KEY = "tv-client-bot-overrides";

function readAll(): Record<string, BotName> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, BotName>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota exceeded or storage disabled — silently no-op.
  }
}

export function getBotOverride(entityId: string): BotName | null {
  return readAll()[entityId] ?? null;
}

export function setBotOverride(entityId: string, bot: BotName): void {
  const all = readAll();
  all[entityId] = bot;
  writeAll(all);
}

export function clearBotOverride(entityId: string): void {
  const all = readAll();
  if (entityId in all) {
    delete all[entityId];
    writeAll(all);
  }
}

export function getAllBotOverrides(): Record<string, BotName> {
  return readAll();
}
