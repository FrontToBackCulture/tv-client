// DIO Automation runner — schedule checks, message composition, thread posting

import { invoke } from "@tauri-apps/api/core";
import { supabase } from "../../lib/supabase";
import type { QueryClient } from "@tanstack/react-query";
import type { DioAutomation, PostMode } from "./dioTypes";
import { DEFAULT_MODEL, DEFAULT_SOURCES, DEFAULT_SYSTEM_PROMPT, DEFAULT_THREAD_TITLE_NEW, DEFAULT_THREAD_TITLE_SAME } from "./dioTypes";
import type { DioSources } from "./dioTypes";
import type { GatheredContext } from "./gatherContext";
import { gatherContext, getSGTHour } from "./gatherContext";

const BOT_AUTHOR = "bot-mel";

// ---------------------------------------------------------------------------
// Supabase CRUD
// ---------------------------------------------------------------------------

export async function loadDioAutomations(): Promise<DioAutomation[]> {
  const { data, error } = await supabase
    .from("dio_automations")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[dio] Failed to load automations:", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    ...row,
    sources: { ...DEFAULT_SOURCES, ...(row.sources as object) } as DioSources,
    post_mode: (row.post_mode === "same_thread" ? "same_thread" : "new_thread") as PostMode,
  }));
}

// ---------------------------------------------------------------------------
// Schedule helpers
// ---------------------------------------------------------------------------

function parseActiveHours(ah: string | null): { start: number; end: number } | null {
  if (!ah || !ah.includes("-")) return null;
  const [s, e] = ah.split("-").map(Number);
  if (isNaN(s) || isNaN(e)) return null;
  return { start: s, end: e };
}

export function isWithinActiveHours(automation: DioAutomation): boolean {
  const parsed = parseActiveHours(automation.active_hours);
  if (!parsed) return true;
  const h = getSGTHour();
  return h >= parsed.start && h < parsed.end;
}

export function isDue(automation: DioAutomation): boolean {
  if (!automation.last_run_at) return true;
  const elapsed = Date.now() - new Date(automation.last_run_at).getTime();
  return elapsed >= automation.interval_hours * 3600000;
}

// ---------------------------------------------------------------------------
// Message composition (Anthropic API)
// ---------------------------------------------------------------------------

