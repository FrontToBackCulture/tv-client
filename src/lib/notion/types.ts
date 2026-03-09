// Notion Sync Types

export interface NotionDatabaseInfo {
  id: string;
  title: string;
  properties: NotionPropertySchema[];
  last_edited_time?: string;
}

export interface NotionPropertySchema {
  name: string;
  type: string;
  options?: NotionSelectOption[];
  groups?: NotionStatusGroup[];
}

export interface NotionSelectOption {
  name: string;
  color?: string;
}

export interface NotionStatusGroup {
  name: string;
  color?: string;
  option_ids?: string[];
}

export interface SyncConfig {
  id: string;
  name: string;
  notion_database_id: string;
  target_project_id?: string;
  field_mapping: Record<string, FieldMappingEntry | string>;
  filter?: Record<string, unknown>;
  sync_interval_minutes?: number;
  enabled?: boolean;
  last_synced_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface FieldMappingEntry {
  target: string;
  value_map?: Record<string, string | number>;
}

export interface CreateSyncConfig {
  name: string;
  notion_database_id: string;
  target_project_id?: string;
  field_mapping: Record<string, FieldMappingEntry | string>;
  filter?: Record<string, unknown>;
  sync_interval_minutes?: number;
}

export interface UpdateSyncConfig {
  name?: string;
  target_project_id?: string;
  field_mapping?: Record<string, FieldMappingEntry | string>;
  filter?: Record<string, unknown>;
  sync_interval_minutes?: number;
  enabled?: boolean;
}

export interface SyncProgress {
  phase: string;
  current: number;
  total: number;
  message: string;
}

export interface SyncComplete {
  tasks_created: number;
  tasks_updated: number;
  timestamp: string;
  config_name: string;
}

export interface SyncStatus {
  is_syncing: boolean;
  last_sync?: string;
  configs_count: number;
  enabled_count: number;
}

export interface PreviewCard {
  notion_page_id: string;
  title: string;
  properties: Record<string, unknown>;
  last_edited_time?: string;
}

// Work task fields available for mapping
export const WORK_TASK_FIELDS = [
  { value: "title", label: "Title" },
  { value: "description", label: "Description" },
  { value: "status_id", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "due_date", label: "Due Date" },
  { value: "assignee_id", label: "Assignee" },
  { value: "milestone_id", label: "Milestone" },
] as const;

export type WorkTaskField = (typeof WORK_TASK_FIELDS)[number]["value"];
