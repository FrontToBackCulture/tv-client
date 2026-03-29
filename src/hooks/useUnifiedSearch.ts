// src/hooks/useUnifiedSearch.ts
// Global search across CRM, Work, and Email entities via Supabase RPC

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

export type SearchEntityType =
  | "company"
  | "contact"
  | "deal"
  | "project"
  | "task"
  | "initiative"
  | "campaign";

export interface SearchResult {
  entity_type: SearchEntityType;
  entity_id: string;
  title: string;
  subtitle: string;
  rank: number;
}

export interface SearchResultGroup {
  type: SearchEntityType;
  label: string;
  results: SearchResult[];
}

const TYPE_LABELS: Record<SearchEntityType, string> = {
  company: "Companies",
  contact: "Contacts",
  deal: "Deals",
  project: "Projects",
  task: "Tasks",
  initiative: "Initiatives",
  campaign: "Campaigns",
};

// Display order — most commonly searched first
const TYPE_ORDER: SearchEntityType[] = [
  "company",
  "contact",
  "deal",
  "project",
  "task",
  "initiative",
  "campaign",
];

function groupResults(results: SearchResult[]): SearchResultGroup[] {
  const grouped = new Map<SearchEntityType, SearchResult[]>();
  for (const r of results) {
    const list = grouped.get(r.entity_type) ?? [];
    list.push(r);
    grouped.set(r.entity_type, list);
  }
  return TYPE_ORDER.filter((t) => grouped.has(t)).map((t) => ({
    type: t,
    label: TYPE_LABELS[t],
    results: grouped.get(t)!,
  }));
}

export function useUnifiedSearch(
  query: string,
  options?: {
    entityTypes?: SearchEntityType[];
    limit?: number;
    enabled?: boolean;
  }
) {
  const { entityTypes, limit = 20, enabled = true } = options ?? {};

  return useQuery({
    queryKey: ["unified-search", query, entityTypes, limit],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("search_all", {
        query,
        result_limit: limit,
        entity_types: entityTypes ?? null,
      });
      if (error) throw error;
      return groupResults((data as SearchResult[]) ?? []);
    },
    enabled: enabled && query.trim().length >= 2,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}
