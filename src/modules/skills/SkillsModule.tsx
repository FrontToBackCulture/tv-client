// src/modules/skills/SkillsModule.tsx
// Skills module — full grid (Manage) view of every registered skill with a
// slide-out detail panel. Browse and Prompt Builder were removed; the grid is
// what gets used day-to-day, so it now owns the entire module.

import { useEffect, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { useSelectedEntityStore } from "../../stores/selectedEntityStore";
import { useSkillCheckAll } from "./useSkillRegistry";
import { useSkills } from "../../hooks/skills/useSkills";
import { SkillReviewGrid } from "./SkillReviewGrid";
import { SkillDetailPanel } from "./SkillDetailPanel";
import { PageHeader } from "../../components/PageHeader";
import { ResizablePanel } from "../../components/ResizablePanel";
import { RecentChangesPanel } from "../../components/RecentChangesPanel";
import { StatsStrip } from "../../components/StatsStrip";
import { DetailLoading } from "../../components/ui/DetailStates";
import { timeAgoVerbose } from "../../lib/date";
import type { SkillRegistry, SkillCategory, SkillEntry } from "./useSkillRegistry";

export function SkillsModule() {
  const { data: skills, isLoading, error } = useSkills();
  const { data: driftStatuses = [] } = useSkillCheckAll();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [showChanges, setShowChanges] = useState(false);

  // Sync to global selection store so Cmd+J chat modal knows the focus.
  const setGlobalSelected = useSelectedEntityStore((s) => s.setSelected);
  useEffect(() => {
    setGlobalSelected(selectedSlug ? { type: "skill", id: selectedSlug } : null);
    return () => setGlobalSelected(null);
  }, [selectedSlug, setGlobalSelected]);
  const skillNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of skills ?? []) map[s.slug] = s.name;
    return map;
  }, [skills]);

  const stats = useMemo(() => {
    const list = skills ?? [];
    const total = list.length;
    const active = list.filter((s) => s.status === "active").length;
    const unverified = list.filter((s) => s.status === "active" && !s.verified).length;
    const needsWork = list.filter((s) => s.needs_work && s.needs_work.trim().length > 0).length;
    const stale = list.filter((s) => {
      if (!s.last_audited) return true;
      return Date.now() - new Date(s.last_audited).getTime() > 30 * 24 * 60 * 60 * 1000;
    }).length;
    return { total, active, unverified, needsWork, stale };
  }, [skills]);

  const lastActivity = useMemo(() => {
    let max = 0;
    for (const s of skills ?? []) {
      const ts = s.updated_at ? new Date(s.updated_at).getTime() : 0;
      if (ts > max) max = ts;
    }
    return max > 0 ? `Last activity ${timeAgoVerbose(new Date(max).toISOString())}` : undefined;
  }, [skills]);

  // Build a SkillRegistry-compatible object from Supabase data — the detail
  // panel still consumes the legacy registry shape for category lookups.
  const registry = useMemo((): SkillRegistry | null => {
    if (!skills?.length) return null;

    const categorySet = new Set<string>();
    for (const skill of skills) {
      if (skill.category) categorySet.add(skill.category);
    }
    const categories: SkillCategory[] = Array.from(categorySet)
      .sort()
      .map((label, i) => ({
        id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        label,
        order: i,
      }));

    const labelToId: Record<string, string> = {};
    for (const cat of categories) {
      labelToId[cat.label] = cat.id;
    }

    const skillsMap: Record<string, SkillEntry> = {};
    for (const skill of skills) {
      skillsMap[skill.slug] = {
        name: skill.name,
        description: skill.description,
        category: labelToId[skill.category] ?? skill.category,
        subcategory: skill.subcategory ?? undefined,
        data_types: Array.isArray(skill.data_types) ? skill.data_types : [],
        target: skill.target as SkillEntry["target"],
        status: skill.status as SkillEntry["status"],
        command: skill.command ?? undefined,
        domain: Array.isArray(skill.domain) ? skill.domain : [],
        platform: Array.isArray(skill.platform) ? skill.platform : [],
        verified: skill.verified,
        rating: skill.rating ?? undefined,
        last_audited: skill.last_audited ?? undefined,
        owner: skill.owner ?? undefined,
        gallery_pinned: skill.gallery_pinned,
        gallery_order: skill.gallery_order ?? undefined,
        has_demo: skill.has_demo,
        has_examples: skill.has_examples,
        has_deck: skill.has_deck,
        has_guide: skill.has_guide,
        distributions: Array.isArray(skill.distributions) ? skill.distributions as { path: string; type: string }[] : [],
      };
    }

    return {
      version: 1,
      updated: new Date().toISOString(),
      categories,
      skills: skillsMap,
    };
  }, [skills]);

  if (isLoading) {
    return <DetailLoading />;
  }

  if (error || !registry) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-zinc-950">
        <div className="text-center max-w-sm">
          <AlertCircle size={24} className="mx-auto mb-2 text-zinc-400" />
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
            {error ? "Failed to load skills" : "No skills found"}
          </p>
          <p className="text-xs text-zinc-400">
            {error instanceof Error ? error.message : "Check your Supabase connection."}
          </p>
        </div>
      </div>
    );
  }

  const selectedSkill = selectedSlug ? registry.skills[selectedSlug] : null;
  const selectedDriftStatuses = selectedSlug
    ? driftStatuses.filter((d) => d.slug === selectedSlug)
    : [];

  return (
    <div className="h-full flex flex-col">
      <PageHeader description={lastActivity} />

      <StatsStrip stats={[
        { value: stats.total, label: <>total<br/>skills</>, color: "blue" },
        { value: stats.active, label: <>active<br/>skills</>, color: "emerald" },
        { value: stats.unverified, label: <>unverified<br/>active</>, color: stats.unverified > 0 ? "amber" : "zinc" },
        { value: stats.needsWork, label: <>needs<br/>work</>, color: stats.needsWork > 0 ? "red" : "zinc" },
        { value: stats.stale, label: <>stale<br/>(30d+)</>, color: stats.stale > 0 ? "amber" : "zinc" },
      ]} />

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 min-w-0">
          <SkillReviewGrid
            onSelectSkill={setSelectedSlug}
            onToggleChanges={() => setShowChanges((v) => !v)}
            showChanges={showChanges}
          />
        </div>
        {selectedSlug && selectedSkill && (
          <ResizablePanel storageKey="tv-skill-review-detail-width-v2" minWidth={400}>
            <SkillDetailPanel
              key={selectedSlug}
              slug={selectedSlug}
              skill={selectedSkill}
              registry={registry}
              driftStatuses={selectedDriftStatuses}
              onClose={() => setSelectedSlug(null)}
            />
          </ResizablePanel>
        )}
        <RecentChangesPanel
          open={showChanges}
          onClose={() => setShowChanges(false)}
          table="skill_changes"
          queryKey={["skill_changes_recent"]}
          fieldLabels={{ name: "Name", description: "Description", status: "Status", category: "Category", subcategory: "Subcategory", verified: "Verified", owner: "Owner", rating: "Rating", action: "Action", outcome: "Outcome", needs_work: "Needs Work", skill_type: "Type" }}
          titleFor={(c) => skillNames[c.skill_slug] || c.skill_slug}
        />
      </div>
    </div>
  );
}
