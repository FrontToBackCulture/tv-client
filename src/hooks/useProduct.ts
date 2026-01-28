// React Query hooks for Product module
// Direct Supabase calls — no middleware

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type {
  ProductModule,
  ProductModuleInsert,
  ProductModuleUpdate,
  ProductModuleWithRelations,
  ModuleFilters,
  ProductFeature,
  ProductFeatureInsert,
  ProductFeatureUpdate,
  ProductFeatureWithRelations,
  FeatureFilters,
  ProductConnector,
  ProductConnectorInsert,
  ProductConnectorUpdate,
  ProductConnectorWithRelations,
  ConnectorFilters,
  ProductSolution,
  ProductSolutionInsert,
  ProductSolutionUpdate,
  ProductSolutionWithRelations,
  SolutionFilters,
  ProductRelease,
  ProductReleaseInsert,
  ProductReleaseUpdate,
  ProductReleaseWithRelations,
  ReleaseFilters,
  ProductDeployment,
  ProductDeploymentInsert,
  ProductDeploymentUpdate,
  ProductDeploymentWithRelations,
  DeploymentFilters,
  ProductActivity,
  ProductActivityInsert,
  ActivityFilters,
  ProductTaskLinkInsert,
  ProductTaskLink,
  FeatureConnectorInsert,
  SolutionFeatureInsert,
  SolutionConnectorInsert,
  ReleaseItemInsert,
  DeploymentConnectorInsert,
  DeploymentSolutionInsert,
  ProductStats,
  ProductEntityType,
} from "../lib/product/types";

// ============================================
// Query Keys
// ============================================
export const productKeys = {
  all: ["product"] as const,

  // Core entities
  modules: () => [...productKeys.all, "modules"] as const,
  module: (id: string) => [...productKeys.modules(), id] as const,

  features: () => [...productKeys.all, "features"] as const,
  featuresByModule: (moduleId: string) => [...productKeys.features(), "module", moduleId] as const,
  feature: (id: string) => [...productKeys.features(), id] as const,

  connectors: () => [...productKeys.all, "connectors"] as const,
  connector: (id: string) => [...productKeys.connectors(), id] as const,

  solutions: () => [...productKeys.all, "solutions"] as const,
  solution: (id: string) => [...productKeys.solutions(), id] as const,

  releases: () => [...productKeys.all, "releases"] as const,
  release: (id: string) => [...productKeys.releases(), id] as const,

  deployments: () => [...productKeys.all, "deployments"] as const,
  deployment: (id: string) => [...productKeys.deployments(), id] as const,

  // Supporting
  activity: () => [...productKeys.all, "activity"] as const,
  activityByEntity: (type: string, id: string) => [...productKeys.activity(), type, id] as const,
  taskLinks: () => [...productKeys.all, "task-links"] as const,
  stats: () => [...productKeys.all, "stats"] as const,
};

// ============================================
// MODULES
// ============================================

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

// ============================================
// FEATURES
// ============================================

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

// ============================================
// CONNECTORS
// ============================================

export function useProductConnectors(filters?: ConnectorFilters) {
  return useQuery({
    queryKey: [...productKeys.connectors(), filters],
    queryFn: async (): Promise<ProductConnector[]> => {
      let query = supabase.from("product_connectors").select("*");

      if (filters?.platformCategory) {
        query = query.eq("platform_category", filters.platformCategory);
      }
      if (filters?.connectorType) {
        const types = Array.isArray(filters.connectorType) ? filters.connectorType : [filters.connectorType];
        query = query.in("connector_type", types);
      }
      if (filters?.status) {
        const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
        query = query.in("status", statuses);
      }
      if (filters?.region) {
        query = query.eq("region", filters.region);
      }
      if (filters?.search) {
        query = query.ilike("name", `%${filters.search}%`);
      }

      const { data, error } = await query.order("name", { ascending: true });
      if (error) throw new Error(`Failed to fetch connectors: ${error.message}`);
      return data ?? [];
    },
  });
}

