// Product Modules CRUD hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type {
  ProductModule,
  ProductModuleInsert,
  ProductModuleUpdate,
  ProductModuleWithRelations,
  ModuleFilters,
} from "../../lib/product/types";
import { productKeys } from "./keys";
import { useProductFeatures } from "./useFeatures";

export function useProductModules(filters?: ModuleFilters) {
  return useQuery({
    queryKey: [...productKeys.modules(), filters],
    queryFn: async (): Promise<ProductModule[]> => {
      let query = supabase.from("product_modules").select("*");

      if (filters?.layer) {
        query = query.eq("layer", filters.layer);
      }
      if (filters?.status) {
        query = query.eq("status", filters.status);
      }
      if (filters?.search) {
        query = query.ilike("name", `%${filters.search}%`);
      }

      const { data, error } = await query.order("sort_order", { ascending: true });
      if (error) throw new Error(`Failed to fetch modules: ${error.message}`);
      return data ?? [];
    },
  });
}

export function useProductModule(id: string | null) {
  return useQuery({
    queryKey: productKeys.module(id || ""),
    queryFn: async (): Promise<ProductModule | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("product_modules")
        .select("*")
        .eq("id", id)
        .single();
      if (error?.code === "PGRST116") return null;
      if (error) throw new Error(`Failed to fetch module: ${error.message}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useProductModuleWithRelations(id: string | null) {
  const moduleQuery = useProductModule(id);
  const featuresQuery = useProductFeatures({ moduleId: id || undefined });

  const data: ProductModuleWithRelations | null = moduleQuery.data
    ? {
        ...moduleQuery.data,
        features: featuresQuery.data,
        featureCount: featuresQuery.data?.length ?? 0,
      }
    : null;

  return {
    data,
    isLoading: moduleQuery.isLoading || featuresQuery.isLoading,
    refetch: () => { moduleQuery.refetch(); featuresQuery.refetch(); },
    error: moduleQuery.error || featuresQuery.error,
  };
}

export function useCreateProductModule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (mod: ProductModuleInsert): Promise<ProductModule> => {
      const { data, error } = await supabase
        .from("product_modules")
        .insert(mod)
        .select()
        .single();
      if (error) throw new Error(`Failed to create module: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.modules() });
      queryClient.invalidateQueries({ queryKey: productKeys.stats() });
    },
  });
}

export function useUpdateProductModule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: ProductModuleUpdate }): Promise<ProductModule> => {
      const { data, error } = await supabase
        .from("product_modules")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update module: ${error.message}`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: productKeys.modules() });
      queryClient.invalidateQueries({ queryKey: productKeys.module(data.id) });
    },
  });
}

export function useDeleteProductModule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from("product_modules").delete().eq("id", id);
      if (error) throw new Error(`Failed to delete module: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.modules() });
      queryClient.invalidateQueries({ queryKey: productKeys.stats() });
    },
  });
}
