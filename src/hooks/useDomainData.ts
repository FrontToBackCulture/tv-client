// src/hooks/useDomainData.ts
// Hook for fetching domain health and configuration data

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

// Types for domain health data
export interface TableHealth {
  id: string;
  tableName: string;
  displayName: string;
  space: string;
  zone: string;
  path: string;
  tableType: "static" | "transactional";
  stats: {
    tableName: string;
    rowCount: string;
    error: string | null;
  };
  freshness: {
    daysSinceUpdate: number | null;
    error: string | null;
  };
  dependencies: Array<{
    type: "workflow" | "query" | "dashboard";
    id: string;
    name: string;
  }>;
}

export interface WorkflowHealth {
  id: number;
  name: string;
  cronExpression: string | null;
  isScheduled: boolean;
  isChildWorkflow: boolean;
  parentWorkflowId: number | null;
  parentWorkflowName: string | null;
  latestRunStatus: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  lastRun: {
    date: string;
    status: string;
  } | null;
  lastSuccessfulRun: {
    date: string;
  } | null;
  daysSinceSuccess: number | null;
  health: {
    score: number | null;
    status: {
      level: "healthy" | "warning" | "critical" | "skipped";
      emoji: string;
      description: string;
    };
    issues: string[];
  };
}

export interface DomainHealthData {
  domain: string;
  timestamp: string;
  totalTables: number;
  analyzedTables: number;
  staticTables: number;
  transactionalTables: number;
  tables: TableHealth[];
}

export interface DomainWorkflowData {
  domain: string;
  timestamp: string;
  totalWorkflows: number;
  analyzedWorkflows: number;
  workflows: WorkflowHealth[];
}

// Dashboard health types
export interface DashboardHealth {
  id: number;
  name: string;
  category: string;
  createdDate: string;
  updatedDate: string;
  metrics: {
    totalSessions: number;
    uniqueUsers: number;
    totalPageViews: number;
    daysWithActivity: number;
    sessionsPerMonth: number;
    firstSession: string | null;
    lastSession: string | null;
    daysSinceLastSession: number | null;
  };
  health: {
    score: number | null;
    status: {
      level: "critical" | "active" | "occasional" | "attention" | "declining" | "unused";
      emoji: string;
      description: string;
    };
    issues: string[];
    frequencyTier: string;
    recencyTier: string;
  };
}

export interface DomainDashboardData {
  domain: string;
  timestamp: string;
  lookbackDays: number;
  totalDashboards: number;
  dashboardsWithSessions: number;
  dashboards: DashboardHealth[];
  summary?: {
    critical: number;
    active: number;
    occasional: number;
    attention: number;
    declining: number;
    unused: number;
  };
}

// Query health types
export interface QueryHealth {
  id: number;
  name: string;
  createdDate: string;
  updatedDate: string;
  dashboardCount: number;
  dashboards: Array<{
    id: number;
    name: string;
    category: string;
    widgetType: string;
    health: string;
  }>;
  health: {
    score: number | null;
    status: {
      level: "essential" | "active" | "at_risk" | "orphaned" | "standalone";
      emoji: string;
      description: string;
    };
    issues: string[];
  };
}

export interface DomainQueryData {
  domain: string;
  timestamp: string;
  totalQueries: number;
  queriesInDashboards: number;
  standaloneQueries: number;
  hasDashboardHealth: boolean;
  queries: QueryHealth[];
  summary?: {
    essential: number;
    active: number;
    at_risk: number;
    orphaned: number;
    standalone: number;
  };
}

// Sync metadata types
export interface SyncHistoryEntry {
  timestamp: string;
  type: string;
  artifactType?: string;
  extractionType?: string;
  generationType?: string;
  count?: number;
  status: string;
}

export interface ArtifactData {
  count: number;
  lastSync: string | null;
  status: "success" | "partial" | "failed" | "never";
}

export interface SyncMetadata {
  domain: string;
  created: string;
  artifacts: {
    fields: ArtifactData;
    queries: ArtifactData;
    workflows: ArtifactData;
    dashboards: ArtifactData;
    tables: ArtifactData;
  };
  extractions: {
    queryDefinitions: ArtifactData;
    workflowDefinitions: ArtifactData;
    workflowSQL: ArtifactData;
    dashboardDefinitions: ArtifactData;
    tableDefinitions: ArtifactData;
  };
  lastFullSync: string | null;
  syncHistory: SyncHistoryEntry[];
}

export interface DomainData {
  health: DomainHealthData | null;
  workflows: DomainWorkflowData | null;
  dashboards: DomainDashboardData | null;
  queries: DomainQueryData | null;
  syncMetadata: SyncMetadata | null;
  loading: boolean;
  error: string | null;
}

export function useDomainData(domainPath: string): DomainData {
  const [health, setHealth] = useState<DomainHealthData | null>(null);
  const [workflows, setWorkflows] = useState<DomainWorkflowData | null>(null);
  const [dashboards, setDashboards] = useState<DomainDashboardData | null>(null);
  const [queries, setQueries] = useState<DomainQueryData | null>(null);
  const [syncMetadata, setSyncMetadata] = useState<SyncMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        // Try to load health check results
        const healthPath = `${domainPath}/health-check-results.json`;
        try {
          const healthContent = await invoke<string>("read_file", { path: healthPath });
          setHealth(JSON.parse(healthContent));
        } catch {
          // Health file might not exist
          setHealth(null);
        }

        // Try to load workflow health results
        const workflowPath = `${domainPath}/workflow-health-results.json`;
        try {
          const workflowContent = await invoke<string>("read_file", { path: workflowPath });
          setWorkflows(JSON.parse(workflowContent));
        } catch {
          // Workflow file might not exist
          setWorkflows(null);
        }

        // Try to load dashboard health results
        const dashboardPath = `${domainPath}/dashboard-health-results.json`;
        try {
          const dashboardContent = await invoke<string>("read_file", { path: dashboardPath });
          setDashboards(JSON.parse(dashboardContent));
        } catch {
          // Dashboard file might not exist
          setDashboards(null);
        }

        // Try to load query health results
        const queryPath = `${domainPath}/query-health-results.json`;
        try {
          const queryContent = await invoke<string>("read_file", { path: queryPath });
          setQueries(JSON.parse(queryContent));
        } catch {
          // Query file might not exist
          setQueries(null);
        }

        // Try to load sync metadata
        const syncPath = `${domainPath}/sync-metadata.json`;
        try {
          const syncContent = await invoke<string>("read_file", { path: syncPath });
          setSyncMetadata(JSON.parse(syncContent));
        } catch {
          // Sync metadata might not exist
          setSyncMetadata(null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load domain data");
      } finally {
        setLoading(false);
      }
    }

    if (domainPath) {
      loadData();
    }
  }, [domainPath]);

  return { health, workflows, dashboards, queries, syncMetadata, loading, error };
}
