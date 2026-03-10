// src/modules/settings/DiagnosticsView.tsx
// Health check panel — verifies MCP tools, API keys, and connectivity.
// Failed items show inline fix actions (set key, install binary, navigate to settings).

import { useState, useCallback } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Download,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "../../lib/cn";
import { toast } from "../../stores/toastStore";

// ─── Types ──────────────────────────────────────────────────────────────────

type CheckStatus = "pass" | "fail" | "warn" | "running" | "idle";

type FixType =
  | { kind: "navigate"; view: string; label: string }
  | { kind: "set-key"; keyName: string }
  | { kind: "install-claude" };

interface CheckResult {
  id: string;
  label: string;
  group: string;
  status: CheckStatus;
  detail?: string;
  fix?: FixType;
}

interface McpToolInfo {
  name: string;
  description: string;
}

interface McpStatus {
  http_enabled: boolean;
  http_port: number;
  tool_count: number;
}

interface ClaudeMcpStatus {
  binary_installed: boolean;
  binary_path: string;
  config_exists: boolean;
  config_has_tv_mcp: boolean;
  platform: string;
}

interface ApiKeyInfo {
  name: string;
  description: string;
  is_set: boolean;
  masked_value: string | null;
}

// ─── Check definitions ──────────────────────────────────────────────────────

const REQUIRED_KEYS = new Set(["supabase_url", "supabase_anon_key"]);
const RECOMMENDED_KEYS = new Set(["gamma_api_key", "gemini_api_key", "anthropic_api_key", "intercom_api_key"]);

const EXPECTED_TOOL_GROUPS: Record<string, string[]> = {
  "Work Module": ["list-work-projects", "create-work-project", "list-work-tasks", "create-work-task"],
  "CRM": ["list-crm-companies", "list-crm-deals", "list-crm-contacts", "log-crm-activity"],
  "VAL Sync": ["execute-val-sql", "sync-val-status", "sync-val-all"],
  "Workspaces": ["list-workspaces", "create-workspace"],
  "Content Generation": ["gamma-generate", "nanobanana-generate", "generate-proposal", "generate-order-form"],
  "Publishing": ["publish-to-intercom", "list-intercom-collections"],
};

// Map live test failures to their likely root cause
const LIVE_TEST_DEPENDENCIES: Record<string, { keys: string[]; label: string }> = {
  "live-val": { keys: ["supabase_url", "supabase_anon_key"], label: "Supabase credentials" },
  "live-work": { keys: ["supabase_url", "supabase_anon_key"], label: "Supabase credentials" },
};

// ─── Main Component ─────────────────────────────────────────────────────────

interface DiagnosticsViewProps {
  onNavigate?: (view: string) => void;
}

