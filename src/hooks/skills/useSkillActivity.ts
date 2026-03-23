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

/** Fetch latest activity per skill (for grid columns) */
export function useSkillActivitySummaries() {
  return useQuery({
    queryKey: skillActivityKeys.summaries(),
    queryFn: async (): Promise<Record<string, SkillActivitySummary>> => {
      // Fetch all activities ordered by recency, then aggregate client-side
      const { data, error } = await supabase
        .from("skill_activity")
        .select("skill_slug, actor, created_at")
        .order("created_at", { ascending: false });

      if (error) throw new Error(`Failed to fetch skill activity summaries: ${error.message}`);

      const map: Record<string, SkillActivitySummary> = {};
      for (const row of data ?? []) {
        if (!map[row.skill_slug]) {
          map[row.skill_slug] = {
            lastChanged: row.created_at,
            lastActor: row.actor,
            changeCount: 1,
          };
        } else {
          map[row.skill_slug].changeCount++;
        }
      }
      return map;
    },
    staleTime: 30_000,
  });
}
