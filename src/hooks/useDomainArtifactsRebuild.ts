// src/hooks/useDomainArtifactsRebuild.ts
// Hook to rebuild domain_artifacts in Supabase from filesystem data.
// Iterates all discovered domains, loads review data (light mode), upserts to Supabase.

import { useState, useCallback } from "react";
import { loadReviewData } from "../modules/domains/reviewLoader";
import { rebuildDomainArtifacts } from "../lib/domainArtifacts";
import type { ReviewResourceType } from "../modules/domains/reviewTypes";
import type { DiscoveredDomain } from "./val-sync/types";

const RESOURCE_TYPES: ReviewResourceType[] = ["table", "query", "dashboard", "workflow"];

const RESOURCE_FOLDER: Record<ReviewResourceType, string> = {
  table: "data_models",
  query: "queries",
  dashboard: "dashboards",
  workflow: "workflows",
};

export interface RebuildProgress {
  running: boolean;
  domain: string | null;
  resourceType: ReviewResourceType | null;
  domainsCompleted: number;
  domainsTotal: number;
  totalUpserted: number;
  totalDeleted: number;
  error: string | null;
}

export function useDomainArtifactsRebuild() {
  const [progress, setProgress] = useState<RebuildProgress>({
    running: false,
    domain: null,
    resourceType: null,
    domainsCompleted: 0,
    domainsTotal: 0,
    totalUpserted: 0,
    totalDeleted: 0,
    error: null,
  });

  const rebuild = useCallback(async (domains: DiscoveredDomain[]) => {
    setProgress({
      running: true,
      domain: null,
      resourceType: null,
      domainsCompleted: 0,
      domainsTotal: domains.length,
      totalUpserted: 0,
      totalDeleted: 0,
      error: null,
    });

    let totalUpserted = 0;
    let totalDeleted = 0;

    try {
      for (let i = 0; i < domains.length; i++) {
        const domain = domains[i];

        for (const resourceType of RESOURCE_TYPES) {
          setProgress((p) => ({
            ...p,
            domain: domain.domain,
            resourceType,
            domainsCompleted: i,
          }));

          const folderPath = `${domain.global_path}/${RESOURCE_FOLDER[resourceType]}`;
          try {
            const rows = await loadReviewData(folderPath, resourceType, domain.domain, { light: true });
            const result = await rebuildDomainArtifacts(domain.domain, resourceType, rows, domain.global_path);
            totalUpserted += result.upserted;
            totalDeleted += result.deleted;
          } catch {
            // Domain might not have this folder — skip
          }
        }
      }

      setProgress((p) => ({
        ...p,
        running: false,
        domain: null,
        resourceType: null,
        domainsCompleted: domains.length,
        totalUpserted,
        totalDeleted,
      }));
    } catch (e) {
      setProgress((p) => ({
        ...p,
        running: false,
        error: e instanceof Error ? e.message : "Rebuild failed",
      }));
    }
  }, []);

  return { progress, rebuild };
}
