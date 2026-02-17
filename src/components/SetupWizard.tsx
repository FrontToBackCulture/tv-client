// src/components/SetupWizard.tsx
// First-run setup wizard — shown once after login, walks through prerequisites

import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Terminal,
  Download,
  ExternalLink,
  Settings,
} from "lucide-react";
import { cn } from "../lib/cn";
import { useAppStore } from "../stores/appStore";

// ── Types ────────────────────────────────────────────────

interface ClaudeCliStatus {
  installed: boolean;
  version: string | null;
  path: string | null;
}

interface ClaudeMcpStatus {
  binary_installed: boolean;
  binary_path: string;
  config_exists: boolean;
  config_has_tv_mcp: boolean;
  platform: string;
}

type Step = "welcome" | "cli" | "mcp" | "done";
const STEPS: Step[] = ["welcome", "cli", "mcp", "done"];

const SETUP_KEY = "tv-setup-complete";

// ── Main Component ───────────────────────────────────────

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const [currentStep, setCurrentStep] = useState<Step>("welcome");
  const [cliStatus, setCliStatus] = useState<ClaudeCliStatus | null>(null);
  const [cliChecking, setCliChecking] = useState(false);
  const [mcpStatus, setMcpStatus] = useState<ClaudeMcpStatus | null>(null);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [mcpInstalling, setMcpInstalling] = useState(false);
  const [mcpError, setMcpError] = useState<string | null>(null);

  const openSettings = useAppStore((s) => s.openSettings);

  const stepIndex = STEPS.indexOf(currentStep);

  const goNext = () => {
    const next = STEPS[stepIndex + 1];
    if (next) setCurrentStep(next);
  };

  const goBack = () => {
    const prev = STEPS[stepIndex - 1];
    if (prev) setCurrentStep(prev);
  };

  const handleComplete = () => {
    localStorage.setItem(SETUP_KEY, "true");
    onComplete();
  };

  const handleSkip = () => {
    localStorage.setItem(SETUP_KEY, "true");
    onComplete();
  };

  // ── CLI Check ────────────────────────────────────────

  const checkCli = useCallback(async () => {
    setCliChecking(true);
    try {
      const status = await invoke<ClaudeCliStatus>("check_claude_cli");
      setCliStatus(status);
    } catch {
      setCliStatus({ installed: false, version: null, path: null });
    } finally {
      setCliChecking(false);
    }
  }, []);

  useEffect(() => {
    if (currentStep === "cli" && !cliStatus) {
      checkCli();
    }
  }, [currentStep, cliStatus, checkCli]);

  // ── MCP Check ────────────────────────────────────────

  const checkMcp = useCallback(async () => {
    setMcpLoading(true);
    setMcpError(null);
    try {
      const status = await invoke<ClaudeMcpStatus>("claude_mcp_status");
      setMcpStatus(status);
    } catch (e) {
      setMcpError(e instanceof Error ? e.message : String(e));
    } finally {
      setMcpLoading(false);
    }
  }, []);

  const installMcp = async () => {
    setMcpInstalling(true);
    setMcpError(null);
    try {
      const status = await invoke<ClaudeMcpStatus>("claude_mcp_install");
      setMcpStatus(status);
    } catch (e) {
      setMcpError(e instanceof Error ? e.message : String(e));
    } finally {
      setMcpInstalling(false);
    }
  };

  useEffect(() => {
    if (currentStep === "mcp" && !mcpStatus) {
      checkMcp();
    }
  }, [currentStep, mcpStatus, checkMcp]);

  // ── Render ───────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-zinc-950">
      {/* Draggable title bar */}
      <div
        onMouseDown={() => getCurrentWindow().startDragging()}
        className="h-10 bg-slate-100 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 flex items-center flex-shrink-0"
      >
        <div className="w-20 flex-shrink-0" />
        <div className="flex-1 flex justify-center pointer-events-none">
          <span className="text-xs text-zinc-500">Setup</span>
        </div>
        <div className="w-20 flex-shrink-0" />
      </div>

      {/* Content area */}
      <div className="flex-1 flex items-center justify-center">
        <div className="max-w-lg w-full px-6">
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mb-10">
            {STEPS.map((step, i) => (
              <div
                key={step}
                className={cn(
                  "w-2.5 h-2.5 rounded-full transition-colors",
                  i === stepIndex
                    ? "bg-teal-600"
                    : i < stepIndex
                      ? "bg-teal-400"
                      : "bg-zinc-300 dark:bg-zinc-700"
                )}
              />
            ))}
          </div>

          {/* Step content */}
          {currentStep === "welcome" && (
            <WelcomeStep onNext={goNext} onSkip={handleSkip} />
          )}
          {currentStep === "cli" && (
            <CliStep
              status={cliStatus}
              checking={cliChecking}
              onCheck={checkCli}
              onNext={goNext}
              onBack={goBack}
            />
          )}
          {currentStep === "mcp" && (
            <McpStep
              status={mcpStatus}
              loading={mcpLoading}
              installing={mcpInstalling}
              error={mcpError}
              onInstall={installMcp}
              onNext={goNext}
              onBack={goBack}
            />
          )}
          {currentStep === "done" && (
            <DoneStep
              cliInstalled={cliStatus?.installed ?? false}
              mcpInstalled={
                (mcpStatus?.binary_installed && mcpStatus?.config_has_tv_mcp) ??
                false
              }
              onComplete={handleComplete}
              onOpenSettings={() => {
                handleComplete();
                openSettings("claude");
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step: Welcome ────────────────────────────────────────

function WelcomeStep({
  onNext,
  onSkip,
}: {
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="text-center">
      <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
        <Terminal size={40} className="text-teal-600 dark:text-teal-400" />
      </div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
        Welcome to TV Desktop
      </h1>
      <p className="text-zinc-500 dark:text-zinc-400 mb-2 leading-relaxed">
        Your workspace for files, tasks, CRM, and AI-powered workflows — all in
        one app.
      </p>
      <p className="text-sm text-zinc-400 dark:text-zinc-500 mb-8">
        Let's get Claude Code set up so you can use AI right from your desktop.
      </p>
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={onSkip}
          className="px-4 py-2.5 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
        >
          Skip setup
        </button>
        <button
          onClick={onNext}
          className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
        >
          Let's go
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ── Step: Claude CLI ─────────────────────────────────────

function CliStep({
  status,
  checking,
  onCheck,
  onNext,
  onBack,
}: {
  status: ClaudeCliStatus | null;
  checking: boolean;
  onCheck: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <div className="text-center mb-8">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
          Claude Code CLI
        </h2>
        <p className="text-sm text-zinc-500">
          The CLI lets you run AI coding agents from your terminal.
        </p>
      </div>

      {/* Status card */}
      <div className="border border-slate-200 dark:border-zinc-800 rounded-lg p-5 mb-6">
        {checking ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 size={24} className="animate-spin text-zinc-400" />
          </div>
        ) : status?.installed ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2
                  size={20}
                  className="text-green-600 dark:text-green-400"
                />
              </div>
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  Claude Code is installed
                </p>
                {status.version && (
                  <p className="text-xs text-zinc-500 font-mono">
                    {status.version}
                  </p>
                )}
              </div>
            </div>
            {status.path && (
              <p
                className="text-xs text-zinc-400 font-mono truncate"
                title={status.path}
              >
                {status.path}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                <XCircle size={20} className="text-zinc-400" />
              </div>
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  Not installed
                </p>
                <p className="text-xs text-zinc-500">
                  Run the command below to install
                </p>
              </div>
            </div>

            <div className="bg-zinc-900 dark:bg-zinc-800 rounded-lg p-3">
              <code className="text-sm text-green-400 font-mono">
                npm install -g @anthropic-ai/claude-code
              </code>
            </div>

            <a
              href="https://docs.anthropic.com/en/docs/claude-code/overview"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-teal-600 dark:text-teal-400 hover:underline"
            >
              <ExternalLink size={14} />
              View documentation
            </a>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1 px-4 py-2.5 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
        >
          <ChevronLeft size={16} />
          Back
        </button>
        <div className="flex items-center gap-3">
          {!status?.installed && (
            <button
              onClick={onCheck}
              disabled={checking}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-slate-300 dark:border-zinc-700 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              {checking ? (
                <Loader2 size={14} className="animate-spin" />
              ) : null}
              Check again
            </button>
          )}
          <button
            onClick={onNext}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
          >
            {status?.installed ? "Next" : "Skip"}
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Step: TV-MCP ─────────────────────────────────────────

function McpStep({
  status,
  loading,
  installing,
  error,
  onInstall,
  onNext,
  onBack,
}: {
  status: ClaudeMcpStatus | null;
  loading: boolean;
  installing: boolean;
  error: string | null;
  onInstall: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const isFullyInstalled =
    status?.binary_installed && status?.config_has_tv_mcp;

  return (
    <div>
      <div className="text-center mb-8">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
          TV-MCP Server
        </h2>
        <p className="text-sm text-zinc-500">
          Connects Claude Code to your Work, CRM, and Generation tools.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-zinc-400" />
        </div>
      ) : (
        <>
          {/* Status cards */}
          <div className="space-y-3 mb-6">
            <div className="border border-slate-200 dark:border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Download size={16} className="text-zinc-400" />
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    Binary
                  </span>
                </div>
                {status?.binary_installed ? (
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
            </div>

            <div className="border border-slate-200 dark:border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings size={16} className="text-zinc-400" />
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    Claude Code Config
                  </span>
                </div>
                {status?.config_has_tv_mcp ? (
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
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Install button */}
          {!isFullyInstalled && (
            <div className="mb-6">
              <button
                onClick={onInstall}
                disabled={installing}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {installing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Installing...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Install TV-MCP
                  </>
                )}
              </button>
            </div>
          )}

          {isFullyInstalled && (
            <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <CheckCircle2 size={16} />
                <span className="text-sm font-medium">
                  TV-MCP is ready to use
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1 px-4 py-2.5 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
        >
          <ChevronLeft size={16} />
          Back
        </button>
        <button
          onClick={onNext}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
        >
          {isFullyInstalled ? "Next" : "Skip"}
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ── Step: Done ───────────────────────────────────────────

function DoneStep({
  cliInstalled,
  mcpInstalled,
  onComplete,
  onOpenSettings,
}: {
  cliInstalled: boolean;
  mcpInstalled: boolean;
  onComplete: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <div className="text-center">
      <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
        <CheckCircle2
          size={40}
          className="text-green-600 dark:text-green-400"
        />
      </div>
      <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
        You're all set!
      </h2>
      <p className="text-zinc-500 dark:text-zinc-400 mb-8">
        Here's a summary of your setup.
      </p>

      {/* Checklist */}
      <div className="text-left max-w-sm mx-auto mb-8 space-y-3">
        <div className="flex items-center gap-3">
          {cliInstalled ? (
            <CheckCircle2
              size={18}
              className="text-green-600 dark:text-green-400 flex-shrink-0"
            />
          ) : (
            <XCircle size={18} className="text-zinc-400 flex-shrink-0" />
          )}
          <span
            className={cn(
              "text-sm",
              cliInstalled
                ? "text-zinc-900 dark:text-zinc-100"
                : "text-zinc-400"
            )}
          >
            Claude Code CLI
          </span>
        </div>
        <div className="flex items-center gap-3">
          {mcpInstalled ? (
            <CheckCircle2
              size={18}
              className="text-green-600 dark:text-green-400 flex-shrink-0"
            />
          ) : (
            <XCircle size={18} className="text-zinc-400 flex-shrink-0" />
          )}
          <span
            className={cn(
              "text-sm",
              mcpInstalled
                ? "text-zinc-900 dark:text-zinc-100"
                : "text-zinc-400"
            )}
          >
            TV-MCP Server
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-3">
        <button
          onClick={onComplete}
          className="w-full flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
        >
          Get Started
          <ChevronRight size={16} />
        </button>
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            <Settings size={14} />
            Go to Settings
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Utility ──────────────────────────────────────────────

export function isSetupComplete(): boolean {
  return localStorage.getItem(SETUP_KEY) === "true";
}
