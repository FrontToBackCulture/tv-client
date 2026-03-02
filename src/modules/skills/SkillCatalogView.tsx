// src/modules/skills/SkillCatalogView.tsx
// Browse, search, filter all skills in the central registry

import { useState, useMemo, useCallback, useRef } from "react";
import { Search, Loader2, Download, Activity, Bot, Boxes, CheckCircle2, AlertTriangle, Clock, GripVertical } from "lucide-react";
import { cn } from "../../lib/cn";
import {
  type SkillEntry,
  type SkillDriftStatus,
  type SkillRegistry,
  useSkillSummary,
} from "./useSkillRegistry";
import { SkillDetailPanel } from "./SkillDetailPanel";

interface SkillCatalogViewProps {
  registry: SkillRegistry;
  driftStatuses: SkillDriftStatus[];
  onInit: () => void;
  isIniting: boolean;
}

type TargetFilter = "all" | "bot" | "platform";
type StatusFilter = "all" | "active" | "inactive" | "deprecated" | "test";
type SortOption = "name" | "modified" | "status";

interface SkillWithSlug extends SkillEntry {
  slug: string;
}

export function SkillCatalogView({ registry, driftStatuses, onInit, isIniting }: SkillCatalogViewProps) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [targetFilter, setTargetFilter] = useState<TargetFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [sortBy, setSortBy] = useState<SortOption>("modified");

  const { data: modInfos } = useSkillSummary();

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
  }, [allSkills, activeCategory, targetFilter, statusFilter, search]);

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

  // Resize handle
  const resizing = useRef(false);
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMove = (ev: MouseEvent) => {
      if (!resizing.current) return;
      const delta = ev.clientX - startX;
      setSidebarWidth(Math.max(180, Math.min(500, startWidth + delta)));
    };
    const onUp = () => {
      resizing.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [sidebarWidth]);

  return (
    <div className="h-full flex flex-col">
      {/* Category tabs */}
      <div className="flex-shrink-0 flex items-center gap-0.5 px-4 border-b border-zinc-100 dark:border-zinc-800/50 overflow-x-auto">
        <TabButton
          active={activeCategory === "all"}
          onClick={() => setActiveCategory("all")}
          label={`All ${categoryCounts.all || 0}`}
        />
        {registry.categories.map((cat) => (
          <TabButton
            key={cat.id}
            active={activeCategory === cat.id}
            onClick={() => setActiveCategory(cat.id)}
            label={`${cat.label} ${categoryCounts[cat.id] || 0}`}
          />
        ))}
      </div>

      {/* Search + filters */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border-b border-zinc-100 dark:border-zinc-800/50">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search skills..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
        <select
          value={targetFilter}
          onChange={(e) => setTargetFilter(e.target.value as TargetFilter)}
          className="text-xs px-2 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
        >
          <option value="all">All targets</option>
          <option value="bot">Bot</option>
          <option value="platform">Platform</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="text-xs px-2 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="deprecated">Deprecated</option>
          <option value="test">Test</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          className="text-xs px-2 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
        >
          <option value="name">Sort: Name</option>
          <option value="modified">Sort: Modified</option>
          <option value="status">Sort: Status</option>
        </select>
      </div>

      {/* Content: list + detail */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: skill list */}
        <div
          className="overflow-y-auto flex-shrink-0"
          style={{ width: sidebarWidth }}
        >
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
              {allSkills.length === 0 ? (
                <>
                  <Download size={24} className="mb-2" />
                  <p className="text-xs mb-3">No skills in registry yet</p>
                  <button
                    onClick={onInit}
                    disabled={isIniting}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-teal-600 text-white rounded-md hover:bg-teal-500 disabled:opacity-50 transition-colors"
                  >
                    {isIniting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                    Initialize Registry
                  </button>
                </>
              ) : (
                <p className="text-xs">No skills match your filters</p>
              )}
            </div>
          ) : (
            <div className="py-1">
              {botSkills.length > 0 && (
                <SkillGroup
                  label={`Bot Skills (${botSkills.length})`}
                  skills={botSkills}
                  selectedSlug={selectedSlug}
                  onSelect={setSelectedSlug}

                />
              )}
              {platformSkills.length > 0 && (
                <SkillGroup
                  label={`Platform Skills (${platformSkills.length})`}
                  skills={platformSkills}
                  selectedSlug={selectedSlug}
                  onSelect={setSelectedSlug}
                />
              )}
            </div>
          )}
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={handleMouseDown}
          className="w-1.5 flex-shrink-0 cursor-col-resize group flex items-center justify-center border-r border-zinc-100 dark:border-zinc-800/50 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
        >
          <GripVertical size={10} className="text-zinc-300 dark:text-zinc-600 group-hover:text-teal-500 transition-colors" />
        </div>

        {/* Right: detail panel or dashboard */}
        {selectedSlug && selectedSkill ? (
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
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-2 text-xs whitespace-nowrap transition-colors border-b-2",
        active
          ? "border-teal-500 text-teal-600 dark:text-teal-400 font-medium"
          : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      )}
    >
      {label}
    </button>
  );
}

