// AI package management hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "../../lib/supabase";
import { skillKeys } from "../skills/keys";

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
      skills: string[];
    }) =>
      invoke<AiPackageResult>("val_generate_ai_package", {
        domain: params.domain,
        skillsPath: params.skillsPath,
        skills: params.skills,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domain-ai-status"] });
    },
  });
}

/**
 * Save per-domain AI skill configuration. Writes to Supabase skills.domain
 * (the source of truth). The on-disk ai_config.json is regenerated as a
 * derived artifact during Generate Package.
 */
export function useSaveDomainAiConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      domain,
      skills,
    }: {
      domain: string;
      skills: string[];
    }): Promise<{ added: string[]; removed: string[] }> => {
      const { data: currentRows, error: readErr } = await supabase
        .from("skills")
        .select("slug, domain")
        .contains("domain", [domain]);
      if (readErr) throw new Error(`Failed to read current assignments: ${readErr.message}`);

      const current = new Map<string, string[]>();
      for (const r of currentRows ?? []) current.set(r.slug, r.domain ?? []);
      const desired = new Set(skills);

      const toAdd = [...desired].filter((s) => !current.has(s));
      const toRemove = [...current.keys()].filter((s) => !desired.has(s));

      for (const slug of toAdd) {
        const { data: row, error } = await supabase
          .from("skills")
          .select("domain")
          .eq("slug", slug)
          .maybeSingle();
        if (error) throw new Error(`Failed to read skill ${slug}: ${error.message}`);
        if (!row) continue;
        const next = Array.from(new Set([...(row.domain ?? []), domain])).sort();
        const { error: updErr } = await supabase
          .from("skills")
          .update({ domain: next })
          .eq("slug", slug);
        if (updErr) throw new Error(`Failed to assign ${slug} → ${domain}: ${updErr.message}`);
      }

      for (const slug of toRemove) {
        const next = (current.get(slug) ?? []).filter((d) => d !== domain);
        const { error: updErr } = await supabase
          .from("skills")
          .update({ domain: next })
          .eq("slug", slug);
        if (updErr) throw new Error(`Failed to unassign ${slug} from ${domain}: ${updErr.message}`);
      }

      return { added: toAdd, removed: toRemove };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: skillKeys.byDomain(vars.domain) });
      qc.invalidateQueries({ queryKey: skillKeys.all });
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
