// CRUD hooks for output configs (saved output configurations)

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { schedulerKeys } from "./keys";

export interface OutputConfig {
  id: string;
  name: string;
  description: string | null;
  post_mode: "new_thread" | "same_thread";
  bot_author: string;
  thread_title: string | null;
  created_at: string;
  updated_at: string;
}

export function useOutputConfigs() {
  return useQuery({
    queryKey: schedulerKeys.outputConfigs(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("output_configs")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OutputConfig[];
    },
  });
}

export function useCreateOutputConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string; post_mode?: string; bot_author?: string; thread_title?: string | null }) => {
      const { data, error } = await supabase
        .from("output_configs")
        .insert({ name: input.name, description: input.description ?? null, post_mode: input.post_mode ?? "new_thread", bot_author: input.bot_author ?? "bot-mel", thread_title: input.thread_title ?? null })
        .select()
        .single();
      if (error) throw error;
      return data as OutputConfig;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: schedulerKeys.outputConfigs() }); },
  });
}

export function useUpdateOutputConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...fields }: { id: string } & Partial<Pick<OutputConfig, "name" | "description" | "post_mode" | "bot_author" | "thread_title">>) => {
      const { error } = await supabase.from("output_configs").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: schedulerKeys.outputConfigs() }); },
  });
}

export function useDeleteOutputConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("output_configs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: schedulerKeys.outputConfigs() }); },
  });
}