function SkillGroup({
  label,
  skills,
  selectedSlug,
  onSelect,
}: {
  label: string;
  skills: SkillWithSlug[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
}) {
  return (
    <div className="mb-2">
      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        {label}
      </div>
      {skills.map((s) => (
        <button
          key={s.slug}
          onClick={() => onSelect(s.slug)}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors",
            selectedSlug === s.slug
              ? "bg-zinc-100 dark:bg-zinc-800"
              : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
          )}
        >
          <span className={cn(
            "w-1.5 h-1.5 rounded-full flex-shrink-0",
            s.status === "active" ? "bg-green-500" :
            s.status === "deprecated" ? "bg-red-400" :
            s.status === "test" ? "bg-amber-400" : "bg-zinc-400"
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
      ))}
    </div>
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

  // Stats
  const totalSkills = allSkills.length;
  const activeCount = allSkills.filter(s => s.status === "active").length;
  const botCount = allSkills.filter(s => s.target === "bot" || s.target === "both").length;
  const platformCount = allSkills.filter(s => s.target === "platform" || s.target === "both").length;
  const inSyncCount = driftStatuses.filter(d => d.status === "in_sync").length;
  const driftedCount = driftStatuses.filter(d => d.status === "source_updated" || d.status === "target_modified").length;
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
      d => d.status === "source_updated" || d.status === "target_modified"
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

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    return registry.categories
      .map(cat => ({
        ...cat,
        count: allSkills.filter(s => s.category === cat.id).length,
      }))
      .filter(c => c.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [registry.categories, allSkills]);

  return (
    <div className="p-5 space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Skill Registry</h2>
        <p className="text-[11px] text-zinc-400 mt-0.5">
          {totalSkills} skills &middot; Last updated {registry.updated ? formatDate(registry.updated) : "unknown"}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total" value={totalSkills} icon={Activity} />
        <StatCard label="Active" value={activeCount} icon={CheckCircle2} color="text-emerald-500" />
        <StatCard label="Bot" value={botCount} icon={Bot} />
        <StatCard label="Platform" value={platformCount} icon={Boxes} />
        <StatCard label="In Sync" value={inSyncCount} sub={`/ ${totalDistributions}`} icon={CheckCircle2} color="text-emerald-500" />
        <StatCard label="Drifted" value={driftedCount} icon={AlertTriangle} color={driftedCount > 0 ? "text-amber-500" : "text-zinc-400"} />
      </div>

      {/* Drift issues */}
      {driftIssues.length > 0 && (
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-amber-500 mb-2">
            Needs Attention ({driftIssues.length})
          </h3>
          <div className="rounded-lg border border-amber-200 dark:border-amber-800/40 divide-y divide-amber-100 dark:divide-amber-800/30">
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
                      <p key={d.distribution_path} className="text-[10px] text-zinc-400 truncate mt-0.5">
                        <span className={d.status === "target_modified" ? "text-amber-500" : "text-teal-500"}>
                          {d.status === "target_modified" ? "modified" : "updated"}
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
          </div>
        </div>
      )}

      {/* Recently modified */}
      {recentlyModified.length > 0 && (
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">
            Recently Modified
          </h3>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800/50">
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
                    {skill && <p className="text-[10px] text-zinc-400 truncate">{skill.name}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[10px] text-zinc-400">{formatRelative(m.last_modified)}</p>
                    <p className="text-[10px] text-zinc-400">{m.file_count} file{m.file_count !== 1 ? "s" : ""}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Category breakdown */}
      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">
          By Category
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {categoryBreakdown.map(cat => (
            <div key={cat.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800">
              <span className="text-xs text-zinc-600 dark:text-zinc-300">{cat.label}</span>
              <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{cat.count}</span>
            </div>
          ))}
        </div>
      </div>
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
        <span className="text-[10px] text-zinc-400 uppercase tracking-wider">{label}</span>
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
  if (path.startsWith("0_Platform/")) return "Platform";
  // _team/{person}/{bot}/skills/{skill} → {person}/{bot}
  const parts = path.split("/");
  if (parts[0] === "_team" && parts.length >= 4) {
    return `${parts[1]}/${parts[2]}`;
  }
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
