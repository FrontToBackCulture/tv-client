// VAL Dependency Graph hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { valSyncKeys } from "./types";

// ============================================================
// Types (mirror Rust DependencyReport structs)
// ============================================================

export interface DependencyEdge {
  id: string;
  resource_type: string;
  name: string;
  reference_type: string;
}

export interface CalcFieldInfo {
  name: string;
  rule_type: string;
  lookup_table: string | null;
  lookup_table_name: string | null;
}

export interface ResourceNode {
  id: string;
  resource_type: string;
  name: string;
  depends_on: DependencyEdge[];
  depended_by: DependencyEdge[];
  calc_field_count?: number;
  calc_fields?: CalcFieldInfo[];
}

export interface DependencyReport {
  computed_at: string;
  domain: string;
  resources: Record<string, ResourceNode>;
  summary: {
    total_resources: number;
    total_edges: number;
    by_type: Record<string, number>;
  };
}

// ============================================================
// Query key
// ============================================================

export const depKeys = {
  report: (domain: string) => [...valSyncKeys.all, "dependencies", domain] as const,
};

// ============================================================
// Hooks
// ============================================================

/** Fetch the pre-computed dependency graph for a domain */
export function useValDependencies(domain: string | null) {
  return useQuery({
    queryKey: depKeys.report(domain ?? ""),
    queryFn: () => invoke<DependencyReport>("val_sync_get_dependencies", { domain }),
    enabled: !!domain,
    staleTime: 5 * 60_000,
  });
}

/** Re-compute dependencies (writes new dependencies.json, then refetch) */
export function useRecomputeDependencies() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (domain: string) => invoke<unknown>("val_compute_dependencies", { domain }),
    onSuccess: (_data, domain) => {
      qc.invalidateQueries({ queryKey: depKeys.report(domain) });
    },
  });
}