export function DiagnosticsView({ onNavigate }: DiagnosticsViewProps) {
  const [results, setResults] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [hasRun, setHasRun] = useState(false);
  // Track which items have an inline key input open
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [savingKey, setSavingKey] = useState(false);

  const toggleGroup = useCallback((group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  // ── Inline key save ───────────────────────────────────────────────────

  const handleSaveKey = useCallback(async (keyName: string) => {
    if (!keyInput.trim()) return;
    setSavingKey(true);
    try {
      await invoke("settings_set_key", { keyName, value: keyInput.trim() });
      toast.success(`${keyName} saved`);
      setEditingKey(null);
      setKeyInput("");
      // Update the result in-place
      setResults((prev) =>
        prev.map((r) =>
          r.id === `key-${keyName}`
            ? { ...r, status: "pass" as CheckStatus, detail: "Just configured — re-run to verify" }
            : r,
        ),
      );
    } catch (e) {
      toast.error(`Failed to save: ${e}`);
    } finally {
      setSavingKey(false);
    }
  }, [keyInput]);

  // ── Claude install ────────────────────────────────────────────────────

  const [installingClaude, setInstallingClaude] = useState(false);

  const handleInstallClaude = useCallback(async () => {
    setInstallingClaude(true);
    try {
      const status = await invoke<ClaudeMcpStatus>("claude_mcp_install");
      toast.success("Claude Code binary installed");
      setResults((prev) =>
        prev.map((r) => {
          if (r.id === "claude-binary") {
            return { ...r, status: status.binary_installed ? "pass" : "fail", detail: `Installed at ${status.binary_path}` };
          }
          if (r.id === "claude-config") {
            return { ...r, status: status.config_has_tv_mcp ? "pass" : "warn", detail: status.config_has_tv_mcp ? "tv-mcp registered" : "Config not updated" };
          }
          return r;
        }),
      );
    } catch (e) {
      toast.error(`Install failed: ${e}`);
    } finally {
      setInstallingClaude(false);
    }
  }, []);

  // ── Run diagnostics ───────────────────────────────────────────────────

  const runDiagnostics = useCallback(async () => {
    setRunning(true);
    setHasRun(true);
    setEditingKey(null);
    const checks: CheckResult[] = [];

    const add = (r: CheckResult) => {
      checks.push(r);
      setResults([...checks]);
    };

    // 1. MCP Server
    try {
      const status = await invoke<McpStatus>("mcp_get_status");
      add({
        id: "mcp-server",
        label: "MCP Server",
        group: "Infrastructure",
        status: status.http_enabled ? "pass" : "fail",
        detail: status.http_enabled
          ? `Running on port ${status.http_port} with ${status.tool_count} tools`
          : "MCP server not running",
      });
    } catch (e) {
      add({ id: "mcp-server", label: "MCP Server", group: "Infrastructure", status: "fail", detail: `Error: ${e}` });
    }

    // 2. Claude Code Binary
    try {
      const claude = await invoke<ClaudeMcpStatus>("claude_mcp_status");
      add({
        id: "claude-binary",
        label: "Claude Code Binary",
        group: "Infrastructure",
        status: claude.binary_installed ? "pass" : "warn",
        detail: claude.binary_installed
          ? `Installed at ${claude.binary_path}`
          : "Not installed — needed for Claude Code integration",
        fix: claude.binary_installed ? undefined : { kind: "install-claude" },
      });
      add({
        id: "claude-config",
        label: "Claude Code Config",
        group: "Infrastructure",
        status: claude.config_has_tv_mcp ? "pass" : "warn",
        detail: claude.config_has_tv_mcp
          ? "tv-mcp registered in Claude config"
          : "tv-mcp not in Claude config — install binary to auto-configure",
        fix: claude.config_has_tv_mcp ? undefined : { kind: "install-claude" },
      });
    } catch (e) {
      add({
        id: "claude-binary",
        label: "Claude Code Binary",
        group: "Infrastructure",
        status: "warn",
        detail: `Could not check: ${e}`,
        fix: { kind: "navigate", view: "claude", label: "Claude Code" },
      });
    }

    // 3. API Keys
    try {
      const keys = await invoke<ApiKeyInfo[]>("settings_list_keys");
      for (const key of keys) {
        const isRequired = REQUIRED_KEYS.has(key.name);
        const isRecommended = RECOMMENDED_KEYS.has(key.name);

        if (!isRequired && !isRecommended) {
          if (key.is_set) {
            add({ id: `key-${key.name}`, label: key.description || key.name, group: "API Keys", status: "pass", detail: `Configured (${key.masked_value})` });
          }
          continue;
        }

        add({
          id: `key-${key.name}`,
          label: key.description || key.name,
          group: "API Keys",
          status: key.is_set ? "pass" : (isRequired ? "fail" : "warn"),
          detail: key.is_set
            ? `Configured (${key.masked_value})`
            : isRequired ? "Required — not configured" : "Recommended — not configured",
          fix: key.is_set ? undefined : { kind: "set-key", keyName: key.name },
        });
      }
    } catch (e) {
      add({ id: "keys-error", label: "API Keys", group: "API Keys", status: "fail", detail: `Could not load: ${e}`, fix: { kind: "navigate", view: "keys", label: "API Keys" } });
    }

    // 4. Tool Availability
    try {
      const tools = await invoke<McpToolInfo[]>("mcp_list_tools");
      const toolNames = new Set(tools.map((t) => t.name));

      for (const [group, expectedTools] of Object.entries(EXPECTED_TOOL_GROUPS)) {
        for (const toolName of expectedTools) {
          add({
            id: `tool-${toolName}`,
            label: toolName,
            group: `Tools: ${group}`,
            status: toolNames.has(toolName) ? "pass" : "fail",
            detail: toolNames.has(toolName) ? "Available" : "Tool not found — may need app update",
          });
        }
      }
    } catch (e) {
      add({ id: "tools-error", label: "Tool Registry", group: "Tools", status: "fail", detail: `Could not list tools: ${e}` });
    }

    // 5. Live Connectivity Tests
    for (const [testId, toolName, label] of [
      ["live-val", "sync-val-list-domains", "VAL Connection (list domains)"],
      ["live-work", "list-work-projects", "Work Module (list projects)"],
    ] as const) {
      try {
        const result = await invoke<{ content: Array<{ text?: string }>; isError?: boolean }>(
          "mcp_call_tool",
          { name: toolName, arguments: {} },
        );

        if (result.isError) {
          const errorText = result.content?.[0]?.text ?? "Unknown error";
          const dep = LIVE_TEST_DEPENDENCIES[testId];
          // Check if the root cause is a missing key
          const missingKeys = dep?.keys.filter((k) => checks.some((c) => c.id === `key-${k}` && c.status !== "pass"));
          add({
            id: testId,
            label,
            group: "Live Tests",
            status: "fail",
            detail: missingKeys && missingKeys.length > 0
              ? `Failed — likely due to missing ${dep.label}`
              : `Error: ${errorText}`,
            fix: missingKeys && missingKeys.length > 0
              ? { kind: "set-key", keyName: missingKeys[0] }
              : undefined,
          });
        } else {
          let detail = "Connected";
          if (testId === "live-val") {
            try {
              const count = JSON.parse(result.content[0].text!).length;
              detail = `Connected — ${count} domains found`;
            } catch { /* keep generic */ }
          }
          add({ id: testId, label, group: "Live Tests", status: "pass", detail });
        }
      } catch (e) {
        const dep = LIVE_TEST_DEPENDENCIES[testId];
        const missingKeys = dep?.keys.filter((k) => checks.some((c) => c.id === `key-${k}` && c.status !== "pass"));
        add({
          id: testId,
          label,
          group: "Live Tests",
          status: "fail",
          detail: missingKeys && missingKeys.length > 0
            ? `Failed — likely due to missing ${dep.label}`
            : `${e}`,
          fix: missingKeys && missingKeys.length > 0
            ? { kind: "set-key", keyName: missingKeys[0] }
            : { kind: "navigate", view: "keys", label: "API Keys" },
        });
      }
    }

    setRunning(false);
  }, []);

  // ── Group + render ────────────────────────────────────────────────────

  const groups = results.reduce<Record<string, CheckResult[]>>((acc, r) => {
    (acc[r.group] ??= []).push(r);
    return acc;
  }, {});

  const groupOrder = [
    "Infrastructure",
    "API Keys",
    ...Object.keys(EXPECTED_TOOL_GROUPS).map((g) => `Tools: ${g}`),
    "Live Tests",
  ];

  const passCount = results.filter((r) => r.status === "pass").length;
  const failCount = results.filter((r) => r.status === "fail").length;
  const warnCount = results.filter((r) => r.status === "warn").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Diagnostics</h2>
          <p className="text-xs text-zinc-400 mt-0.5">Verify MCP tools, API keys, and connectivity</p>
        </div>
        <button
          onClick={runDiagnostics}
          disabled={running}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
            running
              ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
              : "bg-teal-600 text-white hover:bg-teal-500",
          )}
        >
          {running ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {running ? "Running..." : hasRun ? "Re-run" : "Run Diagnostics"}
        </button>
      </div>

      {/* Summary */}
      {hasRun && !running && (
        <div className="flex items-center gap-4 mb-4 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 size={12} /> {passCount} passed
          </span>
          {failCount > 0 && (
            <span className="flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
              <XCircle size={12} /> {failCount} failed
            </span>
          )}
          {warnCount > 0 && (
            <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
              <AlertTriangle size={12} /> {warnCount} warnings
            </span>
          )}
        </div>
      )}

      {/* Results */}
      {!hasRun ? (
        <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
          <RefreshCw size={28} className="mb-3 text-zinc-300 dark:text-zinc-600" />
          <p className="text-sm">Click "Run Diagnostics" to check your setup</p>
        </div>
      ) : (
        <div className="space-y-2">
          {groupOrder.map((groupName) => {
            const items = groups[groupName];
            if (!items) return null;

            const groupFails = items.filter((r) => r.status === "fail").length;
            const groupWarns = items.filter((r) => r.status === "warn").length;
            const allPass = groupFails === 0 && groupWarns === 0;
            const isExpanded = expandedGroups.has(groupName) || groupFails > 0 || running;

            return (
              <div key={groupName} className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                <button
                  onClick={() => toggleGroup(groupName)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span className="flex-1 text-left">{groupName}</span>
                  <span className="flex items-center gap-2">
                    {items.some((r) => r.status === "running") && <Loader2 size={11} className="animate-spin text-zinc-400" />}
                    {allPass && !running && <span className="text-emerald-500"><CheckCircle2 size={12} /></span>}
                    {groupFails > 0 && <span className="text-red-500 text-[10px]">{groupFails} failed</span>}
                    {groupWarns > 0 && <span className="text-amber-500 text-[10px]">{groupWarns} warn</span>}
                    <span className="text-zinc-400 text-[10px]">{items.length}</span>
                  </span>
                </button>

                {isExpanded && (
                  <div className="border-t border-zinc-100 dark:border-zinc-800">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="px-3 py-1.5 text-xs border-b last:border-b-0 border-zinc-50 dark:border-zinc-800/50"
                      >
                        <div className="flex items-start gap-2">
                          <StatusIcon status={item.status} />
                          <div className="flex-1 min-w-0">
                            <span className="text-zinc-700 dark:text-zinc-300">{item.label}</span>
                            {item.detail && (
                              <p className="text-[10px] text-zinc-400 mt-0.5" title={item.detail}>
                                {item.detail}
                              </p>
                            )}
                          </div>

                          {/* Fix actions for failed/warned items */}
                          {item.fix && item.status !== "pass" && (
                            <div className="flex-shrink-0">
                              {item.fix.kind === "navigate" && onNavigate && (
                                <button
                                  onClick={() => onNavigate(item.fix!.kind === "navigate" ? (item.fix as { kind: "navigate"; view: string; label: string }).view : "")}
                                  className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded transition-colors"
                                >
                                  {(item.fix as { kind: "navigate"; view: string; label: string }).label}
                                  <ArrowRight size={10} />
                                </button>
                              )}
                              {item.fix.kind === "set-key" && (
                                <button
                                  onClick={() => {
                                    setEditingKey(item.id);
                                    setKeyInput("");
                                  }}
                                  className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded transition-colors"
                                >
                                  Set key
                                </button>
                              )}
                              {item.fix.kind === "install-claude" && (
                                <button
                                  onClick={handleInstallClaude}
                                  disabled={installingClaude}
                                  className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded transition-colors disabled:opacity-50"
                                >
                                  {installingClaude ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />}
                                  {installingClaude ? "Installing..." : "Install"}
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Inline key input */}
                        {editingKey === item.id && item.fix?.kind === "set-key" && (
                          <div className="mt-2 ml-5 flex items-center gap-1.5">
                            <input
                              type="text"
                              value={keyInput}
                              onChange={(e) => setKeyInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveKey((item.fix as { kind: "set-key"; keyName: string }).keyName);
                                if (e.key === "Escape") { setEditingKey(null); setKeyInput(""); }
                              }}
                              placeholder={`Paste ${item.label} value...`}
                              autoFocus
                              className="flex-1 px-2 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
                            />
                            <button
                              onClick={() => handleSaveKey((item.fix as { kind: "set-key"; keyName: string }).keyName)}
                              disabled={savingKey || !keyInput.trim()}
                              className="px-2 py-1 text-[10px] font-medium rounded bg-teal-600 text-white hover:bg-teal-500 transition-colors disabled:opacity-50"
                            >
                              {savingKey ? <Loader2 size={10} className="animate-spin" /> : "Save"}
                            </button>
                            <button
                              onClick={() => { setEditingKey(null); setKeyInput(""); }}
                              className="px-2 py-1 text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Status Icon ────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: CheckStatus }) {
  switch (status) {
    case "pass":
      return <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0 mt-0.5" />;
    case "fail":
      return <XCircle size={13} className="text-red-500 flex-shrink-0 mt-0.5" />;
    case "warn":
      return <AlertTriangle size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />;
    case "running":
      return <Loader2 size={13} className="text-zinc-400 animate-spin flex-shrink-0 mt-0.5" />;
    default:
      return <div className="w-[13px] h-[13px] rounded-full bg-zinc-200 dark:bg-zinc-700 flex-shrink-0 mt-0.5" />;
  }
}
