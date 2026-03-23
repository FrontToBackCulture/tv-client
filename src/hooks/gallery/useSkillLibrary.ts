// Skill Library CRUD hooks (unified: report, diagnostic, chat)

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type {
  SkillLibraryItem,
  SkillLibraryInsert,
  SkillLibraryUpdate,
} from "../../lib/gallery/types";
import { skillLibraryKeys } from "./keys";

/** Fire-and-forget website revalidation after Supabase writes */
function revalidateWebsite() {
  fetch("https://www.thinkval.com/api/revalidate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      paths: [
        "/solutions/analytics",
        "/solutions/analytics/ai-skills",
        "/solutions/ar-automation",
        "/solutions/ap-automation",
      ],
    }),
  }).catch(() => {
    // Best-effort — don't block on failure
  });
}

export function useSkillLibrary(filters?: {
  published?: boolean;
  featured?: boolean;
  category?: string;
  type?: string;
  solution?: string;
}) {
  return useQuery({
    queryKey: skillLibraryKeys.list(filters),
    queryFn: async (): Promise<SkillLibraryItem[]> => {
      let query = supabase
        .from("skill_library")
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
      if (filters?.type) {
        query = query.eq("type", filters.type);
      }
      if (filters?.solution) {
        query = query.eq("solution", filters.solution);
      }

      const { data, error } = await query;
      if (error)
        throw new Error(`Failed to fetch skill library: ${error.message}`);
      return data ?? [];
    },
  });
}

// Lookup by skill_slug + file_name (for matching gallery items to library entries)
export function useSkillLibraryByFile(slug: string, fileName: string) {
  return useQuery({
    queryKey: skillLibraryKeys.bySkill(slug, fileName),
    queryFn: async (): Promise<SkillLibraryItem | null> => {
      const { data, error } = await supabase
        .from("skill_library")
        .select("*")
        .eq("skill_slug", slug)
        .eq("file_name", fileName)
        .maybeSingle();

      if (error)
        throw new Error(`Failed to fetch skill library entry: ${error.message}`);
      return data;
    },
    enabled: !!slug && !!fileName,
  });
}

// Bulk fetch all library entries (for matching against gallery demos)
export function useSkillLibraryMap() {
  return useQuery({
    queryKey: skillLibraryKeys.all,
    queryFn: async (): Promise<Map<string, SkillLibraryItem>> => {
      const { data, error } = await supabase
        .from("skill_library")
        .select("*");

      if (error)
        throw new Error(`Failed to fetch skill library: ${error.message}`);

      const map = new Map<string, SkillLibraryItem>();
      for (const item of data ?? []) {
        map.set(`${item.skill_slug}:${item.file_name}`, item);
      }
      return map;
    },
  });
}

export function useCreateSkillLibraryEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SkillLibraryInsert): Promise<SkillLibraryItem> => {
      const { data, error } = await supabase
        .from("skill_library")
        .insert(input)
        .select()
        .single();

      if (error)
        throw new Error(`Failed to create skill library entry: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: skillLibraryKeys.all });
      revalidateWebsite();
    },
  });
}

export function useUpdateSkillLibraryEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: SkillLibraryUpdate;
    }): Promise<SkillLibraryItem> => {
      const { data, error } = await supabase
        .from("skill_library")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error)
        throw new Error(`Failed to update skill library entry: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: skillLibraryKeys.all });
      revalidateWebsite();
    },
  });
}

export function useUpsertSkillLibraryEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SkillLibraryInsert): Promise<SkillLibraryItem> => {
      const { data, error } = await supabase
        .from("skill_library")
        .upsert(input, { onConflict: "skill_slug,file_name" })
        .select()
        .single();

      if (error)
        throw new Error(`Failed to upsert skill library entry: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: skillLibraryKeys.all });
      revalidateWebsite();
    },
  });
}

export function useDeleteSkillLibraryEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from("skill_library")
        .delete()
        .eq("id", id);

      if (error)
        throw new Error(`Failed to delete skill library entry: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: skillLibraryKeys.all });
      revalidateWebsite();
    },
  });
}

// Legacy aliases for gradual migration
export const useReportSkills = useSkillLibrary;
export const useReportSkillByFile = useSkillLibraryByFile;
export const useReportSkillMap = useSkillLibraryMap;
export const useCreateReportSkill = useCreateSkillLibraryEntry;
export const useUpdateReportSkill = useUpdateSkillLibraryEntry;
export const useUpsertReportSkill = useUpsertSkillLibraryEntry;
export const useDeleteReportSkill = useDeleteSkillLibraryEntry;