async function composeMessage(
  context: GatheredContext,
  userName: string,
  systemPromptOverride?: string | null,
  model?: string,
): Promise<string | null> {
  const apiKey = await invoke<string | null>("settings_get_anthropic_key");
  if (!apiKey) {
    console.warn("[task-advisor] No Anthropic API key configured");
    return null;
  }

  if (context.sections.length <= 1) {
    return null;
  }

  const contextData = context.sections.join("\n\n---\n\n");

  const basePrompt = systemPromptOverride || DEFAULT_SYSTEM_PROMPT;
  const systemPrompt = `${basePrompt}\n\nAlways address as @${userName}.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      max_tokens: 400,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Here's your current status:\n\n${contextData}\n\nGive your check-in.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    console.error("[task-advisor] API error:", response.status);
    return null;
  }

  const data = await response.json();
  return data.content?.[0]?.text?.trim() || null;
}

// ---------------------------------------------------------------------------
// Post to discussions
// ---------------------------------------------------------------------------

function resolveThreadTitle(template: string): string {
  const now = new Date();
  const vars: Record<string, string> = {
    date: now.toLocaleDateString("en-SG", { timeZone: "Asia/Singapore", day: "numeric", month: "short", year: "numeric" }),
    time: now.toLocaleTimeString("en-SG", { timeZone: "Asia/Singapore", hour: "numeric", minute: "2-digit", hour12: true }),
    day: now.toLocaleDateString("en-SG", { timeZone: "Asia/Singapore", weekday: "long" }),
    month: now.toLocaleDateString("en-SG", { timeZone: "Asia/Singapore", month: "short", year: "numeric" }),
  };
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] || `{${key}}`);
}

async function postMessage(
  message: string,
  recipient: string,
  queryClient: QueryClient,
  postMode: PostMode,
  threadId: string,
  threadTitle: string,
  author: string = BOT_AUTHOR,
): Promise<void> {
  const resolvedTitle = resolveThreadTitle(threadTitle);

  if (postMode === "same_thread") {
    const { data: existing } = await supabase
      .from("discussions")
      .select("id")
      .eq("entity_type", "general")
      .eq("entity_id", threadId)
      .is("parent_id", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (existing) {
      const { data: reply, error } = await supabase
        .from("discussions")
        .insert({
          entity_type: "general",
          entity_id: threadId,
          author,
          body: message,
          parent_id: existing.id,
        })
        .select()
        .single();

      if (error) {
        console.error("[dio] Failed to post reply:", error.message);
        return;
      }

      const preview = message.length > 100 ? message.slice(0, 100) + "..." : message;
      await supabase.from("notifications").insert({
        recipient,
        type: "mention",
        discussion_id: reply.id,
        entity_type: "general",
        entity_id: threadId,
        actor: author,
        body_preview: preview,
      });
    } else {
      const { data: root, error } = await supabase
        .from("discussions")
        .insert({
          entity_type: "general",
          entity_id: threadId,
          author,
          body: message,
          title: resolvedTitle,
        })
        .select()
        .single();

      if (error) {
        console.error("[dio] Failed to create thread:", error.message);
        return;
      }

      const preview = message.length > 100 ? message.slice(0, 100) + "..." : message;
      await supabase.from("notifications").insert({
        recipient,
        type: "mention",
        discussion_id: root.id,
        entity_type: "general",
        entity_id: threadId,
        actor: author,
        body_preview: preview,
      });
    }
  } else {
    const entityId = `dio:${Date.now()}`;

    const { data: discussion, error } = await supabase
      .from("discussions")
      .insert({
        entity_type: "general",
        entity_id: entityId,
        author,
        body: message,
        title: resolvedTitle,
      })
      .select()
      .single();

    if (error) {
      console.error("[dio] Failed to post:", error.message);
      return;
    }

    const preview = message.length > 100 ? message.slice(0, 100) + "..." : message;
    await supabase.from("notifications").insert({
      recipient,
      type: "mention",
      discussion_id: discussion.id,
      entity_type: "general",
      entity_id: entityId,
      actor: author,
      body_preview: preview,
    });
  }

  queryClient.invalidateQueries({ queryKey: ["discussions"] });
  queryClient.invalidateQueries({ queryKey: ["chat", "threads"] });
  queryClient.invalidateQueries({ queryKey: ["notifications"] });
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runDioAutomation(
  automation: DioAutomation,
  queryClient: QueryClient,
  userId: string,
  userName: string,
): Promise<void> {
  console.log(`[dio] Running "${automation.name}"...`);

  const pm = automation.post_mode;
  const tid = automation.thread_id || `dio:${automation.id}:daily`;
  const ttl = automation.thread_title || (pm === "same_thread" ? DEFAULT_THREAD_TITLE_SAME : DEFAULT_THREAD_TITLE_NEW);

  try {
    const context = await gatherContext(userId, automation.sources);
    const message = await composeMessage(context, userName, automation.system_prompt, automation.model);

    if (!message) {
      console.log(`[dio] "${automation.name}" — nothing to report`);
    } else {
      await postMessage(message, userName, queryClient, pm, tid, ttl, automation.bot_author);
      console.log(`[dio] "${automation.name}" — posted as ${automation.bot_author}`);
    }
  } catch (err) {
    console.error(`[dio] "${automation.name}" error:`, err);
  }

  await supabase
    .from("dio_automations")
    .update({ last_run_at: new Date().toISOString() })
    .eq("id", automation.id);
}

export async function triggerDioAutomation(
  automationId: string,
  queryClient: QueryClient,
  userId: string,
  userName: string,
): Promise<void> {
  const automations = await loadDioAutomations();
  const auto = automations.find((a) => a.id === automationId);
  if (!auto) {
    console.error(`[dio] Automation ${automationId} not found`);
    return;
  }
  await runDioAutomation(auto, queryClient, userId, userName);
  queryClient.invalidateQueries({ queryKey: ["dio-automations"] });
}

export async function triggerTaskAdvisor(
  queryClient: QueryClient,
  userId: string,
  userName: string,
): Promise<void> {
  await triggerDioAutomation("task-advisor", queryClient, userId, userName);
}
