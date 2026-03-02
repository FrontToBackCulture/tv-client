// src/hooks/useBotSkills.ts
// Discover bots and load their skills from _team/*/bot-*/skills/

import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useRepository } from "../stores/repositoryStore";

interface DirEntry {
  name: string;
  path: string;
  is_directory: boolean;
  size: number;
  modified: string | null;
}

export interface BotInfo {
  name: string;
  path: string;
  skillsPath: string;
}

export interface BotSkill {
  slug: string;
  title: string;
  summary: string;
  tools: string;
  category: string;
  skillPath: string;
}

/**
 * Discover bots by listing _team/ dirs and looking for bot-* /skills/ folders.
 */
export function useBots() {
  const { activeRepository } = useRepository();
  const teamPath = activeRepository
    ? `${activeRepository.path}/_team`
    : null;

  return useQuery({
    queryKey: ["bots", teamPath],
    queryFn: async () => {
      if (!teamPath) return [];

      const teamEntries = await invoke<DirEntry[]>("list_directory", {
        path: teamPath,
      });
      const personDirs = teamEntries.filter(
        (e) => e.is_directory && !e.name.startsWith(".")
      );

      const bots: BotInfo[] = [];

      for (const person of personDirs) {
        // List contents of each person's folder looking for bot-* dirs
        let entries: DirEntry[];
        try {
          entries = await invoke<DirEntry[]>("list_directory", {
            path: person.path,
          });
        } catch {
          continue;
        }

        const botDirs = entries.filter(
          (e) => e.is_directory && e.name.startsWith("bot-")
        );

        for (const botDir of botDirs) {
          // Check if skills/ folder exists
          try {
            const skillsPath = `${botDir.path}/skills`;
            await invoke<DirEntry[]>("list_directory", { path: skillsPath });
            bots.push({
              name: person.name,
              path: botDir.path,
              skillsPath,
            });
          } catch {
            // No skills folder — skip
          }
        }
      }

      return bots.sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: !!teamPath,
    staleTime: 60_000,
  });
}

/**
 * Load skills for a given bot's skills path.
 * Reads SKILL.md frontmatter from each skill folder.
 */
export function useBotSkills(skillsPath: string | null) {
  return useQuery({
    queryKey: ["bot-skills", skillsPath],
    queryFn: async () => {
      if (!skillsPath) return [];

      const entries = await invoke<DirEntry[]>("list_directory", {
        path: skillsPath,
      });
      const dirs = entries.filter((e) => e.is_directory && !e.name.startsWith("."));

      const skills: BotSkill[] = [];

      for (const dir of dirs) {
        const skillMdPath = `${dir.path}/SKILL.md`;
        try {
          const raw = await invoke<string>("read_file", { path: skillMdPath });
          // Read first 30 lines for frontmatter
          const lines = raw.split("\n").slice(0, 30);
          const parsed = parseFrontmatter(lines);

          skills.push({
            slug: dir.name,
            title: parsed.title || parsed.name || dir.name,
            summary: parsed.summary || parsed.description || "",
            tools: parsed.tools || "",
            category: parsed.category || "",
            skillPath: skillMdPath,
          });
        } catch {
          // No SKILL.md — skip
        }
      }

      return skills.sort((a, b) => a.title.localeCompare(b.title));
    },
    enabled: !!skillsPath,
    staleTime: 30_000,
  });
}

/** Parse YAML frontmatter from lines (between --- delimiters) */
function parseFrontmatter(lines: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  let inFrontmatter = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "---") {
      if (inFrontmatter) break; // end of frontmatter
      inFrontmatter = true;
      continue;
    }
    if (!inFrontmatter) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let value = trimmed.slice(colonIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }

  return result;
}
