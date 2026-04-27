// Loads a bot's CLAUDE.md from disk so it can be fed to the Agent SDK as the
// system prompt body. Cached for 60s — edit a CLAUDE.md and the next chat
// picks it up without restarting tv-client.
//
// Both a hook (for components) and a plain async helper (for non-React code
// like botMentionHandler) are exported.

import { useQuery } from "@tanstack/react-query";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { resolveBotPath, type BotName, type BotPathInputs } from "../../lib/botRouting";

export interface BotInstructions {
  bot: BotName;
  path: string | null;
  /** Raw CLAUDE.md content. Empty string if file missing or unreadable. */
  content: string;
  /** True if we found and read a file, false on miss/error. */
  found: boolean;
}

const STALE_MS = 60_000;

async function loadBotInstructions(
  bot: BotName,
  inputs: BotPathInputs,
): Promise<BotInstructions> {
  const path = resolveBotPath(bot, inputs);
  if (!path) {
    return { bot, path: null, content: "", found: false };
  }
  try {
    const content = await readTextFile(path);
    return { bot, path, content, found: true };
  } catch (e) {
    // Missing file is expected if a user hasn't set up that bot's folder yet.
    console.warn(`[botInstructions] could not read ${path}:`, e);
    return { bot, path, content: "", found: false };
  }
}

export { loadBotInstructions };

/** Hook variant — components that want to display "which CLAUDE.md is loaded". */
export function useBotInstructions(bot: BotName, inputs: BotPathInputs) {
  return useQuery({
    queryKey: ["bot-instructions", bot, inputs.knowledgeRoot, inputs.teamFolder],
    queryFn: () => loadBotInstructions(bot, inputs),
    staleTime: STALE_MS,
    enabled: !!inputs.knowledgeRoot,
  });
}
