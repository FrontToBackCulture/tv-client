// src/hooks/useAiSkills.ts
// Create AI skill — writes to _skills/ folder and Supabase

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useKnowledgePaths } from "./useKnowledgePaths";
import { supabase } from "../lib/supabase";
import { skillKeys } from "./skills/keys";

/**
 * Create a new AI skill (folder + SKILL.md + Supabase entry).
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
      // Create entry in Supabase
      const { error } = await supabase
        .from("skills")
        .upsert({
          slug,
          name,
          description: description || "",
          category: "platform",
          target: "platform",
          status: "draft",
        }, { onConflict: "slug" });

      if (error) throw new Error(`Failed to create skill in database: ${error.message}`);
      return { slug, name, description };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: skillKeys.all });
    },
  });
}
