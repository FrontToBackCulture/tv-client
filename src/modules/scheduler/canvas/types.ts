// Canvas automation types — DAG model for the visual workflow builder

import type { Node, Edge } from "@xyflow/react";

// ---- Node config shapes (discriminated by node_type) ----

export interface TriggerConfig {
  trigger_type: "scheduled" | "manual";
  cron_expression: string | null;
  active_hours: string | null;
}

export interface DataSourceConfig {
  // DIO: which data sources to pull
  sources?: {
    tasks: boolean;
    deals: boolean;
    emails: boolean;
    projects: boolean;
    calendar: boolean;
  };
  // Skill: which skills to run
  skill_refs?: Array<{ bot: string; slug: string; title: string }>;
}

export interface AiProcessConfig {
  model: string;
  system_prompt: string | null;
  bot_path: string | null;
  bot_author?: string;
  additional_instructions: string | null;
}

export interface OutputConfig {
  output_type: "chat_thread" | "slack";
  post_mode: "new_thread" | "same_thread";
  thread_id: string | null;
  thread_title: string | null;
  bot_author: string;
  slack_webhook_url: string | null;
}

export type NodeConfig = TriggerConfig | DataSourceConfig | AiProcessConfig | OutputConfig;

// ---- Node / automation type discriminants ----

export type AutomationNodeType = "trigger" | "data_source" | "ai_process" | "output";
export type AutomationType = "skill" | "dio";

// ---- React Flow node data ----

export interface AutomationNodeData {
  automationId: string;
  automationType: AutomationType;
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
  automation_type: AutomationType;
  job_id: string | null;
  dio_id: string | null;
  cron_expression: string | null;
  active_hours: string | null;
  viewport_x: number;
  viewport_y: number;
  viewport_zoom: number;
  created_at: string;
  updated_at: string;
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

// ---- Full graph (automation + nodes + edges + run status) ----

export interface AutomationGraph extends AutomationRow {
  nodes: AutomationNodeRow[];
  edges: AutomationEdgeRow[];
  last_run_at: string | null;
  last_run_status: "running" | "success" | "failed" | null;
}
