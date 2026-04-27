// Left rail inside EntityChatModal — shows every chat-bot agent currently
// running (and recent completions), so you can monitor parallel work without
// keeping multiple modals open.
//
// Source of truth: claudeRunStore (runs are added by botMentionHandler).
// Click a row → calls setSelected so the modal rescopes to that entity.

import { useMemo, useEffect, useState } from "react";
import { Loader2, Brain, ChevronLeft, ChevronRight, Bot, Plus } from "lucide-react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { useClaudeRunStore } from "../../stores/claudeRunStore";
import { useSelectedEntityStore, type EntityType } from "../../stores/selectedEntityStore";
import { resolveBot } from "../../lib/botRouting";
import { useBotSettingsStore } from "../../stores/botSettingsStore";
import { NewAgentPicker } from "./NewAgentPicker";
import { cn } from "../../lib/cn";

// In-memory live runs: any age (this session).
// Persisted recent: pull from discussions for bot replies in the last 7 days
// so the rail survives app restarts and groups by relative date are useful.
const PERSISTED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const BOT_PALETTE: Record<string, { gradient: string; text: string }> = {
  "bot-mel": { gradient: "from-purple-500 to-purple-700", text: "text-purple-500" },
  "bot-delivery": { gradient: "from-emerald-500 to-emerald-700", text: "text-emerald-500" },
  "bot-sales": { gradient: "from-amber-500 to-amber-700", text: "text-amber-600" },
  "bot-domain": { gradient: "from-cyan-500 to-cyan-700", text: "text-cyan-500" },
  "bot-builder": { gradient: "from-blue-500 to-blue-700", text: "text-blue-500" },
};
function botPalette(name: string) {
  return BOT_PALETTE[name] ?? BOT_PALETTE["bot-mel"];
}

interface ParsedEntityId {
  /** "entity-chat" | "project-chat" | "task-chat" */
  prefix: string;
  /** For entity-chat: the entity type. Else inferred from prefix. */
  type: EntityType;
  /** The entity row id (or module id for module-scoped chats). */
  id: string;
}

function parseEntityId(entityId: string): ParsedEntityId | null {
  if (entityId.startsWith("entity-chat:")) {
    const parts = entityId.split(":");
    if (parts.length < 3) return null;
    return { prefix: "entity-chat", type: parts[1] as EntityType, id: parts[2] };
  }
  if (entityId.startsWith("task-chat:")) {
    return { prefix: "task-chat", type: "task", id: entityId.replace(/^task-chat:/, "").split(":")[0] };
  }
  if (entityId.startsWith("project-chat:")) {
    return { prefix: "project-chat", type: "project", id: entityId.replace(/^project-chat:/, "").split(":")[0] };
  }
  return null;
}

async function fetchEntityName(parsed: ParsedEntityId): Promise<string | null> {
  if (parsed.type === "module") return parsed.id;
  if (parsed.type === "domain") return parsed.id;

  const table =
    parsed.type === "task" ? "tasks"
    : parsed.type === "project" || parsed.type === "deal" ? "projects"
    : parsed.type === "company" ? "crm_companies"
    : parsed.type === "contact" ? "crm_contacts"
    : parsed.type === "initiative" ? "initiatives"
    : parsed.type === "blog_article" ? "blog_articles"
    : parsed.type === "skill" ? "skills"
    : parsed.type === "mcp_tool" ? "mcp_tools"
    : null;
  if (!table) return null;
  const nameField = parsed.type === "task" || parsed.type === "blog_article" ? "title" : "name";
  const idField = parsed.type === "skill" || parsed.type === "mcp_tool" ? "slug" : "id";
  try {
    const { data } = await supabase.from(table).select(`${nameField}`).eq(idField, parsed.id).maybeSingle();
    return (data as any)?.[nameField] ?? null;
  } catch {
    return null;
  }
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remS = s - m * 60;
  if (m < 60) return `${m}m ${remS}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m - h * 60}m`;
}

