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

export interface DomainData {
  health: DomainHealthData | null;
  workflows: DomainWorkflowData | null;
  loading: boolean;
  error: string | null;
}

export function useDomainData(domainPath: string): DomainData {
  const [health, setHealth] = useState<DomainHealthData | null>(null);
  const [workflows, setWorkflows] = useState<DomainWorkflowData | null>(null);
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

  return { health, workflows, loading, error };
}
