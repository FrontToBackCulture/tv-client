// Canvas automation types — DAG model for the visual workflow builder

import type { Node, Edge } from "@xyflow/react";

// ---- Node config shapes (discriminated by node_type) ----

export interface TriggerConfig {
  trigger_type: "scheduled" | "manual";
  cron_expression: string | null;
  active_hours: string | null;
}

export interface DataSourceConfig {
  // Built-in data sources
  sources?: {
    tasks: boolean;
    deals: boolean;
    emails: boolean;
    projects: boolean;
    calendar: boolean;
  };
  // Custom SQL data sources (by ID)
  custom_source_ids?: string[];
}

export interface SkillsConfig {
  skill_refs: Array<{ bot: string; slug: string; title: string }>;
}

export interface ActionConfig {
  operation: "insert" | "update" | "upsert" | "delete";
  target_schema: string;
  target_table: string;
  match_key: string | null;
  source_query: string | null;
  field_mapping: Record<string, string> | null;
  static_values: Record<string, unknown> | null;
}

export interface AiProcessConfig {
  model: string;
  system_prompt: string | null;
  bot_path: string | null;
  bot_author?: string;
  additional_instructions: string | null;
}

export interface OutputConfig {
  output_type: "chat_thread";
  post_mode: "new_thread" | "same_thread";
  thread_id: string | null;
  thread_title: string | null;
  bot_author: string;
  aggregation_instructions: string | null;
}

export interface LoopConfig {
  mode: "sequential";
  item_variable: string; // name used in downstream prompts, e.g. "company"
}

export type NodeConfig = TriggerConfig | DataSourceConfig | SkillsConfig | ActionConfig | AiProcessConfig | OutputConfig | LoopConfig;

// ---- Node type ----

export type AutomationNodeType = "trigger" | "data_source" | "skills" | "action" | "ai_process" | "output" | "loop" | "loop_group";

// ---- React Flow node data ----

export interface AutomationNodeData {
  automationId: string;
  nodeType: AutomationNodeType;
  config: NodeConfig;
  label: string;
  isRunning: boolean;
  [key: string]: unknown; // React Flow requires index signature
}

export type AutomationNode = Node<AutomationNodeData, AutomationNodeType>;
export type AutomationEdge = Edge;

// ---- Database row types ----

export interface AutomationRow {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  cron_expression: string | null;
  active_hours: string | null;
  last_run_at: string | null;
  last_run_status: "running" | "success" | "failed" | null;
  viewport_x: number;
  viewport_y: number;
  viewport_zoom: number;
  suggested_skills: string[];
  created_at: string;
  updated_at: string;
  // Deprecated — kept for backward compat, will be removed
  automation_type?: string | null;
  job_id?: string | null;
  dio_id?: string | null;
}

export interface AutomationNodeRow {
  id: string;
  automation_id: string;
  node_type: AutomationNodeType;
  position_x: number;
  position_y: number;
  config: NodeConfig;
  created_at: string;
  updated_at: string;
}

export interface AutomationEdgeRow {
  id: string;
  automation_id: string;
  source_node_id: string;
  target_node_id: string;
}

// ---- Full graph (automation + nodes + edges) ----

export interface AutomationGraph extends AutomationRow {
  nodes: AutomationNodeRow[];
  edges: AutomationEdgeRow[];
}
