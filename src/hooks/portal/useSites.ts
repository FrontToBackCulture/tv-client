// Portal Sites CRUD hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { PortalSite } from "../../lib/portal/types";
import { portalKeys } from "./keys";

export function usePortalSites() {
  return useQuery({
    queryKey: portalKeys.sites(),
    queryFn: async (): Promise<PortalSite[]> => {
      const { data, error } = await supabase
        .from("portal_sites")
        .select("*")
        .order("name");
      if (error) throw new Error(`Failed to fetch sites: ${error.message}`);
      return (data ?? []) as PortalSite[];
    },
  });
}

export function useCreateSite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      slug: string;
      base_url?: string;
    }): Promise<PortalSite> => {
      const { data, error } = await supabase
        .from("portal_sites")
        .insert({
          name: input.name,
          slug: input.slug,
          base_url: input.base_url || null,
          config: {},
        })
        .select()
        .single();
      if (error) throw new Error(`Failed to create site: ${error.message}`);
      return data as PortalSite;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.sites() });
    },
  });
}

export function useUpdateSite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string;
      features?: Record<string, boolean>;
      branding?: Record<string, string>;
      name?: string;
      slug?: string;
      base_url?: string;
    }): Promise<PortalSite> => {
      // Get existing config to merge
      const { data: existing } = await supabase
        .from("portal_sites")
        .select("config")
        .eq("id", id)
        .single();

      const currentConfig = (existing?.config || {}) as Record<string, unknown>;
      const updatedConfig: Record<string, unknown> = {
        ...currentConfig,
        features: {
          ...((currentConfig.features as Record<string, boolean>) || {}),
          ...(updates.features || {}),
        },
      };
      if (updates.branding) {
        updatedConfig.branding = {
          ...((currentConfig.branding as Record<string, string>) || {}),
          ...updates.branding,
        };
      }

      const payload: Record<string, unknown> = {
        config: updatedConfig,
        updated_at: new Date().toISOString(),
      };
      if (updates.name) payload.name = updates.name;
      if (updates.slug) payload.slug = updates.slug;
      if (updates.base_url !== undefined) payload.base_url = updates.base_url || null;

      const { data, error } = await supabase
        .from("portal_sites")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update site: ${error.message}`);
      return data as PortalSite;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.sites() });
    },
  });
}

export function useDeleteSite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from("portal_sites")
        .delete()
        .eq("id", id);
      if (error) throw new Error(`Failed to delete site: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.sites() });
    },
  });
}
