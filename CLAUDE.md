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

### Core Operations

| Module | Role | Primary Use |
|--------|------|-------------|
| **Home** | Dashboard | Landing page with briefing feed, quick actions, and activity overview. |
| **Library** | Knowledge base viewer | Browse and view tv-knowledge (source of truth). Render markdown, JSON, SQL, CSV, images, Excalidraw. Artifact review grids for domain models. |
| **Product** | Operational control panel | Review and sync domain configurations, inspect schemas, verify connectors, manage platform catalog. Heaviest operational module. |
| **Domains** | Domain management | VAL domain operations — schema review, health checks, connector status, data model inspection. |
| **Work** | Task & project management | Task boards, project status, inbox, triage context, task dashboard. Tasks created/managed primarily via MCP. |
| **Projects** | Project tracking | Project lifecycle, sessions, artifacts, updates. Distinct from Work's task focus. |

### Sales & CRM

| Module | Role | Primary Use |
|--------|------|-------------|
| **CRM** | Sales state display | Deal pipeline, company/contact records, activity history. Records created/updated primarily via MCP. |
| **Prospecting** | Sales prospecting | Lead research, Apollo integration, outreach planning. |
| **LinkedIn** | LinkedIn integration | Profile lookup, connection management, outreach workflows. |
| **Referrals** | Referral tracking | Partner referral pipeline and tracking. |
| **Analytics** | Analytics & reporting | Data visualization, metrics dashboards, report generation. |

### Communication & Content

| Module | Role | Primary Use |
|--------|------|-------------|
| **Inbox** | Email data pipeline | Collect and classify Outlook emails for AI context. Background data collection — builds queryable email corpus. |
| **Shared Inbox** | Shared mailbox view | Microsoft Graph–synced shared mailbox threads, classification, replies. |
| **Email** | Email campaigns | Campaign creation, contact management, templates, bulk sending. Distinct from Inbox's classification focus. |
| **Chat** | Messaging | Thread-based messaging, inbox filtering, participant management, DIO automations. |
| **Calendar** | Scheduling | Calendar view and event management. |
| **Blog** | Content management | Blog article creation, editing, publishing workflow. |

### Finance & Investment

| Module | Role | Primary Use |
|--------|------|-------------|
| **Finance** | FY review & accounting | FY review (QBO-style P&L, snapshots, drift alerts, recognition, reconciliation), expense review, invoice recognition, account config, QBO journal entry mutations. Backed by mgmt workspace. |
| **Investment** | Investment tracking | Signals and stock detail pages, FMP-backed market data layer. |

### Knowledge & Integration

| Module | Role | Primary Use |
|--------|------|-------------|
| **Notion** | Notion integration | Bidirectional Notion sync, page rendering, database browsing. |
| **Guides** | Help content | Help articles, onboarding guides, contextual documentation. |
| **Gallery** | Media gallery | Image and artifact browsing, screenshot management. |
| **Repos** | Repository browser | Git repository browsing and code reference. |
| **S3 Browser** | File storage | S3 bucket browsing and file management. |
| **Public Data** | Public data browser | Public F&B data schemas and datasets. |
| **Metadata** | Metadata management | Entity metadata, field definitions, lookup values. |
| **Workspace** | Environment config | Workspace-level settings and environment configuration. |

### Agent & System

| Module | Role | Primary Use |
|--------|------|-------------|
| **Bot** | Agent catalog | View individual bots, their skills, and capabilities. Introspection into the agent layer. Includes the active agents rail and per-entity bot routing. |
| **Skills** | Skills registry | Skill management, ratings, verification, demo tracking. |
| **Scheduler** | Job scheduler | Background job queue, skill automations, pipeline step execution. |
| **MCP Tools** | MCP tool browser | Browse the live tv-mcp tool catalog (names, schemas, categories) for reference and skill authoring. |
| **Portal** | Client-facing surface | Help center, announcements, conversations. Intended to replace Intercom. |
| **Settings** | Configuration | API keys, credentials, sync paths, MCP endpoints. Admin plumbing. |
| **System** | Dev tools | Tauri command explorer and other internal references. |
| **Console** | Terminal | xterm.js shell access. |

