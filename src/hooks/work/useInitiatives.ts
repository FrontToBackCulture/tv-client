// Work Initiatives CRUD hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type {
  Initiative,
  InitiativeInsert,
  InitiativeUpdate,
} from "../../lib/work/types";
import { workKeys } from "./keys";

export function useInitiatives() {
  return useQuery({
    queryKey: workKeys.initiatives(),
    queryFn: async (): Promise<Initiative[]> => {
      const { data, error } = await supabase
        .from("initiatives")
        .select("*")
        .is("archived_at", null)
        .order("sort_order");

      if (error)
        throw new Error(`Failed to fetch initiatives: ${error.message}`);
      return data ?? [];
    },
  });
}

export function useInitiative(id: string | null) {
  return useQuery({
    queryKey: workKeys.initiative(id || ""),
    queryFn: async (): Promise<Initiative | null> => {
      if (!id) return null;

      const { data, error } = await supabase
        .from("initiatives")
        .select("*")
        .eq("id", id)
        .single();

      if (error && error.code !== "PGRST116") {
        throw new Error(`Failed to fetch initiative: ${error.message}`);
      }
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateInitiative() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (initiative: InitiativeInsert): Promise<Initiative> => {
      const { data, error } = await supabase
        .from("initiatives")
        .insert(initiative)
        .select()
        .single();

      if (error)
        throw new Error(`Failed to create initiative: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workKeys.initiatives() });
    },
  });
}

export function useUpdateInitiative() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: InitiativeUpdate;
    }): Promise<Initiative> => {
      const { data, error } = await supabase
        .from("initiatives")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error)
        throw new Error(`Failed to update initiative: ${error.message}`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: workKeys.initiatives() });
      queryClient.invalidateQueries({ queryKey: workKeys.initiative(data.id) });
    },
  });
}
