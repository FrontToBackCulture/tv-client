// src/hooks/usePartnerDecks.ts
// React Query hooks for partner deck collateral management

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

export interface PartnerDeck {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  guidance: string | null;
  file_path: string;
  thumbnail_url: string | null;
  published: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export const deckKeys = {
  all: ["partner-decks"] as const,
  list: () => ["partner-decks", "list"] as const,
};

export function usePartnerDecks() {
  return useQuery({
    queryKey: deckKeys.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_decks")
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) throw new Error(error.message);
      return (data ?? []) as PartnerDeck[];
    },
  });
}

export function useUpdateDeck() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Pick<PartnerDeck, "title" | "description" | "guidance" | "published" | "sort_order">>;
    }) => {
      const { data, error } = await supabase
        .from("partner_decks")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select();

      if (error) throw new Error(error.message);
      if (!data || data.length === 0) throw new Error("No rows updated — check RLS policies");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deckKeys.all });
    },
    onError: (err) => {
      console.error("Failed to update deck:", err.message);
    },
  });
}