## Authentication & Access Model

### Architecture

```
User/Bot → Gateway Supabase (auth) → Workspace JWT → Workspace Supabase (RLS)
```

**Two Supabase projects:**
- **Gateway** (`tccyronrnsimacqfhxzd`) — authentication + workspace discovery only
- **Workspace** (per workspace, e.g., `cqwcaeffzanfqsxlspig` for ThinkVAL) — business data

### User Auth (tv-client app)

Users sign in via **Supabase Auth** on the gateway (GitHub or Microsoft 365 OAuth). The PKCE flow:

1. `gateway.auth.signInWithOAuth()` → opens browser
2. Tauri catches callback code via local server (port 4003)
3. `gateway.auth.exchangeCodeForSession(code)` → gateway JWT
4. Gateway JWT used to query workspace memberships
5. **Edge Function `workspace-token`** mints a workspace-scoped JWT
6. Workspace JWT used for all data queries — RLS enforces access

Key files: `authStore.ts`, `workspaceStore.ts`, `gatewaySupabase.ts`, `supabase.ts`

### Bot Auth (tv-mcp)

Bots authenticate via **per-bot API keys** (not OAuth). Each bot has a unique key stored in its `.claude/mcp.json` as `TV_BOT_API_KEY` env var.

1. tv-mcp reads `TV_BOT_API_KEY` from environment on startup
2. Calls gateway **Edge Function `bot-token`** with the API key
3. Gateway validates key hash → looks up bot identity + permissions → mints workspace JWT
4. tv-mcp uses JWT for all Supabase queries (falls back to anon key if no API key set)
5. JWT auto-refreshes 5 minutes before expiry

Key files: `commands/supabase.rs` (`get_client()`, `get_bot_jwt()`, `mint_bot_jwt()`)

### Schemas & Permissions

| Schema | Purpose | Access |
|--------|---------|--------|
| `public` | CRM, tasks, projects, skills, etc. | All authenticated users and bots |
| `mgmt` | Company financials, HR, sensitive ops | Only users/bots with `mgmt` permission |
| `public_data` | Publicly available datasets | All authenticated users and bots |

Permission groups are stored in `workspace_memberships.permission_groups` on the gateway. The workspace JWT carries them in `app_metadata.permissions`. RLS policies check:

```sql
-- Public schema: any authenticated user
USING (is_workspace_authenticated())

-- Mgmt schema: requires 'mgmt' permission
USING (mgmt.has_mgmt_access())
```

### Bot API Keys

Each bot's API key determines its identity and permissions. Keys are SHA-256 hashed in the gateway's `bot_api_keys` table.

| Bot | Permissions | Key location |
|-----|-------------|-------------|
| bot-mel | `["general"]` | `tv-knowledge/_team/melvin/bot-mel/.claude/mcp.json` |
| bot-darren | `["general"]` | `tv-knowledge/_team/darren/bot-darren/.claude/mcp.json` |
| bot-gene | `["general"]` | `tv-knowledge/_team/gene/bot-gene/.claude/mcp.json` |
| bot-gloria | `["general"]` | `tv-knowledge/_team/gloria/bot-gloria/.claude/mcp.json` |
| bot-siti | `["general"]` | `tv-knowledge/_team/siti/bot-siti/.claude/mcp.json` |
| bot-yc | `["general"]` | `tv-knowledge/_team/yc/bot-yc/.claude/mcp.json` |
| bot-mgmt-mel | `["general", "mgmt"]` | `tv-mgmt-knowledge/.claude/mcp.json` (private repo) |

Default key (user-level `~/.claude.json`): bot-mel's key. Project-level configs override it.

To deactivate a bot: `UPDATE bot_api_keys SET is_active = false WHERE bot_name = 'xxx'` on gateway.

