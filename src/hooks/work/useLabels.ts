// Work Labels hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { Label, LabelInsert } from "../../lib/work/types";
import { workKeys } from "./keys";

export function useLabels() {
  return useQuery({
    queryKey: workKeys.labels(),
    queryFn: async (): Promise<Label[]> => {
      const { data, error } = await supabase
        .from("labels")
        .select("*")
        .order("name");

      if (error) throw new Error(`Failed to fetch labels: ${error.message}`);
      return data ?? [];
    },
  });
}

export function useCreateLabel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (label: LabelInsert): Promise<Label> => {
      const { data, error } = await supabase
        .from("labels")
        .insert(label)
        .select()
        .single();

      if (error) throw new Error(`Failed to create label: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workKeys.labels() });
    },
  });
}
