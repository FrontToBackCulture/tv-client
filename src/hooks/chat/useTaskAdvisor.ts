// useTaskAdvisor — hook that mounts DIO automation scheduling + bot mention subscription
// Split into focused modules:
//   dioTypes.ts          — types, constants, defaults
//   gatherContext.ts     — data gathering (tasks, deals, emails, projects, calendar)
//   dioAutomation.ts     — scheduling, message composition, thread posting
//   botMentionHandler.ts — @bot-* mention handling via Claude Code

import { useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUserId, useUsers } from "../work/useUsers";
import { loadDioAutomations, runDioAutomation, isWithinActiveHours, isDue } from "./dioAutomation";
import { handleBotMention } from "./botMentionHandler";

// Re-export everything consumers need
export type { DioAutomation, DioAutomationInput, DioSources, PostMode } from "./dioTypes";
export {
  DEFAULT_MODEL,
  DEFAULT_SOURCES,
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_THREAD_TITLE_NEW,
  DEFAULT_THREAD_TITLE_SAME,
  SOURCE_OPTIONS,
  MODEL_OPTIONS,
} from "./dioTypes";
export { loadDioAutomations, triggerDioAutomation, triggerTaskAdvisor } from "./dioAutomation";

const CHECK_INTERVAL_MS = 60_000;
const BOT_MENTION_RE = /@(bot-\w+)\b/i;

export function useTaskAdvisor() {
  const queryClient = useQueryClient();
  const userId = useCurrentUserId();
  const { data: allUsers = [] } = useUsers();
  const userName = allUsers.find((u) => u.id === userId)?.name || "user";
  const ranRef = useRef(false);

  // Run all due DIO automations on startup + every 60s
  useEffect(() => {
    if (!userId || !userName || userName === "user") return;

    async function checkAndRunAll() {
      try {
        const automations = await loadDioAutomations();
        for (const auto of automations) {
          if (!auto.enabled) continue;
          if (!isWithinActiveHours(auto)) continue;
          if (!isDue(auto)) continue;
          await runDioAutomation(auto, queryClient, userId!, userName);
        }
        queryClient.invalidateQueries({ queryKey: ["dio-automations"] });
      } catch (err) {
        console.warn("[dio] Check failed:", err);
      }
    }

    // Startup check (once, after 8s delay)
    let startupTimer: ReturnType<typeof setTimeout> | null = null;
    if (!ranRef.current) {
      ranRef.current = true;
      startupTimer = setTimeout(checkAndRunAll, 8000);
    }

    const interval = setInterval(checkAndRunAll, CHECK_INTERVAL_MS);

    return () => {
      if (startupTimer) clearTimeout(startupTimer);
      clearInterval(interval);
    };
  }, [queryClient, userId, userName]);

  // Bot mention handler — subscribe to new discussions that @mention any bot
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel("bot-mentions")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "discussions",
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            entity_type: string;
            entity_id: string;
            author: string;
            body: string;
            parent_id: string | null;
            attachments: string[] | null;
          };

          // Skip messages from any bot
          if (/^bot-/i.test(row.author)) return;

          // Only respond when explicitly @mentioned
          const botMatch = row.body.match(BOT_MENTION_RE);
          if (!botMatch) return;

          const mentionedBot = botMatch[1].toLowerCase();

          handleBotMention(
            { ...row, attachments: row.attachments || [] },
            userId,
            queryClientRef.current,
            mentionedBot
          ).catch((err) => {
            console.error(`[${mentionedBot}] Handler error:`, err);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);
}
