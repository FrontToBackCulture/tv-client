// src/shell/ModeTabs.tsx
// Mode switcher — [Sell] [Support] [Marketing] │ [All] — sits in the title
// bar. Tabs are backed by modeStore; each tab swaps both the sidebar filter
// (via isModuleVisible → modeStore) and the tab list (via moduleTabStore).
// The "All" tab is admin-only and visually separated as an escape hatch.

import { useMemo } from "react";
import { cn } from "../lib/cn";
import { ALL_MODES, MODES, Mode } from "../config/modes";
import { useModeStore } from "../stores/modeStore";
import { useTeamConfigStore } from "../stores/teamConfigStore";
import { useAuth } from "../stores/authStore";

export function ModeTabs() {
  const activeMode = useModeStore((s) => s.activeMode);
  const setMode = useModeStore((s) => s.setMode);
  const user = useAuth((s) => s.user);
  const isAdmin = useTeamConfigStore((s) => s.isAdmin);

  const visibleModes = useMemo<Mode[]>(() => {
    const admin = user ? isAdmin(user.login) : false;
    return ALL_MODES.filter((m) => !MODES[m].adminOnly || admin);
  }, [user, isAdmin]);

  if (visibleModes.length <= 1) return null;

  // Split functional modes from escape-hatch modes (currently just `all`) so
  // we can render a visual separator between them.
  const functional = visibleModes.filter((m) => !MODES[m].adminOnly);
  const escape = visibleModes.filter((m) => MODES[m].adminOnly);

  return (
    <div
      className="flex items-center gap-0.5 px-1.5 ml-1"
      onMouseDown={(e) => e.stopPropagation()}
      role="tablist"
      aria-label="App mode"
    >
      {functional.map((mode) => (
        <ModeTabButton
          key={mode}
          mode={mode}
          active={activeMode === mode}
          onClick={() => setMode(mode)}
        />
      ))}
      {escape.length > 0 && (
        <>
          <div className="w-px h-4 bg-zinc-300/60 dark:bg-zinc-700/60 mx-1" />
          {escape.map((mode) => (
            <ModeTabButton
              key={mode}
              mode={mode}
              active={activeMode === mode}
              onClick={() => setMode(mode)}
            />
          ))}
        </>
      )}
    </div>
  );
}

function ModeTabButton({
  mode,
  active,
  onClick,
}: {
  mode: Mode;
  active: boolean;
  onClick: () => void;
}) {
  const cfg = MODES[mode];
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      title={`${cfg.label} (${cfg.shortcut})`}
      className={cn(
        "px-2.5 h-6 text-[11px] font-medium rounded-md transition-colors select-none",
        active
          ? "bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 shadow-sm"
          : "text-zinc-500 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50"
      )}
    >
      {cfg.label}
    </button>
  );
}
