// Feed hooks — cards query + interaction mutations

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type {
  FeedCard,
  FeedCardWithInteraction,
  FeedInteraction,
} from "../../lib/feed/types";
import { feedKeys } from "./keys";

// ─── Feed Cards Query (main feed — only showcase cards) ───

export function useFeedCards(filter: string, userId: string) {
  return useQuery({
    queryKey: feedKeys.cardsByFilter(filter),
    refetchInterval: 5 * 60 * 1000, // refresh every 5 minutes
    queryFn: async (): Promise<FeedCardWithInteraction[]> => {
      const today = new Date().toISOString().split("T")[0];

      // Only show showcase cards (series_order=0) in main feed
      let query = supabase
        .from("feed_cards")
        .select("*")
        .eq("archived", false)
        .eq("series_order", 0)
        .or(`scheduled_date.is.null,scheduled_date.lte.${today}`)
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);

      if (filter !== "all") {
        query = query.eq("card_type", filter);
      }

      const { data: cards, error } = await query;
      if (error) throw new Error(`Failed to fetch feed cards: ${error.message}`);
      if (!cards || cards.length === 0) return [];

      // Fetch interactions for this user
      const cardIds = cards.map((c: FeedCard) => c.id);
      const { data: interactions } = await supabase
        .from("feed_interactions")
        .select("*")
        .eq("user_id", userId)
        .in("card_id", cardIds);

      const interactionMap = new Map<string, FeedInteraction>();
      if (interactions) {
        for (const i of interactions) {
          interactionMap.set(i.card_id, i as FeedInteraction);
        }
      }

      const merged: FeedCardWithInteraction[] = cards.map((c: FeedCard) => ({
        ...c,
        interaction: interactionMap.get(c.id) || null,
      }));

      // Pinned first, then chronological (query already sorts by created_at DESC).
      // The blue "new" dot handles unseen indication — no reordering needed.
      const pinned = merged.filter((c) => c.pinned);
      const unpinned = merged.filter((c) => !c.pinned);
      return [...pinned, ...unpinned];
    },
  });
}

// ─── Series Cards (detail cards for a series) ───

export function useSeriesCards(seriesId: string | null) {
  return useQuery({
    queryKey: feedKeys.series(seriesId || ""),
    queryFn: async (): Promise<FeedCard[]> => {
      if (!seriesId) return [];

      const { data, error } = await supabase
        .from("feed_cards")
        .select("*")
        .eq("series_id", seriesId)
        .eq("archived", false)
        .order("series_order", { ascending: true });

      if (error) throw new Error(`Failed to fetch series: ${error.message}`);
      return (data ?? []) as FeedCard[];
    },
    enabled: !!seriesId,
  });
}

// ─── Mark Seen ───

export function useMarkSeen(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cardId: string) => {
      const { data, error } = await supabase
        .from("feed_interactions")
        .upsert(
          {
            card_id: cardId,
            user_id: userId,
            seen: true,
            seen_at: new Date().toISOString(),
          },
          { onConflict: "card_id,user_id" }
        )
        .select()
        .single();

      if (error) throw new Error(`Failed to mark seen: ${error.message}`);
      return data;
    },
    onSuccess: (_data, cardId) => {
      // Update local cache optimistically instead of refetching.
      // Refetching was causing a cascade: hero marks seen → refetch → new hero → marks seen → ...
      queryClient.setQueriesData<FeedCardWithInteraction[]>(
        { queryKey: feedKeys.cards() },
        (old) =>
          old?.map((c) =>
            c.id === cardId
              ? {
                  ...c,
                  interaction: {
                    ...c.interaction,
                    card_id: cardId,
                    user_id: userId,
                    seen: true,
                    seen_at: new Date().toISOString(),
                  } as FeedInteraction,
                }
              : c
          )
      );
    },
  });
}

// ─── Toggle Like ───

export function useToggleLike(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      cardId,
      currentlyLiked,
    }: {
      cardId: string;
      currentlyLiked: boolean;
    }) => {
      const newLiked = !currentlyLiked;
      const { data, error } = await supabase
        .from("feed_interactions")
        .upsert(
          {
            card_id: cardId,
            user_id: userId,
            liked: newLiked,
            liked_at: newLiked ? new Date().toISOString() : null,
          },
          { onConflict: "card_id,user_id" }
        )
        .select()
        .single();

      if (error) throw new Error(`Failed to toggle like: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feedKeys.cards() });
    },
  });
}

// ─── Toggle Save ───

export function useToggleSave(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      cardId,
      currentlySaved,
    }: {
      cardId: string;
      currentlySaved: boolean;
    }) => {
      const newSaved = !currentlySaved;
      const { data, error } = await supabase
        .from("feed_interactions")
        .upsert(
          {
            card_id: cardId,
            user_id: userId,
            saved: newSaved,
            saved_at: newSaved ? new Date().toISOString() : null,
          },
          { onConflict: "card_id,user_id" }
        )
        .select()
        .single();

      if (error) throw new Error(`Failed to toggle save: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feedKeys.cards() });
      queryClient.invalidateQueries({ queryKey: feedKeys.saved(userId) });
    },
  });
}

// ─── Saved Cards ───

export function useSavedCards(userId: string) {
  return useQuery({
    queryKey: feedKeys.saved(userId),
    queryFn: async (): Promise<FeedCardWithInteraction[]> => {
      const { data: interactions, error: intError } = await supabase
        .from("feed_interactions")
        .select("card_id")
        .eq("user_id", userId)
        .eq("saved", true);

      if (intError)
        throw new Error(`Failed to fetch saved: ${intError.message}`);
      if (!interactions || interactions.length === 0) return [];

      const cardIds = interactions.map((i: { card_id: string }) => i.card_id);
      const { data: cards, error } = await supabase
        .from("feed_cards")
        .select("*")
        .in("id", cardIds)
        .eq("archived", false)
        .order("created_at", { ascending: false });

      if (error) throw new Error(`Failed to fetch saved cards: ${error.message}`);
      return (cards ?? []) as FeedCardWithInteraction[];
    },
    enabled: !!userId,
  });
}

// ─── Trending Cards (most seen in last 7 days) ───

export function useTrendingCards() {
  return useQuery({
    queryKey: feedKeys.trending(),
    queryFn: async (): Promise<
      Array<{ card: FeedCard; view_count: number }>
    > => {
      const weekAgo = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000
      ).toISOString();

      const { data: interactions, error: intError } = await supabase
        .from("feed_interactions")
        .select("card_id")
        .eq("seen", true)
        .gte("seen_at", weekAgo);

      if (intError) throw new Error(`Failed to fetch trending: ${intError.message}`);
      if (!interactions || interactions.length === 0) return [];

      const counts = new Map<string, number>();
      for (const i of interactions) {
        counts.set(i.card_id, (counts.get(i.card_id) || 0) + 1);
      }

      const sorted = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      const cardIds = sorted.map(([id]) => id);
      const { data: cards, error } = await supabase
        .from("feed_cards")
        .select("*")
        .in("id", cardIds)
        .eq("archived", false);

      if (error) throw new Error(`Failed to fetch trending cards: ${error.message}`);

      const cardMap = new Map<string, FeedCard>();
      for (const c of cards ?? []) {
        cardMap.set(c.id, c as FeedCard);
      }

      return sorted
        .filter(([id]) => cardMap.has(id))
        .map(([id, count]) => ({
          card: cardMap.get(id)!,
          view_count: count,
        }));
    },
    staleTime: 5 * 60 * 1000,
  });
}
