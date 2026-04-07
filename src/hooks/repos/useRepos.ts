import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useAuth } from "../../stores/authStore";
import { repoKeys } from "./keys";
import { useRepoSettings, TrackedRepo } from "./useRepoSettings";

// Types matching Rust structs (camelCase via serde)
export interface RepoCommit {
  sha: string;
  message: string;
  authorName: string;
  authorAvatar: string;
  authorLogin: string;
  date: string;
  htmlUrl: string;
}

export interface RepoRelease {
  id: number;
  tagName: string;
  name: string;
  body: string;
  publishedAt: string;
  htmlUrl: string;
  authorLogin: string;
  prerelease: boolean;
  draft: boolean;
}

export interface WorkflowRun {
  id: number;
  name: string;
  headBranch: string;
  status: string;
  conclusion: string | null;
  runNumber: number;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  headSha: string;
  headCommitMessage: string;
}

export function useCommits(owner: string, repo: string, enabled = true) {
  const token = useAuth((s) => s.user?.provider === "github" ? s.session?.provider_token ?? null : null);
  return useQuery({
    queryKey: repoKeys.commits(owner, repo),
    queryFn: () =>
      invoke<RepoCommit[]>("repos_get_commits", {
        token,
        owner,
        repo,
        perPage: 20,
      }),
    enabled: enabled && !!token,
    staleTime: 1000 * 60 * 2,
  });
}

export function useReleases(owner: string, repo: string, enabled = true) {
  const token = useAuth((s) => s.user?.provider === "github" ? s.session?.provider_token ?? null : null);
  return useQuery({
    queryKey: repoKeys.releases(owner, repo),
    queryFn: () =>
      invoke<RepoRelease[]>("repos_get_releases", {
        token,
        owner,
        repo,
        perPage: 10,
      }),
    enabled: enabled && !!token,
    staleTime: 1000 * 60 * 5,
  });
}

export function useWorkflowRuns(owner: string, repo: string, enabled = true) {
  const token = useAuth((s) => s.user?.provider === "github" ? s.session?.provider_token ?? null : null);
  return useQuery({
    queryKey: repoKeys.workflowRuns(owner, repo),
    queryFn: () =>
      invoke<WorkflowRun[]>("repos_get_workflow_runs", {
        token,
        owner,
        repo,
        perPage: 10,
      }),
    enabled: enabled && !!token,
    staleTime: 1000 * 60,
  });
}

export interface RepoSummary {
  owner: string;
  repo: string;
  latestCommit?: RepoCommit;
  latestRelease?: RepoRelease;
  latestRun?: WorkflowRun;
}

export function useRepoSummaries() {
  const repos = useRepoSettings((s) => s.repos);
  const token = useAuth((s) => s.user?.provider === "github" ? s.session?.provider_token ?? null : null);

  return useQuery({
    queryKey: [...repoKeys.all, "summaries"],
    queryFn: async (): Promise<RepoSummary[]> => {
      if (!token) return [];

      const results = await Promise.allSettled(
        repos.map(async (r: TrackedRepo): Promise<RepoSummary> => {
          const [commits, releases, runs] = await Promise.allSettled([
            invoke<RepoCommit[]>("repos_get_commits", {
              token,
              owner: r.owner,
              repo: r.repo,
              perPage: 1,
            }),
            invoke<RepoRelease[]>("repos_get_releases", {
              token,
              owner: r.owner,
              repo: r.repo,
              perPage: 1,
            }),
            invoke<WorkflowRun[]>("repos_get_workflow_runs", {
              token,
              owner: r.owner,
              repo: r.repo,
              perPage: 1,
            }),
          ]);

          return {
            owner: r.owner,
            repo: r.repo,
            latestCommit:
              commits.status === "fulfilled" ? commits.value[0] : undefined,
            latestRelease:
              releases.status === "fulfilled" ? releases.value[0] : undefined,
            latestRun:
              runs.status === "fulfilled" ? runs.value[0] : undefined,
          };
        })
      );

      return results
        .filter(
          (r): r is PromiseFulfilledResult<RepoSummary> =>
            r.status === "fulfilled"
        )
        .map((r) => r.value);
    },
    enabled: !!token && repos.length > 0,
    staleTime: 1000 * 60 * 2,
  });
}
