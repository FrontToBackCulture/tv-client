// src/modules/system/hooks/useMcpTools.ts
// Fetch MCP tools - prefers Tauri IPC, falls back to HTTP

import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

const MCP_SERVER_URL = "http://localhost:23816";

// Tool definition from MCP protocol
export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, PropertySchema>;
    required?: string[];
  };
}

export interface PropertySchema {
  type: string;
  description?: string;
  enum?: string[];
  default?: unknown;
  items?: PropertySchema;
}

interface ToolsListResponse {
  tools: McpTool[];
}

// Tool group for UI display
export interface ToolGroup {
  name: string;
  prefix: string;
  tools: McpTool[];
}

// Check if running in Tauri
const isTauri = typeof window !== "undefined" && "__TAURI__" in window;

// Fetch tools via Tauri IPC (preferred)
async function fetchMcpToolsTauri(): Promise<McpTool[]> {
  return invoke<McpTool[]>("mcp_list_tools");
}

// Fetch tools from MCP HTTP server (fallback)
async function fetchMcpToolsHttp(): Promise<McpTool[]> {
  const response = await fetch(`${MCP_SERVER_URL}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/list",
      params: {},
      id: 1,
    }),
  });

  if (!response.ok) {
    throw new Error(`MCP server error: ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || "MCP error");
  }

  const result = data.result as ToolsListResponse;
  return result.tools || [];
}

// Fetch tools - tries Tauri first, then HTTP
async function fetchMcpTools(): Promise<McpTool[]> {
  if (isTauri) {
    try {
      return await fetchMcpToolsTauri();
    } catch (e) {
      console.warn("[MCP] Tauri IPC failed, trying HTTP:", e);
    }
  }
  return fetchMcpToolsHttp();
}

// Call a tool via Tauri IPC
async function callMcpToolTauri(name: string, args: Record<string, unknown>): Promise<{ content: unknown; isError?: boolean }> {
  return invoke<{ content: unknown; isError?: boolean }>("mcp_call_tool", {
    name,
    arguments: args,
  });
}

// Call a tool via HTTP
async function callMcpToolHttp(name: string, args: Record<string, unknown>): Promise<{ content: unknown; isError?: boolean }> {
  const response = await fetch(`${MCP_SERVER_URL}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        name,
        arguments: args,
      },
      id: Date.now(),
    }),
  });

  if (!response.ok) {
    throw new Error(`MCP server error: ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || "MCP error");
  }

  return data.result;
}

// Call a tool with arguments - tries Tauri first, then HTTP
export async function callMcpTool(name: string, args: Record<string, unknown>): Promise<{ content: unknown; isError?: boolean }> {
  if (isTauri) {
    try {
      return await callMcpToolTauri(name, args);
    } catch (e) {
      console.warn("[MCP] Tauri IPC call failed, trying HTTP:", e);
    }
  }
  return callMcpToolHttp(name, args);
}

// Group tools by prefix for sidebar display
function groupTools(tools: McpTool[]): ToolGroup[] {
  const groupMap = new Map<string, McpTool[]>();

  // Define group mappings
  const groupMappings: Record<string, string> = {
    "list-work": "Work",
    "get-work": "Work",
    "create-work": "Work",
    "update-work": "Work",
    "delete-work": "Work",
    "add-project": "Work",
    "list-crm": "CRM",
    "find-crm": "CRM",
    "get-crm": "CRM",
    "create-crm": "CRM",
    "update-crm": "CRM",
    "delete-crm": "CRM",
    "log-crm": "CRM",
    "link-crm": "CRM",
    "gamma": "Generate",
    "nanobanana": "Generate",
    "list-intercom": "Intercom",
    "publish-to": "Intercom",
    "generate-order": "Documents",
    "generate-proposal": "Documents",
    "check-document": "Documents",
    "sync-val": "VAL Sync",
    "execute-val": "VAL Sync",
  };

  tools.forEach((tool) => {
    // Find matching prefix
    let groupName = "Other";

    for (const [prefix, name] of Object.entries(groupMappings)) {
      if (tool.name.startsWith(prefix)) {
        groupName = name;
        break;
      }
    }

    const existing = groupMap.get(groupName) || [];
    existing.push(tool);
    groupMap.set(groupName, existing);
  });

  // Convert to sorted array
  const groups: ToolGroup[] = [];
  const sortOrder = ["Work", "CRM", "Generate", "Intercom", "Documents", "VAL Sync", "Other"];

  sortOrder.forEach((name) => {
    const tools = groupMap.get(name);
    if (tools && tools.length > 0) {
      groups.push({
        name,
        prefix: name.toLowerCase().replace(" ", "-"),
        tools: tools.sort((a, b) => a.name.localeCompare(b.name)),
      });
    }
  });

  // Add any remaining groups not in sortOrder
  groupMap.forEach((tools, name) => {
    if (!sortOrder.includes(name) && tools.length > 0) {
      groups.push({
        name,
        prefix: name.toLowerCase().replace(" ", "-"),
        tools: tools.sort((a, b) => a.name.localeCompare(b.name)),
      });
    }
  });

  return groups;
}

// React Query hook for fetching tools
export function useMcpTools() {
  return useQuery({
    queryKey: ["mcp-tools"],
    queryFn: fetchMcpTools,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 2,
  });
}

// React Query hook for grouped tools
export function useMcpToolsGrouped() {
  const query = useMcpTools();

  return {
    ...query,
    data: query.data ? groupTools(query.data) : undefined,
  };
}
