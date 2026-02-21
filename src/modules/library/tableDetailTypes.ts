// Shared types and helpers for TableDetailPreview components

export interface GridRowData {
  daysSinceCreated: number | null;
  daysSinceUpdate: number | null;
  rowCount: number | null;
  dataSource: string | null;
  dataCategory: string | null;
  dataSubCategory: string | null;
  usageStatus: string | null;
  action: string | null;
  space: string | null;
  dataType: string | null;
  suggestedName: string | null;
  summaryShort: string | null;
  summaryFull: string | null;
  tags: string | null;
  sourceSystem: string | null;
}

export interface TableDetailPreviewProps {
  tablePath: string;
  tableName: string;
  rowData?: GridRowData | null;
  onClose: () => void;
  onNavigate?: (path: string) => void;
  onFieldChange?: (field: string, value: string | number | null) => void;
  onSaveBeforeGenerate?: () => Promise<void>;
  onSyncToGrid?: () => void;
}

export interface TableDetails {
  meta?: {
    tableName: string;
    displayName?: string;
    space?: string;
    zone?: string;
    tableType?: string;
    dataSource?: string;
    generatedAt?: string;
  };
  health?: {
    score?: number;
    status?: string;
    rowCount?: string | number;
    daysSinceCreated?: number | null;
    daysSinceUpdate?: number | null;
    freshnessColumn?: string | null;
    freshnessColumnName?: string | null;
  };
  coverage?: {
    earliest?: string | null;
    latest?: string | null;
    firstCreated?: string | null;
    lastCreated?: string | null;
    totalRecords?: number | null;
  };
  columns?: {
    system?: Array<{ name: string; column: string; type: string }>;
    data?: Array<{ name: string; column: string; type: string }>;
    custom?: Array<{ name: string; column: string; type: string }>;
    calculated?: Array<{
      name: string;
      column: string;
      type: string;
      ruleType?: string;
      lookupTable?: { tableName: string; displayName: string; aggType?: string; relation?: string } | null;
      rules?: Record<string, unknown> | null;
    }>;
  };
  relationships?: {
    sourceWorkflow?: {
      id: string;
      name: string;
      description?: string;
    } | null;
    downstreamWorkflows?: Array<{
      id: string;
      name: string;
      targetTable?: { tableName: string; displayName: string } | null;
    }>;
    relatedTables?: Array<{
      tableName: string;
      displayName: string;
      relationshipType: string;
      fieldCount: number;
      fields?: Array<{
        fieldName: string;
        ruleType: string;
        lookupColumn?: string | null;
        refColumn?: string | null;
        returnColumn?: string | null;
      }>;
    }>;
    dependencies?: Array<{
      type: string;
      id: string;
      name: string;
    }>;
    workflows?: Array<{
      id: number;
      name: string;
      relationship: string;
      scheduled: boolean;
      cronExpression?: string | null;
      effectiveCronExpression?: string | null;
      isChildWorkflow?: boolean;
      parentWorkflowId?: number | null;
      parentWorkflowName?: string | null;
      lastRunStatus?: string | null;
      lastRunAt?: string | null;
      updatedDate?: string | null;
    }>;
    queries?: Array<{
      id: number;
      dsid?: number | string | null;
      name: string;
      updatedDate?: string | null;
    }>;
    dashboards?: Array<{
      id: number;
      name: string;
      updatedDate?: string | null;
      queryIds?: number[];
    }>;
  };
}

export interface TableSample {
  rows?: Array<Record<string, unknown>>;
  meta?: {
    tableName?: string;
    sampledAt?: string;
    rowCount?: number;
    totalRowCount?: number;
    requestedRows?: number;
    orderBy?: string;
    orderDirection?: string;
    orderSource?: string;
    queryError?: string | null;
  };
  columns?: Array<{ name: string; column: string; type: string }>;
  columnStats?: Record<string, {
    type?: string;
    displayName?: string;
    distinctCount?: number;
    isCategorical?: boolean;
    distinctValues?: string[];
  }>;
}

export interface TableAnalysis {
  meta?: {
    tableName?: string;
    displayName?: string;
    analyzedAt?: string;
    model?: string;
  };
  classification?: {
    dataType?: string;
    confidence?: string;
    reasoning?: string;
  };
  dataCategory?: string;
  dataSubCategory?: string;
  dataSource?: string;
  sourceSystem?: string;
  usageStatus?: string;
  action?: string;
  tags?: string;
  suggestedName?: string;
  summary?: {
    short?: string;
    full?: string;
  };
  useCases?: {
    operational?: string[];
    strategic?: string[];
  };
  columnDescriptions?: Record<string, string>;
}

export type TabType = "overview" | "details" | "sample";

export function extractDomainFromPath(path: string): string | null {
  const match = path.match(/\/domains\/(production|staging|demo|templates)\/([^/]+)/);
  return match ? match[2] : null;
}

export function getValUrl(path: string, tableId: string): string | null {
  const domain = extractDomainFromPath(path);
  if (!domain) return null;
  return `https://${domain}.thinkval.io/data-models/${tableId}`;
}

export function formatRelativeTimeShort(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-SG", { month: "short", day: "numeric" });
  } catch {
    return null;
  }
}