### Adding a New Permission Group

1. Add the group name to `workspace_memberships.permission_groups` on the gateway for relevant users/bots
2. Create a helper function: `CREATE FUNCTION schema.has_X_access() ...` checking `auth.jwt() -> 'app_metadata' -> 'permissions'`
3. Add RLS policies on the target tables using the helper

## Multi-Workspace Architecture

### Overview

One app, multiple completely isolated Supabase projects. Each workspace is a separate database with separate auth, credentials, and data. No data leaks between workspaces.

```
Gateway Supabase (tccyronrnsimacqfhxzd)
  ├── gateway_users         — canonical user identity
  ├── workspaces            — registry (slug, supabase_url, anon_key, icon, color)
  ├── workspace_memberships — who can access what (user_id → workspace_id + role)
  └── workspace_settings    — per-workspace API key overrides

Workspace Supabase (one per workspace)
  ├── ThinkVAL (cqwcaeffzanfqsxlspig) — CRM, tasks, projects, skills, etc.
  └── Melly    (wwicnbcaytznwgxzsoxe) — personal workspace (trading, finance, etc.)
```

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/supabase.ts` | Dynamic Proxy client — swaps underlying client on workspace switch |
| `src/lib/gatewaySupabase.ts` | Gateway singleton client (auth + workspace discovery) |
| `src/stores/workspaceStore.ts` | Workspace state, loadWorkspaces, selectWorkspace orchestration |
| `src/lib/workspaceStorage.ts` | localStorage namespacing (save/restore per workspace) |
| `src/components/WorkspacePicker.tsx` | Full-screen workspace picker (post-login) |
| `src/shell/WorkspaceSwitcher.tsx` | StatusBar dropdown for switching workspaces |
| `src-tauri/src/commands/settings.rs` | `settings_switch_workspace` — atomic multi-key write |
| `supabase/migrations/gateway/` | Gateway schema + seed SQL |

### Boot Sequence

```
1. Auth initialize (Supabase Auth on gateway via PKCE)
2. Login screen (if needed)
3. Setup wizard (if needed)
4. loadWorkspaces() → fetch workspace list from gateway
5. If multiple workspaces + none selected → show WorkspacePicker
6. If 1 workspace or previously selected → auto-connect
7. Init workspace Supabase client from Tauri settings
8. Mint workspace JWT via gateway Edge Function
9. Load team config + register user
10. Start realtime subscriptions
11. Show Shell
```

### Workspace Switch Flow

When `selectWorkspace(id)` is called:

1. **localStorage migration** — first-time only: copy existing data to `key::workspaceId` namespace
2. **localStorage swap** — save current workspace state, load new workspace state
3. **Workspace JWT** — mint via gateway Edge Function `workspace-token`
4. **Tauri settings** — atomically write `supabase_url`, `supabase_anon_key`, and any workspace-specific API keys via `settings_switch_workspace` Rust command
5. **React Query cache** — `queryClient.clear()` to prevent stale data
6. **Supabase client** — `initWorkspaceClient(url, anonKey)` swaps the Proxy target
7. **Persist** — save `activeWorkspaceId` to localStorage
8. **Reload** — `window.location.reload()` to reset all Zustand stores

### Supabase Client Proxy Pattern

The `supabase` export is a JavaScript Proxy. All 100+ files that `import { supabase }` get the Proxy, which forwards every property access to the current `_client`. When `initWorkspaceClient()` is called, `_client` changes — all existing imports seamlessly point to the new workspace. No import changes needed anywhere.

### localStorage Isolation

9 stores are workspace-scoped (prefixed with `key::workspaceId` on switch):
`moduleTabStore`, `moduleVisibilityStore`, `projectFieldsStore`, `taskFieldsStore`, `classificationStore`, `favoritesStore`, `tabStore`, `recentFilesStore`, `folderConfigStore`

6 stores are global (shared across workspaces):
`authStore`, `workspaceStore`, `botSettingsStore`, `repositoryStore`, `activityBarStore`, `sidePanelStore`

### Adding a New Workspace

1. Create a new Supabase project
2. Insert into gateway `workspaces` table: slug, display_name, supabase_url, supabase_anon_key
3. Insert into `workspace_memberships`: user_id, workspace_id, role
4. The workspace picker will show the new option on next app launch

### Tauri Backend

The Rust backend reads `supabase_url` + `supabase_anon_key` from `~/.tv-mcp/settings.json` on every `get_client()` call (no caching). When `settings_switch_workspace` writes new credentials, all subsequent Rust commands automatically hit the new workspace's Supabase. No Rust code changes needed per workspace.

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite 6, Tailwind CSS 3, Zustand 5 (state), TanStack React Query 5 (data)
- **Backend:** Supabase (database + auth + realtime), Tauri 2 (desktop shell + Rust commands)
- **Key libraries:** ag-grid (enterprise tables), TipTap (rich text), Excalidraw (diagrams), xterm.js (terminal), @dnd-kit (drag-and-drop)
- **Content rendering:** react-markdown, remark-gfm, marked, gray-matter (frontmatter), turndown (HTML→MD)
- **Integrations:** Notion API (@notionhq/client, notion-to-md), Apollo (prospecting), LinkedIn, Outlook, WhatsApp
- **AI integration:** tv-mcp (MCP server for Claude Code to read/write app state)

## Architecture

```
src/
├── modules/          # Feature modules (one per activity bar icon)
│   ├── home/         # Dashboard / briefing
│   ├── library/      # Knowledge base viewer
│   ├── product/      # Platform catalog + domain review
│   ├── domains/      # VAL domain operations
│   ├── crm/          # Sales pipeline
│   ├── work/         # Task management
│   ├── projects/     # Project tracking
│   ├── inbox/        # Email classification
│   ├── email/        # Email campaigns
│   ├── chat/         # Messaging
│   ├── calendar/     # Scheduling
│   ├── blog/         # Content management
│   ├── notion/       # Notion integration
│   ├── analytics/    # Reporting
│   ├── prospecting/  # Sales prospecting
│   ├── linkedin/     # LinkedIn integration
│   ├── referrals/    # Referral tracking
│   ├── gallery/      # Media browser
│   ├── guides/       # Help content
│   ├── repos/        # Repository browser
│   ├── s3-browser/   # S3 file browser
│   ├── public-data/  # Public datasets
│   ├── metadata/     # Metadata management
│   ├── workspace/    # Environment config
│   ├── bot/          # Agent catalog
│   ├── skills/       # Skills registry
│   ├── scheduler/    # Job scheduler
│   ├── portal/       # Client-facing surface
│   ├── settings/     # Configuration
│   ├── system/       # Dev tools
│   └── console/      # Terminal
├── hooks/            # Data fetching (React Query + Supabase)
├── stores/           # Zustand state management (25+ stores)
├── shell/            # App chrome (ActivityBar, StatusBar, CommandPalette)
├── components/       # Shared UI components
├── lib/              # Types, utilities, Supabase client
├── styles/           # Tailwind config
└── playground/       # Bot configuration/testing UI (BotPlayground, BotConfigPanel)

