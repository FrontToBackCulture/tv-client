// React Query hooks for the automations graph layer (automations + nodes + edges)
// Write-through: node config changes are mirrored to the backing jobs/dio_automations tables.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { schedulerKeys } from "./keys";
import { dioKeys } from "../chat/useDioAutomations";
import { cronToIntervalHours } from "../../modules/scheduler/ScheduleSection";
import type {
  AutomationRow,
  AutomationNodeRow,
  AutomationEdgeRow,
  AutomationGraph,
  AutomationType,
  AutomationNodeType,
  NodeConfig,
  TriggerConfig,
  DataSourceConfig,
  AiProcessConfig,
  OutputConfig,
} from "../../modules/scheduler/canvas/types";

// ============================================================================
// List all automations (lightweight — no nodes/edges)
// ============================================================================

export function useAutomations() {
  return useQuery({
    queryKey: schedulerKeys.automations(),
    queryFn: async (): Promise<AutomationGraph[]> => {
      const { data, error } = await supabase
        .from("automations")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;

      // Fetch last run info from source tables
      const rows = (data ?? []) as AutomationRow[];
      const jobIds = rows.filter((r) => r.job_id).map((r) => r.job_id!);
      const dioIds = rows.filter((r) => r.dio_id).map((r) => r.dio_id!);

      const [jobsRes, dioRes] = await Promise.all([
        jobIds.length > 0
          ? supabase.from("jobs").select("id, last_run_at, last_run_status").in("id", jobIds)
          : { data: [], error: null },
        dioIds.length > 0
          ? supabase.from("dio_automations").select("id, last_run_at").in("id", dioIds)
          : { data: [], error: null },
      ]);

      const jobMap = new Map((jobsRes.data ?? []).map((j: any) => [j.id, j]));
      const dioMap = new Map((dioRes.data ?? []).map((d: any) => [d.id, d]));

      return rows.map((r) => {
        const job = r.job_id ? jobMap.get(r.job_id) : null;
        const dio = r.dio_id ? dioMap.get(r.dio_id) : null;
        return {
          ...r,
          nodes: [],
          edges: [],
          last_run_at: job?.last_run_at ?? dio?.last_run_at ?? null,
          last_run_status: job?.last_run_status ?? null,
        };
      });
    },
    staleTime: 10_000,
  });
}

// ============================================================================
// Fetch nodes + edges for a single automation
// ============================================================================

export function useAutomationNodes(automationId: string | null) {
  return useQuery({
    queryKey: schedulerKeys.automationNodes(automationId ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_nodes")
        .select("*")
        .eq("automation_id", automationId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AutomationNodeRow[];
    },
    enabled: !!automationId,
  });
}

export function useAutomationEdges(automationId: string | null) {
  return useQuery({
    queryKey: schedulerKeys.automationEdges(automationId ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_edges")
        .select("*")
        .eq("automation_id", automationId!);
      if (error) throw error;
      return (data ?? []) as AutomationEdgeRow[];
    },
    enabled: !!automationId,
  });
}

// ============================================================================
// Update automation (name, enabled, viewport, schedule)
// ============================================================================

export function useUpdateAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...fields }: { id: string } & Partial<AutomationRow>) => {
      const { error } = await supabase
        .from("automations")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: schedulerKeys.automations() });
    },
  });
}

// ============================================================================
// Toggle automation enabled state (with write-through)
// ============================================================================

export function useToggleAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, enabled, job_id, dio_id }: {
      id: string; enabled: boolean; job_id: string | null; dio_id: string | null;
    }) => {
      const now = new Date().toISOString();
      // Update automations table
      await supabase.from("automations").update({ enabled, updated_at: now }).eq("id", id);
      // Write-through to source table
      if (job_id) {
        await supabase.from("jobs").update({ enabled, updated_at: now }).eq("id", job_id);
      }
      if (dio_id) {
        await supabase.from("dio_automations").update({ enabled, updated_at: now }).eq("id", dio_id);
      }
    },
    onMutate: async ({ id, enabled }) => {
      await qc.cancelQueries({ queryKey: schedulerKeys.automations() });
      qc.setQueryData<AutomationGraph[]>(schedulerKeys.automations(), (old) =>
        old?.map((a) => (a.id === id ? { ...a, enabled } : a))
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: schedulerKeys.automations() });
      qc.invalidateQueries({ queryKey: schedulerKeys.jobs() });
      qc.invalidateQueries({ queryKey: dioKeys.all });
    },
  });
}

