// Portal Banners CRUD hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { Banner } from "../../lib/portal/types";
import { portalKeys } from "./keys";

export function useBanners() {
  return useQuery({
    queryKey: portalKeys.banners(),
    queryFn: async (): Promise<Banner[]> => {
      const { data, error } = await supabase
        .from("portal_banners")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw new Error(`Failed to fetch banners: ${error.message}`);
      return (data ?? []) as Banner[];
    },
  });
}

export function useCreateBanner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (banner: Partial<Banner>): Promise<Banner> => {
      const { data, error } = await supabase
        .from("portal_banners")
        .insert(banner)
        .select()
        .single();
      if (error) throw new Error(`Failed to create banner: ${error.message}`);
      return data as Banner;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.banners() });
    },
  });
}

export function useUpdateBanner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<Banner> & { id: string }): Promise<Banner> => {
      const { data, error } = await supabase
        .from("portal_banners")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update banner: ${error.message}`);
      return data as Banner;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.banners() });
    },
  });
}

export function useDeleteBanner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from("portal_banners")
        .delete()
        .eq("id", id);
      if (error) throw new Error(`Failed to delete banner: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.banners() });
    },
  });
}
