// src/hooks/apollo/useApollo.ts
// React Query hooks for Apollo.io prospect search, enrichment, and import

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// Types (mirrors Rust types — Basic plan returns minimal/obfuscated data)
// ============================================================================

export interface ApolloSearchFilters {
  person_titles?: string[];
  person_locations?: string[];
  person_seniorities?: string[];
  organization_locations?: string[];
  organization_ids?: string[];
  organization_num_employees_ranges?: string[];
  q_organization_name?: string;
  q_keywords?: string;
  page?: number;
  per_page?: number;
}

export interface ApolloOrganization {
  id?: string;
  name?: string;
  website_url?: string;
  linkedin_url?: string;
  primary_domain?: string;
  industry?: string;
  estimated_num_employees?: number;
  annual_revenue?: number;
  city?: string;
  state?: string;
  country?: string;
  // Basic plan boolean indicators
  has_industry?: boolean;
  has_phone?: boolean;
  has_city?: boolean;
  has_state?: boolean;
  has_country?: boolean;
  has_employee_count?: boolean;
  has_revenue?: boolean;
}

export interface ApolloPhone {
  raw_number?: string;
  sanitized_number?: string;
  type?: string;
}

export interface ApolloPerson {
  id: string;
  first_name?: string;
  last_name?: string;
  last_name_obfuscated?: string;
  name?: string;
  title?: string;
  headline?: string;
  linkedin_url?: string;
  email?: string;
  city?: string;
  state?: string;
  country?: string;
  seniority?: string;
  departments?: string[];
  phone_numbers?: ApolloPhone[];
  organization_id?: string;
  organization?: ApolloOrganization;
  // Basic plan boolean indicators
  has_email?: boolean;
  has_city?: boolean;
  has_state?: boolean;
  has_country?: boolean;
  last_refreshed_at?: string;
}

export interface ApolloSearchResponse {
  people: ApolloPerson[];
  total_entries: number;
}

export interface ApolloImportResult {
  companies_created: number;
  companies_existing: number;
  contacts_created: number;
  contacts_existing: number;
  enriched: number;
  enrich_failed: number;
  errors: string[];
}

// ============================================================================
// Query keys
// ============================================================================

export const apolloKeys = {
  all: ["apollo"] as const,
  search: (filters: ApolloSearchFilters) => [...apolloKeys.all, "search", filters] as const,
};

// ============================================================================
// Hooks
// ============================================================================

/** Search Apollo for people. Only runs when filters are provided and non-empty. */
export function useApolloSearch(filters: ApolloSearchFilters | null) {
  return useQuery({
    queryKey: apolloKeys.search(filters ?? {}),
    queryFn: async (): Promise<ApolloSearchResponse> => {
      return await invoke("apollo_search_people", { filters: filters! });
    },
    enabled: filters !== null && Object.values(filters).some((v) => v !== undefined && v !== null && v !== ""),
    staleTime: 5 * 60 * 1000, // 5 min — Apollo data doesn't change fast
  });
}

export interface ApolloExistingMatch {
  apollo_id: string;
  company_id: string;
  contact_name: string;
}

/** Check which Apollo people already exist in CRM (by source_id or name+company match). */
export function useApolloCheckExisting(people: ApolloPerson[]) {
  const checkPayload = useMemo(
    () =>
      people.map((p) => ({
        id: p.id,
        first_name: p.first_name ?? undefined,
        organization_name: p.organization?.name ?? undefined,
      })),
    [people]
  );

  return useQuery({
    queryKey: [...apolloKeys.all, "existing", checkPayload],
    queryFn: async (): Promise<ApolloExistingMatch[]> => {
      return await invoke("apollo_check_existing", { people: checkPayload });
    },
    enabled: checkPayload.length > 0,
    staleTime: 30 * 1000,
  });
}

/** Enrich a person by Apollo ID. Returns full contact details. */
export function useApolloEnrich() {
  return useMutation({
    mutationFn: async (personId: string) => {
      return await invoke("apollo_enrich_person", { personId });
    },
  });
}

/** Import selected Apollo prospects into CRM. */
export function useApolloImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      people,
      tags,
    }: {
      people: ApolloPerson[];
      tags?: string[];
    }): Promise<ApolloImportResult> => {
      return await invoke("apollo_import_prospects", {
        request: { people, tags },
      });
    },
    onSuccess: () => {
      // Invalidate CRM queries so new prospects show up
      queryClient.invalidateQueries({ queryKey: ["crm"] });
      // Invalidate existing check so CRM indicators update
      queryClient.invalidateQueries({ queryKey: ["apollo", "existing"] });
    },
  });
}
