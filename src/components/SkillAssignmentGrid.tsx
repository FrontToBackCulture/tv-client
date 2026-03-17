// Shared skill assignment grid with search, compact scrollable layout
// Used by DomainAiTab (platform skills) and BotOverviewPanel (bot skills)

import { useState, useMemo, useCallback } from "react";
import { X, Sparkles, ChevronDown } from "lucide-react";
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

  const searchLower = search.toLowerCase();

  // Split into assigned and unassigned
  const assigned = useMemo(
    () => skills.filter((s) => selectedSkills.includes(s)).sort((a, b) => {
      const nameA = skillEntries[a]?.name || a;
      const nameB = skillEntries[b]?.name || b;
      return nameA.localeCompare(nameB);
    }),
    [skills, selectedSkills, skillEntries]
  );

  const unassigned = useMemo(
    () => skills.filter((s) => !selectedSkills.includes(s)),
    [skills, selectedSkills]
  );

  // Filter by search
  const matchesSearch = useCallback(
    (slug: string) => {
      if (!search) return true;
      const name = skillEntries[slug]?.name || slug;
      return name.toLowerCase().includes(searchLower) || slug.toLowerCase().includes(searchLower);
    },
    [skillEntries, searchLower, search]
  );

  const filteredUnassigned = useMemo(
    () => unassigned.filter(matchesSearch),
    [unassigned, matchesSearch]
  );

  const filteredAssigned = useMemo(
    () => assigned.filter(matchesSearch),
    [assigned, matchesSearch]
  );

  // Group unassigned by top-level category
  const topLevel = useMemo(() => {
    const seen = new Set<string>();
    return [...categories]
      .filter((c) => { if (c.parent || seen.has(c.id)) return false; seen.add(c.id); return true; })
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.label.localeCompare(b.label));
  }, [categories]);

  const childCatIds = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of categories) {
      if (c.parent) {
        if (!map.has(c.parent)) map.set(c.parent, []);
        map.get(c.parent)!.push(c.id);
      }
    }
    return map;
  }, [categories]);

  const unassignedByCategory = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const slug of filteredUnassigned) {
      const cat = skillEntries[slug]?.category || "_uncategorized";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(slug);
    }
    return map;
  }, [filteredUnassigned, skillEntries]);

  const catIds = new Set(categories.map((c) => c.id));

  const getCatSkills = useCallback(
    (catId: string) => {
      const direct = unassignedByCategory.get(catId) ?? [];
      const childIds = childCatIds.get(catId) ?? [];
      const childSkills = childIds.flatMap((id) => unassignedByCategory.get(id) ?? []);
      return [...direct, ...childSkills].sort((a, b) => {
        const nameA = skillEntries[a]?.name || a;
        const nameB = skillEntries[b]?.name || b;
        return nameA.localeCompare(nameB);
      });
    },
    [unassignedByCategory, childCatIds, skillEntries]
  );

  const uncategorized = useMemo(
    () => filteredUnassigned.filter((s) => {
      const cat = skillEntries[s]?.category || "";
      return !cat || !catIds.has(cat);
    }).sort((a, b) => (skillEntries[a]?.name || a).localeCompare(skillEntries[b]?.name || b)),
    [filteredUnassigned, skillEntries, catIds]
  );

  const toggleExpand = useCallback((catId: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId); else next.add(catId);
      return next;
    });
  }, []);

  const isExpanded = (catId: string) => expandedCats.has(catId) || !!search;

  const renderPill = (slug: string, active: boolean) => {
    const name = skillEntries[slug]?.name || slug;
    return (
      <button
        key={slug}
        onClick={() => onToggle(slug)}
        title={slug}
        className={cn(
          "inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md border transition-colors",
          active
            ? "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-700"
            : "bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-violet-300 dark:hover:border-violet-700"
        )}
      >
        {active ? <X size={9} /> : <Sparkles size={9} />}
        {name}
      </button>
    );
  };

  return (
    <div className="space-y-2">
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
          <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
            <X size={12} />
          </button>
        )}
      </div>

      {/* Assigned skills - always visible */}
      {filteredAssigned.length > 0 && (
        <div>
          <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">
            Assigned ({assigned.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {filteredAssigned.map((slug) => renderPill(slug, true))}
          </div>
        </div>
      )}

      {/* Divider */}
      {filteredAssigned.length > 0 && filteredUnassigned.length > 0 && (
        <div className="border-t border-zinc-100 dark:border-zinc-800" />
      )}

      {/* Available skills - scrollable */}
      {filteredUnassigned.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
            Available ({filteredUnassigned.length})
          </p>

          {/* When searching, show flat list */}
          {search ? (
            <div className="flex flex-wrap gap-1">
              {filteredUnassigned
                .sort((a, b) => (skillEntries[a]?.name || a).localeCompare(skillEntries[b]?.name || b))
                .map((slug) => renderPill(slug, false))}
            </div>
          ) : (
            <>
              {topLevel.map((cat) => {
                const catSkills = getCatSkills(cat.id);
                if (catSkills.length === 0) return null;
                const expanded = isExpanded(cat.id);
                return (
                  <div key={cat.id}>
                    <button
                      onClick={() => toggleExpand(cat.id)}
                      className="flex items-center gap-1 w-full"
                    >
                      <ChevronDown size={10} className={cn("text-zinc-400 transition-transform flex-shrink-0", !expanded && "-rotate-90")} />
                      <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                        {cat.label}
                      </span>
                      <span className="text-[10px] text-zinc-300 dark:text-zinc-600">{catSkills.length}</span>
                    </button>
                    {expanded && (
                      <div className="flex flex-wrap gap-1 mt-1 ml-3">
                        {catSkills.map((slug) => renderPill(slug, false))}
                      </div>
                    )}
                  </div>
                );
              })}
              {uncategorized.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">
                    Uncategorized
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {uncategorized.map((slug) => renderPill(slug, false))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {filteredUnassigned.length === 0 && filteredAssigned.length === 0 && search && (
        <p className="text-xs text-zinc-400 py-2">No skills match "{search}"</p>
      )}
    </div>
  );
}