export function useProductConnector(id: string | null) {
  return useQuery({
    queryKey: productKeys.connector(id || ""),
    queryFn: async (): Promise<ProductConnector | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("product_connectors")
        .select("*")
        .eq("id", id)
        .single();
      if (error?.code === "PGRST116") return null;
      if (error) throw new Error(`Failed to fetch connector: ${error.message}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useProductConnectorWithRelations(id: string | null) {
  const connectorQuery = useProductConnector(id);

  const featuresQuery = useQuery({
    queryKey: [...productKeys.connector(id || ""), "features"],
    queryFn: async (): Promise<ProductFeature[]> => {
      if (!id) return [];
      const { data: links } = await supabase
        .from("product_feature_connectors")
        .select("feature_id")
        .eq("connector_id", id);
      if (!links?.length) return [];
      const featureIds = links.map((l) => l.feature_id);
      const { data, error } = await supabase
        .from("product_features")
        .select("*")
        .in("id", featureIds);
      if (error) throw new Error(`Failed to fetch connector features: ${error.message}`);
      return data ?? [];
    },
    enabled: !!id,
  });

  const deploymentsQuery = useQuery({
    queryKey: [...productKeys.connector(id || ""), "deployments"],
    queryFn: async (): Promise<ProductDeployment[]> => {
      if (!id) return [];
      const { data: links } = await supabase
        .from("product_deployment_connectors")
        .select("deployment_id")
        .eq("connector_id", id);
      if (!links?.length) return [];
      const deploymentIds = links.map((l) => l.deployment_id);
      const { data, error } = await supabase
        .from("product_deployments")
        .select("*")
        .in("id", deploymentIds);
      if (error) throw new Error(`Failed to fetch connector deployments: ${error.message}`);
      return data ?? [];
    },
    enabled: !!id,
  });

  const data: ProductConnectorWithRelations | null = connectorQuery.data
    ? {
        ...connectorQuery.data,
        features: featuresQuery.data,
        deployments: deploymentsQuery.data,
        deploymentCount: deploymentsQuery.data?.length ?? 0,
      }
    : null;

  return {
    data,
    isLoading: connectorQuery.isLoading || featuresQuery.isLoading || deploymentsQuery.isLoading,
    refetch: () => { connectorQuery.refetch(); featuresQuery.refetch(); deploymentsQuery.refetch(); },
    error: connectorQuery.error || featuresQuery.error || deploymentsQuery.error,
  };
}

export function useCreateProductConnector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (connector: ProductConnectorInsert): Promise<ProductConnector> => {
      const { data, error } = await supabase
        .from("product_connectors")
        .insert(connector)
        .select()
        .single();
      if (error) throw new Error(`Failed to create connector: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.connectors() });
      queryClient.invalidateQueries({ queryKey: productKeys.stats() });
    },
  });
}

export function useUpdateProductConnector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: ProductConnectorUpdate }): Promise<ProductConnector> => {
      const { data, error } = await supabase
        .from("product_connectors")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update connector: ${error.message}`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: productKeys.connectors() });
      queryClient.invalidateQueries({ queryKey: productKeys.connector(data.id) });
    },
  });
}

export function useDeleteProductConnector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from("product_connectors").delete().eq("id", id);
      if (error) throw new Error(`Failed to delete connector: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.connectors() });
      queryClient.invalidateQueries({ queryKey: productKeys.stats() });
    },
  });
}

// ============================================
// SOLUTIONS
// ============================================

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

// ============================================
// RELEASES
// ============================================

export function useProductReleases(filters?: ReleaseFilters) {
  return useQuery({
    queryKey: [...productKeys.releases(), filters],
    queryFn: async (): Promise<ProductRelease[]> => {
      let query = supabase.from("product_releases").select("*");

      if (filters?.status) {
        const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
        query = query.in("status", statuses);
      }
      if (filters?.search) {
        query = query.or(`version.ilike.%${filters.search}%,name.ilike.%${filters.search}%`);
      }

      const { data, error } = await query.order("release_date", { ascending: false, nullsFirst: false });
      if (error) throw new Error(`Failed to fetch releases: ${error.message}`);
      return data ?? [];
    },
  });
}

