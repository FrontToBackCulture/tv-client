# tv-client

The ThinkVAL desktop app. Tauri 2 shell, React 18 UI, Rust backend.

## Docs — by audience

**End users (installing the app):**
- [docs/install-guide.html](docs/install-guide.html) — install tv-client + tv-mcp on macOS and Windows
- [docs/install.md](docs/install.md) — same guide in markdown

**Humans who want a visual map of what's in here:**
- [docs/architecture.html](docs/architecture.html) — modules, shell, data flow, backend

**Developers (and Claude) working in this repo:**
- [CLAUDE.md](CLAUDE.md) — operating instructions for bot-builder, build commands, gotchas
- [docs/dev/MODULES.md](docs/dev/MODULES.md) — how to scaffold a new module
- [docs/dev/COMPONENTS.md](docs/dev/COMPONENTS.md) — reusable UI components (check before building new)
- [docs/dev/MECHANISMS.md](docs/dev/MECHANISMS.md) — hooks, patterns, architectural mechanisms to reuse
- [docs/dev/DESIGN_SYSTEM.md](docs/dev/DESIGN_SYSTEM.md) — spacing, color, typography rules

## Quick commands

```bash
npm run dev              # Vite dev server (web)
npm run build            # TypeScript check + Vite production build
npm run tauri:dev        # Tauri desktop dev mode
npm run tauri:build      # Build desktop app
```

Version bumps must stay in sync across `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
