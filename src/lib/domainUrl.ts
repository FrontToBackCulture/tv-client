// src/lib/domainUrl.ts
// Utilities for generating VAL domain URLs from file paths
//
// URL patterns match the actual VAL platform routes (val-react):
//   Dashboard:  /dashboard/{category}/{id}        e.g. /dashboard/private/100
//   Query:      /admin/querybuilder/{id}           e.g. /admin/querybuilder/100
//   Workflow:   /workflow/detail/{id}              e.g. /workflow/detail/10034
//   Table:      /workspace/default/{s}/{z}/{p}/{t} e.g. /workspace/default/2/562/232/custom_tbl_232_430

/**
 * Extract domain name from a file path
 * Matches paths like: /domains/{env}/{domain}/... or /domains/{env}/{domain}
 */
export function extractDomainFromPath(path: string): string | null {
  const match = path.match(/\/domains\/[^/]+\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Extract artifact folder name from path based on directory prefix.
 * e.g., extractArtifactFolder("/path/to/dashboards/dashboard_123", "dashboard_") → "dashboard_123"
 */
function extractArtifactFolder(path: string, prefix: string): string | null {
  const regex = new RegExp(`(${prefix}[^/]+)`);
  const match = path.match(regex);
  return match ? match[1] : null;
}

/**
 * Extract table name from path (strips table_ prefix).
 * e.g., /data_models/table_custom_tbl_1_1 → "custom_tbl_1_1"
 */
function extractTableName(path: string): string | null {
  const match = path.match(/\/data_models\/table_([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Extract numeric ID from a folder name.
 * e.g., "workflow_10034" → "10034", "dashboard_100" → "100", "query_50" → "50"
 */
function extractNumericId(folderName: string, prefix: string): string | null {
  const regex = new RegExp(`^${prefix}(\\d+)$`);
  const match = folderName.match(regex);
  return match ? match[1] : null;
}

/**
 * Artifact type detected from path
 */
export type ArtifactType = 'dashboard' | 'query' | 'workflow' | 'data-model' | 'domain' | null;

/**
 * Detect artifact type from path
 */
export function detectArtifactType(path: string): ArtifactType {
  if (path.includes('/dashboards/') || path.includes('dashboard_')) {
    return 'dashboard';
  }
  if (path.includes('/queries/') || path.includes('query_')) {
    return 'query';
  }
  if (path.includes('/workflows/') || path.includes('workflow_')) {
    return 'workflow';
  }
  if (path.includes('/data_models/') || path.includes('/data-models/')) {
    return 'data-model';
  }
  if (extractDomainFromPath(path)) {
    return 'domain';
  }
  return null;
}

/**
 * Build VAL domain URL based on file path and artifact type.
 *
 * Note: For dashboards, this uses a default category of "private" since
 * the category isn't available from the path alone. The backfill script
 * reads definition.json for the correct category. For tables, the full
 * workspace URL requires all_tables.json data — this function returns
 * null for tables (the backfill script handles it properly).
 */
export function buildDomainUrl(path: string): string | null {
  const domainName = extractDomainFromPath(path);
  if (!domainName) {
    return null;
  }

  const baseUrl = `https://${domainName}.thinkval.io`;

  // Dashboard — /dashboard/{category}/{id}
  const dashboardFolder = extractArtifactFolder(path, 'dashboard_');
  if (dashboardFolder) {
    const id = extractNumericId(dashboardFolder, 'dashboard_');
    // Default to "private" category — backfill reads actual category from definition.json
    return id ? `${baseUrl}/dashboard/private/${id}` : baseUrl;
  }

  // Query — /admin/querybuilder/{id}
  const queryFolder = extractArtifactFolder(path, 'query_');
  if (queryFolder) {
    const id = extractNumericId(queryFolder, 'query_');
    return id ? `${baseUrl}/admin/querybuilder/${id}` : baseUrl;
  }

  // Workflow — /workflow/detail/{id}
  const workflowFolder = extractArtifactFolder(path, 'workflow_');
  if (workflowFolder) {
    const id = extractNumericId(workflowFolder, 'workflow_');
    return id ? `${baseUrl}/workflow/detail/${id}` : baseUrl;
  }

  // Data model (table) — needs all_tables.json for full workspace URL.
  // Return null here; the resourceUrl should be set by the backfill script
  // which has access to the table tree data.
  const tableName = extractTableName(path);
  if (tableName) {
    return null;
  }

  // Default to domain home
  return baseUrl;
}

/**
 * Get a human-readable label for the domain link
 */
export function getDomainLinkLabel(path: string): string {
  const artifactType = detectArtifactType(path);
  const domainName = extractDomainFromPath(path);

  if (!domainName) return '';

  switch (artifactType) {
    case 'dashboard':
      return `Open dashboard in ${domainName}`;
    case 'query':
      return `Open query in ${domainName}`;
    case 'workflow':
      return `Open workflow in ${domainName}`;
    case 'data-model':
      return `Open table in ${domainName}`;
    case 'domain':
      return `Open ${domainName} VAL`;
    default:
      return `Open ${domainName} VAL`;
  }
}
