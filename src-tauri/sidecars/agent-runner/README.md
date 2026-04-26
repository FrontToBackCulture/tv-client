# tv-agent-runner

Agent SDK sidecar for tv-client. Replaces the `claude` CLI subprocess used by `claude_runner.rs` for project-scoped chats.

## Protocol

- **Input:** single-line JSON object on stdin, then EOF.
- **Output:** NDJSON on stdout — one SDK message per line. Same shape as Claude Code CLI's `--output-format stream-json`, so the existing Rust parser in `claude_runner.rs` can consume it unchanged.
- **Exit:** 0 on normal completion (final `result` message already emitted), 1 on fatal error (a synthetic `result` with `is_error: true` is emitted before exit).

### Request schema

```jsonc
{
  "prompt": "Update the description to mention 8 outlets instead of 6",
  "cwd": "/Users/.../tv-knowledge/4_Sales/deals/the-hey-co-southside",
  "model": "sonnet",
  "allowed_tools": [
    "Read", "Write", "Edit", "Glob", "Grep", "Bash",
    "mcp__tv-mcp__get-project",
    "mcp__tv-mcp__update-project",
    "mcp__tv-mcp__create-task"
  ],
  "resume_session_id": "abc-123",     // optional
  "max_turns": 30,                     // optional
  "system_prompt": "You are bot-mel scoped to project X...",  // optional override
  "mcp_servers": {
    "tv-mcp": {
      "command": "/Users/melvin/.tv-mcp/bin/tv-mcp",
      "env": { "TV_BOT_API_KEY": "..." }
    }
  },
  "anthropic_api_key": "sk-..."        // injected into env at startup
}
```

## Dev loop

```bash
cd src-tauri/sidecars/agent-runner
bun install
echo '{"prompt":"say hi","model":"sonnet","anthropic_api_key":"sk-..."}' | bun run src/index.ts
```

## Build single binary

Tauri sidecars expect a binary named `<name>-<rust-target-triple>` next to the app. Bun compiles to a self-contained executable (~60MB, no Node runtime needed at runtime).

```bash
bun install
bun run build:macos-arm64
# produces dist/tv-agent-runner-aarch64-apple-darwin

bun run build:macos-x64
# produces dist/tv-agent-runner-x86_64-apple-darwin
```

To wire as a Tauri sidecar in `tauri.conf.json`:

```jsonc
"bundle": {
  "externalBin": ["sidecars/agent-runner/dist/tv-agent-runner"]
}
```

For dev mode you can either:
- `bun run dev` and have `agent_runner.rs` resolve a known dev path, OR
- Build the binary and symlink it into `~/.tv-client/bin/tv-agent-runner` (mirrors the tv-mcp install pattern).

## Why a sidecar (not embedded in Rust)

The Agent SDK is TypeScript-only. Spawning a separate process keeps Rust simple, isolates SDK crashes from the Tauri shell, and matches the existing `claude_runner.rs` pattern (also a child process).
