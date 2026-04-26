// Per-entity-type chat config: what tools the agent gets, what the system
// prompt seeds, how to resolve cwd from the entity record.
//
// v0: hardcoded defaults baked in. Settings panel comes later — when it does,
// it'll merge over `defaultsByType`.

import type { EntityType } from "../stores/selectedEntityStore";

const COMMON_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep", "Bash"];

const TV_MCP = (n: string) => `mcp__tv-mcp__${n}`;

export interface EntityChatConfig {
  /** Allowed tools (built-ins + MCP tools). */
  tools: string[];
  /** System prompt. Use {name} placeholder for the entity name. */
  systemPrompt: string;
  /** Field name on the entity record holding the absolute or workspace-relative folder path. */
  folderPathField?: string;
  /** Display label, e.g. "Project Chat", "Company Chat". */
  label: string;
}

const PROJECT_TOOLS = [
  ...COMMON_TOOLS,
  TV_MCP("get-project"),
  TV_MCP("update-project"),
  TV_MCP("list-projects"),
  TV_MCP("create-task"),
  TV_MCP("list-tasks"),
  TV_MCP("update-task"),
  TV_MCP("get-task"),
  TV_MCP("create-project-update"),
  TV_MCP("add-project-session"),
  TV_MCP("log-activity"),
  TV_MCP("list-activities"),
  TV_MCP("find-crm-company"),
  TV_MCP("get-crm-company"),
];

const TASK_TOOLS = [
  ...COMMON_TOOLS,
  TV_MCP("get-task"),
  TV_MCP("update-task"),
  TV_MCP("list-tasks"),
  TV_MCP("create-task"),
  TV_MCP("get-project"),
  TV_MCP("log-activity"),
];

const COMPANY_TOOLS = [
  ...COMMON_TOOLS,
  TV_MCP("get-crm-company"),
  TV_MCP("update-crm-company"),
  TV_MCP("find-crm-company"),
  TV_MCP("list-crm-companies"),
  TV_MCP("list-crm-contacts"),
  TV_MCP("create-crm-contact"),
  TV_MCP("update-crm-contact"),
  TV_MCP("log-activity"),
  TV_MCP("list-activities"),
];

export const ENTITY_CHAT_CONFIG: Record<EntityType, EntityChatConfig> = {
  project: {
    label: "Project Chat",
    folderPathField: "folder_path",
    tools: PROJECT_TOOLS,
    systemPrompt:
      'You are bot-mel scoped to project "{name}". Read it first if you need details. ' +
      "All updates apply to this project. Confirm destructive changes before making them.",
  },
  deal: {
    label: "Deal Chat",
    folderPathField: "folder_path",
    tools: PROJECT_TOOLS,
    systemPrompt:
      'You are bot-mel scoped to deal "{name}". Read it first if you need details. ' +
      "All updates (fields, activities, tasks) apply to this deal.",
  },
  task: {
    label: "Task Chat",
    tools: TASK_TOOLS,
    systemPrompt:
      'You are bot-mel scoped to task "{name}". Read it first if you need details. ' +
      "All updates apply to this task or its parent project.",
  },
  company: {
    label: "Company Chat",
    folderPathField: "client_folder_path",
    tools: COMPANY_TOOLS,
    systemPrompt:
      'You are bot-mel scoped to company "{name}". Read it first if you need details. ' +
      "Use it for CRM updates, contact management, activity logging.",
  },
  contact: {
    label: "Contact Chat",
    tools: [
      ...COMMON_TOOLS,
      TV_MCP("find-crm-contact"),
      TV_MCP("update-crm-contact"),
      TV_MCP("get-crm-company"),
      TV_MCP("log-activity"),
    ],
    systemPrompt:
      'You are bot-mel scoped to contact "{name}". Read it first if you need details. ' +
      "Use it for contact updates and logging interactions.",
  },
  initiative: {
    label: "Initiative Chat",
    tools: [
      ...COMMON_TOOLS,
      TV_MCP("update-initiative"),
      TV_MCP("list-initiative-projects"),
      TV_MCP("add-project-to-initiative"),
      TV_MCP("remove-project-from-initiative"),
    ],
    systemPrompt:
      'You are bot-mel scoped to initiative "{name}". Use it for managing the ' +
      "initiative's projects, status, and notes.",
  },
  blog_article: {
    label: "Article Chat",
    tools: [...COMMON_TOOLS, TV_MCP("get-blog-article"), TV_MCP("update-blog-article")],
    systemPrompt:
      'You are bot-mel scoped to blog article "{name}". Help draft, edit, or ' +
      "publish it.",
  },
  skill: {
    label: "Skill Chat",
    tools: [...COMMON_TOOLS, TV_MCP("list-skills"), TV_MCP("register-skill")],
    systemPrompt:
      'You are bot-mel scoped to skill "{name}". Help review, edit, test, or ' +
      "improve this skill. The SKILL.md file lives in `_skills/{name}/SKILL.md`.",
  },
  mcp_tool: {
    label: "MCP Tool Chat",
    tools: COMMON_TOOLS,
    systemPrompt:
      'You are bot-mel scoped to MCP tool "{name}". Help review or improve ' +
      "this tool. tv-mcp source lives in `~/Code/SkyNet/tv-mcp/`.",
  },
  domain: {
    label: "Domain Chat",
    tools: [
      ...COMMON_TOOLS,
      TV_MCP("execute-val-sql"),
      TV_MCP("sync-val-tables"),
      TV_MCP("sync-val-fields"),
      TV_MCP("sync-val-queries"),
      TV_MCP("sync-val-workflows"),
      TV_MCP("sync-val-dashboards"),
      TV_MCP("sync-val-status"),
      TV_MCP("sync-val-list-domains"),
    ],
    systemPrompt:
      'You are bot-mel scoped to VAL domain "{name}". Domain config and ' +
      "schema live in `0_Platform/domains/{name}/`. NEVER guess table or " +
      "column names — read `schema/all_tables.json` first.",
  },
  // Fallback used when nothing specific is selected — the actual tools and
  // prompt come from getModuleChatConfig(moduleId) at runtime.
  module: {
    label: "Module Chat",
    tools: COMMON_TOOLS,
    systemPrompt:
      'You are bot-mel scoped to the {name} module. Help with anything in this area.',
  },
};

