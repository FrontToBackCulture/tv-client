// GitHub Sync types - mirrors Rust structs

export interface GitHubSyncConfig {
  repositories: RepoConfig[];
}

export interface RepoConfig {
  owner: string;
  repo: string;
  branch: string;
  mappings: Mapping[];
  rules: Rule[];
}

export interface Mapping {
  name?: string;
  githubPath: string | string[];
  knowledgePath: string;
  fileTypes?: string[];
  flattenStructure?: boolean;
  isScopeOnly?: boolean;
  includeContent?: boolean;
}

export interface Rule {
  name?: string;
  condition: RuleCondition;
  targetPath: string;
  flattenStructure?: boolean;
  includeContent?: boolean;
}

export interface RuleCondition {
  folderContains?: string | string[];
  folderContainsMode?: string;
  folderEquals?: string | string[];
  folderExcludes?: string | string[];
  folderExcludesMode?: string;
  filenameContains?: string | string[];
  filenameContainsMode?: string;
  pathMatches?: string;
  fileTypes?: string[];
}

export interface PreviewResult {
  owner: string;
  repo: string;
  branch: string;
  tree_files: number;
  summary: MappingSummary;
  mapped_files: PreviewFile[];
}

export interface MappingSummary {
  total_files: number;
  mapped_files: number;
  unmapped_files: number;
  target_directories: number;
}

export interface PreviewFile {
  path: string;
  target_path: string;
  mapping_name: string;
  size: number;
}

export interface SyncResult {
  owner: string;
  repo: string;
  synced: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export interface SyncProgress {
  phase: string;
  current: number;
  total: number;
  message: string;
}

export const gitHubSyncKeys = {
  config: () => ["github-sync", "config"] as const,
  preview: (owner: string, repo: string) =>
    ["github-sync", "preview", owner, repo] as const,
};
