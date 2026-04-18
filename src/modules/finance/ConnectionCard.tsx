import { open as openExternal } from "@tauri-apps/plugin-shell";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useQboConnection } from "../../hooks/finance";
import { Link2, Link2Off, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "../../lib/cn";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

async function openConnectFlow(supabaseUrl: string) {
  const url = `${supabaseUrl}/functions/v1/qbo-connect`;
  // Tauri's shell.open routes to the user's default browser. window.open()
  // is blocked inside the Tauri webview.
  await openExternal(url);
}

export function ConnectionCard() {
  const workspace = useWorkspaceStore((s) => s.getActiveWorkspace());
  const { data: connection, isLoading } = useQboConnection();

  const supabaseUrl = workspace?.supabaseUrl ?? "";

  if (isLoading) {
    return (
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900">
        <div className="text-sm text-zinc-500">Checking QuickBooks connection…</div>
      </div>
    );
  }

  if (!connection) {
    return (
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-900">
        <div className="flex items-start gap-3">
          <Link2Off size={20} className="text-zinc-400 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              QuickBooks not connected
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              Connect your QuickBooks Online company to start syncing financial data.
            </p>
            <button
              onClick={() => openConnectFlow(supabaseUrl)}
              className="mt-4 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors inline-flex items-center gap-1.5"
            >
              <Link2 size={14} />
              Connect QuickBooks
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isActive = connection.status === "active";

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-900">
      <div className="flex items-start gap-3">
        {isActive ? (
          <CheckCircle2 size={20} className="text-emerald-500 mt-0.5" />
        ) : (
          <AlertTriangle size={20} className="text-amber-500 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
              {connection.company_name ?? `Realm ${connection.realm_id}`}
            </h3>
            <span
              className={cn(
                "text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full",
                connection.environment === "sandbox"
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                  : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
              )}
            >
              {connection.environment}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <dt className="text-zinc-500">Status</dt>
            <dd className={cn("font-medium", isActive ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
              {connection.status}
            </dd>
            <dt className="text-zinc-500">Realm ID</dt>
            <dd className="text-zinc-700 dark:text-zinc-300 font-mono">{connection.realm_id}</dd>
            <dt className="text-zinc-500">Token expires</dt>
            <dd className="text-zinc-700 dark:text-zinc-300">{formatDateTime(connection.expires_at)}</dd>
            <dt className="text-zinc-500">Connected</dt>
            <dd className="text-zinc-700 dark:text-zinc-300">{formatDateTime(connection.created_at)}</dd>
          </dl>
          {connection.last_error && (
            <div className="mt-3 text-xs text-red-600 dark:text-red-400">
              Last error: {connection.last_error}
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => openConnectFlow(supabaseUrl)}
              className="px-2.5 py-1 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded transition-colors"
            >
              Reconnect
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
