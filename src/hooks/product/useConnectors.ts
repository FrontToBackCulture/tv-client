// Product Connectors CRUD hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type {
  ProductConnector,
  ProductConnectorInsert,
  ProductConnectorUpdate,
  ProductConnectorWithRelations,
  ConnectorFilters,
  ProductFeature,
  ProductDeployment,
} from "../../lib/product/types";
import { productKeys } from "./keys";

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
