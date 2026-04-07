// Hook: list distinct account IDs that have data in this workspace.
//
// There's no dedicated ibkr_accounts table — accounts are implicit in every
// data table (positions/trades/cash/nav) via the account_id column. We fetch
// from ibkr_positions since it's guaranteed to have the authoritative set:
// every account IBKR is currently reporting on has positions (or will on the
// next sync).
//
// supabase-js doesn't support SELECT DISTINCT, so we fetch a bounded slice
// and dedupe client-side. For personal retail accounts (handful of sub-
// accounts at most) this is effectively free.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { investmentKeys } from "./keys";

export function useAccounts() {
  return useQuery({
    queryKey: [...investmentKeys.all, "accounts"] as const,
    queryFn: async (): Promise<string[]> => {
      // Latest positions snapshot covers every currently-active account
      // without scanning the full history. Fallback to nav_history if
      // positions is empty (initial state before first sync).
      const { data: positionsRows, error: posErr } = await supabase
        .from("ibkr_positions")
        .select("account_id")
        .limit(2000);

      if (posErr) throw new Error(`Failed to load accounts: ${posErr.message}`);

      let accountIds = new Set<string>((positionsRows ?? []).map((r) => r.account_id));

      if (accountIds.size === 0) {
        const { data: navRows, error: navErr } = await supabase
          .from("ibkr_nav_history")
          .select("account_id")
          .limit(2000);
        if (navErr) throw new Error(`Failed to load accounts: ${navErr.message}`);
        accountIds = new Set<string>((navRows ?? []).map((r) => r.account_id));
      }

      return Array.from(accountIds).sort();
    },
  });
}
