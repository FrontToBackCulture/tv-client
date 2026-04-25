// Module-level toolbar with data-sync buttons. Lives in the Investment
// module header so the user doesn't have to jump to Settings → Integrations
// to refresh prices/fundamentals.
//
// Two actions, matching the personal connector card's semantics:
//   - Sync IBKR (positions + trades + dividends + cash)
//   - Sync FMP holdings (profile + prices + ratios + fundamentals for every
//     held symbol)
//
// Both invoke Tauri commands that use the active workspace's Supabase client.
// React Query caches get invalidated on success so pages refresh in place.

import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCcw, Loader2 } from "lucide-react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { investmentKeys } from "../../hooks/investment/keys";
import { formatError } from "../../lib/formatError";

interface FmpSyncSummary {
  endpoints_written: number;
  errors: string[];
  finished_at: string;
}

interface IbkrSyncSummary {
  positions_written: number;
  trades_written: number;
  cash_tx_written: number;
  nav_rows_written: number;
  errors: string[];
  finished_at: string;
}

type SyncKind = "ibkr" | "fmp" | null;

export function InvestmentToolbar() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<SyncKind>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const runIbkr = async () => {
    setBusy("ibkr");
    setMessage(null);
    try {
      const summary = await invoke<IbkrSyncSummary>("ibkr_sync_now", { workspaceId });
      await queryClient.invalidateQueries({ queryKey: investmentKeys.all });
      setMessage({
        kind: summary.errors.length > 0 ? "err" : "ok",
        text: `IBKR: ${summary.positions_written} positions, ${summary.trades_written} trades, ${summary.cash_tx_written} cash${
          summary.errors.length ? ` · ${summary.errors.length} warnings` : ""
        }`,
      });
    } catch (e) {
      setMessage({ kind: "err", text: `IBKR sync failed: ${formatError(e)}` });
    } finally {
      setBusy(null);
    }
  };

  const runFmp = async () => {
    setBusy("fmp");
    setMessage(null);
    try {
      const summary = await invoke<FmpSyncSummary>("fmp_sync_holdings", { workspaceId });
      await queryClient.invalidateQueries({ queryKey: investmentKeys.all });
      setMessage({
        kind: summary.errors.length > 0 ? "err" : "ok",
        text: `FMP: ${summary.endpoints_written} endpoints written${
          summary.errors.length ? ` · ${summary.errors.length} warnings` : ""
        }`,
      });
    } catch (e) {
      setMessage({ kind: "err", text: `FMP sync failed: ${formatError(e)}` });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center gap-2 px-6 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
      <SyncButton
        label="Sync IBKR"
        onClick={runIbkr}
        busy={busy === "ibkr"}
        disabled={busy !== null}
      />
      <SyncButton
        label="Sync FMP"
        onClick={runFmp}
        busy={busy === "fmp"}
        disabled={busy !== null}
      />
      {message && (
        <span
          className={`ml-2 text-xs ${
            message.kind === "ok"
              ? "text-green-600 dark:text-green-400"
              : "text-amber-600 dark:text-amber-400"
          }`}
        >
          {message.text}
        </span>
      )}
    </div>
  );
}

function SyncButton({
  label,
  onClick,
  busy,
  disabled,
}: {
  label: string;
  onClick: () => void;
  busy: boolean;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {busy ? (
        <Loader2 size={12} className="animate-spin" />
      ) : (
        <RefreshCcw size={12} />
      )}
      {label}
    </button>
  );
}
