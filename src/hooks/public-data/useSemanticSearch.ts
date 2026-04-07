import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { publicDataKeys } from "./keys";
import type { McfJobPosting, JobFilters } from "../../lib/public-data/types";

export interface SemanticSearchResult extends McfJobPosting {
  similarity: number;
}

export function useEmbeddingCoverage() {
  return useQuery({
    queryKey: [...publicDataKeys.all, "embedding-coverage"],
    queryFn: async () => {
      const { count: embedded, error: e1 } = await supabase
        .schema("public_data")
        .from("mcf_job_embeddings")
        .select("*", { count: "exact", head: true });
      const { count: total, error: e2 } = await supabase
        .schema("public_data")
        .from("mcf_job_postings")
        .select("*", { count: "exact", head: true });
      if (e1 || e2) return null;
      return { embedded: embedded ?? 0, total: total ?? 0 };
    },
    staleTime: 300_000, // refresh every 5 min
  });
}

export function useSemanticSearch(
  query: string,
  filters: JobFilters,
  enabled: boolean
) {
  return useQuery({
    queryKey: [...publicDataKeys.mcfJobs(filters), "semantic", query],
    queryFn: async (): Promise<SemanticSearchResult[]> => {
      // Use supabase.functions.invoke which handles auth + URL automatically
      const { data, error } = await supabase.functions.invoke("search-jobs", {
        body: {
          query,
          match_count: 50,
          match_threshold: 0.25,
          industry_tag: filters.industry_tag?.length
            ? filters.industry_tag
            : undefined,
          role_category: filters.role_category?.length
            ? filters.role_category
            : undefined,
        },
      });

      if (error) {
        console.error("[SemanticSearch] Edge function error:", error);
        throw new Error(`Semantic search failed: ${error.message}`);
      }

      console.log("[SemanticSearch] Results:", data?.count, "matches for:", query);
      return (data?.results ?? []) as SemanticSearchResult[];
    },
    enabled: enabled && query.length > 2,
    staleTime: 60_000,
  });
}
