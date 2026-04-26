// src/components/PageHeader.tsx
// Shared page header — description + tab bar + actions
// Every module should use this for its top-level header.

import type { ReactNode } from "react";

interface PageHeaderProps {
  /** Optional one-line description shown above the tab bar */
  description?: string;
  /** Tab bar content (left side) — use <ViewTab> components */
  tabs?: ReactNode;
  /** Action buttons (right side of tab bar) */
  actions?: ReactNode;
  /** Extra content below description, above tabs (e.g., stats bar) */
  children?: ReactNode;
}

export function PageHeader({ description, tabs, actions, children }: PageHeaderProps) {
  const hasTabsOrActions = !!(tabs || actions);
  const hasAnything = !!(description || hasTabsOrActions);

  return (
    <>
      {hasAnything && (
        <div className="flex-shrink-0 flex items-center justify-between px-4 border-b border-zinc-100 dark:border-zinc-800 min-h-[44px]">
          <div className="flex items-center gap-4 overflow-x-auto min-w-0">
            {description && (
              <p className="text-xs text-zinc-400 flex-shrink-0">{description}</p>
            )}
            {tabs && (
              <div className="flex items-center overflow-x-auto">
                {tabs}
              </div>
            )}
          </div>
          {actions && (
            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
              {actions}
            </div>
          )}
        </div>
      )}
      {children}
    </>
  );
}
