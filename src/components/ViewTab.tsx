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
      className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
        active
          ? "border-teal-600 text-teal-700 dark:text-teal-400 dark:border-teal-500"
          : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      }`}
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
