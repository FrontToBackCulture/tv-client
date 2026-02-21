// Shared types and cache keys for VAL Sync hooks

// ============================================================
// Types (mirror Rust structs)
// ============================================================

export interface DomainSummary {
  domain: string;
  global_path: string;
  has_actual_domain: boolean;
  domain_type: string;
  has_metadata: boolean;
}

export interface DiscoveredDomain {
  domain: string;
  domain_type: string;
  global_path: string;
  has_metadata: boolean;
  has_actual_domain: boolean;
  /** ISO timestamp of the most recent sync operation */
  last_sync: string | null;
  /** Count of total artifacts synced */
  artifact_count: number | null;
}

export interface AuthResult {
  domain: string;
  authenticated: boolean;
  token_preview: string | null;
  expires_at: string | null;
  message: string;
}

export interface SyncResult {
  domain: string;
  artifact_type: string;
  count: number;
  file_path: string;
  duration_ms: number;
  status: string;
  message: string;
}

export interface ExtractResult {
  domain: string;
  extract_type: string;
  count: number;
  duration_ms: number;
  status: string;
  message: string;
}

export interface SyncAllResult {
  domain: string;
  results: SyncResult[];
  extract_results: ExtractResult[];
  total_duration_ms: number;
  status: string;
}

export interface ArtifactStatus {
  last_sync: string;
  count: number;
  status: string;
  duration_ms: number | null;
}

export interface SyncMetadata {
  domain: string;
  created: string;
  artifacts: Record<string, ArtifactStatus>;
  extractions: Record<string, ArtifactStatus>;
  history: { timestamp: string; operation: string; status: string; details: string | null }[];
}

export interface ValCredentials {
  email: string | null;
  password: string | null;
  has_credentials: boolean;
}

export interface ProjectConfig {
  solution: string;
  useCase?: string;
  configPath?: string;
  metadataTypes?: Record<string, string>;
}

export interface DomainConfig {
  domain: string;
  actualDomain?: string;
  globalPath: string;
  projects: ProjectConfig[];
  monitoringPath?: string;
  domainType?: string;
}

export interface ValSyncConfig {
  domains: DomainConfig[];
}

export interface OutputFileStatus {
  name: string;
  path: string;
  relative_path: string;
  category: string;
  is_folder: boolean;
  exists: boolean;
  modified: string | null;
  size: number | null;
  item_count: number | null;
  created_by: string;
}

export interface OutputStatusResult {
  domain: string;
  global_path: string;
  outputs: OutputFileStatus[];
}

export interface SyncAllDomainsProgress {
  current: number;
  total: number;
  currentDomain: string;
  completed: string[];
  failed: string[];
  isRunning: boolean;
}

// ============================================================
// Query keys
// ============================================================

export const valSyncKeys = {
  all: ["val-sync"] as const,
  config: () => [...valSyncKeys.all, "config"] as const,
  domains: () => [...valSyncKeys.all, "domains"] as const,
  discover: (path: string) => [...valSyncKeys.all, "discover", path] as const,
  auth: (domain: string) => [...valSyncKeys.all, "auth", domain] as const,
  credentials: (domain: string) => [...valSyncKeys.all, "credentials", domain] as const,
  status: (domain: string) => [...valSyncKeys.all, "status", domain] as const,
  outputStatus: (domain: string) => [...valSyncKeys.all, "output-status", domain] as const,
};
