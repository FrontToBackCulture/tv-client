import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { publicDataKeys } from "./keys";

interface ClassifyResult {
  status: string;
  classified: number;
  errors: number;
  total: number;
  message: string;
}

export function useClassifyJobs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<ClassifyResult> => {
      // Tauri command runs in background, emits jobs:update events for progress
      // Returns immediately with { status: "started", total: N }
      return await invoke<ClassifyResult>("classify_job_postings");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: publicDataKeys.sources() });
      queryClient.invalidateQueries({ queryKey: publicDataKeys.logs() });
    },
  });
}
