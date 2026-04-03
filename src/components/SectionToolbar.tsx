// src/components/SectionToolbar.tsx
// Shared toolbar for sub-views inside modules.
// Renders: [title + count]  ...spacer...  [actions]
// Always the same height, padding, and border.

import type { ReactNode } from "react";

interface SectionToolbarProps {
  /** Section title (e.g., "Campaigns", "Contacts") */
  title?: string;
  /** Item count or subtitle text shown after the title */
  subtitle?: string;
  /** Action buttons on the right side */
  actions?: ReactNode;
  /** Extra content (filters, search) rendered between title and actions */
  children?: ReactNode;
}

export function SectionToolbar({ title, subtitle, actions, children }: SectionToolbarProps) {
  return (
    <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800">
      <div className="flex items-center gap-3 min-w-0">
        {title && (
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</span>
        )}
        {subtitle && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</span>
        )}
        {children}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {actions}
        </div>
      )}
    </div>
  );
}
