// MCP Server
// Stdio-based JSON-RPC server for the Model Context Protocol

use super::protocol::*;
use super::tools;
use std::io::{self, BufRead, Write};

/// Run the MCP server on stdio
pub async fn run() -> io::Result<()> {
    let stdin = io::stdin();
    let mut stdout = io::stdout();
    let reader = stdin.lock();

    for line in reader.lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }

        let response = handle_message(&line).await;
        let response_json = serde_json::to_string(&response).unwrap_or_else(|_| {
            r#"{"jsonrpc":"2.0","id":null,"error":{"code":-32603,"message":"Failed to serialize response"}}"#.to_string()
        });

        writeln!(stdout, "{}", response_json)?;
        stdout.flush()?;
    }

    Ok(())
}

/// Handle a single JSON-RPC message
async fn handle_message(line: &str) -> JsonRpcResponse {
    // Parse request
    let request: JsonRpcRequest = match serde_json::from_str(line) {
        Ok(req) => req,
        Err(e) => {
            return JsonRpcResponse::error(
                None,
                PARSE_ERROR,
                &format!("Failed to parse request: {}", e),
            );
        }
    };

    // Dispatch based on method
    match request.method.as_str() {
        "initialize" => handle_initialize(request.id),
        "initialized" => {
            // Notification, no response needed but we still return something
            JsonRpcResponse::success(request.id, serde_json::json!({}))
        }
        "notifications/initialized" => {
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
