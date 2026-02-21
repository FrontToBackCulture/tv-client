// Product Features CRUD hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type {
  ProductFeature,
  ProductFeatureInsert,
  ProductFeatureUpdate,
  ProductFeatureWithRelations,
  FeatureFilters,
  ProductConnector,
  ProductSolution,
} from "../../lib/product/types";
import { productKeys } from "./keys";
import { useProductModule } from "./useModules";

export function useProductFeatures(filters?: FeatureFilters) {
  return useQuery({
    queryKey: filters?.moduleId
      ? productKeys.featuresByModule(filters.moduleId)
      : [...productKeys.features(), filters],
    queryFn: async (): Promise<ProductFeature[]> => {
      let query = supabase.from("product_features").select("*");

      if (filters?.moduleId) {
        query = query.eq("module_id", filters.moduleId);
      }
      if (filters?.status) {
        const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
        query = query.in("status", statuses);
      }
      if (filters?.category) {
        query = query.eq("category", filters.category);
      }
      if (filters?.search) {
        query = query.ilike("name", `%${filters.search}%`);
      }

      const { data, error } = await query.order("priority", { ascending: true });
      if (error) throw new Error(`Failed to fetch features: ${error.message}`);
      return data ?? [];
    },
  });
}

export function useProductFeature(id: string | null) {
  return useQuery({
    queryKey: productKeys.feature(id || ""),
    queryFn: async (): Promise<ProductFeature | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("product_features")
        .select("*")
        .eq("id", id)
        .single();
      if (error?.code === "PGRST116") return null;
      if (error) throw new Error(`Failed to fetch feature: ${error.message}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useProductFeatureWithRelations(id: string | null) {
  const featureQuery = useProductFeature(id);

  const connectorsQuery = useQuery({
    queryKey: [...productKeys.feature(id || ""), "connectors"],
    queryFn: async (): Promise<ProductConnector[]> => {
      if (!id) return [];
      const { data: links } = await supabase
        .from("product_feature_connectors")
        .select("connector_id")
        .eq("feature_id", id);
      if (!links?.length) return [];
      const connectorIds = links.map((l) => l.connector_id);
      const { data, error } = await supabase
        .from("product_connectors")
        .select("*")
        .in("id", connectorIds);
      if (error) throw new Error(`Failed to fetch feature connectors: ${error.message}`);
      return data ?? [];
    },
    enabled: !!id,
  });

  const solutionsQuery = useQuery({
    queryKey: [...productKeys.feature(id || ""), "solutions"],
    queryFn: async (): Promise<ProductSolution[]> => {
      if (!id) return [];
      const { data: links } = await supabase
        .from("product_solution_features")
        .select("solution_id")
        .eq("feature_id", id);
      if (!links?.length) return [];
      const solutionIds = links.map((l) => l.solution_id);
      const { data, error } = await supabase
        .from("product_solutions")
        .select("*")
        .in("id", solutionIds);
      if (error) throw new Error(`Failed to fetch feature solutions: ${error.message}`);
      return data ?? [];
    },
    enabled: !!id,
  });

  const moduleQuery = useProductModule(featureQuery.data?.module_id ?? null);

  const data: ProductFeatureWithRelations | null = featureQuery.data
    ? {
        ...featureQuery.data,
        module: moduleQuery.data ?? undefined,
        connectors: connectorsQuery.data,
        solutions: solutionsQuery.data,
      }
    : null;

  return {
    data,
    isLoading: featureQuery.isLoading || connectorsQuery.isLoading || solutionsQuery.isLoading,
    refetch: () => { featureQuery.refetch(); connectorsQuery.refetch(); solutionsQuery.refetch(); moduleQuery.refetch(); },
    error: featureQuery.error || connectorsQuery.error || solutionsQuery.error,
  };
}

export function useCreateProductFeature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (feature: ProductFeatureInsert): Promise<ProductFeature> => {
      const { data, error } = await supabase
        .from("product_features")
        .insert(feature)
        .select()
        .single();
      if (error) throw new Error(`Failed to create feature: ${error.message}`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: productKeys.features() });
      queryClient.invalidateQueries({ queryKey: productKeys.featuresByModule(data.module_id) });
      queryClient.invalidateQueries({ queryKey: productKeys.stats() });
    },
  });
}

export function useUpdateProductFeature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: ProductFeatureUpdate }): Promise<ProductFeature> => {
      const { data, error } = await supabase
        .from("product_features")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update feature: ${error.message}`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: productKeys.features() });
      queryClient.invalidateQueries({ queryKey: productKeys.feature(data.id) });
      queryClient.invalidateQueries({ queryKey: productKeys.featuresByModule(data.module_id) });
    },
  });
}

export function useDeleteProductFeature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from("product_features").delete().eq("id", id);
      if (error) throw new Error(`Failed to delete feature: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.features() });
      queryClient.invalidateQueries({ queryKey: productKeys.stats() });
    },
  });
}
