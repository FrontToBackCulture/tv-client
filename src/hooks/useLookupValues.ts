// Hook to fetch lookup values from the database
// Replaces hardcoded DEAL_STAGES, DEAL_SOLUTIONS, COMPANY_STAGES, etc.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

export interface LookupValue {
  id: string;
  type: string;
  value: string;
  label: string;
  color: string | null;
  icon: string | null;
  weight: number | null;
  sort_order: number;
  metadata: Record<string, any> | null;
  created_at: string | null;
  updated_at: string | null;
}

const LOOKUP_KEY = ["lookup-values"];

export function useLookupValues(type?: string) {
  return useQuery({
    queryKey: type ? [...LOOKUP_KEY, type] : LOOKUP_KEY,
    queryFn: async (): Promise<LookupValue[]> => {
      let query = supabase.from("lookup_values").select("*").order("sort_order");
      if (type) query = query.eq("type", type);
      const { data, error } = await query;
      if (error) throw new Error(`Failed to fetch lookup values: ${error.message}`);
      return data ?? [];
    },
  });
}

// Convenience hooks for specific types
export function useDealStages() { return useLookupValues("deal_stage"); }
export function useDealSolutions() { return useLookupValues("deal_solution"); }
export function useCompanyStages() { return useLookupValues("company_stage"); }
export function useActivityTypes() { return useLookupValues("activity_type"); }
export function useProjectStatuses() { return useLookupValues("project_status"); }
export function useProjectHealthValues() { return useLookupValues("project_health"); }

// All lookup values (for Metadata grid)
export function useAllLookupValues() { return useLookupValues(); }

// Helper to convert lookup values to options array for selects/dropdowns
export function toOptions(values: LookupValue[]): { value: string; label: string }[] {
  return values.map(v => ({ value: v.value, label: v.label }));
}

// Helper to convert to the legacy constant format
export function toLegacyFormat(values: LookupValue[]) {
  return values.map(v => ({
    value: v.value as any,
    label: v.label,
    color: v.color || "gray",
    icon: v.icon || "folder",
    weight: v.weight || 0,
  }));
}

// Mutation for updating a lookup value
export function useUpdateLookupValue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<LookupValue> }) => {
      const { error } = await supabase.from("lookup_values").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: LOOKUP_KEY }); },
  });
}
