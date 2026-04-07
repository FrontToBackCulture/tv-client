import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { SolutionTemplate } from "../../lib/solutions/types";
import { solutionKeys } from "./keys";

export function useSolutionTemplates(status?: string) {
  return useQuery({
    queryKey: [...solutionKeys.templates(), status],
    queryFn: async (): Promise<SolutionTemplate[]> => {
      let query = supabase.from("solution_templates").select("*");
      if (status) query = query.eq("status", status);
      const { data, error } = await query.order("name", { ascending: true });
      if (error) throw new Error(`Failed to fetch templates: ${error.message}`);
      return (data ?? []) as SolutionTemplate[];
    },
  });
}

export function useSolutionTemplate(id: string | null) {
  return useQuery({
    queryKey: solutionKeys.template(id || ""),
    queryFn: async (): Promise<SolutionTemplate | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("solution_templates")
        .select("*")
        .eq("id", id)
        .single();
      if (error?.code === "PGRST116") return null;
      if (error) throw new Error(`Failed to fetch template: ${error.message}`);
      return data as SolutionTemplate;
    },
    enabled: !!id,
  });
}

export function useSolutionTemplateBySlug(slug: string | null) {
  return useQuery({
    queryKey: solutionKeys.templateBySlug(slug || ""),
    queryFn: async (): Promise<SolutionTemplate | null> => {
      if (!slug) return null;
      const { data, error } = await supabase
        .from("solution_templates")
        .select("*")
        .eq("slug", slug)
        .single();
      if (error?.code === "PGRST116") return null;
      if (error) throw new Error(`Failed to fetch template: ${error.message}`);
      return data as SolutionTemplate;
    },
    enabled: !!slug,
  });
}

export function useUpdateSolutionTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<SolutionTemplate>;
    }): Promise<SolutionTemplate> => {
      const { data, error } = await supabase
        .from("solution_templates")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update template: ${error.message}`);
      return data as SolutionTemplate;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: solutionKeys.templates() });
      queryClient.invalidateQueries({ queryKey: solutionKeys.template(data.id) });
    },
  });
}
