// Settings: Appearance — visual theme, light/dark mode, per-workspace accent.

import { RotateCcw } from "lucide-react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useWorkspaceAppearanceStore } from "../../stores/workspaceAppearanceStore";
import { useThemeStore } from "../../stores/themeStore";
import { THEME_LIST, type ThemeId } from "../../lib/themes";
import { cn } from "../../lib/cn";

const PRESETS: { hex: string; name: string }[] = [
  { hex: "#14b8a6", name: "Teal" },
  { hex: "#8b5cf6", name: "Violet" },
  { hex: "#f59e0b", name: "Amber" },
  { hex: "#ef4444", name: "Red" },
  { hex: "#ec4899", name: "Pink" },
  { hex: "#3b82f6", name: "Blue" },
  { hex: "#10b981", name: "Emerald" },
  { hex: "#f97316", name: "Orange" },
  { hex: "#6366f1", name: "Indigo" },
  { hex: "#64748b", name: "Slate" },
];

export function AppearanceView() {
  const themeId = useThemeStore((s) => s.themeId);
  const setTheme = useThemeStore((s) => s.setTheme);

  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const overrides = useWorkspaceAppearanceStore((s) => s.colorOverrides);
  const setColor = useWorkspaceAppearanceStore((s) => s.setColor);
  const clearColor = useWorkspaceAppearanceStore((s) => s.clearColor);

  return (
    <div className="space-y-8">
      {/* ─── Theme ──────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Theme
        </h2>
        <p className="text-sm text-zinc-500 mt-1">
          Pick a complete visual identity. Each theme bundles surface tones,
          gradients, density, and light/dark balance into one coherent look.
          Your workspace accent color tints whichever theme is active.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-4">
          {THEME_LIST.map((theme) => {
            const active = themeId === theme.id;
            return (
              <button
                key={theme.id}
                onClick={() => setTheme(theme.id as ThemeId)}
                className={cn(
                  "text-left rounded-lg border p-3 transition-all relative overflow-hidden",
                  active
                    ? "border-[rgb(var(--workspace-accent-rgb))] ring-2 ring-[rgba(var(--workspace-accent-rgb),0.25)]"
                    : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700",
                )}
              >
                <div
                  className="h-16 rounded-md mb-2 border border-zinc-200/50 dark:border-zinc-800/60"
                  style={{ backgroundColor: theme.preview }}
                />
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {theme.label}
                  </span>
                  <span className={cn(
                    "text-[9px] uppercase tracking-wider px-1 py-px rounded",
                    theme.isDark
                      ? "bg-zinc-800 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-400"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-200 dark:text-zinc-600",
                  )}>
                    {theme.isDark ? "Dark" : "Light"}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5 leading-tight line-clamp-2">
                  {theme.description}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ─── Workspace Accent ───────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Workspace Accent
        </h2>
        <p className="text-sm text-zinc-500 mt-1">
          Pick a color per workspace so you can tell them apart at a glance.
          These overrides are personal — they only affect this device and
          don&apos;t change the workspace for other team members.
        </p>

        <div className="mt-4 border border-zinc-200 dark:border-zinc-800 rounded-lg divide-y divide-zinc-200 dark:divide-zinc-800">
          {workspaces.length === 0 && (
            <div className="px-4 py-6 text-sm text-zinc-500 text-center">
              No workspaces loaded yet.
            </div>
          )}
          {workspaces.map((ws) => {
            const override = overrides[ws.id];
            const effective = override || ws.color || "#14b8a6";
            const isOverridden = !!override;

            return (
              <div key={ws.id} className="px-4 py-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-lg"
                    style={{ backgroundColor: effective }}
                    aria-hidden
                  >
                    {ws.iconEmoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {ws.displayName}
                    </div>
                    <div className="text-xs text-zinc-500 font-mono">
                      {effective}
                      {isOverridden && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-zinc-400">
                          overridden
                        </span>
                      )}
                    </div>
                  </div>
                  {isOverridden && (
                    <button
                      onClick={() => clearColor(ws.id)}
                      title={`Reset to workspace default (${ws.color})`}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                    >
                      <RotateCcw size={12} />
                      Reset
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap pl-[52px]">
                  {PRESETS.map((preset) => {
                    const isActive =
                      effective.toLowerCase() === preset.hex.toLowerCase();
                    return (
                      <button
                        key={preset.hex}
                        onClick={() => setColor(ws.id, preset.hex)}
                        title={preset.name}
                        className={`w-6 h-6 rounded-md transition-all ${
                          isActive
                            ? "ring-2 ring-offset-2 ring-offset-white dark:ring-offset-zinc-900 ring-zinc-400 dark:ring-zinc-500 scale-110"
                            : "hover:scale-110"
                        }`}
                        style={{ backgroundColor: preset.hex }}
                      />
                    );
                  })}
                  <label
                    className="w-6 h-6 rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center cursor-pointer hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors"
                    title="Custom color"
                  >
                    <span className="text-[10px] text-zinc-400">+</span>
                    <input
                      type="color"
                      value={effective}
                      onChange={(e) => setColor(ws.id, e.target.value)}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
