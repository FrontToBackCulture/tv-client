// CRUD hooks for instruction templates (saved AI process configurations)

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { schedulerKeys } from "./keys";

export interface InstructionTemplate {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  model: string;
  bot_path: string | null;
  created_at: string;
  updated_at: string;
}

export function useInstructionTemplates() {
  return useQuery({
    queryKey: schedulerKeys.instructionTemplates(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instruction_templates")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as InstructionTemplate[];
    },
  });
}

export function useCreateInstructionTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string; system_prompt: string; model?: string; bot_path?: string | null }) => {
      const { data, error } = await supabase
        .from("instruction_templates")
        .insert({ name: input.name, description: input.description ?? null, system_prompt: input.system_prompt, model: input.model ?? "sonnet", bot_path: input.bot_path ?? null })
        .select()
        .single();
      if (error) throw error;
      return data as InstructionTemplate;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: schedulerKeys.instructionTemplates() }); },
  });
}

export function useUpdateInstructionTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...fields }: { id: string } & Partial<Pick<InstructionTemplate, "name" | "description" | "system_prompt" | "model" | "bot_path">>) => {
      const { error } = await supabase.from("instruction_templates").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: schedulerKeys.instructionTemplates() }); },
  });
}

export function useDeleteInstructionTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("instruction_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: schedulerKeys.instructionTemplates() }); },
  });
}
