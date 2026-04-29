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
  TV_MCP("add-activity"),
  TV_MCP("list-activities"),
  TV_MCP("find-company"),
  TV_MCP("get-company"),
];

const TASK_TOOLS = [
  ...COMMON_TOOLS,
  TV_MCP("get-task"),
  TV_MCP("update-task"),
  TV_MCP("list-tasks"),
  TV_MCP("create-task"),
  TV_MCP("get-project"),
  TV_MCP("add-activity"),
];

const COMPANY_TOOLS = [
  ...COMMON_TOOLS,
  TV_MCP("get-company"),
  TV_MCP("update-company"),
  TV_MCP("find-company"),
  TV_MCP("list-companies"),
  TV_MCP("list-contacts"),
  TV_MCP("create-contact"),
  TV_MCP("update-contact"),
  TV_MCP("add-activity"),
  TV_MCP("list-activities"),
];

// Short entity overlay — appended to the bot's CLAUDE.md by botMentionHandler.
// Persona/scope/data-model text lives in CLAUDE.md, NOT here.
// Substitutions: {name}, {id} replaced before sending.
export const ENTITY_CHAT_CONFIG: Record<EntityType, EntityChatConfig> = {
  project: {
    label: "Project Chat",
    folderPathField: "folder_path",
    tools: PROJECT_TOOLS,
    systemPrompt:
      'Currently scoped to project "{name}" (id: `{id}`). Use `get-project` with this id for details. All updates apply to this project.',
  },
  deal: {
    label: "Deal Chat",
    folderPathField: "folder_path",
    tools: PROJECT_TOOLS,
    systemPrompt:
      'Currently scoped to deal "{name}" (id: `{id}`). Use `get-project` with this id for details. All updates (fields, activities, tasks) apply to this deal.',
  },
  task: {
    label: "Task Chat",
    tools: TASK_TOOLS,
    systemPrompt:
      'Currently scoped to task "{name}" (id: `{id}`). Use `get-task` with this id for details, `update-task` for changes.',
  },
  company: {
    label: "Company Chat",
    folderPathField: "client_folder_path",
    tools: COMPANY_TOOLS,
    systemPrompt:
      'Currently scoped to company "{name}" (id: `{id}`). Use `get-company` with this id for details.',
  },
  contact: {
    label: "Contact Chat",
    tools: [
      ...COMMON_TOOLS,
      TV_MCP("find-contact"),
      TV_MCP("update-contact"),
      TV_MCP("get-company"),
      TV_MCP("add-activity"),
    ],
    systemPrompt:
      'Currently scoped to contact "{name}" (id: `{id}`). Use `find-contact` with this id for details.',
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
      'Currently scoped to initiative "{name}" (id: `{id}`).',
  },
  blog_article: {
    label: "Article Chat",
    tools: [...COMMON_TOOLS, TV_MCP("get-blog-article"), TV_MCP("update-blog-article")],
    systemPrompt:
      'Currently scoped to blog article "{name}" (id: `{id}`). Use `get-blog-article` to read, `update-blog-article` to edit.',
  },
  skill: {
    label: "Skill Chat",
    tools: [...COMMON_TOOLS, TV_MCP("list-skills"), TV_MCP("register-skill")],
    systemPrompt:
      'Currently scoped to skill "{name}" (slug: `{id}`). SKILL.md lives at `_skills/{id}/SKILL.md`.',
  },
  mcp_tool: {
    label: "MCP Tool Chat",
    tools: COMMON_TOOLS,
    systemPrompt:
      'Currently scoped to MCP tool "{name}" (slug: `{id}`). tv-mcp source lives at `~/Code/SkyNet/tv-mcp/`.',
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
      'Currently scoped to VAL domain "{name}" (id: `{id}`). Schema lives at `0_Platform/domains/{id}/schema/`. Never guess table or column names — read `schema/all_tables.json` first.',
  },
  // Fallback when the modal can't resolve a specific entity — overridden by
  // getModuleChatConfig(moduleId) for known module ids.
  module: {
    label: "Module Chat",
    tools: COMMON_TOOLS,
    systemPrompt: 'Currently scoped to the {name} module.',
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
    systemPrompt: "Currently scoped to the Projects module — work across any project, deal, or milestone.",
  },
  work: {
    label: "Tasks Chat",
    tools: TASK_TOOLS,
    systemPrompt: "Currently scoped to the Tasks module — work across any task in any project.",
  },
  crm: {
    label: "CRM Chat",
    tools: COMPANY_TOOLS,
    systemPrompt: "Currently scoped to the CRM module — companies, contacts, activities.",
  },
  skills: {
    label: "Skills Chat",
    tools: [...COMMON_TOOLS, TV_MCP("list-skills"), TV_MCP("register-skill")],
    systemPrompt: "Currently scoped to the Skills module. Skills live at `_skills/{slug}/SKILL.md`.",
  },
  "mcp-tools": {
    label: "MCP Tools Chat",
    tools: COMMON_TOOLS,
    systemPrompt: "Currently scoped to the MCP Tools module. tv-mcp source lives at `~/Code/SkyNet/tv-mcp/`.",
  },
  domains: {
    label: "Domains Chat",
    tools: [...COMMON_TOOLS, TV_MCP("sync-val-list-domains"), TV_MCP("execute-val-sql")],
    systemPrompt: "Currently scoped to the Domains module. Domain configs live under `0_Platform/domains/`.",
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
    systemPrompt: "Currently scoped to the Blog module — draft, edit, publish articles.",
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
    systemPrompt: "Currently scoped to the Email module — campaigns, drafts, outreach.",
  },
  // Virtual sub-scopes — pushed by views that drill into a class of entities
  // without picking a specific row (e.g., Metadata's Companies tab).
  companies: {
    label: "Companies Chat",
    tools: [
      ...COMMON_TOOLS,
      TV_MCP("list-companies"),
      TV_MCP("find-company"),
      TV_MCP("get-company"),
      TV_MCP("create-company"),
      TV_MCP("update-company"),
      TV_MCP("delete-company"),
      TV_MCP("list-contacts"),
      TV_MCP("add-activity"),
      TV_MCP("list-activities"),
    ],
    systemPrompt: "Currently scoped to all companies — work across the full company list.",
  },
  contacts: {
    label: "Contacts Chat",
    tools: [
      ...COMMON_TOOLS,
      TV_MCP("list-contacts"),
      TV_MCP("find-contact"),
      TV_MCP("create-contact"),
      TV_MCP("update-contact"),
      TV_MCP("get-company"),
      TV_MCP("add-activity"),
    ],
    systemPrompt: "Currently scoped to all contacts — work across all companies.",
  },
};

const GENERAL_MODULE_CONFIG: EntityChatConfig = {
  label: "Workspace Chat",
  tools: [
    ...COMMON_TOOLS,
    TV_MCP("list-projects"),
    TV_MCP("list-tasks"),
    TV_MCP("list-companies"),
    TV_MCP("list-skills"),
  ],
  systemPrompt: "Currently in the {name} module — no specific entity selected.",
};

export function getModuleChatConfig(moduleId: string): EntityChatConfig {
  return MODULE_CONFIGS[moduleId] ?? GENERAL_MODULE_CONFIG;
}

export function getEntityChatConfig(type: EntityType): EntityChatConfig {
  return ENTITY_CHAT_CONFIG[type];
}
