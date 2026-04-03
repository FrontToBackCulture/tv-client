// src/components/BackButton.tsx
// Shared back navigation button — always ArrowLeft, always same position and style.
// Use this at the top-left of any nested/detail view.

import { ArrowLeft, ChevronRight } from "lucide-react";

interface BackButtonProps {
  onClick: () => void;
  /** Optional breadcrumb: shows "parentLabel > title" instead of bare arrow */
  parentLabel?: string;
  title?: string;
}

export function BackButton({ onClick, parentLabel, title }: BackButtonProps) {
  if (parentLabel) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={onClick}
          className="text-sm text-zinc-500 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
        >
          {parentLabel}
        </button>
        <ChevronRight size={12} className="text-zinc-300 dark:text-zinc-600" />
        {title && (
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
            {title}
          </span>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className="p-1 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
      title="Back"
    >
      <ArrowLeft size={16} />
    </button>
  );
}
