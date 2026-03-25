/**
 * Returns a style object with animation-delay for staggered list items.
 * Usage: <div style={staggerStyle(index)} className="animate-fade-slide-in">
 *
 * Caps at index 15 to avoid late items feeling delayed.
 */
export function staggerStyle(index: number, baseDelay = 0, increment = 30) {
  const cappedIndex = Math.min(index, 15);
  return {
    animationDelay: `${baseDelay + cappedIndex * increment}ms`,
    animationFillMode: "backwards" as const,
  };
}
