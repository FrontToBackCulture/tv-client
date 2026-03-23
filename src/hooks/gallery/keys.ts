// Skill library query keys for react-query

export const skillLibraryKeys = {
  all: ["skill-library"] as const,
  list: (filters?: { published?: boolean; featured?: boolean; category?: string; type?: string; solution?: string }) =>
    [...skillLibraryKeys.all, "list", filters] as const,
  detail: (id: string) => [...skillLibraryKeys.all, "detail", id] as const,
  bySkill: (slug: string, fileName: string) =>
    [...skillLibraryKeys.all, "by-skill", slug, fileName] as const,
};

// Legacy aliases
export const reportSkillKeys = skillLibraryKeys;