src-tauri/src/
├── commands/         # Tauri IPC (32+ command modules)
│   ├── analytics/    # Analytics queries
│   ├── apollo/       # Apollo people search
│   ├── auth.rs       # OAuth flows
│   ├── blog/         # Blog operations
│   ├── crm/          # CRM operations
│   ├── email/        # Email campaigns + sending
│   ├── feed/         # Feed card operations
│   ├── github_sync/  # GitHub repo sync
│   ├── linkedin/     # LinkedIn integration
│   ├── notion/       # Notion sync
│   ├── outlook/      # Outlook email integration
│   ├── public_data/  # Public data queries
│   ├── repos/        # Repository operations
│   ├── scheduler/    # Job scheduling
│   ├── tools/        # MCP tool operations
│   ├── val_sync/     # VAL domain sync
│   ├── work/         # Tasks & projects
│   ├── whatsapp.rs   # WhatsApp integration
│   ├── search.rs     # Unified search
│   ├── terminal.rs   # Terminal/shell
│   ├── files.rs      # File I/O
│   ├── gallery.rs    # Image operations
│   ├── s3_browser.rs # S3 operations
│   └── ...           # + more single-file commands
├── mcp/              # MCP server implementation
├── models/           # Shared data models
└── bin/tv-mcp.rs     # Standalone MCP binary
```

## Implementation Docs

**Required reading before building anything new:**

- **docs/dev/COMPONENTS.md** — Full component catalog; use what exists before building new components
- **docs/dev/MODULES.md** — Step-by-step guide to add a new module; follow it exactly
- **docs/dev/MECHANISMS.md** — State management, data fetching, hooks, realtime patterns in detail

## Build Patterns

**IMPORTANT: Before building any new feature, read docs/dev/COMPONENTS.md, docs/dev/MECHANISMS.md, and docs/dev/MODULES.md.**

### File Organization
- Module files: `src/modules/{name}/` — `{Name}Module.tsx`, view files, detail panels, forms
- Hooks: `src/hooks/{name}/` — `keys.ts`, `use{Entity}.ts` per entity, `index.ts` re-exports
- Types: `src/lib/{name}/types.ts` — entity type, `EntityInsert`, `EntityUpdate`, constants
- Stores: `src/stores/{name}Store.ts` — Zustand stores for UI state (tabs, selections, visibility, config)
- Rust commands: `src-tauri/src/commands/{domain}/` — `mod.rs`, `types.rs`, `{entity}.rs`; register in `main.rs`

### Frontend Patterns
- All data fetching via hooks — never query Supabase directly in components
- Query key hierarchy: `["domain", "entities", optionalId]` — see `keys.ts` in any hooks folder
- CRUD hook set per entity: `useEntities()`, `useEntity(id)`, `useCreateEntity()`, `useUpdateEntity()`, `useDeleteEntity()`
- Module layout: `h-full flex flex-col` — fixed header (`flex-shrink-0 border-b`), content area (`flex-1 flex overflow-hidden`)
- Tab state, selection state, and form visibility live in the module root — never in children
- Detail panel: right sidebar, 420px or percentage-based, `border-l border-zinc-200 dark:border-zinc-800`, scrollable; persist width to localStorage with key `tv-desktop-{module}-detail-panel-width`
- Forms: fixed modal overlay (`inset-0 z-50`), `useState` per field, display errors inline, `toast.success()` on save
- Report active view context on tab change via `useViewContextStore` — required for the help system

### Backend Patterns (Rust)
- Every command: `#[tauri::command]`, `async`, returns `CmdResult<T>`, first line is `let client = get_client().await?`
- Supabase queries: `client.select("table", "query_string").await` — REST query string format (`name=eq.value`, `stage=in.(a,b)`, `order=updated_at.desc`, `limit=50`)
- Joins in query string: `select=*,related:other_table(*)`
- Error handling: use `?` everywhere — `From<>` impls convert `reqwest::Error`, `serde_json::Error`, `io::Error` to `CommandError`
- Register new commands in `src-tauri/src/main.rs` `invoke_handler` block, grouped by domain

