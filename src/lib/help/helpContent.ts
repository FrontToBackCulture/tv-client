// src/lib/help/helpContent.ts
// Module context and suggested questions for the in-app help bot.
// The main knowledge base lives in tv-knowledge/7_Knowledge/tv-desktop/help-bot-knowledge.md
// and is read by Rust at runtime.

/** Relative path from tv-knowledge root to the help bot knowledge file */
export const HELP_KNOWLEDGE_PATH = "7_Knowledge/tv-desktop/help-bot-knowledge.md";

const MODULE_CONTEXT: Record<string, string> = {
  library: `The user is in **Library**. They can browse files, open viewers, use folder AI chat, search, and manage favorites. The file tree is on the left, content on the right. Tabs at top track open files. ⌘. toggles a split view.`,

  crm: `The user is in **CRM**. Four tabs: Pipeline (deal kanban), Directory (all companies), Clients (client-stage only), Closed Deals (won/lost). Click a company to see its detail panel with Timeline, Contacts, and Deals sub-tabs. Drag deals between pipeline columns. Log activities on companies.`,

  work: `The user is in **Work**. Four views: My Tasks (assigned to me), Dashboard (project overview), Board (kanban per project), Tracker (flagged/overdue). Click tasks to edit. Drag tasks between status columns on the Board. Create projects, milestones, and initiatives.`,

  product: `The user is in **Product**. Six tabs: Platform, Solutions, Domains, Data Model, Categories, AI Skills. Domains tab is most used — select a domain to see Overview/Review/Files/Sync/History/AI sub-tabs. Must set credentials and sync before exploring data.`,

  bot: `The user is in **Bots**. Left: bot list (team bots and personal bots). Right: selected bot detail with overview, skills, sessions. "Start Session" opens Claude Code in the bot's folder. Bots are defined by CLAUDE.md files.`,

  inbox: `The user is in **Inbox**. Left sidebar: folder/category/status filters. Center: email list. Right: email detail. Emails auto-link to CRM companies by sender domain. Requires Outlook auth in Settings.`,

  system: `The user is in **System**. System health monitoring, logs, and background job status.`,

  settings: `The user is in **Settings**. Six sub-views: API Keys (Anthropic/Supabase/Gamma/Gemini/GitHub/Intercom), VAL Credentials (per-domain), Sync Paths (knowledge folder), MCP Endpoints, Claude Code (CLI + TV-MCP setup), Bots (directory paths). Keys stored in OS keychain.`,
};

const MODULE_SUGGESTIONS: Record<string, string[]> = {
  library: [
    "How do I search for files?",
    "What file types can I view?",
    "How does folder AI chat work?",
    "How do I use the split view?",
  ],
  crm: [
    "How do I add a new company?",
    "How do deal stages work?",
    "How do I log a meeting?",
    "How do emails link to companies?",
  ],
  work: [
    "How do I create a task?",
    "How do I move tasks between columns?",
    "What are milestones for?",
    "How do initiatives work?",
  ],
  product: [
    "How do I sync a VAL domain?",
    "How do I run a health check?",
    "How do I execute SQL queries?",
    "What is the AI package?",
  ],
  bot: [
    "How do I start a bot session?",
    "What is CLAUDE.md?",
    "How do bots remember context?",
    "How do I create a new bot?",
  ],
  inbox: [
    "How do I set up Outlook?",
    "How does auto-linking work?",
    "What are email categories?",
    "How do I link an email to a deal?",
  ],
  settings: [
    "What API keys do I need?",
    "How do I set up Claude Code?",
    "How do I configure VAL credentials?",
    "What's the setup order for new users?",
  ],
  system: [
    "What can I monitor here?",
    "How do I check background jobs?",
    "What keyboard shortcuts are available?",
    "How do I troubleshoot sync issues?",
  ],
};

const DEFAULT_SUGGESTIONS = [
  "What can I do in this app?",
  "How do I set up Claude Code?",
  "Where are Settings?",
  "How do I manage tasks?",
  "What keyboard shortcuts are available?",
];

interface ViewContext {
  view: string | null;
  viewLabel: string | null;
  detail: string | null;
}

/**
 * Build the module-context portion of the system prompt.
 * The main knowledge base is read from disk by Rust and prepended.
 */
export function buildSystemPrompt(activeModule?: string, viewContext?: ViewContext): string {
  let prompt = "";
  if (activeModule && MODULE_CONTEXT[activeModule]) {
    prompt += `## Current Context\n\n${MODULE_CONTEXT[activeModule]}`;

    if (viewContext?.viewLabel) {
      prompt += `\n\nThe user is currently on the **${viewContext.viewLabel}** tab/view within ${activeModule}.`;
    }
    if (viewContext?.detail) {
      prompt += ` They are looking at: ${viewContext.detail}.`;
    }

    prompt += `\n\nTailor your answers to what's relevant in the ${activeModule} module and their current view. If the user asks a general question, still answer it but mention how it relates to what they're currently viewing when appropriate.`;
  }
  return prompt;
}

export function getSuggestedQuestions(activeModule?: string): string[] {
  if (activeModule && MODULE_SUGGESTIONS[activeModule]) {
    return MODULE_SUGGESTIONS[activeModule];
  }
  return DEFAULT_SUGGESTIONS;
}
