// src/modules/system/hooks/useUnifiedCapabilities.ts
// Combines MCP tools, Tauri commands, and REST APIs into a unified view

import { useMemo } from "react";
import { useMcpTools, McpTool } from "./useMcpTools";
import { useOpenApi, ApiEndpoint } from "./useOpenApi";
import generatedTauriCommands from "../generated/tauri-commands.json";

// Unified capability that may exist in multiple systems
export interface UnifiedCapability {
  id: string;
  name: string; // Display name (e.g., "Create Company")
  description: string;
  category: string; // Group name (e.g., "CRM", "Documents")

  // Availability in each system
  mcp?: {
    toolName: string;
    tool: McpTool;
  };
  tauri?: {
    commandName: string;
    module: string;
  };
  api?: {
    endpoint: ApiEndpoint;
  };
}

export interface CapabilityGroup {
  name: string;
  capabilities: UnifiedCapability[];
}

// Tauri command from generated JSON
interface TauriCommand {
  name: string;
  module: string;
}

// Mapping rules: how to match capabilities across systems
// Format: { displayName: { mcp?: prefix, tauri?: prefix, api?: path pattern } }
const CAPABILITY_MAPPINGS: Record<string, Record<string, { mcp?: string; tauri?: string; api?: string }>> = {
  "Work": {
    "List Tasks": { mcp: "list-work-tasks", tauri: "work_list_tasks" },
    "Get Task": { mcp: "get-work-task", tauri: "work_get_task" },
    "Create Task": { mcp: "create-work-task", tauri: "work_create_task" },
    "Update Task": { mcp: "update-work-task", tauri: "work_update_task" },
    "Delete Task": { mcp: "delete-work-task", tauri: "work_delete_task" },
    "List Projects": { mcp: "list-work-projects", tauri: "work_list_projects" },
    "Get Project": { mcp: "get-work-project", tauri: "work_get_project" },
    "Create Project": { mcp: "create-work-project", tauri: "work_create_project" },
    "Update Project": { mcp: "update-work-project", tauri: "work_update_project" },
    "Delete Project": { mcp: "delete-work-project", tauri: "work_delete_project" },
    "List Milestones": { mcp: "list-work-milestones", tauri: "work_list_milestones" },
    "Get Milestone": { mcp: "get-work-milestone", tauri: "work_get_milestone" },
    "Create Milestone": { mcp: "create-work-milestone", tauri: "work_create_milestone" },
    "Update Milestone": { mcp: "update-work-milestone", tauri: "work_update_milestone" },
    "Delete Milestone": { mcp: "delete-work-milestone", tauri: "work_delete_milestone" },
    "List Initiatives": { mcp: "list-work-initiatives", tauri: "work_list_initiatives" },
    "Get Initiative": { mcp: "get-work-initiative", tauri: "work_get_initiative" },
    "Create Initiative": { mcp: "create-work-initiative", tauri: "work_create_initiative" },
    "Update Initiative": { mcp: "update-work-initiative", tauri: "work_update_initiative" },
    "Delete Initiative": { mcp: "delete-work-initiative", tauri: "work_delete_initiative" },
    "List Labels": { mcp: "list-work-labels", tauri: "work_list_labels" },
    "Create Label": { mcp: "create-work-label", tauri: "work_create_label" },
    "List Users": { mcp: "list-work-users", tauri: "work_list_users" },
    "List Bots": { mcp: "list-work-bots", tauri: "work_list_bots" },
    "Add Project to Initiative": { mcp: "add-project-to-initiative", tauri: "work_add_project_to_initiative" },
    "List Project Updates": { mcp: "list-project-updates", tauri: "work_list_project_updates" },
    "Create Project Update": { mcp: "create-project-update", tauri: "work_create_project_update" },
  },
  "CRM": {
    "List Companies": { mcp: "list-crm-companies", tauri: "crm_list_companies", api: "/api/v1/crm/companies" },
    "Find Company": { mcp: "find-crm-company", tauri: "crm_find_company" },
    "Get Company": { mcp: "get-crm-company", tauri: "crm_get_company" },
    "Create Company": { mcp: "create-crm-company", tauri: "crm_create_company", api: "/api/v1/crm/companies" },
    "Update Company": { mcp: "update-crm-company", tauri: "crm_update_company" },
    "Delete Company": { mcp: "delete-crm-company", tauri: "crm_delete_company" },
    "List Contacts": { mcp: "list-crm-contacts", tauri: "crm_list_contacts" },
    "Find Contact": { mcp: "find-crm-contact", tauri: "crm_find_contact" },
    "Create Contact": { mcp: "create-crm-contact", tauri: "crm_create_contact" },
    "Update Contact": { mcp: "update-crm-contact", tauri: "crm_update_contact" },
    "List Deals": { mcp: "list-crm-deals", tauri: "crm_list_deals" },
    "Create Deal": { mcp: "create-crm-deal", tauri: "crm_create_deal" },
    "Update Deal": { mcp: "update-crm-deal", tauri: "crm_update_deal" },
    "Get Pipeline": { mcp: "get-crm-pipeline", tauri: "crm_get_pipeline" },
    "Log Activity": { mcp: "log-crm-activity", tauri: "crm_log_activity" },
    "List Activities": { mcp: "list-crm-activities", tauri: "crm_list_activities" },
    "Link Email": { mcp: "link-crm-email", tauri: "crm_link_email" },
    "Get Email Link": { mcp: "get-crm-email-link", tauri: "crm_get_email_link" },
  },
  "Documents": {
    "Generate Order Form": { mcp: "generate-order-form", tauri: "generate_order_form_pdf_cmd" },
    "Generate Proposal": { mcp: "generate-proposal", tauri: "generate_proposal_pdf_cmd" },
    "Check Document Type": { mcp: "check-document-type" },
  },
  "Generate": {
    "Gamma Generate": { mcp: "gamma-generate", tauri: "gamma_generate" },
    "Gamma Create Generation": { mcp: "gamma-create-generation", tauri: "gamma_create_generation" },
    "Gamma Get Status": { mcp: "gamma-get-status", tauri: "gamma_get_status" },
    "Gamma List Themes": { mcp: "gamma-list-themes", tauri: "gamma_list_themes" },
    "Gamma List Folders": { mcp: "gamma-list-folders", tauri: "gamma_list_folders" },
    "Nanobanana Generate": { mcp: "nanobanana-generate", tauri: "nanobanana_generate" },
    "Nanobanana Generate From File": { tauri: "nanobanana_generate_from_file" },
    "Nanobanana Generate To File": { tauri: "nanobanana_generate_to_file" },
    "Nanobanana List Models": { tauri: "nanobanana_list_models" },
  },
  "Intercom": {
    "List Collections": { mcp: "list-intercom-collections", tauri: "intercom_list_collections" },
    "Publish Article": { mcp: "publish-to-intercom", tauri: "intercom_publish_article" },
    "Update Article": { tauri: "intercom_update_article" },
    "Delete Article": { tauri: "intercom_delete_article" },
  },
  "VAL Sync": {
    "Execute SQL": { mcp: "execute-val-sql", tauri: "val_execute_sql" },
    "Sync Tables": { mcp: "sync-val-tables", tauri: "val_sync_tables" },
    "Sync Workflows": { mcp: "sync-val-workflows", tauri: "val_sync_workflows" },
    "Sync Dashboards": { mcp: "sync-val-dashboards", tauri: "val_sync_dashboards" },
    "Run Table Pipeline": { mcp: "run-table-pipeline", tauri: "val_run_table_pipeline" },
    "Run Data Model Health": { mcp: "run-data-model-health", tauri: "val_run_data_model_health" },
    "Run Workflow Health": { mcp: "run-workflow-health", tauri: "val_run_workflow_health" },
    "Sample Table Data": { mcp: "sample-table-data", tauri: "val_sample_table_data" },
    "Analyze Table Data": { mcp: "analyze-table-data", tauri: "val_analyze_table_data" },
    "Prepare Table Overview": { mcp: "prepare-table-overview", tauri: "val_prepare_table_overview" },
    "Generate Health Config": { mcp: "generate-health-config", tauri: "val_generate_health_config" },
    "Extract Calc Fields": { mcp: "extract-table-calc-fields", tauri: "val_extract_table_calc_fields" },
    "List Domains": { mcp: "list-val-domains", tauri: "val_sync_list_domains" },
    "Check Auth": { tauri: "val_sync_check_auth" },
    "Login": { tauri: "val_sync_login" },
    "Discover Domains": { tauri: "val_sync_discover_domains" },
  },
  "Outlook": {
    "Auth Check": { tauri: "outlook_auth_check" },
    "Auth Start": { tauri: "outlook_auth_start" },
    "Auth Logout": { tauri: "outlook_auth_logout" },
    "List Emails": { tauri: "outlook_list_emails" },
    "Get Email": { tauri: "outlook_get_email" },
    "Get Email Body": { tauri: "outlook_get_email_body" },
    "Send Email": { tauri: "outlook_send_email" },
    "Mark Read": { tauri: "outlook_mark_read" },
    "Archive Email": { tauri: "outlook_archive_email" },
    "Get Folders": { tauri: "outlook_get_folders" },
    "Get Stats": { tauri: "outlook_get_stats" },
    "Sync Start": { tauri: "outlook_sync_start" },
    "Sync Status": { tauri: "outlook_sync_status" },
    "Bootstrap Contacts": { tauri: "outlook_bootstrap_contacts" },
  },
  "Files": {
    "Read File": { tauri: "read_file" },
    "Write File": { tauri: "write_file" },
    "Delete File": { tauri: "delete_file" },
    "List Directory": { tauri: "list_directory" },
    "Create Directory": { tauri: "create_directory" },
    "Get File Info": { tauri: "get_file_info" },
    "Get File Tree": { tauri: "get_file_tree" },
    "Get Folder Files": { tauri: "get_folder_files" },
    "Rename Path": { tauri: "rename_path" },
    "Open in Finder": { tauri: "open_in_finder" },
    "Open with Default App": { tauri: "open_with_default_app" },
    "Watch Directory": { tauri: "watch_directory" },
  },
  "Search": {
    "Search Files": { tauri: "search_files" },
    "Search Content": { tauri: "search_content" },
  },
  "Settings": {
    "Get Key": { tauri: "settings_get_key" },
    "Set Key": { tauri: "settings_set_key" },
    "Delete Key": { tauri: "settings_delete_key" },
    "Has Key": { tauri: "settings_has_key" },
    "List Keys": { tauri: "settings_list_keys" },
    "Get Status": { tauri: "settings_get_status" },
    "Get Path": { tauri: "settings_get_path" },
    "Import From File": { tauri: "settings_import_from_file" },
  },
  "Terminal": {
    "Create Terminal": { tauri: "terminal_create" },
    "Close Terminal": { tauri: "terminal_close" },
    "List Terminals": { tauri: "terminal_list" },
    "Read Terminal": { tauri: "terminal_read" },
    "Write Terminal": { tauri: "terminal_write" },
    "Resize Terminal": { tauri: "terminal_resize" },
  },
  "Auth": {
    "GitHub OAuth Start": { tauri: "github_oauth_start" },
    "GitHub Get User": { tauri: "github_get_user" },
  },
  "MCP": {
    "List Tools": { tauri: "mcp_list_tools" },
    "Call Tool": { tauri: "mcp_call_tool" },
    "Get Status": { tauri: "mcp_get_status" },
  },
};

