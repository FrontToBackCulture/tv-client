// src/components/ViewTab.tsx
// Shared tab button — teal border-b-2 pattern
// This is the ONLY ViewTab. Do not create local copies in modules.

import type { LucideIcon } from "lucide-react";

interface ViewTabProps {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
  badge?: number;
  "data-help-id"?: string;
}

export function ViewTab({ label, icon: Icon, active, onClick, badge, "data-help-id": helpId }: ViewTabProps) {
  return (
    <button
      onClick={onClick}
      data-help-id={helpId}
      className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors relative ${
        active
          ? "text-[rgb(var(--workspace-accent-rgb))] dark:text-[rgb(var(--workspace-accent-rgb))]"
          : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      }`}
      style={active ? {
        borderImageSource: `linear-gradient(90deg, rgba(var(--workspace-accent-rgb),0) 0%, rgba(var(--workspace-accent-rgb),1) 50%, rgba(var(--workspace-accent-rgb),0) 100%)`,
        borderImageSlice: 1,
        borderBottomWidth: 2,
        borderStyle: "solid",
      } : undefined}
    >
      <Icon size={14} />
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="text-[10px] bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full">
          {badge}
        </span>
      )}
    </button>
  );
}
