// src/modules/skills/useSkillRegistry.ts
// Hook to read and manage the central skill registry from _skills/registry.json

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useKnowledgePaths, useFolderConfig } from "../../hooks/useKnowledgePaths";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SkillCategory {
  id: string;
  label: string;
  order?: number;
  parent?: string;
}

export interface SkillDistribution {
  path: string;
  type: string;
}

export interface SkillEntry {
  name: string;
  description: string;
  category: string;
  target: "bot" | "platform" | "both";
  status: "active" | "inactive" | "deprecated" | "test" | "review" | "draft";
  command?: string;
  domain?: string;
  verified?: boolean;
  rating?: number;
  last_audited?: string;
  owner?: string;
  gallery_pinned?: boolean;
  gallery_order?: number;
  has_demo?: boolean;
  has_examples?: boolean;
  has_deck?: boolean;
  has_guide?: boolean;
  distributions: SkillDistribution[];
}

export interface SkillRegistry {
  version: number;
  updated: string;
  categories: SkillCategory[];
  skills: Record<string, SkillEntry>;
}

export interface SkillDriftStatus {
  slug: string;
  distribution_path: string;
  status: "in_sync" | "drifted" | "not_distributed" | "missing";
  source_hash: string;
  target_hash: string;
  source_modified: string;
  target_modified: string;
}

export interface SkillInitResult {
  skills_created: number;
  bot_skills: number;
  platform_skills: number;
  errors: string[];
}

export interface BotInfo {
  name: string;
  label: string;
  skills_path: string;
  has_skills_dir: boolean;
}

export interface SkillModInfo {
  slug: string;
  last_modified: string;
  file_count: number;
}

export interface DiffLine {
  kind: "add" | "remove" | "context";
  content: string;
}

export interface DiffHunk {
  source_start: number;
  target_start: number;
  lines: DiffLine[];
}

export interface FileDiffEntry {
  path: string;
  status: "added" | "removed" | "modified" | "unchanged";
  source_size: number;
  target_size: number;
  hunks?: DiffHunk[];
}

export interface SkillDiffResult {
  slug: string;
  distribution_path: string;
  drift_status: string;
  files: FileDiffEntry[];
  summary: string;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useSkillRegistry() {
  const paths = useKnowledgePaths();
  const registryPath = paths
    ? `${paths.skills}/registry.json`
    : null;

  return useQuery({
    queryKey: ["skill-registry", registryPath],
    queryFn: async (): Promise<SkillRegistry> => {
      if (!registryPath) throw new Error("No repository");
      const raw = await invoke<string>("read_file", { path: registryPath });
      return JSON.parse(raw);
    },
    enabled: !!registryPath,
    staleTime: 10_000,
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export function useSkillInit() {
  const queryClient = useQueryClient();
  const folderConfig = useFolderConfig();

  return useMutation({
    mutationFn: async () => {
      return invoke<SkillInitResult>("skill_init", { skillsFolder: folderConfig.skills });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skill-registry"] });
    },
  });
}

export function useSkillDistribute() {
  const queryClient = useQueryClient();
  const folderConfig = useFolderConfig();

  return useMutation({
    mutationFn: async (slug: string) => {
      return invoke<SkillDriftStatus[]>("skill_distribute", { slug, skillsFolder: folderConfig.skills });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skill-drift"] });
    },
  });
}

export function useSkillCheck() {
  const folderConfig = useFolderConfig();

  return useMutation({
    mutationFn: async (slug: string) => {
      return invoke<SkillDriftStatus[]>("skill_check", { slug, skillsFolder: folderConfig.skills });
    },
  });
}

export function useSkillCheckAll() {
  const folderConfig = useFolderConfig();

  return useQuery({
    queryKey: ["skill-drift"],
    queryFn: async () => {
      console.log("[DEBUG] skill_check_all: invoking...");
      try {
        const result = await invoke<SkillDriftStatus[]>("skill_check_all", { skillsFolder: folderConfig.skills });
        console.log("[DEBUG] skill_check_all: got", result?.length, "results", result);
        return result;
      } catch (e) {
        console.error("[DEBUG] skill_check_all: ERROR", e);
        throw e;
      }
    },
    staleTime: 30_000,
  });
}

export function useSkillDiff() {
  const folderConfig = useFolderConfig();

  return useMutation({
    mutationFn: async ({ slug, targetPath }: { slug: string; targetPath: string }) => {
      return invoke<SkillDiffResult>("skill_diff", { slug, targetPath, skillsFolder: folderConfig.skills });
    },
  });
}

export function useSkillPull() {
  const queryClient = useQueryClient();
  const folderConfig = useFolderConfig();

  return useMutation({
    mutationFn: async ({ slug, targetPath }: { slug: string; targetPath: string }) => {
      return invoke<SkillDriftStatus>("skill_pull", { slug, targetPath, skillsFolder: folderConfig.skills });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skill-drift"] });
      queryClient.invalidateQueries({ queryKey: ["skill-registry"] });
    },
  });
}

export function useSkillRegistryUpdate() {
  const paths = useKnowledgePaths();
  const queryClient = useQueryClient();

  const registryPath = paths
    ? `${paths.skills}/registry.json`
    : null;

  return useMutation({
    mutationFn: async (registry: SkillRegistry) => {
      if (!paths) throw new Error("No repository");
      const path = `${paths.skills}/registry.json`;
      const content = JSON.stringify(registry, null, 2);
      await invoke("write_file", { path, content });
      return registry;
    },
    onMutate: async (newRegistry) => {
      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ["skill-registry"] });
      // Optimistically update to the new value
      if (registryPath) {
        queryClient.setQueryData(["skill-registry", registryPath], newRegistry);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skill-registry"] });
    },
  });
}

// ─── Bot discovery ───────────────────────────────────────────────────────────

export function useSkillListBots() {
  return useQuery({
    queryKey: ["skill-bots"],
    queryFn: async () => {
      return invoke<BotInfo[]>("skill_list_bots");
    },
    staleTime: 60_000,
  });
}

// ─── Targeted distribution ───────────────────────────────────────────────────

export function useSkillDistributeTo() {
  const queryClient = useQueryClient();
  const folderConfig = useFolderConfig();

  return useMutation({
    mutationFn: async ({
      slug,
      targetPath,
      distType,
    }: {
      slug: string;
      targetPath: string;
      distType: "bot" | "platform";
    }) => {
      return invoke<SkillDriftStatus>("skill_distribute_to", {
        slug,
        targetPath,
        distType,
        skillsFolder: folderConfig.skills,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skill-drift"] });
      queryClient.invalidateQueries({ queryKey: ["skill-registry"] });
    },
  });
}

// ─── Skill summary (modification info) ──────────────────────────────────────

export function useSkillSummary() {
  const folderConfig = useFolderConfig();

  return useQuery({
    queryKey: ["skill-summary"],
    queryFn: async () => {
      return invoke<SkillModInfo[]>("skill_summary", { skillsFolder: folderConfig.skills });
    },
    staleTime: 30_000,
  });
}

// ─── Skill examples (report gallery) ────────────────────────────────────────

export interface SkillExample {
  slug: string;
  skill_name: string;
  file_name: string;
  file_path: string;
  modified: string;
}

export function useSkillExamples() {
  const folderConfig = useFolderConfig();

  return useQuery({
    queryKey: ["skill-examples"],
    queryFn: async () => {
      return invoke<SkillExample[]>("skill_list_examples", { skillsFolder: folderConfig.skills });
    },
    staleTime: 60_000,
  });
}
