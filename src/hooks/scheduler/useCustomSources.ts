// CRUD hooks for custom data sources (user-defined SQL queries for DIO automations)

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { schedulerKeys } from "./keys";

export interface CustomDataSource {
  id: string;
  name: string;
  description: string | null;
  sql_query: string;
  format_template: string;
  enabled: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

const customSourceKeys = {
  all: [...schedulerKeys.all, "custom-sources"] as const,
};

export function useCustomDataSources() {
  return useQuery({
    queryKey: customSourceKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_data_sources")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CustomDataSource[];
    },
  });
}

export function useCreateCustomDataSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      description?: string;
      sql_query: string;
      format_template?: string;
    }) => {
      const { data, error } = await supabase
        .from("custom_data_sources")
        .insert({
          name: input.name,
          description: input.description ?? null,
          sql_query: input.sql_query,
          format_template: input.format_template ?? "table",
        })
        .select()
        .single();
      if (error) throw error;
      return data as CustomDataSource;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: customSourceKeys.all });
    },
  });
}

export function useUpdateCustomDataSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...fields }: { id: string } & Partial<Pick<CustomDataSource, "name" | "description" | "sql_query" | "format_template" | "enabled">>) => {
      const { error } = await supabase
        .from("custom_data_sources")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: customSourceKeys.all });
    },
  });
}

export function useDeleteCustomDataSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("custom_data_sources")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: customSourceKeys.all });
    },
  });
}
