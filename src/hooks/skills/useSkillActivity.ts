// Skill activity log hooks — Supabase skill_activity table

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";

export interface SkillActivity {
  id: string;
  skill_slug: string;
  file_path: string;
  action: string;
  actor: string | null;
  machine: string | null;
  summary: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export interface SkillActivitySummary {
  lastChanged: string | null;
  lastActor: string | null;
  changeCount: number;
}

export const skillActivityKeys = {
  all: ["skill-activity"] as const,
  list: (slug?: string) => [...skillActivityKeys.all, "list", slug] as const,
  summaries: () => [...skillActivityKeys.all, "summaries"] as const,
};

/** Fetch activity log for a single skill (for detail panel) */
export function useSkillActivityLog(slug: string | undefined) {
  return useQuery({
    queryKey: skillActivityKeys.list(slug),
    queryFn: async (): Promise<SkillActivity[]> => {
      const { data, error } = await supabase
        .from("skill_activity")
        .select("*")
        .eq("skill_slug", slug!)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw new Error(`Failed to fetch skill activity: ${error.message}`);
      return data ?? [];
    },
    enabled: !!slug,
  });
}

/**
 * Latest change per skill, from `skill_changes` (the table the
 * `trg_skill_changes` trigger writes to on every UPDATE — including
 * inline UI edits). The legacy `skill_activity` table is only fed by
 * external sync tools, which is why a previous version of this hook
 * left the "Last Changed" grid column empty for inline edits.
 *
 * Pagination loops past the PostgREST 1k cap because skill_changes
 * grows unbounded with edit volume.
 */
export function useSkillActivitySummaries() {
  return useQuery({
    queryKey: skillActivityKeys.summaries(),
    queryFn: async (): Promise<Record<string, SkillActivitySummary>> => {
      const map: Record<string, SkillActivitySummary> = {};
      const PAGE = 1000;
      let offset = 0;
      while (true) {
        const { data, error } = await supabase
          .from("skill_changes")
          .select("skill_slug, changed_by, changed_at")
          .order("changed_at", { ascending: false })
          .range(offset, offset + PAGE - 1);
        if (error) throw new Error(`Failed to fetch skill changes summaries: ${error.message}`);
        if (!data || data.length === 0) break;
        for (const row of data) {
          const existing = map[row.skill_slug];
          if (!existing) {
            map[row.skill_slug] = {
              lastChanged: row.changed_at,
              lastActor: row.changed_by,
              changeCount: 1,
            };
          } else {
            existing.changeCount++;
          }
        }
        if (data.length < PAGE) break;
        offset += PAGE;
      }
      return map;
    },
    staleTime: 30_000,
  });
}
