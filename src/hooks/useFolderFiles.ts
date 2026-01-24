// src/hooks/useFolderFiles.ts
// Hook to fetch files in a folder, sorted by modified time

import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export interface FolderFile {
  name: string;
  path: string;
  is_directory: boolean;
  size: number;
  modified: string | null;
  title: string | null;
  summary: string | null;
}

/**
 * Fetch files in a folder, sorted by modified time (most recent first).
 * For markdown files, includes title and summary from frontmatter.
 */
export function useFolderFiles(folderPath: string | null, limit: number = 20) {
  return useQuery({
    queryKey: ["folder-files", folderPath, limit],
    queryFn: async () => {
      if (!folderPath) return [];
      return invoke<FolderFile[]>("get_folder_files", {
        path: folderPath,
        limit,
      });
    },
    enabled: !!folderPath,
    staleTime: 30000, // 30 seconds
  });
}
