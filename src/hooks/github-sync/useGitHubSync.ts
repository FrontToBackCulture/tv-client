// GitHub Sync React Query hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useJobsStore } from "../../stores/jobsStore";
import {
  gitHubSyncKeys,
  type GitHubSyncConfig,
  type PreviewResult,
  type SyncResult,
} from "./types";

/** Load GitHub sync config */
export function useGitHubSyncConfig() {
  return useQuery({
    queryKey: gitHubSyncKeys.config(),
    queryFn: () => invoke<GitHubSyncConfig>("github_sync_load_config"),
    staleTime: 30_000,
  });
}

/** Import config from a file path */
export function useGitHubSyncImportConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filePath: string) =>
      invoke<GitHubSyncConfig>("github_sync_import_config", {
        filePath,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: gitHubSyncKeys.config() });
    },
  });
}

/** Save config to disk */
export function useGitHubSyncSaveConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: GitHubSyncConfig) =>
      invoke<void>("github_sync_save_config", { config }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: gitHubSyncKeys.config() });
    },
  });
}

/** Initialize config from bundled default */
export function useGitHubSyncInitDefault() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      invoke<GitHubSyncConfig>("github_sync_init_default_config"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: gitHubSyncKeys.config() });
    },
  });
}

/** Preview sync for a repo (dry run) */
export function useGitHubSyncPreview() {
  return useMutation({
    mutationFn: ({
      token,
      owner,
      repo,
    }: {
      token: string;
      owner: string;
      repo: string;
    }) =>
      invoke<PreviewResult>("github_sync_preview", { token, owner, repo }),
  });
}

/** Run full sync for a repo */
export function useGitHubSyncRun() {
  const { addJob, updateJob } = useJobsStore.getState();
  return useMutation({
    mutationFn: async ({
      token,
      owner,
      repo,
    }: {
      token: string;
      owner: string;
      repo: string;
    }) => {
      const jobId = `github-sync-${Date.now()}`;
      addJob({ id: jobId, name: "GitHub Sync", status: "running", message: `Syncing ${owner}/${repo}...` });
      try {
        const result = await invoke<SyncResult>("github_sync_run", { token, owner, repo });
        updateJob(jobId, { status: "completed", message: `Synced ${owner}/${repo}` });
        return result;
      } catch (err) {
        updateJob(jobId, { status: "failed", message: `${err}` });
        throw err;
      }
    },
  });
}