### Data Flow Rules
- **Frontend → Supabase direct**: all reads and writes for CRM, Work, Portal data (React Query hooks)
- **Frontend → Tauri command**: file I/O, OAuth, system operations, non-Supabase integrations only
- **Never** proxy Supabase queries through Tauri — the frontend client has direct access
- Cache invalidation: `queryClient.invalidateQueries({ queryKey: keys.entities() })` in mutation `onSuccess`; always invalidate both collection and single-item keys on update
- Realtime subscriptions live in `useRealtimeSync.ts` — add table listeners there, not in individual hooks

### UI Conventions
- Dark mode always paired: `bg-white dark:bg-zinc-950`, `text-zinc-900 dark:text-zinc-100`, `border-zinc-200 dark:border-zinc-800`
- Accent: `teal-600` for primary actions and active states; hover: `bg-zinc-100 dark:bg-zinc-800`
- Spacing: `px-4 py-2` standard padding, `gap-2` inline, `space-y-4` vertical stacking, `rounded-md` on all elements
- Icon sizes (lucide-react): 14 inline/tabs, 16 buttons, 18 headers, 24 empty states
- Use `<Button variant="primary|secondary|ghost|danger" icon={Icon}>` — never raw `<button>`
- Wrap form inputs with `<FormField label="..." required>` — handles label, error, and hint layout
- Text in flex containers: always add `truncate` + `min-w-0` to prevent overflow

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

