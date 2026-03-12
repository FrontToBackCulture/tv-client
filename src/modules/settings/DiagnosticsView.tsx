// src/modules/settings/DiagnosticsView.tsx
// Comprehensive health check panel — verifies all system features and provides
// inline fix actions with clear guidance on what to do.

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
  Upload,
  Info,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { cn } from "../../lib/cn";
import { toast } from "../../stores/toastStore";

// ─── Types ──────────────────────────────────────────────────────────────────

type CheckStatus = "pass" | "fail" | "warn" | "running" | "idle" | "skip";

type FixType =
  | { kind: "navigate"; view: string; label: string }
  | { kind: "set-key"; keyName: string }
  | { kind: "install-claude" }
  | { kind: "info"; message: string };

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

interface ClaudeCliStatus {
  installed: boolean;
  version: string | null;
  path: string | null;
}

interface ApiKeyInfo {
  name: string;
  description: string;
  is_set: boolean;
  masked_value: string | null;
}

interface OutlookAuthStatus {
  is_authenticated: boolean;
  user_email: string | null;
  expires_at: number | null;
}

interface SchedulerStatus {
  total_jobs: number;
  enabled_jobs: number;
  running_jobs: number;
  last_check_at: string | null;
}

// ─── Check definitions ──────────────────────────────────────────────────────

const REQUIRED_KEYS = new Set(["supabase_url", "supabase_anon_key"]);

// Map key names to the features they unlock and how to get them
const KEY_FEATURE_MAP: Record<string, { features: string; howToGet: string; required?: boolean }> = {
  supabase_url: { features: "Database connectivity (Work, CRM, VAL)", howToGet: "Get from Supabase project settings → API", required: true },
  supabase_anon_key: { features: "Database connectivity (Work, CRM, VAL)", howToGet: "Get from Supabase project settings → API → anon/public key", required: true },
  anthropic_api_key: { features: "AI features (Prompt Builder validation, SQL generation, help chat)", howToGet: "Get from console.anthropic.com → API Keys" },
  gamma_api_key: { features: "Presentation generation (Gamma slides)", howToGet: "Get from gamma.app → API settings" },
  gemini_api_key: { features: "Image description, Nanobanana prompts", howToGet: "Get from aistudio.google.com → API Keys" },
  intercom_api_key: { features: "Help center publishing", howToGet: "Get from Intercom → Settings → Developers → Access Token" },
  aws_access_key_id: { features: "S3 uploads (demo reports, AI packages)", howToGet: "Get from AWS IAM console → Security credentials" },
  aws_secret_access_key: { features: "S3 uploads (demo reports, AI packages)", howToGet: "Get from AWS IAM console → Security credentials" },
  ms_graph_client_id: { features: "Outlook email integration", howToGet: "Register app in Azure AD → Application (client) ID" },
  ms_graph_tenant_id: { features: "Outlook email integration", howToGet: "Azure AD → Directory (tenant) ID" },
  ms_graph_client_secret: { features: "Outlook email integration", howToGet: "Azure AD → Certificates & secrets → New client secret" },
  ga4_service_account_path: { features: "Google Analytics dashboard data", howToGet: "Create service account in Google Cloud → download JSON key file" },
  ga4_property_id: { features: "Google Analytics dashboard data", howToGet: "GA4 → Admin → Property Settings → Property ID" },
  email_api_base_url: { features: "Email campaign sending via SES", howToGet: "Set to your tv-api deployment URL (e.g. https://api.thinkval.com)" },
  notion_api_key: { features: "Notion database sync", howToGet: "Get from notion.so/my-integrations → Create integration → Internal Integration Token" },
  github_client_id: { features: "GitHub OAuth login", howToGet: "GitHub → Settings → Developer settings → OAuth Apps" },
  github_client_secret: { features: "GitHub OAuth login", howToGet: "GitHub → Settings → Developer settings → OAuth Apps" },
};

const EXPECTED_TOOL_GROUPS: Record<string, string[]> = {
  "Work Module": ["list-work-projects", "create-work-project", "list-work-tasks", "create-work-task"],
  "CRM": ["list-crm-companies", "list-crm-deals", "list-crm-contacts", "log-crm-activity"],
  "VAL Sync": ["execute-val-sql", "sync-val-status", "sync-val-all"],
  "Workspaces": ["list-workspaces", "create-workspace"],
  "Content Generation": ["gamma-generate", "nanobanana-generate", "generate-proposal", "generate-order-form"],
  "Publishing": ["publish-to-intercom", "list-intercom-collections"],
  "Drive": ["list-drive-files", "check-all-domain-drive-files"],
  "Monitoring": ["sync-all-domain-monitoring", "sync-all-domain-sod-tables"],
};

