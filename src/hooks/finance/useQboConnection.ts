import { useQuery } from "@tanstack/react-query";
import { getSupabaseClient } from "../../lib/supabase";
import { financeKeys } from "./keys";
import type { QboConnection } from "../../lib/finance/types";

/**
 * Fetches the active QBO connection for the current workspace. Returns null
 * if no connection exists (user hasn't connected QuickBooks yet).
 *
 * Access tokens live in a service-role-only table, so this query only reads
 * metadata: realm_id, company_name, status, timestamps.
 */
export function useQboConnection() {
  return useQuery({
    queryKey: financeKeys.connection(),
    queryFn: async (): Promise<QboConnection | null> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("qbo_connection_info")
        .select("id, realm_id, company_name, expires_at, environment, status, last_error, created_at, updated_at")
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`Failed to fetch QBO connection: ${error.message}`);
      return data;
    },
    refetchInterval: 30_000,
  });
}
