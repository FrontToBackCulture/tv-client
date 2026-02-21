// Product Activity + Task Links + Stats hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type {
  ProductActivity,
  ProductActivityInsert,
  ActivityFilters,
  ProductTaskLinkInsert,
  ProductTaskLink,
  ProductStats,
  ProductEntityType,
} from "../../lib/product/types";
import { productKeys } from "./keys";

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
