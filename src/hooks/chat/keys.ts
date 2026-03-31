// Chat module query keys

export const chatKeys = {
  all: ["chat"] as const,
  threads: () => [...chatKeys.all, "threads"] as const,
  readPositions: (userId: string) => [...chatKeys.all, "read", userId] as const,
  mentions: (mentionRef: string) => [...chatKeys.all, "mentions", mentionRef] as const,
  mentionCount: (mentionRef: string) => [...chatKeys.all, "mentionCount", mentionRef] as const,
  entitySearch: (query: string) => [...chatKeys.all, "entitySearch", query] as const,
};
