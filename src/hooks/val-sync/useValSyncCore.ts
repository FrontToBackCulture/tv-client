// Core VAL Sync hooks: config, domain discovery, auth, single-domain sync, output status

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import {
  valSyncKeys,
  type DomainSummary,
  type DiscoveredDomain,
  type AuthResult,
  type SyncResult,
  type SyncAllResult,
  type SyncMetadata,
  type ValCredentials,
  type ValSyncConfig,
  type OutputStatusResult,
} from "./types";

// ============================================================
// Queries
// ============================================================

/** List all configured VAL domains */
export function useValDomains() {
  return useQuery({
    queryKey: valSyncKeys.domains(),
    queryFn: () => invoke<DomainSummary[]>("val_sync_list_domains"),
    staleTime: 30_000,
  });
}

/** Discover domains from file system at {repo}/0_Platform/domains/ */
export function useDiscoverDomains(domainsPath: string | null) {
  return useQuery({
    queryKey: valSyncKeys.discover(domainsPath ?? ""),
    queryFn: () => invoke<DiscoveredDomain[]>("val_sync_discover_domains", { domainsPath }),
    enabled: !!domainsPath,
    staleTime: 60_000,
  });
}

/** Check auth status for a domain (no login attempt) */
export function useValAuth(domain: string | null) {
  return useQuery({
    queryKey: valSyncKeys.auth(domain ?? ""),
    queryFn: () => invoke<AuthResult>("val_sync_check_auth", { domain }),
    enabled: !!domain,
    staleTime: 60_000,
  });
}

/** Get sync metadata/status for a domain */
export function useValSyncStatus(domain: string | null) {
  return useQuery({
    queryKey: valSyncKeys.status(domain ?? ""),
    queryFn: () => invoke<SyncMetadata>("val_sync_get_status", { domain }),
    enabled: !!domain,
    staleTime: 10_000,
  });
}

/** Get output file/folder status for a domain */
export function useValOutputStatus(domain: string | null) {
  return useQuery({
    queryKey: valSyncKeys.outputStatus(domain ?? ""),
    queryFn: () => invoke<OutputStatusResult>("val_get_output_status", { domain }),
    enabled: !!domain,
    staleTime: 30_000,
  });
}

/** Check if credentials exist for a domain */
export function useValCredentials(domain: string | null) {
  return useQuery({
    queryKey: valSyncKeys.credentials(domain ?? ""),
    queryFn: async (): Promise<ValCredentials> => {
      const [email, password] = await invoke<[string | null, string | null]>(
        "settings_get_val_credentials",
        { domain }
      );
      return {
        email,
        password,
        has_credentials: email !== null && password !== null,
      };
    },
    enabled: !!domain,
    staleTime: 30_000,
  });
}

// ============================================================
// Mutations
// ============================================================

/** Login to a domain using stored credentials */
export function useValLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (domain: string) => invoke<AuthResult>("val_sync_login", { domain }),
    onSuccess: (_data, domain) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.auth(domain) });
    },
  });
}

/** Save VAL credentials for a domain */
export function useSetValCredentials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ domain, email, password }: { domain: string; email: string; password: string }) => {
      await invoke("settings_set_key", { keyName: `val_email_${domain}`, value: email });
      await invoke("settings_set_key", { keyName: `val_password_${domain}`, value: password });
    },
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.credentials(domain) });
    },
  });
}

/** Sync a single artifact type */
export function useValSyncArtifact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ domain, artifactType }: { domain: string; artifactType: string }) => {
      const cmdMap: Record<string, string> = {
        fields: "val_sync_fields",
        queries: "val_sync_queries",
        workflows: "val_sync_workflows",
        dashboards: "val_sync_dashboards",
        tables: "val_sync_tables",
        "calc-fields": "val_sync_calc_fields",
      };
      const cmd = cmdMap[artifactType];
      if (!cmd) throw new Error(`Unknown artifact type: ${artifactType}`);
      return invoke<SyncResult>(cmd, { domain });
    },
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.status(domain) });
    },
  });
}

/** Full sync + extract for a domain */
export function useValSyncAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (domain: string) => invoke<SyncAllResult>("val_sync_all", { domain }),
    onSuccess: (_data, domain) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.status(domain) });
    },
  });
}

/** Import config from val-sync config.json */
export function useValImportConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filePath: string) =>
      invoke<unknown>("val_sync_import_config", { filePath, tvKnowledgePath: null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: valSyncKeys.domains() });
    },
  });
}

/** Import credentials from val-sync .env */
export function useValImportCredentials() {
  return useMutation({
    mutationFn: (envFilePath: string) =>
      invoke<string[]>("settings_import_val_credentials", { envFilePath }),
  });
}

/** Load full val-sync config */
export function useValSyncConfig() {
  return useQuery({
    queryKey: valSyncKeys.config(),
    queryFn: async () => {
      // Rust returns snake_case, we need to map to camelCase
      const raw = await invoke<{
        domains: {
          domain: string;
          actual_domain?: string;
          global_path: string;
          projects: {
            solution: string;
            use_case?: string;
            config_path?: string;
            metadata_types?: Record<string, string>;
          }[];
          monitoring_path?: string;
          domain_type?: string;
        }[];
      }>("val_sync_load_config");

      return {
        domains: raw.domains.map((d) => ({
          domain: d.domain,
          actualDomain: d.actual_domain,
          globalPath: d.global_path,
          projects: d.projects.map((p) => ({
            solution: p.solution,
            useCase: p.use_case,
            configPath: p.config_path,
            metadataTypes: p.metadata_types,
          })),
          monitoringPath: d.monitoring_path,
          domainType: d.domain_type,
        })),
      } as ValSyncConfig;
    },
    staleTime: 30_000,
  });
}

/** Update a domain's global path */
export function useUpdateDomainPath() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ domain, globalPath }: { domain: string; globalPath: string }) => {
      // Load current config
      const raw = await invoke<{
        domains: {
          domain: string;
          actual_domain?: string;
          global_path: string;
          projects: unknown[];
          monitoring_path?: string;
          domain_type?: string;
        }[];
      }>("val_sync_load_config");

      // Update the specific domain's path
      const updated = {
        domains: raw.domains.map((d) =>
          d.domain === domain ? { ...d, global_path: globalPath } : d
        ),
      };

      // Save back
      await invoke("val_sync_save_config", { config: updated });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: valSyncKeys.config() });
      qc.invalidateQueries({ queryKey: valSyncKeys.domains() });
    },
  });
}

/** Sync workflow executions for a domain */
export function useValSyncWorkflowExecutions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ domain, from, to }: { domain: string; from: string; to: string }) =>
      invoke<SyncResult>("val_sync_workflow_executions", { domain, from, to }),
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.status(domain) });
    },
  });
}

/** Sync SOD tables status for a domain */
export function useValSyncSodTablesStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ domain, date, regenerate }: { domain: string; date: string; regenerate: boolean }) =>
      invoke<SyncResult>("val_sync_sod_tables_status", { domain, date, regenerate }),
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.status(domain) });
    },
  });
}

/** Sync importer errors for a domain */
export function useValSyncImporterErrors() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ domain, from, to }: { domain: string; from: string; to: string }) =>
      invoke<SyncResult>("val_sync_importer_errors", { domain, from, to }),
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.status(domain) });
    },
  });
}

/** Sync integration errors for a domain */
export function useValSyncIntegrationErrors() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ domain, from, to }: { domain: string; from: string; to: string }) =>
      invoke<SyncResult>("val_sync_integration_errors", { domain, from, to }),
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.status(domain) });
    },
  });
}
