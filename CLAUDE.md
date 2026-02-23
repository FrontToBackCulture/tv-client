# tv-client

A shared workspace for humans and AI agents. Not a productivity app. Not a dashboard. A surface where both humans and agents operate, and each other's work is visible.

## What This Is

tv-client is the visualization and review layer for the ThinkVAL operating system. The primary interaction model is:

```
Human intent
  → Agent (bot with skills + MCP tools)
    → Supabase (shared state)
      → tv-client (renders for both human and agent)
        → Human reviews / redirects
          → Agent continues
```

**Agents are the primary input layer.** Claude Code + tv-mcp creates CRM records, triages emails, manages tasks, syncs domains. tv-client renders the results in real-time. The app serves two audiences simultaneously:

- **Humans** — reviewing agent output, making decisions, quick edits, redirecting
- **Agents** — reading app state for context, writing structured results back

This means: **don't build input-heavy UIs when agents handle it.** Build great visualization, review flows, and lightweight micro-interactions for quick human adjustments.

## Design Principles

1. **Agent output is app state.** When a bot creates a deal or triages an email, it's not a chat message — it's a persistent record in a pipeline, a classified email, a task on a board. The agent's work IS the app.

2. **Visualization over data entry.** The app excels at showing state, not capturing input. Forms and CRUD exist for micro-interactions, but the heavy lifting happens through MCP tools.

3. **Review, don't recreate.** Agents produce work. Humans review it. Build review queues and approval flows, not authoring tools that duplicate what Claude already does better.

4. **Real-time by default.** Agent actions should appear immediately. Supabase realtime + React Query invalidation makes this work. Every module should subscribe to relevant changes.

5. **Cross-module connections matter.** A deal in CRM should link to tasks in Work, files in Library, and domains in Product. These connections are what make "one app" better than switching between tools.

## Module Purpose

Each module has a specific role in the human-agent loop:

| Module | Role | Primary Use |
|--------|------|-------------|
| **Library** | Knowledge base viewer | Browse and view tv-knowledge (source of truth). Render markdown, JSON, SQL, CSV, images, Excalidraw. Artifact review grids for domain models. |
| **Product** | Operational control panel | Review and sync domain configurations, inspect schemas, verify connectors, manage platform catalog. Heaviest operational module. |
| **CRM** | Sales state display | View deal pipeline, company/contact records, activity history. Records created/updated primarily via MCP. |
| **Work** | Task state display | View task boards, project status, inbox. Tasks created/managed primarily via MCP. |
| **Inbox** | Email data pipeline | Collect and classify Outlook emails for AI context. Background data collection — builds queryable email corpus even when not actively used. |
| **Bot** | Agent catalog | View individual bots, their skills, and capabilities. Introspection into the agent layer. |
| **Portal** | Client-facing surface | Help center, announcements, conversations. Intended to replace Intercom. The module that will face external users. |
| **Settings** | Configuration | API keys, credentials, sync paths, MCP endpoints. Admin plumbing. |
| **System** | Dev tools | MCP tool browser, Tauri command explorer. Internal reference. |
| **Console** | Terminal | xterm.js shell access. Will evolve as Portal's conversation backend matures. |

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite 6, Tailwind CSS, Zustand (state), TanStack React Query (data)
- **Backend:** Supabase (database + auth + realtime), Tauri 2 (desktop shell + Rust commands)
- **Key libraries:** ag-grid (enterprise tables), TipTap (rich text), Excalidraw (diagrams), xterm.js (terminal)
- **AI integration:** tv-mcp (MCP server for Claude Code to read/write app state)

## Architecture

```
src/
├── modules/          # Feature modules (one per activity bar icon)
│   ├── library/      # Knowledge base viewer
│   ├── product/      # Platform catalog + domain review
│   ├── crm/          # Sales pipeline
│   ├── work/         # Task management
│   ├── inbox/        # Email integration
│   ├── bot/          # Agent catalog
│   ├── portal/       # Client-facing help/announcements
│   ├── settings/     # Configuration
│   ├── system/       # Dev tools
│   └── console/      # Terminal
├── hooks/            # Data fetching (React Query + Supabase)
├── stores/           # Zustand state management
├── shell/            # App chrome (ActivityBar, StatusBar, CommandPalette)
├── components/       # Shared UI components
├── lib/              # Types, utilities, Supabase client
└── styles/           # Tailwind config

src-tauri/src/
├── commands/         # Tauri IPC (file ops, auth, sync, outlook, terminal)
├── mcp/              # MCP server implementation
└── bin/tv-mcp.rs     # Standalone MCP binary
```

## Implementation Docs

These files cover how to build within the app:

- **COMPONENTS.md** — Reusable component catalog with usage examples
- **MODULES.md** — Step-by-step guide to add new modules
- **MECHANISMS.md** — State management, data fetching, hooks, realtime patterns

## Data Flow

```
React UI
  ↓ renders from
Zustand Stores (app state, auth, tabs, preferences)
  ↓ fed by
TanStack React Query (server state, caching, realtime invalidation)
  ↓ fetches from
Supabase Client (direct) OR Tauri IPC (desktop features)
  ↓ backed by
Supabase Backend (Postgres + Realtime) OR Rust Commands (file system, OAuth, sync)
```

Agent writes flow the reverse direction:
```
Claude Code → tv-mcp tool call → Supabase insert/update → Realtime event → React Query invalidation → UI re-renders
```

## Build Commands

```bash
npm run dev              # Vite dev server (web)
npm run build            # Production build
npm run tauri:dev        # Tauri desktop dev mode
npm run tauri:build      # Build desktop app
```

## What to Prioritize When Building

**High value:**
- Product module review workflows (daily operational use)
- Library rendering accuracy (source of truth must be reliable)
- Agent activity provenance (who created what and why)
- Cross-module linking (CRM ↔ Work ↔ Library ↔ Product)
- Review queues for agent output

**Medium value:**
- Micro-interaction polish (quick edits in CRM/Work without needing Claude)
- Portal evolution toward Intercom replacement
- Bot module showing agent activity history, not just skill catalog

**Lower priority:**
- Heavy input forms (agents handle bulk data entry)
- System module (dev reference, rarely used)
- Features that duplicate what Claude Code already does well
