// MCP Tools query keys for react-query

export const mcpToolKeys = {
  all: ["mcp_tools"] as const,
  list: (filters?: { status?: string; category?: string; verified?: boolean }) =>
    [...mcpToolKeys.all, "list", filters] as const,
  detail: (slug: string) => [...mcpToolKeys.all, "detail", slug] as const,
};
