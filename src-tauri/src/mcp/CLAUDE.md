# tv-mcp

MCP (Model Context Protocol) server that gives Claude Code read/write access to tv-client's app state (Supabase). Runs in two modes — embedded HTTP inside the Tauri app, and standalone stdio binary for Claude Desktop.

See the [tv-client CLAUDE.md](../../../CLAUDE.md) for the build/deploy instructions (rebuild after Rust changes, debug-only constraint, symlink pattern). This doc covers how the MCP implementation works and how to extend it.

## Two Modes

| Mode | Entry point | Port | Used by |
|------|------------|------|---------|
| **Embedded HTTP** | `src-tauri/src/main.rs` | 23816 (release) / 23817 (debug) | Tauri app's bot panel |
| **Standalone stdio** | `src-tauri/src/bin/tv-mcp.rs` | N/A (stdio) | Claude Desktop / Claude Code |

Both modes share the same `src-tauri/src/mcp/` module. The standalone binary passes `--http` flag to switch to HTTP mode for local testing.

## Directory Structure

```
src-tauri/src/mcp/
├── mod.rs          # Module exports (protocol, server, tools)
├── protocol.rs     # JSON-RPC 2.0 types: JsonRpcRequest, Tool, ToolResult, InputSchema
├── server.rs       # Request dispatcher + HTTP/stdio server runners
└── tools/
    ├── mod.rs      # Tool registry: list_tools(), call_tool() — routing lives here
    ├── work.rs     # 20+ project/task/milestone/initiative/label tools
    ├── crm.rs      # 20+ company/contact/deal/activity tools
    ├── workspace.rs # 15+ workspace/session/artifact/context tools
    ├── generate.rs  # Gamma (presentations) + Nanobanana (images)
    ├── intercom.rs  # Help center publishing
    ├── docgen.rs    # Order forms + proposals
    └── val_sync.rs  # VAL domain sync tools
```

## MCP Protocol

The server handles four JSON-RPC methods:

| Method | What it does |
|--------|-------------|
| `initialize` | Handshake — returns protocol version + server info |
| `tools/list` | Returns all available tools with their input schemas |
| `tools/call` | Executes a tool by name with arguments |
| `initialized` / `notifications/initialized` | Completion notification — no response sent |

Notifications (where `request.id` is null) are processed but never responded to. This is MCP-compliant.

## Adding a New Tool

### Step 1: Define tools + handler in `tools/{domain}.rs`

```rust
use crate::mcp::protocol::{InputSchema, Tool, ToolResult};
use crate::commands::your_domain;
use serde_json::{json, Value};

pub fn tools() -> Vec<Tool> {
    vec![
        Tool {
            name: "your-tool-name".to_string(),
            description: "What this tool does for Claude.".to_string(),
            input_schema: InputSchema::with_properties(
                json!({
                    "param1": { "type": "string", "description": "..." },
                    "param2": { "type": "integer", "description": "..." }
                }),
                vec!["param1".to_string()]  // required fields
            ),
        },
    ]
}

pub async fn call(name: &str, args: Value) -> ToolResult {
    match name {
        "your-tool-name" => {
            let param1 = match args.get("param1").and_then(|v| v.as_str()) {
                Some(v) => v.to_string(),
                None => return ToolResult::error("param1 is required"),
            };
            let param2 = args.get("param2").and_then(|v| v.as_i64()).map(|n| n as i32);
            match your_domain::your_function(param1, param2).await {
                Ok(data) => ToolResult::json(&data),
                Err(e) => ToolResult::error(e.to_string()),
            }
        }
        _ => ToolResult::error(format!("Unknown tool: {}", name)),
    }
}
```

### Step 2: Register in `tools/mod.rs`

```rust
pub mod your_domain;  // add at top

pub fn list_tools() -> Vec<Tool> {
    let mut tools = Vec::new();
    // IMPORTANT: add workspace tools BEFORE work tools (see routing gotcha below)
    tools.extend(your_domain::tools());
    tools.extend(work::tools());
    tools
}

pub async fn call_tool(name: &str, arguments: Value) -> ToolResult {
    // Add BEFORE any pattern that could overlap
    if name.starts_with("your-domain-") {
        return your_domain::call(name, arguments).await;
    }
    // ... existing routing
}
```

### Step 3: Implement the backing command in `commands/{domain}/`

MCP tool handlers call into `src-tauri/src/commands/` for the actual Supabase work. See [tv-client CLAUDE.md](../../../CLAUDE.md) Backend Patterns section for the full command pattern.

## Supabase Query Reference

```rust
let client = get_client().await?;

// SELECT multiple rows
let rows: Vec<MyType> = client.select("table_name", "stage=eq.active&limit=50").await?;

// SELECT single row
let row: Option<MyType> = client.select_single("table_name", "id=eq.abc123").await?;

// INSERT
let created: MyType = client.insert("table_name", &data).await?;

// UPDATE
let updated: MyType = client.update("table_name", "id=eq.abc123", &updates).await?;

// DELETE
client.delete("table_name", "id=eq.abc123").await?;
```

Query string syntax (Supabase REST):
- `field=eq.value` — equals
- `field.ilike.*text*` — case-insensitive contains
- `or=(f1.eq.a,f2.eq.b)` — OR conditions
- `select=*,related:other_table(*)` — joins
- `order=created_at.desc` — sorting
- `limit=50&offset=0` — pagination

## Gotchas

### Tool routing order matters
In `tools/mod.rs`, workspace tools must be matched **before** work tools. The name `"create-workspace"` would incorrectly match a `starts_with("create-work")` check. Workspace routing comes first — don't reorder it.

### Notifications must not receive a response
If `request.id` is `null` or method is `"initialized"`/`"notifications/initialized"`, return without sending a response. The MCP client will hang if you respond to a notification.

### API keys fetched at runtime
Generation tools (Gamma, Nanobanana) fetch their API keys from settings at call time via `settings_get_key()`. If the key isn't configured in tv-desktop settings, the tool returns a user-facing error message. Don't hardcode keys or cache them at startup.

### Ports must not conflict
If you're running the Tauri app and the standalone binary simultaneously, they'll both try to bind their respective HTTP ports (23816/23817). The debug binary uses 23817; the release app uses 23816. This is intentional — just be aware when testing.
