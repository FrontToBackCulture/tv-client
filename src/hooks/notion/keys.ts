// Notion module query keys

export const notionKeys = {
  all: ["notion"] as const,
  databases: () => [...notionKeys.all, "databases"] as const,
  databaseSchema: (id: string) => [...notionKeys.all, "schema", id] as const,
  configs: () => [...notionKeys.all, "configs"] as const,
  config: (id: string) => [...notionKeys.configs(), id] as const,
  preview: (dbId: string) => [...notionKeys.all, "preview", dbId] as const,
  status: () => [...notionKeys.all, "status"] as const,
};
