// IBKR Flex Web Service client.
//
// Two-step protocol:
//   1. POST SendRequest with (token, query_id) → returns a ReferenceCode
//   2. POLL GetStatement with (token, reference_code) until the statement is
//      ready (IBKR generates asynchronously, typically 5-30s)
//
// Returns raw XML. Parsing into typed records happens in `parse_flex_xml`.
//
// Docs: https://www.interactivebrokers.com/campus/ibkr-api-page/flex-web-service/

use crate::commands::error::{CmdResult, CommandError};
use crate::HTTP_CLIENT;
use quick_xml::events::Event;
use quick_xml::Reader;
use serde_json::{Map, Value};
use std::collections::HashMap;

const FLEX_BASE: &str = "https://gdcdyn.interactivebrokers.com/Universal/servlet";
const POLL_INTERVAL_SECS: u64 = 5;
const POLL_MAX_ATTEMPTS: u32 = 24; // 24 * 5s = 2 minutes max wait

// ---------------------------------------------------------------------------
// Fetch: SendRequest → poll GetStatement → return XML string
// ---------------------------------------------------------------------------

/// Fetch a Flex statement as raw XML. Handles the async two-step protocol.
pub async fn fetch_statement(token: &str, query_id: &str) -> CmdResult<String> {
    // Step 1: SendRequest
    let send_url = format!(
        "{}/FlexStatementService.SendRequest?t={}&q={}&v=3",
        FLEX_BASE, token, query_id
    );

    let send_resp = HTTP_CLIENT.get(&send_url).send().await
        .map_err(|e| CommandError::Internal(format!("Flex SendRequest failed: {}", e)))?;

    if !send_resp.status().is_success() {
        return Err(CommandError::Internal(format!(
            "Flex SendRequest returned HTTP {}",
            send_resp.status()
        )));
    }

    let send_xml = send_resp.text().await
        .map_err(|e| CommandError::Internal(format!("Flex SendRequest body read failed: {}", e)))?;

    let (status, reference_code, error_code, error_message) = parse_send_response(&send_xml);
    if status != "Success" {
        return Err(CommandError::Internal(format!(
            "Flex SendRequest rejected (code {}): {}",
            error_code.unwrap_or_else(|| "?".into()),
            error_message.unwrap_or_else(|| "unknown error".into())
        )));
    }
    let reference_code = reference_code.ok_or_else(||
        CommandError::Internal("Flex SendRequest succeeded but no ReferenceCode returned".into())
    )?;

    // Step 2: Poll GetStatement until it's ready (or we time out)
    let get_url = format!(
        "{}/FlexStatementService.GetStatement?t={}&q={}&v=3",
        FLEX_BASE, token, reference_code
    );

    for attempt in 0..POLL_MAX_ATTEMPTS {
        // Wait before each attempt (including the first — gives IBKR time to start generating)
        tokio::time::sleep(std::time::Duration::from_secs(POLL_INTERVAL_SECS)).await;

        let get_resp = HTTP_CLIENT.get(&get_url).send().await
            .map_err(|e| CommandError::Internal(format!("Flex GetStatement failed: {}", e)))?;

        if !get_resp.status().is_success() {
            return Err(CommandError::Internal(format!(
                "Flex GetStatement returned HTTP {}",
                get_resp.status()
            )));
        }

        let body = get_resp.text().await
            .map_err(|e| CommandError::Internal(format!("Flex GetStatement body read failed: {}", e)))?;

        // "Statement generation in progress" is returned as an XML response
        // with Status=Warn and ErrorCode=1019. Keep polling.
        if body.contains("<Status>Warn</Status>") && body.contains("1019") {
            eprintln!("[ibkr:flex] Statement still generating (attempt {}/{})", attempt + 1, POLL_MAX_ATTEMPTS);
            continue;
        }

        // Error responses start with <FlexStatementResponse>. Real statements
        // start with <FlexQueryResponse>. Detect explicit errors.
        if body.contains("<Status>Fail</Status>") {
            let (_, _, code, msg) = parse_send_response(&body);
            return Err(CommandError::Internal(format!(
                "Flex GetStatement failed (code {}): {}",
                code.unwrap_or_else(|| "?".into()),
                msg.unwrap_or_else(|| "unknown error".into())
            )));
        }

        if body.contains("<FlexQueryResponse") {
            return Ok(body);
        }

        // Unknown response shape — log and keep polling a few more times
        eprintln!("[ibkr:flex] Unexpected GetStatement body (attempt {}), retrying", attempt + 1);
    }

    Err(CommandError::Internal(format!(
        "Flex statement did not become ready after {}s — try increasing POLL_MAX_ATTEMPTS or check IBKR status",
        POLL_INTERVAL_SECS * POLL_MAX_ATTEMPTS as u64
    )))
}

