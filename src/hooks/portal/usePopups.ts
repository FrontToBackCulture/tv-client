// Portal Popups CRUD hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { Popup } from "../../lib/portal/types";
import { portalKeys } from "./keys";

export function usePopups() {
  return useQuery({
    queryKey: portalKeys.popups(),
    queryFn: async (): Promise<Popup[]> => {
      const { data, error } = await supabase
        .from("portal_popups")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw new Error(`Failed to fetch popups: ${error.message}`);
      return (data ?? []) as Popup[];
    },
  });
}

export function useCreatePopup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (popup: Partial<Popup>): Promise<Popup> => {
      const { data, error } = await supabase
        .from("portal_popups")
        .insert(popup)
        .select()
        .single();
      if (error) throw new Error(`Failed to create popup: ${error.message}`);
      return data as Popup;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.popups() });
    },
  });
}

export function useUpdatePopup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<Popup> & { id: string }): Promise<Popup> => {
      const { data, error } = await supabase
        .from("portal_popups")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update popup: ${error.message}`);
      return data as Popup;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.popups() });
    },
  });
}

export function useDeletePopup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from("portal_popups")
        .delete()
        .eq("id", id);
      if (error) throw new Error(`Failed to delete popup: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.popups() });
    },
  });
}
