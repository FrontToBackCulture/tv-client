// React Query hooks for DIO automations (CRUD on dio_automations table)

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { DioAutomation, DioSources, PostMode } from "./useTaskAdvisor";
import { DEFAULT_SOURCES } from "./useTaskAdvisor";

export const dioKeys = {
  all: ["dio-automations"] as const,
};

export function useDioAutomations() {
  return useQuery({
    queryKey: dioKeys.all,
    queryFn: async (): Promise<DioAutomation[]> => {
      const { data, error } = await supabase
        .from("dio_automations")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        sources: { ...DEFAULT_SOURCES, ...(row.sources as object) } as DioSources,
        post_mode: (row.post_mode === "same_thread" ? "same_thread" : "new_thread") as PostMode,
      }));
    },
  });
}

export interface DioCreateInput {
  name: string;
  description?: string | null;
  enabled?: boolean;
  interval_hours?: number;
  active_hours?: string | null;
  sources?: DioSources;
  model?: string;
  system_prompt?: string | null;
  post_mode?: PostMode;
  thread_id?: string | null;
  thread_title?: string | null;
}

export function useCreateDio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: DioCreateInput) => {
      const { data, error } = await supabase
        .from("dio_automations")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: dioKeys.all }),
  });
}

export function useUpdateDio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...fields }: { id: string } & Partial<DioCreateInput>) => {
      const { error } = await supabase
        .from("dio_automations")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: dioKeys.all }),
  });
}

export function useDeleteDio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("dio_automations")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: dioKeys.all }),
  });
}
