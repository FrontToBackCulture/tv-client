// MCP Server
// JSON-RPC server for the Model Context Protocol
// Supports stdio (for Claude Desktop) and HTTP (for testing)

use super::protocol::*;
use super::tools;
use axum::{
    extract::Json,
    http::StatusCode,
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};

/// Default port for the MCP HTTP server (dev uses +1 to avoid conflict with installed app)
#[cfg(debug_assertions)]
pub const DEFAULT_PORT: u16 = 23817;
#[cfg(not(debug_assertions))]
pub const DEFAULT_PORT: u16 = 23816;

/// Run the MCP server on HTTP (for testing)
pub async fn run_http(port: u16) -> std::io::Result<()> {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/", get(health_check))
        .route("/mcp", post(handle_mcp_request))
        .layer(cors);

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    log::info!("MCP server starting on http://localhost:{}", port);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
}

/// Health check endpoint
async fn health_check() -> &'static str {
    "tv-mcp server running"
}

/// Handle MCP JSON-RPC request
async fn handle_mcp_request(
    Json(request): Json<JsonRpcRequest>,
) -> (StatusCode, Json<JsonRpcResponse>) {
    let response = dispatch_request(request).await;
    (StatusCode::OK, Json(response))
}

/// Dispatch based on method
async fn dispatch_request(request: JsonRpcRequest) -> JsonRpcResponse {
    match request.method.as_str() {
        "initialize" => handle_initialize(request.id),
        "initialized" | "notifications/initialized" => {
            JsonRpcResponse::success(request.id, serde_json::json!({}))
        }
        "tools/list" => handle_list_tools(request.id),
        "tools/call" => handle_call_tool(request.id, request.params).await,
        _ => JsonRpcResponse::error(
            request.id,
            METHOD_NOT_FOUND,
            &format!("Method not found: {}", request.method),
        ),
    }
}

/// Handle initialize request
fn handle_initialize(id: Option<serde_json::Value>) -> JsonRpcResponse {
    let result = InitializeResult {
        protocol_version: "2024-11-05".to_string(),
        capabilities: ServerCapabilities {
            tools: ToolsCapability {
                list_changed: false,
            },
        },
        server_info: ServerInfo {
            name: "tv-mcp".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
        },
    };

    JsonRpcResponse::success(id, serde_json::to_value(result).unwrap())
}

/// Handle tools/list request
fn handle_list_tools(id: Option<serde_json::Value>) -> JsonRpcResponse {
    let tools_list = tools::list_tools();
    let result = ListToolsResult { tools: tools_list };
    JsonRpcResponse::success(id, serde_json::to_value(result).unwrap())
}

/// Handle tools/call request
async fn handle_call_tool(
    id: Option<serde_json::Value>,
    params: Option<serde_json::Value>,
) -> JsonRpcResponse {
    let params: ToolCallParams = match params {
        Some(p) => match serde_json::from_value(p) {
            Ok(params) => params,
            Err(e) => {
                return JsonRpcResponse::error(
                    id,
                    INVALID_PARAMS,
                    &format!("Invalid tool call params: {}", e),
                );
            }
        },
        None => {
            return JsonRpcResponse::error(id, INVALID_PARAMS, "Missing tool call params");
        }
    };

    let result = tools::call_tool(&params.name, params.arguments).await;
    JsonRpcResponse::success(id, serde_json::to_value(result).unwrap())
}

// ============================================================================
// Stdio server (for Claude Desktop integration)
// ============================================================================

use std::io::{self, BufRead, Write};

/// Run the MCP server on stdio (for Claude Desktop)
pub async fn run_stdio() -> io::Result<()> {
    let stdin = io::stdin();
    let mut stdout = io::stdout();
    let reader = stdin.lock();

    for line in reader.lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }

        let request: JsonRpcRequest = match serde_json::from_str(&line) {
            Ok(req) => req,
            Err(e) => {
                let response = JsonRpcResponse::error(
                    None,
                    PARSE_ERROR,
                    &format!("Failed to parse request: {}", e),
                );
                let response_json = serde_json::to_string(&response).unwrap();
                writeln!(stdout, "{}", response_json)?;
                stdout.flush()?;
                continue;
            }
        };

        // Check if this is a notification (no id = no response expected)
        let is_notification = request.id.is_none();
        let method = request.method.clone();

        // Handle notifications without sending response
        if is_notification || method == "notifications/initialized" || method == "initialized" {
            // Process but don't respond to notifications
            let _ = dispatch_request(request).await;
            continue;
        }

        let response = dispatch_request(request).await;
        let response_json = serde_json::to_string(&response).unwrap_or_else(|_| {
            r#"{"jsonrpc":"2.0","id":null,"error":{"code":-32603,"message":"Failed to serialize response"}}"#.to_string()
        });

        writeln!(stdout, "{}", response_json)?;
        stdout.flush()?;
    }

    Ok(())
}
