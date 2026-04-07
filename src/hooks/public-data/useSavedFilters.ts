import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { publicDataKeys } from "./keys";
import type { SavedFilter, JobFilters } from "../../lib/public-data/types";

export function useSavedFilters() {
  return useQuery({
    queryKey: publicDataKeys.savedFilters(),
    queryFn: async (): Promise<SavedFilter[]> => {
      const { data, error } = await supabase
        .schema("public_data")
        .from("saved_filters")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw new Error(`Failed to fetch saved filters: ${error.message}`);
      return (data ?? []) as SavedFilter[];
    },
  });
}

export function useCreateSavedFilter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      filters: JobFilters;
      created_by: string;
    }): Promise<SavedFilter> => {
      const { data, error } = await supabase
        .schema("public_data")
        .from("saved_filters")
        .insert({ ...input, source_table: "mcf_job_postings" })
        .select()
        .single();
      if (error) throw new Error(`Failed to save filter: ${error.message}`);
      return data as SavedFilter;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: publicDataKeys.savedFilters() });
    },
  });
}

export function useDeleteSavedFilter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .schema("public_data")
        .from("saved_filters")
        .delete()
        .eq("id", id);
      if (error) throw new Error(`Failed to delete filter: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: publicDataKeys.savedFilters() });
    },
  });
}