// ============================================================================
// Update a node's config (with write-through to source table)
// ============================================================================

export function useUpdateAutomationNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ nodeId, automationId: _automationId, config, automation }: {
      nodeId: string;
      automationId: string;
      config: NodeConfig;
      automation: AutomationGraph;
    }) => {
      // Update node config
      const { error } = await supabase
        .from("automation_nodes")
        .update({ config, updated_at: new Date().toISOString() })
        .eq("id", nodeId);
      if (error) throw error;

      // Determine node type from config shape and write-through
      const node = automation.nodes.find((n) => n.id === nodeId);
      if (node) {
        await syncNodeConfigToSourceTable(automation, node.node_type, config);
      }
    },
    onSuccess: (_, vars) => {
      const automationId = vars.automationId;
      qc.invalidateQueries({ queryKey: schedulerKeys.automationNodes(automationId) });
      qc.invalidateQueries({ queryKey: schedulerKeys.automations() });
      qc.invalidateQueries({ queryKey: schedulerKeys.jobs() });
      qc.invalidateQueries({ queryKey: dioKeys.all });
    },
  });
}

// ============================================================================
// Update node position (drag)
// ============================================================================

export function useUpdateNodePosition() {
  return useMutation({
    mutationFn: async ({ nodeId, position_x, position_y }: {
      nodeId: string; position_x: number; position_y: number;
    }) => {
      const { error } = await supabase
        .from("automation_nodes")
        .update({ position_x, position_y, updated_at: new Date().toISOString() })
        .eq("id", nodeId);
      if (error) throw error;
    },
    // No invalidation needed — React Flow manages local position state
  });
}

// ============================================================================
// Save viewport (debounced by caller)
// ============================================================================

export function useUpdateViewport() {
  return useMutation({
    mutationFn: async ({ id, viewport_x, viewport_y, viewport_zoom }: {
      id: string; viewport_x: number; viewport_y: number; viewport_zoom: number;
    }) => {
      const { error } = await supabase
        .from("automations")
        .update({ viewport_x, viewport_y, viewport_zoom })
        .eq("id", id);
      if (error) throw error;
    },
  });
}

// ============================================================================
// Create automation (with default 4 nodes + 3 edges)
// ============================================================================

export function useCreateAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      automation_type: AutomationType;
      job_id?: string;
      dio_id?: string;
    }) => {
      const autoId = crypto.randomUUID();
      const now = new Date().toISOString();

      const { error: autoErr } = await supabase.from("automations").insert({
        id: autoId,
        name: input.name,
        automation_type: input.automation_type,
        job_id: input.job_id ?? null,
        dio_id: input.dio_id ?? null,
        enabled: true,
        created_at: now,
        updated_at: now,
      });
      if (autoErr) throw autoErr;

      // Create default nodes
      const triggerId = crypto.randomUUID();
      const sourceId = crypto.randomUUID();
      const processId = crypto.randomUUID();
      const outputId = crypto.randomUUID();

      const nodes = [
        { id: triggerId, automation_id: autoId, node_type: "trigger", position_x: 0, position_y: 100, config: { trigger_type: "scheduled", cron_expression: null, active_hours: null } },
        { id: sourceId, automation_id: autoId, node_type: "data_source", position_x: 280, position_y: 100, config: input.automation_type === "dio" ? { sources: { tasks: true, deals: false, emails: false, projects: false, calendar: false } } : { skill_refs: [] } },
        { id: processId, automation_id: autoId, node_type: "ai_process", position_x: 560, position_y: 100, config: { model: input.automation_type === "dio" ? "claude-haiku-4-5-20251001" : "sonnet", system_prompt: null, bot_path: null, additional_instructions: null } },
        { id: outputId, automation_id: autoId, node_type: "output", position_x: 840, position_y: 100, config: { output_type: "chat_thread", post_mode: "new_thread", thread_title: null, thread_id: null, bot_author: "bot-mel", slack_webhook_url: null } },
      ];

      const { error: nodeErr } = await supabase.from("automation_nodes").insert(nodes);
      if (nodeErr) throw nodeErr;

      const edges = [
        { automation_id: autoId, source_node_id: triggerId, target_node_id: sourceId },
        { automation_id: autoId, source_node_id: sourceId, target_node_id: processId },
        { automation_id: autoId, source_node_id: processId, target_node_id: outputId },
      ];

      const { error: edgeErr } = await supabase.from("automation_edges").insert(edges);
      if (edgeErr) throw edgeErr;

      return autoId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: schedulerKeys.automations() });
    },
  });
}

