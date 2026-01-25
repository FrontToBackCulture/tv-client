// tv-mcp - MCP Server Binary
// Provides Work, CRM, and Generation tools via the Model Context Protocol
//
// Usage:
//   1. Build: cargo build --bin tv-mcp
//   2. Test: echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | ./target/debug/tv-mcp
//   3. Configure in Claude Code settings.json:
//      {
//        "mcpServers": {
//          "tv-mcp": {
//            "command": "/path/to/tv-mcp"
//          }
//        }
//      }

// Import the library crate
use tv_desktop::mcp;

#[tokio::main]
async fn main() {
    // Initialize logger (only if RUST_LOG is set, to avoid polluting stdio)
    if std::env::var("RUST_LOG").is_ok() {
        env_logger::init();
    }

    // Run the MCP server
    if let Err(e) = mcp::server::run().await {
        eprintln!("MCP server error: {}", e);
        std::process::exit(1);
    }
}
