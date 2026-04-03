// src/modules/home/HomeModule.tsx
// Hybrid briefing: hero card for the top story, compact scannable list below

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Heart,
  Bookmark,
  ChevronRight,
  ChevronDown,
  Pin,
  Eye,
  Clock,
  Share2,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/PageHeader";
import {
  useFeedCards,
  useMarkSeen,
  useToggleLike,
  useToggleSave,
  useSavedCards,
  useTrendingCards,
  triggerBriefing,
} from "../../hooks/feed";
import { useQueryClient } from "@tanstack/react-query";
import { typeColors, typeIcons } from "./constants";
import { CardVisual } from "./CardVisual";
import type { FeedCardWithInteraction } from "./types";

const USER_ID = "melvin";

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Left-border color per card type (for compact cards)
// ---------------------------------------------------------------------------

const typeBorderColors: Record<string, string> = {
  feature: "border-l-teal-500",
  tip: "border-l-amber-500",
  team: "border-l-blue-500",
  skill: "border-l-violet-500",
  platform: "border-l-emerald-500",
  release: "border-l-rose-500",
  module: "border-l-orange-500",
  app_tip: "border-l-cyan-500",
};

// ---------------------------------------------------------------------------
// Shared rich content renderer (used by both hero and expanded compact)
// ---------------------------------------------------------------------------

