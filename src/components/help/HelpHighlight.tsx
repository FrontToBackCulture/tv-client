// src/components/help/HelpHighlight.tsx
// Renders a teal pulsing ring + dim overlay around a data-help-id element

import { useEffect, useState } from "react";
import { useHelpStore } from "../../stores/helpStore";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function HelpHighlight() {
  const target = useHelpStore((s) => s.highlightTarget);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!target) {
      setRect(null);
      return;
    }

    const el = document.querySelector(`[data-help-id="${target}"]`);
    if (!el) {
      setRect(null);
      return;
    }

    const update = () => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    update();

    // Recalculate on resize/scroll
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [target]);

  if (!target || !rect) return null;

  const pad = 4;

  return (
    <div className="fixed inset-0 z-30 pointer-events-none">
      {/* Dim overlay with cutout */}
      <svg className="absolute inset-0 w-full h-full">
        <defs>
          <mask id="help-highlight-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              x={rect.left - pad}
              y={rect.top - pad}
              width={rect.width + pad * 2}
              height={rect.height + pad * 2}
              rx={8}
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.3)"
          mask="url(#help-highlight-mask)"
        />
      </svg>

      {/* Pulsing teal ring */}
      <div
        className="absolute border-2 border-teal-500 rounded-lg animate-pulse"
        style={{
          top: rect.top - pad,
          left: rect.left - pad,
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
          boxShadow: "0 0 0 4px rgba(20, 184, 166, 0.25)",
        }}
      />
    </div>
  );
}
