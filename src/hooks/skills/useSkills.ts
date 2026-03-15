// Skills CRUD hooks — Supabase-backed skill registry

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { Skill, SkillInsert, SkillUpdate } from "./types";
import { skillKeys } from "./keys";

// ─── Queries ─────────────────────────────────────────────────────────────────

export function useSkills(filters?: {
  status?: string;
  target?: string;
  category?: string;
}) {
  return useQuery({
    queryKey: skillKeys.list(filters),
    queryFn: async (): Promise<Skill[]> => {
      let query = supabase
        .from("skills")
        .select("*")
        .order("name", { ascending: true });

      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.target) query = query.eq("target", filters.target);
      if (filters?.category) query = query.eq("category", filters.category);

      const { data, error } = await query;
      if (error) throw new Error(`Failed to fetch skills: ${error.message}`);
      return data ?? [];
    },
  });
}

export function useSkill(slug: string) {
  return useQuery({
    queryKey: skillKeys.detail(slug),
    queryFn: async (): Promise<Skill | null> => {
      const { data, error } = await supabase
        .from("skills")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      if (error) throw new Error(`Failed to fetch skill: ${error.message}`);
      return data;
    },
    enabled: !!slug,
  });
}

// Bulk fetch all skills as a map (slug → Skill)
export function useSkillMap() {
  return useQuery({
    queryKey: skillKeys.all,
    queryFn: async (): Promise<Map<string, Skill>> => {
      const { data, error } = await supabase.from("skills").select("*");
      if (error) throw new Error(`Failed to fetch skills: ${error.message}`);

      const map = new Map<string, Skill>();
      for (const item of data ?? []) {
        map.set(item.slug, item);
      }
      return map;
    },
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export function useUpsertSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SkillInsert): Promise<Skill> => {
      const { data, error } = await supabase
        .from("skills")
        .upsert(input, { onConflict: "slug" })
        .select()
        .single();

      if (error) throw new Error(`Failed to upsert skill: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: skillKeys.all });
    },
  });
}

export function useUpdateSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      slug,
      updates,
    }: {
      slug: string;
      updates: SkillUpdate;
    }): Promise<Skill> => {
      const { data, error } = await supabase
        .from("skills")
        .update(updates)
        .eq("slug", slug)
        .select()
        .single();

      if (error) throw new Error(`Failed to update skill: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: skillKeys.all });
    },
  });
}

export function useDeleteSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (slug: string): Promise<void> => {
      const { error } = await supabase
        .from("skills")
        .delete()
        .eq("slug", slug);

      if (error) throw new Error(`Failed to delete skill: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: skillKeys.all });
    },
  });
}

// Bulk upsert (for skill_init sync)
export function useBulkUpsertSkills() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (skills: SkillInsert[]): Promise<Skill[]> => {
      // Supabase upsert supports arrays
      const { data, error } = await supabase
        .from("skills")
        .upsert(skills, { onConflict: "slug" })
        .select();

      if (error) throw new Error(`Failed to bulk upsert skills: ${error.message}`);
      return data ?? [];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: skillKeys.all });
    },
  });
}
