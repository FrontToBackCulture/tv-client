// Domain model entities + field master hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useJobsStore } from "../../stores/jobsStore";

// ============================================================
// Types
// ============================================================

export interface ModelInfo {
  name: string;
  table_name: string | null;
  display_name: string | null;
  has_schema_json: boolean;
  has_schema_md: boolean;
  has_sql: boolean;
  has_workflow: boolean;
  has_domains: boolean;
  has_categoricals: boolean;
  field_count: number | null;
  categorical_count: number | null;
  domain_count: number | null;
  active_domain_count: number | null;
  total_records: number | null;
  ai_package: boolean;
}

export interface EntityInfo {
  name: string;
  models: ModelInfo[];
}

export interface DomainModelScanResult {
  domains_found: number;
  active_domains: number;
  total_records: number;
  duration_ms: number;
  errors: string[];
}

export interface CreateSchemaResult {
  schema_path: string;
  field_count: number;
}

export interface MasterFieldEntity {
  entity: string;
  model: string;
}

export interface MasterField {
  key: string;
  field_id: number | null;
  column: string;
  name: string;
  type: string;
  group: string | null;
  is_categorical: boolean;
  description: string | null;
  tags: string[];
  entities: MasterFieldEntity[];
}

export interface FieldMasterFile {
  generated: string;
  total_fields: number;
  total_entities: number;
  fields: MasterField[];
}

// ============================================================
// Hooks
// ============================================================

/** List all documented domain model entities from the entities folder */
export function useDomainModelEntities(entitiesPath: string | null) {
  return useQuery({
    queryKey: ["domain-model-entities", entitiesPath],
    queryFn: () =>
      invoke<EntityInfo[]>("val_list_domain_model_entities", {
        entitiesPath,
      }),
    enabled: !!entitiesPath,
    staleTime: 30_000,
  });
}

/** Read a domain model JSON file (domains.json or categoricals.json) */
export function useDomainModelFile<T = unknown>(filePath: string | null) {
  return useQuery({
    queryKey: ["domain-model-file", filePath],
    queryFn: () =>
      invoke<T>("val_read_domain_model_file", { filePath }),
    enabled: !!filePath,
    staleTime: 30_000,
  });
}

/** Scan all configured domains using schema.json as source of truth */
export function useScanDomainModelTable() {
  const qc = useQueryClient();
  const addJob = useJobsStore((s) => s.addJob);
  const updateJob = useJobsStore((s) => s.updateJob);

  return useMutation({
    mutationFn: async (params: {
      schemaPath: string;
      domainTypes?: string[];
      referenceDomain?: string;
    }) => {
      const jobId = `domain-model-scan-${Date.now()}`;
      addJob({
        id: jobId,
        name: "Domain Model Scan",
        status: "running",
        message: "Scanning domains...",
      });

      try {
        const result = await invoke<DomainModelScanResult>(
          "val_scan_domain_model_table",
          {
            schemaPath: params.schemaPath,
            domainTypes: params.domainTypes ?? null,
            referenceDomain: params.referenceDomain ?? null,
          }
        );

        updateJob(jobId, {
          status: "completed",
          progress: 100,
          message: `Found ${result.domains_found} domains (${result.active_domains} active, ${result.total_records.toLocaleString()} records) in ${(result.duration_ms / 1000).toFixed(1)}s`,
        });

        return result;
      } catch (err) {
        updateJob(jobId, {
          status: "failed",
          message: `Scan failed: ${err}`,
        });
        throw err;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domain-model-entities"] });
      qc.invalidateQueries({ queryKey: ["domain-model-file"] });
    },
  });
}

/** Generate schema.md from schema.json */
export function useGenerateSchemaMd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (schemaJsonPath: string) =>
      invoke<string>("val_generate_schema_md", { schemaJsonPath }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domain-model-entities"] });
    },
  });
}

/** Enrich empty descriptions in schema.json from domain AI analysis */
export function useEnrichSchemaDescriptions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      schemaJsonPath,
      domainsBasePath,
    }: {
      schemaJsonPath: string;
      domainsBasePath: string;
    }) =>
      invoke<{ enriched: number; total_ai_descriptions: number; source_domain: string | null }>(
        "val_enrich_schema_descriptions",
        { schemaJsonPath, domainsBasePath }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domain-model-file"] });
      qc.invalidateQueries({ queryKey: ["domain-model-entities"] });
    },
  });
}

/** Create schema.json for a domain model entity from a domain's definition.json */
export function useCreateDomainModelSchema() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      definitionPath: string;
      entityName: string;
      modelName: string;
      entitiesBasePath: string;
      tableDisplayName: string;
    }) =>
      invoke<CreateSchemaResult>("val_create_domain_model_schema", {
        definitionPath: params.definitionPath,
        entityName: params.entityName,
        modelName: params.modelName,
        entitiesBasePath: params.entitiesBasePath,
        tableDisplayName: params.tableDisplayName,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domain-model-entities"] });
    },
  });
}

/** Build the field master by scanning all entity schemas and merging with existing edits */
export function useBuildFieldMaster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entitiesPath: string) =>
      invoke<FieldMasterFile>("val_build_field_master", { entitiesPath }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domain-model-file"] });
      qc.invalidateQueries({ queryKey: ["domain-model-entities"] });
    },
  });
}

/** Save the field master and propagate governed fields to all entity schemas */
export function useSaveFieldMaster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      entitiesPath,
      master,
    }: {
      entitiesPath: string;
      master: FieldMasterFile;
    }) =>
      invoke<number>("val_save_field_master", { entitiesPath, master }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domain-model-file"] });
      qc.invalidateQueries({ queryKey: ["domain-model-entities"] });
    },
  });
}
