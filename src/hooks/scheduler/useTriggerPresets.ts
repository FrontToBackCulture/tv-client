// CRUD hooks for trigger presets (saved schedule configurations)

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { schedulerKeys } from "./keys";

export interface TriggerPreset {
  id: string;
  name: string;
  description: string | null;
  cron_expression: string;
  active_hours: string | null;
  created_at: string;
  updated_at: string;
}

export function useTriggerPresets() {
  return useQuery({
    queryKey: schedulerKeys.triggerPresets(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trigger_presets")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TriggerPreset[];
    },
  });
}

export function useCreateTriggerPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string; cron_expression: string; active_hours?: string | null }) => {
      const { data, error } = await supabase
        .from("trigger_presets")
        .insert({ name: input.name, description: input.description ?? null, cron_expression: input.cron_expression, active_hours: input.active_hours ?? null })
        .select()
        .single();
      if (error) throw error;
      return data as TriggerPreset;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: schedulerKeys.triggerPresets() }); },
  });
}

export function useUpdateTriggerPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...fields }: { id: string } & Partial<Pick<TriggerPreset, "name" | "description" | "cron_expression" | "active_hours">>) => {
      const { error } = await supabase.from("trigger_presets").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: schedulerKeys.triggerPresets() }); },
  });
}

export function useDeleteTriggerPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("trigger_presets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: schedulerKeys.triggerPresets() }); },
  });
}
