// src/components/ui/CollapsibleSection.tsx
// Sidebar section header with collapse/expand toggle. Persists open/closed
// per-key in localStorage so the user's preference sticks across sessions.

import { useState, useEffect, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../../lib/cn";

interface CollapsibleSectionProps {
  title: string;
  storageKey: string;
  defaultOpen?: boolean;
  rightSlot?: ReactNode;
  children: ReactNode;
}

const PREFIX = "tv-sidebar-section:";

export function CollapsibleSection({
  title,
  storageKey,
  defaultOpen = true,
  rightSlot,
  children,
}: CollapsibleSectionProps) {
  const fullKey = PREFIX + storageKey;
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return defaultOpen;
    const stored = window.localStorage.getItem(fullKey);
    return stored === null ? defaultOpen : stored === "1";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(fullKey, open ? "1" : "0");
  }, [fullKey, open]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex items-center gap-1 text-[10px] uppercase tracking-wide text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300",
          )}
        >
          {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          {title}
        </button>
        {open && rightSlot}
      </div>
      {open && <div className="space-y-0.5">{children}</div>}
    </div>
  );
}
