// src/modules/home/HomeModule.tsx

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronUp } from "lucide-react";
import { cn } from "../../lib/cn";
import {
  useFeedCards,
  useMarkSeen,
  useToggleLike,
  useToggleSave,
} from "../../hooks/feed";
import { FeedCardView } from "./FeedCardView";
import { FeedCardCarousel } from "./FeedCardCarousel";
import { ProgressDots } from "./ProgressDots";
import { HomeSidebar } from "./HomeSidebar";

// Hardcoded userId — will come from auth context later
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

export function HomeModule() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [filter, setFilter] = useState<string>("all");
  const feedRef = useRef<HTMLDivElement>(null);
  const seenRef = useRef<Set<string>>(new Set());

  // Data
  const { data: cards = [], isLoading } = useFeedCards(filter, USER_ID);
  const markSeen = useMarkSeen(USER_ID);
  const toggleLike = useToggleLike(USER_ID);
  const toggleSave = useToggleSave(USER_ID);

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

  const scrollToCard = useCallback((idx: number) => {
    const feed = feedRef.current;
    if (!feed) return;
    const children = feed.children;
    if (children[idx]) {
      (children[idx] as HTMLElement).scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  // Intersection observer for snap detection + mark seen
  useEffect(() => {
    const feed = feedRef.current;
    if (!feed) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            const idx = Array.from(feed.children).indexOf(
              entry.target as HTMLElement
            );
            if (idx >= 0) {
              setActiveIndex(idx);
              const card = cards[idx];
              if (card && !seenRef.current.has(card.id)) {
                seenRef.current.add(card.id);
                markSeen.mutate(card.id);
              }
            }
          }
        });
      },
      { root: feed, threshold: 0.6 }
    );

    Array.from(feed.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [cards, markSeen]);

  // Keyboard navigation (up/down for feed)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.metaKey || e.ctrlKey) return;

      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        scrollToCard(Math.min(activeIndex + 1, cards.length - 1));
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        scrollToCard(Math.max(activeIndex - 1, 0));
      } else if (e.key === "l") {
        const card = cards[activeIndex];
        if (card) handleLike(card.id, !!card.interaction?.liked);
      } else if (e.key === "s") {
        const card = cards[activeIndex];
        if (card) handleSave(card.id, !!card.interaction?.saved);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeIndex, cards, scrollToCard, handleLike, handleSave]);

  const filters = [
    { key: "all", label: "All" },
    { key: "skill", label: "Skills" },
    { key: "team", label: "Team" },
  ];

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Home
          </h1>
          <div className="flex gap-1">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => {
                  setFilter(f.key);
                  setActiveIndex(0);
                }}
                className={cn(
                  "text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors",
                  filter === f.key
                    ? "text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-white/8"
                    : "text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/4"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium">
          {cards.length > 0 ? (
            <>
              <span className="text-zinc-700 dark:text-zinc-300">
                {activeIndex + 1}
              </span>{" "}
              / {cards.length}
            </>
          ) : null}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden p-5 gap-5">
        {/* Feed container */}
        <div className="w-[400px] shrink-0 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 relative bg-white dark:bg-zinc-950">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-sm text-zinc-400 dark:text-zinc-500">
                Loading feed...
              </div>
            </div>
          ) : cards.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center px-8">
                <div className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">
                  No cards yet
                </div>
                <div className="text-[11px] text-zinc-400 dark:text-zinc-600">
                  Cards will appear here as the team creates content
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Progress dots */}
              <ProgressDots
                cards={cards}
                activeIndex={activeIndex}
                onDotClick={scrollToCard}
              />

              {/* Scroll hint */}
              {activeIndex === 0 && cards.length > 1 && (
                <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1 text-zinc-400 dark:text-zinc-600 animate-bounce pointer-events-none">
                  <ChevronUp size={16} />
                  <span className="text-[9px] font-medium uppercase tracking-wider">
                    Scroll
                  </span>
                </div>
              )}

              {/* Snap scroll feed */}
              <div
                ref={feedRef}
                className="h-full overflow-y-scroll snap-y snap-mandatory scroll-smooth"
                style={{ scrollbarWidth: "none" }}
              >
                {cards.map((card, i) =>
                  card.series_id ? (
                    <FeedCardCarousel
                      key={card.id}
                      card={card}
                      isActive={activeIndex === i}
                      liked={!!card.interaction?.liked}
                      saved={!!card.interaction?.saved}
                      onLike={() =>
                        handleLike(card.id, !!card.interaction?.liked)
                      }
                      onSave={() =>
                        handleSave(card.id, !!card.interaction?.saved)
                      }
                      timestamp={formatRelativeTime(card.created_at)}
                    />
                  ) : (
                    <FeedCardView
                      key={card.id}
                      card={card}
                      isActive={activeIndex === i}
                      liked={!!card.interaction?.liked}
                      saved={!!card.interaction?.saved}
                      onLike={() =>
                        handleLike(card.id, !!card.interaction?.liked)
                      }
                      onSave={() =>
                        handleSave(card.id, !!card.interaction?.saved)
                      }
                      timestamp={formatRelativeTime(card.created_at)}
                    />
                  )
                )}
              </div>
            </>
          )}
        </div>

        {/* Sidebar */}
        <HomeSidebar
          cards={cards}
          activeIndex={activeIndex}
          userId={USER_ID}
        />
      </div>
    </div>
  );
}