function lastEventTimestamp(events: { timestamp: number }[], fallback: number): number {
  if (events.length === 0) return fallback;
  return events[events.length - 1].timestamp;
}

// Unified shape used by the rail — works for both in-memory live runs and
// persisted past replies hydrated from discussions.
interface RailEntry {
  /** Stable key — entity_id, since rail dedupes per chat. */
  key: string;
  entityId: string;
  bot: string;
  steps: number;       // 0 for persisted entries (we don't track steps in the DB)
  isLive: boolean;
  isError: boolean;
  /** ms epoch — for sorting + "Xm ago" labels. */
  lastActivity: number;
  /** ms — only meaningful for live runs (elapsed since start). */
  startedAt: number | null;
  costUsd: number;
  durationMs: number;
}

interface PersistedReply {
  entity_id: string;
  author: string;
  created_at: string;
  agent_metrics: { cost_usd?: number; duration_ms?: number } | null;
}

function usePersistedRecentReplies() {
  return useQuery({
    queryKey: ["agent-rail-persisted-recent"],
    queryFn: async (): Promise<PersistedReply[]> => {
      const since = new Date(Date.now() - PERSISTED_WINDOW_MS).toISOString();
      const { data, error } = await supabase
        .from("discussions")
        .select("entity_id, author, created_at, agent_metrics")
        .like("author", "bot-%")
        .or(
          "entity_id.like.entity-chat:%,entity_id.like.task-chat:%,entity_id.like.project-chat:%",
        )
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        console.warn("[ActiveAgentsRail] persisted query failed:", error);
        return [];
      }
      return (data ?? []) as PersistedReply[];
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Relative-date buckets used to group the Recent section.
type DateBucket = "last_hour" | "earlier_today" | "yesterday" | "this_week" | "earlier";
const BUCKET_LABELS: Record<DateBucket, string> = {
  last_hour: "Last hour",
  earlier_today: "Earlier today",
  yesterday: "Yesterday",
  this_week: "This week",
  earlier: "Earlier",
};
const BUCKET_ORDER: DateBucket[] = [
  "last_hour",
  "earlier_today",
  "yesterday",
  "this_week",
  "earlier",
];

function bucketOf(ts: number): DateBucket {
  const now = new Date();
  const then = new Date(ts);
  const diffMs = now.getTime() - ts;

  if (diffMs < 60 * 60 * 1000) return "last_hour";

  // Same calendar day in local TZ → "earlier today"
  const sameDay =
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate();
  if (sameDay) return "earlier_today";

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    then.getFullYear() === yesterday.getFullYear() &&
    then.getMonth() === yesterday.getMonth() &&
    then.getDate() === yesterday.getDate();
  if (isYesterday) return "yesterday";

  if (diffMs < 7 * 24 * 60 * 60 * 1000) return "this_week";
  return "earlier";
}

interface ActiveAgentsRailProps {
  collapsed: boolean;
  onToggle: () => void;
  /** entity_id of the currently-open conversation, so we can highlight it. */
  currentEntityId: string;
  /** Modal layout — when "left", the rail sits at the screen's left edge and
   * needs top-left offset for the macOS traffic-light buttons. */
  layout: "center" | "left" | "right";
}

export function ActiveAgentsRail({ collapsed, onToggle, currentEntityId, layout }: ActiveAgentsRailProps) {
  const titleBarOffset = layout === "left"; // macOS chrome overlaps top-left of window
  const runs = useClaudeRunStore((s) => s.runs);
  const setSelected = useSelectedEntityStore((s) => s.setSelected);
  const routingOverrides = useBotSettingsStore((s) => s.routingOverrides);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Tick every second so elapsed times stay current.
  const [, forceRender] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceRender((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const persistedQ = usePersistedRecentReplies();
  const persistedReplies = persistedQ.data ?? [];

  // Build the unified rail entry list.
  // 1. Start with in-memory runs (live + this-session completed) — they have
  //    full event detail for live progress.
  // 2. Layer persisted bot replies on top so chats from prior sessions still
  //    show up. In-memory wins per entity_id (it's authoritative + live).
  const entries = useMemo<RailEntry[]>(() => {
    const byChat = new Map<string, RailEntry>();

    // In-memory first (rail dedupes per entity_id and prefers the live run).
    const inMemory = Object.values(runs).filter((r) => {
      if (!r.entityId) return false;
      return (
        r.entityId.startsWith("entity-chat:") ||
        r.entityId.startsWith("task-chat:") ||
        r.entityId.startsWith("project-chat:")
      );
    });
    for (const r of inMemory) {
      const key = r.entityId!;
      const ts = lastEventTimestamp(r.events, 0);
      const parsed = parseEntityId(key);
      const bot = parsed
        ? resolveBot({ entityType: parsed.type, id: parsed.id }, routingOverrides)
        : "bot-mel";
      const entry: RailEntry = {
        key,
        entityId: key,
        bot,
        steps: r.events.length,
        isLive: !r.isComplete,
        isError: r.isError,
        lastActivity: ts,
        startedAt: r.events[0]?.timestamp ?? null,
        costUsd: r.costUsd,
        durationMs: r.durationMs,
      };
      const existing = byChat.get(key);
      if (!existing) {
        byChat.set(key, entry);
        continue;
      }
      // Prefer live → otherwise more recent.
      if (entry.isLive && !existing.isLive) byChat.set(key, entry);
      else if (entry.isLive === existing.isLive && entry.lastActivity > existing.lastActivity) {
        byChat.set(key, entry);
      }
    }

    // Persisted second — only fill gaps where no in-memory entry exists.
    for (const reply of persistedReplies) {
      if (byChat.has(reply.entity_id)) continue;
      const ts = new Date(reply.created_at).getTime();
      byChat.set(reply.entity_id, {
        key: reply.entity_id,
        entityId: reply.entity_id,
        bot: reply.author,
        steps: 0,
        isLive: false,
        isError: false,
        lastActivity: ts,
        startedAt: null,
        costUsd: reply.agent_metrics?.cost_usd ?? 0,
        durationMs: reply.agent_metrics?.duration_ms ?? 0,
      });
    }

    return [...byChat.values()];
  }, [runs, persistedReplies]);

  const live = entries.filter((e) => e.isLive)
    .sort((a, b) => b.lastActivity - a.lastActivity);
  const recent = entries.filter((e) => !e.isLive)
    .sort((a, b) => b.lastActivity - a.lastActivity);

  // Bucket recent entries by relative date so we can render Today / Yesterday /
  // This Week / Earlier subsections.
  const recentByBucket = useMemo(() => {
    const map = new Map<DateBucket, RailEntry[]>();
    for (const e of recent) {
      const b = bucketOf(e.lastActivity);
      const arr = map.get(b);
      if (arr) arr.push(e);
      else map.set(b, [e]);
    }
    return map;
  }, [recent]);

  // Per-bucket collapse state, persisted in localStorage.
  const [collapsedBuckets, setCollapsedBuckets] = useState<Set<DateBucket>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem("tv-client-rail-collapsed-buckets");
      if (!raw) return new Set();
      const arr = JSON.parse(raw) as DateBucket[];
      return new Set(arr);
    } catch {
      return new Set();
    }
  });
  const toggleBucket = (b: DateBucket) => {
    setCollapsedBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      if (typeof window !== "undefined") {
        localStorage.setItem(
          "tv-client-rail-collapsed-buckets",
          JSON.stringify([...next]),
        );
      }
      return next;
    });
  };

  const orderedEntries = [...live, ...recent];

  // Build a deduped query list — multiple entries can share the same
  // (type, id) key (e.g. a `task-chat:X` live run alongside an
  // `entity-chat:task:X` persisted reply). React Query warns loudly when the
  // same key appears twice in a single useQueries call, so we run each
  // unique key once and look up by key when rendering rows.
  const uniqueNameKeys = useMemo(() => {
    const seen = new Map<string, ParsedEntityId>();
    for (const e of orderedEntries) {
      const parsed = parseEntityId(e.entityId);
      if (!parsed) continue;
      const k = `${parsed.type}::${parsed.id}`;
      if (!seen.has(k)) seen.set(k, parsed);
    }
    return [...seen.entries()];
  }, [orderedEntries]);

  const nameQueriesArr = useQueries({
    queries: uniqueNameKeys.map(([k, parsed]) => ({
      queryKey: ["agent-rail-entity-name", parsed.type, parsed.id],
      queryFn: () => fetchEntityName(parsed),
      staleTime: 60_000,
      meta: { dedupKey: k },
    })),
  });

  const nameByKey = useMemo(() => {
    const m = new Map<string, string | null>();
    uniqueNameKeys.forEach(([k], i) => {
      m.set(k, (nameQueriesArr[i]?.data ?? null) as string | null);
    });
    return m;
  }, [uniqueNameKeys, nameQueriesArr]);

  const nameFor = (entityId: string): string | null => {
    const parsed = parseEntityId(entityId);
    if (!parsed) return null;
    return nameByKey.get(`${parsed.type}::${parsed.id}`) ?? null;
  };

  if (collapsed) {
    return (
      <>
        {pickerOpen && <NewAgentPicker onClose={() => setPickerOpen(false)} />}
        <div className={cn(
          "shrink-0 flex flex-col items-center gap-2 pb-3 px-1.5 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40",
          titleBarOffset ? "pt-12" : "pt-3",
        )}>
        <button
          onClick={onToggle}
          title="Show active agents"
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60"
        >
          <ChevronRight size={14} />
        </button>
        <button
          onClick={() => setPickerOpen(true)}
          title="New agent (pick scope + bot)"
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60"
        >
          <Plus size={14} />
        </button>
        {/* Stack of mini avatars for live runs */}
        <div className="flex flex-col gap-1.5">
          {live.slice(0, 6).map((entry) => {
            const parsed = parseEntityId(entry.entityId);
            const palette = botPalette(entry.bot);
            return (
              <button
                key={entry.key}
                onClick={() => parsed && setSelected({ type: parsed.type, id: parsed.id })}
                title={`${entry.bot} — ${parsed?.id ?? entry.entityId}`}
                className="relative"
              >
                <div className={cn("w-6 h-6 rounded-full bg-gradient-to-br flex items-center justify-center text-white", palette.gradient)}>
                  <Brain size={11} />
                </div>
                <Loader2 size={8} className="absolute -bottom-0.5 -right-0.5 text-zinc-500 animate-spin bg-white dark:bg-zinc-950 rounded-full" />
              </button>
            );
          })}
        </div>
        </div>
      </>
    );
  }

  return (
    <>
    {pickerOpen && <NewAgentPicker onClose={() => setPickerOpen(false)} />}
    <div className="shrink-0 w-[240px] flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40">
      <div className={cn(
        "flex items-center justify-between pr-3 py-2.5 border-b border-zinc-200/70 dark:border-zinc-800/70 select-none",
        titleBarOffset ? "pl-20" : "pl-3",
      )}>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Active agents
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setPickerOpen(true)}
            title="New agent (pick scope + bot)"
            className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            <Plus size={13} />
          </button>
          <button
            onClick={onToggle}
            title="Hide rail"
            className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            <ChevronLeft size={13} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {live.length === 0 && recent.length === 0 && (
          <div className="px-3 py-8 text-center">
            <Bot size={20} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-2" />
            <div className="text-[11px] text-zinc-400">No agents running</div>
            <div className="text-[10px] text-zinc-400/70 mt-1">
              Send a message to start one
            </div>
          </div>
        )}

        {live.length > 0 && (
          <RailSection title={`Running (${live.length})`}>
            {live.map((entry) => {
              const parsed = parseEntityId(entry.entityId);
              const name = nameFor(entry.entityId) ?? parsed?.id?.slice(0, 8) ?? "—";
              const start = entry.startedAt ?? Date.now();
              const elapsed = Date.now() - start;
              return (
                <RailRow
                  key={entry.key}
                  bot={entry.bot}
                  name={name}
                  scope={parsed?.type ?? "?"}
                  detail={`${formatElapsed(elapsed)}${entry.steps ? ` · ${entry.steps} steps` : ""}`}
                  live
                  active={entry.entityId === currentEntityId}
                  onClick={() => parsed && setSelected({ type: parsed.type, id: parsed.id })}
                />
              );
            })}
          </RailSection>
        )}

        {BUCKET_ORDER.map((bucket) => {
          const items = recentByBucket.get(bucket) ?? [];
          if (items.length === 0) return null;
          const isCollapsed = collapsedBuckets.has(bucket);
          return (
            <CollapsibleRailSection
              key={bucket}
              title={BUCKET_LABELS[bucket]}
              count={items.length}
              collapsed={isCollapsed}
              onToggle={() => toggleBucket(bucket)}
            >
              {items.map((entry) => {
                const parsed = parseEntityId(entry.entityId);
                const name = nameFor(entry.entityId) ?? parsed?.id?.slice(0, 8) ?? "—";
                const dur = entry.durationMs > 0 ? `${(entry.durationMs / 1000).toFixed(1)}s` : null;
                const cost = entry.costUsd > 0 ? `$${entry.costUsd.toFixed(3)}` : null;
                const ago = relativeTime(entry.lastActivity);
                const detail = [ago, dur, cost, entry.isError ? "errored" : null]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <RailRow
                    key={entry.key}
                    bot={entry.bot}
                    name={name}
                    scope={parsed?.type ?? "?"}
                    detail={detail}
                    active={entry.entityId === currentEntityId}
                    errored={entry.isError}
                    onClick={() => parsed && setSelected({ type: parsed.type, id: parsed.id })}
                  />
                );
              })}
            </CollapsibleRailSection>
          );
        })}
      </div>
    </div>
    </>
  );
}

function RailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
        {title}
      </div>
      <div className="px-1.5 space-y-0.5">{children}</div>
    </div>
  );
}

function CollapsibleRailSection({
  title,
  count,
  collapsed,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
      >
        <ChevronRight
          size={9}
          className={cn(
            "transition-transform shrink-0",
            !collapsed && "rotate-90",
          )}
        />
        <span>{title}</span>
        <span className="text-zinc-400/60 font-normal normal-case tracking-normal">({count})</span>
      </button>
      {!collapsed && <div className="px-1.5 space-y-0.5 mt-0.5">{children}</div>}
    </div>
  );
}

interface RailRowProps {
  // String, not BotName: persisted entries carry the discussion `author` field
  // verbatim, which may be any bot identity (or future bots not in the union).
  bot: string;
  name: string;
  scope: string;
  detail: string;
  live?: boolean;
  active?: boolean;
  errored?: boolean;
  onClick: () => void;
}

function RailRow({ bot, name, scope, detail, live, active, errored, onClick }: RailRowProps) {
  const palette = botPalette(bot);
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors",
        active
          ? "bg-zinc-200/80 dark:bg-zinc-800/80"
          : "hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50",
      )}
    >
      <div className="relative shrink-0">
        <div className={cn("w-6 h-6 rounded-full bg-gradient-to-br flex items-center justify-center text-white", palette.gradient)}>
          <Brain size={11} />
        </div>
        {live && (
          <Loader2
            size={9}
            className="absolute -bottom-0.5 -right-0.5 text-zinc-500 animate-spin bg-white dark:bg-zinc-950 rounded-full"
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <div className={cn("text-[11px] font-semibold truncate", palette.text)}>{bot}</div>
          <div className="text-[9px] text-zinc-400 uppercase tracking-wider">{scope}</div>
        </div>
        <div className={cn("text-[11px] truncate", errored ? "text-red-500" : "text-zinc-700 dark:text-zinc-300")}>
          {name}
        </div>
        <div className="text-[9px] text-zinc-400 font-mono mt-0.5">{detail}</div>
      </div>
    </button>
  );
}
