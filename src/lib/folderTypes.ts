// src/lib/folderTypes.ts
// Folder type detection for context-specific actions

export type FolderType =
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