export function useProductRelease(id: string | null) {
  return useQuery({
    queryKey: productKeys.release(id || ""),
    queryFn: async (): Promise<ProductRelease | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("product_releases")
        .select("*")
        .eq("id", id)
        .single();
      if (error?.code === "PGRST116") return null;
      if (error) throw new Error(`Failed to fetch release: ${error.message}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useProductReleaseWithRelations(id: string | null) {
  const releaseQuery = useProductRelease(id);

  const itemsQuery = useQuery({
    queryKey: [...productKeys.release(id || ""), "items"],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from("product_release_items")
        .select("*")
        .eq("release_id", id)
        .order("sort_order", { ascending: true });
      if (error) throw new Error(`Failed to fetch release items: ${error.message}`);
      return data ?? [];
    },
    enabled: !!id,
  });

  const items = itemsQuery.data ?? [];
  const data: ProductReleaseWithRelations | null = releaseQuery.data
    ? {
        ...releaseQuery.data,
        items,
        featureCount: items.filter((i) => i.type === "feature").length,
        bugfixCount: items.filter((i) => i.type === "bugfix").length,
        connectorCount: items.filter((i) => i.type === "connector").length,
        improvementCount: items.filter((i) => i.type === "improvement").length,
      }
    : null;

  return {
    data,
    isLoading: releaseQuery.isLoading || itemsQuery.isLoading,
    refetch: () => { releaseQuery.refetch(); itemsQuery.refetch(); },
    error: releaseQuery.error || itemsQuery.error,
  };
}

export function useCreateProductRelease() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (release: ProductReleaseInsert): Promise<ProductRelease> => {
      const { data, error } = await supabase
        .from("product_releases")
        .insert(release)
        .select()
        .single();
      if (error) throw new Error(`Failed to create release: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.releases() });
      queryClient.invalidateQueries({ queryKey: productKeys.stats() });
    },
  });
}

export function useUpdateProductRelease() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: ProductReleaseUpdate }): Promise<ProductRelease> => {
      const { data, error } = await supabase
        .from("product_releases")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update release: ${error.message}`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: productKeys.releases() });
      queryClient.invalidateQueries({ queryKey: productKeys.release(data.id) });
    },
  });
}

export function useDeleteProductRelease() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from("product_releases").delete().eq("id", id);
      if (error) throw new Error(`Failed to delete release: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.releases() });
      queryClient.invalidateQueries({ queryKey: productKeys.stats() });
    },
  });
}

// ============================================
// DEPLOYMENTS
// ============================================

export function useProductDeployments(filters?: DeploymentFilters) {
  return useQuery({
    queryKey: [...productKeys.deployments(), filters],
    queryFn: async (): Promise<ProductDeployment[]> => {
      let query = supabase.from("product_deployments").select("*");

      if (filters?.status) {
        const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
        query = query.in("status", statuses);
      }
      if (filters?.companyId) {
        query = query.eq("company_id", filters.companyId);
      }
      if (filters?.search) {
        query = query.ilike("domain_id", `%${filters.search}%`);
      }

      const { data, error } = await query.order("domain_id", { ascending: true });
      if (error) throw new Error(`Failed to fetch deployments: ${error.message}`);
      return data ?? [];
    },
  });
}

export function useProductDeployment(id: string | null) {
  return useQuery({
    queryKey: productKeys.deployment(id || ""),
    queryFn: async (): Promise<ProductDeployment | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("product_deployments")
        .select("*")
        .eq("id", id)
        .single();
      if (error?.code === "PGRST116") return null;
      if (error) throw new Error(`Failed to fetch deployment: ${error.message}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useProductDeploymentWithRelations(id: string | null) {
  const deploymentQuery = useProductDeployment(id);

  const companyQuery = useQuery({
    queryKey: [...productKeys.deployment(id || ""), "company"],
    queryFn: async () => {
      const companyId = deploymentQuery.data?.company_id;
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("crm_companies")
        .select("id, name, display_name")
        .eq("id", companyId)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!deploymentQuery.data?.company_id,
  });

  const connectorsQuery = useQuery({
    queryKey: [...productKeys.deployment(id || ""), "connectors"],
    queryFn: async () => {
      if (!id) return [];
      const { data: links } = await supabase
        .from("product_deployment_connectors")
        .select("*")
        .eq("deployment_id", id);
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

  const solutionsQuery = useQuery({
    queryKey: [...productKeys.deployment(id || ""), "solutions"],
    queryFn: async () => {
      if (!id) return [];
      const { data: links } = await supabase
        .from("product_deployment_solutions")
        .select("*")
        .eq("deployment_id", id);
      if (!links?.length) return [];
      const solutionIds = links.map((l) => l.solution_id);
      const { data: solutions } = await supabase
        .from("product_solutions")
        .select("*")
        .in("id", solutionIds);
      return links.map((link) => ({
        ...link,
        solution: solutions?.find((s) => s.id === link.solution_id),
      }));
    },
    enabled: !!id,
  });

  const data: ProductDeploymentWithRelations | null = deploymentQuery.data
    ? {
        ...deploymentQuery.data,
        company: companyQuery.data ?? undefined,
        connectors: connectorsQuery.data,
        solutions: solutionsQuery.data,
        connectorCount: connectorsQuery.data?.length ?? 0,
        solutionCount: solutionsQuery.data?.length ?? 0,
      }
    : null;

  return {
    data,
    isLoading: deploymentQuery.isLoading || companyQuery.isLoading || connectorsQuery.isLoading || solutionsQuery.isLoading,
    refetch: () => { deploymentQuery.refetch(); companyQuery.refetch(); connectorsQuery.refetch(); solutionsQuery.refetch(); },
    error: deploymentQuery.error || companyQuery.error || connectorsQuery.error || solutionsQuery.error,
  };
}

export function useCreateProductDeployment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (deployment: ProductDeploymentInsert): Promise<ProductDeployment> => {
      const { data, error } = await supabase
        .from("product_deployments")
        .insert(deployment)
        .select()
        .single();
      if (error) throw new Error(`Failed to create deployment: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.deployments() });
      queryClient.invalidateQueries({ queryKey: productKeys.stats() });
    },
  });
}

