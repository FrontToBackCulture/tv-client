// src/modules/skills/useSkillRegistry.ts
// Hook to read and manage the central skill registry from _skills/registry.json

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useRepository } from "../../stores/repositoryStore";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SkillCategory {
  id: string;
  label: string;
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
  status: "active" | "inactive" | "deprecated" | "test";
  command?: string;
  domain?: string;
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
  status: "in_sync" | "source_updated" | "target_modified" | "not_distributed" | "missing";
  source_hash: string;
  target_hash: string;
  stored_hash: string;
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

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useSkillRegistry() {
  const { activeRepository } = useRepository();
  const registryPath = activeRepository
    ? `${activeRepository.path}/_skills/registry.json`
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

  return useMutation({
    mutationFn: async () => {
      return invoke<SkillInitResult>("skill_init");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skill-registry"] });
    },
  });
}

export function useSkillDistribute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (slug: string) => {
      return invoke<SkillDriftStatus[]>("skill_distribute", { slug });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skill-drift"] });
    },
  });
}

export function useSkillCheck() {
  return useMutation({
    mutationFn: async (slug: string) => {
      return invoke<SkillDriftStatus[]>("skill_check", { slug });
    },
  });
}

export function useSkillCheckAll() {
  return useQuery({
    queryKey: ["skill-drift"],
    queryFn: async () => {
      return invoke<SkillDriftStatus[]>("skill_check_all");
    },
    staleTime: 30_000,
  });
}

export function useSkillPull() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ slug, targetPath }: { slug: string; targetPath: string }) => {
      return invoke<SkillDriftStatus>("skill_pull", { slug, targetPath });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skill-drift"] });
      queryClient.invalidateQueries({ queryKey: ["skill-registry"] });
    },
  });
}

export function useSkillRegistryUpdate() {
  const { activeRepository } = useRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (registry: SkillRegistry) => {
      if (!activeRepository) throw new Error("No repository");
      const path = `${activeRepository.path}/_skills/registry.json`;
      const content = JSON.stringify(registry, null, 2);
      await invoke("write_file", { path, content });
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
  return useQuery({
    queryKey: ["skill-summary"],
    queryFn: async () => {
      return invoke<SkillModInfo[]>("skill_summary");
    },
    staleTime: 30_000,
  });
}
