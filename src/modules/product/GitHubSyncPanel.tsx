// src/modules/product/GitHubSyncPanel.tsx
// GitHub sync panel — import config, preview, and sync connector source code
// Embedded within the Connectors tab

import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import {
  GitBranch,
  Upload,
  Eye,
  Play,
  CheckCircle2,
  XCircle,
  FileCode,
  AlertCircle,
  Settings2,
  Download,
} from "lucide-react";
import { InlineLoading } from "../../components/ui/DetailStates";
import { useAuth } from "../../stores/authStore";
import {
  useGitHubSyncConfig,
  useGitHubSyncImportConfig,
  useGitHubSyncSaveConfig,
  useGitHubSyncInitDefault,
  useGitHubSyncPreview,
  useGitHubSyncRun,
  type SyncProgress,
  type PreviewResult,
  type SyncResult,
} from "../../hooks/github-sync";
import { GitHubSyncConfigEditor } from "./GitHubSyncConfigEditor";
import { Button } from "../../components/ui";

export function GitHubSyncPanel() {
  const { accessToken } = useAuth();
  const { data: config, isLoading: configLoading } = useGitHubSyncConfig();
  const importConfig = useGitHubSyncImportConfig();
  const initDefault = useGitHubSyncInitDefault();
  const saveConfig = useGitHubSyncSaveConfig();
  const [editing, setEditing] = useState(false);

  const handleImport = async () => {
    const file = await open({
      title: "Select sync-config.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (file) {
      importConfig.mutate(file);
    }
  };

  const hasConfig = config && config.repositories.length > 0;

  if (!accessToken) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          GitHub Sync
        </h2>
        <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
          <AlertCircle size={18} className="text-amber-600" />
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Sign in with GitHub to sync connector source code.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            GitHub Sync
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            Sync connector source code from GitHub repositories to the knowledge
            base.
          </p>
        </div>
      </div>

      {/* Config Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Configuration
          </h3>
          <div className="flex items-center gap-2">
            {hasConfig && (
              <button
                onClick={() => setEditing(!editing)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  editing
                    ? "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 border border-teal-300 dark:border-teal-800"
                    : "bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
                }`}
              >
                <Settings2 size={14} />
                {editing ? "Close Editor" : "Edit Config"}
              </button>
            )}
            <Button
              onClick={handleImport}
              variant="secondary"
              icon={Upload}
              loading={importConfig.isPending}
            >
              Import Config
            </Button>
          </div>
        </div>

        {configLoading && (
          <InlineLoading message="Loading config..." />
        )}

        {importConfig.isSuccess && (
          <div className="flex items-center gap-2 p-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 rounded-md">
            <CheckCircle2 size={14} />
            Config imported successfully
          </div>
        )}

        {initDefault.isSuccess && (
          <div className="flex items-center gap-2 p-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 rounded-md">
            <CheckCircle2 size={14} />
            Default config loaded successfully
          </div>
        )}

        {(importConfig.isError || initDefault.isError) && (
          <div className="flex items-center gap-2 p-2 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-md">
            <XCircle size={14} />
            {((importConfig.error || initDefault.error) as Error)?.message ||
              "Operation failed"}
          </div>
        )}

        {/* Empty state: no config loaded */}
        {!configLoading && !hasConfig && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-zinc-500">
              No repositories configured.
            </p>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => initDefault.mutate()}
                icon={Download}
                loading={initDefault.isPending}
              >
                Load Default Config
              </Button>
              <span className="text-xs text-zinc-400">or</span>
              <Button
                onClick={handleImport}
                variant="secondary"
                icon={Upload}
                loading={importConfig.isPending}
              >
                Import Config
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Config Editor */}
      {editing && config && (
        <GitHubSyncConfigEditor
          config={config}
          onSave={(draft) => {
            saveConfig.mutate(draft, {
              onSuccess: () => setEditing(false),
            });
          }}
          onDiscard={() => setEditing(false)}
          isSaving={saveConfig.isPending}
        />
      )}

      {/* Repo cards (when not editing) */}
      {!editing &&
        config?.repositories.map((repo) => (
          <RepoCard
            key={`${repo.owner}/${repo.repo}`}
            owner={repo.owner}
            repo={repo.repo}
            branch={repo.branch}
            mappingCount={repo.mappings.length}
            ruleCount={repo.rules.length}
            token={accessToken}
          />
        ))}
    </div>
  );
}

