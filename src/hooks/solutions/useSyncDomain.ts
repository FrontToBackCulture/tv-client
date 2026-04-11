import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { solutionKeys } from "./keys";

export interface SyncJob {
  id: string;
  instance_id: string | null;
  domain: string;
  source_domain: string;
  system_id: string | null;
  system_type: string | null;
  resource_type: "tables" | "workflows" | "dashboards";
  resource_ids: string[];
  status: "pending" | "queued" | "syncing" | "done" | "error";
  sync_uuid: string | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface TriggerSyncParams {
  source: string;
  target: string;
  instance_id?: string;
  system_id?: string;
  system_type?: string;
  resource_type: "tables" | "workflows" | "dashboards";
  resource_ids: string[];
  space_ids?: number[];
  zone_ids?: number[];
  override_creator?: number;
  include_queries?: boolean;
}

/**
 * Trigger a sync from source domain to target domain via Edge Function.
 */
export function useTriggerSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: TriggerSyncParams) => {
      console.log("[useTriggerSync] calling sync-domain with:", params);
      const { data, error } = await supabase.functions.invoke("sync-domain", {
        body: params,
      });

      console.log("[useTriggerSync] response:", { data, error });
      if (error) {
        // Try to get the actual error body
        const msg = typeof error === "object" && "context" in error
          ? JSON.stringify(error)
          : error.message;
        throw new Error(`Sync failed: ${msg}`);
      }
      if (data?.error) throw new Error(data.error);

      return data as { job_id: string; sync_uuid: string; status: string };
    },
    onSuccess: (_data, params) => {
      // Invalidate sync jobs query so the UI refreshes
      queryClient.invalidateQueries({
        queryKey: [...solutionKeys.all, "sync-jobs", params.target],
      });
    },
  });
}

/**
 * Fetch all sync jobs for a domain, with optional polling.
 */
export function useSyncJobs(domain: string | null, poll = false) {
  return useQuery({
    queryKey: [...solutionKeys.all, "sync-jobs", domain],
    queryFn: async (): Promise<SyncJob[]> => {
      if (!domain) return [];
      const { data, error } = await supabase
        .from("solution_sync_jobs")
        .select("*")
        .eq("domain", domain)
        .order("created_at", { ascending: false });

      if (error) throw new Error(`Failed to fetch sync jobs: ${error.message}`);
      return (data ?? []) as SyncJob[];
    },
    enabled: !!domain,
    refetchInterval: poll ? 3000 : false, // Poll every 3s when active syncs
  });
}

/**
 * Check sync status for active jobs via val-services status endpoint.
 * Updates the sync job in Supabase when complete.
 */
export function usePollSyncStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (jobId: string) => {
      // Get the job to check
      const { data: job, error } = await supabase
        .from("solution_sync_jobs")
        .select("*")
        .eq("id", jobId)
        .single();

      if (error || !job) throw new Error("Job not found");
      if (job.status === "done" || job.status === "error") return job;

      // For now, we'll check via the Edge Function in a future iteration.
      // The val-services status endpoint requires the val-services JWT,
      // so it should also go through an Edge Function.
      return job;
    },
    onSuccess: (job) => {
      if (job) {
        queryClient.invalidateQueries({
          queryKey: [...solutionKeys.all, "sync-jobs", job.domain],
        });
      }
    },
  });
}

/**
 * Helper: Build sync requests from scope + valConfig.
 * Takes scope data (POS, PMs, banks) and the template's valConfig,
 * returns an array of TriggerSyncParams for each system.
 */
