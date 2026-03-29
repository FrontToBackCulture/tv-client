// React Query hooks for GA4 Analytics (OAuth + Data API)
// All data comes from Rust backend via Tauri IPC

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// Types (match Rust types)
// ============================================================================

export interface Ga4AuthStatus {
  isAuthenticated: boolean;
  userEmail: string | null;
  expiresAt: number | null;
}

export interface Ga4ConfigStatus {
  configured: boolean;
  propertyId: string | null;
  websitePropertyId: string | null;
  isAuthenticated: boolean;
}

export interface AnalyticsSyncResult {
  source: string;
  rowsUpserted: number;
  warnings: string[];
}

// ============================================================================
// Query keys
// ============================================================================

export const ga4Keys = {
  all: ["ga4"] as const,
  auth: () => ["ga4", "auth"] as const,
  config: () => ["ga4", "config"] as const,
};

// ============================================================================
// Auth hooks
// ============================================================================

export function useGA4Auth() {
  return useQuery({
    queryKey: ga4Keys.auth(),
    queryFn: () => invoke<Ga4AuthStatus>("ga4_auth_check"),
    staleTime: 1000 * 60 * 5, // 5 min
  });
}

export function useGA4Login() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      clientId,
      clientSecret,
    }: {
      clientId: string;
      clientSecret: string;
    }) =>
      invoke<Ga4AuthStatus>("ga4_auth_start", {
        clientId,
        clientSecret,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ga4Keys.auth() });
      queryClient.invalidateQueries({ queryKey: ga4Keys.config() });
    },
  });
}

export function useGA4Logout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => invoke<void>("ga4_auth_logout"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ga4Keys.all });
    },
  });
}

// ============================================================================
// Config hooks
// ============================================================================

export function useGA4Config() {
  return useQuery({
    queryKey: ga4Keys.config(),
    queryFn: () => invoke<Ga4ConfigStatus>("ga4_check_config"),
    staleTime: 1000 * 60 * 5,
  });
}
