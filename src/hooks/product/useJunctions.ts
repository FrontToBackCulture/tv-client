// Junction table mutations (feature-connector, solution-feature, solution-connector)

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type {
  FeatureConnectorInsert,
  SolutionFeatureInsert,
  SolutionConnectorInsert,
} from "../../lib/product/types";
import { productKeys } from "./keys";

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
