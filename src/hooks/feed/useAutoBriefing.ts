// Auto-briefing: generates feed cards from real system activity.
// Runs on app load and every 4 hours. Idempotent via source_ref dedup.

import { useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import type { FeedCard } from "../../lib/feed/types";
import { useQueryClient } from "@tanstack/react-query";
import { feedKeys } from "./keys";
import { getWhatsNew, fetchWhatsNewNotes } from "../useAppUpdate";
import { workspaceLocalStorage } from "../../lib/workspaceScopedStorage";

const INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const LAST_RUN_KEY = "tv-auto-briefing-last-run";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function isMonday(): boolean {
  return new Date().getDay() === 1;
}

function weekNumber(): number {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = d.getTime() - start.getTime();
  return Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
}

/** Check if a card with this source_ref already exists */
async function cardExists(sourceRef: string): Promise<boolean> {
  const { data } = await supabase
    .from("feed_cards")
    .select("id")
    .eq("source_ref", sourceRef)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/** Create a feed card, returns true if created */
async function createCard(
  card: Omit<FeedCard, "id" | "created_at" | "updated_at" | "archived" | "series_id" | "series_order">
): Promise<boolean> {
  // Dedup
  if (card.source_ref && (await cardExists(card.source_ref))) {
    return false;
  }

  const { error } = await supabase.from("feed_cards").insert({
    ...card,
    archived: false,
    series_id: null,
    series_order: 0,
  });

  if (error) {
    console.warn("[auto-briefing] Failed to create card:", error.message, card.title);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Source generators
// ---------------------------------------------------------------------------

interface CardCandidate {
  card_type: FeedCard["card_type"];
  category: FeedCard["category"];
  badge: string;
  title: string;
  body: string;
  source: string;
  source_detail?: string | null;
  source_ref: string;
  pinned?: boolean;
  stats?: { label: string; value: string }[] | null;
  features?: string[] | null;
  triggers?: string[] | null;
  chips?: string[] | null;
  author?: { initials: string; name: string; role: string } | null;
  cta_label?: string | null;
  cta_action?: string | null;
  visual?: string | null;
  scheduled_date?: string | null;
  created_by?: string | null;
}

/** CRM deal stage changes in the last 24h */
async function getDealStageChanges(since: string): Promise<CardCandidate[]> {
  const { data: activities } = await supabase
    .from("crm_activities")
    .select("*, company:crm_companies(name)")
    .eq("type", "stage_change")
    .gte("activity_date", since)
    .order("activity_date", { ascending: false })
    .limit(10);

  if (!activities || activities.length === 0) return [];

  const cards: CardCandidate[] = [];

  for (const act of activities) {
    const companyName = (act.company as { name: string } | null)?.name ?? "Unknown";
    const description = act.description || "";

    // Parse stage from description (format: "Stage changed to {stage}" or similar)
    const stageMatch = description.match(/(?:to|→)\s*(\w+)/i);
    const newStage = stageMatch?.[1] ?? "";

    let badge = "Deal Movement";
    let pinned = false;

    const stageLower = newStage.toLowerCase();
    if (stageLower === "won") {
      badge = "Deal Won";
      pinned = true;
    } else if (stageLower === "lost") {
      badge = "Deal Lost";
    } else if (["proposal", "negotiation"].includes(stageLower)) {
      badge = "Deal Advancing";
    }

    const sourceRef = `auto:deal-stage:${act.id}`;
    cards.push({
      card_type: "feature",
      category: "event",
      badge,
      title: `${companyName} → ${newStage || "updated"}`,
      body: description || `Deal stage updated for ${companyName}`,
      source: "CRM Pipeline",
      source_ref: sourceRef,
      pinned,
      created_by: "auto-briefing",
    });
  }

  return cards.slice(0, 5);
}

/** Tasks completed in the last 24h, grouped by project */
async function getCompletedTasks(since: string): Promise<CardCandidate[]> {
  // Query tasks completed recently — use updated_at as proxy for completion time
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, project_id, project:projects(name)")
    .eq("status_type", "completed")
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (!tasks || tasks.length === 0) return [];

  // Group by project
  const byProject = new Map<string, { name: string; tasks: string[] }>();
  for (const t of tasks) {
    const pid = t.project_id;
    if (!pid) continue;
    const proj = t.project as unknown as { name: string } | null;
    const projectName = proj?.name ?? "Unknown";
    if (!byProject.has(pid)) {
      byProject.set(pid, { name: projectName, tasks: [] });
    }
    byProject.get(pid)!.tasks.push(t.title);
  }

  const cards: CardCandidate[] = [];
  for (const [pid, info] of byProject) {
    if (info.tasks.length < 2) continue; // Not worth a card for 1 task

    const sourceRef = `auto:tasks:${pid}:${todayISO()}`;
    const topTasks = info.tasks.slice(0, 3);
    const body = topTasks.map((t) => `• ${t}`).join("\n") +
      (info.tasks.length > 3 ? `\n• ...and ${info.tasks.length - 3} more` : "");

    cards.push({
      card_type: "team",
      category: "event",
      badge: "Tasks Done",
      title: `${info.tasks.length} tasks completed in ${info.name}`,
      body,
      source: "Work Updates",
      source_detail: info.name,
      source_ref: sourceRef,
      stats: [
        { label: "Completed", value: String(info.tasks.length) },
        { label: "Project", value: info.name },
      ],
      created_by: "auto-briefing",
    });
  }

  return cards.slice(0, 3);
}

/** Weekly pipeline snapshot (Mondays only) */
async function getPipelineSnapshot(): Promise<CardCandidate[]> {
  if (!isMonday()) return [];

  const sourceRef = `auto:pipeline-weekly:${new Date().getFullYear()}-W${weekNumber()}`;

  // Fetch active deals
  const { data: deals } = await supabase
    .from("projects")
    .select("id, name, stage, deal_value")
    .eq("project_type", "deal")
    .not("stage", "in", '("won","lost")')
    .eq("archived_at", null);

  if (!deals || deals.length === 0) return [];

  const totalValue = deals.reduce((s, d) => s + ((d as { deal_value?: number }).deal_value || 0), 0);

  // Simple weighted calculation
  const weights: Record<string, number> = {
    target: 0.05, prospect: 0.1, lead: 0.2, qualified: 0.3,
    pilot: 0.5, proposal: 0.6, negotiation: 0.8,
  };
  const weighted = deals.reduce((s, d) => {
    const w = weights[(d as { stage?: string }).stage || ""] || 0;
    return s + ((d as { deal_value?: number }).deal_value || 0) * w;
  }, 0);

  // Stage distribution for body
  const stageCounts = new Map<string, number>();
  for (const d of deals) {
    const stage = (d as { stage?: string }).stage || "unknown";
    stageCounts.set(stage, (stageCounts.get(stage) || 0) + 1);
  }
  const body = [...stageCounts.entries()]
    .map(([stage, count]) => `${stage}: ${count}`)
    .join(" | ");

  return [{
    card_type: "platform",
    category: "event",
    badge: "Pipeline Health",
    title: `Weekly Pipeline: $${Math.round(weighted / 1000)}K weighted`,
    body: `${deals.length} active deals — ${body}`,
    source: "CRM Pipeline",
    source_ref: sourceRef,
    pinned: true,
    stats: [
      { label: "Deals", value: String(deals.length) },
      { label: "Total", value: `$${Math.round(totalValue / 1000)}K` },
      { label: "Weighted", value: `$${Math.round(weighted / 1000)}K` },
    ],
    created_by: "auto-briefing",
  }];
}

/** App version release — creates a card for the current version if none exists.
 *  On version change (getWhatsNew), uses stored notes. Otherwise fetches from GitHub. */
async function getVersionRelease(): Promise<CardCandidate[]> {
  const version = __APP_VERSION__;
  const sourceRef = `release:tv-client:${version}`;

  // Already have a card for this version — nothing to do
  if (await cardExists(sourceRef)) return [];

  // Try stored "what's new" data first (set by updater on version change)
  const whatsNew = getWhatsNew();
  let notes = whatsNew?.notes || "";

  // No stored notes — fetch from GitHub for the current version
  if (!notes) {
    const fetched = await fetchWhatsNewNotes();
    if (fetched) notes = fetched;
  }

  // Parse features from markdown bullet points
  const features = notes
    ? notes
        .split("\n")
        .filter((l) => l.match(/^[-*]\s/))
        .map((l) => l.replace(/^[-*]\s+/, "").trim())
        .slice(0, 6)
    : null;

  const body = notes
    ? notes.split("\n").filter((l) => !l.match(/^[-*#]\s/) && l.trim()).slice(0, 2).join(" ") ||
      `TV Desktop ${version} is now running.`
    : `TV Desktop ${version} is now running.`;

  return [{
    card_type: "release",
    category: "event",
    badge: "New Version",
    title: `TV Desktop ${version}`,
    body,
    source: "tv-client",
    source_detail: "Release",
    source_ref: sourceRef,
    pinned: true,
    features: features && features.length > 0 ? features : null,
    stats: [{ label: "Version", value: version }],
    created_by: "auto-briefing",
  }];
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

async function runAutoBriefing(queryClient: ReturnType<typeof useQueryClient>): Promise<void> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Gather candidates from all sources in parallel
  const [dealCards, taskCards, pipelineCards, releaseCards] = await Promise.allSettled([
    getDealStageChanges(since),
    getCompletedTasks(since),
    getPipelineSnapshot(),
    getVersionRelease(),
  ]);

  const candidates: CardCandidate[] = [
    ...(releaseCards.status === "fulfilled" ? releaseCards.value : []),
    ...(dealCards.status === "fulfilled" ? dealCards.value : []),
    ...(taskCards.status === "fulfilled" ? taskCards.value : []),
    ...(pipelineCards.status === "fulfilled" ? pipelineCards.value : []),
  ];

  if (candidates.length === 0) {
    console.log("[auto-briefing] No new activity found");
    return;
  }

  let created = 0;
  for (const card of candidates) {
    const ok = await createCard({
      card_type: card.card_type,
      category: card.category,
      badge: card.badge,
      title: card.title,
      body: card.body,
      source: card.source,
      source_detail: card.source_detail ?? null,
      source_ref: card.source_ref,
      pinned: card.pinned ?? false,
      stats: card.stats ?? null,
      features: card.features ?? null,
      triggers: card.triggers ?? null,
      chips: card.chips ?? null,
      author: card.author ?? null,
      cta_label: card.cta_label ?? null,
      cta_action: card.cta_action ?? null,
      visual: card.visual ?? null,
      scheduled_date: card.scheduled_date ?? null,
      created_by: card.created_by ?? "auto-briefing",
    });
    if (ok) created++;
  }

  if (created > 0) {
    console.log(`[auto-briefing] Created ${created} feed cards`);
    // Invalidate feed queries so the UI picks up new cards
    queryClient.invalidateQueries({ queryKey: feedKeys.cards() });
  } else {
    console.log("[auto-briefing] All cards were duplicates, nothing new created");
  }

  // Record last run
  workspaceLocalStorage.set(LAST_RUN_KEY, new Date().toISOString());
}

// ---------------------------------------------------------------------------
// Hook — mount this once at app root level
// ---------------------------------------------------------------------------

/** Manually trigger the briefing pipeline. Returns number of cards created. */
export async function triggerBriefing(queryClient: ReturnType<typeof useQueryClient>): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [dealCards, taskCards, pipelineCards, releaseCards] = await Promise.allSettled([
    getDealStageChanges(since),
    getCompletedTasks(since),
    getPipelineSnapshot(),
    getVersionRelease(),
  ]);

  const candidates: CardCandidate[] = [
    ...(releaseCards.status === "fulfilled" ? releaseCards.value : []),
    ...(dealCards.status === "fulfilled" ? dealCards.value : []),
    ...(taskCards.status === "fulfilled" ? taskCards.value : []),
    ...(pipelineCards.status === "fulfilled" ? pipelineCards.value : []),
  ];

  let created = 0;
  for (const card of candidates) {
    const ok = await createCard({
      card_type: card.card_type,
      category: card.category,
      badge: card.badge,
      title: card.title,
      body: card.body,
      source: card.source,
      source_detail: card.source_detail ?? null,
      source_ref: card.source_ref,
      pinned: card.pinned ?? false,
      stats: card.stats ?? null,
      features: card.features ?? null,
      triggers: card.triggers ?? null,
      chips: card.chips ?? null,
      author: card.author ?? null,
      cta_label: card.cta_label ?? null,
      cta_action: card.cta_action ?? null,
      visual: card.visual ?? null,
      scheduled_date: card.scheduled_date ?? null,
      created_by: card.created_by ?? "auto-briefing",
    });
    if (ok) created++;
  }

  if (created > 0) {
    queryClient.invalidateQueries({ queryKey: feedKeys.cards() });
  }
  workspaceLocalStorage.set(LAST_RUN_KEY, new Date().toISOString());
  return created;
}

export function useAutoBriefing() {
  const queryClient = useQueryClient();
  const ranRef = useRef(false);

  useEffect(() => {
    if (!ranRef.current) {
      ranRef.current = true;

      const lastRun = workspaceLocalStorage.get(LAST_RUN_KEY);
      const shouldRun = !lastRun || Date.now() - new Date(lastRun).getTime() > INTERVAL_MS;

      if (shouldRun) {
        const timer = setTimeout(() => {
          runAutoBriefing(queryClient).catch((err) => {
            console.warn("[auto-briefing] Error:", err);
          });
        }, 5000);
        return () => clearTimeout(timer);
      }
    }
  }, [queryClient]);

  useEffect(() => {
    const interval = setInterval(() => {
      runAutoBriefing(queryClient).catch((err) => {
        console.warn("[auto-briefing] Interval error:", err);
      });
    }, INTERVAL_MS);

    return () => clearInterval(interval);
  }, [queryClient]);
}