/// Parse the small control XML returned by SendRequest and error branches of
/// GetStatement. Returns (status, reference_code, error_code, error_message).
fn parse_send_response(xml: &str) -> (String, Option<String>, Option<String>, Option<String>) {
    let mut reader = Reader::from_str(xml);
    reader.trim_text(true);

    let mut status = String::new();
    let mut reference_code: Option<String> = None;
    let mut error_code: Option<String> = None;
    let mut error_message: Option<String> = None;
    let mut current_tag = String::new();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                current_tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
            }
            Ok(Event::Text(e)) => {
                let text = e.unescape().unwrap_or_default().to_string();
                match current_tag.as_str() {
                    "Status" => status = text,
                    "ReferenceCode" => reference_code = Some(text),
                    "ErrorCode" => error_code = Some(text),
                    "ErrorMessage" => error_message = Some(text),
                    _ => {}
                }
            }
            Ok(Event::End(_)) => current_tag.clear(),
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    (status, reference_code, error_code, error_message)
}

// ---------------------------------------------------------------------------
// Parse: extract records from a full Flex statement XML
// ---------------------------------------------------------------------------

/// All records extracted from a single Flex XML statement. Each record is a
/// `serde_json::Map` of its XML attributes — sync.rs picks out the fields it
/// needs per target table, and the whole map is stored as `raw jsonb`.
#[derive(Debug, Default)]
pub struct FlexRecords {
    pub open_positions: Vec<Map<String, Value>>,
    pub trades: Vec<Map<String, Value>>,
    pub cash_transactions: Vec<Map<String, Value>>,
    pub equity_summaries: Vec<Map<String, Value>>,
}

/// Parse a full Flex statement XML into typed record buckets.
///
/// Activity Flex queries wrap everything in
/// `<FlexQueryResponse><FlexStatements><FlexStatement>...</FlexStatement></FlexStatements></FlexQueryResponse>`.
/// Each record type is a child element with data in XML attributes (not child
/// text). We iterate events, recognize record tag names, and capture their
/// attributes into a map.
pub fn parse_flex_xml(xml: &str) -> CmdResult<FlexRecords> {
    let mut reader = Reader::from_str(xml);
    reader.trim_text(true);

    let mut records = FlexRecords::default();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                let tag_bytes = e.name();
                let tag = String::from_utf8_lossy(tag_bytes.as_ref()).to_string();

                // Record tags of interest. Record elements are typically
                // self-closing in Flex XML (they carry attributes, no children)
                // but we accept Start as well in case IBKR changes shape.
                let bucket = match tag.as_str() {
                    "OpenPosition" => Some(&mut records.open_positions),
                    "Trade" => Some(&mut records.trades),
                    "CashTransaction" => Some(&mut records.cash_transactions),
                    "EquitySummaryByReportDateInBase" => Some(&mut records.equity_summaries),
                    _ => None,
                };

                if let Some(bucket) = bucket {
                    let mut map = Map::new();
                    for attr in e.attributes().flatten() {
                        let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                        let value = attr.unescape_value()
                            .map(|v| v.to_string())
                            .unwrap_or_default();
                        // Store everything as strings in the raw jsonb; sync.rs
                        // coerces known numeric/date fields when mapping to columns.
                        map.insert(key, Value::String(value));
                    }
                    bucket.push(map);
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => {
                return Err(CommandError::Internal(format!(
                    "Flex XML parse error at position {}: {}",
                    reader.buffer_position(),
                    e
                )));
            }
            _ => {}
        }
        buf.clear();
    }

    Ok(records)
}

// ---------------------------------------------------------------------------
// Small helpers used by sync.rs to coerce attribute strings into typed values.
// IBKR uses empty strings for null, various date formats depending on query
// config. sync.rs is configured for the documented yyyy-MM-dd / yyyyMMdd.
// ---------------------------------------------------------------------------

/// Parse a Flex numeric attribute. Empty string → None. Unparseable → None.
pub fn opt_num(map: &Map<String, Value>, key: &str) -> Option<f64> {
    let s = map.get(key)?.as_str()?;
    if s.is_empty() {
        return None;
    }
    s.parse::<f64>().ok()
}

/// Parse a Flex string attribute. Empty string → None.
pub fn opt_str(map: &Map<String, Value>, key: &str) -> Option<String> {
    let s = map.get(key)?.as_str()?;
    if s.is_empty() {
        None
    } else {
        Some(s.to_string())
    }
}

/// Parse a Flex date field. Accepts `yyyy-MM-dd` and `yyyyMMdd`. Returns
/// ISO-8601 date string ready for Postgres `date` columns, or None.
pub fn opt_date(map: &Map<String, Value>, key: &str) -> Option<String> {
    let s = opt_str(map, key)?;
    // Strip any time suffix like "20260404;153000"
    let date_part = s.split(|c| c == ';' || c == ' ').next()?;
    if date_part.len() == 10 && date_part.as_bytes()[4] == b'-' {
        // Already yyyy-MM-dd
        return Some(date_part.to_string());
    }
    if date_part.len() == 8 && date_part.chars().all(|c| c.is_ascii_digit()) {
        return Some(format!(
            "{}-{}-{}",
            &date_part[0..4],
            &date_part[4..6],
            &date_part[6..8]
        ));
    }
    None
}

/// Summary sizes for logging.
pub fn record_counts(r: &FlexRecords) -> HashMap<&'static str, usize> {
    let mut m = HashMap::new();
    m.insert("positions", r.open_positions.len());
    m.insert("trades", r.trades.len());
    m.insert("cash_tx", r.cash_transactions.len());
    m.insert("equity", r.equity_summaries.len());
    m
}
