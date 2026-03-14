// src/hooks/useKnowledgePaths.ts
// Resolved absolute paths for each knowledge base folder

import { useMemo } from "react";
import { useRepository } from "../stores/repositoryStore";
import { useFolderConfigStore } from "../stores/folderConfigStore";
import type { FolderConfig } from "../lib/folderConfig";

export interface KnowledgePaths {
  base: string;
  platform: string;
  company: string;
  solutions: string;
  clients: string;
  sales: string;
  customerSuccess: string;
  marketing: string;
  knowledge: string;
  working: string;
  skills: string;
}

export function useKnowledgePaths(): KnowledgePaths | null {
  const { activeRepository } = useRepository();
  const config = useFolderConfigStore((s) => s.config);

  return useMemo(() => {
    if (!activeRepository) return null;
    const base = activeRepository.path;
    return {
      base,
      platform: `${base}/${config.platform}`,
      company: `${base}/${config.company}`,
      solutions: `${base}/${config.solutions}`,
      clients: `${base}/${config.clients}`,
      sales: `${base}/${config.sales}`,
      customerSuccess: `${base}/${config.customerSuccess}`,
      marketing: `${base}/${config.marketing}`,
      knowledge: `${base}/${config.knowledge}`,
      working: `${base}/${config.working}`,
      skills: `${base}/${config.skills}`,
    };
  }, [activeRepository, config]);
}

export function useFolderConfig(): FolderConfig {
  return useFolderConfigStore((s) => s.config);
}
