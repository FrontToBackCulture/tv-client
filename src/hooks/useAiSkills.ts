// src/hooks/useAiSkills.ts
// Create AI skill — writes to _skills/ and registry.json

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useKnowledgePaths } from "./useKnowledgePaths";

/**
 * Create a new AI skill (folder + SKILL.md + registry entry).
 */
export function useCreateAiSkill() {
  const paths = useKnowledgePaths();
  const queryClient = useQueryClient();
  const skillsPath = paths ? paths.skills : null;

  return useMutation({
    mutationFn: async ({ slug, name, description }: { slug: string; name: string; description: string }) => {
      if (!skillsPath) throw new Error("No repository");
      const dirPath = `${skillsPath}/${slug}`;
      await invoke("create_directory", { path: dirPath });
      // Create SKILL.md with frontmatter
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
      // Update registry.json
      const raw = await invoke<string>("read_file", { path: `${skillsPath}/registry.json` });
      const registry = JSON.parse(raw);
      registry.skills[slug] = {
        name,
        description: description || "",
        category: "platform",
        target: "platform",
        status: "draft",
        distributions: [],
      };
      // Sort skills alphabetically
      registry.skills = Object.fromEntries(
        Object.entries(registry.skills).sort(([a], [b]) => a.localeCompare(b))
      );
      registry.updated = new Date().toISOString();
      await invoke("write_file", {
        path: `${skillsPath}/registry.json`,
        content: JSON.stringify(registry, null, 2),
      });
      return { slug, name, description };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-skills"] });
      queryClient.invalidateQueries({ queryKey: ["skill-registry"] });
    },
  });
}
