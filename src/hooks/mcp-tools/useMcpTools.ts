// MCP Tools CRUD hooks — Supabase-backed mcp_tools registry.
// Synced fields are populated by tv-mcp's `sync-mcp-tools` tool; this UI
// only mutates the editable subset (status, subcategory, purpose, examples,
// notes, tags, verified, owner, last_audited).

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { McpTool, McpToolUpdate } from "./types";
import { mcpToolKeys } from "./keys";

export function useMcpTools(filters?: {
  status?: string;
  category?: string;
  verified?: boolean;
}) {
  return useQuery({
    queryKey: mcpToolKeys.list(filters),
    queryFn: async (): Promise<McpTool[]> => {
      let query = supabase
        .from("mcp_tools")
        .select("*")
        .order("name", { ascending: true });

      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.category) query = query.eq("category", filters.category);
      if (typeof filters?.verified === "boolean")
        query = query.eq("verified", filters.verified);

      const { data, error } = await query;
      if (error) throw new Error(`Failed to fetch mcp_tools: ${error.message}`);
      return data ?? [];
    },
  });
}

export function useMcpTool(slug: string) {
  return useQuery({
    queryKey: mcpToolKeys.detail(slug),
    queryFn: async (): Promise<McpTool | null> => {
      const { data, error } = await supabase
        .from("mcp_tools")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      if (error) throw new Error(`Failed to fetch mcp_tool: ${error.message}`);
      return data;
    },
    enabled: !!slug,
  });
}

export function useUpdateMcpTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      slug,
      updates,
    }: {
      slug: string;
      updates: McpToolUpdate;
    }): Promise<McpTool> => {
      const { data, error } = await supabase
        .from("mcp_tools")
        .update(updates)
        .eq("slug", slug)
        .select()
        .single();

      if (error) throw new Error(`Failed to update mcp_tool: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mcpToolKeys.all });
    },
  });
}
