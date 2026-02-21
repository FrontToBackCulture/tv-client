// Settings: Claude Code Setup View

import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Loader2,
  RefreshCw,
  FileText,
  Trash2,
  Download,
  Cpu,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface ClaudeMcpStatus {
  binary_installed: boolean;
  binary_path: string;
  config_exists: boolean;
  config_has_tv_mcp: boolean;
  platform: string;
}

export function ClaudeCodeSetupView() {
  const [status, setStatus] = useState<ClaudeMcpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const s = await invoke<ClaudeMcpStatus>("claude_mcp_status");
      setStatus(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleInstall = async () => {
    try {
      setInstalling(true);
      setError(null);
      const s = await invoke<ClaudeMcpStatus>("claude_mcp_install");
      setStatus(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setInstalling(false);
    }
  };

  const handleUninstall = async () => {
    if (!confirm("Remove tv-mcp binary and Claude Code config entry?")) return;
    try {
      setUninstalling(true);
      setError(null);
      const s = await invoke<ClaudeMcpStatus>("claude_mcp_uninstall");
      setStatus(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUninstalling(false);
    }
  };

  const isFullyInstalled = status?.binary_installed && status?.config_has_tv_mcp;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Claude Code
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            Set up the tv-mcp server for Claude Code integration
          </p>
        </div>
        <button
          onClick={fetchStatus}
          className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
          title="Refresh"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-700 dark:text-blue-400">
          Claude Code uses the <strong>tv-mcp</strong> server to access Work, CRM,
          and Generation tools. Click Install to download the binary and configure
          Claude Code automatically.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={32} className="animate-spin text-zinc-400" />
        </div>
      ) : status ? (
        <>
          {/* Status cards */}
          <div className="space-y-3">
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu size={16} className="text-zinc-400" />
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    Platform
                  </span>
                </div>
                <span className="text-sm font-mono text-zinc-500">
                  {status.platform}
                </span>
              </div>
            </div>

            <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Download size={16} className="text-zinc-400" />
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    Binary
                  </span>
                </div>
                {status.binary_installed ? (
                  <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                    <CheckCircle2 size={12} />
                    Installed
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-zinc-400">
                    <XCircle size={12} />
                    Not installed
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-2 font-mono truncate" title={status.binary_path}>
                {status.binary_path}
              </p>
            </div>

            <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-zinc-400" />
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    Claude Code Config
                  </span>
                </div>
                {status.config_has_tv_mcp ? (
                  <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                    <CheckCircle2 size={12} />
                    Configured
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-zinc-400">
                    <XCircle size={12} />
                    Not configured
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-2 font-mono">
                ~/.claude.json
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {!isFullyInstalled ? (
              <button
                onClick={handleInstall}
                disabled={installing}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {installing ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Download size={16} />
                )}
                {installing ? "Installing..." : "Install"}
              </button>
            ) : (
              <>
                <button
                  onClick={handleInstall}
                  disabled={installing}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  {installing ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <RefreshCw size={16} />
                  )}
                  {installing ? "Reinstalling..." : "Reinstall / Update"}
                </button>
                <button
                  onClick={handleUninstall}
                  disabled={uninstalling}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                >
                  {uninstalling ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                  {uninstalling ? "Removing..." : "Uninstall"}
                </button>
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
