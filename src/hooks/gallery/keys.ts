// Gallery query keys for react-query

export const reportSkillKeys = {
  all: ["report-skills"] as const,
  list: (filters?: { published?: boolean; featured?: boolean; category?: string }) =>
    [...reportSkillKeys.all, "list", filters] as const,
  detail: (id: string) => [...reportSkillKeys.all, "detail", id] as const,
  bySkill: (slug: string, fileName: string) =>
    [...reportSkillKeys.all, "by-skill", slug, fileName] as const,
};

export const questionKeys = {
  all: ["questions"] as const,
  list: (filters?: { published?: boolean; featured?: boolean; category?: string; solution?: string }) =>
    [...questionKeys.all, "list", filters] as const,
  detail: (id: string) => [...questionKeys.all, "detail", id] as const,
};
