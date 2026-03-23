// src/modules/s3-browser/useS3Browser.ts

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export interface S3BucketInfo {
  name: string;
  description: string;
}

export interface S3BrowseObject {
  key: string;
  size: number;
  last_modified: string;
}

export interface S3BrowseResult {
  bucket: string;
  prefix: string;
  folders: string[];
  objects: S3BrowseObject[];
}

export interface S3DeleteResult {
  deleted_count: number;
}

export function useS3Buckets() {
  return useQuery({
    queryKey: ["s3-browse-buckets"],
    queryFn: () => invoke<S3BucketInfo[]>("s3_browse_buckets"),
    staleTime: Infinity,
  });
}

export function useS3BrowseList(bucket: string, prefix: string) {
  return useQuery({
    queryKey: ["s3-browse-list", bucket, prefix],
    queryFn: () => invoke<S3BrowseResult>("s3_browse_list", { bucket, prefix }),
    enabled: !!bucket,
    staleTime: 30_000,
  });
}

export function useS3Delete() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bucket, keys }: { bucket: string; keys: string[] }) =>
      invoke<S3DeleteResult>("s3_browse_delete", { bucket, keys }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["s3-browse-list"] });
    },
  });
}

export function useS3ListAllKeys() {
  return useMutation({
    mutationFn: ({ bucket, prefix }: { bucket: string; prefix: string }) =>
      invoke<string[]>("s3_browse_list_all_keys", { bucket, prefix }),
  });
}

export function useS3GetText(bucket: string, key: string | null) {
  return useQuery({
    queryKey: ["s3-browse-text", bucket, key],
    queryFn: () => invoke<string>("s3_browse_get_text", { bucket, key: key! }),
    enabled: !!bucket && !!key,
    staleTime: 60_000,
  });
}

export function useS3Presign(bucket: string, key: string | null) {
  return useQuery({
    queryKey: ["s3-browse-presign", bucket, key],
    queryFn: () => invoke<string>("s3_browse_presign", { bucket, key: key! }),
    enabled: !!bucket && !!key,
    staleTime: 50 * 60 * 1000, // 50 minutes (URL valid for 60)
  });
}
