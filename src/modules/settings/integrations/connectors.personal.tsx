// src/modules/settings/integrations/connectors.personal.tsx
//
// Personal-workspace-only connector registry. Anything added here appears in
// the Integrations hub ONLY when the active workspace is one of the personal
// workspaces listed in `PERSONAL_WORKSPACE_SLUGS` below. Other workspaces
// (ThinkVAL, client workspaces, etc.) never see these entries at all.
//
// Credential segregation is enforced at two levels:
//   1. UI — personal connectors are not merged into the registry outside the
//      matching workspace, so there's no way to open or configure them.
//   2. Settings namespace — personal connectors store credentials under a
//      workspace-slug-prefixed key (e.g. `melly_ibkr_flex_token`), so even
//      the underlying settings file has zero key-name collisions with shared
//      connectors.
//
// Adding a new personal connector: append to PERSONAL_CONNECTORS below and,
// if it needs new settings keys, add them to BOTH `API_KEYS` in useSettings.ts
// AND the Rust `KEY_*` constants + `settings_list_keys` in settings.rs. The
// Rust side is the source of truth for which keys are shown in the editor.

import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../../../components/ui";
import { formatError } from "../../../lib/formatError";
import { ApiKeyDetail } from "./KeyEditor";
import { API_KEYS } from "../../../hooks/useSettings";
import type { Connector, ConnectorIcon, ConnectorStatus } from "./connectors";
import { useSettings } from "../../../hooks/useSettings";
import { useWorkspaceStore } from "../../../stores/workspaceStore";
import ibkrMark from "./icons/ibkr.svg";
import fmpMark from "./icons/fmp.png";

/** Mirror of the private `makeImageIcon` helper in connectors.tsx — kept
 *  here so personal connectors don't depend on private internals. Same
 *  shape: wraps a raster/svg asset URL into a ConnectorIcon component. */
function makeImageIcon(src: string, alt: string): ConnectorIcon {
  return function ImageIcon({ size = 22, className }) {
    return (
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        className={className}
        style={{ objectFit: "contain" }}
      />
    );
  };
}

/** Workspace slugs that are allowed to see personal connectors. Right now only
 *  Melvin's personal workspace qualifies; extend as more personal workspaces
 *  are added. */
export const PERSONAL_WORKSPACE_SLUGS: ReadonlySet<string> = new Set(["melly"]);

/** Check whether a given workspace (identified by slug) should receive the
 *  personal connector list. Null-safe — unknown workspace → false. */
export function workspaceHasPersonalConnectors(slug: string | null | undefined): boolean {
  return slug != null && PERSONAL_WORKSPACE_SLUGS.has(slug);
}

// ---------------------------------------------------------------------------
// Shared status hook — mirrors the `useApiKeyStatus` pattern in connectors.tsx
// but lives here so personal connectors don't need to import private helpers.
// ---------------------------------------------------------------------------

function useIbkrStatus(): ConnectorStatus {
  const { keys, loading } = useSettings();
  if (loading) return { state: "loading" };
  const requiredKeys = [
    API_KEYS.IBKR_FLEX_TOKEN,
    API_KEYS.IBKR_FLEX_QUERY_POSITIONS,
    API_KEYS.IBKR_FLEX_QUERY_TRADES,
    API_KEYS.IBKR_FLEX_QUERY_CASH,
  ];
  const present = requiredKeys.filter(
    (name) => keys.find((k) => k.name === name)?.is_set,
  );
  if (present.length === requiredKeys.length) {
    return { state: "connected" };
  }
  if (present.length === 0) return { state: "disconnected" };
  return {
    state: "error",
    label: `Missing ${requiredKeys.length - present.length} of ${requiredKeys.length} credentials`,
  };
}

// ---------------------------------------------------------------------------
// IBKR detail view — reuses the standard `ApiKeyDetail` for the four fields
// (token + 3 query IDs) and adds a "Sync Now" action beneath them.
// ---------------------------------------------------------------------------

interface IbkrSyncSummary {
  positions_written: number;
  trades_written: number;
  cash_tx_written: number;
  nav_rows_written: number;
  errors: string[];
  finished_at: string;
}

