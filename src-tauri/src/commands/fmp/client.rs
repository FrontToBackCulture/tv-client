// FMP HTTP client with rate limiting.
//
// FMP Starter plan: 300 req/min ceiling. We pace at 250ms between calls
// (240 req/min) to stay comfortably under even with bursts. Uses the shared
// HTTP_CLIENT from lib.rs for connection reuse.
//
// Every request hits the /stable/ base path — the newer FMP API surface
// that matches the shape of Melvin's cached JSON files. v3 would return
// subtly different field names (e.g. `mktCap` vs `marketCap`).

use crate::commands::error::{CmdResult, CommandError};
use crate::HTTP_CLIENT;
use serde_json::Value;
use std::time::Duration;

pub const BASE_URL: &str = "https://financialmodelingprep.com/stable";

/// Minimum delay between calls to stay under the Starter plan rate ceiling.
/// 250ms → 240 req/min → ~20% headroom under the 300 req/min limit.
pub const CALL_DELAY: Duration = Duration::from_millis(250);

/// Fetch a single FMP endpoint. `path` is the path portion including any
/// query params, relative to `BASE_URL` (e.g. "/profile?symbol=NVDA"). The
/// API key is appended automatically.
///
/// Returns the parsed JSON body on success. Error responses from FMP (like
/// "Restricted Endpoint" or "Premium Query Parameter") are detected and
/// surfaced as `CommandError::Config` so callers can distinguish them from
/// HTTP-level failures.
pub async fn fetch(api_key: &str, path: &str) -> CmdResult<Value> {
    let separator = if path.contains('?') { '&' } else { '?' };
    let url = format!("{}{}{}apikey={}", BASE_URL, path, separator, api_key);

    let resp = HTTP_CLIENT
        .get(&url)
        .send()
        .await
        .map_err(|e| CommandError::Internal(format!("FMP request failed: {}", e)))?;

    let status = resp.status();
    let body = resp
        .text()
        .await
        .map_err(|e| CommandError::Internal(format!("FMP body read failed: {}", e)))?;

    if !status.is_success() {
        // Truncate body in error messages to keep logs readable
        let snippet: String = body.chars().take(200).collect();
        return Err(CommandError::Internal(format!(
            "FMP HTTP {} at {}: {}",
            status.as_u16(),
            path,
            snippet
        )));
    }

    // Detect FMP "soft errors" — non-2xx data returned as a 200 JSON string
    // or a plain text message. We also detect these because FMP sometimes
    // returns a 200 with a plain-text "Restricted Endpoint" message.
    let trimmed = body.trim_start();
    if trimmed.starts_with("Restricted Endpoint")
        || trimmed.starts_with("Premium Query Parameter")
        || trimmed.starts_with("Query Error")
    {
        let snippet: String = body.chars().take(200).collect();
        return Err(CommandError::Config(format!(
            "FMP rejected {}: {}",
            path, snippet
        )));
    }

    serde_json::from_str::<Value>(&body).map_err(|e| {
        let snippet: String = body.chars().take(200).collect();
        CommandError::Internal(format!(
            "FMP returned non-JSON for {}: {} — body: {}",
            path, e, snippet
        ))
    })
}
