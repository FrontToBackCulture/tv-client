// Skills query keys for react-query

export const skillKeys = {
  all: ["skills"] as const,
  list: (filters?: { status?: string; target?: string; category?: string }) =>
    [...skillKeys.all, "list", filters] as const,
  detail: (slug: string) => [...skillKeys.all, "detail", slug] as const,
};