function IbkrDetail() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<IbkrSyncSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Pass the current window's workspace ID so the Rust sync scopes its
  // Supabase client to this workspace via `WORKSPACE_OVERRIDE`. Without
  // this, a second window switching workspaces could redirect the sync
  // to the wrong Supabase project.
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  const handleSync = async () => {
    setSyncing(true);
    setResult(null);
    setError(null);
    try {
      const summary = await invoke<IbkrSyncSummary>("ibkr_sync_now", {
        workspaceId,
      });
      setResult(summary);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <ApiKeyDetail
      title="Interactive Brokers (Flex Web Service)"
      description="Pulls portfolio positions, trades, and cash activity from IBKR into this workspace's Supabase. Configure the Flex Web Service token and the three Query IDs, then click Sync Now."
      keyNames={[
        API_KEYS.IBKR_FLEX_TOKEN,
        API_KEYS.IBKR_FLEX_QUERY_POSITIONS,
        API_KEYS.IBKR_FLEX_QUERY_TRADES,
        API_KEYS.IBKR_FLEX_QUERY_CASH,
      ]}
    >
      <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Manual sync</div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Fetch all three Flex queries and write into <code>ibkr_*</code> tables.
            </p>
          </div>
          <Button onClick={handleSync} loading={syncing} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync Now"}
          </Button>
        </div>

        {error && (
          <div className="p-3 rounded-lg text-sm border bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {result && (
          <div className="p-3 rounded-lg text-sm border bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 space-y-1">
            <div>
              <strong>Sync complete.</strong>{" "}
              {result.positions_written} positions, {result.trades_written} trades,{" "}
              {result.cash_tx_written} cash transactions, {result.nav_rows_written} NAV rows
              written.
            </div>
            {result.errors.length > 0 && (
              <div className="text-amber-700 dark:text-amber-400">
                Warnings: {result.errors.join("; ")}
              </div>
            )}
          </div>
        )}
      </div>
    </ApiKeyDetail>
  );
}

// ---------------------------------------------------------------------------
// Financial Modeling Prep (FMP) — fundamentals, ratios, market data,
// reference lists. Single API key, four sync actions.
// ---------------------------------------------------------------------------

function useFmpStatus(): ConnectorStatus {
  const { keys, loading } = useSettings();
  if (loading) return { state: "loading" };
  const isSet = keys.find((k) => k.name === API_KEYS.FMP_API_KEY)?.is_set ?? false;
  return isSet ? { state: "connected" } : { state: "disconnected" };
}

interface FmpSyncSummary {
  endpoints_written: number;
  errors: string[];
  finished_at: string;
}

type FmpSyncKind = "holdings" | "market" | "reference" | "ticker";

