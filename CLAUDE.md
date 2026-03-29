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

**Required reading before building anything new:**

- **COMPONENTS.md** — Full component catalog; use what exists before building new components
- **MODULES.md** — Step-by-step guide to add a new module; follow it exactly
- **MECHANISMS.md** — State management, data fetching, hooks, realtime patterns in detail

## Build Patterns

**IMPORTANT: Before building any new feature, read COMPONENTS.md, MECHANISMS.md, and MODULES.md.**

### File Organization
- Module files: `src/modules/{name}/` — `{Name}Module.tsx`, view files, detail panels, forms
- Hooks: `src/hooks/{name}/` — `keys.ts`, `use{Entity}.ts` per entity, `index.ts` re-exports
- Types: `src/lib/{name}/types.ts` — entity type, `EntityInsert`, `EntityUpdate`, constants
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

## Build Commands

```bash
npm run dev              # Vite dev server (web)
npm run build            # Production build
npm run lint             # ESLint
npm run tsc              # TypeScript type check (no emit)
npm run tauri:dev        # Tauri desktop dev mode
npm run tauri:build      # Build desktop app
```

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

```bash
cd src-tauri
cargo build --bin tv-mcp           # DEBUG only — release build hangs (Tauri AppKit/WebKit linking)
ln -sf "$(pwd)/target/debug/tv-mcp" ~/.tv-desktop/bin/tv-mcp   # symlink, not cp (avoids macOS quarantine)
pkill -9 tv-mcp                    # kill running processes so Claude Code reconnects to the new binary
```

The binary at `~/.tv-desktop/bin/tv-mcp` is what Claude Code connects to (configured in `~/.claude/mcp.json`). The Tauri app and this binary share the same `src-tauri/src/mcp/` module but are separate compiled binaries. **Running tv-mcp processes must be killed after rebuilding** — Claude Code auto-restarts the MCP server on the next tool call, but won't pick up the new binary while the old process is alive.

### Supabase credentials — not in `.env`

Credentials are configured in-app via Settings → Credentials and stored in the OS keychain via Tauri's store plugin. There is no `.env` file for Supabase. Without URL + anon key configured in settings, all data hooks will fail silently.

### Version bumping — three files must stay in sync

When bumping the app version, update all three or the release CI check fails:
1. `package.json` — Vite `__APP_VERSION__` (UI display)
2. `src-tauri/Cargo.toml` — Rust binary metadata
3. `src-tauri/tauri.conf.json` — Tauri installer filename + the version the updater checks
