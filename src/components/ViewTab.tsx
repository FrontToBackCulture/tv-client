// src/components/ViewTab.tsx
// Shared tab button — teal border-b-2 pattern (extracted from CRM / Bot)

import type { LucideIcon } from "lucide-react";

interface ViewTabProps {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
  "data-help-id"?: string;
}

export function ViewTab({ label, icon: Icon, active, onClick, "data-help-id": helpId }: ViewTabProps) {
  return (
    <button
      onClick={onClick}
      data-help-id={helpId}
      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
        active
          ? "border-teal-500 text-zinc-800 dark:text-zinc-100"
          : "border-transparent text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-400"
      }`}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}