export function useUpdateProductDeployment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: ProductDeploymentUpdate }): Promise<ProductDeployment> => {
      const { data, error } = await supabase
        .from("product_deployments")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update deployment: ${error.message}`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: productKeys.deployments() });
      queryClient.invalidateQueries({ queryKey: productKeys.deployment(data.id) });
    },
  });
}

export function useDeleteProductDeployment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from("product_deployments").delete().eq("id", id);
      if (error) throw new Error(`Failed to delete deployment: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.deployments() });
      queryClient.invalidateQueries({ queryKey: productKeys.stats() });
    },
  });
}

// ============================================
// JUNCTION TABLE MUTATIONS
// ============================================

export function useLinkFeatureConnector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (link: FeatureConnectorInsert) => {
      const { data, error } = await supabase
        .from("product_feature_connectors")
        .insert(link)
        .select()
        .single();
      if (error) throw new Error(`Failed to link feature-connector: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.features() });
      queryClient.invalidateQueries({ queryKey: productKeys.connectors() });
    },
  });
}

export function useUnlinkFeatureConnector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ featureId, connectorId }: { featureId: string; connectorId: string }) => {
      const { error } = await supabase
        .from("product_feature_connectors")
        .delete()
        .eq("feature_id", featureId)
        .eq("connector_id", connectorId);
      if (error) throw new Error(`Failed to unlink feature-connector: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.features() });
      queryClient.invalidateQueries({ queryKey: productKeys.connectors() });
    },
  });
}

export function useLinkSolutionFeature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (link: SolutionFeatureInsert) => {
      const { data, error } = await supabase
        .from("product_solution_features")
        .insert(link)
        .select()
        .single();
      if (error) throw new Error(`Failed to link solution-feature: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.solutions() });
      queryClient.invalidateQueries({ queryKey: productKeys.features() });
    },
  });
}

export function useUnlinkSolutionFeature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ solutionId, featureId }: { solutionId: string; featureId: string }) => {
      const { error } = await supabase
        .from("product_solution_features")
        .delete()
        .eq("solution_id", solutionId)
        .eq("feature_id", featureId);
      if (error) throw new Error(`Failed to unlink solution-feature: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.solutions() });
    },
  });
}

export function useLinkSolutionConnector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (link: SolutionConnectorInsert) => {
      const { data, error } = await supabase
        .from("product_solution_connectors")
        .insert(link)
        .select()
        .single();
      if (error) throw new Error(`Failed to link solution-connector: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.solutions() });
    },
  });
}

export function useUnlinkSolutionConnector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ solutionId, connectorId }: { solutionId: string; connectorId: string }) => {
      const { error } = await supabase
        .from("product_solution_connectors")
        .delete()
        .eq("solution_id", solutionId)
        .eq("connector_id", connectorId);
      if (error) throw new Error(`Failed to unlink solution-connector: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.solutions() });
    },
  });
}

export function useAddReleaseItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (item: ReleaseItemInsert) => {
      const { data, error } = await supabase
        .from("product_release_items")
        .insert(item)
        .select()
        .single();
      if (error) throw new Error(`Failed to add release item: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.releases() });
    },
  });
}

export function useRemoveReleaseItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("product_release_items").delete().eq("id", id);
      if (error) throw new Error(`Failed to remove release item: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.releases() });
    },
  });
}