// Build unified capabilities from all sources
function buildUnifiedCapabilities(
  mcpTools: McpTool[] | undefined,
  tauriCommands: TauriCommand[],
  apiEndpoints: ApiEndpoint[] | undefined
): CapabilityGroup[] {
  const groups: CapabilityGroup[] = [];

  // Track which items have been mapped
  const mappedMcp = new Set<string>();
  const mappedTauri = new Set<string>();
  const mappedApi = new Set<string>();

  // Build capabilities from mappings
  for (const [categoryName, capabilities] of Object.entries(CAPABILITY_MAPPINGS)) {
    const categoryCapabilities: UnifiedCapability[] = [];

    for (const [displayName, mapping] of Object.entries(capabilities)) {
      const capability: UnifiedCapability = {
        id: `${categoryName}-${displayName}`.toLowerCase().replace(/\s+/g, "-"),
        name: displayName,
        description: "",
        category: categoryName,
      };

      // Match MCP tool
      if (mapping.mcp && mcpTools) {
        const tool = mcpTools.find(t => t.name === mapping.mcp);
        if (tool) {
          capability.mcp = { toolName: tool.name, tool };
          capability.description = capability.description || tool.description;
          mappedMcp.add(tool.name);
        }
      }

      // Match Tauri command
      if (mapping.tauri) {
        const cmd = tauriCommands.find(c => c.name === mapping.tauri);
        if (cmd) {
          capability.tauri = { commandName: cmd.name, module: cmd.module };
          mappedTauri.add(cmd.name);
        }
      }

      // Match API endpoint
      if (mapping.api && apiEndpoints) {
        const endpoint = apiEndpoints.find(e => e.path === mapping.api);
        if (endpoint) {
          capability.api = { endpoint };
          capability.description = capability.description || endpoint.description;
          mappedApi.add(endpoint.path);
        }
      }

      // Only add if at least one system has it
      if (capability.mcp || capability.tauri || capability.api) {
        categoryCapabilities.push(capability);
      }
    }

    if (categoryCapabilities.length > 0) {
      groups.push({
        name: categoryName,
        capabilities: categoryCapabilities.sort((a, b) => a.name.localeCompare(b.name)),
      });
    }
  }

  // Add unmapped MCP tools
  if (mcpTools) {
    const unmappedMcpTools = mcpTools.filter(t => !mappedMcp.has(t.name));
    if (unmappedMcpTools.length > 0) {
      const otherMcp = groups.find(g => g.name === "Other MCP") || { name: "Other MCP", capabilities: [] };
      if (!groups.includes(otherMcp)) groups.push(otherMcp);

      for (const tool of unmappedMcpTools) {
        otherMcp.capabilities.push({
          id: `other-mcp-${tool.name}`,
          name: tool.name,
          description: tool.description,
          category: "Other MCP",
          mcp: { toolName: tool.name, tool },
        });
      }
    }
  }

  // Add unmapped Tauri commands
  const unmappedTauriCommands = tauriCommands.filter(c => !mappedTauri.has(c.name));
  if (unmappedTauriCommands.length > 0) {
    const otherTauri = groups.find(g => g.name === "Other Tauri") || { name: "Other Tauri", capabilities: [] };
    if (!groups.includes(otherTauri)) groups.push(otherTauri);

    for (const cmd of unmappedTauriCommands) {
      otherTauri.capabilities.push({
        id: `other-tauri-${cmd.name}`,
        name: cmd.name,
        description: "",
        category: "Other Tauri",
        tauri: { commandName: cmd.name, module: cmd.module },
      });
    }
  }

  // Add unmapped API endpoints
  if (apiEndpoints) {
    const unmappedApiEndpoints = apiEndpoints.filter(e => !mappedApi.has(e.path));
    if (unmappedApiEndpoints.length > 0) {
      const otherApi = groups.find(g => g.name === "Other API") || { name: "Other API", capabilities: [] };
      if (!groups.includes(otherApi)) groups.push(otherApi);

      for (const endpoint of unmappedApiEndpoints) {
        otherApi.capabilities.push({
          id: `other-api-${endpoint.method}-${endpoint.path}`,
          name: `${endpoint.method} ${endpoint.path}`,
          description: endpoint.description,
          category: "Other API",
          api: { endpoint },
        });
      }
    }
  }

  // Sort groups by predefined order
  const sortOrder = ["Work", "CRM", "Documents", "Generate", "Intercom", "VAL Sync", "Outlook", "Files", "Search", "Settings", "Terminal", "Auth", "MCP", "Other MCP", "Other Tauri", "Other API"];
  groups.sort((a, b) => {
    const aIndex = sortOrder.indexOf(a.name);
    const bIndex = sortOrder.indexOf(b.name);
    if (aIndex === -1 && bIndex === -1) return a.name.localeCompare(b.name);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  return groups;
}

// React hook for unified capabilities
export function useUnifiedCapabilities() {
  const mcpQuery = useMcpTools();
  const apiQuery = useOpenApi();
  const tauriCommands = generatedTauriCommands.commands as TauriCommand[];

  const data = useMemo(() => {
    return buildUnifiedCapabilities(mcpQuery.data, tauriCommands, apiQuery.data);
  }, [mcpQuery.data, tauriCommands, apiQuery.data]);

  // Count totals
  const counts = useMemo(() => {
    let mcp = 0, tauri = 0, api = 0;
    for (const group of data) {
      for (const cap of group.capabilities) {
        if (cap.mcp) mcp++;
        if (cap.tauri) tauri++;
        if (cap.api) api++;
      }
    }
    return { mcp, tauri, api, total: data.reduce((sum, g) => sum + g.capabilities.length, 0) };
  }, [data]);

  return {
    data,
    counts,
    isLoading: mcpQuery.isLoading || apiQuery.isLoading,
    error: mcpQuery.error || apiQuery.error,
    refetch: () => {
      mcpQuery.refetch();
      apiQuery.refetch();
    },
  };
}
