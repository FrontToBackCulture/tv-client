// Per-user, per-thread read position tracking

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { chatKeys } from "./keys";

interface ReadPosition {
  user_id: string;
  thread_id: string;
  last_read_at: string;
}

/** Fetch all read positions for a user */
export function useChatReadPositions(userId: string) {
  return useQuery({
    queryKey: chatKeys.readPositions(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_read_positions")
        .select("*")
        .eq("user_id", userId);

      if (error) throw new Error(error.message);
      // Return as a Map for O(1) lookup
      const map = new Map<string, string>();
      for (const row of (data ?? []) as ReadPosition[]) {
        map.set(row.thread_id, row.last_read_at);
      }
      return map;
    },
    enabled: !!userId,
  });
}

/** Upsert read position when a thread is opened */
export function useUpsertReadPosition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { userId: string; threadId: string }) => {
      const { error } = await supabase
        .from("chat_read_positions")
        .upsert(
          {
            user_id: params.userId,
            thread_id: params.threadId,
            last_read_at: new Date().toISOString(),
          },
          { onConflict: "user_id,thread_id" }
        );

      if (error) throw new Error(error.message);
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({
        queryKey: chatKeys.readPositions(params.userId),
      });
    },
  });
}
