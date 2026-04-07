// Hooks for fetching VAL importer and integration errors from Supabase

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";

// ─── Types ────────────────────────────────────

export interface ValImporterError {
  id: string;
  email_id: string;
  domain: string;
  importer_name: string;
  file_name: string | null;
  error_summary: string | null;
  error_detail: string | null;
  received_at: string;
  parsed_at: string;
}

export interface ValIntegrationError {
  id: string;
  email_id: string;
  domain: string;
  connector: string;
  action: string | null;
  target_table: string | null;
  error_summary: string | null;
  triggered_by: string | null;
  triggered_at: string | null;
  received_at: string;
  parsed_at: string;
}

export interface ValWorkflowExecution {
  execution_id: string;
  domain: string;
  job_id: number;
  status: string;
  error: string | null;
  result: unknown;
  user_id: number | null;
  started_at: string;
  completed_at: string | null;
  synced_at: string;
}

export interface ValNotification {
  uuid: string;
  domain: string;
  message: string | null;
  created: string | null;
  updated: string | null;
  user_ref: string | null;
  user_name: string | null;
  status: string | null;
  action: string | null;
  table: string | null;
  table_name: string | null;
  origin: string | null;
  identifier: string | null;
  progress: number | null;
  topic: string | null;
  fail: boolean;
  error_message: string | null;
  synced_at: string;
}

export interface ValSyncRun {
  id: string;
  sync_type: string;
  started_at: string;
  completed_at: string | null;
  domains_attempted: number;
  domains_succeeded: number;
  domains_failed: number;
  total_records: number;
  status: string;
  error: string | null;
  details: Record<string, unknown> | null;
}

// ─── Query Keys ───────────────────────────────

export interface ValWorkflowDefinition {
  id: number;
  domain: string;
  name: string;
  cron_expression: string | null;
}

export const valErrorKeys = {
  all: ["val-errors"] as const,
  importerErrors: () => [...valErrorKeys.all, "importer"] as const,
  integrationErrors: () => [...valErrorKeys.all, "integration"] as const,
  executions: () => [...valErrorKeys.all, "executions"] as const,
  notifications: () => [...valErrorKeys.all, "notifications"] as const,
  workflowDefs: () => [...valErrorKeys.all, "workflow-defs"] as const,
  syncRuns: () => [...valErrorKeys.all, "sync-runs"] as const,
};

// ─── Hooks ────────────────────────────────────

export function useValImporterErrors(since?: string) {
  return useQuery({
    queryKey: [...valErrorKeys.importerErrors(), since],
    queryFn: async () => {
      let query = supabase
        .from("val_importer_errors")
        .select("*")
        .order("received_at", { ascending: false });

      if (since) {
        query = query.gte("received_at", since);
      }

      const { data, error } = await query.limit(2000);
      if (error) throw error;
      return data as ValImporterError[];
    },
    staleTime: 60_000,
  });
}

export function useValIntegrationErrors(since?: string) {
  return useQuery({
    queryKey: [...valErrorKeys.integrationErrors(), since],
    queryFn: async () => {
      let query = supabase
        .from("val_integration_errors")
        .select("*")
        .order("received_at", { ascending: false });

      if (since) {
        query = query.gte("received_at", since);
      }

      const { data, error } = await query.limit(2000);
      if (error) throw error;
      return data as ValIntegrationError[];
    },
    staleTime: 60_000,
  });
}

export function useValWorkflowDefinitions() {
  return useQuery({
    queryKey: valErrorKeys.workflowDefs(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("val_workflow_definitions")
        .select("id, domain, name, cron_expression")
        .eq("deleted", false);
      if (error) throw error;
      return data as ValWorkflowDefinition[];
    },
    staleTime: 5 * 60_000,
  });
}

async function fetchAllPaginated<T>(
  table: string,
  orderCol: string,
  since?: string,
  sinceCol?: string,
): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  let offset = 0;

  while (true) {
    let query = supabase
      .from(table)
      .select("*")
      .order(orderCol, { ascending: false })
      .range(offset, offset + PAGE - 1);

    if (since && sinceCol) {
      query = query.gte(sinceCol, since);
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;

    all.push(...(data as T[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  return all;
}

export function useValWorkflowExecutions(since?: string) {
  return useQuery({
    queryKey: [...valErrorKeys.executions(), since],
    queryFn: () => fetchAllPaginated<ValWorkflowExecution>(
      "val_workflow_executions", "started_at", since, "started_at",
    ),
    staleTime: 60_000,
  });
}

export function useValNotifications(since?: string) {
  return useQuery({
    queryKey: [...valErrorKeys.notifications(), since],
    queryFn: () => fetchAllPaginated<ValNotification>(
      "val_notifications", "created", since, "created",
    ),
    staleTime: 60_000,
  });
}

export function useValSyncRuns() {
  return useQuery({
    queryKey: valErrorKeys.syncRuns(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("val_sync_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as ValSyncRun[];
    },
    staleTime: 30_000,
  });
}
