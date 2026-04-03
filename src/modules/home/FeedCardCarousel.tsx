// Horizontal carousel for card series — swipe left/right within a feed slot
// Layout: media carousel (flex-1) → dots → caption (from active slide)

import { useState, useRef, useEffect, useCallback } from "react";
import { Heart, Bookmark, Share2, ChevronRight } from "lucide-react";
import { cn } from "../../lib/cn";
import { useSeriesCards } from "../../hooks/feed";
import { CardVisual } from "./CardVisual";
import { typeColors, typeIcons } from "./constants";
import type { FeedCardWithInteraction } from "./types";
import type { FeedCard } from "../../lib/feed/types";

export function FeedCardCarousel({
  card,
  isActive,
  liked,
  saved,
  onLike,
  onSave,
  timestamp,
}: {
  card: FeedCardWithInteraction;
  isActive: boolean;
  liked: boolean;
  saved: boolean;
  onLike: () => void;
  onSave: () => void;
  timestamp: string;
}) {
  const { data: seriesCards = [] } = useSeriesCards(card.series_id);
  const [slideIndex, setSlideIndex] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);

  const slides: FeedCard[] =
    seriesCards.length > 0 ? (seriesCards as FeedCard[]) : [card];

  const activeSlide = slides[slideIndex] || slides[0];
  const colors = typeColors[activeSlide.card_type];

  const scrollToSlide = useCallback(
    (idx: number) => {
      const el = carouselRef.current;
      if (!el) return;
      const clamped = Math.max(0, Math.min(idx, slides.length - 1));
      el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
    },
    [slides.length]
  );

  // Observe horizontal scroll for snap detection
  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            const idx = Array.from(el.children).indexOf(
              entry.target as HTMLElement
            );
            if (idx >= 0) setSlideIndex(idx);
          }
        });
      },
      { root: el, threshold: 0.6 }
    );

    Array.from(el.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [slides]);

  // Arrow key left/right when active
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.metaKey || e.ctrlKey) return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        scrollToSlide(slideIndex + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        scrollToSlide(slideIndex - 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isActive, slideIndex, scrollToSlide]);

  return (
    <div className="h-full min-h-full snap-start snap-always flex flex-col overflow-hidden">
      {/* ── Media Carousel (flex-1) ── */}
      <div className="flex-1 relative overflow-hidden">
        <div
          ref={carouselRef}
          className="h-full w-full overflow-x-scroll snap-x snap-mandatory scroll-smooth flex"
          style={{ scrollbarWidth: "none" }}
        >
          {slides.map((slide) => {
            const sc = typeColors[slide.card_type];
            const SlideIcon = typeIcons[slide.card_type];
            return (
              <div
                key={slide.id}
                className={cn(
                  "w-full h-full shrink-0 snap-start snap-always relative flex flex-col justify-center overflow-hidden bg-gradient-to-b",
                  sc.bg
                )}
              >
                {/* Ambient glow */}
                <div
                  className={cn(
                    "absolute w-[200px] h-[200px] rounded-full blur-[80px] opacity-[0.08] dark:opacity-[0.12] top-[30%] left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none",
                    sc.glow
                  )}
                />
                <div
                  className={cn(
                    "relative z-10 w-full px-6 transition-all duration-400",
                    isActive
                      ? "opacity-100 translate-y-0"
                      : "opacity-0 translate-y-4"
                  )}
                >
                  {/* Badge */}
                  <div
                    className={cn(
                      "inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-full border mb-4",
                      sc.badgeBg,
                      sc.badgeBorder,
                      sc.accent
                    )}
                  >
                    <SlideIcon size={12} />
                    {slide.badge}
                  </div>

                  {/* Title */}
                  <h2 className="text-xl font-bold leading-tight tracking-tight text-zinc-900 dark:text-zinc-100 mb-3">
                    {slide.title}
                  </h2>

                  {/* Visual */}
                  {slide.visual && <CardVisual type={slide.visual} />}

                  {/* Triggers */}
                  {slide.triggers && slide.triggers.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {slide.triggers.map((t) => (
                        <span
                          key={t}
                          className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-violet-500/8 border border-violet-500/15 text-violet-600 dark:text-violet-300"
                        >
                          "{t}"
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Stats */}
                  {slide.stats && slide.stats.length > 0 && (
                    <div className="flex gap-4 mt-2">
                      {slide.stats.map(
                        (s: { label: string; value: string }) => (
                          <div key={s.label}>
                            <div className="text-[9px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500 font-medium">
                              {s.label}
                            </div>
                            <div className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                              {s.value}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  )}

                  {/* Features */}
                  {slide.features && slide.features.length > 0 && (
                    <ul className="space-y-1 mt-2">
                      {slide.features.map((f) => (
                        <li
                          key={f}
                          className="flex items-start gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug"
                        >
                          <span
                            className={cn(
                              "w-1.5 h-1.5 rounded-full mt-1.5 shrink-0",
                              sc.glow
                            )}
                          />
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Chips */}
                  {slide.chips && slide.chips.length > 0 && (
                    <div className="flex gap-1.5 mt-2">
                      {slide.chips.map((c) => (
                        <span
                          key={c}
                          className="flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded-lg bg-emerald-500/8 border border-emerald-500/16 text-emerald-600 dark:text-emerald-300"
                        >
                          <span className="text-emerald-500 dark:text-emerald-400">
                            ✓
                          </span>{" "}
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Carousel Dots (between media and caption) ── */}
      {slides.length > 1 && (
        <div className="shrink-0 flex justify-center gap-1.5 py-2 bg-white dark:bg-zinc-950">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => scrollToSlide(i)}
              className={cn(
                "rounded-full transition-all duration-300",
                i === slideIndex
                  ? cn("w-5 h-1.5", colors.glow)
                  : "w-1.5 h-1.5 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600"
              )}
            />
          ))}
        </div>
      )}

      {/* ── Caption Zone (from active slide) ── */}
      <div
        className={cn(
          "shrink-0 bg-white dark:bg-zinc-950 border-t border-zinc-100 dark:border-zinc-800 transition-all duration-300",
          isActive ? "opacity-100" : "opacity-60"
        )}
      >
        {/* Action bar */}
        <div className="px-5 pt-2 pb-1 flex items-center gap-1">
          <button
            onClick={onLike}
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
              liked
                ? "text-rose-400"
                : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
            )}
          >
            <Heart size={18} fill={liked ? "currentColor" : "none"} />
          </button>
          <button
            onClick={onSave}
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
              saved
                ? "text-amber-400"
                : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
            )}
          >
            <Bookmark size={18} fill={saved ? "currentColor" : "none"} />
          </button>
          <button className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
            <Share2 size={18} />
          </button>
          <div className="flex-1" />
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
            {timestamp}
          </span>
        </div>

        {/* Caption content — updates with active slide */}
        <div
          className="px-5 pb-3 overflow-y-auto max-h-[100px]"
          style={{ scrollbarWidth: "none" }}
        >
          <div className="flex items-center gap-1.5 text-[11px] mb-1">
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">
              {activeSlide.source}
            </span>
            {activeSlide.source_detail && (
              <>
                <span className="text-zinc-300 dark:text-zinc-600">·</span>
                <span className="text-zinc-400 dark:text-zinc-500">
                  {activeSlide.source_detail}
                </span>
              </>
            )}
          </div>
          {activeSlide.body && (
            <p className="text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400 mb-2">
              {activeSlide.body}
            </p>
          )}
          {activeSlide.cta_label && (
            <button
              onClick={
                slideIndex === 0 && slides.length > 1
                  ? () => scrollToSlide(1)
                  : undefined
              }
              className={cn(
                "inline-flex items-center gap-1.5 text-[11px] font-semibold transition-colors",
                colors.accent
              )}
            >
              {activeSlide.cta_label}
              <ChevronRight size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
