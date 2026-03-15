// Progress dots — right sidebar dot navigation

import { cn } from "../../lib/cn";
import { typeColors } from "./constants";
import type { FeedCardWithInteraction } from "./types";

export function ProgressDots({
  cards,
  activeIndex,
  onDotClick,
}: {
  cards: FeedCardWithInteraction[];
  activeIndex: number;
  onDotClick: (idx: number) => void;
}) {
  return (
    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 z-20">
      {cards.map((card, i) => {
        const colors = typeColors[card.card_type];
        const isActive = i === activeIndex;
        return (
          <button
            key={card.id}
            onClick={() => onDotClick(i)}
            className={cn(
              "w-1.5 rounded-full transition-all duration-300",
              isActive
                ? cn("h-4", colors.glow)
                : "h-1.5 bg-black/10 dark:bg-white/15 hover:bg-black/20 dark:hover:bg-white/25"
            )}
          />
        );
      })}
    </div>
  );
}
