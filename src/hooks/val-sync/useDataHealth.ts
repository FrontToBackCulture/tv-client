// src/hooks/val-sync/useDataHealth.ts
// Data health monitoring — reads entity schemas from domain model to find
// tables with freshness_column + health-entity tagged field, then runs coverage SQL

import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useReadFile } from "../useFiles";
import type { SqlExecuteResult } from "./useValSql";

// ============================================================
// Types
// ============================================================

/** Optional per-domain overrides (thresholds, extra SQL filters) */
export interface DataHealthConfig {
  freshness_thresholds?: { green_days: number; amber_days: number };
  extra_filters?: Record<string, string>;
}

interface SchemaField {
  name: string;
  column: string;
  type: string;
  group: string | null;
  is_key: boolean;
  is_categorical: boolean;
  tags?: string[];
}

interface SchemaFile {
  table_name: string;
  display_name: string;
  freshness_column?: string | null;
  fields: SchemaField[];
}

interface DomainsFile {
  table_name: string;
  display_name: string;
  domains: { domain: string; status: string }[];
}

export interface MonitoredTable {
  table_id: string;
  label: string;
  date_column: string;
  entity_column: string;
  entity_label: string;
  extra_filter?: string;
}

export interface OutletCoverage {
  entity: string;
  earliest: string;
  latest: string;
  day_count: number;
  recent_days: number;
  avg_per_week: number;
  recent_per_week: number;
  cadence_status: "ok" | "warning" | "drop";
  freshness: "green" | "amber" | "red";
  days_stale: number;
}

export interface SourceResult {
  table_id: string;
  label: string;
  outlets: OutletCoverage[];
  error?: string;
}

// ============================================================
// Helpers
// ============================================================

function computeFreshness(
  latestDate: string,
  thresholds: { green_days: number; amber_days: number },
): { freshness: "green" | "amber" | "red"; days_stale: number } {
  const latest = new Date(latestDate);
  const now = new Date();
  latest.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const days_stale = Math.floor((now.getTime() - latest.getTime()) / (1000 * 60 * 60 * 24));
  let freshness: "green" | "amber" | "red";
  if (days_stale <= thresholds.green_days) freshness = "green";
  else if (days_stale <= thresholds.amber_days) freshness = "amber";
  else freshness = "red";
  return { freshness, days_stale };
}

function tryParseJson<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ============================================================
// Hook: Read optional data-health-config.json (thresholds only)
// ============================================================

export function useDataHealthConfig(globalPath: string | null) {
  const configPath = globalPath ? `${globalPath}/data-health-config.json` : undefined;
  const configQuery = useReadFile(configPath);

  const config = useMemo(
    () => tryParseJson<DataHealthConfig>(configQuery.data),
    [configQuery.data],
  );

  return {
    config,
    isLoading: configQuery.isLoading,
  };
}

// ============================================================
// Rust-backed: scan entity schemas for health-monitored tables
// ============================================================

interface HealthEntity {
  table_name: string;
  display_name: string;
  entity_name: string;
  model_name: string;
  freshness_column: string;
  entity_column: string;
  entity_field_name: string;
}

/**
 * Scan all entity schemas under entitiesPath.
 * For each schema that has freshness_column + a field tagged "health-entity",
 * check domains.json to see if `domain` is active.
 * Returns the list of tables to monitor.
 *
 * This runs in JS (no Rust command needed) using file reads.
 */
