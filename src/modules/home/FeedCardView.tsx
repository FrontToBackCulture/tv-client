// Feed Card component — media zone (the post) + caption zone (context below)

import { Heart, Bookmark, Share2, ChevronRight } from "lucide-react";
import { cn } from "../../lib/cn";
import { typeColors, typeIcons } from "./constants";
import { CardVisual } from "./CardVisual";
import type { FeedCardWithInteraction } from "./types";

export function FeedCardView({
  card,
  isActive,
  liked,
  saved,
  onLike,
  onSave,
  onCta,
  timestamp,
}: {
  card: FeedCardWithInteraction;
  isActive: boolean;
  liked: boolean;
  saved: boolean;
  onLike: () => void;
  onSave: () => void;
  onCta?: () => void;
  timestamp: string;
}) {
  const colors = typeColors[card.card_type];
  const Icon = typeIcons[card.card_type];

  // Cards with no rich media content show body in the media zone instead
  const hasRichMedia =
    card.visual ||
    (card.triggers && card.triggers.length > 0) ||
    (card.stats && card.stats.length > 0) ||
    (card.chips && card.chips.length > 0) ||
    (card.features && card.features.length > 0);

  return (
    <div className="h-full min-h-full snap-start snap-always relative flex flex-col overflow-hidden">
      {/* ── Media Zone (the post) ── */}
      <div
        className={cn(
          "relative flex-1 flex flex-col justify-center overflow-hidden bg-gradient-to-b",
          colors.bg
        )}
      >
        {/* Ambient glow */}
        <div
          className={cn(
            "absolute w-[200px] h-[200px] rounded-full blur-[80px] opacity-[0.08] dark:opacity-[0.12] top-[30%] left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none",
            colors.glow
          )}
        />

        <div
          className={cn(
            "relative z-10 w-full px-6 transition-all duration-400",
            isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          )}
        >
          {/* Badge */}
          <div
            className={cn(
              "inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-full border mb-4",
              colors.badgeBg,
              colors.badgeBorder,
              colors.accent
            )}
          >
            <Icon size={12} />
            {card.badge}
          </div>

          {/* Author row for team cards */}
          {card.author && (
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 dark:from-[#1E3A5F] dark:to-[#2a5a8f] flex items-center justify-center text-[11px] font-bold text-blue-600 dark:text-blue-300">
                {card.author.initials}
              </div>
              <div>
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {card.author.name}
                </div>
                <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
                  {card.author.role}
                </div>
              </div>
            </div>
          )}

          {/* Title */}
          <h2 className="text-xl font-bold leading-tight tracking-tight text-zinc-900 dark:text-zinc-100 mb-3">
            {card.title}
          </h2>

          {/* Body in media zone for text-only cards */}
          {!hasRichMedia && card.body && (
            <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              {card.body}
            </p>
          )}

          {/* Visual */}
          {card.visual && <CardVisual type={card.visual} />}

          {/* Triggers in media zone — they're visual elements */}
          {card.triggers && card.triggers.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1">
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

          {/* Stats in media zone — they're visual KPI blocks */}
          {card.stats && card.stats.length > 0 && (
            <div className="flex gap-4 mt-2">
              {card.stats.map((s) => (
                <div key={s.label}>
                  <div className="text-[9px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500 font-medium">
                    {s.label}
                  </div>
                  <div className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Connector chips in media zone */}
          {card.chips && card.chips.length > 0 && (
            <div className="flex gap-1.5 mt-2">
              {card.chips.map((c) => (
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

          {/* Feature list in media zone */}
          {card.features && card.features.length > 0 && (
            <ul className="space-y-1 mt-2">
              {card.features.map((f) => (
                <li
                  key={f}
                  className="flex items-start gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug"
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
        </div>
      </div>

      {/* ── Caption Zone (context below the post) ── */}
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

        {/* Caption text */}
        <div
          className="px-5 pb-3 overflow-y-auto max-h-[120px]"
          style={{ scrollbarWidth: "none" }}
        >
          {/* Source attribution */}
          <div className="flex items-center gap-1.5 text-[11px] mb-1">
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">
              {card.source}
            </span>
            {card.source_detail && (
              <>
                <span className="text-zinc-300 dark:text-zinc-600">·</span>
                <span className="text-zinc-400 dark:text-zinc-500">
                  {card.source_detail}
                </span>
              </>
            )}
          </div>

          {/* Body — only in caption if not already shown in media zone */}
          {hasRichMedia && card.body && (
            <p className="text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400 mb-2">
              {card.body}
            </p>
          )}

          {/* CTA */}
          {card.cta_label && (
            <button
              onClick={onCta}
              className={cn(
                "inline-flex items-center gap-1.5 text-[11px] font-semibold transition-colors",
                colors.accent
              )}
            >
              {card.cta_label}
              <ChevronRight size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
