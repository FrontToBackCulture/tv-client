// AI package management hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

// ============================================================
// Types
// ============================================================

export interface DomainAiStatus {
  domain: string;
  domain_type: string;
  global_path: string;
  has_ai_folder: boolean;
  skill_count: number;
  has_instructions: boolean;
  skill_files: string[];
  configured_skills: string[];
}

export interface AiPackageResult {
  domain: string;
  skills_copied: string[];
  instructions_generated: boolean;
  errors: string[];
}

export interface ExtractTemplatesResult {
  skills_extracted: string[];
  instructions_extracted: boolean;
}

// ============================================================
// Hooks
// ============================================================

/** List AI package status for all configured domains */
export function useListDomainAiStatus(entitiesPath?: string | null) {
  return useQuery({
    queryKey: ["domain-ai-status", entitiesPath],
    queryFn: () =>
      invoke<DomainAiStatus[]>("val_list_domain_ai_status", {
        entitiesPath: entitiesPath ?? undefined,
      }),
    staleTime: 30_000,
  });
}

/** Generate an AI package for a domain with explicit skill selection */
export function useGenerateAiPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      domain: string;
      entitiesPath: string;
      templatesPath: string;
      skills: string[];
    }) =>
      invoke<AiPackageResult>("val_generate_ai_package", {
        domain: params.domain,
        entitiesPath: params.entitiesPath,
        templatesPath: params.templatesPath,
        skills: params.skills,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domain-ai-status"] });
    },
  });
}

/** Save per-domain AI skill configuration */
export function useSaveDomainAiConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { domain: string; skills: string[] }) =>
      invoke<void>("val_save_domain_ai_config", {
        domain: params.domain,
        skills: params.skills,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domain-ai-status"] });
    },
  });
}

/** Extract templates from an existing domain's AI package */
export function useExtractAiTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      domain: string;
      templatesOutputPath: string;
    }) =>
      invoke<ExtractTemplatesResult>("val_extract_ai_templates", {
        domain: params.domain,
        templatesOutputPath: params.templatesOutputPath,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domain-ai-status"] });
    },
  });
}
