// src/lib/folderTypes.ts
// Folder type detection for context-specific actions

import { FOLDER_CONFIG_DEFAULTS } from "./folderConfig";

export type FolderType =
  | "client"
  | "client-root"
  | "bot"
  | "email"
  | "notion"
  | "default";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Detect folder type from path for showing context-specific actions
 */
export function detectFolderType(path: string, clientsFolder = FOLDER_CONFIG_DEFAULTS.clients): FolderType {
  const escaped = escapeRegex(clientsFolder);

  // Client folder (e.g., /3_Clients/by_industry/fnb/koi)
  if (path.match(new RegExp(`\\/${escaped}\\/[^/]+\\/[^/]+\\/[^/]+$`))) {
    return "client";
  }

  // Client root (e.g., /3_Clients or /3_Clients/by_industry)
  if (path.match(new RegExp(`\\/${escaped}(\\/[^/]+)?$`))) {
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


