// Workspace query keys for react-query
export const workspaceKeys = {
  all: ["workspaces"] as const,
  list: (filters?: { status?: string; owner?: string }) =>
    [...workspaceKeys.all, "list", filters] as const,
  detail: (id: string) => [...workspaceKeys.all, "detail", id] as const,
};
