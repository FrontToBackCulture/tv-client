// tv-agent-runner — Agent SDK sidecar for tv-client.
//
// Lifecycle:
//   1. Parent (Rust) spawns this binary with no argv.
//   2. Parent writes a single-line JSON request to stdin, then closes stdin.
//   3. We run an Agent SDK loop and stream each SDK event as NDJSON on stdout.
//   4. Process exits 0 on normal completion, 1 on fatal error.
//
// Stdout shape: one JSON object per line, each object is a raw SDKMessage from
// `@anthropic-ai/claude-agent-sdk`. The Rust parser already handles this format
// (it matches Claude Code CLI's --output-format stream-json shape).

import { query, type Options } from "@anthropic-ai/claude-agent-sdk";

interface AgentRunRequest {
  prompt: string;
  cwd?: string;
  model?: string;                    // "sonnet" | "opus" | full model id
  allowed_tools?: string[];
  resume_session_id?: string;
  max_turns?: number;
  system_prompt?: string;            // free-form override, optional
  mcp_servers?: Record<string, McpServerSpec>;
  anthropic_api_key?: string;        // injected into env if provided
  claude_code_executable?: string;   // path to `claude` binary (SDK needs the native CLI)
}

interface McpServerSpec {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

function emit(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function fatal(message: string, detail?: unknown): never {
  const detailStr =
    detail instanceof Error
      ? `${detail.message}\n${detail.stack ?? ""}`
      : typeof detail === "string"
        ? detail
        : detail
          ? JSON.stringify(detail)
          : "";
  // Mirror to stderr so the Rust shim can surface it even if NDJSON parsing fails.
  process.stderr.write(`[tv-agent-runner] ${message}: ${detailStr}\n`);
  emit({
    type: "result",
    subtype: "error_during_execution",
    is_error: true,
    result: detailStr ? `${message}: ${detailStr}` : message,
    duration_ms: 0,
    total_cost_usd: 0,
    session_id: "",
  });
  process.exit(1);
}

async function readStdinAll(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

// Names not prefixed with `mcp__` are built-in SDK tools (Read, Write, Bash, …).
function splitBuiltins(allowed: string[]): string[] {
  return allowed.filter((t) => !t.startsWith("mcp__"));
}

function buildOptions(req: AgentRunRequest): Options {
  // Default to a clean slate — do NOT inherit ~/.claude/ config (plugins, MCP
  // servers, skills, hooks) and do NOT include any built-in tools by default.
  // Each call declares exactly what it needs. Without these, a trivial prompt
  // loads ~22k tokens of tool definitions and costs ~$0.08.
  const allowed = req.allowed_tools ?? [];
  const opts: Options = {
    permissionMode: "bypassPermissions",
    includePartialMessages: false,
    settingSources: [],
    systemPrompt: req.system_prompt ?? "",
    tools: splitBuiltins(allowed),
  };

  if (req.cwd) opts.cwd = req.cwd;
  if (req.model) opts.model = req.model;
  if (allowed.length > 0) opts.allowedTools = allowed;
  if (req.resume_session_id) opts.resume = req.resume_session_id;
  if (typeof req.max_turns === "number") opts.maxTurns = req.max_turns;
  // bun --compile bundles the SDK JS but not the native Claude Code binary,
  // so we point the SDK at the user's installed claude CLI.
  const claudeExe = req.claude_code_executable ?? process.env.CLAUDE_CODE_EXECUTABLE;
  if (claudeExe) opts.pathToClaudeCodeExecutable = claudeExe;
  if (req.mcp_servers) {
    opts.mcpServers = Object.fromEntries(
      Object.entries(req.mcp_servers).map(([name, spec]) => [
        name,
        {
          type: "stdio" as const,
          command: spec.command,
          args: spec.args ?? [],
          env: spec.env ?? {},
        },
      ]),
    );
  }
  return opts;
}

async function main(): Promise<void> {
  const raw = await readStdinAll();
  if (!raw.trim()) fatal("empty stdin: no request received");

  let req: AgentRunRequest;
  try {
    req = JSON.parse(raw);
  } catch (e) {
    return fatal("invalid JSON on stdin", e);
  }
  if (!req.prompt) fatal("request.prompt is required");

  if (req.anthropic_api_key) {
    process.env.ANTHROPIC_API_KEY = req.anthropic_api_key;
  }

  const opts = buildOptions(req);

  try {
    const stream = query({ prompt: req.prompt, options: opts });
    for await (const event of stream) {
      emit(event);
    }
  } catch (e) {
    return fatal("agent loop failed", e);
  }
}

main().catch((e) => fatal("unhandled error", e));
