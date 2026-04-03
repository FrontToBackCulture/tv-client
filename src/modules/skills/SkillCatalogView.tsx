// src/modules/skills/SkillCatalogView.tsx
// Browse, search, filter all skills in the central registry

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Search, Activity, Bot, Boxes, CheckCircle2, AlertTriangle, Clock, GripVertical, ChevronRight, Plus, X, ChevronsUpDown, ChevronsDownUp, ShieldCheck, LayoutDashboard, Table2, Zap } from "lucide-react";
import { ViewTab } from "../../components/ViewTab";
import { PageHeader } from "../../components/PageHeader";
import { ResizablePanel } from "../../components/ResizablePanel";
import { cn } from "../../lib/cn";
import { toSGTDateString } from "../../lib/date";
import {
  type SkillEntry,
  type SkillDriftStatus,
  type SkillRegistry,
  type SkillCategory,
  useSkillSummary,
} from "./useSkillRegistry";
import { useUpdateSkill } from "../../hooks/skills/useSkills";
import { supabase } from "../../lib/supabase";
import { SkillDetailPanel } from "./SkillDetailPanel";
import { SkillReviewGrid } from "./SkillReviewGrid";
import { PromptBuilder } from "./PromptBuilder";
import { usePersistedModuleView } from "../../hooks/usePersistedModuleView";
import { useAuth } from "../../stores/authStore";

interface SkillCatalogViewProps {
  registry: SkillRegistry;
  driftStatuses: SkillDriftStatus[];
}

type TargetFilter = "all" | "bot" | "platform";
type StatusFilter = "all" | "active" | "inactive" | "deprecated" | "test" | "review" | "draft";
type VerifiedFilter = "all" | "verified" | "unverified";
type SortOption = "name" | "modified" | "status";

interface SkillWithSlug extends SkillEntry {
  slug: string;
}

// ─── Drag types (pointer-based, works in Tauri) ─────────────────────────────

type DragItem = { type: "skill"; slug: string } | { type: "category"; id: string };

interface DragState {
  item: DragItem;
  startY: number;
  active: boolean;
}
import React from "react";