export function useLinkDeploymentConnector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (link: DeploymentConnectorInsert) => {
      const { data, error } = await supabase
        .from("product_deployment_connectors")
        .insert(link)
        .select()
        .single();
      if (error) throw new Error(`Failed to link deployment-connector: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.deployments() });
    },
  });
}

export function useUnlinkDeploymentConnector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ deploymentId, connectorId }: { deploymentId: string; connectorId: string }) => {
      const { error } = await supabase
        .from("product_deployment_connectors")
        .delete()
        .eq("deployment_id", deploymentId)
        .eq("connector_id", connectorId);
      if (error) throw new Error(`Failed to unlink deployment-connector: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.deployments() });
    },
  });
}

export function useLinkDeploymentSolution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (link: DeploymentSolutionInsert) => {
      const { data, error } = await supabase
        .from("product_deployment_solutions")
        .insert(link)
        .select()
        .single();
      if (error) throw new Error(`Failed to link deployment-solution: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.deployments() });
    },
  });
}

export function useUnlinkDeploymentSolution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ deploymentId, solutionId }: { deploymentId: string; solutionId: string }) => {
      const { error } = await supabase
        .from("product_deployment_solutions")
        .delete()
        .eq("deployment_id", deploymentId)
        .eq("solution_id", solutionId);
      if (error) throw new Error(`Failed to unlink deployment-solution: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.deployments() });
    },
  });
}

// ============================================
// ACTIVITY
// ============================================

export function useProductActivity(filters?: ActivityFilters) {
  return useQuery({
    queryKey: filters?.entityType && filters?.entityId
      ? productKeys.activityByEntity(filters.entityType, filters.entityId)
      : [...productKeys.activity(), filters],
    queryFn: async (): Promise<ProductActivity[]> => {
      let query = supabase.from("product_activity").select("*");

      if (filters?.entityType) {
        query = query.eq("entity_type", filters.entityType);
      }
      if (filters?.entityId) {
        query = query.eq("entity_id", filters.entityId);
      }
      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw new Error(`Failed to fetch activity: ${error.message}`);
      return data ?? [];
    },
  });
}

export function useCreateProductActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (activity: ProductActivityInsert): Promise<ProductActivity> => {
      const { data, error } = await supabase
        .from("product_activity")
        .insert(activity)
        .select()
        .single();
      if (error) throw new Error(`Failed to create activity: ${error.message}`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: productKeys.activity() });
      queryClient.invalidateQueries({
        queryKey: productKeys.activityByEntity(data.entity_type, data.entity_id),
      });
    },
  });
}

// ============================================
// TASK LINKS
// ============================================

export function useProductTaskLinks(entityType?: ProductEntityType, entityId?: string) {
  return useQuery({
    queryKey: [...productKeys.taskLinks(), entityType, entityId],
    queryFn: async (): Promise<ProductTaskLink[]> => {
      let query = supabase.from("product_task_links").select("*");
      if (entityType) query = query.eq("entity_type", entityType);
      if (entityId) query = query.eq("entity_id", entityId);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw new Error(`Failed to fetch task links: ${error.message}`);
      return data ?? [];
    },
    enabled: !!entityType && !!entityId,
  });
}

export function useLinkProductTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (link: ProductTaskLinkInsert) => {
      const { data, error } = await supabase
        .from("product_task_links")
        .insert(link)
        .select()
        .single();
      if (error) throw new Error(`Failed to link task: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.taskLinks() });
    },
  });
}

export function useUnlinkProductTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("product_task_links").delete().eq("id", id);
      if (error) throw new Error(`Failed to unlink task: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.taskLinks() });
    },
  });
}

// ============================================
// STATS
// ============================================

export function useProductStats() {
  return useQuery({
    queryKey: productKeys.stats(),
    queryFn: async (): Promise<ProductStats> => {
      const [modules, features, connectors, solutions, releases, deployments] = await Promise.all([
        supabase.from("product_modules").select("id", { count: "exact", head: true }),
        supabase.from("product_features").select("id", { count: "exact", head: true }),
        supabase.from("product_connectors").select("id", { count: "exact", head: true }),
        supabase.from("product_solutions").select("id", { count: "exact", head: true }),
        supabase.from("product_releases").select("id", { count: "exact", head: true }),
        supabase.from("product_deployments").select("id", { count: "exact", head: true }),
      ]);

      return {
        modules: modules.count ?? 0,
        features: features.count ?? 0,
        connectors: connectors.count ?? 0,
        solutions: solutions.count ?? 0,
        releases: releases.count ?? 0,
        deployments: deployments.count ?? 0,
      };
    },
  });
}