export function buildSyncRequestsFromScope(
  scope: { pos: string[]; paymentMethods: string[]; banks: string[] },
  valConfig: any,
  target: string,
  instanceId?: string,
  resourceType: "tables" | "workflows" | "dashboards" = "tables"
): TriggerSyncParams[] {
  const requests: TriggerSyncParams[] = [];
  const systems: any[] = valConfig.systems || [];
  const base = valConfig.base;

  // 1. Base resources (always)
  if (resourceType === "tables" && base?.masterTables) {
    // `masterTables` is a mix of plain string IDs (e.g. "TA-POS": "custom_tbl_133_166")
    // and richer objects with metadata (e.g. outlets: { table: "...", columns: {...} }).
    // We must handle BOTH shapes — previously strings were silently dropped, which
    // meant only 3 of 11 base tables on the AR template ever made it into the sync job.
    const tableIds: string[] = [];
    const collect = (v: any): void => {
      if (!v) return;
      if (typeof v === "string") {
        // Allow comma-separated ids in case a base table has multiple sources.
        for (const id of v.split(",").map((s) => s.trim()).filter(Boolean)) {
          tableIds.push(id);
        }
      } else if (v.table && typeof v.table === "string") {
        tableIds.push(v.table);
      } else if (typeof v === "object") {
        // Nested map (e.g. bankAccounts, or a group of {label: {table: ...}}).
        for (const sub of Object.values(v)) collect(sub);
      }
    };
    for (const val of Object.values(base.masterTables)) collect(val);
    if (tableIds.length) {
      requests.push({
        source: "lab",
        target,
        instance_id: instanceId,
        system_id: "base",
        system_type: "base",
        resource_type: "tables",
        resource_ids: tableIds,
        space_ids: base.spaces || [],
        zone_ids: base.zones || [],
      });
    }
  }

  if (resourceType === "workflows" && base?.workflows) {
    const wfIds: string[] = [];
    for (const ids of Object.values(base.workflows) as number[][]) {
      wfIds.push(...ids.map(String));
    }
    if (wfIds.length) {
      requests.push({
        source: "lab",
        target,
        instance_id: instanceId,
        system_id: "base",
        system_type: "base",
        resource_type: "workflows",
        resource_ids: wfIds,
      });
    }
  }

  if (resourceType === "dashboards" && base?.dashboards?.length) {
    requests.push({
      source: "lab",
      target,
      instance_id: instanceId,
      system_id: "base",
      system_type: "base",
      resource_type: "dashboards",
      resource_ids: base.dashboards.map(String),
    });
  }

  // 2. Per-system resources from scope
  const scopeSystems = [
    ...scope.pos.map((name) => ({ name, scopeType: "pos" })),
    ...scope.paymentMethods.map((name) => ({ name, scopeType: "payment" })),
    ...scope.banks.map((name) => ({ name, scopeType: "bank" })),
  ];

  for (const { name } of scopeSystems) {
    const sys = systems.find((s: any) => s.id === name);
    if (!sys) continue;

    if (resourceType === "tables") {
      const tableIds: string[] = [];
      for (const val of Object.values(sys.tables || {}) as string[]) {
        if (val) {
          // Handle comma-separated table IDs
          tableIds.push(...val.split(",").map((t: string) => t.trim()).filter(Boolean));
        }
      }
      if (tableIds.length) {
        requests.push({
          source: "lab",
          target,
          instance_id: instanceId,
          system_id: sys.id,
          system_type: sys.type,
          resource_type: "tables",
          resource_ids: tableIds,
          space_ids: sys.spaces || [],
          zone_ids: sys.zones || [],
        });
      }
    }

    if (resourceType === "workflows") {
      const wfIds: string[] = [];
      for (const ids of Object.values(sys.workflows || {}) as number[][]) {
        if (Array.isArray(ids)) wfIds.push(...ids.map(String));
      }
      if (wfIds.length) {
        requests.push({
          source: "lab",
          target,
          instance_id: instanceId,
          system_id: sys.id,
          system_type: sys.type,
          resource_type: "workflows",
          resource_ids: wfIds,
        });
      }
    }

    if (resourceType === "dashboards") {
      if (sys.dashboards?.length) {
        requests.push({
          source: "lab",
          target,
          instance_id: instanceId,
          system_id: sys.id,
          system_type: sys.type,
          resource_type: "dashboards",
          resource_ids: sys.dashboards.map(String),
        });
      }
    }
  }

  return requests;
}
