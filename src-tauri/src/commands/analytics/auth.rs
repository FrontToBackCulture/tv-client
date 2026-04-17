// Google OAuth2 authentication for GA4 Analytics
// Uses local callback server on port 3849 (separate from Outlook 3847, LinkedIn 3848)

use super::types::{Ga4AuthStatus, Ga4Tokens, GoogleTokenResponse, GoogleUserInfo};
use crate::commands::error::{CmdResult, CommandError};
use crate::commands::settings;
use std::fs;
use std::path::PathBuf;

// ============================================================================
// Token storage
// ============================================================================

fn get_analytics_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".tv-client")
        .join("analytics")
}

fn get_tokens_path() -> PathBuf {
    get_analytics_dir().join("tokens.json")
}

pub fn load_tokens() -> Option<Ga4Tokens> {
    let path = get_tokens_path();
    if !path.exists() {
        return None;
    }
    let content = fs::read_to_string(&path).ok()?;
    serde_json::from_str(&content).ok()
}

fn save_tokens(tokens: &Ga4Tokens) -> CmdResult<()> {
    let dir = get_analytics_dir();
    if !dir.exists() {
        fs::create_dir_all(&dir)?;
    }
    let content = serde_json::to_string_pretty(tokens)?;
    fs::write(get_tokens_path(), content)?;
    Ok(())
}

fn delete_tokens() -> CmdResult<()> {
    let path = get_tokens_path();
    if path.exists() {
        fs::remove_file(&path)?;
    }
    Ok(())
}

// ============================================================================
// Token refresh
// ============================================================================

pub async fn get_valid_token() -> CmdResult<String> {
    let tokens = load_tokens().ok_or_else(|| {
        eprintln!("[ga4:auth] No tokens found on disk");
        CommandError::NotFound(
            "Not authenticated with Google Analytics. Please connect first.".to_string(),
        )
    })?;

    let now = chrono::Utc::now().timestamp();

    // Refresh if within 5 minutes of expiry
    if now >= tokens.expires_at - 300 {
        let refresh_token = tokens.refresh_token.ok_or_else(|| {
            CommandError::Internal(
                "No refresh token available. Please re-authenticate with Google.".to_string(),
            )
        })?;

        let new_tokens = refresh_access_token(&refresh_token).await?;
        save_tokens(&new_tokens)?;
        return Ok(new_tokens.access_token);
    }

    Ok(tokens.access_token)
}

async fn refresh_access_token(refresh_token: &str) -> CmdResult<Ga4Tokens> {
    let s = settings::load_settings()?;
    let client_id = s
        .keys
        .get(settings::KEY_GA4_CLIENT_ID)
        .ok_or_else(|| CommandError::Config("GA4 Client ID not configured".to_string()))?;
    let client_secret = s
        .keys
        .get(settings::KEY_GA4_CLIENT_SECRET)
        .ok_or_else(|| CommandError::Config("GA4 Client Secret not configured".to_string()))?;

    let client = crate::HTTP_CLIENT.clone();
    let response = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
        ])
        .send()
        .await?;

    let token_data: GoogleTokenResponse = response.json().await.map_err(|e| {
        CommandError::Parse(format!("Failed to parse Google token response: {}", e))
    })?;

    if let Some(err) = token_data.error {
        let desc = token_data.error_description.unwrap_or_default();
        return Err(CommandError::Network(format!(
            "Google token refresh failed: {} - {}",
            err, desc
        )));
    }

    let now = chrono::Utc::now().timestamp();
    Ok(Ga4Tokens {
        access_token: token_data.access_token,
        // Google doesn't always return a new refresh token — keep the old one
        refresh_token: token_data
            .refresh_token
            .or(Some(refresh_token.to_string())),
        expires_at: now + token_data.expires_in as i64,
        scope: token_data.scope,
    })
}

// ============================================================================
// Commands
// ============================================================================