function CardRichContent({ card }: { card: FeedCardWithInteraction }) {
  const colors = typeColors[card.card_type];

  return (
    <>
      {card.author && (
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/40 dark:to-blue-800/40 flex items-center justify-center text-[10px] font-bold text-blue-600 dark:text-blue-300">
            {card.author.initials}
          </div>
          <div>
            <span className="text-[12px] font-medium text-slate-700 dark:text-slate-200">
              {card.author.name}
            </span>
            <span className="text-[11px] text-slate-400 dark:text-slate-500 ml-1.5">
              {card.author.role}
            </span>
          </div>
        </div>
      )}

      {card.body && (
        <p className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-300 mb-3">
          {card.body}
        </p>
      )}

      {card.visual && (
        <div className="mb-3">
          <CardVisual type={card.visual} />
        </div>
      )}

      {card.triggers && card.triggers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {card.triggers.map((t) => (
            <span
              key={t}
              className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-violet-500/8 border border-violet-500/15 text-violet-600 dark:text-violet-300"
            >
              "{t}"
            </span>
          ))}
        </div>
      )}

      {card.stats && card.stats.length > 0 && (
        <div className="flex gap-5 mb-3">
          {card.stats.map((s) => (
            <div key={s.label}>
              <div className="text-[9px] uppercase tracking-wide text-slate-400 dark:text-slate-500 font-medium">
                {s.label}
              </div>
              <div className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {card.chips && card.chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {card.chips.map((c) => (
            <span
              key={c}
              className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-emerald-500/8 border border-emerald-500/16 text-emerald-600 dark:text-emerald-300"
            >
              <span className="text-emerald-500">&#10003;</span> {c}
            </span>
          ))}
        </div>
      )}

      {card.features && card.features.length > 0 && (
        <ul className="space-y-1 mb-3">
          {card.features.map((f) => (
            <li
              key={f}
              className="flex items-start gap-2 text-[12px] text-slate-500 dark:text-slate-400 leading-snug"
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full mt-1.5 shrink-0",
                  colors.glow
                )}
              />
              {f}
            </li>
          ))}
        </ul>
      )}

      {card.cta_label && (
        <button
          className={cn(
            "inline-flex items-center gap-1.5 text-[12px] font-semibold transition-colors",
            colors.accent
          )}
        >
          {card.cta_label}
          <ChevronRight size={13} />
        </button>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Hero card — the top story, always expanded
// ---------------------------------------------------------------------------

function HeroCard({
  card,
  onLike,
  onSave,
  onMarkSeen,
}: {
  card: FeedCardWithInteraction;
  onLike: () => void;
  onSave: () => void;
  onMarkSeen: () => void;
}) {
  const colors = typeColors[card.card_type];
  const Icon = typeIcons[card.card_type];
  const liked = !!card.interaction?.liked;
  const saved = !!card.interaction?.saved;
  const seen = !!card.interaction?.seen;

  // Mark seen on mount
  const didMark = useRef(false);
  useEffect(() => {
    if (!didMark.current && !seen) {
      didMark.current = true;
      onMarkSeen();
    }
  }, [seen, onMarkSeen]);

  return (
    <div
      className={cn(
        "relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700/80",
        "bg-gradient-to-br",
        colors.bg
      )}
    >
      {/* Ambient glow */}
      <div
        className={cn(
          "absolute w-[240px] h-[240px] rounded-full blur-[100px] opacity-[0.06] dark:opacity-[0.10] top-[20%] right-[10%] pointer-events-none",
          colors.glow
        )}
      />

      <div className="relative z-10 p-6">
        {/* Badge row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                "inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-full border",
                colors.badgeBg,
                colors.badgeBorder,
                colors.accent
              )}
            >
              <Icon size={12} />
              {card.badge}
            </div>
            {card.pinned && (
              <Pin size={11} className="text-amber-500" />
            )}
            {!seen && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-teal-600 dark:text-teal-400">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                New
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            {formatRelativeTime(card.created_at)}
          </span>
        </div>

        {/* Title */}
        <h2 className="font-heading text-xl leading-tight text-slate-900 dark:text-slate-100 mb-3">
          {card.title}
        </h2>

        {/* Rich content */}
        <CardRichContent card={card} />

        {/* Action bar */}
        <div className="flex items-center gap-1 mt-4 pt-3 border-t border-slate-200/60 dark:border-slate-700/40">
          <button
            onClick={onLike}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              liked
                ? "text-rose-400"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            )}
          >
            <Heart size={15} fill={liked ? "currentColor" : "none"} />
          </button>
          <button
            onClick={onSave}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              saved
                ? "text-amber-400"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            )}
          >
            <Bookmark size={15} fill={saved ? "currentColor" : "none"} />
          </button>
          <button className="p-1.5 rounded-md text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
            <Share2 size={15} />
          </button>
          <div className="flex-1" />
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            {card.source}
            {card.source_detail && (
              <> &middot; {card.source_detail}</>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact card row — the scannable unit
// ---------------------------------------------------------------------------

function CompactCard({
  card,
  isExpanded,
  onToggle,
  onLike,
  onSave,
  onMarkSeen,
}: {
  card: FeedCardWithInteraction;
  isExpanded: boolean;
  onToggle: () => void;
  onLike: () => void;
  onSave: () => void;
  onMarkSeen: () => void;
}) {
  const colors = typeColors[card.card_type];
  const Icon = typeIcons[card.card_type];
  const liked = !!card.interaction?.liked;
  const saved = !!card.interaction?.saved;
  const seen = !!card.interaction?.seen;

  // Mark seen when expanded
  const expandedRef = useRef(false);
  useEffect(() => {
    if (isExpanded && !expandedRef.current) {
      expandedRef.current = true;
      if (!seen) onMarkSeen();
    }
    if (!isExpanded) expandedRef.current = false;
  }, [isExpanded, seen, onMarkSeen]);

  return (
    <div
      className={cn(
        "group rounded-lg border-l-[3px] transition-all duration-150",
        typeBorderColors[card.card_type] || "border-l-slate-400",
        isExpanded
          ? "border border-l-[3px] border-slate-300 dark:border-slate-600 shadow-sm bg-white dark:bg-slate-900"
          : "border border-l-[3px] border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 hover:border-slate-300 dark:hover:border-slate-700"
      )}
    >
      {/* Compact row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left"
      >
        {/* Type icon */}
        <div
          className={cn(
            "flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center",
            colors.badgeBg
          )}
        >
          <Icon size={13} className={colors.accent} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3
              className={cn(
                "text-[13px] leading-snug truncate",
                seen
                  ? "text-slate-500 dark:text-slate-400"
                  : "font-medium text-slate-800 dark:text-slate-100"
              )}
            >
              {card.title}
            </h3>
            {card.pinned && (
              <Pin size={10} className="text-amber-500 flex-shrink-0" />
            )}
            {!seen && (
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500 flex-shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
            <span className={cn("font-medium", colors.accent)}>
              {card.badge}
            </span>
            <span className="text-slate-300 dark:text-slate-600">&middot;</span>
            <span>{card.source}</span>
            <span className="text-slate-300 dark:text-slate-600">&middot;</span>
            <span>{formatRelativeTime(card.created_at)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <div className="flex items-center gap-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <span
              onClick={(e) => { e.stopPropagation(); onLike(); }}
              className={cn(
                "p-1.5 rounded-md transition-colors cursor-pointer",
                liked
                  ? "text-rose-400"
                  : "text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
              )}
            >
              <Heart size={12} fill={liked ? "currentColor" : "none"} />
            </span>
            <span
              onClick={(e) => { e.stopPropagation(); onSave(); }}
              className={cn(
                "p-1.5 rounded-md transition-colors cursor-pointer",
                saved
                  ? "text-amber-400"
                  : "text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
              )}
            >
              <Bookmark size={12} fill={saved ? "currentColor" : "none"} />
            </span>
          </div>
          <ChevronDown
            size={13}
            className={cn(
              "text-slate-400 dark:text-slate-500 transition-transform duration-200",
              isExpanded && "rotate-180"
            )}
          />
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 ml-[42px] border-t border-slate-100 dark:border-slate-800">
          <div className="pt-3">
            <CardRichContent card={card} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HomeModule
// ---------------------------------------------------------------------------

export function HomeModule() {
  const [filter, setFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [briefingRunning, setBriefingRunning] = useState(false);
  const [briefingResult, setBriefingResult] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: cards = [], isLoading } = useFeedCards(filter, USER_ID);
  const markSeen = useMarkSeen(USER_ID);
  const toggleLike = useToggleLike(USER_ID);
  const toggleSave = useToggleSave(USER_ID);
  const { data: savedCards = [] } = useSavedCards(USER_ID);
  const { data: trending = [] } = useTrendingCards();

  const handleLike = useCallback(
    (cardId: string, currentlyLiked: boolean) => {
      toggleLike.mutate({ cardId, currentlyLiked });
    },
    [toggleLike]
  );

  const handleSave = useCallback(
    (cardId: string, currentlySaved: boolean) => {
      toggleSave.mutate({ cardId, currentlySaved });
    },
    [toggleSave]
  );

  const handleMarkSeen = useCallback(
    (cardId: string) => {
      markSeen.mutate(cardId);
    },
    [markSeen]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.metaKey || e.ctrlKey) return;

      if (e.key === "l") {
        if (expandedId) {
          const card = cards.find((c) => c.id === expandedId);
          if (card) handleLike(card.id, !!card.interaction?.liked);
        }
      } else if (e.key === "s") {
        if (expandedId) {
          const card = cards.find((c) => c.id === expandedId);
          if (card) handleSave(card.id, !!card.interaction?.saved);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [expandedId, cards, handleLike, handleSave]);

  const handleTriggerBriefing = useCallback(async () => {
    setBriefingRunning(true);
    setBriefingResult(null);
    try {
      const created = await triggerBriefing(queryClient);
      setBriefingResult(created > 0 ? `${created} new` : "Up to date");
      setTimeout(() => setBriefingResult(null), 3000);
    } catch {
      setBriefingResult("Error");
      setTimeout(() => setBriefingResult(null), 3000);
    } finally {
      setBriefingRunning(false);
    }
  }, [queryClient]);

  const filters = [
    { key: "all", label: "All" },
    { key: "skill", label: "Skills" },
    { key: "team", label: "Team" },
    { key: "feature", label: "Features" },
    { key: "release", label: "Releases" },
  ];

  // Split cards: first card = hero, rest = compact list
  const heroCard = cards.length > 0 ? cards[0] : null;
  const listCards = cards.length > 1 ? cards.slice(1) : [];
  const unseenCount = cards.filter((c) => !c.interaction?.seen).length;

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950">
      <PageHeader description="Daily briefing of activity across your platform, team, and skills." />
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="font-heading text-lg text-slate-800 dark:text-slate-100">
            Briefing
          </h1>
          <div className="flex gap-0.5">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => {
                  setFilter(f.key);
                  setExpandedId(null);
                }}
                className={cn(
                  "text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors",
                  filter === f.key
                    ? "text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800"
                    : "text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500">
          {briefingResult && (
            <span className="text-teal-600 dark:text-teal-400 font-medium">{briefingResult}</span>
          )}
          {unseenCount > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
              <span className="font-medium text-teal-600 dark:text-teal-400">{unseenCount} new</span>
            </span>
          )}
          <span>{cards.length} cards</span>
          <button
            onClick={handleTriggerBriefing}
            disabled={briefingRunning}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              briefingRunning
                ? "text-teal-500"
                : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
            title="Generate briefing from latest activity"
          >
            {briefingRunning ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main feed */}
        <div className="flex-1 overflow-y-auto scrollbar-auto-hide p-5">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <span className="text-[13px] text-slate-400 dark:text-slate-500">Loading briefing...</span>
            </div>
          ) : cards.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-1">No cards yet</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-600">
                  Cards will appear here as activity happens across the platform
                </p>
              </div>
            </div>
          ) : (
            <div className="max-w-[640px] mx-auto space-y-3">
              {/* Hero — top story */}
              {heroCard && (
                <HeroCard
                  card={heroCard}
                  onLike={() => handleLike(heroCard.id, !!heroCard.interaction?.liked)}
                  onSave={() => handleSave(heroCard.id, !!heroCard.interaction?.saved)}
                  onMarkSeen={() => handleMarkSeen(heroCard.id)}
                />
              )}

              {/* Compact list */}
              {listCards.length > 0 && (
                <>
                  <div className="flex items-center gap-2 px-1 pt-2 pb-1">
                    <Clock size={11} className="text-slate-400 dark:text-slate-500" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                      More updates
                    </span>
                    <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                  </div>

                  <div className="space-y-1.5">
                    {listCards.map((card) => (
                      <CompactCard
                        key={card.id}
                        card={card}
                        isExpanded={expandedId === card.id}
                        onToggle={() =>
                          setExpandedId(expandedId === card.id ? null : card.id)
                        }
                        onLike={() => handleLike(card.id, !!card.interaction?.liked)}
                        onSave={() => handleSave(card.id, !!card.interaction?.saved)}
                        onMarkSeen={() => handleMarkSeen(card.id)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-[260px] shrink-0 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-y-auto scrollbar-auto-hide p-4 space-y-5">
          {/* Saved */}
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 mb-2.5 flex items-center gap-1.5">
              <Bookmark size={10} />
              Saved
            </h3>
            {savedCards.length === 0 ? (
              <p className="text-[11px] text-slate-400 dark:text-slate-600">
                Press <kbd className="font-mono text-[10px] px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">S</kbd> to save cards
              </p>
            ) : (
              <div className="space-y-0">
                {savedCards.slice(0, 6).map((card) => {
                  const sc = typeColors[card.card_type];
                  return (
                    <button
                      key={card.id}
                      onClick={() => setExpandedId(expandedId === card.id ? null : card.id)}
                      className="w-full flex items-center gap-2 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 -mx-1 px-1 rounded transition-colors"
                    >
                      <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", sc.glow)} />
                      <span className="text-[12px] text-slate-600 dark:text-slate-400 truncate flex-1">
                        {card.title}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Trending */}
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 mb-2.5 flex items-center gap-1.5">
              <Eye size={10} />
              Trending
            </h3>
            {trending.length === 0 ? (
              <p className="text-[11px] text-slate-400 dark:text-slate-600">No trending cards yet</p>
            ) : (
              <div className="space-y-0">
                {trending.map(({ card, view_count }) => {
                  const sc = typeColors[card.card_type];
                  return (
                    <div key={card.id} className="flex items-center gap-2 py-1.5">
                      <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", sc.glow)} />
                      <span className="text-[12px] text-slate-600 dark:text-slate-400 truncate flex-1">
                        {card.title}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-600 shrink-0 tabular-nums">
                        {view_count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Shortcuts */}
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 mb-2.5">
              Shortcuts
            </h3>
            <div className="space-y-1">
              {[
                { keys: ["L"], label: "Like" },
                { keys: ["S"], label: "Save" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500"
                >
                  <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 min-w-[20px] text-center">
                    {s.keys[0]}
                  </kbd>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
