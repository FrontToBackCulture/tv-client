// Hook to poll tv-api for running API-triggered tasks (e.g. Slack commands)

import { useQuery } from "@tanstack/react-query";

export interface ApiTask {
  id: string;
  skill: string;
  status: "running" | "completed" | "failed";
  triggeredBy: string;
  startedAt: number;
  completedAt?: number;
  elapsedMs: number;
  estimateMs?: number;
  error?: string;
}

const TV_API_URL = import.meta.env.VITE_TV_API_URL || "http://localhost:23817";
const TV_API_KEY = import.meta.env.VITE_TV_API_KEY || "test-api-key-12345";

async function fetchApiTasks(): Promise<ApiTask[]> {
  const res = await fetch(`${TV_API_URL}/api/v1/tasks`, {
    headers: { "X-API-Key": TV_API_KEY },
  });
  if (!res.ok) throw new Error(`Failed to fetch tasks: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export function useApiTasks() {
  return useQuery({
    queryKey: ["api-tasks"],
    queryFn: fetchApiTasks,
    refetchInterval: 5000,
    retry: false,
    // Don't show errors — tv-api may not be running
    throwOnError: false,
  });
}