// Map live test failures to their likely root cause
const LIVE_TEST_DEPENDENCIES: Record<string, { keys: string[]; label: string }> = {
  "live-val": { keys: ["supabase_url", "supabase_anon_key"], label: "Supabase credentials" },
  "live-work": { keys: ["supabase_url", "supabase_anon_key"], label: "Supabase credentials" },
  "live-crm": { keys: ["supabase_url", "supabase_anon_key"], label: "Supabase credentials" },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function errStr(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return JSON.stringify(e);
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface DiagnosticsViewProps {
  onNavigate?: (view: string) => void;
}

export function DiagnosticsView({ onNavigate }: DiagnosticsViewProps) {
  const [results, setResults] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [hasRun, setHasRun] = useState(false);
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
      setResults((prev) =>
        prev.map((r) =>
          r.id === `key-${keyName}`
            ? { ...r, status: "pass" as CheckStatus, detail: "Just configured — re-run to verify" }
            : r,
        ),
      );
    } catch (e: unknown) {
      toast.error(`Failed to save: ${errStr(e)}`);
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
      toast.success("Claude Code binary installed and registered");
      setResults((prev) =>
        prev.map((r) => {
          if (r.id === "claude-binary") {
            return { ...r, status: status.binary_installed ? "pass" : "fail", detail: `Installed at ${status.binary_path}` };
          }
          if (r.id === "claude-config") {
            return { ...r, status: status.config_has_tv_mcp ? "pass" : "warn", detail: status.config_has_tv_mcp ? "tv-mcp registered in Claude Code (user-level)" : "Config not updated — restart Claude Code and try again" };
          }
          return r;
        }),
      );
    } catch (e: unknown) {
      toast.error(`Install failed: ${errStr(e)}`);
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

    // Helper to check if a key passed so far
    const keyPassed = (name: string) => checks.some((c) => c.id === `key-${name}` && c.status === "pass");

    // ─────────────────────────────────────────────────────────────────────
    // 1. INFRASTRUCTURE
    // ─────────────────────────────────────────────────────────────────────

    // 1a. App version
    try {
      const version = (window as unknown as { __APP_VERSION__?: string }).__APP_VERSION__ ?? "unknown";
      add({
        id: "app-version",
        label: "App Version",
        group: "Infrastructure",
        status: "pass",
        detail: `v${version}`,
      });
    } catch {
      add({ id: "app-version", label: "App Version", group: "Infrastructure", status: "warn", detail: "Could not determine version" });
    }

    // 1b. MCP Server (embedded HTTP for bot panel)
    try {
      const status = await invoke<McpStatus>("mcp_get_status");
      add({
        id: "mcp-server",
        label: "MCP Server (Bot Panel)",
        group: "Infrastructure",
        status: status.http_enabled ? "pass" : "fail",
        detail: status.http_enabled
          ? `Running on port ${status.http_port} — ${status.tool_count} tools registered`
          : "MCP server not running — bot panel will not work. Restart the app.",
      });
    } catch (e) {
      add({ id: "mcp-server", label: "MCP Server (Bot Panel)", group: "Infrastructure", status: "fail", detail: `Error: ${errStr(e)}. Restart the app.` });
    }

    // 1c. Claude CLI
    let claudeCliInstalled = false;
    try {
      const cli = await invoke<ClaudeCliStatus>("check_claude_cli");
      claudeCliInstalled = cli.installed;
      add({
        id: "claude-cli",
        label: "Claude Code CLI",
        group: "Infrastructure",
        status: cli.installed ? "pass" : "warn",
        detail: cli.installed
          ? `${cli.version ?? "installed"} at ${cli.path}`
          : "Not installed — install from https://claude.ai/download for Claude Code integration",
        fix: cli.installed ? undefined : { kind: "info", message: "Install Claude Code CLI from https://claude.ai/download" },
      });
    } catch {
      add({ id: "claude-cli", label: "Claude Code CLI", group: "Infrastructure", status: "warn", detail: "Could not check — install from https://claude.ai/download" });
    }

    // 1d. Claude MCP Binary + Config + Common Issues
    try {
      const claude = await invoke<ClaudeMcpStatus>("claude_mcp_status");
      const appVersion = (window as unknown as { __APP_VERSION__?: string }).__APP_VERSION__ ?? "unknown";

      add({
        id: "claude-binary",
        label: "tv-mcp Binary",
        group: "Infrastructure",
        status: claude.binary_installed ? "pass" : "warn",
        detail: claude.binary_installed
          ? `Installed at ${claude.binary_path}`
          : "Not installed — click Install to download and register with Claude Code",
        fix: claude.binary_installed ? undefined : { kind: "install-claude" },
      });

      // If binary installed, check if Claude Code can see it
      if (claude.binary_installed && claudeCliInstalled) {
        add({
          id: "claude-config",
          label: "Claude Code ↔ tv-mcp",
          group: "Infrastructure",
          status: claude.config_has_tv_mcp ? "pass" : "fail",
          detail: claude.config_has_tv_mcp
            ? "tv-mcp registered in Claude Code (user-level config)"
            : "tv-mcp not registered in Claude Code — click Reinstall to re-register, then restart Claude Code",
          fix: claude.config_has_tv_mcp ? undefined : { kind: "install-claude" },
        });

        // Version check: binary should match app version
        if (claude.config_has_tv_mcp) {
          add({
            id: "claude-version",
            label: "tv-mcp Version",
            group: "Infrastructure",
            status: "pass",
            detail: `App v${appVersion} — click Reinstall in Claude Code settings if MCP tools seem outdated`,
          });
        }
      } else if (claude.binary_installed && !claudeCliInstalled) {
        add({
          id: "claude-config",
          label: "Claude Code ↔ tv-mcp",
          group: "Infrastructure",
          status: "skip",
          detail: "Cannot verify — Claude Code CLI not installed. Install CLI first, then Reinstall tv-mcp.",
        });
      } else {
        add({
          id: "claude-config",
          label: "Claude Code ↔ tv-mcp",
          group: "Infrastructure",
          status: "warn",
          detail: "tv-mcp not installed — click Install to set up Claude Code integration",
          fix: { kind: "install-claude" },
        });
      }
    } catch (e) {
      add({ id: "claude-binary", label: "tv-mcp Binary", group: "Infrastructure", status: "warn", detail: `Could not check: ${errStr(e)}`, fix: { kind: "navigate", view: "claude", label: "Go to Claude Code" } });
    }

    // 1e. MCP Troubleshooting — detect common problems
    // Check if there's a stale project-level .mcp.json that could cause issues
    // (This is what caused the bug where Gloria's Windows path overrode the correct path)
    add({
      id: "mcp-tip",
      label: "MCP Troubleshooting",
      group: "Infrastructure",
      status: "pass",
      detail: "If Claude Code shows tv-mcp as Failed: (1) Go to Settings → Claude Code → Reinstall (2) Restart Claude Code. If still broken, run `claude mcp list` in terminal to see the actual path.",
    });

    // ─────────────────────────────────────────────────────────────────────
    // 2. CREDENTIALS
    // ─────────────────────────────────────────────────────────────────────

    try {
      const keys = await invoke<ApiKeyInfo[]>("settings_list_keys");
      for (const key of keys) {
        const meta = KEY_FEATURE_MAP[key.name];
        const isRequired = REQUIRED_KEYS.has(key.name);

        // Skip unknown keys unless they're set
        if (!meta && !key.is_set) continue;

        const featureNote = meta ? ` — enables: ${meta.features}` : "";
        const howTo = meta?.howToGet ?? "";

        add({
          id: `key-${key.name}`,
          label: key.description || key.name,
          group: "Credentials",
          status: key.is_set ? "pass" : (isRequired ? "fail" : "warn"),
          detail: key.is_set
            ? `Configured (${key.masked_value})`
            : isRequired
              ? `Required — not configured${featureNote}. ${howTo}`
              : `Not configured${featureNote}. ${howTo}`,
          fix: key.is_set ? undefined : { kind: "set-key", keyName: key.name },
        });
      }
    } catch (e) {
      add({ id: "keys-error", label: "Settings", group: "Credentials", status: "fail", detail: `Could not load keys: ${errStr(e)}`, fix: { kind: "navigate", view: "keys", label: "API Keys" } });
    }

    // ─────────────────────────────────────────────────────────────────────
    // 3. SERVICES (live connectivity)
    // ─────────────────────────────────────────────────────────────────────

    // 3a. Supabase / VAL / Work / CRM — via MCP tool calls
    const liveTests: Array<[string, string, string, string[]]> = [
      ["live-val", "sync-val-list-domains", "VAL Connection", ["supabase_url", "supabase_anon_key"]],
      ["live-work", "list-work-projects", "Work Module", ["supabase_url", "supabase_anon_key"]],
      ["live-crm", "list-crm-companies", "CRM Module", ["supabase_url", "supabase_anon_key"]],
    ];

    for (const [testId, toolName, label, depKeys] of liveTests) {
      const missingDeps = depKeys.filter((k) => !keyPassed(k));
      if (missingDeps.length > 0) {
        const dep = LIVE_TEST_DEPENDENCIES[testId];
        add({
          id: testId,
          label,
          group: "Services",
          status: "skip",
          detail: `Skipped — requires ${dep?.label ?? missingDeps.join(", ")} (configure in Credentials above)`,
          fix: { kind: "set-key", keyName: missingDeps[0] },
        });
        continue;
      }

      try {
        const result = await invoke<{ content: Array<{ text?: string }>; isError?: boolean }>(
          "mcp_call_tool",
          { name: toolName, arguments: {} },
        );

        if (result.isError) {
          const errorText = result.content?.[0]?.text ?? "Unknown error";
          add({ id: testId, label, group: "Services", status: "fail", detail: `Error: ${errorText}` });
        } else {
          let detail = "Connected";
          if (testId === "live-val") {
            try {
              const count = JSON.parse(result.content[0].text!).length;
              detail = `Connected — ${count} domains found`;
            } catch { /* keep generic */ }
          }
          if (testId === "live-work") {
            try {
              const parsed = JSON.parse(result.content[0].text!);
              detail = `Connected — ${parsed.length ?? 0} projects`;
            } catch { /* keep generic */ }
          }
          if (testId === "live-crm") {
            try {
              const parsed = JSON.parse(result.content[0].text!);
              detail = `Connected — ${parsed.length ?? 0} companies`;
            } catch { /* keep generic */ }
          }
          add({ id: testId, label, group: "Services", status: "pass", detail });
        }
      } catch (e) {
        add({ id: testId, label, group: "Services", status: "fail", detail: `${errStr(e)}`, fix: { kind: "navigate", view: "keys", label: "API Keys" } });
      }
    }

    // 3b. Outlook
    try {
      const msGraphConfigured = keyPassed("ms_graph_client_id") && keyPassed("ms_graph_tenant_id") && keyPassed("ms_graph_client_secret");
      if (!msGraphConfigured) {
        add({
          id: "outlook",
          label: "Outlook Email",
          group: "Services",
          status: "skip",
          detail: "Skipped — requires MS Graph credentials (client_id, tenant_id, client_secret)",
          fix: { kind: "set-key", keyName: "ms_graph_client_id" },
        });
      } else {
        const outlook = await invoke<OutlookAuthStatus>("outlook_auth_check");
        add({
          id: "outlook",
          label: "Outlook Email",
          group: "Services",
          status: outlook.is_authenticated ? "pass" : "warn",
          detail: outlook.is_authenticated
            ? `Authenticated as ${outlook.user_email ?? "unknown"}`
            : "Not authenticated — go to Email module and click Connect Outlook",
          fix: outlook.is_authenticated ? undefined : { kind: "info", message: "Open Email module → Connect Outlook to authenticate" },
        });
      }
    } catch (e) {
      add({ id: "outlook", label: "Outlook Email", group: "Services", status: "warn", detail: `Could not check: ${errStr(e)}` });
    }

    // 3c. Scheduler
    try {
      const scheduler = await invoke<SchedulerStatus>("scheduler_get_status");
      add({
        id: "scheduler",
        label: "Scheduler",
        group: "Services",
        status: scheduler.total_jobs > 0 ? "pass" : "warn",
        detail: scheduler.total_jobs > 0
          ? `${scheduler.enabled_jobs}/${scheduler.total_jobs} jobs enabled, ${scheduler.running_jobs} running`
          : "No scheduled jobs configured — set up in Scheduler module for automated tasks",
      });
    } catch (e) {
      add({ id: "scheduler", label: "Scheduler", group: "Services", status: "warn", detail: `Could not check: ${errStr(e)}` });
    }

    // 3d. AWS (S3 connectivity)
    {
      const hasAws = keyPassed("aws_access_key_id") && keyPassed("aws_secret_access_key");
      add({
        id: "aws-s3",
        label: "AWS S3 (Report Upload)",
        group: "Services",
        status: hasAws ? "pass" : "warn",
        detail: hasAws
          ? "AWS credentials configured — S3 uploads available"
          : "Not configured — needed for uploading demo reports to S3. Set AWS access key and secret.",
        fix: hasAws ? undefined : { kind: "set-key", keyName: "aws_access_key_id" },
      });
    }

    // 3e. Email Campaigns (SES)
    {
      const hasEmailApi = keyPassed("email_api_base_url");
      add({
        id: "email-campaigns",
        label: "Email Campaigns (SES)",
        group: "Services",
        status: hasEmailApi ? "pass" : "warn",
        detail: hasEmailApi
          ? "Email API configured — campaign sending available"
          : "Not configured — set email_api_base_url to your tv-api URL for campaign sending",
        fix: hasEmailApi ? undefined : { kind: "set-key", keyName: "email_api_base_url" },
      });
    }

    // ─────────────────────────────────────────────────────────────────────
    // 4. VAL SYNC CONFIGURATION
    // ─────────────────────────────────────────────────────────────────────

    try {
      const domains = await invoke<Array<{ domain: string; api_domain: string }> >("val_sync_list_domains");
      add({
        id: "val-domains",
        label: "VAL Domains",
        group: "VAL Configuration",
        status: domains.length > 0 ? "pass" : "warn",
        detail: domains.length > 0
          ? `${domains.length} domains configured: ${domains.slice(0, 5).map((d) => d.domain).join(", ")}${domains.length > 5 ? "..." : ""}`
          : "No domains configured — import from .env files or add manually in VAL Credentials",
        fix: domains.length > 0 ? undefined : { kind: "navigate", view: "val", label: "VAL Credentials" },
      });
    } catch (e) {
      add({ id: "val-domains", label: "VAL Domains", group: "VAL Configuration", status: "warn", detail: `Could not load: ${errStr(e)}`, fix: { kind: "navigate", view: "val", label: "VAL Credentials" } });
    }

    // ─────────────────────────────────────────────────────────────────────
    // 5. TOOL AVAILABILITY
    // ─────────────────────────────────────────────────────────────────────

    try {
      const tools = await invoke<McpToolInfo[]>("mcp_list_tools");
      const toolNames = new Set(tools.map((t) => t.name));

      for (const [group, expectedTools] of Object.entries(EXPECTED_TOOL_GROUPS)) {
        const found = expectedTools.filter((t) => toolNames.has(t));
        const missing = expectedTools.filter((t) => !toolNames.has(t));

        if (missing.length === 0) {
          add({
            id: `toolgroup-${group}`,
            label: group,
            group: "Tools",
            status: "pass",
            detail: `All ${found.length} tools available`,
          });
        } else {
          add({
            id: `toolgroup-${group}`,
            label: group,
            group: "Tools",
            status: "fail",
            detail: `Missing: ${missing.join(", ")} — may need app update`,
          });
        }
      }

      // Show total tool count
      add({
        id: "tool-total",
        label: "Total Registered",
        group: "Tools",
        status: "pass",
        detail: `${tools.length} MCP tools available`,
      });
    } catch (e) {
      add({ id: "tools-error", label: "Tool Registry", group: "Tools", status: "fail", detail: `Could not list tools: ${errStr(e)}. Restart the app.` });
    }

    setRunning(false);
  }, []);

  // ── Import settings file ─────────────────────────────────────────────

  const [importing, setImporting] = useState(false);

  const handleImportSettings = useCallback(async () => {
    try {
      const filePath = await open({
        title: "Import settings (JSON or .env)",
        filters: [
          { name: "Settings", extensions: ["json", "env"] },
          { name: "All Files", extensions: ["*"] },
        ],
        multiple: false,
      });
      if (!filePath) return;
      setImporting(true);
      const imported = await invoke<string[]>("settings_import_from_file", { filePath: filePath as string });
      toast.success(`Imported ${imported.length} key${imported.length !== 1 ? "s" : ""}: ${imported.slice(0, 5).join(", ")}${imported.length > 5 ? "..." : ""}`);
      // Re-run diagnostics after import
      setTimeout(() => runDiagnostics(), 500);
    } catch (e: unknown) {
      toast.error(`Import failed: ${errStr(e)}`);
    } finally {
      setImporting(false);
    }
  }, [runDiagnostics]);

  // ── Group + render ────────────────────────────────────────────────────

  const groups = results.reduce<Record<string, CheckResult[]>>((acc, r) => {
    (acc[r.group] ??= []).push(r);
    return acc;
  }, {});

  const groupOrder = [
    "Infrastructure",
    "Credentials",
    "Services",
    "VAL Configuration",
    "Tools",
  ];

  // Group descriptions for context
  const groupDescriptions: Record<string, string> = {
    "Infrastructure": "Core system components that must be running",
    "Credentials": "API keys and secrets — ask Melvin for the settings file, then click Import Settings",
    "Services": "Live connectivity to external systems",
    "VAL Configuration": "Domain-specific VAL platform setup",
    "Tools": "MCP tools registered for bot panel and Claude Code",
  };

  const passCount = results.filter((r) => r.status === "pass").length;
  const failCount = results.filter((r) => r.status === "fail").length;
  const warnCount = results.filter((r) => r.status === "warn").length;
  const skipCount = results.filter((r) => r.status === "skip").length;
  const totalChecks = results.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">System Diagnostics</h2>
          <p className="text-xs text-zinc-400 mt-0.5">Comprehensive health check across all features</p>
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
            <CheckCircle2 size={12} /> {passCount}/{totalChecks} passed
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
          {skipCount > 0 && (
            <span className="flex items-center gap-1 text-xs font-medium text-zinc-400">
              {skipCount} skipped
            </span>
          )}
        </div>
      )}

      {/* Results */}
      {!hasRun ? (
        <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
          <RefreshCw size={28} className="mb-3 text-zinc-300 dark:text-zinc-600" />
          <p className="text-sm">Click "Run Diagnostics" to check your setup</p>
          <p className="text-[10px] mt-1 text-zinc-300 dark:text-zinc-600">
            Checks infrastructure, credentials, services, VAL config, and {Object.keys(EXPECTED_TOOL_GROUPS).length} tool groups
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {groupOrder.map((groupName) => {
            const items = groups[groupName];
            if (!items) return null;

            const groupFails = items.filter((r) => r.status === "fail").length;
            const groupWarns = items.filter((r) => r.status === "warn").length;
            const groupSkips = items.filter((r) => r.status === "skip").length;
            const allPass = groupFails === 0 && groupWarns === 0 && groupSkips === 0;
            const isExpanded = expandedGroups.has(groupName) || groupFails > 0 || groupWarns > 0 || running;

            return (
              <div key={groupName} className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                <button
                  onClick={() => toggleGroup(groupName)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <div className="flex-1 text-left">
                    <span>{groupName}</span>
                    {groupDescriptions[groupName] && (
                      <span className="ml-2 text-[10px] text-zinc-400 font-normal">{groupDescriptions[groupName]}</span>
                    )}
                  </div>
                  <span className="flex items-center gap-2">
                    {groupName === "Credentials" && (groupFails > 0 || groupWarns > 0) && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleImportSettings(); }}
                        disabled={importing}
                        className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded transition-colors disabled:opacity-50"
                      >
                        {importing ? <Loader2 size={10} className="animate-spin" /> : <Upload size={10} />}
                        Import Settings
                      </button>
                    )}
                    {items.some((r) => r.status === "running") && <Loader2 size={11} className="animate-spin text-zinc-400" />}
                    {allPass && !running && <span className="text-emerald-500"><CheckCircle2 size={12} /></span>}
                    {groupFails > 0 && <span className="text-red-500 text-[10px]">{groupFails} failed</span>}
                    {groupWarns > 0 && <span className="text-amber-500 text-[10px]">{groupWarns} warn</span>}
                    {groupSkips > 0 && <span className="text-zinc-400 text-[10px]">{groupSkips} skip</span>}
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
                              <p className="text-[10px] text-zinc-400 mt-0.5 leading-relaxed" title={item.detail}>
                                {item.detail}
                              </p>
                            )}
                          </div>

                          {/* Fix actions */}
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
                              {item.fix.kind === "info" && (
                                <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-zinc-400">
                                  <Info size={10} />
                                </span>
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
    case "skip":
      return <div className="w-[13px] h-[13px] rounded-full border border-zinc-300 dark:border-zinc-600 flex-shrink-0 mt-0.5" />;
    case "running":
      return <Loader2 size={13} className="text-zinc-400 animate-spin flex-shrink-0 mt-0.5" />;
    default:
      return <div className="w-[13px] h-[13px] rounded-full bg-zinc-200 dark:bg-zinc-700 flex-shrink-0 mt-0.5" />;
  }
}