// ---------------------------------------------------------------------------
// Module-level configs — used when no specific entity is selected.
// Keyed by ModuleId from appStore. Falls back to a broad "general" config.
// ---------------------------------------------------------------------------

const MODULE_CONFIGS: Record<string, EntityChatConfig> = {
  projects: {
    label: "Projects Chat",
    tools: PROJECT_TOOLS,
    systemPrompt:
      "You are bot-mel scoped to the Projects module. Help find, create, " +
      "update, or analyze projects, deals, tasks, and milestones.",
  },
  work: {
    label: "Tasks Chat",
    tools: TASK_TOOLS,
    systemPrompt:
      "You are bot-mel scoped to the Tasks module. Help find, create, " +
      "update, or organize tasks across all projects.",
  },
  crm: {
    label: "CRM Chat",
    tools: COMPANY_TOOLS,
    systemPrompt:
      "You are bot-mel scoped to the CRM module. Help find, update, or " +
      "research companies and contacts. Log activities as needed.",
  },
  skills: {
    label: "Skills Chat",
    tools: [...COMMON_TOOLS, TV_MCP("list-skills"), TV_MCP("register-skill")],
    systemPrompt:
      "You are bot-mel scoped to the Skills module. Help review, edit, test, " +
      "or improve any skill. Skills live in `_skills/{slug}/SKILL.md`.",
  },
  "mcp-tools": {
    label: "MCP Tools Chat",
    tools: COMMON_TOOLS,
    systemPrompt:
      "You are bot-mel scoped to the MCP Tools module. Help review or improve " +
      "any tv-mcp tool. tv-mcp source lives in `~/Code/SkyNet/tv-mcp/`.",
  },
  domains: {
    label: "Domains Chat",
    tools: [...COMMON_TOOLS, TV_MCP("sync-val-list-domains"), TV_MCP("execute-val-sql")],
    systemPrompt:
      "You are bot-mel scoped to the Domains module. Help find, sync, or " +
      "explore VAL domains. Domain configs live under `0_Platform/domains/`.",
  },
  blog: {
    label: "Blog Chat",
    tools: [
      ...COMMON_TOOLS,
      TV_MCP("list-blog-articles"),
      TV_MCP("get-blog-article"),
      TV_MCP("create-blog-article"),
      TV_MCP("update-blog-article"),
    ],
    systemPrompt:
      "You are bot-mel scoped to the Blog module. Help draft, edit, or " +
      "publish blog articles.",
  },
  email: {
    label: "Email Chat",
    tools: [
      ...COMMON_TOOLS,
      TV_MCP("list-email-campaigns"),
      TV_MCP("create-email-campaign"),
      TV_MCP("create-email-draft"),
      TV_MCP("send-email"),
    ],
    systemPrompt:
      "You are bot-mel scoped to the Email module. Help draft, review, or " +
      "schedule email campaigns and outreach.",
  },
  // Virtual sub-scopes — pushed by views that drill into a class of entities
  // without picking a specific row (e.g., Metadata's Companies tab).
  companies: {
    label: "Companies Chat",
    tools: [
      ...COMMON_TOOLS,
      TV_MCP("list-crm-companies"),
      TV_MCP("find-crm-company"),
      TV_MCP("get-crm-company"),
      TV_MCP("create-crm-company"),
      TV_MCP("update-crm-company"),
      TV_MCP("delete-crm-company"),
      TV_MCP("list-crm-contacts"),
      TV_MCP("log-activity"),
      TV_MCP("list-activities"),
    ],
    systemPrompt:
      "You are bot-mel scoped to all companies. Help find, compare, update, " +
      "or analyze any company in the CRM. You can answer questions across " +
      "the full company list.",
  },
  contacts: {
    label: "Contacts Chat",
    tools: [
      ...COMMON_TOOLS,
      TV_MCP("list-crm-contacts"),
      TV_MCP("find-crm-contact"),
      TV_MCP("create-crm-contact"),
      TV_MCP("update-crm-contact"),
      TV_MCP("get-crm-company"),
      TV_MCP("log-activity"),
    ],
    systemPrompt:
      "You are bot-mel scoped to all contacts. Help find, update, or " +
      "manage any contact across all companies.",
  },
};

const GENERAL_MODULE_CONFIG: EntityChatConfig = {
  label: "Workspace Chat",
  tools: [
    ...COMMON_TOOLS,
    TV_MCP("list-projects"),
    TV_MCP("list-tasks"),
    TV_MCP("list-crm-companies"),
    TV_MCP("list-skills"),
  ],
  systemPrompt:
    "You are bot-mel. The user is on the {name} page with no specific entity " +
    "selected. Help with whatever they need across the workspace.",
};

export function getModuleChatConfig(moduleId: string): EntityChatConfig {
  return MODULE_CONFIGS[moduleId] ?? GENERAL_MODULE_CONFIG;
}

export function getEntityChatConfig(type: EntityType): EntityChatConfig {
  return ENTITY_CHAT_CONFIG[type];
}
