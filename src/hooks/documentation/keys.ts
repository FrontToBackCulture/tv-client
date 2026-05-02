// src/hooks/documentation/keys.ts

export const documentationKeys = {
  all: ["documentation"] as const,
  sections: () => [...documentationKeys.all, "sections"] as const,
  pages: () => [...documentationKeys.all, "pages"] as const,
  pagesBySection: (sectionId: string) =>
    [...documentationKeys.pages(), "by-section", sectionId] as const,
  page: (sectionSlug: string, pageSlug: string) =>
    [...documentationKeys.pages(), sectionSlug, pageSlug] as const,
};
