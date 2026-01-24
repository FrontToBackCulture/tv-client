// src/hooks/useSearch.ts
// React hooks for search operations via Tauri IPC

import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";

// Types matching Rust models
export interface SearchResult {
  name: string;
  path: string;
  is_directory: boolean;
  size: number | null;
  match_type: "filename" | "content";
  preview: string | null;
  line_number: number | null;
}

// Generic invoke wrapper
async function tauriInvoke<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    console.error(`Tauri command ${command} failed:`, error);
    throw error;
  }
}

// Search files by filename
export function useFileSearch(
  root: string | undefined,
  query: string,
  options?: {
    extensions?: string[];
    maxResults?: number;
    enabled?: boolean;
  }
) {
  const { extensions, maxResults = 100, enabled = true } = options || {};

  return useQuery({
    queryKey: ["searchFiles", root, query, extensions, maxResults],
    queryFn: () =>
      tauriInvoke<SearchResult[]>("search_files", {
        root,
        query,
        extensions: extensions || null,
        max_results: maxResults,
      }),
    enabled: enabled && !!root && query.length >= 2,
    staleTime: 1000 * 60, // 1 minute
  });
}

// Search file content (full-text)
export function useContentSearch(
  root: string | undefined,
  query: string,
  options?: {
    extensions?: string[];
    maxResults?: number;
    enabled?: boolean;
  }
) {
  const { extensions, maxResults = 50, enabled = true } = options || {};

  return useQuery({
    queryKey: ["searchContent", root, query, extensions, maxResults],
    queryFn: () =>
      tauriInvoke<SearchResult[]>("search_content", {
        root,
        query,
        extensions: extensions || null,
        max_results: maxResults,
      }),
    enabled: enabled && !!root && query.length >= 3,
    staleTime: 1000 * 60, // 1 minute
  });
}

// Combined search hook for both filename and content
export function useSearch(
  root: string | undefined,
  query: string,
  options?: {
    searchType?: "filename" | "content" | "both";
    extensions?: string[];
    maxResults?: number;
    enabled?: boolean;
  }
) {
  const { searchType = "both", extensions, maxResults = 50, enabled = true } = options || {};

  const fileSearch = useFileSearch(root, query, {
    extensions,
    maxResults,
    enabled: enabled && (searchType === "filename" || searchType === "both"),
  });

  const contentSearch = useContentSearch(root, query, {
    extensions,
    maxResults,
    enabled: enabled && (searchType === "content" || searchType === "both"),
  });

  // Combine results
  const isLoading = fileSearch.isLoading || contentSearch.isLoading;
  const isError = fileSearch.isError || contentSearch.isError;

  const results: SearchResult[] = [];
  if (fileSearch.data) {
    results.push(...fileSearch.data);
  }
  if (contentSearch.data) {
    // Add content results, avoiding duplicates by path
    const existingPaths = new Set(results.map((r) => r.path));
    for (const result of contentSearch.data) {
      if (!existingPaths.has(result.path)) {
        results.push(result);
      }
    }
  }

  return {
    results,
    isLoading,
    isError,
    error: fileSearch.error || contentSearch.error,
    fileResults: fileSearch.data || [],
    contentResults: contentSearch.data || [],
  };
}

// Build search index (for future tantivy integration)
export function useIndexDirectory() {
  return {
    index: async (root: string) => {
      await tauriInvoke<void>("index_directory", { root });
    },
  };
}
