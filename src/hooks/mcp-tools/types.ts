// MCP Tools module types

import type { Database } from "../../lib/supabase-types";

export type McpTool = Database["public"]["Tables"]["mcp_tools"]["Row"];
export type McpToolInsert = Database["public"]["Tables"]["mcp_tools"]["Insert"];
export type McpToolUpdate = Database["public"]["Tables"]["mcp_tools"]["Update"];
