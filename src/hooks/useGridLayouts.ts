// Shared, workspace-wide AG Grid layouts persisted in Supabase `grid_layouts`.
// Every user in the workspace sees and shares the same named layouts.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

export interface GridLayout {
  id: string;
  grid_key: string;
  name: string;
  column_state: unknown[];
  filter_model: Record<string, unknown>;
  row_group_columns: string[];
  is_default: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface GridLayoutPayload {
  column_state: unknown[];
  filter_model: Record<string, unknown>;
  row_group_columns: string[];
}

const keys = {
  all: ["grid-layouts"] as const,
  byGrid: (gridKey: string) => ["grid-layouts", gridKey] as const,
};

export function useGridLayouts(gridKey: string) {
  return useQuery({
    queryKey: keys.byGrid(gridKey),
    queryFn: async (): Promise<GridLayout[]> => {
      const { data, error } = await supabase
        .from("grid_layouts")
        .select("*")
        .eq("grid_key", gridKey)
        .order("name", { ascending: true });
      if (error) throw new Error(`Failed to load layouts: ${error.message}`);
      return (data ?? []) as GridLayout[];
    },
    staleTime: 30_000,
  });
}

export function useSaveGridLayout(gridKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, payload }: { name: string; payload: GridLayoutPayload }) => {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes?.user?.id ?? null;
      const row = {
        grid_key: gridKey,
        name: name.trim(),
        column_state: payload.column_state,
        filter_model: payload.filter_model,
        row_group_columns: payload.row_group_columns,
        updated_by: userId,
        created_by: userId,
      };
      const { data, error } = await supabase
        .from("grid_layouts")
        .upsert(row, { onConflict: "grid_key,name" })
        .select()
        .single();
      if (error) throw new Error(`Failed to save layout: ${error.message}`);
      return data as GridLayout;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.byGrid(gridKey) }),
  });
}

export function useDeleteGridLayout(gridKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("grid_layouts").delete().eq("id", id);
      if (error) throw new Error(`Failed to delete layout: ${error.message}`);
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.byGrid(gridKey) }),
  });
}

// Flip the is_default flag. Clears other defaults for this grid first.
export function useSetDefaultGridLayout(gridKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, makeDefault }: { id: string; makeDefault: boolean }) => {
      if (makeDefault) {
        const { error: clearErr } = await supabase
          .from("grid_layouts")
          .update({ is_default: false })
          .eq("grid_key", gridKey)
          .eq("is_default", true);
        if (clearErr) throw new Error(`Failed to clear default: ${clearErr.message}`);
      }
      const { error } = await supabase
        .from("grid_layouts")
        .update({ is_default: makeDefault })
        .eq("id", id);
      if (error) throw new Error(`Failed to update default: ${error.message}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.byGrid(gridKey) }),
  });
}
