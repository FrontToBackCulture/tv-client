// Discussion entity mention hooks — for cross-reference badges and mention creation

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { chatKeys } from "./keys";

/** Count how many threads mention a given entity */
export function useDiscussionMentionCount(mentionRef: string) {
  return useQuery({
    queryKey: chatKeys.mentionCount(mentionRef),
    queryFn: async () => {
      const { count, error } = await supabase
        .from("discussion_mentions")
        .select("id", { count: "exact", head: true })
        .eq("mention_ref", mentionRef);

      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    enabled: !!mentionRef,
  });
}

/** Create a mention record (fire-and-forget after posting a message) */
export function useCreateDiscussionMention() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      discussion_id: string;
      mention_type: "user" | "company" | "task" | "project" | "deal";
      mention_ref: string;
    }) => {
      const { error } = await supabase
        .from("discussion_mentions")
        .insert(params);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...chatKeys.all, "mentions"] });
      queryClient.invalidateQueries({ queryKey: [...chatKeys.all, "mentionCount"] });
    },
  });
}
