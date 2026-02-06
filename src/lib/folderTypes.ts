// src/lib/folderTypes.ts
// Folder type detection for context-specific actions

export type FolderType =
  | "domain"
  | "domain-root"
  | "data-models"      // data_models folder in domain
  | "table"            // individual table folder (table_custom_tbl_*)
  | "workflows-list"   // workflows folder in domain
  | "workflow"         // individual workflow folder (workflow_*)
  | "dashboards-list"  // dashboards folder in domain
  | "dashboard"        // individual dashboard folder
  | "queries-list"     // queries folder in domain
  | "query"            // individual query folder
  | "monitoring"       // monitoring folder (daily execution data)
  | "analytics"        // analytics folder
  | "client"
  | "client-root"
  | "bot"
  | "email"
  | "notion"
  | "default";

/**
 * Detect folder type from path for showing context-specific actions
 */
export function detectFolderType(path: string): FolderType {
  // Individual table folder (e.g., /data_models/table_custom_tbl_100_1057)
  if (path.match(/\/data_models\/table_[^/]+$/)) {
    return "table";
  }

  // Data models folder (e.g., /domains/production/koi/data_models)
  if (path.match(/\/domains\/(production|staging|demo|templates)\/[^/]+\/data_models$/)) {
    return "data-models";
  }

  // Individual workflow folder (e.g., /workflows/workflow_10726)
  if (path.match(/\/workflows\/workflow_[^/]+$/)) {
    return "workflow";
  }

  // Workflows list folder (e.g., /domains/production/koi/workflows)
  if (path.match(/\/domains\/(production|staging|demo|templates)\/[^/]+\/workflows$/)) {
    return "workflows-list";
  }

  // Individual dashboard folder
  if (path.match(/\/dashboards\/[^/]+$/) && path.includes("/domains/")) {
    return "dashboard";
  }

  // Dashboards list folder
  if (path.match(/\/domains\/(production|staging|demo|templates)\/[^/]+\/dashboards$/)) {
    return "dashboards-list";
  }

  // Individual query folder
  if (path.match(/\/queries\/[^/]+$/) && path.includes("/domains/")) {
    return "query";
  }

  // Queries list folder
  if (path.match(/\/domains\/(production|staging|demo|templates)\/[^/]+\/queries$/)) {
    return "queries-list";
  }

  // Monitoring folder
  if (path.match(/\/domains\/(production|staging|demo|templates)\/[^/]+\/monitoring$/)) {
    return "monitoring";
  }

  // Analytics folder
  if (path.match(/\/domains\/(production|staging|demo|templates)\/[^/]+\/analytics$/)) {
    return "analytics";
  }

  // Domain folder (e.g., /domains/production/suntec or /domains/staging/koi)
  if (path.match(/\/domains\/(production|staging|demo|templates)\/[^/]+$/)) {
    return "domain";
  }

  // Domain root (only /domains itself, not /domains/production or /domains/staging)
  // Production/staging folders are just containers - no special actions
  if (path.match(/\/domains$/)) {
    return "domain-root";
  }

  // Client folder (e.g., /3_Clients/by_industry/fnb/koi)
  if (path.match(/\/3_Clients\/[^/]+\/[^/]+\/[^/]+$/)) {
    return "client";
  }

  // Client root (e.g., /3_Clients or /3_Clients/by_industry)
  if (path.match(/\/3_Clients(\/[^/]+)?$/)) {
    return "client-root";
  }

  // Bot folder (e.g., /_team/bot-accounting-sql)
  if (path.match(/\/_team\/bot-[^/]+$/)) {
    return "bot";
  }

  // Email folder
  if (path.match(/\/emails\/[^/]+$/)) {
    return "email";
  }

  // Notion synced cards
  if (path.match(/\/_notion\/cards$/)) {
    return "notion";
  }

  return "default";
}

/**
 * Extract domain name from path
 * e.g., /domains/production/suntec -> suntec
 */
export function extractDomainName(path: string): string | null {
  const match = path.match(/\/domains\/(production|staging|demo|templates)\/([^/]+)/);
  return match ? match[2] : null;
}

/**
 * Extract client name from path
 * e.g., /3_Clients/by_industry/fnb/koi -> koi
 */
export function extractClientName(path: string): string | null {
  const match = path.match(/\/3_Clients\/[^/]+\/[^/]+\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Extract bot name from path
 * e.g., /_team/bot-accounting-sql -> accounting-sql
 */
export function extractBotName(path: string): string | null {
  const match = path.match(/\/_team\/bot-([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Check if path is within a domain
 */
export function isWithinDomain(path: string): boolean {
  return /\/domains\/(production|staging|demo|templates|demo|templates)\//.test(path);
}

/**
 * Get the domain path from any path within a domain
 */
export function getDomainPath(path: string): string | null {
  const match = path.match(/(.*\/domains\/(production|staging|demo|templates|demo|templates)\/[^/]+)/);
  return match ? match[1] : null;
}
