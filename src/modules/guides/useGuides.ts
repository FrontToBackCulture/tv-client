import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { Guide } from "./types";

const guideKeys = {
  all: ["guides"] as const,
  detail: (id: string) => ["guide", id] as const,
};

export function useGuides() {
  return useQuery({
    queryKey: guideKeys.all,
    queryFn: async (): Promise<Guide[]> => {
      const { data, error } = await supabase
        .from("guides")
        .select("*")
        .order("category", { ascending: true })
        .order("order", { ascending: true })
        .order("published_at", { ascending: false, nullsFirst: false });

      if (error) throw new Error(error.message);
      return data as Guide[];
    },
    staleTime: 30_000,
  });
}

export function useGuide(id: string | null) {
  return useQuery({
    queryKey: guideKeys.detail(id ?? ""),
    queryFn: async (): Promise<Guide> => {
      const { data, error } = await supabase
        .from("guides")
        .select("*")
        .eq("id", id!)
        .single();

      if (error) throw new Error(error.message);
      return data as Guide;
    },
    enabled: !!id,
  });
}

export function useCreateGuide() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (guide: Partial<Guide> & { slug: string; title: string; description: string; category: string }) => {
      const { data, error } = await supabase
        .from("guides")
        .insert(guide)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data as Guide;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: guideKeys.all });
    },
  });
}

export function useUpdateGuide() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Guide> & { id: string }) => {
      const { data, error } = await supabase
        .from("guides")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data as Guide;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: guideKeys.all });
      queryClient.invalidateQueries({ queryKey: guideKeys.detail(data.id) });
    },
  });
}

export function useDeleteGuide() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("guides")
        .delete()
        .eq("id", id);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: guideKeys.all });
    },
  });
}
