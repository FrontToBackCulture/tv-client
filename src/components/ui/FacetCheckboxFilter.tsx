// Reusable multi-select checkbox filter for sidebars. Used by both the
// Skills sidebar and the Domains sidebar so the Client / Tags / Data
// Representation filters stay consistent in look + behaviour.
//
// Layout (matches the screenshot the user mocked up):
//   - Section label + Clear (N) chip if any selection
//   - Search input
//   - Scrollable checkbox list with per-option counts

import { useMemo, useState } from "react";
import { cn } from "../../lib/cn";

export interface FacetCheckboxOption {
  value: string;
  count: number;
}

interface FacetCheckboxFilterProps {
  label: string;
  options: FacetCheckboxOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Optional flex-basis class so multiple filters can share vertical space.
   *  Pass `flex-1` (default) to fill, or `max-h-44` to cap height. */
  containerClassName?: string;
}

export function FacetCheckboxFilter({
  label,
  options,
  selected,
  onChange,
  searchPlaceholder,
  emptyText = "No options",
  containerClassName = "flex-1 min-h-0",
}: FacetCheckboxFilterProps) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.value.toLowerCase().includes(q));
  }, [options, query]);

  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  };

  return (
    <div className={cn("flex flex-col overflow-hidden px-3 py-3", containerClassName)}>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {label}
        </label>
        {selected.size > 0 && (
          <button
            onClick={() => onChange(new Set())}
            className="text-[11px] text-teal-600 dark:text-teal-400 hover:underline"
            title={`Clear all selected ${label.toLowerCase()}`}
          >
            Clear ({selected.size})
          </button>
        )}
      </div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={searchPlaceholder ?? `Search ${label.toLowerCase()}…`}
        className="w-full px-2 py-1 mb-2 text-[12px] rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
      />
      <div className="flex-1 min-h-0 overflow-y-auto -mx-1">
        {visible.length === 0 ? (
          <div className="px-2 py-3 text-[11px] text-zinc-400 italic">
            {options.length === 0 ? emptyText : "No matches"}
          </div>
        ) : (
          visible.map(({ value, count }) => {
            const checked = selected.has(value);
            return (
              <label
                key={value}
                className={cn(
                  "flex items-center justify-between gap-2 px-2 py-1 rounded text-[12px] cursor-pointer",
                  checked
                    ? "bg-teal-100 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
                )}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(value)}
                    className="accent-teal-600"
                  />
                  <span className="truncate">{value}</span>
                </span>
                <span className="text-[11px] text-zinc-500 shrink-0">{count}</span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
