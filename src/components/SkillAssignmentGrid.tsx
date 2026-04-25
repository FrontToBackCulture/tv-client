// Shared skill assignment grid with search, compact scrollable layout
// Used by DomainAiTab (platform skills) and BotOverviewPanel (bot skills)

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { X, Sparkles, ChevronDown, Check, BadgeCheck } from "lucide-react";

const SIDEBAR_WIDTH_STORAGE_KEY = "skill-grid:sidebar-width";
const SIDEBAR_MIN = 192; // 12rem
const SIDEBAR_MAX = 640; // 40rem
const SIDEBAR_DEFAULT = 288; // 18rem
import { cn } from "../lib/cn";
import type { SkillCategory } from "../modules/skills/useSkillRegistry";

export interface SkillAssignmentEntry {
  name: string;
  category: string;
  description?: string;
  verified?: boolean;
  target?: string;
}

interface SkillAssignmentGridProps {
  skills: string[];
  skillEntries: Record<string, SkillAssignmentEntry>;
  categories: SkillCategory[];
  selectedSkills: string[];
  onToggle: (slug: string) => void;
  /** "pills" = compact chip list (default). "cards" = row with description + badges. */
  variant?: "pills" | "cards";
  /** "stacked" (default) = Available below Assigned. "split" = Available as right sidebar. */
  layout?: "stacked" | "split";
}