export function SkillCatalogView({ registry, driftStatuses }: SkillCatalogViewProps) {
  const authUser = useAuth((s) => s.user);
  const defaultVerified: VerifiedFilter = (authUser?.login === "melvinFTBC" || authUser?.login === "melvinwang") ? "all" : "verified";

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [reviewSelectedSlug, setReviewSelectedSlug] = useState<string | null>(null);
  const [view, setView] = usePersistedModuleView<"catalog" | "review" | "prompt-builder">("skills", "catalog");
  const [search, setSearch] = useState("");
  const [activeCategory, _setActiveCategory] = useState("all");
  const [targetFilter, setTargetFilter] = useState<TargetFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [verifiedFilter, setVerifiedFilter] = useState<VerifiedFilter>(defaultVerified);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [sortBy, setSortBy] = useState<SortOption>("modified");
  const [modFrom, setModFrom] = useState<string>("");
  const [modTo, setModTo] = useState<string>("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Pointer-based drag state (replaces HTML5 DnD which doesn't work in Tauri)
  const dragRef = useRef<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const { data: modInfos } = useSkillSummary();
  const updateSkill = useUpdateSkill();

  // Helper: find the label for a category ID
  const categoryLabel = useCallback((categoryId: string) => {
    const cat = registry.categories.find(c => c.id === categoryId);
    return cat?.label ?? categoryId;
  }, [registry.categories]);

  // Context menu state for skill → category assignment
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; slug: string } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Reposition context menu if it overflows viewport
  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const el = contextMenuRef.current;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let { x, y } = contextMenu;
    if (rect.bottom > vh) y = Math.max(4, vh - rect.height - 4);
    if (rect.right > vw) x = Math.max(4, vw - rect.width - 4);
    if (x !== contextMenu.x || y !== contextMenu.y) {
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    }
  }, [contextMenu]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [contextMenu]);

  // Category CRUD helpers — write to Supabase
  const handleCreateCategory = useCallback((_label: string, _parent?: string) => {
    // Categories are derived from skill data — creating a category is a no-op
    // until a skill is assigned to it. No separate storage needed.
  }, []);

  const handleRenameCategory = useCallback(async (categoryId: string, newLabel: string) => {
    if (!newLabel.trim()) return;
    const oldLabel = categoryLabel(categoryId);
    // Update all skills with this category
    await supabase
      .from("skills")
      .update({ category: newLabel.trim() })
      .eq("category", oldLabel);
    // Invalidate to rebuild
    updateSkill.mutate({ slug: "__noop__", updates: {} }, { onError: () => {} });
  }, [categoryLabel, updateSkill]);

  const handleDeleteCategory = useCallback(async (categoryId: string) => {
    const oldLabel = categoryLabel(categoryId);
    // Move all skills in this category to Uncategorized
    await supabase
      .from("skills")
      .update({ category: "Uncategorized" })
      .eq("category", oldLabel);
    updateSkill.mutate({ slug: "__noop__", updates: {} }, { onError: () => {} });
  }, [categoryLabel, updateSkill]);

  const handleMoveSkillToCategory = useCallback((slug: string, categoryId: string) => {
    const label = categoryLabel(categoryId);
    updateSkill.mutate({ slug, updates: { category: label || "Uncategorized" } });
    setContextMenu(null);
  }, [categoryLabel, updateSkill]);

  const handleReparentCategory = useCallback((_categoryId: string, _newParent: string | undefined) => {
    // Category hierarchy is flat in Supabase — reparenting is a no-op
  }, []);

  const handleDragBegin = useCallback((item: DragItem, e: React.PointerEvent) => {
    dragRef.current = { item, startY: e.clientY, active: false };

    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current) return;
      if (!dragRef.current.active && Math.abs(ev.clientY - dragRef.current.startY) > 5) {
        dragRef.current.active = true;
        // Suppress the click that would fire on pointerup
        const suppressClick = (ce: MouseEvent) => { ce.stopPropagation(); ce.preventDefault(); };
        document.addEventListener("click", suppressClick, { capture: true, once: true });
      }
      if (dragRef.current.active) {
        // Find drop target under cursor via data attribute
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const dropEl = el?.closest("[data-drop-id]") as HTMLElement | null;
        setDropTarget(dropEl?.dataset.dropId ?? null);
      }
    };

    const onUp = (ev: PointerEvent) => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);

      if (dragRef.current?.active) {
        // Find final drop target
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const dropEl = el?.closest("[data-drop-id]") as HTMLElement | null;
        const targetId = dropEl?.dataset.dropId ?? null;

        if (targetId !== null) {
          const currentItem = dragRef.current.item;
          if (currentItem.type === "skill") {
            handleMoveSkillToCategory(currentItem.slug, targetId);
          } else if (currentItem.type === "category" && currentItem.id !== targetId) {
            handleReparentCategory(currentItem.id, targetId || undefined);
          }
        }
      }

      dragRef.current = null;
      setDropTarget(null);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }, [handleMoveSkillToCategory, handleReparentCategory]);

  // Build modification date lookup
  const modDateMap = useMemo(() => {
    const map = new Map<string, string>();
    if (modInfos) {
      for (const m of modInfos) map.set(m.slug, m.last_modified);
    }
    return map;
  }, [modInfos]);

  // Build skill list from registry
  const allSkills = useMemo(() => {
    return Object.entries(registry.skills).map(([slug, entry]) => ({
      slug,
      ...entry,
    }));
  }, [registry.skills]);

  // Filter skills
  const filtered = useMemo(() => {
    return allSkills.filter((s) => {
      if (activeCategory !== "all" && s.category !== activeCategory) return false;
      if (targetFilter !== "all" && s.target !== targetFilter) return false;
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (verifiedFilter === "verified" && !s.verified) return false;
      if (verifiedFilter === "unverified" && s.verified) return false;
      if (modFrom || modTo) {
        const modDate = modDateMap.get(s.slug) ?? "";
        const dateOnly = modDate.slice(0, 10); // YYYY-MM-DD
        if (!dateOnly) return false;
        if (modFrom && dateOnly < modFrom) return false;
        if (modTo && dateOnly > modTo) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        return (
          s.slug.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          (s.command?.toLowerCase().includes(q) ?? false) ||
          (s.domain?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
  }, [allSkills, activeCategory, targetFilter, statusFilter, verifiedFilter, modFrom, modTo, modDateMap, search]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allSkills.length };
    for (const s of allSkills) {
      counts[s.category] = (counts[s.category] || 0) + 1;
    }
    return counts;
  }, [allSkills]);

  const selectedSkill = selectedSlug ? registry.skills[selectedSlug] : null;
  const selectedDriftStatuses = selectedSlug
    ? driftStatuses.filter((d) => d.slug === selectedSlug)
    : [];

  const reviewSkill = reviewSelectedSlug ? registry.skills[reviewSelectedSlug] : null;
  const reviewDriftStatuses = reviewSelectedSlug
    ? driftStatuses.filter((d) => d.slug === reviewSelectedSlug)
    : [];

  // Sort function
  const sortSkills = useCallback((skills: SkillWithSlug[]) => {
    const sorted = [...skills];
    switch (sortBy) {
      case "name":
        sorted.sort((a, b) => a.slug.localeCompare(b.slug));
        break;
      case "modified":
        sorted.sort((a, b) => {
          const aDate = modDateMap.get(a.slug) ?? "";
          const bDate = modDateMap.get(b.slug) ?? "";
          return bDate.localeCompare(aDate); // most recent first
        });
        break;
      case "status": {
        const statusOrder: Record<string, number> = { active: 0, test: 1, inactive: 2, deprecated: 3 };
        sorted.sort((a, b) => {
          const diff = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
          return diff !== 0 ? diff : a.slug.localeCompare(b.slug);
        });
        break;
      }
    }
    return sorted;
  }, [sortBy, modDateMap]);

  // Group filtered skills by target
  const botSkills = useMemo(() => sortSkills(filtered.filter((s) => s.target === "bot" || s.target === "both")), [filtered, sortSkills]);
  const platformSkills = useMemo(() => sortSkills(filtered.filter((s) => s.target === "platform" || s.target === "both")), [filtered, sortSkills]);

  // Resize handle — uses pointer capture for smooth, jank-free resizing
  const handleResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMove = (ev: PointerEvent) => {
      const delta = ev.clientX - startX;
      setSidebarWidth(Math.max(180, Math.min(500, startWidth + delta)));
    };
    const onUp = () => {
      target.releasePointerCapture(e.pointerId);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  }, [sidebarWidth]);



  // Build level-aware key sets for collapse controls
  const groupKeysByLevel = useMemo(() => {
    const level1: string[] = []; // root group headers: "bot", "platform"
    const level2: string[] = []; // parent categories: "bot/{parentCatId}"
    const level3: string[] = []; // subcategories: "bot/{childCatId}"

    const addKeys = (groupKey: string, skills: SkillWithSlug[]) => {
      level1.push(groupKey);
      // Collect child category IDs per parent for indirect skill membership
      const childCatsOf: Record<string, string[]> = {};
      for (const cat of registry.categories) {
        if (cat.parent) {
          if (!childCatsOf[cat.parent]) childCatsOf[cat.parent] = [];
          childCatsOf[cat.parent].push(cat.id);
        }
      }
      for (const cat of registry.categories) {
        if (!cat.parent) {
          // Parent category: include if it has direct skills OR skills in any child category
          const childIds = childCatsOf[cat.id] ?? [];
          const hasSkills = skills.some(s => s.category === cat.id || childIds.includes(s.category));
          if (hasSkills) level2.push(`${groupKey}/${cat.id}`);
        } else {
          if (skills.some(s => s.category === cat.id)) {
            level3.push(`${groupKey}/${cat.id}`);
          }
        }
      }
      if (skills.some(s => !s.category || !registry.categories.some(c => c.id === s.category))) {
        level2.push(`${groupKey}/uncategorized`);
      }
    };
    if (botSkills.length > 0) addKeys("bot", botSkills);
    if (platformSkills.length > 0) addKeys("platform", platformSkills);
    return { level1, level2, level3 };
  }, [registry.categories, botSkills, platformSkills]);

  const [showCollapseMenu, setShowCollapseMenu] = useState(false);

  // Default to collapsed at level 2 (show root + parent categories, hide skills + subcategories)
  const initialCollapseApplied = useRef(false);
  useEffect(() => {
    if (initialCollapseApplied.current) return;
    const { level2, level3 } = groupKeysByLevel;
    if (level2.length > 0 || level3.length > 0) {
      const toCollapse = new Set<string>();
      level2.forEach(k => toCollapse.add(k));
      level3.forEach(k => toCollapse.add(k));
      setCollapsedGroups(toCollapse);
      initialCollapseApplied.current = true;
    }
  }, [groupKeysByLevel]);

  const expandAll = useCallback(() => {
    setCollapsedGroups(new Set());
  }, []);

  const collapseToLevel = useCallback((level: number) => {
    const toCollapse = new Set<string>();
    if (level <= 1) {
      // Only root headers visible — collapse root groups so their contents hide
      groupKeysByLevel.level1.forEach(k => toCollapse.add(k));
    } else if (level === 2) {
      // Show root + parent category names — collapse parent categories so their skills/sub-cats hide
      groupKeysByLevel.level2.forEach(k => toCollapse.add(k));
      groupKeysByLevel.level3.forEach(k => toCollapse.add(k));
    } else if (level === 3) {
      // Show root + parents expanded + sub-categories collapsed
      groupKeysByLevel.level3.forEach(k => toCollapse.add(k));
    }
    setCollapsedGroups(toCollapse);
  }, [groupKeysByLevel]);

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        description={
          view === "catalog"
            ? "Browse all skills by category — click to view details, right-click to move between categories. Assign skills to domains from the domain AI tab."
            : view === "review"
            ? "Full grid view of all skills — sort, filter, and review metadata. Click a row to see the SKILL.md preview."
            : "Build and manage reusable prompt templates for report-generation skills — configure baseline, monthly, and year-in-review prompts."
        }
        tabs={<>
          <ViewTab label="Browse" icon={LayoutDashboard} active={view === "catalog"} onClick={() => setView("catalog")} />
          <ViewTab label="Manage" icon={Table2} active={view === "review"} onClick={() => setView("review")} />
          <ViewTab label="Prompt Builder" icon={Zap} active={view === "prompt-builder"} onClick={() => setView("prompt-builder")} />
        </>}
      />

      {/* Search + filters (only in catalog/dashboard view) */}
      {view === "catalog" && <SkillFilterBar
        search={search} onSearchChange={setSearch}
        targetFilter={targetFilter} onTargetChange={setTargetFilter}
        statusFilter={statusFilter} onStatusChange={setStatusFilter}
        verifiedFilter={verifiedFilter} onVerifiedChange={setVerifiedFilter}
        modFrom={modFrom} modTo={modTo} onModFromChange={setModFrom} onModToChange={setModTo}
        sortBy={sortBy} onSortChange={setSortBy}
      />}

      {/* Context menu for moving skill to category */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg py-1 min-w-[200px] max-h-[calc(100vh-8px)] overflow-y-auto"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Move to category
          </div>
          <button
            onClick={() => handleMoveSkillToCategory(contextMenu.slug, "")}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors",
              registry.skills[contextMenu.slug]?.category === "" ? "text-teal-600 font-medium" : "text-zinc-600 dark:text-zinc-300"
            )}
          >
            <span className="flex-1 text-left">Uncategorized</span>
            <span className="text-xs text-zinc-400">{categoryCounts[""] || 0}</span>
          </button>
          {/* Render categories hierarchically: top-level first, then children indented */}
          {registry.categories.filter(c => !c.parent).map(cat => {
            const children = registry.categories.filter(c => c.parent === cat.id);
            return (
              <div key={cat.id}>
                <div className="flex items-center group/ctx">
                  <button
                    onClick={() => handleMoveSkillToCategory(contextMenu.slug, cat.id)}
                    className={cn(
                      "flex-1 flex items-center gap-2 pl-3 pr-1 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-left",
                      registry.skills[contextMenu.slug]?.category === cat.id ? "text-teal-600 font-medium" : "text-zinc-600 dark:text-zinc-300"
                    )}
                  >
                    <span className="flex-1 truncate">{cat.label}</span>
                    <span className="text-xs text-zinc-400">{categoryCounts[cat.id] || 0}</span>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id); setContextMenu(null); }}
                    className="px-1.5 py-1.5 opacity-0 group-hover/ctx:opacity-100 transition-opacity text-zinc-400 hover:text-red-500"
                    title="Delete category"
                  >
                    <X size={10} />
                  </button>
                </div>
                {children.map(child => (
                  <div key={child.id} className="flex items-center group/ctx">
                    <button
                      onClick={() => handleMoveSkillToCategory(contextMenu.slug, child.id)}
                      className={cn(
                        "flex-1 flex items-center gap-2 pl-7 pr-1 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-left",
                        registry.skills[contextMenu.slug]?.category === child.id ? "text-teal-600 font-medium" : "text-zinc-600 dark:text-zinc-300"
                      )}
                    >
                      <span className="flex-1 truncate">{child.label}</span>
                      <span className="text-xs text-zinc-400">{categoryCounts[child.id] || 0}</span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteCategory(child.id); setContextMenu(null); }}
                      className="px-1.5 py-1.5 opacity-0 group-hover/ctx:opacity-100 transition-opacity text-zinc-400 hover:text-red-500"
                      title="Delete category"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Content: list + detail */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: skill list (only in catalog/dashboard view) */}
        {view === "catalog" && <div
          className="overflow-y-auto flex-shrink-0"
          style={{ width: sidebarWidth }}
        >
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
              {allSkills.length === 0 ? (
                <>
                  <AlertTriangle size={24} className="mb-2" />
                  <p className="text-xs mb-3">No skills found</p>
                </>
              ) : (
                <p className="text-xs">No skills match your filters</p>
              )}
            </div>
          ) : (
            <div className="py-1">
              {/* Expand/Collapse controls */}
              <div className="flex justify-end items-center gap-1 px-3 py-1">
                <button
                  onClick={expandAll}
                  className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                  title="Expand All"
                >
                  <ChevronsUpDown size={13} />
                </button>
                <div className="relative">
                  <button
                    onClick={() => setShowCollapseMenu(!showCollapseMenu)}
                    className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                    title="Collapse to level"
                  >
                    <ChevronsDownUp size={13} />
                  </button>
                  {showCollapseMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowCollapseMenu(false)} />
                      <div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-800 z-50 py-1">
                        <button
                          onClick={() => { collapseToLevel(1); setShowCollapseMenu(false); }}
                          className="w-full text-left px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                        >
                          Level 1 (Root)
                        </button>
                        <button
                          onClick={() => { collapseToLevel(2); setShowCollapseMenu(false); }}
                          className="w-full text-left px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                        >
                          Level 2
                        </button>
                        <button
                          onClick={() => { collapseToLevel(3); setShowCollapseMenu(false); }}
                          className="w-full text-left px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                        >
                          Level 3
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
              {botSkills.length > 0 && (
                <SkillGroup
                  groupKey="bot"
                  label={`Bot Skills (${botSkills.length})`}
                  skills={botSkills}
                  categories={registry.categories}
                  selectedSlug={selectedSlug}
                  onSelect={setSelectedSlug}
                  collapsedGroups={collapsedGroups}
                  onToggleGroup={toggleGroup}
                  onCreateCategory={handleCreateCategory}
                  onRenameCategory={handleRenameCategory}
                  onDeleteCategory={handleDeleteCategory}
                  onDragBegin={handleDragBegin}
                  dropTarget={dropTarget}
                  onContextMenu={(e, slug) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, slug }); }}
                />
              )}
              {platformSkills.length > 0 && (
                <SkillGroup
                  groupKey="platform"
                  label={`Platform Skills (${platformSkills.length})`}
                  skills={platformSkills}
                  categories={registry.categories}
                  selectedSlug={selectedSlug}
                  onSelect={setSelectedSlug}
                  collapsedGroups={collapsedGroups}
                  onToggleGroup={toggleGroup}
                  onCreateCategory={handleCreateCategory}
                  onRenameCategory={handleRenameCategory}
                  onDeleteCategory={handleDeleteCategory}
                  onDragBegin={handleDragBegin}
                  dropTarget={dropTarget}
                  onContextMenu={(e, slug) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, slug }); }}
                />
              )}
            </div>
          )}
        </div>}

        {/* Resize handle (only in catalog view) */}
        {view === "catalog" && (
          <div
            onPointerDown={handleResizePointerDown}
            className="w-2 flex-shrink-0 cursor-col-resize group flex items-center justify-center border-r border-zinc-100 dark:border-zinc-800 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors touch-none"
          >
            <GripVertical size={10} className="text-zinc-300 dark:text-zinc-600 group-hover:text-teal-500 transition-colors" />
          </div>
        )}

        {/* Right: content area */}
        {view === "catalog" ? (
          /* Dashboard view: detail panel or dashboard */
          selectedSlug && selectedSkill ? (
            <div className="flex-1 min-w-0">
              <SkillDetailPanel
                key={selectedSlug}
                slug={selectedSlug}
                skill={selectedSkill}
                registry={registry}
                driftStatuses={selectedDriftStatuses}
                onClose={() => setSelectedSlug(null)}
              />
            </div>
          ) : (
            <div className="flex-1 min-w-0 overflow-y-auto">
              <SkillDashboard
                registry={registry}
                allSkills={allSkills}
                driftStatuses={driftStatuses}
                onSelectSkill={setSelectedSlug}
              />
            </div>
          )
        ) : view === "review" ? (
          /* Review view: grid + optional slide-out detail */
          <div className="flex-1 min-w-0 flex overflow-hidden">
            <div className="flex-1 min-w-0">
              <SkillReviewGrid
                onSelectSkill={setReviewSelectedSlug}
              />
            </div>
            {reviewSelectedSlug && reviewSkill && (
              <ResizablePanel storageKey="tv-skill-review-detail-width" defaultWidth={600} minWidth={400} maxWidth={1000}>
                <SkillDetailPanel
                  key={reviewSelectedSlug}
                  slug={reviewSelectedSlug}
                  skill={reviewSkill}
                  registry={registry}
                  driftStatuses={reviewDriftStatuses}
                  onClose={() => setReviewSelectedSlug(null)}
                />
              </ResizablePanel>
            )}
          </div>
        ) : (
          /* Prompt Builder view */
          <div className="flex-1 min-w-0 overflow-hidden">
            <PromptBuilder registry={registry} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SkillGroup({
  groupKey,
  label,
  skills,
  categories,
  selectedSlug,
  onSelect,
  collapsedGroups,
  onToggleGroup,
  onCreateCategory,
  onRenameCategory,
  onDeleteCategory,
  onDragBegin,
  dropTarget,
  onContextMenu,
}: {
  groupKey: string;
  label: string;
  skills: SkillWithSlug[];
  categories: SkillCategory[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  collapsedGroups: Set<string>;
  onToggleGroup: (key: string) => void;
  onCreateCategory: (label: string, parent?: string) => void;
  onRenameCategory: (id: string, label: string) => void;
  onDeleteCategory: (id: string) => void;
  onDragBegin: (item: DragItem, e: React.PointerEvent) => void;
  dropTarget: string | null;
  onContextMenu: (e: React.MouseEvent, slug: string) => void;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [creatingParent, setCreatingParent] = useState<string | undefined>(undefined);
  const [newCatLabel, setNewCatLabel] = useState("");
  const [renamingCatId, setRenamingCatId] = useState<string | null>(null);
  const [renameLabel, setRenameLabel] = useState("");
  const createInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const isCollapsed = collapsedGroups.has(groupKey);

  // Focus inputs when they appear
  useEffect(() => {
    if (isCreating) createInputRef.current?.focus();
  }, [isCreating]);
  useEffect(() => {
    if (renamingCatId) renameInputRef.current?.focus();
  }, [renamingCatId]);

  // Separate top-level categories from sub-categories
  const topLevelCategories = useMemo(() => {
    return [...categories].filter(c => !c.parent).sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.label.localeCompare(b.label));
  }, [categories]);

  const childCategoriesOf = useCallback((parentId: string) => {
    return [...categories].filter(c => c.parent === parentId).sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.label.localeCompare(b.label));
  }, [categories]);

  const skillsByCategory = useMemo(() => {
    const map = new Map<string, SkillWithSlug[]>();
    for (const s of skills) {
      const catId = s.category || "";
      if (!map.has(catId)) map.set(catId, []);
      map.get(catId)!.push(s);
    }
    return map;
  }, [skills]);

  // Count skills in a category + all its children
  const totalSkillCount = useCallback((catId: string) => {
    let count = skillsByCategory.get(catId)?.length ?? 0;
    for (const child of childCategoriesOf(catId)) {
      count += skillsByCategory.get(child.id)?.length ?? 0;
    }
    return count;
  }, [skillsByCategory, childCategoriesOf]);

  const handleCreateSubmit = () => {
    const trimmed = newCatLabel.trim();
    if (trimmed) onCreateCategory(trimmed, creatingParent);
    setNewCatLabel("");
    setIsCreating(false);
    setCreatingParent(undefined);
  };

  const handleRenameSubmit = () => {
    if (renamingCatId && renameLabel.trim()) {
      onRenameCategory(renamingCatId, renameLabel);
    }
    setRenamingCatId(null);
    setRenameLabel("");
  };

  const startCreating = (parent?: string) => {
    setCreatingParent(parent);
    setIsCreating(true);
  };

  return (
    <div className="mb-2">
      {/* Group header — drop here to uncategorize / promote to top-level */}
      <div
        data-drop-id=""
        className={cn("flex items-center group", dropTarget === "" && "bg-teal-50 dark:bg-teal-900/20")}
      >
        <button
          onClick={() => onToggleGroup(groupKey)}
          className="flex-1 flex items-center gap-1.5 px-3 py-1.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
        >
          <ChevronRight size={10} className={cn("text-zinc-400 transition-transform", !isCollapsed && "rotate-90")} />
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            {label}
          </span>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); startCreating(); }}
          className="px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-teal-500"
          title="Add category"
        >
          <Plus size={12} />
        </button>
      </div>

      {!isCollapsed && (
        <>
          {/* Inline create input (top-level) */}
          {isCreating && !creatingParent && (
            <div className="px-3 py-1">
              <input
                ref={createInputRef}
                value={newCatLabel}
                onChange={(e) => setNewCatLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateSubmit();
                  if (e.key === "Escape") { setIsCreating(false); setNewCatLabel(""); setCreatingParent(undefined); }
                }}
                onBlur={handleCreateSubmit}
                placeholder="Category name..."
                className="w-full px-2 py-1 text-xs rounded border border-teal-400 dark:border-teal-600 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
          )}

          {/* Hierarchical category rendering */}
          {topLevelCategories.map(cat => {
            const catSkills = skillsByCategory.get(cat.id) ?? [];
            const children = childCategoriesOf(cat.id);
            const total = totalSkillCount(cat.id);
            if (total === 0) return null;

            const subKey = `${groupKey}/${cat.id}`;
            const isCatCollapsed = collapsedGroups.has(subKey);

            return (
              <div key={cat.id}>
                {/* Category header */}
                <div
                  data-drop-id={cat.id}
                  className={cn("flex items-center group/cat", dropTarget === cat.id && "bg-teal-50 dark:bg-teal-900/20 rounded")}
                  onPointerDown={(e) => { if (e.button === 0) onDragBegin({ type: "category", id: cat.id }, e); }}
                >
                  <button
                    onClick={() => onToggleGroup(subKey)}
                    className="flex-1 flex items-center gap-1.5 pl-6 pr-2 py-1 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <ChevronRight size={9} className={cn("text-zinc-400 transition-transform", !isCatCollapsed && "rotate-90")} />
                    {renamingCatId === cat.id ? (
                      <input
                        ref={renameInputRef}
                        value={renameLabel}
                        onChange={(e) => setRenameLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameSubmit();
                          if (e.key === "Escape") { setRenamingCatId(null); setRenameLabel(""); }
                        }}
                        onBlur={handleRenameSubmit}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 px-1 py-0 text-xs rounded border border-teal-400 dark:border-teal-600 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 focus:outline-none"
                      />
                    ) : (
                      <span
                        className="text-xs font-medium text-zinc-500 dark:text-zinc-400 truncate"
                        onDoubleClick={(e) => { e.stopPropagation(); setRenamingCatId(cat.id); setRenameLabel(cat.label); }}
                      >
                        {cat.label}
                      </span>
                    )}
                    <span className="text-xs text-zinc-400 ml-auto">{total}</span>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); startCreating(cat.id); }}
                    className="px-1 py-1 opacity-0 group-hover/cat:opacity-100 transition-opacity text-zinc-400 hover:text-teal-500"
                    title="Add sub-category"
                  >
                    <Plus size={10} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteCategory(cat.id); }}
                    className="px-1.5 py-1 opacity-0 group-hover/cat:opacity-100 transition-opacity text-zinc-400 hover:text-red-500"
                    title="Delete category"
                  >
                    <X size={10} />
                  </button>
                </div>

                {!isCatCollapsed && (
                  <>
                    {/* Inline create input for sub-category */}
                    {isCreating && creatingParent === cat.id && (
                      <div className="pl-9 pr-3 py-1">
                        <input
                          ref={createInputRef}
                          value={newCatLabel}
                          onChange={(e) => setNewCatLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleCreateSubmit();
                            if (e.key === "Escape") { setIsCreating(false); setNewCatLabel(""); setCreatingParent(undefined); }
                          }}
                          onBlur={handleCreateSubmit}
                          placeholder="Sub-category name..."
                          className="w-full px-2 py-1 text-xs rounded border border-teal-400 dark:border-teal-600 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-teal-500"
                        />
                      </div>
                    )}

                    {/* Direct skills in this parent category */}
                    {catSkills.map(s => (
                      <SkillRow key={s.slug} skill={s} selectedSlug={selectedSlug} onSelect={onSelect} onContextMenu={onContextMenu} onDragBegin={onDragBegin} indent={2} />
                    ))}

                    {/* Sub-categories */}
                    {children.map(child => {
                      const childSkills = skillsByCategory.get(child.id) ?? [];
                      if (childSkills.length === 0) return null;
                      const childKey = `${groupKey}/${child.id}`;
                      const isChildCollapsed = collapsedGroups.has(childKey);

                      return (
                        <div key={child.id}>
                          {/* Sub-category header */}
                          <div
                            data-drop-id={child.id}
                            className={cn("flex items-center group/subcat", dropTarget === child.id && "bg-teal-50 dark:bg-teal-900/20 rounded")}
                            onPointerDown={(e) => { if (e.button === 0) onDragBegin({ type: "category", id: child.id }, e); }}
                          >
                            <button
                              onClick={() => onToggleGroup(childKey)}
                              className="flex-1 flex items-center gap-1.5 pl-9 pr-2 py-1 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                            >
                              <ChevronRight size={8} className={cn("text-zinc-400 transition-transform", !isChildCollapsed && "rotate-90")} />
                              {renamingCatId === child.id ? (
                                <input
                                  ref={renameInputRef}
                                  value={renameLabel}
                                  onChange={(e) => setRenameLabel(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleRenameSubmit();
                                    if (e.key === "Escape") { setRenamingCatId(null); setRenameLabel(""); }
                                  }}
                                  onBlur={handleRenameSubmit}
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex-1 px-1 py-0 text-xs rounded border border-teal-400 dark:border-teal-600 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 focus:outline-none"
                                />
                              ) : (
                                <span
                                  className="text-xs font-medium text-zinc-500 dark:text-zinc-400 truncate"
                                  onDoubleClick={(e) => { e.stopPropagation(); setRenamingCatId(child.id); setRenameLabel(child.label); }}
                                >
                                  {child.label}
                                </span>
                              )}
                              <span className="text-xs text-zinc-400 ml-auto">{childSkills.length}</span>
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); onDeleteCategory(child.id); }}
                              className="px-1.5 py-1 opacity-0 group-hover/subcat:opacity-100 transition-opacity text-zinc-400 hover:text-red-500"
                              title="Delete sub-category"
                            >
                              <X size={10} />
                            </button>
                          </div>

                          {/* Skills in sub-category */}
                          {!isChildCollapsed && childSkills.map(s => (
                            <SkillRow key={s.slug} skill={s} selectedSlug={selectedSlug} onSelect={onSelect} onContextMenu={onContextMenu} onDragBegin={onDragBegin} indent={3} />
                          ))}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            );
          })}

          {/* Uncategorized skills */}
          {(() => {
            const uncategorized = skillsByCategory.get("") ?? [];
            // Also include skills whose category doesn't match any known category
            const knownCatIds = new Set(categories.map(c => c.id));
            const orphaned = skills.filter(s => s.category && !knownCatIds.has(s.category));
            const allUncat = [...uncategorized, ...orphaned];
            if (allUncat.length === 0) return null;

            // If there are no categories at all, render skills flat (no sub-header)
            if (categories.length === 0) {
              return allUncat.map(s => (
                <SkillRow key={s.slug} skill={s} selectedSlug={selectedSlug} onSelect={onSelect} onContextMenu={onContextMenu} onDragBegin={onDragBegin} indent={1} />
              ));
            }

            const subKey = `${groupKey}/uncategorized`;
            const isCatCollapsed = collapsedGroups.has(subKey);
            return (
              <div>
                <button
                  onClick={() => onToggleGroup(subKey)}
                  className="w-full flex items-center gap-1.5 pl-6 pr-3 py-1 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  <ChevronRight size={9} className={cn("text-zinc-400 transition-transform", !isCatCollapsed && "rotate-90")} />
                  <span className="text-xs font-medium text-zinc-400 italic truncate">Uncategorized</span>
                  <span className="text-xs text-zinc-400 ml-auto">{allUncat.length}</span>
                </button>
                {!isCatCollapsed && allUncat.map(s => (
                  <SkillRow key={s.slug} skill={s} selectedSlug={selectedSlug} onSelect={onSelect} onContextMenu={onContextMenu} onDragBegin={onDragBegin} indent={2} />
                ))}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

function SkillRow({
  skill: s,
  selectedSlug,
  onSelect,
  onContextMenu,
  onDragBegin,
  indent,
}: {
  skill: SkillWithSlug;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  onContextMenu: (e: React.MouseEvent, slug: string) => void;
  onDragBegin?: (item: DragItem, e: React.PointerEvent) => void;
  indent: 1 | 2 | 3;
}) {
  return (
    <button
      onClick={() => onSelect(s.slug)}
      onContextMenu={(e) => onContextMenu(e, s.slug)}
      onPointerDown={(e) => { if (e.button === 0 && onDragBegin) onDragBegin({ type: "skill", slug: s.slug }, e); }}
      className={cn(
        "w-full flex items-center gap-2 py-1.5 text-left transition-colors",
        indent === 3 ? "pl-12 pr-3" : indent === 2 ? "pl-9 pr-3" : "pl-5 pr-3",
        selectedSlug === s.slug
          ? "bg-zinc-100 dark:bg-zinc-800"
          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      )}
    >
      <span className={cn(
        "w-1.5 h-1.5 rounded-full flex-shrink-0",
        s.status === "active" ? "bg-green-500" :
        s.status === "test" ? "bg-amber-400" :
        s.status === "review" ? "bg-blue-400" :
        s.status === "draft" ? "bg-violet-400" :
        s.status === "deprecated" ? "bg-red-400" : "bg-zinc-400"
      )} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="text-xs text-zinc-700 dark:text-zinc-300 truncate">{s.slug}</p>
          {s.verified && (
            <CheckCircle2 size={10} className="flex-shrink-0 text-blue-500" />
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

function SkillDashboard({
  registry,
  allSkills,
  driftStatuses,
  onSelectSkill,
}: {
  registry: SkillRegistry;
  allSkills: SkillWithSlug[];
  driftStatuses: SkillDriftStatus[];
  onSelectSkill: (slug: string) => void;
}) {
  const { data: modInfos } = useSkillSummary();
  const [driftCollapsed, setDriftCollapsed] = useState(true);
  const [recentCollapsed, setRecentCollapsed] = useState(true);
  // Stats
  const totalSkills = allSkills.length;
  const activeCount = allSkills.filter(s => s.status === "active").length;
  const verifiedCount = allSkills.filter(s => s.verified).length;
  const botCount = allSkills.filter(s => s.target === "bot" || s.target === "both").length;
  const platformCount = allSkills.filter(s => s.target === "platform" || s.target === "both").length;
  const inSyncCount = driftStatuses.filter(d => d.status === "in_sync").length;
  const driftedCount = driftStatuses.filter(d => d.status === "drifted").length;
  const totalDistributions = driftStatuses.length;

  // Recently modified (top 10)
  const recentlyModified = useMemo(() => {
    if (!modInfos) return [];
    return modInfos
      .filter(m => m.last_modified)
      .slice(0, 10);
  }, [modInfos]);

  // Skills with drift issues — group by skill, show which targets are drifted
  const driftIssues = useMemo(() => {
    const driftedEntries = driftStatuses.filter(
      d => d.status === "drifted"
    );
    // Group by slug
    const bySlug = new Map<string, { skill: SkillWithSlug | undefined; drifts: SkillDriftStatus[] }>();
    for (const d of driftedEntries) {
      if (!bySlug.has(d.slug)) {
        bySlug.set(d.slug, {
          skill: allSkills.find(s => s.slug === d.slug),
          drifts: [],
        });
      }
      bySlug.get(d.slug)!.drifts.push(d);
    }
    return Array.from(bySlug.entries());
  }, [allSkills, driftStatuses]);

  return (
    <div className="p-5 space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Skill Registry</h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          {totalSkills} skills &middot; Last updated {registry.updated ? formatDate(registry.updated) : "unknown"}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Total" value={totalSkills} icon={Activity} />
        <StatCard label="Active" value={activeCount} icon={CheckCircle2} color="text-emerald-500" />
        <StatCard label="Verified" value={verifiedCount} sub={`/ ${activeCount}`} icon={ShieldCheck} color="text-blue-500" />
        <StatCard label="Bot" value={botCount} icon={Bot} />
        <StatCard label="Platform" value={platformCount} icon={Boxes} />
        <StatCard label="In Sync" value={inSyncCount} sub={`/ ${totalDistributions}`} icon={CheckCircle2} color="text-emerald-500" />
        <StatCard label="Drifted" value={driftedCount} icon={AlertTriangle} color={driftedCount > 0 ? "text-amber-500" : "text-zinc-400"} />
      </div>

      {/* Drift issues */}
      {driftIssues.length > 0 && (
        <div>
          <button
            onClick={() => setDriftCollapsed(prev => !prev)}
            className="flex items-center gap-1.5 mb-2 group"
          >
            <ChevronRight size={12} className={`text-amber-500 transition-transform ${!driftCollapsed ? "rotate-90" : ""}`} />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-500">
              Needs Attention ({driftIssues.length})
            </h3>
          </button>
          {!driftCollapsed && <div className="rounded-lg border border-amber-200 dark:border-amber-800/40 divide-y divide-amber-100 dark:divide-amber-800/30">
            {driftIssues.map(([slug, { drifts }]) => (
              <button
                key={slug}
                onClick={() => onSelectSkill(slug)}
                className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-amber-50/50 dark:hover:bg-amber-900/10 transition-colors"
              >
                <AlertTriangle size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-700 dark:text-zinc-300 font-medium">{slug}</p>
                  {drifts.map(d => {
                    const latestTime = d.source_modified && d.target_modified
                      ? (d.source_modified > d.target_modified ? d.source_modified : d.target_modified)
                      : d.source_modified || d.target_modified;
                    return (
                      <p key={d.distribution_path} className="text-xs text-zinc-400 truncate mt-0.5">
                        <span className="text-amber-500">
                          drifted
                        </span>
                        {" "}
                        {formatDistPath(d.distribution_path)}
                        {latestTime && (
                          <span className="text-zinc-400/70">
                            {" · "}{formatRelative(latestTime)}
                          </span>
                        )}
                      </p>
                    );
                  })}
                </div>
              </button>
            ))}
          </div>}
        </div>
      )}

      {/* Recently modified */}
      {recentlyModified.length > 0 && (
        <div>
          <button
            onClick={() => setRecentCollapsed(prev => !prev)}
            className="flex items-center gap-1.5 mb-2 group"
          >
            <ChevronRight size={12} className={`text-zinc-400 transition-transform ${!recentCollapsed ? "rotate-90" : ""}`} />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Recently Modified
            </h3>
          </button>
          {!recentCollapsed && <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800/50">
            {recentlyModified.map(m => {
              const skill = registry.skills[m.slug];
              return (
                <button
                  key={m.slug}
                  onClick={() => onSelectSkill(m.slug)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  <Clock size={13} className="text-zinc-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-700 dark:text-zinc-300">{m.slug}</p>
                    {skill && <p className="text-xs text-zinc-400 truncate">{skill.name}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-zinc-400">{formatRelative(m.last_modified)}</p>
                    <p className="text-xs text-zinc-400">{m.file_count} file{m.file_count !== 1 ? "s" : ""}</p>
                  </div>
                </button>
              );
            })}
          </div>}
        </div>
      )}

    </div>
  );
}



function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string;
  value: number;
  sub?: string;
  icon: typeof Activity;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} className={color || "text-zinc-400"} />
        <span className="text-xs text-zinc-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        {value}
        {sub && <span className="text-xs font-normal text-zinc-400">{sub}</span>}
      </p>
    </div>
  );
}

/** Format a distribution path into a readable target name.
 *  e.g. "_team/darren/bot-darren/skills/sod-check" → "darren/bot-darren"
 *       "0_Platform/skills/insights-grab" → "Platform"
 */
function formatDistPath(path: string): string {
  // _team/{person}/{bot}/skills/{skill} → {person}/{bot}
  const parts = path.split("/");
  if (parts[0] === "_team" && parts.length >= 4) {
    return `${parts[1]}/${parts[2]}`;
  }
  // Anything not under _team is a platform distribution
  if (!path.startsWith("_team/")) return "Platform";
  return path;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "today";
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-SG", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

// ─── Filter Bar ─────────────────────────────────────────────────────────────

type DatePreset = "all" | "today" | "7d" | "30d" | "90d" | "custom";
const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "all", label: "Any time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "custom", label: "Custom" },
];

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toSGTDateString(d);
}

function SkillFilterBar({
  search, onSearchChange,
  targetFilter, onTargetChange,
  statusFilter, onStatusChange,
  verifiedFilter, onVerifiedChange,
  modFrom, modTo, onModFromChange, onModToChange,
  sortBy, onSortChange,
}: {
  search: string; onSearchChange: (v: string) => void;
  targetFilter: TargetFilter; onTargetChange: (v: TargetFilter) => void;
  statusFilter: StatusFilter; onStatusChange: (v: StatusFilter) => void;
  verifiedFilter: VerifiedFilter; onVerifiedChange: (v: VerifiedFilter) => void;
  modFrom: string; modTo: string; onModFromChange: (v: string) => void; onModToChange: (v: string) => void;
  sortBy: SortOption; onSortChange: (v: SortOption) => void;
}) {
  // Derive which date preset is active
  const datePreset: DatePreset = useMemo(() => {
    if (!modFrom && !modTo) return "all";
    const today = toSGTDateString();
    if (modFrom === today && !modTo) return "today";
    if (modFrom === daysAgo(7) && !modTo) return "7d";
    if (modFrom === daysAgo(30) && !modTo) return "30d";
    if (modFrom === daysAgo(90) && !modTo) return "90d";
    return "custom";
  }, [modFrom, modTo]);

  const handleDatePreset = (preset: DatePreset) => {
    switch (preset) {
      case "all": onModFromChange(""); onModToChange(""); break;
      case "today": onModFromChange(toSGTDateString()); onModToChange(""); break;
      case "7d": onModFromChange(daysAgo(7)); onModToChange(""); break;
      case "30d": onModFromChange(daysAgo(30)); onModToChange(""); break;
      case "90d": onModFromChange(daysAgo(90)); onModToChange(""); break;
      case "custom": break; // just show pickers
    }
  };

  const hasFilters = targetFilter !== "all" || statusFilter !== "all" || verifiedFilter !== "all" || modFrom || modTo;

  const clearAll = () => {
    onTargetChange("all");
    onStatusChange("all");
    onVerifiedChange("all");
    onModFromChange("");
    onModToChange("");
  };

  const chip = "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer select-none";
  const chipIdle = "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700";
  const chipActive = "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 ring-1 ring-teal-200 dark:ring-teal-800";

  return (
    <div className="flex-shrink-0 border-b border-zinc-100 dark:border-zinc-800">
      {/* Row 1: Search + Sort */}
      <div className="flex items-center gap-2 px-4 py-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search skills..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortOption)}
          className="text-xs px-2 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
        >
          <option value="name">Sort: Name</option>
          <option value="modified">Sort: Modified</option>
          <option value="status">Sort: Status</option>
        </select>
      </div>

      {/* Row 2: Filter chips */}
      <div className="flex items-center gap-1.5 px-4 pb-2 flex-wrap">
        {/* Target */}
        {(["all", "bot", "platform"] as TargetFilter[]).map(v => (
          <button key={v} onClick={() => onTargetChange(v)} className={cn(chip, targetFilter === v ? chipActive : chipIdle)}>
            {v === "all" ? "All targets" : v === "bot" ? "Bot" : "Platform"}
          </button>
        ))}

        <span className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />

        {/* Status */}
        {(["all", "active", "test", "review", "draft", "inactive", "deprecated"] as StatusFilter[]).map(v => (
          <button key={v} onClick={() => onStatusChange(v)} className={cn(chip, statusFilter === v ? chipActive : chipIdle)}>
            {v === "all" ? "All statuses" : v === "review" ? "Review" : v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}

        <span className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />

        {/* Verified */}
        {(["all", "verified", "unverified"] as VerifiedFilter[]).map(v => (
          <button key={v} onClick={() => onVerifiedChange(v)} className={cn(
            chip,
            verifiedFilter === v
              ? v === "verified" ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 ring-1 ring-blue-200 dark:ring-blue-800"
              : v === "unverified" ? "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 ring-1 ring-amber-200 dark:ring-amber-800"
              : chipActive
              : chipIdle
          )}>
            {v === "all" ? "All" : v === "verified" ? "Verified" : "Unverified"}
          </button>
        ))}

        <span className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />

        {/* Date presets */}
        {DATE_PRESETS.filter(p => p.value !== "custom").map(p => (
          <button key={p.value} onClick={() => handleDatePreset(p.value)} className={cn(chip, datePreset === p.value ? chipActive : chipIdle)}>
            {p.label}
          </button>
        ))}
        {/* Custom date range — show pickers when custom is active */}
        {datePreset === "custom" && (
          <div className="flex items-center gap-1">
            <input type="date" value={modFrom} onChange={(e) => onModFromChange(e.target.value)} max={modTo || undefined}
              className="text-[11px] px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
            />
            <span className="text-[11px] text-zinc-400">–</span>
            <input type="date" value={modTo} onChange={(e) => onModToChange(e.target.value)} min={modFrom || undefined}
              className="text-[11px] px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
            />
          </div>
        )}

        {/* Clear all */}
        {hasFilters && (
          <>
            <span className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />
            <button onClick={clearAll} className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 px-1">
              Clear all
            </button>
          </>
        )}
      </div>
    </div>
  );
}