function RepoCard({
  owner,
  repo,
  branch,
  mappingCount,
  ruleCount,
  token,
}: {
  owner: string;
  repo: string;
  branch: string;
  mappingCount: number;
  ruleCount: number;
  token: string;
}) {
  const preview = useGitHubSyncPreview();
  const sync = useGitHubSyncRun();
  const [progress, setProgress] = useState<SyncProgress | null>(null);

  useEffect(() => {
    const unlisten = listen<SyncProgress>("github-sync:progress", (event) => {
      setProgress(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handlePreview = () => {
    preview.mutate({ token, owner, repo });
  };

  const handleSync = () => {
    setProgress(null);
    sync.mutate({ token, owner, repo });
  };

  const isRunning = preview.isPending || sync.isPending;

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-900/50">
        <div className="flex items-center gap-3">
          <GitBranch size={18} className="text-zinc-500" />
          <div>
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {owner}/{repo}
            </span>
            <span className="ml-2 text-xs text-zinc-500">({branch})</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">
            {mappingCount} mappings, {ruleCount} rules
          </span>
          <Button
            onClick={handlePreview}
            disabled={isRunning}
            variant="secondary"
            icon={Eye}
            loading={preview.isPending}
          >
            Preview
          </Button>
          <Button
            onClick={handleSync}
            disabled={isRunning}
            icon={Play}
            loading={sync.isPending}
          >
            Sync
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      {progress && sync.isPending && (
        <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 capitalize">
              {progress.phase}
            </span>
            {progress.total > 0 && (
              <span className="text-xs text-zinc-500">
                {progress.current}/{progress.total}
              </span>
            )}
          </div>
          {progress.total > 0 && (
            <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-500 rounded-full transition-all duration-300"
                style={{
                  width: `${Math.round((progress.current / progress.total) * 100)}%`,
                }}
              />
            </div>
          )}
          <p className="text-xs text-zinc-500 mt-1 truncate">
            {progress.message}
          </p>
        </div>
      )}

      {/* Preview result */}
      {preview.data && !sync.isPending && (
        <PreviewPanel data={preview.data} />
      )}

      {/* Sync result */}
      {sync.data && !sync.isPending && <SyncResultPanel data={sync.data} />}

      {/* Errors */}
      {(preview.isError || sync.isError) && (
        <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-red-50 dark:bg-red-950/20">
          <div className="flex items-center gap-2 text-xs text-red-700 dark:text-red-400">
            <XCircle size={14} />
            {((preview.error || sync.error) as Error)?.message || "Operation failed"}
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewPanel({ data }: { data: PreviewResult }) {
  const [showFiles, setShowFiles] = useState(false);

  return (
    <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Tree Files" value={data.tree_files} />
        <Stat label="Mapped" value={data.summary.mapped_files} />
        <Stat label="Unmapped" value={data.summary.unmapped_files} />
        <Stat label="Target Dirs" value={data.summary.target_directories} />
      </div>

      {data.mapped_files.length > 0 && (
        <button
          onClick={() => setShowFiles(!showFiles)}
          className="text-xs text-teal-600 dark:text-teal-400 hover:underline"
        >
          {showFiles
            ? "Hide file list"
            : `Show ${data.mapped_files.length} mapped files`}
        </button>
      )}

      {showFiles && (
        <div className="max-h-64 overflow-auto text-xs font-mono space-y-0.5">
          {data.mapped_files.map((f) => (
            <div
              key={f.path}
              className="flex items-center gap-2 py-0.5 text-zinc-600 dark:text-zinc-400"
            >
              <FileCode size={12} className="flex-shrink-0 text-zinc-400" />
              <span className="truncate">{f.path}</span>
              <span className="text-zinc-400 mx-1">&rarr;</span>
              <span className="truncate text-zinc-500">
                {f.target_path.split("/").slice(-3).join("/")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SyncResultPanel({ data }: { data: SyncResult }) {
  return (
    <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
      <div className="flex items-center gap-3">
        {data.failed === 0 ? (
          <CheckCircle2 size={16} className="text-emerald-500" />
        ) : (
          <AlertCircle size={16} className="text-amber-500" />
        )}
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Synced {data.synced} files
          {data.failed > 0 && (
            <span className="text-amber-600 ml-1">
              ({data.failed} failed)
            </span>
          )}
        </span>
      </div>

      {data.errors.length > 0 && (
        <div className="text-xs text-red-600 dark:text-red-400 space-y-0.5 max-h-32 overflow-auto">
          {data.errors.map((err, i) => (
            <div key={i}>{err}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        {value.toLocaleString()}
      </div>
      <div className="text-xs text-zinc-500">{label}</div>
    </div>
  );
}