/// Start OAuth flow - opens browser and waits for callback on port 3849
#[tauri::command]
pub async fn ga4_auth_start(
    client_id: String,
    client_secret: String,
) -> CmdResult<Ga4AuthStatus> {
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::Arc;
    use tokio::sync::oneshot;

    let port = 3849;
    let listener = TcpListener::bind(format!("127.0.0.1:{}", port))
        .map_err(|e| CommandError::Io(format!("Failed to bind on port {}: {}", port, e)))?;

    let redirect_uri = format!("http://localhost:{}/callback", port);
    let scopes = "https://www.googleapis.com/auth/analytics.readonly";

    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&response_type=code&redirect_uri={}&scope={}&access_type=offline&prompt=consent",
        client_id,
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(scopes),
    );

    log::info!("Opening browser for Google Analytics OAuth: {}", auth_url);
    open::that(&auth_url)
        .map_err(|e| CommandError::Io(format!("Failed to open browser: {}", e)))?;

    // Wait for callback
    listener.set_nonblocking(false).ok();
    let (tx, rx) = oneshot::channel::<Result<String, String>>();
    let listener = Arc::new(listener);
    let listener_clone = listener.clone();

    std::thread::spawn(move || {
        match listener_clone.accept() {
            Ok((mut stream, _)) => {
                let mut buffer = [0; 4096];
                if let Ok(size) = stream.read(&mut buffer) {
                    let request = String::from_utf8_lossy(&buffer[..size]);

                    if let Some(code) = extract_code_from_request(&request) {
                        let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html><body><h1>Success!</h1><p>Google Analytics connected. You can close this window and return to TV Desktop.</p><script>window.close()</script></body></html>";
                        let _ = stream.write_all(response.as_bytes());
                        let _ = tx.send(Ok(code));
                    } else if request.contains("error=") {
                        let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html><body><h1>Error</h1><p>Authentication was denied.</p></body></html>";
                        let _ = stream.write_all(response.as_bytes());
                        let _ = tx.send(Err("Authentication denied".to_string()));
                    } else {
                        let _ = tx.send(Err("Invalid callback".to_string()));
                    }
                } else {
                    let _ = tx.send(Err("Failed to read request".to_string()));
                }
            }
            Err(e) => {
                let _ = tx.send(Err(format!("Failed to accept connection: {}", e)));
            }
        }
    });

    // Wait with 5-minute timeout
    let code = match tokio::time::timeout(std::time::Duration::from_secs(300), rx).await {
        Ok(Ok(Ok(code))) => code,
        Ok(Ok(Err(e))) => return Err(CommandError::Internal(e)),
        Ok(Err(_)) => return Err(CommandError::Internal("Callback cancelled".to_string())),
        Err(_) => return Err(CommandError::Internal("Authentication timed out".to_string())),
    };

    // Exchange code for tokens
    let client = crate::HTTP_CLIENT.clone();
    let response = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
        ])
        .send()
        .await?;

    let token_data: GoogleTokenResponse = response.json().await.map_err(|e| {
        CommandError::Parse(format!("Failed to parse Google token response: {}", e))
    })?;

    if let Some(err) = token_data.error {
        let desc = token_data.error_description.unwrap_or_default();
        return Err(CommandError::Network(format!(
            "Google OAuth error: {} - {}",
            err, desc
        )));
    }

    let now = chrono::Utc::now().timestamp();
    let tokens = Ga4Tokens {
        access_token: token_data.access_token,
        refresh_token: token_data.refresh_token,
        expires_at: now + token_data.expires_in as i64,
        scope: token_data.scope,
    };

    save_tokens(&tokens)?;

    // Save credentials for future refresh
    settings::settings_set_key(settings::KEY_GA4_CLIENT_ID.to_string(), client_id)?;
    settings::settings_set_key(settings::KEY_GA4_CLIENT_SECRET.to_string(), client_secret)?;

    // Get user email to confirm
    let user_email = get_user_email(&tokens.access_token).await.ok();

    Ok(Ga4AuthStatus {
        is_authenticated: true,
        user_email,
        expires_at: Some(tokens.expires_at),
    })
}

/// Check current auth status
#[tauri::command]
pub async fn ga4_auth_check() -> CmdResult<Ga4AuthStatus> {
    eprintln!("[ga4:auth] auth_check called");
    let tokens = match load_tokens() {
        Some(t) => t,
        None => {
            return Ok(Ga4AuthStatus {
                is_authenticated: false,
                user_email: None,
                expires_at: None,
            });
        }
    };

    let now = chrono::Utc::now().timestamp();

    // Try to refresh if expired
    if now >= tokens.expires_at - 300 {
        if let Some(refresh_token) = &tokens.refresh_token {
            match refresh_access_token(refresh_token).await {
                Ok(new_tokens) => {
                    save_tokens(&new_tokens)?;
                    let user_email = get_user_email(&new_tokens.access_token).await.ok();
                    return Ok(Ga4AuthStatus {
                        is_authenticated: true,
                        user_email,
                        expires_at: Some(new_tokens.expires_at),
                    });
                }
                Err(_) => {
                    return Ok(Ga4AuthStatus {
                        is_authenticated: false,
                        user_email: None,
                        expires_at: None,
                    });
                }
            }
        } else {
            return Ok(Ga4AuthStatus {
                is_authenticated: false,
                user_email: None,
                expires_at: None,
            });
        }
    }

    let user_email = get_user_email(&tokens.access_token).await.ok();
    Ok(Ga4AuthStatus {
        is_authenticated: true,
        user_email,
        expires_at: Some(tokens.expires_at),
    })
}

/// Logout - delete stored tokens
#[tauri::command]
pub fn ga4_auth_logout() -> CmdResult<()> {
    delete_tokens()
}

/// Export raw tokens for server-side sync setup
#[tauri::command]
pub fn ga4_export_tokens() -> CmdResult<serde_json::Value> {
    let tokens = load_tokens().ok_or_else(|| {
        CommandError::NotFound("No GA4 tokens found. Connect to Google first.".to_string())
    })?;
    Ok(serde_json::json!({
        "access_token": tokens.access_token,
        "refresh_token": tokens.refresh_token,
        "expires_at": tokens.expires_at,
    }))
}

// ============================================================================
// Helpers
// ============================================================================

async fn get_user_email(access_token: &str) -> CmdResult<String> {
    let client = crate::HTTP_CLIENT.clone();
    let response = client
        .get("https://www.googleapis.com/oauth2/v2/userinfo")
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(CommandError::Http {
            status: status.as_u16(),
            body,
        });
    }

    let user_info: GoogleUserInfo = response.json().await.map_err(|e| {
        CommandError::Parse(format!("Failed to parse Google userinfo: {}", e))
    })?;

    user_info
        .email
        .ok_or_else(|| CommandError::NotFound("No email found in Google profile".to_string()))
}

fn extract_code_from_request(request: &str) -> Option<String> {
    let first_line = request.lines().next()?;
    let path = first_line.split_whitespace().nth(1)?;

    if let Some(query_start) = path.find('?') {
        let query = &path[query_start + 1..];
        for param in query.split('&') {
            if let Some((key, value)) = param.split_once('=') {
                if key == "code" {
                    return Some(urlencoding::decode(value).unwrap_or_default().to_string());
                }
            }
        }
    }
    None
}