// ============================================================================
// Delete automation (cascades to nodes/edges, also deletes source table row)
// ============================================================================

export function useDeleteAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, job_id, dio_id }: { id: string; job_id: string | null; dio_id: string | null }) => {
      // Delete automation (cascade deletes nodes + edges)
      const { error } = await supabase.from("automations").delete().eq("id", id);
      if (error) throw error;
      // Delete source table row
      if (job_id) await supabase.from("jobs").delete().eq("id", job_id);
      if (dio_id) await supabase.from("dio_automations").delete().eq("id", dio_id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: schedulerKeys.automations() });
      qc.invalidateQueries({ queryKey: schedulerKeys.jobs() });
      qc.invalidateQueries({ queryKey: dioKeys.all });
    },
  });
}

// ============================================================================
// Write-through: sync node config to the backing flat table
// ============================================================================

async function syncNodeConfigToSourceTable(
  automation: AutomationGraph,
  nodeType: AutomationNodeType,
  config: NodeConfig
): Promise<void> {
  const now = new Date().toISOString();

  if (automation.job_id && automation.automation_type === "skill") {
    const updates: Record<string, unknown> = { updated_at: now };

    switch (nodeType) {
      case "trigger": {
        const c = config as TriggerConfig;
        updates.cron_expression = c.cron_expression;
        // Also update automations table schedule
        await supabase.from("automations").update({
          cron_expression: c.cron_expression,
          active_hours: c.active_hours,
          updated_at: now,
        }).eq("id", automation.id);
        break;
      }
      case "data_source": {
        const c = config as DataSourceConfig;
        updates.skill_refs = c.skill_refs ?? [];
        break;
      }
      case "ai_process": {
        const c = config as AiProcessConfig;
        updates.model = c.model;
        updates.bot_path = c.bot_path;
        if (c.additional_instructions !== undefined) {
          updates.skill_prompt = c.additional_instructions ?? "";
        }
        break;
      }
      case "output": {
        const c = config as OutputConfig;
        updates.slack_webhook_url = c.slack_webhook_url;
        updates.slack_channel_name = c.thread_title;
        break;
      }
    }

    await supabase.from("jobs").update(updates).eq("id", automation.job_id);
  }

  if (automation.dio_id && automation.automation_type === "dio") {
    const updates: Record<string, unknown> = { updated_at: now };

    switch (nodeType) {
      case "trigger": {
        const c = config as TriggerConfig;
        const hours = c.cron_expression ? cronToIntervalHours(c.cron_expression) : null;
        if (hours !== null) updates.interval_hours = hours;
        updates.active_hours = c.active_hours;
        await supabase.from("automations").update({
          cron_expression: c.cron_expression,
          active_hours: c.active_hours,
          updated_at: now,
        }).eq("id", automation.id);
        break;
      }
      case "data_source": {
        const c = config as DataSourceConfig;
        if (c.sources) updates.sources = c.sources;
        break;
      }
      case "ai_process": {
        const c = config as AiProcessConfig;
        updates.model = c.model;
        updates.system_prompt = c.system_prompt;
        if (c.bot_author) updates.bot_author = c.bot_author;
        break;
      }
      case "output": {
        const c = config as OutputConfig;
        updates.post_mode = c.post_mode;
        updates.thread_id = c.thread_id;
        updates.thread_title = c.thread_title;
        updates.bot_author = c.bot_author;
        break;
      }
    }

    await supabase.from("dio_automations").update(updates).eq("id", automation.dio_id);
  }
}