function useHealthEntities(entitiesPath: string | null, domain: string | null) {
  return useQuery({
    queryKey: ["health-entities", entitiesPath, domain],
    queryFn: async (): Promise<HealthEntity[]> => {
      if (!entitiesPath || !domain) return [];

      // List entity directories
      const entities = await invoke<{ name: string; path: string; is_directory: boolean }[]>(
        "list_directory",
        { path: entitiesPath },
      );

      const results: HealthEntity[] = [];

      for (const entity of entities) {
        if (!entity.is_directory) continue;

        // List model subdirectories
        const models = await invoke<{ name: string; path: string; is_directory: boolean }[]>(
          "list_directory",
          { path: entity.path },
        );

        for (const model of models) {
          if (!model.is_directory) continue;

          // Try reading schema.json
          let schemaRaw: string;
          try {
            schemaRaw = await invoke<string>("read_file", {
              path: `${model.path}/schema.json`,
            });
          } catch {
            continue; // No schema.json
          }

          const schema = tryParseJson<SchemaFile>(schemaRaw);
          if (!schema?.freshness_column || !schema.table_name) continue;

          // Find field tagged "health-entity"
          const entityField = schema.fields.find(
            (f) => f.tags?.includes("health-entity"),
          );
          if (!entityField) continue;

          // Check domains.json to see if this domain is active
          let domainsRaw: string;
          try {
            domainsRaw = await invoke<string>("read_file", {
              path: `${model.path}/domains.json`,
            });
          } catch {
            continue; // No domains.json
          }

          const domainsFile = tryParseJson<DomainsFile>(domainsRaw);
          if (!domainsFile?.domains) continue;

          const domainEntry = domainsFile.domains.find((d) => d.domain === domain);
          if (!domainEntry || domainEntry.status === "inactive") continue;

          results.push({
            table_name: schema.table_name,
            display_name: schema.display_name,
            entity_name: entity.name,
            model_name: model.name,
            freshness_column: schema.freshness_column,
            entity_column: entityField.column,
            entity_field_name: entityField.name,
          });
        }
      }

      return results;
    },
    enabled: !!entitiesPath && !!domain,
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================================
// Hook: Compute monitored tables from entity schemas
// ============================================================

export function useMonitoredTables(
  entitiesPath: string | null,
  domain: string | null,
  config: DataHealthConfig | null,
): {
  tables: MonitoredTable[];
  isLoading: boolean;
  entityLabel: string;
} {
  const healthEntities = useHealthEntities(entitiesPath, domain);

  return useMemo(() => {
    if (!healthEntities.data || healthEntities.data.length === 0) {
      return {
        tables: [],
        isLoading: healthEntities.isLoading,
        entityLabel: "Entity",
      };
    }

    const tables: MonitoredTable[] = healthEntities.data.map((he) => ({
      table_id: he.table_name,
      label: he.display_name,
      date_column: he.freshness_column,
      entity_column: he.entity_column,
      entity_label: he.entity_field_name,
      extra_filter: config?.extra_filters?.[he.table_name],
    }));

    tables.sort((a, b) => a.label.localeCompare(b.label));

    // Use the first entity label as the shared label
    const entityLabel = tables[0]?.entity_label ?? "Entity";

    return { tables, isLoading: false, entityLabel };
  }, [healthEntities.data, healthEntities.isLoading, config]);
}

// ============================================================
// Hook: Run all coverage queries
// ============================================================

const DEFAULT_THRESHOLDS = { green_days: 2, amber_days: 5 };

export function useDataHealth(
  domain: string | null,
  globalPath: string | null,
  entitiesPath: string | null,
  enabled: boolean,
) {
  const { config } = useDataHealthConfig(globalPath);
  const thresholds = config?.freshness_thresholds ?? DEFAULT_THRESHOLDS;
  const { tables, isLoading: tablesLoading, entityLabel } = useMonitoredTables(entitiesPath, domain, config);

  const queryEnabled = enabled && !!domain && tables.length > 0;

  const queries = useQueries({
    queries: queryEnabled
      ? tables.map((table) => ({
          queryKey: ["data-health", domain, table.table_id] as const,
          queryFn: async (): Promise<SourceResult> => {
            const filterClauses: string[] = [];
            if (table.extra_filter) filterClauses.push(table.extra_filter);

            const whereClause = filterClauses.length > 0 ? `\nWHERE ${filterClauses.join("\n  AND ")}` : "";
            const sql = `SELECT ${table.entity_column} AS entity,
  MIN(CAST(${table.date_column} AS DATE)) AS earliest,
  MAX(CAST(${table.date_column} AS DATE)) AS latest,
  COUNT(DISTINCT CAST(${table.date_column} AS DATE)) AS day_count,
  COUNT(DISTINCT CASE WHEN CAST(${table.date_column} AS DATE) >= CURRENT_DATE - 28 THEN CAST(${table.date_column} AS DATE) END) AS recent_days
FROM ${table.table_id}${whereClause}
GROUP BY ${table.entity_column}
ORDER BY ${table.entity_column}`;

            try {
              const result = await invoke<SqlExecuteResult>("val_execute_sql", {
                domain,
                sql,
                limit: null,
              });

              if (result.error) {
                return { table_id: table.table_id, label: table.label, outlets: [], error: result.error };
              }

              const outlets: OutletCoverage[] = result.data.map((row) => {
                const latest = String(row.latest ?? "");
                const earliest = String(row.earliest ?? "");
                const { freshness, days_stale } = latest
                  ? computeFreshness(latest, thresholds)
                  : { freshness: "red" as const, days_stale: 999 };

                const day_count = Number(row.day_count ?? 0);
                const recent_days = Number(row.recent_days ?? 0);

                // Compute weekly cadence: historical vs recent 4 weeks
                const e = new Date(earliest);
                const l = new Date(latest);
                const span_weeks = Math.max(1, (l.getTime() - e.getTime()) / (1000 * 60 * 60 * 24 * 7));
                const avg_per_week = Math.round((day_count / span_weeks) * 10) / 10;
                const recent_per_week = Math.round((recent_days / 4) * 10) / 10;

                // Flag if recent cadence dropped significantly vs historical
                let cadence_status: "ok" | "warning" | "drop" = "ok";
                if (avg_per_week > 0) {
                  const ratio = recent_per_week / avg_per_week;
                  if (ratio < 0.5) cadence_status = "drop";
                  else if (ratio < 0.75) cadence_status = "warning";
                }

                return {
                  entity: String(row.entity ?? ""),
                  earliest,
                  latest,
                  day_count,
                  recent_days,
                  avg_per_week,
                  recent_per_week,
                  cadence_status,
                  freshness,
                  days_stale,
                };
              });

              return { table_id: table.table_id, label: table.label, outlets };
            } catch (err) {
              return {
                table_id: table.table_id,
                label: table.label,
                outlets: [],
                error: String(err),
              };
            }
          },
          refetchInterval: 5 * 60 * 1000,
          staleTime: 4 * 60 * 1000,
          retry: 1,
        }))
      : [],
  });

  const results = queries.map((q) => q.data).filter(Boolean) as SourceResult[];
  const isLoading = tablesLoading || queries.some((q) => q.isLoading);
  const isFetching = queries.some((q) => q.isFetching);
  const timestamps = queries.map((q) => q.dataUpdatedAt).filter(Boolean);
  const lastFetchedAt = timestamps.length > 0 ? Math.max(...timestamps) : 0;

  const refetchAll = () => {
    for (const q of queries) q.refetch();
  };

  return {
    results,
    tables,
    thresholds,
    entityLabel,
    isLoading,
    isFetching,
    lastFetchedAt,
    refetchAll,
    hasConfig: true, // Always available if entities exist
  };
}
