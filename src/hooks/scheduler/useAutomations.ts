// React Query hooks for the automations graph layer (automations + nodes + edges)
// Unified — no more DIO/Skill split. Node configs are the source of truth.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { schedulerKeys } from "./keys";
import type {
  AutomationRow,
  AutomationNodeRow,
  AutomationEdgeRow,
  AutomationGraph,
  AutomationNodeType,
  NodeConfig,
  TriggerConfig,
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

      return ((data ?? []) as AutomationRow[]).map((r) => ({
        ...r,
        nodes: [],
        edges: [],
      }));
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
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("automations")
        .update({ ...fields, updated_at: now })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: schedulerKeys.automations() });
    },
  });
}

// ============================================================================
// Toggle automation enabled state
// ============================================================================

export function useToggleAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const now = new Date().toISOString();
      await supabase.from("automations").update({ enabled, updated_at: now }).eq("id", id);
    },
    onMutate: async ({ id, enabled }) => {
      await qc.cancelQueries({ queryKey: schedulerKeys.automations() });
      qc.setQueryData<AutomationGraph[]>(schedulerKeys.automations(), (old) =>
        old?.map((a) => (a.id === id ? { ...a, enabled } : a))
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: schedulerKeys.automations() });
    },
  });
}

// ============================================================================
// Update a node's config (no write-through — node configs are the source of truth)
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
      const { error } = await supabase
        .from("automation_nodes")
        .update({ config, updated_at: new Date().toISOString() })
        .eq("id", nodeId);
      if (error) throw error;

      // Sync trigger cron to automations table (needed for background scheduler)
      const node = automation.nodes.find((n) => n.id === nodeId);
      if (node?.node_type === "trigger") {
        const c = config as TriggerConfig;
        await supabase.from("automations").update({
          cron_expression: c.cron_expression,
          active_hours: c.active_hours,
          updated_at: new Date().toISOString(),
        }).eq("id", automation.id);
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: schedulerKeys.automationNodes(vars.automationId) });
      qc.invalidateQueries({ queryKey: schedulerKeys.automations() });
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
// Create automation (starts with just a trigger node)
// ============================================================================

export function useCreateAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string }) => {
      const autoId = crypto.randomUUID();
      const now = new Date().toISOString();

      const { error: autoErr } = await supabase.from("automations").insert({
        id: autoId,
        name: input.name,
        enabled: true,
        created_at: now,
        updated_at: now,
      });
      if (autoErr) throw autoErr;

      // Start with just a trigger node
      const triggerId = crypto.randomUUID();
      const { error: nodeErr } = await supabase.from("automation_nodes").insert({
        id: triggerId,
        automation_id: autoId,
        node_type: "trigger",
        position_x: 100,
        position_y: 150,
        config: { trigger_type: "scheduled", cron_expression: null, active_hours: null },
      });
      if (nodeErr) throw nodeErr;

      return autoId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: schedulerKeys.automations() });
    },
  });
}

// ============================================================================
// Clone automation — duplicates the graph
// ============================================================================

export function useCloneAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sourceId: string) => {
      const { data: source, error: srcErr } = await supabase
        .from("automations")
        .select("*")
        .eq("id", sourceId)
        .single();
      if (srcErr || !source) throw srcErr ?? new Error("Source automation not found");

      const now = new Date().toISOString();
      const newName = `${source.name} (copy)`;
      const newAutoId = crypto.randomUUID();

      await supabase.from("automations").insert({
        id: newAutoId,
        name: newName,
        description: source.description,
        cron_expression: source.cron_expression,
        active_hours: source.active_hours,
        viewport_x: source.viewport_x,
        viewport_y: source.viewport_y,
        viewport_zoom: source.viewport_zoom,
        enabled: false,
        created_at: now,
        updated_at: now,
      });

      // Clone nodes and map old→new IDs for edges
      const { data: nodes } = await supabase.from("automation_nodes").select("*").eq("automation_id", sourceId);
      const nodeIdMap = new Map<string, string>();
      for (const n of nodes ?? []) {
        const newNodeId = crypto.randomUUID();
        nodeIdMap.set(n.id, newNodeId);
        await supabase.from("automation_nodes").insert({
          id: newNodeId,
          automation_id: newAutoId,
          node_type: n.node_type,
          position_x: n.position_x,
          position_y: n.position_y,
          config: n.config,
          created_at: now,
          updated_at: now,
        });
      }

      // Clone edges using mapped node IDs
      const { data: edges } = await supabase.from("automation_edges").select("*").eq("automation_id", sourceId);
      for (const e of edges ?? []) {
        const srcNode = nodeIdMap.get(e.source_node_id);
        const tgtNode = nodeIdMap.get(e.target_node_id);
        if (!srcNode || !tgtNode) continue;
        await supabase.from("automation_edges").insert({
          id: crypto.randomUUID(),
          automation_id: newAutoId,
          source_node_id: srcNode,
          target_node_id: tgtNode,
        });
      }

      return newAutoId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: schedulerKeys.automations() });
    },
  });
}

// ============================================================================
// Delete automation (cascades to nodes/edges)
// ============================================================================

export function useDeleteAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase.from("automations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: schedulerKeys.automations() });
    },
  });
}

// ============================================================================
// Add a single node to an automation
// ============================================================================

export function useAddNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      automationId: string;
      nodeType: AutomationNodeType;
      position_x: number;
      position_y: number;
      config: NodeConfig;
    }) => {
      const id = crypto.randomUUID();
      const { error } = await supabase.from("automation_nodes").insert({
        id,
        automation_id: input.automationId,
        node_type: input.nodeType,
        position_x: input.position_x,
        position_y: input.position_y,
        config: input.config,
      });
      if (error) throw error;
      return id;
    },
    onSuccess: (_, { automationId }) => {
      qc.invalidateQueries({ queryKey: schedulerKeys.automationNodes(automationId) });
    },
  });
}

// ============================================================================
// Delete a node (and its connected edges)
// ============================================================================

export function useDeleteNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ nodeId }: { nodeId: string; automationId: string }) => {
      const { error } = await supabase.from("automation_nodes").delete().eq("id", nodeId);
      if (error) throw error;
    },
    onSuccess: (_, { automationId }) => {
      qc.invalidateQueries({ queryKey: schedulerKeys.automationNodes(automationId) });
      qc.invalidateQueries({ queryKey: schedulerKeys.automationEdges(automationId) });
    },
  });
}

// ============================================================================
// Add an edge between two nodes
// ============================================================================

export function useAddEdge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      automationId: string;
      sourceNodeId: string;
      targetNodeId: string;
    }) => {
      const id = crypto.randomUUID();
      const { error } = await supabase.from("automation_edges").insert({
        id,
        automation_id: input.automationId,
        source_node_id: input.sourceNodeId,
        target_node_id: input.targetNodeId,
      });
      if (error) throw error;
      return id;
    },
    onSuccess: (_, { automationId }) => {
      qc.invalidateQueries({ queryKey: schedulerKeys.automationEdges(automationId) });
    },
  });
}

// ============================================================================
// Delete an edge
// ============================================================================

export function useDeleteEdge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ edgeId }: { edgeId: string; automationId: string }) => {
      const { error } = await supabase.from("automation_edges").delete().eq("id", edgeId);
      if (error) throw error;
    },
    onSuccess: (_, { automationId }) => {
      qc.invalidateQueries({ queryKey: schedulerKeys.automationEdges(automationId) });
    },
  });
}
