// Search companies, tasks, and projects for entity mention autocomplete

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { chatKeys } from "./keys";

export interface EntitySearchResult {
  type: "company" | "task" | "project";
  id: string;
  label: string;
}

/** Debounced search across companies, tasks, and projects */
export function useEntityMentionSearch(query: string) {
  return useQuery({
    queryKey: chatKeys.entitySearch(query),
    queryFn: async (): Promise<EntitySearchResult[]> => {
      const q = `%${query}%`;

      const [companies, tasks, projects] = await Promise.all([
        supabase
          .from("crm_companies")
          .select("id, name")
          .ilike("name", q)
          .limit(5),
        supabase
          .from("tasks")
          .select("id, title")
          .ilike("title", q)
          .limit(5),
        supabase
          .from("projects")
          .select("id, name")
          .ilike("name", q)
          .limit(5),
      ]);

      const results: EntitySearchResult[] = [];

      for (const c of companies.data ?? []) {
        results.push({ type: "company", id: c.id, label: c.name });
      }
      for (const t of tasks.data ?? []) {
        results.push({ type: "task", id: t.id, label: t.title });
      }
      for (const p of projects.data ?? []) {
        results.push({ type: "project", id: p.id, label: p.name });
      }

      return results;
    },
    enabled: query.length >= 2,
    staleTime: 10000,
  });
}
