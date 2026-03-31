// Fetch all top-level discussion threads for the chat inbox

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { chatKeys } from "./keys";

export interface Thread {
  id: string;
  entity_type: string;
  entity_id: string;
  author: string;
  body: string;
  title: string | null;
  created_at: string;
  last_activity_at: string;
}

/** Fetch all top-level threads sorted by last activity */
export function useThreads() {
  return useQuery({
    queryKey: chatKeys.threads(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discussions")
        .select("id, entity_type, entity_id, author, body, title, created_at, last_activity_at")
        .is("parent_id", null)
        .order("last_activity_at", { ascending: false })
        .limit(100);

      if (error) throw new Error(error.message);
      return (data ?? []) as Thread[];
    },
  });
}