export function SkillAssignmentGrid({
  skills,
  skillEntries,
  categories,
  selectedSkills,
  onToggle,
  variant = "pills",
  layout = "stacked",
}: SkillAssignmentGridProps) {
  const [search, setSearch] = useState("");
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  // Resizable sidebar (split layout only). Persisted to localStorage.
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window === "undefined") return SIDEBAR_DEFAULT;
    const saved = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    return saved >= SIDEBAR_MIN && saved <= SIDEBAR_MAX ? saved : SIDEBAR_DEFAULT;
  });
  const sidebarRef = useRef<HTMLElement>(null);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const onResizeMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragStateRef.current = { startX: e.clientX, startWidth: sidebarWidth };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [sidebarWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      // Sidebar grows when the mouse moves LEFT (handle is on the left edge).
      const delta = drag.startX - e.clientX;
      const next = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, drag.startWidth + delta));
      setSidebarWidth(next);
    };
    const onUp = () => {
      if (!dragStateRef.current) return;
      dragStateRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try {
        window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
      } catch { /* ignore quota errors */ }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [sidebarWidth]);

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
      const entry = skillEntries[slug];
      const name = entry?.name || slug;
      const desc = entry?.description || "";
      return (
        name.toLowerCase().includes(searchLower) ||
        slug.toLowerCase().includes(searchLower) ||
        desc.toLowerCase().includes(searchLower)
      );
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
            : "bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-violet-300 dark:hover:border-violet-700"
        )}
      >
        {active ? <X size={9} /> : <Sparkles size={9} />}
        {name}
      </button>
    );
  };

  const renderCard = (slug: string, active: boolean) => {
    const entry = skillEntries[slug];
    const name = entry?.name || slug;
    return (
      <button
        key={slug}
        onClick={() => onToggle(slug)}
        title={slug}
        className={cn(
          "w-full flex items-start gap-3 px-3 py-2.5 rounded-md border text-left transition-colors",
          active
            ? "bg-violet-50 dark:bg-violet-900/20 border-violet-300 dark:border-violet-700/60"
            : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-violet-300 dark:hover:border-violet-700/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
        )}
      >
        <span
          className={cn(
            "flex-shrink-0 mt-0.5 w-4 h-4 rounded border flex items-center justify-center",
            active
              ? "bg-violet-600 border-violet-600 text-white"
              : "bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700"
          )}
        >
          {active && <Check size={11} strokeWidth={3} />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("text-sm font-medium", active ? "text-violet-700 dark:text-violet-300" : "text-zinc-900 dark:text-zinc-100")}>
              {name}
            </span>
            {entry?.verified && <BadgeCheck size={12} className="text-blue-500 flex-shrink-0" />}
            {entry?.target && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                {entry.target}
              </span>
            )}
          </div>
          {entry?.description && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
              {entry.description}
            </p>
          )}
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono mt-1 truncate">
            {slug}
          </p>
        </div>
      </button>
    );
  };

  const renderItem = (slug: string, active: boolean) =>
    variant === "cards" ? renderCard(slug, active) : renderPill(slug, active);

  // Compact full-width row, used for Available in split layout so long skill
  // names wrap cleanly against the left edge instead of centering.
  const renderSidebarRow = (slug: string) => {
    const name = skillEntries[slug]?.name || slug;
    return (
      <button
        key={slug}
        onClick={() => onToggle(slug)}
        title={slug}
        className="w-full flex items-start gap-1.5 px-2 py-1 text-[11px] text-left rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-violet-300 dark:hover:border-violet-700 hover:text-violet-600 dark:hover:text-violet-300 break-all"
      >
        <Sparkles size={10} className="mt-0.5 flex-shrink-0 text-zinc-400" />
        <span className="flex-1 min-w-0">{name}</span>
      </button>
    );
  };

  // In split layout, force compact sidebar rows on the Available side regardless
  // of variant — cards are too wide and wrapped pills look ugly.
  const renderAvailableItem = (slug: string) =>
    layout === "split" ? renderSidebarRow(slug) : renderItem(slug, false);

  const itemsWrapperClass = variant === "cards" ? "flex flex-col gap-1.5" : "flex flex-wrap gap-1";
  const availableWrapperClass = layout === "split" ? "flex flex-col gap-1" : itemsWrapperClass;

  const searchInput = (
    <div className="relative">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search skills..."
        className="w-full px-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-violet-400 focus:border-violet-400"
      />
      {search && (
        <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
          <X size={12} />
        </button>
      )}
    </div>
  );

  const assignedBlock = filteredAssigned.length > 0 && (
    <div>
      <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">
        Assigned ({assigned.length})
      </p>
      <div className={itemsWrapperClass}>
        {filteredAssigned.map((slug) => renderItem(slug, true))}
      </div>
    </div>
  );

  const availableBlock = filteredUnassigned.length > 0 && (
    <div className="space-y-1.5">
      <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
        Available ({filteredUnassigned.length})
      </p>

      {/* When searching, show flat list */}
      {search ? (
        <div className={availableWrapperClass}>
          {filteredUnassigned
            .sort((a, b) => (skillEntries[a]?.name || a).localeCompare(skillEntries[b]?.name || b))
            .map((slug) => renderAvailableItem(slug))}
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
                  <div className={cn("mt-1 ml-3", availableWrapperClass)}>
                    {catSkills.map((slug) => renderAvailableItem(slug))}
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
              <div className={availableWrapperClass}>
                {uncategorized.map((slug) => renderAvailableItem(slug))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  const emptyState = filteredUnassigned.length === 0 && filteredAssigned.length === 0 && search && (
    <p className="text-xs text-zinc-400 py-2">No skills match "{search}"</p>
  );

  if (layout === "split") {
    return (
      <div className="space-y-2">
        {searchInput}
        <div className="flex gap-4 items-start">
          <div className="flex-1 min-w-0 space-y-2">
            {assignedBlock}
            {emptyState}
          </div>
          {filteredUnassigned.length > 0 && (
            <aside
              ref={sidebarRef}
              className="flex-shrink-0 relative pl-4 border-l border-zinc-200 dark:border-zinc-800 sticky top-0"
              style={{ width: `${sidebarWidth}px` }}
            >
              {/* Drag handle on the left edge — wider than the visible bar for an easier hit target */}
              <div
                onMouseDown={onResizeMouseDown}
                title="Drag to resize"
                className="absolute left-0 top-0 bottom-0 w-2 -ml-1 cursor-col-resize group flex items-stretch justify-center"
              >
                <div className="w-px bg-transparent group-hover:bg-violet-400 transition-colors" />
              </div>
              <div className="space-y-1.5 max-h-[70vh] overflow-y-auto overflow-x-hidden">
                {availableBlock}
              </div>
            </aside>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {searchInput}
      {assignedBlock}
      {filteredAssigned.length > 0 && filteredUnassigned.length > 0 && (
        <div className="border-t border-zinc-100 dark:border-zinc-800" />
      )}
      {availableBlock}
      {emptyState}
    </div>
  );
}
