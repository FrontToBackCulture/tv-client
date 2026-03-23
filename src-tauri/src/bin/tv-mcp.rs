// tv-mcp - MCP Server Binary
// Provides Work, CRM, and Generation tools via the Model Context Protocol
//
// Usage (stdio mode - for Claude Code):
//   Bundled as a sidecar with TV Client. Registered automatically via
//   the Claude MCP Setup panel in the app.
//
// Usage (HTTP mode - for testing):
//   ./tv-mcp --http
//   curl -X POST http://localhost:23816/mcp -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

use tv_client::mcp;

const VERSION: &str = env!("CARGO_PKG_VERSION");

#[tokio::main]
async fn main() {
    // Initialize logger (only if RUST_LOG is set, to avoid polluting stdio)
    if std::env::var("RUST_LOG").is_ok() {
        env_logger::init();
    }

    let args: Vec<String> = std::env::args().collect();

    // --version: print version and exit
    if args.iter().any(|a| a == "--version" || a == "-V") {
        println!("tv-mcp {}", VERSION);
        return;
    }

    // Always log version to stderr on startup (doesn't pollute stdio JSON-RPC)
    eprintln!("[tv-mcp] v{} starting", VERSION);

    if args.iter().any(|a| a == "--http") {
        // HTTP mode for testing
        eprintln!("[tv-mcp] HTTP mode on http://localhost:{}", mcp::server::DEFAULT_PORT);
        if let Err(e) = mcp::server::run_http(mcp::server::DEFAULT_PORT).await {
            eprintln!("[tv-mcp] server error: {}", e);
            std::process::exit(1);
        }
    } else {
        // Stdio mode for Claude Code
        eprintln!("[tv-mcp] stdio mode");
        if let Err(e) = mcp::server::run_stdio().await {
            eprintln!("[tv-mcp] server error: {}", e);
            std::process::exit(1);
        }
    }
}
