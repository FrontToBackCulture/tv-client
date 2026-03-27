// src/modules/skills/SkillsModule.tsx
// Main entry — loads skill data from Supabase, builds registry-compatible shape for catalog view

import { useMemo } from "react";
import { AlertCircle } from "lucide-react";
import { useSkillCheckAll } from "./useSkillRegistry";
import { useSkills } from "../../hooks/skills/useSkills";
import { SkillCatalogView } from "./SkillCatalogView";
import { DetailLoading } from "../../components/ui/DetailStates";
import type { SkillRegistry, SkillCategory, SkillEntry } from "./useSkillRegistry";

export function SkillsModule() {
  const { data: skills, isLoading, error } = useSkills();
  const { data: driftStatuses = [] } = useSkillCheckAll();

  // Build a SkillRegistry-compatible object from Supabase data
  const registry = useMemo((): SkillRegistry | null => {
    if (!skills?.length) return null;

    // Build categories from unique category values
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

    // Build category label → ID lookup
    const labelToId: Record<string, string> = {};
    for (const cat of categories) {
      labelToId[cat.label] = cat.id;
    }

    // Build skills map
    const skillsMap: Record<string, SkillEntry> = {};
    for (const skill of skills) {
      skillsMap[skill.slug] = {
        name: skill.name,
        description: skill.description,
        category: labelToId[skill.category] ?? skill.category,
        target: skill.target as SkillEntry["target"],
        status: skill.status as SkillEntry["status"],
        command: skill.command ?? undefined,
        domain: skill.domain ?? undefined,
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

  return (
    <div className="h-full bg-white dark:bg-zinc-950">
      <SkillCatalogView
        registry={registry}
        driftStatuses={driftStatuses}
      />
    </div>
  );
}
