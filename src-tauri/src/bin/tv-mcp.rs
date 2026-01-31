// tv-mcp - MCP Server Binary
// Provides Work, CRM, and Generation tools via the Model Context Protocol
//
// Usage (stdio mode - for Claude Desktop):
//   Configure in Claude Desktop's claude_desktop_config.json:
//   {
//     "mcpServers": {
//       "tv-mcp": {
//         "command": "/path/to/tv-mcp"
//       }
//     }
//   }
//
// Usage (HTTP mode - for testing):
//   ./tv-mcp --http
//   curl -X POST http://localhost:23816/mcp -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

use tv_desktop::mcp;

#[tokio::main]
async fn main() {
    // Initialize logger (only if RUST_LOG is set, to avoid polluting stdio)
    if std::env::var("RUST_LOG").is_ok() {
        env_logger::init();
    }

    let args: Vec<String> = std::env::args().collect();

    if args.iter().any(|a| a == "--http") {
        // HTTP mode for testing
        eprintln!("Starting MCP HTTP server on http://localhost:{}", mcp::server::DEFAULT_PORT);
        if let Err(e) = mcp::server::run_http(mcp::server::DEFAULT_PORT).await {
            eprintln!("MCP server error: {}", e);
            std::process::exit(1);
        }
    } else {
        // Stdio mode for Claude Desktop
        if let Err(e) = mcp::server::run_stdio().await {
            eprintln!("MCP server error: {}", e);
            std::process::exit(1);
        }
    }
}
