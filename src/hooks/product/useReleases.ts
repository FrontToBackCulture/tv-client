// Product Releases CRUD hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type {
  ProductRelease,
  ProductReleaseInsert,
  ProductReleaseUpdate,
  ProductReleaseWithRelations,
  ReleaseFilters,
  ReleaseItemInsert,
} from "../../lib/product/types";
import { productKeys } from "./keys";

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
