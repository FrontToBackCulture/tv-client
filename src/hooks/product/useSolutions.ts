// Product Solutions CRUD hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type {
  ProductSolution,
  ProductSolutionInsert,
  ProductSolutionUpdate,
  ProductSolutionWithRelations,
  SolutionFilters,
  ProductDeployment,
} from "../../lib/product/types";
import { productKeys } from "./keys";

export function useProductSolutions(filters?: SolutionFilters) {
  return useQuery({
    queryKey: [...productKeys.solutions(), filters],
    queryFn: async (): Promise<ProductSolution[]> => {
      let query = supabase.from("product_solutions").select("*");

      if (filters?.status) {
        query = query.eq("status", filters.status);
      }
      if (filters?.targetIndustry) {
        query = query.eq("target_industry", filters.targetIndustry);
      }
      if (filters?.search) {
        query = query.ilike("name", `%${filters.search}%`);
      }

      const { data, error } = await query.order("name", { ascending: true });
      if (error) throw new Error(`Failed to fetch solutions: ${error.message}`);
      return data ?? [];
    },
  });
}

export function useProductSolution(id: string | null) {
  return useQuery({
    queryKey: productKeys.solution(id || ""),
    queryFn: async (): Promise<ProductSolution | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("product_solutions")
        .select("*")
        .eq("id", id)
        .single();
      if (error?.code === "PGRST116") return null;
      if (error) throw new Error(`Failed to fetch solution: ${error.message}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useProductSolutionWithRelations(id: string | null) {
  const solutionQuery = useProductSolution(id);

  const featuresQuery = useQuery({
    queryKey: [...productKeys.solution(id || ""), "features"],
    queryFn: async () => {
      if (!id) return [];
      const { data: links } = await supabase
        .from("product_solution_features")
        .select("*")
        .eq("solution_id", id)
        .order("sort_order", { ascending: true });
      if (!links?.length) return [];
      const featureIds = links.map((l) => l.feature_id);
      const { data: features } = await supabase
        .from("product_features")
        .select("*")
        .in("id", featureIds);
      return links.map((link) => ({
        ...link,
        feature: features?.find((f) => f.id === link.feature_id),
      }));
    },
    enabled: !!id,
  });

  const connectorsQuery = useQuery({
    queryKey: [...productKeys.solution(id || ""), "connectors"],
    queryFn: async () => {
      if (!id) return [];
      const { data: links } = await supabase
        .from("product_solution_connectors")
        .select("*")
        .eq("solution_id", id);
      if (!links?.length) return [];
      const connectorIds = links.map((l) => l.connector_id);
      const { data: connectors } = await supabase
        .from("product_connectors")
        .select("*")
        .in("id", connectorIds);
      return links.map((link) => ({
        ...link,
        connector: connectors?.find((c) => c.id === link.connector_id),
      }));
    },
    enabled: !!id,
  });

  const deploymentsQuery = useQuery({
    queryKey: [...productKeys.solution(id || ""), "deployments"],
    queryFn: async (): Promise<ProductDeployment[]> => {
      if (!id) return [];
      const { data: links } = await supabase
        .from("product_deployment_solutions")
        .select("deployment_id")
        .eq("solution_id", id);
      if (!links?.length) return [];
      const deploymentIds = links.map((l) => l.deployment_id);
      const { data, error } = await supabase
        .from("product_deployments")
        .select("*")
        .in("id", deploymentIds);
      if (error) return [];
      return data ?? [];
    },
    enabled: !!id,
  });

  const data: ProductSolutionWithRelations | null = solutionQuery.data
    ? {
        ...solutionQuery.data,
        features: featuresQuery.data,
        connectors: connectorsQuery.data,
        deployments: deploymentsQuery.data,
        featureCount: featuresQuery.data?.length ?? 0,
        connectorCount: connectorsQuery.data?.length ?? 0,
        deploymentCount: deploymentsQuery.data?.length ?? 0,
      }
    : null;

  return {
    data,
    isLoading: solutionQuery.isLoading || featuresQuery.isLoading || connectorsQuery.isLoading || deploymentsQuery.isLoading,
    refetch: () => { solutionQuery.refetch(); featuresQuery.refetch(); connectorsQuery.refetch(); deploymentsQuery.refetch(); },
    error: solutionQuery.error || featuresQuery.error || connectorsQuery.error || deploymentsQuery.error,
  };
}

export function useCreateProductSolution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (solution: ProductSolutionInsert): Promise<ProductSolution> => {
      const { data, error } = await supabase
        .from("product_solutions")
        .insert(solution)
        .select()
        .single();
      if (error) throw new Error(`Failed to create solution: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.solutions() });
      queryClient.invalidateQueries({ queryKey: productKeys.stats() });
    },
  });
}

export function useUpdateProductSolution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: ProductSolutionUpdate }): Promise<ProductSolution> => {
      const { data, error } = await supabase
        .from("product_solutions")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update solution: ${error.message}`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: productKeys.solutions() });
      queryClient.invalidateQueries({ queryKey: productKeys.solution(data.id) });
    },
  });
}

export function useDeleteProductSolution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from("product_solutions").delete().eq("id", id);
      if (error) throw new Error(`Failed to delete solution: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.solutions() });
      queryClient.invalidateQueries({ queryKey: productKeys.stats() });
    },
  });
}
