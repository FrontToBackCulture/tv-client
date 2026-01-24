// src/lib/domainUrl.ts
// Utilities for generating VAL domain URLs from file paths

/**
 * Extract domain name from a file path
 * Matches paths like: /domains/{env}/{domain}/... or /domains/{env}/{domain}
 */
export function extractDomainFromPath(path: string): string | null {
  const match = path.match(/\/domains\/[^/]+\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Extract artifact ID from path based on prefix
 * e.g., extractArtifactId("/path/to/dashboard_123/...", "dashboard_") returns "123"
 */
function extractArtifactId(path: string, prefix: string): string | null {
  const regex = new RegExp(`${prefix}(\\d+)`);
  const match = path.match(regex);
  return match ? match[1] : null;
}

/**
 * Extract table name from path
 * Matches data-models folder structure
 */
function extractTableName(path: string): string | null {
  const match = path.match(/\/data-models\/([^/]+)/);
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
  if (path.includes('/data-models/')) {
    return 'data-model';
  }
  if (extractDomainFromPath(path)) {
    return 'domain';
  }
  return null;
}

/**
 * Build VAL domain URL based on file path and artifact type
 */
export function buildDomainUrl(path: string): string | null {
  const domainName = extractDomainFromPath(path);
  if (!domainName) {
    return null;
  }

  const baseUrl = `https://${domainName}.thinkval.io`;

  // Check for dashboard
  const dashboardId = extractArtifactId(path, 'dashboard_');
  if (dashboardId) {
    return `${baseUrl}/dashboard/private/${dashboardId}`;
  }

  // Check for query
  const queryId = extractArtifactId(path, 'query_');
  if (queryId) {
    return `${baseUrl}/admin/querybuilder/${queryId}`;
  }

  // Check for workflow
  const workflowId = extractArtifactId(path, 'workflow_');
  if (workflowId) {
    return `${baseUrl}/workflow/detail/${workflowId}`;
  }

  // Check for data model (table)
  // Note: Full table URL requires metadata (space, zone, parentId)
  // For now, just return domain home - can enhance later with metadata lookup
  const tableName = extractTableName(path);
  if (tableName) {
    // Could enhance to read definition.json for full URL
    return baseUrl;
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
      return `Open ${domainName} VAL`;
    case 'domain':
      return `Open ${domainName} VAL`;
    default:
      return `Open ${domainName} VAL`;
  }
}
