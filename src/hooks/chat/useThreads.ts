// Fetch unique conversation threads for the chat inbox
// Groups by entity_type + entity_id so one entity = one thread in the inbox
// Title is always from the FIRST message (stable, never changes when new messages arrive)

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
  message_count: number;
  last_author: string;
}

/** Fetch unique threads (one per entity) sorted by last activity */
export function useThreads() {
  return useQuery({
    queryKey: chatKeys.threads(),
    queryFn: async () => {
      // Fetch all top-level messages ordered by creation time ascending
      // so we process oldest first and the first message becomes the title
      const { data, error } = await supabase
        .from("discussions")
        .select("id, entity_type, entity_id, author, body, title, created_at, last_activity_at")
        .is("parent_id", null)
        .order("created_at", { ascending: true })
        .limit(500);

      if (error) throw new Error(error.message);
      const rows = (data ?? []) as (Thread & { message_count?: number; last_author?: string })[];

      // Group by entity_type:entity_id
      // First row per group = oldest message = stable title
      const grouped = new Map<string, Thread>();
      for (const row of rows) {
        const key = `${row.entity_type}:${row.entity_id}`;
        const existing = grouped.get(key);
        if (!existing) {
          // First (oldest) message — this sets the stable title
          grouped.set(key, {
            ...row,
            title: row.title || row.body.slice(0, 60),
            message_count: 1,
            last_author: row.author,
          });
        } else {
          existing.message_count = (existing.message_count || 1) + 1;
          // Update last_activity_at and last_author to the newest message
          if (new Date(row.last_activity_at) > new Date(existing.last_activity_at)) {
            existing.last_activity_at = row.last_activity_at;
            existing.id = row.id; // representative ID for read tracking = latest message
          }
          existing.last_author = row.author;
          // If an explicit title was set (via NewThreadModal), prefer it
          if (row.title && !existing.title?.includes(existing.body.slice(0, 10))) {
            // Keep the explicit title from the first message
          }
        }
      }

      // Sort by last_activity_at descending (most recent activity first)
      return Array.from(grouped.values()).sort(
        (a, b) => new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime()
      );
    },
  });
}
