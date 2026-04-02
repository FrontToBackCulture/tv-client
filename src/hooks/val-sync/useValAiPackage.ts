// AI package management hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

// ============================================================
// Types
// ============================================================

export interface SkillDomainDeployment {
  domain: string;
  domain_type: string;
  configured: boolean;
  generated: boolean;
  on_s3: boolean;
  /** "in_sync", "drifted", "missing", "not_configured" */
  drift_status: string;
  local_file_count: number;
}

export interface SkillDeploymentResult {
  skill: string;
  master_file_count: number;
  domains: SkillDomainDeployment[];
}

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
      skillsPath: string;
      templatesPath: string;
      skills: string[];
    }) =>
      invoke<AiPackageResult>("val_generate_ai_package", {
        domain: params.domain,
        skillsPath: params.skillsPath,
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

// ============================================================
// AI Table Coverage
// ============================================================

export interface TableEntry {
  table_id: string;
  display_name: string;
  space: string;
  zone: string;
  /** "skill" = directly referenced in skill files, "workflow" = used by feeding workflows */
  source: string;
}

export interface AiTableCoverageResult {
  ai_tables: TableEntry[];
  unused_tables: TableEntry[];
}

/** Get AI table coverage for a domain — tables used by AI skills vs unused domain tables */
export function useAiTableCoverage() {
  return useMutation({
    mutationFn: (params: { domain: string; skillsPath: string }) =>
      invoke<AiTableCoverageResult>("val_ai_table_coverage", {
        domain: params.domain,
        skillsPath: params.skillsPath,
      }),
  });
}

/** Get deployment status for a skill across all domains (configured, generated, S3, drift) */
export function useSkillDeploymentStatus(
  skill: string | null,
  skillsPath: string | null
) {
  return useQuery({
    queryKey: ["skill-deployment-status", skill],
    queryFn: () =>
      invoke<SkillDeploymentResult>("val_skill_deployment_status", {
        skill: skill!,
        skillsPath: skillsPath!,
      }),
    enabled: !!skill && !!skillsPath,
    staleTime: 30_000,
  });
}
