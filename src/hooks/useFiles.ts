// src/hooks/useFiles.ts
// React hooks for file system operations via Tauri IPC

import { invoke } from "@tauri-apps/api/core";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useEffect } from "react";

// Types matching Rust models
export interface FileEntry {
  name: string;
  path: string;
  is_directory: boolean;
  size: number;
  modified: string | null;
}

export interface FileInfo {
  name: string;
  path: string;
  is_directory: boolean;
  size: number;
  created: string | null;
  modified: string | null;
  extension: string | null;
}

export interface TreeNode {
  name: string;
  path: string;
  is_directory: boolean;
  children: TreeNode[] | null;
}

// Generic invoke wrapper with error handling
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

// Read file content
export function useReadFile(path: string | undefined) {
  return useQuery({
    queryKey: ["file", path],
    queryFn: () => tauriInvoke<string>("read_file", { path }),
    enabled: !!path,
  });
}

// Write file content
export function useWriteFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) =>
      tauriInvoke<void>("write_file", { path, content }),
    onSuccess: (_, { path }) => {
      // Invalidate the file cache
      queryClient.invalidateQueries({ queryKey: ["file", path] });
      // Invalidate directory listing
      const dir = path.substring(0, path.lastIndexOf("/"));
      queryClient.invalidateQueries({ queryKey: ["directory", dir] });
    },
  });
}

// Delete file or directory
export function useDeleteFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (path: string) => tauriInvoke<void>("delete_file", { path }),
    onSuccess: (_, path) => {
      queryClient.invalidateQueries({ queryKey: ["file", path] });
      const dir = path.substring(0, path.lastIndexOf("/"));
      queryClient.invalidateQueries({ queryKey: ["directory", dir] });
      queryClient.invalidateQueries({ queryKey: ["fileTree"] });
    },
  });
}

// List directory contents
export function useListDirectory(path: string | undefined) {
  return useQuery({
    queryKey: ["directory", path],
    queryFn: () => tauriInvoke<FileEntry[]>("list_directory", { path }),
    enabled: !!path,
  });
}

// Get file tree (recursive)
export function useFileTree(path?: string, maxDepth?: number) {
  return useQuery({
    queryKey: ["fileTree", path, maxDepth],
    queryFn: () =>
      tauriInvoke<TreeNode>("get_file_tree", {
        path: path || null,
        max_depth: maxDepth || 3,
      }),
  });
}

// Get file info
export function useFileInfo(path: string | undefined) {
  return useQuery({
    queryKey: ["fileInfo", path],
    queryFn: () => tauriInvoke<FileInfo>("get_file_info", { path }),
    enabled: !!path,
  });
}

// Create directory
export function useCreateDirectory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (path: string) =>
      tauriInvoke<void>("create_directory", { path }),
    onSuccess: (_, path) => {
      const dir = path.substring(0, path.lastIndexOf("/"));
      queryClient.invalidateQueries({ queryKey: ["directory", dir] });
      queryClient.invalidateQueries({ queryKey: ["fileTree"] });
    },
  });
}

// Rename file or directory
export function useRenamePath() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ oldPath, newPath }: { oldPath: string; newPath: string }) =>
      tauriInvoke<void>("rename_path", { old_path: oldPath, new_path: newPath }),
    onSuccess: (_, { oldPath, newPath }) => {
      queryClient.invalidateQueries({ queryKey: ["file", oldPath] });
      queryClient.invalidateQueries({ queryKey: ["file", newPath] });
      const dir = oldPath.substring(0, oldPath.lastIndexOf("/"));
      queryClient.invalidateQueries({ queryKey: ["directory", dir] });
      queryClient.invalidateQueries({ queryKey: ["fileTree"] });
    },
  });
}

// Load folder children on demand (for lazy-loaded tree nodes)
export function useFolderChildren(path: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["folderChildren", path],
    queryFn: async () => {
      const result = await tauriInvoke<TreeNode>("get_file_tree", {
        path,
        max_depth: 1,
      });
      return result.children || [];
    },
    enabled: !!path && enabled,
    staleTime: 0, // Always refetch when invalidated
  });
}

// Watch directory for changes
export function useWatchDirectory(
  path: string | undefined,
  onFileChange?: (paths: string[]) => void
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!path) return;

    let unlisten: UnlistenFn | undefined;

    // Start watching
    tauriInvoke<void>("watch_directory", { path }).catch(console.error);

    // Listen for file change events
    listen<string[]>("file-change", (event) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["fileTree"] });
      queryClient.invalidateQueries({ queryKey: ["folderChildren"] });
      queryClient.invalidateQueries({ queryKey: ["directory"] });

      // Invalidate individual file content and info for changed paths
      for (const changedPath of event.payload) {
        queryClient.invalidateQueries({ queryKey: ["file", changedPath] });
        queryClient.invalidateQueries({ queryKey: ["fileInfo", changedPath] });
      }

      // Call callback if provided
      if (onFileChange) {
        onFileChange(event.payload);
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [path, queryClient, onFileChange]);
}
