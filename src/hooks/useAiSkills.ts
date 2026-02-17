// src/hooks/useAiSkills.ts
// Read AI skills from 0_Platform/skills/ — each skill is a folder with skill.json

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useRepository } from "../stores/repositoryStore";

export interface AiSkillDef {
  slug: string;
  name: string;
  description: string;
  tables: string[];
}

interface SkillJson {
  name: string;
  description?: string;
  tables?: string[];
}

interface DirEntry {
  name: string;
  path: string;
  is_directory: boolean;
  size: number;
  modified: string | null;
}

/**
 * Lists all AI skills from 0_Platform/skills/.
 * Returns { slug, name, description }[] sorted by name.
 */
export function useAiSkills() {
  const { activeRepository } = useRepository();
  const skillsPath = activeRepository
    ? `${activeRepository.path}/0_Platform/skills`
    : null;

  return useQuery({
    queryKey: ["ai-skills", skillsPath],
    queryFn: async () => {
      if (!skillsPath) return [];
      const entries = await invoke<DirEntry[]>("list_directory", {
        path: skillsPath,
      });
      const dirs = entries.filter((e) => e.is_directory);
      const skills: AiSkillDef[] = [];
      for (const dir of dirs) {
        try {
          const raw = await invoke<string>("read_file", {
            path: `${dir.path}/skill.json`,
          });
          const json: SkillJson = JSON.parse(raw);
          skills.push({
            slug: dir.name,
            name: json.name || dir.name,
            description: json.description || "",
            tables: json.tables ?? [],
          });
        } catch {
          // Folder without valid skill.json — skip
        }
      }
      return skills.sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: !!skillsPath,
    staleTime: 30_000,
  });
}

/**
 * Returns just the slugs for use in skill-toggle UIs (DomainAiTab, SchemaFieldsGrid).
 */
export function useAiSkillSlugs(): string[] {
  const query = useAiSkills();
  return query.data?.map((s) => s.slug) ?? [];
}

/**
 * Create a new AI skill (folder + skill.json).
 */
export function useCreateAiSkill() {
  const { activeRepository } = useRepository();
  const queryClient = useQueryClient();
  const skillsPath = activeRepository
    ? `${activeRepository.path}/0_Platform/skills`
    : null;

  return useMutation({
    mutationFn: async ({ slug, name, description }: { slug: string; name: string; description: string }) => {
      if (!skillsPath) throw new Error("No repository");
      const dirPath = `${skillsPath}/${slug}`;
      await invoke("create_directory", { path: dirPath });
      const json: SkillJson = { name, description: description || undefined };
      await invoke("write_file", {
        path: `${dirPath}/skill.json`,
        content: JSON.stringify(json, null, 2),
      });
      // Create SKILL.md with Claude Code standard frontmatter
      const skillMd = [
        "---",
        `name: ${slug}`,
        `description: "${description || ""}"`,
        "---",
        "",
        `# ${name}`,
        "",
        `> ${description || "TODO: Add skill description"}`,
        "",
      ].join("\n");
      await invoke("write_file", {
        path: `${dirPath}/SKILL.md`,
        content: skillMd,
      });
      return { slug, name, description };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-skills"] });
    },
  });
}
