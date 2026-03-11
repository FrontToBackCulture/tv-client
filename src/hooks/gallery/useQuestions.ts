// Question Library CRUD hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type {
  Question,
  QuestionInsert,
  QuestionUpdate,
} from "../../lib/gallery/types";
import { questionKeys } from "./keys";

export function useQuestions(filters?: {
  published?: boolean;
  featured?: boolean;
  category?: string;
}) {
  return useQuery({
    queryKey: questionKeys.list(filters),
    queryFn: async (): Promise<Question[]> => {
      let query = supabase
        .from("question_library")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("question", { ascending: true });

      if (filters?.published !== undefined) {
        query = query.eq("published", filters.published);
      }
      if (filters?.featured !== undefined) {
        query = query.eq("featured", filters.featured);
      }
      if (filters?.category) {
        query = query.eq("category", filters.category);
      }

      const { data, error } = await query;
      if (error)
        throw new Error(`Failed to fetch questions: ${error.message}`);
      return data ?? [];
    },
  });
}

export function useCreateQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: QuestionInsert): Promise<Question> => {
      const { data, error } = await supabase
        .from("question_library")
        .insert(input)
        .select()
        .single();

      if (error)
        throw new Error(`Failed to create question: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: questionKeys.all });
    },
  });
}

export function useUpdateQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: QuestionUpdate;
    }): Promise<Question> => {
      const { data, error } = await supabase
        .from("question_library")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error)
        throw new Error(`Failed to update question: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: questionKeys.all });
    },
  });
}

export function useDeleteQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from("question_library")
        .delete()
        .eq("id", id);

      if (error)
        throw new Error(`Failed to delete question: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: questionKeys.all });
    },
  });
}
