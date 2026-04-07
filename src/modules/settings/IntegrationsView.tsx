// src/modules/settings/IntegrationsView.tsx
//
// Unified Integrations hub — one place to see every external service the app
// talks to. Each row is a connector card with a status pill and a primary
// action; clicking opens that connector's detail panel inline.
//
// The registry lives in ./integrations/connectors.tsx — this file is pure UI.
// Import/Export buttons let users back up and share their full settings
// vault (all keys plus OAuth tokens), so a new teammate can drop in a JSON
// file and inherit the sender's entire connection state.

import { useState, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  Upload,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { Button } from "../../components/ui";
import { formatError } from "../../lib/formatError";
import { useSettings } from "../../hooks/useSettings";
import {
  CONNECTORS,
  INTEGRATION_IDS,
  type Connector,
  type ConnectorId,
  type ConnectorCategory,
  type ConnectorStatus,
} from "./integrations/connectors";
import {
  PERSONAL_CONNECTORS,
  workspaceHasPersonalConnectors,
} from "./integrations/connectors.personal";
import { useWorkspaceStore } from "../../stores/workspaceStore";

export { INTEGRATION_IDS, type ConnectorId };

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function StatusLabel({ status }: { status: ConnectorStatus }) {
  if (status.state === "loading") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
        <Loader2 size={12} className="animate-spin" />
        Checking…
      </span>
    );
  }
  if (status.state === "connected") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
        <CheckCircle2 size={12} />
        Connected
      </span>
    );
  }
  if (status.state === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
        <AlertCircle size={12} />
        Needs attention
      </span>
    );
  }
  return null; // disconnected → "Connect" button replaces the label
}

function ConnectorCard({ connector, onOpen }: { connector: Connector; onOpen: () => void }) {
  const status = connector.useStatus();
  const Icon = connector.icon;
  const isDisconnected = status.state === "disconnected";

  return (
    <div
      className={cn(
        "group flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors",
        "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900",
        "hover:border-zinc-300 dark:hover:border-zinc-700",
      )}
    >
      {/* Icon tile — white background so brand colors pop even in dark mode.
          `text-zinc-700` gives Lucide fallback icons (Outlook, AWS, Gamma, etc.)
          a visible stroke on the white tile. Brand icons pass their own
          `color` prop which overrides currentColor. */}
      <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-lg bg-white dark:bg-zinc-100 border border-zinc-200 dark:border-zinc-300 text-zinc-700">
        <Icon size={22} color={connector.iconColor} />
      </div>

      {/* Name + description / meta line */}
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-w-0 text-left"
      >
        <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
          {connector.name}
        </div>
        <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
          {status.label ?? connector.description}
        </div>
      </button>

      {/* Right side — status + action */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {isDisconnected ? (
          <Button variant="secondary" onClick={onOpen}>
            Connect
          </Button>
        ) : (
          <>
            <StatusLabel status={status} />
            <button
              type="button"
              onClick={onOpen}
              aria-label={`Configure ${connector.name}`}
              className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <MoreHorizontal size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Import / Export — preserves the ability to share a full settings snapshot.
// Backed by the Rust-side settings_export_to_file / settings_import_from_file
// commands that the old ApiKeysView used.
// ---------------------------------------------------------------------------

function useImportExport() {
  const { refresh } = useSettings();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleExport = useCallback(async () => {
    try {
      const filePath = await save({
        title: "Export settings",
        defaultPath: "tv-desktop-settings.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!filePath) return;
      setBusy(true);
      setMsg(null);
      const count = await invoke<number>("settings_export_to_file", { filePath });
      setMsg({
        type: "success",
        text: `Exported ${count} key${count !== 1 ? "s" : ""} to ${filePath}`,
      });
    } catch (e) {
      setMsg({ type: "error", text: formatError(e) });
    } finally {
      setBusy(false);
    }
  }, []);

  const handleImport = useCallback(async () => {
    try {
      const filePath = await open({
        title: "Import settings",
        filters: [
          { name: "Settings", extensions: ["json", "env"] },
          { name: "All Files", extensions: ["*"] },
        ],
        multiple: false,
      });
      if (!filePath) return;
      setBusy(true);
      setMsg(null);
      const imported = await invoke<string[]>("settings_import_from_file", {
        filePath: filePath as string,
      });
      await refresh();
      setMsg({
        type: "success",
        text: `Imported ${imported.length} key${imported.length !== 1 ? "s" : ""}`,
      });
    } catch (e) {
      setMsg({ type: "error", text: formatError(e) });
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  return { busy, msg, handleExport, handleImport };
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

interface IntegrationsViewProps {
  /** Optional initial connector to open directly (used for deep-links). */
  initialConnectorId?: ConnectorId | null;
  /** Called when the user returns to the grid — lets the parent clear any
   *  deep-link hint so subsequent visits start on the grid, not the detail. */
  onBackToList?: () => void;
}

export function IntegrationsView({ initialConnectorId = null, onBackToList }: IntegrationsViewProps) {
  const [selectedId, setSelectedId] = useState<ConnectorId | null>(initialConnectorId);
  const { busy, msg, handleExport, handleImport } = useImportExport();

  // Merge in personal-workspace-only connectors when the active workspace
  // qualifies. Workspace switching triggers a full app reload, so this value
  // is stable for the lifetime of the component — no reactive re-merge needed.
  const activeWorkspace = useWorkspaceStore((s) => s.getActiveWorkspace());
  const visibleConnectors = useMemo<readonly Connector[]>(() => {
    if (workspaceHasPersonalConnectors(activeWorkspace?.slug)) {
      return [...CONNECTORS, ...PERSONAL_CONNECTORS];
    }
    return CONNECTORS;
  }, [activeWorkspace?.slug]);

  useEffect(() => {
    if (initialConnectorId) setSelectedId(initialConnectorId);
  }, [initialConnectorId]);

  const backToList = () => {
    setSelectedId(null);
    onBackToList?.();
  };

  const selected = useMemo(
    () => (selectedId ? visibleConnectors.find((c) => c.id === selectedId) ?? null : null),
    [selectedId, visibleConnectors],
  );

  const grouped = useMemo(() => {
    const byCategory = new Map<ConnectorCategory, Connector[]>();
    for (const c of visibleConnectors) {
      const list = byCategory.get(c.category) ?? [];
      list.push(c);
      byCategory.set(c.category, list);
    }
    return Array.from(byCategory.entries());
  }, [visibleConnectors]);

  if (selected) {
    const Detail = selected.DetailView;
    return (
      <div>
        <button
          onClick={backToList}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 mb-4 transition-colors"
        >
          <ChevronLeft size={14} />
          All integrations
        </button>
        <Detail />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Integrations</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Every external service the workspace talks to. Click a row to connect or reconfigure.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="secondary"
            icon={Upload}
            onClick={handleImport}
            disabled={busy}
            loading={busy}
            title="Import settings from JSON or .env"
          >
            Import
          </Button>
          <Button
            variant="secondary"
            icon={Download}
            onClick={handleExport}
            disabled={busy}
            loading={busy}
            title="Export settings to JSON"
          >
            Export
          </Button>
        </div>
      </div>

      {msg && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm border ${
            msg.type === "success"
              ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400"
              : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="space-y-6">
        {grouped.map(([category, connectors]) => (
          <div key={category}>
            <div className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">
              {category}
            </div>
            <div className="space-y-2">
              {connectors.map((connector) => (
                <ConnectorCard
                  key={connector.id}
                  connector={connector}
                  onOpen={() => setSelectedId(connector.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
