// CrossDomainSidebar — left rail for the cross-domain review tabs (Data Models,
// Queries, Workflows, Dashboards). Same shape as DomainsSidebar so the user
// gets a consistent filter UX whether they're looking at a single domain or
// the union across all domains:
//
//   View → Category → Domain (per-row) → Data Representation → Tags
//
// "Domain" replaces "Client" here because cross-domain rows each carry their
// own `domain` (it's literally that row's home), not a deployment target.

import { useMemo } from "react";
import { Layers } from "lucide-react";
import { cn } from "../../lib/cn";
import { CollapsibleSection } from "../../components/ui/CollapsibleSection";
import { FacetCheckboxFilter } from "../../components/ui/FacetCheckboxFilter";
import type { ReviewRow, ReviewResourceType } from "./reviewTypes";

interface Props {
  resourceType: ReviewResourceType;
  rows: ReviewRow[];
  selectedDomains: string[];
  onSelectedDomainsChange: (domains: string[]) => void;
  category: string | null;
  setCategory: (c: string | null) => void;
  subCategory: string | null;
  setSubCategory: (s: string | null) => void;
  tagFilter: Set<string>;
  setTagFilter: (next: Set<string>) => void;
  dataRepFilter: Set<string>;
  setDataRepFilter: (next: Set<string>) => void;
  storageKeyPrefix: string;
}

export function CrossDomainSidebar({
  resourceType,
  rows,
  selectedDomains,
  onSelectedDomainsChange,
  category,
  setCategory,
  subCategory,
  setSubCategory,
  tagFilter,
  setTagFilter,
  dataRepFilter,
  setDataRepFilter,
  storageKeyPrefix,
}: Props) {
  const total = rows.length;
  const selectedDomainSet = useMemo(() => new Set(selectedDomains), [selectedDomains]);

  // Domain filter is array-shaped (legacy persistence) but UX is the same
  // multi-select facet as Client/Tags. Adapter wraps the Set ↔ array.
  const domainSelectedSet = selectedDomainSet;
  const setDomainSelected = (next: Set<string>) => onSelectedDomainsChange(Array.from(next));

  // Category field varies per resource type — same logic as DomainsSidebar.
  const categoryOf = (r: ReviewRow): { cat: string; sub: string } => {
    if (resourceType === "query") {
      return { cat: r.category || r.dataCategory || "Uncategorized", sub: r.dataSubCategory || "—" };
    }
    return { cat: r.dataCategory || "Uncategorized", sub: r.dataSubCategory || "—" };
  };

  const categoryGroups = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const r of rows) {
      const { cat, sub } = categoryOf(r);
      if (!map.has(cat)) map.set(cat, new Map());
      map.get(cat)!.set(sub, (map.get(cat)!.get(sub) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([cat, subMap]) => ({
        category: cat,
        total: Array.from(subMap.values()).reduce((a, b) => a + b, 0),
        subcategories: Array.from(subMap.entries())
          .map(([sub, count]) => ({ subcategory: sub, count }))
          .sort((a, b) => a.subcategory.localeCompare(b.subcategory)),
      }))
      .sort((a, b) => a.category.localeCompare(b.category));
    // categoryOf depends on resourceType only; rows is the real input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, resourceType]);

  const activeSubcategories = useMemo(() => {
    if (!category) return [];
    return categoryGroups.find((g) => g.category === category)?.subcategories ?? [];
  }, [categoryGroups, category]);

  const domainOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (r.domain) counts.set(r.domain, (counts.get(r.domain) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value));
  }, [rows]);

  const tagOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) for (const t of r.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    return Array.from(counts.entries()).map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value));
  }, [rows]);

  const dataRepOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (r.dataType) counts.set(r.dataType, (counts.get(r.dataType) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value));
  }, [rows]);

  return (
    <aside className="w-64 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 flex flex-col overflow-hidden rounded-l-md">
      {/* View — single "All" entry; cross-domain has no per-status views yet. */}
      <div className="px-3 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <CollapsibleSection title="View" storageKey={`${storageKeyPrefix}-view`}>
          <button
            onClick={() => onSelectedDomainsChange([])}
            className={cn(
              "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[13px]",
              selectedDomains.length === 0
                ? "bg-teal-100 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300"
                : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
            )}
          >
            <span className="flex items-center gap-2">
              <Layers size={13} />
              All Domains
            </span>
            <span className="text-[11px] text-zinc-500">{total}</span>
          </button>
        </CollapsibleSection>
      </div>

      {/* Category + Subcategory — dropdowns. */}
      <div className="px-3 py-3 border-b border-zinc-200 dark:border-zinc-800 space-y-2">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
            Category
          </label>
          <select
            value={category ?? "all"}
            onChange={(e) => {
              const v = e.target.value;
              setCategory(v === "all" ? null : v);
              setSubCategory(null);
            }}
            className="w-full px-2 py-1 text-[12.5px] rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            <option value="all">All categories ({total})</option>
            {categoryGroups.map(({ category: cat, total: t }) => (
              <option key={cat} value={cat}>{cat} ({t})</option>
            ))}
          </select>
        </div>

        {category && activeSubcategories.length > 0 && (
          activeSubcategories.length > 1 || activeSubcategories[0]?.subcategory !== "—"
        ) && (
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
              Subcategory
            </label>
            <select
              value={subCategory ?? "all"}
              onChange={(e) => {
                const v = e.target.value;
                setSubCategory(v === "all" ? null : v);
              }}
              className="w-full px-2 py-1 text-[12.5px] rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="all">All subcategories</option>
              {activeSubcategories.map(({ subcategory, count }) => (
                <option key={subcategory} value={subcategory}>
                  {subcategory === "—" ? "(no subcategory)" : subcategory} ({count})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Three facets. "Domain" stands in for "Client" here because each row
          IS in a domain; in the per-domain view "Client" means deployed-to. */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 flex-1 min-h-0 flex flex-col">
        <FacetCheckboxFilter
          label="Domain"
          options={domainOptions}
          selected={domainSelectedSet}
          onChange={setDomainSelected}
          searchPlaceholder="Search domains…"
          emptyText="No domains loaded yet"
          containerClassName="flex-1 min-h-0 border-b border-zinc-200 dark:border-zinc-800"
        />
        <FacetCheckboxFilter
          label="Data Representation"
          options={dataRepOptions}
          selected={dataRepFilter}
          onChange={setDataRepFilter}
          searchPlaceholder="Search data types…"
          emptyText="No data types yet"
          containerClassName="flex-1 min-h-0 border-b border-zinc-200 dark:border-zinc-800"
        />
        <FacetCheckboxFilter
          label="Tags"
          options={tagOptions}
          selected={tagFilter}
          onChange={setTagFilter}
          searchPlaceholder="Search tags…"
          emptyText="No tags yet — add some inline"
          containerClassName="flex-1 min-h-0"
        />
      </div>
    </aside>
  );
}
