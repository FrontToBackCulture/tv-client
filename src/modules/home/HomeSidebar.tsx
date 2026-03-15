// Home sidebar — progress, saved, trending, shortcuts

import { cn } from "../../lib/cn";
import { typeColors } from "./constants";
import { useSavedCards, useTrendingCards } from "../../hooks/feed";
import type { FeedCardWithInteraction } from "./types";

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

export function HomeSidebar({
  cards,
  activeIndex,
  userId,
}: {
  cards: FeedCardWithInteraction[];
  activeIndex: number;
  userId: string;
}) {
  const { data: savedCards = [] } = useSavedCards(userId);
  const { data: trending = [] } = useTrendingCards();

  return (
    <div className="flex-1 min-w-[220px] max-w-[300px] overflow-y-auto space-y-4 py-1">
      {/* Progress */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">
          Your Progress
        </h3>
        <div className="flex items-center gap-2.5 mb-2">
          <div className="flex-1 h-1 bg-zinc-100 dark:bg-white/6 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-teal-500 to-teal-400 rounded-full transition-all duration-500"
              style={{
                width: `${cards.length > 0 ? ((activeIndex + 1) / cards.length) * 100 : 0}%`,
              }}
            />
          </div>
          <span className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">
            {activeIndex + 1} / {cards.length}
          </span>
        </div>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
          {Math.max(0, cards.length - activeIndex - 1)} cards remaining
        </p>
      </div>

      {/* Saved */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">
          Saved
        </h3>
        <div className="space-y-0">
          {savedCards.length === 0 ? (
            <p className="text-[11px] text-zinc-400 dark:text-zinc-600">No saved cards yet</p>
          ) : (
            savedCards.slice(0, 5).map((card) => (
              <div
                key={card.id}
                className="flex items-center gap-2.5 py-2 border-b border-zinc-100 dark:border-zinc-800 last:border-0 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <div
                  className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    typeColors[card.card_type]?.glow || "bg-zinc-500"
                  )}
                />
                <span className="text-xs text-zinc-600 dark:text-zinc-400 flex-1 truncate">
                  {card.title}
                </span>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-600 shrink-0">
                  {formatRelativeTime(card.created_at)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Trending */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">
          Trending This Week
        </h3>
        <div className="space-y-0">
          {trending.length === 0 ? (
            <p className="text-[11px] text-zinc-400 dark:text-zinc-600">No trending cards yet</p>
          ) : (
            trending.map(({ card, view_count }) => (
              <div
                key={card.id}
                className="flex items-center gap-2.5 py-2 border-b border-zinc-100 dark:border-zinc-800 last:border-0 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <div
                  className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    typeColors[card.card_type]?.glow || "bg-zinc-500"
                  )}
                />
                <span className="text-xs text-zinc-600 dark:text-zinc-400 flex-1 truncate">
                  {card.title}
                </span>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-600 shrink-0">
                  {view_count} {view_count === 1 ? "view" : "views"}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Shortcuts */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">
          Shortcuts
        </h3>
        <div className="space-y-1.5">
          {[
            { keys: ["↑", "↓"], label: "Navigate cards" },
            { keys: ["L"], label: "Like" },
            { keys: ["S"], label: "Save" },
          ].map((shortcut) => (
            <div
              key={shortcut.label}
              className="flex items-center gap-2 text-[11px] text-zinc-400 dark:text-zinc-500"
            >
              <div className="flex gap-1">
                {shortcut.keys.map((k) => (
                  <kbd
                    key={k}
                    className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/6 border border-zinc-200 dark:border-white/8 text-zinc-500 dark:text-zinc-400 min-w-[20px] text-center"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
              <span>{shortcut.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
