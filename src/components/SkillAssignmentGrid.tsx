// Shared skill assignment grid with search, collapsible categories, bulk actions
// Used by DomainAiTab (platform skills) and BotOverviewPanel (bot skills)

import { useState, useMemo, useCallback } from "react";
import { ChevronDown, X, Check, Sparkles } from "lucide-react";
import { cn } from "../lib/cn";
import type { SkillCategory } from "../modules/skills/useSkillRegistry";

interface SkillAssignmentGridProps {
  skills: string[];
  skillEntries: Record<string, { name: string; category: string }>;
  categories: SkillCategory[];
  selectedSkills: string[];
  onToggle: (slug: string) => void;
}

export function SkillAssignmentGrid({
  skills,
  skillEntries,
  categories,
  selectedSkills,
  onToggle,
}: SkillAssignmentGridProps) {
  const [search, setSearch] = useState("");
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  const topLevel = useMemo(
    () => {
      const seen = new Set<string>();
      return [...categories]
        .filter((c) => {
          if (c.parent || seen.has(c.id)) return false;
          seen.add(c.id);
          return true;
        })
        .sort(
          (a, b) =>
            (a.order ?? 999) - (b.order ?? 999) || a.label.localeCompare(b.label)
        );
    },
    [categories]
  );
  const childrenOf = useCallback(
    (parentId: string) =>
      [...categories]
        .filter((c) => c.parent === parentId)
        .sort(
          (a, b) =>
            (a.order ?? 999) - (b.order ?? 999) || a.label.localeCompare(b.label)
        ),
    [categories]
  );

  const searchLower = search.toLowerCase();
  const filteredSkills = useMemo(
    () =>
      search
        ? skills.filter((s) => {
            const name = skillEntries[s]?.name || s;
            return (
              name.toLowerCase().includes(searchLower) ||
              s.toLowerCase().includes(searchLower)
            );
          })
        : skills,
    [skills, skillEntries, searchLower, search]
  );

  const byCategory = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const slug of filteredSkills) {
      const cat = skillEntries[slug]?.category || "";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(slug);
    }
    return map;
  }, [filteredSkills, skillEntries]);

  const catIds = new Set(categories.map((c) => c.id));
  const uncategorized = filteredSkills.filter((s) => {
    const cat = skillEntries[s]?.category || "";
    return !cat || !catIds.has(cat);
  });

  const toggleExpand = useCallback((catId: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  }, []);

  const getAllCategorySkills = useCallback(
    (catId: string) => {
      const direct = byCategory.get(catId) ?? [];
      const childSkills = childrenOf(catId).flatMap(
        (c) => byCategory.get(c.id) ?? []
      );
      return [...direct, ...childSkills];
    },
    [byCategory, childrenOf]
  );

  const handleBulkToggle = useCallback(
    (catId: string) => {
      const allSkills = getAllCategorySkills(catId);
      const allSelected = allSkills.every((s) => selectedSkills.includes(s));
      for (const slug of allSkills) {
        const isSelected = selectedSkills.includes(slug);
        if (allSelected && isSelected) onToggle(slug);
        else if (!allSelected && !isSelected) onToggle(slug);
      }
    },
    [getAllCategorySkills, selectedSkills, onToggle]
  );

  const isExpanded = (catId: string) => expandedCats.has(catId) || !!search;

  const renderSkills = (slugs: string[]) => (
    <div className="flex flex-wrap gap-1.5">
      {slugs.map((slug) => {
        const name = skillEntries[slug]?.name || slug;
        const active = selectedSkills.includes(slug);
        return (
          <button
            key={slug}
            onClick={() => onToggle(slug)}
            title={slug}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors",
              active
                ? "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-700"
                : "bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-violet-300 dark:hover:border-violet-700"
            )}
          >
            {active ? <Check size={11} /> : <Sparkles size={11} />}
            {name}
          </button>
        );
      })}
    </div>
  );

  const renderCategoryHeader = (
    cat: { id: string; label: string },
    totalCount: number,
    selectedCount: number
  ) => {
    const expanded = isExpanded(cat.id);
    return (
      <div className="flex items-center gap-2 group">
        <button
          onClick={() => toggleExpand(cat.id)}
          className="flex items-center gap-1.5 flex-1 min-w-0"
        >
          <ChevronDown
            size={12}
            className={cn(
              "text-zinc-400 transition-transform flex-shrink-0",
              !expanded && "-rotate-90"
            )}
          />
          <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
            {cat.label}
          </span>
          <span
            className={cn(
              "text-xs tabular-nums px-1.5 py-0.5 rounded-full",
              selectedCount > 0
                ? "bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 font-medium"
                : "text-zinc-400"
            )}
          >
            {selectedCount}/{totalCount}
          </span>
        </button>
        <button
          onClick={() => handleBulkToggle(cat.id)}
          className="text-xs text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          {selectedCount === totalCount ? "Deselect all" : "Select all"}
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search skills..."
          className="w-full px-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-violet-400 focus:border-violet-400"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Categories */}
      {topLevel.map((cat) => {
        const allCatSkills = getAllCategorySkills(cat.id);
        if (allCatSkills.length === 0) return null;
        const selectedCount = allCatSkills.filter((s) =>
          selectedSkills.includes(s)
        ).length;
        const directSkills = byCategory.get(cat.id) ?? [];
        const expanded = isExpanded(cat.id);
        const children = childrenOf(cat.id);

        return (
          <div key={cat.id}>
            {renderCategoryHeader(cat, allCatSkills.length, selectedCount)}
            {expanded && (
              <div className="mt-1.5">
                {children.length > 0 ? (
                  <div className="space-y-2 pl-2 border-l-2 border-zinc-100 dark:border-zinc-800">
                    {directSkills.length > 0 && renderSkills(directSkills)}
                    {children.map((child) => {
                      const childSkills = byCategory.get(child.id) ?? [];
                      if (childSkills.length === 0) return null;
                      return (
                        <div key={child.id}>
                          <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">
                            {child.label}
                          </p>
                          {renderSkills(childSkills)}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  renderSkills(directSkills)
                )}
              </div>
            )}
          </div>
        );
      })}
      {uncategorized.length > 0 && (
        <div>
          <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">
            Uncategorized
          </p>
          {renderSkills(uncategorized)}
        </div>
      )}
      {filteredSkills.length === 0 && search && (
        <p className="text-xs text-zinc-400 py-2">
          No skills match "{search}"
        </p>
      )}
    </div>
  );
}
