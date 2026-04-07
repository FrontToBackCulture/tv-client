// src/modules/domains/ErrorsGridView.tsx
// AG Grid views for val_importer_errors and val_integration_errors
// Split view: grid on left, detail pane on right
// Follows ReviewGrid conventions (theme, pagination, sideBar, statusBar)

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-theme-alpine.css";
import { AllCommunityModule, ModuleRegistry, type ColDef, type ValueFormatterParams, type RowClickedEvent } from "ag-grid-community";
import { AllEnterpriseModule } from "ag-grid-enterprise";
import {
  useValImporterErrors,
  useValIntegrationErrors,
  useValWorkflowExecutions,
  useValNotifications,
  useValWorkflowDefinitions,
  type ValImporterError,
  type ValIntegrationError,
  type ValWorkflowExecution,
  type ValNotification,
} from "../../hooks/val-sync/useValErrors";
import { useAppStore } from "../../stores/appStore";
import { Loader2, AlertTriangle, X, FileWarning, Plug, Play, Bell } from "lucide-react";
import { cn } from "../../lib/cn";

ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule]);

// ─── Helpers ──────────────────────────────────

function formatSGT(params: ValueFormatterParams): string {
  if (!params.value) return "-";
  const date = new Date(params.value);
  return (
    date.toLocaleDateString("en-SG", { timeZone: "Asia/Singapore" }) +
    " " +
    date.toLocaleTimeString("en-SG", {
      timeZone: "Asia/Singapore",
      hour: "2-digit",
      minute: "2-digit",
    })
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── Column Defs ──────────────────────────────

const IMPORTER_COLUMNS: ColDef<ValImporterError>[] = [
  {
    field: "domain",
    headerName: "Domain",
    width: 120,
    pinned: "left",
    filter: "agSetColumnFilter",
    enableRowGroup: true,
  },
  {
    field: "importer_name",
    headerName: "Importer",
    width: 260,
    filter: "agTextColumnFilter",
    enableRowGroup: true,
  },
  {
    field: "file_name",
    headerName: "File",
    flex: 1,
    minWidth: 200,
    filter: "agTextColumnFilter",
  },
  {
    field: "error_detail",
    headerName: "Error",
    flex: 1,
    minWidth: 200,
    filter: "agTextColumnFilter",
  },
  {
    field: "received_at",
    headerName: "Time (SGT)",
    width: 160,
    filter: "agDateColumnFilter",
    sort: "desc",
    valueFormatter: formatSGT,
  },
];

const INTEGRATION_COLUMNS: ColDef<ValIntegrationError>[] = [
  {
    field: "domain",
    headerName: "Domain",
    width: 120,
    pinned: "left",
    filter: "agSetColumnFilter",
    enableRowGroup: true,
  },
  {
    field: "connector",
    headerName: "Connector",
    width: 160,
    filter: "agSetColumnFilter",
    enableRowGroup: true,
  },
  {
    field: "action",
    headerName: "Action",
    width: 120,
    filter: "agSetColumnFilter",
  },
  {
    field: "target_table",
    headerName: "Table",
    width: 200,
    filter: "agTextColumnFilter",
  },
  {
    field: "error_summary",
    headerName: "Error",
    flex: 1,
    minWidth: 250,
    filter: "agTextColumnFilter",
  },
  {
    field: "received_at",
    headerName: "Time (SGT)",
    width: 160,
    filter: "agDateColumnFilter",
    sort: "desc",
    valueFormatter: formatSGT,
  },
];

// ─── AG Grid shared config ────────────────────

const SIDE_BAR = {
  toolPanels: [
    { id: "columns", labelDefault: "Columns", labelKey: "columns", iconKey: "columns", toolPanel: "agColumnsToolPanel" },
    { id: "filters", labelDefault: "Filters", labelKey: "filters", iconKey: "filter", toolPanel: "agFiltersToolPanel" },
  ],
  defaultToolPanel: "",
};

const STATUS_BAR = {
  statusPanels: [
    { statusPanel: "agTotalAndFilteredRowCountComponent", align: "left" as const },
    { statusPanel: "agSelectedRowCountComponent", align: "left" as const },
    { statusPanel: "agAggregationComponent", align: "right" as const },
  ],
};

// ─── Detail Panes ─────────────────────────────

function ImporterDetailPane({
  row,
  onClose,
}: {
  row: ValImporterError;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2 min-w-0">
          <FileWarning className="w-4 h-4 text-yellow-500 shrink-0" />
          <span className="font-medium text-sm truncate">{row.importer_name}</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
        <div>
          <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Domain</div>
          <div className="font-medium">{row.domain}</div>
        </div>
        <div>
          <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Importer</div>
          <div>{row.importer_name}</div>
        </div>
        {row.file_name && (
          <div>
            <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">File</div>
            <div className="font-mono text-xs break-all bg-zinc-50 dark:bg-zinc-900 p-2 rounded">{row.file_name}</div>
          </div>
        )}
        {row.error_summary && (
          <div>
            <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Summary</div>
            <div>{row.error_summary}</div>
          </div>
        )}
        {row.error_detail && (
          <div>
            <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Error Detail</div>
            <div className="font-mono text-xs break-all bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 p-2 rounded">
              {row.error_detail}
            </div>
          </div>
        )}
        <div>
          <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Received</div>
          <div>
            {new Date(row.received_at).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}
            <span className="text-zinc-400 ml-2">({timeAgo(row.received_at)})</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function IntegrationDetailPane({
  row,
  onClose,
}: {
  row: ValIntegrationError;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2 min-w-0">
          <Plug className="w-4 h-4 text-red-500 shrink-0" />
          <span className="font-medium text-sm truncate">{row.connector} — {row.action || "error"}</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
        <div>
          <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Domain</div>
          <div className="font-medium">{row.domain}</div>
        </div>
        <div>
          <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Connector</div>
          <div>{row.connector}</div>
        </div>
        {row.action && (
          <div>
            <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Action</div>
            <div>{row.action}</div>
          </div>
        )}
        {row.target_table && (
          <div>
            <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Target Table</div>
            <div className="font-mono text-xs">{row.target_table}</div>
          </div>
        )}
        {row.error_summary && (
          <div>
            <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Error</div>
            <div className="font-mono text-xs break-all bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 p-2 rounded">
              {row.error_summary}
            </div>
          </div>
        )}
        {row.triggered_by && (
          <div>
            <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Triggered By</div>
            <div>{row.triggered_by}</div>
          </div>
        )}
        <div>
          <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Received</div>
          <div>
            {new Date(row.received_at).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}
            <span className="text-zinc-400 ml-2">({timeAgo(row.received_at)})</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Grid Views ───────────────────────────────

const PANEL_WIDTH_KEY = "tv-desktop-health-errors-panel-width";

function getStoredPanelWidth(): number {
  if (typeof window === "undefined") return 380;
  const stored = localStorage.getItem(PANEL_WIDTH_KEY);
  return stored ? parseInt(stored, 10) : 380;
}

export function ImporterErrorsGrid({ since }: { since?: string }) {
  const appTheme = useAppStore((s) => s.theme);
  const { data, isLoading, error } = useValImporterErrors(since);
  const [selected, setSelected] = useState<ValImporterError | null>(null);
  const [panelWidth, setPanelWidth] = useState(getStoredPanelWidth);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(380);

  const onRowClicked = useCallback((e: RowClickedEvent<ValImporterError>) => {
    setSelected(e.data ?? null);
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = panelWidth;
  }, [panelWidth]);

  useEffect(() => {
    if (!isResizing) return;
    const onMouseMove = (e: MouseEvent) => {
      const delta = startXRef.current - e.clientX;
      const newWidth = Math.max(280, Math.min(700, startWidthRef.current + delta));
      setPanelWidth(newWidth);
    };
    const onMouseUp = () => {
      setIsResizing(false);
      localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth));
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [isResizing, panelWidth]);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    suppressHeaderMenuButton: false,
  }), []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading importer errors...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-400">
        <AlertTriangle className="w-5 h-5 mr-2" /> Failed to load: {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div
        className={`${appTheme === "dark" ? "ag-theme-alpine-dark" : "ag-theme-alpine"} flex-1 min-w-0`}
        style={{ width: "100%", height: "100%" }}
      >
        <AgGridReact<ValImporterError>
          theme="legacy"
          rowData={data || []}
          columnDefs={IMPORTER_COLUMNS}
          defaultColDef={defaultColDef}
          rowSelection="single"
          onRowClicked={onRowClicked}
          animateRows={false}
          enableCellTextSelection
          enableBrowserTooltips
          headerHeight={32}
          rowHeight={32}
          getRowId={(params) => params.data.id}
          sideBar={SIDE_BAR}
          statusBar={STATUS_BAR}
          pagination
          paginationPageSize={100}
          paginationPageSizeSelector={[50, 100, 200, 500]}
        />
      </div>

      {selected && (
        <>
          <div
            className={cn(
              "w-1 cursor-col-resize hover:bg-blue-400 transition-colors shrink-0",
              isResizing ? "bg-blue-400" : "bg-zinc-200 dark:bg-zinc-800",
            )}
            onMouseDown={onMouseDown}
          />
          <div
            className="shrink-0 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden"
            style={{ width: panelWidth }}
          >
            <ImporterDetailPane row={selected} onClose={() => setSelected(null)} />
          </div>
        </>
      )}
    </div>
  );
}

export function IntegrationErrorsGrid({ since }: { since?: string }) {
  const appTheme = useAppStore((s) => s.theme);
  const { data, isLoading, error } = useValIntegrationErrors(since);
  const [selected, setSelected] = useState<ValIntegrationError | null>(null);
  const [panelWidth, setPanelWidth] = useState(getStoredPanelWidth);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(380);

  const onRowClicked = useCallback((e: RowClickedEvent<ValIntegrationError>) => {
    setSelected(e.data ?? null);
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = panelWidth;
  }, [panelWidth]);

  useEffect(() => {
    if (!isResizing) return;
    const onMouseMove = (e: MouseEvent) => {
      const delta = startXRef.current - e.clientX;
      const newWidth = Math.max(280, Math.min(700, startWidthRef.current + delta));
      setPanelWidth(newWidth);
    };
    const onMouseUp = () => {
      setIsResizing(false);
      localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth));
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [isResizing, panelWidth]);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    suppressHeaderMenuButton: false,
  }), []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading integration errors...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-400">
        <AlertTriangle className="w-5 h-5 mr-2" /> Failed to load: {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div
        className={`${appTheme === "dark" ? "ag-theme-alpine-dark" : "ag-theme-alpine"} flex-1 min-w-0`}
        style={{ width: "100%", height: "100%" }}
      >
        <AgGridReact<ValIntegrationError>
          theme="legacy"
          rowData={data || []}
          columnDefs={INTEGRATION_COLUMNS}
          defaultColDef={defaultColDef}
          rowSelection="single"
          onRowClicked={onRowClicked}
          animateRows={false}
          enableCellTextSelection
          enableBrowserTooltips
          headerHeight={32}
          rowHeight={32}
          getRowId={(params) => params.data.id}
          sideBar={SIDE_BAR}
          statusBar={STATUS_BAR}
          pagination
          paginationPageSize={100}
          paginationPageSizeSelector={[50, 100, 200, 500]}
        />
      </div>

      {selected && (
        <>
          <div
            className={cn(
              "w-1 cursor-col-resize hover:bg-blue-400 transition-colors shrink-0",
              isResizing ? "bg-blue-400" : "bg-zinc-200 dark:bg-zinc-800",
            )}
            onMouseDown={onMouseDown}
          />
          <div
            className="shrink-0 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden"
            style={{ width: panelWidth }}
          >
            <IntegrationDetailPane row={selected} onClose={() => setSelected(null)} />
          </div>
        </>
      )}
    </div>
  );
}

// ─── Workflow Executions ──────────────────────

// Status colors for cell styling
const STATUS_COLORS: Record<string, string> = {
  completed: "#22c55e",
  failed: "#ef4444",
  active: "#3b82f6",
  waiting: "#eab308",
};

// Build execution columns — needs nameMap for workflow name resolution
function buildExecutionColumns(nameMap: Map<string, string>): ColDef<ValWorkflowExecution>[] {
  return [
    {
      field: "domain",
      headerName: "Domain",
      width: 120,
      pinned: "left",
      filter: "agSetColumnFilter",
      enableRowGroup: true,
    },
    {
      field: "job_id",
      headerName: "Job ID",
      width: 90,
      filter: "agNumberColumnFilter",
    },
    {
      headerName: "Workflow",
      width: 280,
      filter: "agTextColumnFilter",
      valueGetter: (params) => {
        const d = params.data;
        if (!d) return "";
        return nameMap.get(`${d.domain}:${d.job_id}`) || `Job #${d.job_id}`;
      },
    },
    {
      field: "status",
      headerName: "Status",
      width: 110,
      filter: "agSetColumnFilter",
      enableRowGroup: true,
      cellStyle: (params) => {
        const color = STATUS_COLORS[params.value] || "#64748b";
        return { color, fontWeight: 600 };
      },
    },
    {
      field: "error",
      headerName: "Error",
      flex: 1,
      minWidth: 250,
      filter: "agTextColumnFilter",
    },
    {
      field: "user_id",
      headerName: "User",
      width: 80,
      filter: "agSetColumnFilter",
    },
    {
      field: "started_at",
      headerName: "Started (SGT)",
      width: 160,
      filter: "agDateColumnFilter",
      sort: "desc",
      valueFormatter: formatSGT,
    },
    {
      field: "completed_at",
      headerName: "Completed (SGT)",
      width: 160,
      filter: "agDateColumnFilter",
      valueFormatter: formatSGT,
    },
  ];
}

function ExecutionDetailPane({
  row,
  workflowName,
  onClose,
}: {
  row: ValWorkflowExecution;
  workflowName: string | null;
  onClose: () => void;
}) {
  const durationMs = row.completed_at && row.started_at
    ? new Date(row.completed_at).getTime() - new Date(row.started_at).getTime()
    : null;
  const durationStr = durationMs != null
    ? durationMs < 60000 ? `${Math.round(durationMs / 1000)}s` : `${Math.round(durationMs / 60000)}m`
    : null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2 min-w-0">
          <Play className="w-4 h-4 text-blue-500 shrink-0" />
          <span className="font-medium text-sm truncate">{workflowName || `Job #${row.job_id}`} — {row.status}</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
        <div>
          <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Domain</div>
          <div className="font-medium">{row.domain}</div>
        </div>
        {workflowName && (
          <div>
            <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Workflow</div>
            <div className="font-medium">{workflowName}</div>
          </div>
        )}
        <div>
          <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Execution ID</div>
          <div className="font-mono text-xs break-all">{row.execution_id}</div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Job ID</div>
            <div>{row.job_id}</div>
          </div>
          <div>
            <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">User ID</div>
            <div>{row.user_id ?? "-"}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Status</div>
            <div className={row.status === "failed" ? "text-red-500 font-medium" : row.status === "completed" ? "text-green-500 font-medium" : ""}>{row.status}</div>
          </div>
          {durationStr && (
            <div>
              <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Duration</div>
              <div>{durationStr}</div>
            </div>
          )}
        </div>
        {row.error && (
          <div>
            <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Error</div>
            <div className="font-mono text-xs break-all bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 p-2 rounded">
              {row.error}
            </div>
          </div>
        )}
        <div>
          <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Started</div>
          <div>
            {new Date(row.started_at).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}
            <span className="text-zinc-400 ml-2">({timeAgo(row.started_at)})</span>
          </div>
        </div>
        {row.completed_at && (
          <div>
            <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Completed</div>
            <div>{new Date(row.completed_at).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}</div>
          </div>
        )}
        {!!row.result && (
          <div>
            <div className="text-zinc-500 text-xs uppercase tracking-wide mb-2">Execution Log</div>
            <div className="bg-zinc-900 dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 max-h-72 overflow-y-auto">
              <table className="w-full text-xs font-mono">
                <tbody>
                  {(() => {
                    const entries = Array.isArray(row.result) ? row.result : [];
                    if (entries.length === 0) return <tr><td className="p-3 text-zinc-500">No log entries</td></tr>;
                    return entries.map((entry: string, i: number) => {
                      const parts = typeof entry === "string" ? entry.split("|") : [];
                      if (parts.length >= 4) {
                        const time = parts[0].split("T")[1]?.replace("Z", "").slice(0, 8) || parts[0];
                        const plugin = parts[1];
                        const status = parts[2];
                        const msg = parts.slice(3).join("|");
                        const statusBg = status === "completed" ? "bg-green-500/20 text-green-400"
                          : status === "started" ? "bg-blue-500/20 text-blue-400"
                          : "bg-zinc-500/20 text-zinc-400";
                        return (
                          <tr key={i} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30">
                            <td className="pl-3 pr-2 py-1.5 text-zinc-500 whitespace-nowrap align-top">{time}</td>
                            <td className="px-2 py-1.5 text-teal-400 whitespace-nowrap align-top">{plugin}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap align-top">
                              <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold leading-tight", statusBg)}>
                                {status}
                              </span>
                            </td>
                            <td className="px-2 pr-3 py-1.5 text-zinc-300 break-all">{msg}</td>
                          </tr>
                        );
                      }
                      return <tr key={i}><td colSpan={4} className="px-3 py-1.5 text-zinc-400 break-all">{String(entry)}</td></tr>;
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function WorkflowExecutionsGrid({ since }: { since?: string }) {
  const appTheme = useAppStore((s) => s.theme);
  const { data, isLoading, error } = useValWorkflowExecutions(since);
  const { data: wfDefs } = useValWorkflowDefinitions();

  // Build name lookup: "domain:job_id" → workflow name
  const nameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (wfDefs) {
      for (const wf of wfDefs) {
        map.set(`${wf.domain}:${wf.id}`, wf.name);
      }
    }
    return map;
  }, [wfDefs]);

  const executionColumns = useMemo(() => buildExecutionColumns(nameMap), [nameMap]);
  const [selected, setSelected] = useState<ValWorkflowExecution | null>(null);
  const [panelWidth, setPanelWidth] = useState(getStoredPanelWidth);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(380);

  const onRowClicked = useCallback((e: RowClickedEvent<ValWorkflowExecution>) => {
    setSelected(e.data ?? null);
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = panelWidth;
  }, [panelWidth]);

  useEffect(() => {
    if (!isResizing) return;
    const onMouseMove = (e: MouseEvent) => {
      const delta = startXRef.current - e.clientX;
      setPanelWidth(Math.max(280, Math.min(700, startWidthRef.current + delta)));
    };
    const onMouseUp = () => {
      setIsResizing(false);
      localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth));
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => { document.removeEventListener("mousemove", onMouseMove); document.removeEventListener("mouseup", onMouseUp); };
  }, [isResizing, panelWidth]);

  const defaultColDef = useMemo<ColDef>(() => ({ sortable: true, resizable: true, suppressHeaderMenuButton: false }), []);

  if (isLoading) return <div className="flex items-center justify-center h-full text-zinc-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading executions...</div>;
  if (error) return <div className="flex items-center justify-center h-full text-red-400"><AlertTriangle className="w-5 h-5 mr-2" /> Failed to load: {(error as Error).message}</div>;

  return (
    <div className="flex h-full">
      <div className={`${appTheme === "dark" ? "ag-theme-alpine-dark" : "ag-theme-alpine"} flex-1 min-w-0`} style={{ width: "100%", height: "100%" }}>
        <AgGridReact<ValWorkflowExecution>
          theme="legacy"
          rowData={data || []}
          columnDefs={executionColumns}
          defaultColDef={defaultColDef}
          rowSelection="single"
          onRowClicked={onRowClicked}
          animateRows={false}
          enableCellTextSelection
          enableBrowserTooltips
          headerHeight={32}
          rowHeight={32}
          getRowId={(params) => `${params.data.domain}:${params.data.execution_id}`}
          sideBar={SIDE_BAR}
          statusBar={STATUS_BAR}
          pagination
          paginationPageSize={100}
          paginationPageSizeSelector={[50, 100, 200, 500]}
        />
      </div>
      {selected && (
        <>
          <div className={cn("w-1 cursor-col-resize hover:bg-blue-400 transition-colors shrink-0", isResizing ? "bg-blue-400" : "bg-zinc-200 dark:bg-zinc-800")} onMouseDown={onMouseDown} />
          <div className="shrink-0 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden" style={{ width: panelWidth }}>
            <ExecutionDetailPane row={selected} workflowName={nameMap.get(`${selected.domain}:${selected.job_id}`) || null} onClose={() => setSelected(null)} />
          </div>
        </>
      )}
    </div>
  );
}

// ─── Notifications ────────────────────────────

const NOTIFICATION_COLUMNS: ColDef<ValNotification>[] = [
  {
    field: "domain",
    headerName: "Domain",
    width: 120,
    pinned: "left",
    filter: "agSetColumnFilter",
    enableRowGroup: true,
  },
  {
    field: "fail",
    headerName: "Fail",
    width: 70,
    filter: "agSetColumnFilter",
    cellStyle: ((params: { value: unknown }) => {
      if (params.value) return { color: "#ef4444", fontWeight: 600 };
      return {};
    }) as never,
    valueFormatter: (params) => params.value ? "FAIL" : "",
  },
  {
    field: "table",
    headerName: "Table",
    width: 180,
    filter: "agTextColumnFilter",
    enableRowGroup: true,
  },
  {
    field: "message",
    headerName: "Message",
    flex: 1,
    minWidth: 300,
    filter: "agTextColumnFilter",
  },
  {
    field: "user_name",
    headerName: "User",
    width: 120,
    filter: "agSetColumnFilter",
  },
  {
    field: "action",
    headerName: "Action",
    width: 100,
    filter: "agSetColumnFilter",
  },
  {
    field: "created",
    headerName: "Created (SGT)",
    width: 160,
    filter: "agDateColumnFilter",
    sort: "desc",
    valueFormatter: formatSGT,
  },
];

function NotificationDetailPane({
  row,
  onClose,
}: {
  row: ValNotification;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2 min-w-0">
          <Bell className={cn("w-4 h-4 shrink-0", row.fail ? "text-red-500" : "text-zinc-400")} />
          <span className="font-medium text-sm truncate">{row.table || row.action || "Notification"}</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
        <div>
          <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Domain</div>
          <div className="font-medium">{row.domain}</div>
        </div>
        {row.message && (
          <div>
            <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Message</div>
            <div className={cn("font-mono text-xs break-all p-2 rounded", row.fail ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300" : "bg-zinc-50 dark:bg-zinc-900")}>
              {row.message}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          {row.table && (
            <div>
              <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Table</div>
              <div>{row.table}</div>
            </div>
          )}
          {row.action && (
            <div>
              <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Action</div>
              <div>{row.action}</div>
            </div>
          )}
        </div>
        {row.origin && (
          <div>
            <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Origin</div>
            <div className="font-mono text-xs break-all">{row.origin}</div>
          </div>
        )}
        {row.error_message && (
          <div>
            <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Error</div>
            <div className="font-mono text-xs break-all bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 p-2 rounded">
              {row.error_message}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          {row.user_name && (
            <div>
              <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">User</div>
              <div>{row.user_name}</div>
            </div>
          )}
          {row.status && (
            <div>
              <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Status</div>
              <div>{row.status}</div>
            </div>
          )}
        </div>
        {row.created && (
          <div>
            <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Created</div>
            <div>
              {new Date(row.created).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}
              <span className="text-zinc-400 ml-2">({timeAgo(row.created)})</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function NotificationsGrid({ since }: { since?: string }) {
  const appTheme = useAppStore((s) => s.theme);
  const { data, isLoading, error } = useValNotifications(since);
  const [selected, setSelected] = useState<ValNotification | null>(null);
  const [panelWidth, setPanelWidth] = useState(getStoredPanelWidth);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(380);

  const onRowClicked = useCallback((e: RowClickedEvent<ValNotification>) => {
    setSelected(e.data ?? null);
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = panelWidth;
  }, [panelWidth]);

  useEffect(() => {
    if (!isResizing) return;
    const onMouseMove = (e: MouseEvent) => {
      const delta = startXRef.current - e.clientX;
      setPanelWidth(Math.max(280, Math.min(700, startWidthRef.current + delta)));
    };
    const onMouseUp = () => {
      setIsResizing(false);
      localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth));
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => { document.removeEventListener("mousemove", onMouseMove); document.removeEventListener("mouseup", onMouseUp); };
  }, [isResizing, panelWidth]);

  const defaultColDef = useMemo<ColDef>(() => ({ sortable: true, resizable: true, suppressHeaderMenuButton: false }), []);

  if (isLoading) return <div className="flex items-center justify-center h-full text-zinc-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading notifications...</div>;
  if (error) return <div className="flex items-center justify-center h-full text-red-400"><AlertTriangle className="w-5 h-5 mr-2" /> Failed to load: {(error as Error).message}</div>;

  return (
    <div className="flex h-full">
      <div className={`${appTheme === "dark" ? "ag-theme-alpine-dark" : "ag-theme-alpine"} flex-1 min-w-0`} style={{ width: "100%", height: "100%" }}>
        <AgGridReact<ValNotification>
          theme="legacy"
          rowData={data || []}
          columnDefs={NOTIFICATION_COLUMNS}
          defaultColDef={defaultColDef}
          rowSelection="single"
          onRowClicked={onRowClicked}
          animateRows={false}
          enableCellTextSelection
          enableBrowserTooltips
          headerHeight={32}
          rowHeight={32}
          getRowId={(params) => `${params.data.domain}:${params.data.uuid}`}
          sideBar={SIDE_BAR}
          statusBar={STATUS_BAR}
          pagination
          paginationPageSize={100}
          paginationPageSizeSelector={[50, 100, 200, 500]}
        />
      </div>
      {selected && (
        <>
          <div className={cn("w-1 cursor-col-resize hover:bg-blue-400 transition-colors shrink-0", isResizing ? "bg-blue-400" : "bg-zinc-200 dark:bg-zinc-800")} onMouseDown={onMouseDown} />
          <div className="shrink-0 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden" style={{ width: panelWidth }}>
            <NotificationDetailPane row={selected} onClose={() => setSelected(null)} />
          </div>
        </>
      )}
    </div>
  );
}
