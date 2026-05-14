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

// Slugs of skills assigned to a given domain (skills.domain @> [domain]).
// This is the canonical source of truth for domain skill assignments.
export function useDomainSkills(domain: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.byDomain(domain ?? ""),
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("skills")
        .select("slug")
        .contains("domain", [domain!])
        .order("slug", { ascending: true });
      if (error) throw new Error(`Failed to fetch domain skills: ${error.message}`);
      return (data ?? []).map((r) => r.slug);
    },
    enabled: !!domain,
  });
}

// Reconcile a domain's assigned skills to the given list.
// Adds the domain to skills.domain for newly assigned slugs and
// removes it for slugs no longer in the list.
export function useAssignSkillsToDomain() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      domain,
      skills,
    }: {
      domain: string;
      skills: string[];
    }): Promise<{ added: string[]; removed: string[] }> => {
      const { data: currentRows, error: readErr } = await supabase
        .from("skills")
        .select("slug, domain")
        .contains("domain", [domain]);
      if (readErr) throw new Error(`Failed to read current assignments: ${readErr.message}`);

      const current = new Map<string, string[]>();
      for (const r of currentRows ?? []) current.set(r.slug, r.domain ?? []);
      const desired = new Set(skills);

      const toAdd = [...desired].filter((s) => !current.has(s));
      const toRemove = [...current.keys()].filter((s) => !desired.has(s));

      for (const slug of toAdd) {
        const { data: row, error } = await supabase
          .from("skills")
          .select("domain")
          .eq("slug", slug)
          .maybeSingle();
        if (error) throw new Error(`Failed to read skill ${slug}: ${error.message}`);
        if (!row) continue;
        const next = Array.from(new Set([...(row.domain ?? []), domain])).sort();
        const { error: updErr } = await supabase
          .from("skills")
          .update({ domain: next })
          .eq("slug", slug);
        if (updErr) throw new Error(`Failed to assign ${slug} → ${domain}: ${updErr.message}`);
      }

      for (const slug of toRemove) {
        const next = (current.get(slug) ?? []).filter((d) => d !== domain);
        const { error: updErr } = await supabase
          .from("skills")
          .update({ domain: next })
          .eq("slug", slug);
        if (updErr) throw new Error(`Failed to unassign ${slug} from ${domain}: ${updErr.message}`);
      }

      return { added: toAdd, removed: toRemove };
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: skillKeys.byDomain(vars.domain) });
      queryClient.invalidateQueries({ queryKey: skillKeys.all });
    },
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
