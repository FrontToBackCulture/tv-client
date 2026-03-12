// Report Skill Library CRUD hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type {
  ReportSkill,
  ReportSkillInsert,
  ReportSkillUpdate,
} from "../../lib/gallery/types";
import { reportSkillKeys } from "./keys";

/** Fire-and-forget website revalidation after Supabase writes */
function revalidateWebsite() {
  fetch("https://www.thinkval.com/api/revalidate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      paths: [
        "/solutions/analytics",
        "/solutions/analytics/report-skills",
        "/solutions/analytics/questions",
        "/solutions/ar-automation",
        "/solutions/ap-automation",
      ],
    }),
  }).catch(() => {
    // Best-effort — don't block on failure
  });
}

export function useReportSkills(filters?: {
  published?: boolean;
  featured?: boolean;
  category?: string;
}) {
  return useQuery({
    queryKey: reportSkillKeys.list(filters),
    queryFn: async (): Promise<ReportSkill[]> => {
      let query = supabase
        .from("report_skill_library")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("title", { ascending: true });

      if (filters?.published !== undefined) {
        query = query.eq("published", filters.published);
      }
      if (filters?.featured !== undefined) {
        query = query.eq("featured", filters.featured);
      }
      if (filters?.category) {
        query = query.eq("category", filters.category);
      }

      const { data, error } = await query;
      if (error)
        throw new Error(`Failed to fetch report skills: ${error.message}`);
      return data ?? [];
    },
  });
}

// Lookup by skill_slug + file_name (for matching gallery items to library entries)
export function useReportSkillByFile(slug: string, fileName: string) {
  return useQuery({
    queryKey: reportSkillKeys.bySkill(slug, fileName),
    queryFn: async (): Promise<ReportSkill | null> => {
      const { data, error } = await supabase
        .from("report_skill_library")
        .select("*")
        .eq("skill_slug", slug)
        .eq("file_name", fileName)
        .maybeSingle();

      if (error)
        throw new Error(`Failed to fetch report skill: ${error.message}`);
      return data;
    },
    enabled: !!slug && !!fileName,
  });
}

// Bulk fetch all library entries (for matching against gallery demos)
export function useReportSkillMap() {
  return useQuery({
    queryKey: reportSkillKeys.all,
    queryFn: async (): Promise<Map<string, ReportSkill>> => {
      const { data, error } = await supabase
        .from("report_skill_library")
        .select("*");

      if (error)
        throw new Error(`Failed to fetch report skills: ${error.message}`);

      const map = new Map<string, ReportSkill>();
      for (const item of data ?? []) {
        map.set(`${item.skill_slug}:${item.file_name}`, item);
      }
      return map;
    },
  });
}

export function useCreateReportSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ReportSkillInsert): Promise<ReportSkill> => {
      const { data, error } = await supabase
        .from("report_skill_library")
        .insert(input)
        .select()
        .single();

      if (error)
        throw new Error(`Failed to create report skill: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportSkillKeys.all });
      revalidateWebsite();
    },
  });
}

export function useUpdateReportSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: ReportSkillUpdate;
    }): Promise<ReportSkill> => {
      const { data, error } = await supabase
        .from("report_skill_library")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error)
        throw new Error(`Failed to update report skill: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportSkillKeys.all });
      revalidateWebsite();
    },
  });
}

export function useUpsertReportSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ReportSkillInsert): Promise<ReportSkill> => {
      const { data, error } = await supabase
        .from("report_skill_library")
        .upsert(input, { onConflict: "skill_slug,file_name" })
        .select()
        .single();

      if (error)
        throw new Error(`Failed to upsert report skill: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportSkillKeys.all });
      revalidateWebsite();
    },
  });
}

export function useDeleteReportSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from("report_skill_library")
        .delete()
        .eq("id", id);

      if (error)
        throw new Error(`Failed to delete report skill: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportSkillKeys.all });
      revalidateWebsite();
    },
  });
}
