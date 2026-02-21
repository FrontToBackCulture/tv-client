// Product Deployments CRUD hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type {
  ProductDeployment,
  ProductDeploymentInsert,
  ProductDeploymentUpdate,
  ProductDeploymentWithRelations,
  DeploymentFilters,
  DeploymentConnectorInsert,
  DeploymentSolutionInsert,
} from "../../lib/product/types";
import { productKeys } from "./keys";

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