function FmpDetail() {
  const [busy, setBusy] = useState<FmpSyncKind | null>(null);
  const [result, setResult] = useState<{ kind: FmpSyncKind; summary: FmpSyncSummary } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tickerInput, setTickerInput] = useState("");
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  const runSync = async (kind: FmpSyncKind) => {
    setBusy(kind);
    setResult(null);
    setError(null);
    try {
      let summary: FmpSyncSummary;
      if (kind === "ticker") {
        const symbol = tickerInput.trim().toUpperCase();
        if (!symbol) {
          setError("Enter a symbol first");
          setBusy(null);
          return;
        }
        summary = await invoke<FmpSyncSummary>("fmp_sync_ticker", {
          symbol,
          exchange: null,
          workspaceId,
        });
      } else if (kind === "holdings") {
        summary = await invoke<FmpSyncSummary>("fmp_sync_holdings", { workspaceId });
      } else if (kind === "market") {
        summary = await invoke<FmpSyncSummary>("fmp_sync_market", { workspaceId });
      } else {
        summary = await invoke<FmpSyncSummary>("fmp_sync_reference", { workspaceId });
      }
      setResult({ kind, summary });
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ApiKeyDetail
      title="Financial Modeling Prep"
      description="Fundamentals, ratios, analyst estimates, insider trades, and market data via FMP /stable/ API. Powers the Research cache (fmp_cache table)."
      keyNames={[API_KEYS.FMP_API_KEY]}
    >
      <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-4">
        {/* Holdings sync — most common action */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Sync all holdings
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Fetches 36 endpoints per unique symbol in <code>ibkr_positions</code>. Rate-limited to 240 req/min.
            </p>
          </div>
          <Button
            onClick={() => runSync("holdings")}
            loading={busy === "holdings"}
            disabled={busy !== null}
          >
            {busy === "holdings" ? "Syncing…" : "Sync Holdings"}
          </Button>
        </div>

        {/* Market sync */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Sync market data
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              14 endpoints: sector/industry PE + performance, treasury rates, economic indicators, news, gainers/losers.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => runSync("market")}
            loading={busy === "market"}
            disabled={busy !== null}
          >
            {busy === "market" ? "Syncing…" : "Sync Market"}
          </Button>
        </div>

        {/* Reference sync */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Sync reference data
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              5 endpoints: available exchanges, sectors, industries, countries, stock list. Changes infrequently.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => runSync("reference")}
            loading={busy === "reference"}
            disabled={busy !== null}
          >
            {busy === "reference" ? "Syncing…" : "Sync Reference"}
          </Button>
        </div>

        {/* Single ticker sync — for ad-hoc research on a new symbol */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Sync one ticker
          </div>
          <p className="text-xs text-zinc-500">
            Fetch all fundamentals for a specific symbol that may not be in your holdings yet.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value)}
              placeholder="e.g. AAPL"
              className="flex-1 px-3 py-1.5 text-sm border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-mono uppercase"
              disabled={busy !== null}
            />
            <Button
              variant="secondary"
              onClick={() => runSync("ticker")}
              loading={busy === "ticker"}
              disabled={busy !== null || !tickerInput.trim()}
            >
              {busy === "ticker" ? "Syncing…" : "Sync Ticker"}
            </Button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg text-sm border bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {result && (
          <div className="p-3 rounded-lg text-sm border bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 space-y-1">
            <div>
              <strong>{result.kind} sync complete.</strong>{" "}
              {result.summary.endpoints_written} endpoints written.
            </div>
            {result.summary.errors.length > 0 && (
              <details className="text-amber-700 dark:text-amber-400 text-xs">
                <summary className="cursor-pointer">
                  {result.summary.errors.length} warning{result.summary.errors.length === 1 ? "" : "s"}
                </summary>
                <ul className="mt-1 pl-4 list-disc space-y-0.5">
                  {result.summary.errors.slice(0, 20).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                  {result.summary.errors.length > 20 && (
                    <li>… and {result.summary.errors.length - 20} more</li>
                  )}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </ApiKeyDetail>
  );
}

// ---------------------------------------------------------------------------
// Registry — append new personal connectors below.
// ---------------------------------------------------------------------------

/** IDs unique to personal connectors. Extends the shared ConnectorId union at
 *  runtime but we keep them typed as strings so connectors.tsx doesn't have to
 *  learn about every personal-workspace connector. Cast to Connector's id
 *  field via `as any` where needed. */
const PersonalIbkr: Connector = {
  // Cast because ConnectorId is a closed union defined in connectors.tsx and
  // we don't want to couple that file to personal-workspace additions.
  id: "ibkr" as unknown as Connector["id"],
  name: "Interactive Brokers",
  description: "Portfolio positions, trades, and cash activity via Flex Web Service",
  category: "Analytics",
  icon: makeImageIcon(ibkrMark, "Interactive Brokers"),
  useStatus: useIbkrStatus,
  DetailView: IbkrDetail,
};

const PersonalFmp: Connector = {
  id: "fmp" as unknown as Connector["id"],
  name: "Financial Modeling Prep",
  description: "Fundamentals, ratios, analyst data, and market metrics",
  category: "Analytics",
  icon: makeImageIcon(fmpMark, "Financial Modeling Prep"),
  useStatus: useFmpStatus,
  DetailView: FmpDetail,
};

export const PERSONAL_CONNECTORS: readonly Connector[] = [PersonalIbkr, PersonalFmp];
