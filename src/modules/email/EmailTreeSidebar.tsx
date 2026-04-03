// src/modules/email/EmailTreeSidebar.tsx
// Reusable tree sidebar for email views. Groups items by a user-selected dimension.
// Left panel: collapsible tree nodes with counts. Clicking filters the main list.

import { useMemo } from "react";
import {
  Layers,
  Search,
} from "lucide-react";
import { cn } from "../../lib/cn";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GroupByOption<T> {
  key: string;
  label: string;
  /** Extract the group key(s) from an item. Return string or array for multi-group membership. */
  getGroup: (item: T) => string | string[];
  /** Optional label override for a group value (e.g. status code → display label) */
  getLabel?: (groupValue: string) => string;
  /** Optional sort for group nodes. Default: alphabetical. */
  sortGroups?: (a: string, b: string) => number;
}

export interface TreeSelection {
  /** null = "All", otherwise the group value to filter by */
  groupValue: string | null;
}

interface EmailTreeSidebarProps<T> {
  items: T[];
  groupByOptions: GroupByOption<T>[];
  /** Currently selected groupBy key */
  activeGroupBy: string;
  onGroupByChange: (key: string) => void;
  /** Currently selected tree node */
  selection: TreeSelection;
  onSelectionChange: (sel: TreeSelection) => void;
  /** Search value (controlled) */
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  /** Title shown at top */
  title: string;
  totalCount: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EmailTreeSidebar<T>({
  items,
  groupByOptions,
  activeGroupBy,
  onGroupByChange,
  selection,
  onSelectionChange,
  search,
  onSearchChange,
  searchPlaceholder = "Search...",
  title,
  totalCount,
}: EmailTreeSidebarProps<T>) {
  const activeOption = groupByOptions.find((o) => o.key === activeGroupBy) ?? groupByOptions[0];

  // Build tree: group value → count
  const groups = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      const val = activeOption.getGroup(item);
      const keys = Array.isArray(val) ? val : [val];
      for (const k of keys) {
        map.set(k, (map.get(k) || 0) + 1);
      }
    }
    const entries = Array.from(map.entries()).map(([value, count]) => ({
      value,
      label: activeOption.getLabel?.(value) ?? value,
      count,
    }));
    if (activeOption.sortGroups) {
      entries.sort((a, b) => activeOption.sortGroups!(a.value, b.value));
    } else {
      entries.sort((a, b) => a.label.localeCompare(b.label));
    }
    return entries;
  }, [items, activeOption]);

  return (
    <div className="w-52 flex-shrink-0 border-r border-zinc-100 dark:border-zinc-800 flex flex-col bg-zinc-50/50 dark:bg-zinc-950/50">
      {/* Header */}
      <div className="flex-shrink-0 px-3 pt-3 pb-2 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            {title}
          </h2>
          <span className="text-[10px] text-zinc-400">{totalCount}</span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-7 pr-2 py-1 text-[11px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>

        {/* Group-by selector */}
        {groupByOptions.length > 1 && (
          <div className="flex items-center gap-1.5">
            <Layers size={10} className="text-zinc-400 flex-shrink-0" />
            <select
              value={activeGroupBy}
              onChange={(e) => {
                onGroupByChange(e.target.value);
                onSelectionChange({ groupValue: null });
              }}
              className="flex-1 px-1.5 py-0.5 text-[10px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded text-zinc-600 dark:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              {groupByOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-auto px-1 pb-2">
        {/* "All" node */}
        <button
          onClick={() => onSelectionChange({ groupValue: null })}
          className={cn(
            "w-full flex items-center justify-between px-2 py-1.5 text-[11px] rounded-md transition-colors",
            selection.groupValue === null
              ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium shadow-sm"
              : "text-zinc-600 dark:text-zinc-400 hover:bg-white/70 dark:hover:bg-zinc-800/50",
          )}
        >
          <span>All</span>
          <span className="text-[10px] text-zinc-400">{totalCount}</span>
        </button>

        {/* Group nodes */}
        <div className="mt-0.5 space-y-px">
          {groups.map((group) => {
            const isActive = selection.groupValue === group.value;
            return (
              <button
                key={group.value}
                onClick={() =>
                  onSelectionChange({
                    groupValue: isActive ? null : group.value,
                  })
                }
                className={cn(
                  "w-full flex items-center justify-between px-2 py-1.5 text-[11px] rounded-md transition-colors",
                  isActive
                    ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium shadow-sm"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-white/70 dark:hover:bg-zinc-800/50",
                )}
              >
                <span className="truncate">{group.label || "(none)"}</span>
                <span className="text-[10px] text-zinc-400 flex-shrink-0 ml-1">{group.count}</span>
              </button>
            );
          })}
        </div>

        {groups.length === 0 && (
          <p className="text-[10px] text-zinc-400 px-2 py-3 text-center">No groups</p>
        )}
      </div>
    </div>
  );
}
