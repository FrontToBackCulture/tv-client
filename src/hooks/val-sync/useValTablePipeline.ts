// Table pipeline steps + category library hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { valSyncKeys } from "./types";

// ============================================================
// Types
// ============================================================

export interface TablePipelineResult {
  domain: string;
  table_name: string;
  step: string;
  status: string;
  file_path: string | null;
  message: string;
  duration_ms: number;
}

export interface TableInfo {
  id: string;
  display_name: string;
}

export interface CategoryEntry {
  value: string;
  count: number;
  domains: string[];
}

export interface CategoryLibrary {
  data_types: CategoryEntry[];
  data_categories: CategoryEntry[];
  data_sub_categories: CategoryEntry[];
  usage_statuses: CategoryEntry[];
  actions: CategoryEntry[];
  data_sources: CategoryEntry[];
  total_tables_scanned: number;
  domains_scanned: string[];
}

// ============================================================
// Pipeline Step Hooks
// ============================================================

/** Step 1: Prepare table overview (definition_details.json) */
export function usePrepareTableOverview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      domain,
      tableName,
      overwrite = false,
      skipSql = false,
      freshnessColumn,
    }: {
      domain: string;
      tableName: string;
      overwrite?: boolean;
      skipSql?: boolean;
      freshnessColumn?: string;
    }) =>
      invoke<TablePipelineResult>("val_prepare_table_overview", {
        domain,
        tableName,
        overwrite,
        skipSql,
        freshnessColumn: freshnessColumn ?? null,
      }),
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.outputStatus(domain) });
    },
  });
}

/** Step 2: Sample table data (definition_sample.json) */
export function useSampleTableData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      domain,
      tableName,
      rowCount = 20,
      orderBy,
      overwrite = false,
    }: {
      domain: string;
      tableName: string;
      rowCount?: number;
      orderBy?: string;
      overwrite?: boolean;
    }) =>
      invoke<TablePipelineResult>("val_sample_table_data", {
        domain,
        tableName,
        rowCount,
        orderBy: orderBy ?? null,
        overwrite,
      }),
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.outputStatus(domain) });
    },
  });
}

/** Step 2b: Fetch categorical values from full table (definition_categorical.json) */
export function useFetchCategoricalValues() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      domain,
      tableName,
      overwrite = false,
      schemaPath,
    }: {
      domain: string;
      tableName: string;
      overwrite?: boolean;
      schemaPath?: string;
    }) =>
      invoke<TablePipelineResult>("val_fetch_categorical_values", {
        domain,
        tableName,
        overwrite,
        schemaPath: schemaPath ?? null,
      }),
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.outputStatus(domain) });
    },
  });
}

/** Step 3a: Describe table data with AI (naming, summary, useCases, columnDescriptions) */
export function useDescribeTableData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      domain,
      tableName,
      overwrite = false,
    }: {
      domain: string;
      tableName: string;
      overwrite?: boolean;
    }) =>
      invoke<TablePipelineResult>("val_describe_table_data", {
        domain,
        tableName,
        overwrite,
      }),
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.outputStatus(domain) });
    },
  });
}

/** Step 3b: Classify table data with AI (dataType, category, tags, usageStatus) */
export function useClassifyTableData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      domain,
      tableName,
      overwrite = false,
    }: {
      domain: string;
      tableName: string;
      overwrite?: boolean;
    }) =>
      invoke<TablePipelineResult>("val_classify_table_data", {
        domain,
        tableName,
        overwrite,
      }),
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.outputStatus(domain) });
    },
  });
}

/** Step 3 (legacy): Analyze table data with AI - runs both describe + classify */
export function useAnalyzeTableData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      domain,
      tableName,
      overwrite = false,
    }: {
      domain: string;
      tableName: string;
      overwrite?: boolean;
    }) =>
      invoke<TablePipelineResult>("val_analyze_table_data", {
        domain,
        tableName,
        overwrite,
      }),
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.outputStatus(domain) });
    },
  });
}

/** Step 4: Extract table calculated fields (definition_calculated_fields.json) */
export function useExtractTableCalcFields() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      domain,
      tableName,
      overwrite = false,
    }: {
      domain: string;
      tableName: string;
      overwrite?: boolean;
    }) =>
      invoke<TablePipelineResult>("val_extract_table_calc_fields", {
        domain,
        tableName,
        overwrite,
      }),
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.outputStatus(domain) });
    },
  });
}

/** Step 5: Generate table overview markdown (overview.md) */
export function useGenerateTableOverviewMd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      domain,
      tableName,
      overwrite = false,
    }: {
      domain: string;
      tableName: string;
      overwrite?: boolean;
    }) =>
      invoke<TablePipelineResult>("val_generate_table_overview_md", {
        domain,
        tableName,
        overwrite,
      }),
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.outputStatus(domain) });
    },
  });
}

/** List available tables in a domain's data_models folder */
export function useListDomainTables(domain: string | undefined) {
  return useQuery({
    queryKey: ["val-domain-tables", domain],
    queryFn: () => invoke<TableInfo[]>("val_list_domain_tables", { domain: domain! }),
    enabled: !!domain,
    staleTime: 60_000, // Cache for 1 minute
  });
}

// ============================================================
// Category Library
// ============================================================

/** Scan all definition_analysis.json files to extract unique category values */
export function useScanCategoryLibrary() {
  return useQuery({
    queryKey: ["val-category-library"],
    queryFn: () => invoke<CategoryLibrary>("val_scan_category_library"),
    staleTime: 5 * 60_000, // Cache for 5 minutes
  });
}
