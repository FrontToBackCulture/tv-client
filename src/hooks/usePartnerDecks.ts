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

const DECK_BUCKET = "partner-decks";

/** slug: lowercase, alnum + single hyphens, no leading/trailing hyphen */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function uploadDeckHtml(slug: string, file: File) {
  const { error } = await supabase.storage
    .from(DECK_BUCKET)
    .upload(`${slug}.html`, file, {
      contentType: "text/html",
      upsert: true,
      cacheControl: "300",
    });
  if (error) throw new Error(`Upload failed: ${error.message}`);
}

export function useCreateDeck() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      slug: string;
      title: string;
      description: string | null;
      guidance: string | null;
      file: File;
    }) => {
      const slug = slugify(input.slug);
      if (!slug) throw new Error("Slug is required");
      if (!input.title.trim()) throw new Error("Title is required");

      // Slug must be unique (it is the Storage object key + URL path).
      const { data: existing } = await supabase
        .from("partner_decks")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (existing) throw new Error(`Slug "${slug}" already exists`);

      await uploadDeckHtml(slug, input.file);

      // Append after the current last deck.
      const { data: last } = await supabase
        .from("partner_decks")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const sortOrder = (last?.sort_order ?? 0) + 1;

      const { data, error } = await supabase
        .from("partner_decks")
        .insert({
          slug,
          title: input.title.trim(),
          description: input.description || null,
          guidance: input.guidance || null,
          file_path: `/deck-embed/${slug}`,
          published: false,
          sort_order: sortOrder,
        })
        .select();

      if (error) {
        // Roll back the orphaned Storage object so a retry can re-upload.
        await supabase.storage.from(DECK_BUCKET).remove([`${slug}.html`]);
        throw new Error(error.message);
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deckKeys.all });
    },
  });
}

export function useReplaceDeckFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      slug,
      file,
    }: {
      id: string;
      slug: string;
      file: File;
    }) => {
      await uploadDeckHtml(slug, file);
      // Touch updated_at so the website proxy busts the Storage CDN cache,
      // and normalise file_path for any legacy rows.
      const { data, error } = await supabase
        .from("partner_decks")
        .update({
          file_path: `/deck-embed/${slug}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select();
      if (error) throw new Error(error.message);
      if (!data || data.length === 0)
        throw new Error("No rows updated — check RLS policies");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deckKeys.all });
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
