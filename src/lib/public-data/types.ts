export interface DataSource {
  id: string;
  domain: string;
  name: string;
  description: string | null;
  api_type: string;
  api_config: Record<string, any>;
  target_table: string;
  row_count: number;
  last_synced_at: string | null;
  sync_status: "never" | "running" | "success" | "error";
  sync_error: string | null;
  refresh_frequency: string;
  priority: number;
  data_type: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface IngestionLog {
  id: number;
  source_id: string;
  rows_upserted: number;
  rows_deleted: number;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  status: "running" | "success" | "error";
  error: string | null;
  metadata: Record<string, any>;
}

export interface IngestionResult {
  status: "success" | "error" | "skipped";
  rows?: number;
  duration_ms?: number;
  error?: string;
  reason?: string;
}

export const DOMAIN_LABELS: Record<string, string> = {
  fnb: "F&B",
  economy: "Economy",
  property: "Property",
  transport: "Transport",
  business: "Business",
  demographics: "Demographics",
};

export const DATA_TYPE_LABELS: Record<string, string> = {
  snapshot: "Snapshot",
  time_series_monthly: "Monthly",
  time_series_quarterly: "Quarterly",
  time_series_annual: "Annual",
  realtime: "Real-time",
};

export const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  never: { label: "Never synced", color: "zinc" },
  running: { label: "Syncing...", color: "blue" },
  success: { label: "Synced", color: "green" },
  error: { label: "Error", color: "red" },
};

export const PRIORITY_LABELS: Record<number, string> = {
  1: "P1",
  2: "P2",
  3: "P3",
};