## Scripts

Utility scripts in `scripts/`:

| Script | Purpose |
|--------|---------|
| `generate-commands.js` | Auto-generate TypeScript types from Tauri commands |
| `sync-skills.mjs` | Sync skill definitions from `_skills/` to Supabase registry |
| `sync-emails-to-supabase.mjs` | Migrate email data to Supabase |
| `setup-claude-mcp.sh` | Unix MCP setup for Claude Code |
| `setup-claude-mcp.ps1` | Windows MCP setup for Claude Code |
| `bulk-generate-writeups.mjs` | Bulk content generation |
| `import-keys.sh` | Import encryption keys |

## Build Commands

```bash
npm run dev              # Vite dev server (web)
npm run build            # TypeScript check + Vite production build
npm run preview          # Preview production build
npm run tauri:dev        # Tauri desktop dev mode
npm run tauri:build      # Build desktop app
```

Note: `tsc` runs as part of `npm run build` (not a separate script). There is no standalone `npm run lint` script.

## Gotchas

### Cargo stale builds — touch before building

Cargo uses file modification timestamps to detect changes. The Claude Code Edit tool sometimes doesn't update mtime in a way cargo detects. **Always touch edited Rust files before building:**

```bash
touch src-tauri/src/commands/the_file_you_edited.rs
cargo build --manifest-path src-tauri/Cargo.toml
```

If `cargo build` says "Finished" without "Compiling", it missed the change. The `touch` forces it. Also applies to `tauri dev` auto-rebuild.

### tv-mcp binary — rebuild after Rust changes

After any changes to `src-tauri/src/mcp/` or `src-tauri/src/commands/`, rebuild the standalone binary:

tv-mcp is a separate repo now (`../tv-mcp`). Build + install it standalone:

```bash
cd ../tv-mcp
cargo build --release
cp target/release/tv-mcp ~/.tv-mcp/bin/tv-mcp
pkill -9 tv-mcp                    # kill running process so Claude Code reconnects to the new binary
```

The binary at `~/.tv-mcp/bin/tv-mcp` is what Claude Code connects to (configured in `~/.claude.json`). **Running tv-mcp processes must be killed after rebuilding** — Claude Code auto-restarts the MCP server on the next tool call, but won't pick up the new binary while the old process is alive.

### Supabase credentials — managed by workspace store

Workspace Supabase credentials (`supabase_url`, `supabase_anon_key`) are stored in `~/.tv-mcp/settings.json` and managed by `workspaceStore.selectWorkspace()`. The gateway URL/key is hardcoded in `src/lib/gatewaySupabase.ts`. There is no `.env` file for Supabase credentials. Without credentials in settings, all data hooks will fail silently. The `settings_switch_workspace` Tauri command writes credentials atomically to prevent race conditions during workspace switching.

### Version bumping — three files must stay in sync

When bumping the app version, update all three or the release CI check fails:
1. `package.json` — Vite `__APP_VERSION__` (UI display)
2. `src-tauri/Cargo.toml` — Rust binary metadata
3. `src-tauri/tauri.conf.json` — Tauri installer filename + the version the updater checks
