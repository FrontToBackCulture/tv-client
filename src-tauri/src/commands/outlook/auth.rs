// Outlook OAuth2 authentication via Azure AD
// Uses local callback server on port 3847 (matching Azure AD app registration)

use super::types::{GraphTokenResponse, GraphUserProfile, OutlookAuthStatus, OutlookTokens};
use crate::commands::error::{CmdResult, CommandError};
use crate::commands::settings;
use std::fs;
use std::path::PathBuf;

// ============================================================================
// Token storage
// ============================================================================

fn get_outlook_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".tv-desktop")
        .join("outlook")
}

fn get_tokens_path() -> PathBuf {
    get_outlook_dir().join("tokens.json")
}

pub fn load_tokens() -> Option<OutlookTokens> {
    let path = get_tokens_path();
    if !path.exists() {
        return None;
    }
    let content = fs::read_to_string(&path).ok()?;
    serde_json::from_str(&content).ok()
}

fn save_tokens(tokens: &OutlookTokens) -> CmdResult<()> {
    let dir = get_outlook_dir();
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
    let tokens = load_tokens()
        .ok_or_else(|| {
            eprintln!("[outlook:auth] No tokens found on disk");
            CommandError::NotFound("Not authenticated with Outlook. Please connect first.".to_string())
        })?;

    let now = chrono::Utc::now().timestamp();

    // Refresh if within 5 minutes of expiry
    if now >= tokens.expires_at - 300 {
        let refresh_token = tokens.refresh_token
            .ok_or_else(|| CommandError::Internal("No refresh token available. Please re-authenticate.".to_string()))?;

        let new_tokens = refresh_access_token(&refresh_token).await?;
        save_tokens(&new_tokens)?;
        return Ok(new_tokens.access_token);
    }

    Ok(tokens.access_token)
}

async fn refresh_access_token(refresh_token: &str) -> CmdResult<OutlookTokens> {
    let s = settings::load_settings()?;
    let tenant_id = s.keys.get(settings::KEY_MS_GRAPH_TENANT_ID)
        .ok_or_else(|| CommandError::Config("MS Graph Tenant ID not configured".to_string()))?;
    let client_id = s.keys.get(settings::KEY_MS_GRAPH_CLIENT_ID)
        .ok_or_else(|| CommandError::Config("MS Graph Client ID not configured".to_string()))?;
    let client_secret = s.keys.get(settings::KEY_MS_GRAPH_CLIENT_SECRET)
        .ok_or_else(|| CommandError::Config("MS Graph Client Secret not configured".to_string()))?;

    let client = crate::HTTP_CLIENT.clone();
    let response = client
        .post(format!("https://login.microsoftonline.com/{}/oauth2/v2.0/token", tenant_id))
        .form(&[
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
            ("scope", "offline_access Mail.Read Mail.ReadWrite Mail.Send User.Read"),
        ])
        .send()
        .await?;

    let token_data: GraphTokenResponse = response
        .json()
        .await
        .map_err(|e| CommandError::Parse(format!("Failed to parse token response: {}", e)))?;

    if let Some(err) = token_data.error {
        let desc = token_data.error_description.unwrap_or_default();
        return Err(CommandError::Network(format!("Token refresh failed: {} - {}", err, desc)));
    }

    let now = chrono::Utc::now().timestamp();
    Ok(OutlookTokens {
        access_token: token_data.access_token,
        refresh_token: token_data.refresh_token.or(Some(refresh_token.to_string())),
        expires_at: now + token_data.expires_in as i64,
        scope: token_data.scope,
    })
}

// ============================================================================
// Commands
// ============================================================================

/// Start OAuth flow - opens browser and waits for callback on port 3847
#[tauri::command]
pub async fn outlook_auth_start(
    client_id: String,
    tenant_id: String,
    client_secret: String,
) -> CmdResult<OutlookAuthStatus> {
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::Arc;
    use tokio::sync::oneshot;

    let port = 3847;
    let listener = TcpListener::bind(format!("127.0.0.1:{}", port))
        .map_err(|e| CommandError::Io(format!("Failed to bind on port {}: {}", port, e)))?;

    let redirect_uri = format!("http://localhost:{}/callback", port);
    let scopes = "offline_access Mail.Read Mail.ReadWrite Mail.Send User.Read";
    let auth_url = format!(
        "https://login.microsoftonline.com/{}/oauth2/v2.0/authorize?client_id={}&response_type=code&redirect_uri={}&scope={}&response_mode=query",
        tenant_id,
        client_id,
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(scopes),
    );

    log::info!("Opening browser for Outlook OAuth: {}", auth_url);
    open::that(&auth_url).map_err(|e| CommandError::Io(format!("Failed to open browser: {}", e)))?;

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
                        let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html><body><h1>Success!</h1><p>You can close this window and return to TV Desktop.</p><script>window.close()</script></body></html>";
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
    let code = match tokio::time::timeout(
        std::time::Duration::from_secs(300),
        rx,
    )
    .await
    {
        Ok(Ok(Ok(code))) => code,
        Ok(Ok(Err(e))) => return Err(CommandError::Internal(e)),
        Ok(Err(_)) => return Err(CommandError::Internal("Callback cancelled".to_string())),
        Err(_) => return Err(CommandError::Internal("Authentication timed out".to_string())),
    };

    // Exchange code for tokens
    let client = crate::HTTP_CLIENT.clone();
    let response = client
        .post(format!(
            "https://login.microsoftonline.com/{}/oauth2/v2.0/token",
            tenant_id
        ))
        .form(&[
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("scope", scopes),
        ])
        .send()
        .await?;

    let token_data: GraphTokenResponse = response
        .json()
        .await
        .map_err(|e| CommandError::Parse(format!("Failed to parse token response: {}", e)))?;

    if let Some(err) = token_data.error {
        let desc = token_data.error_description.unwrap_or_default();
        return Err(CommandError::Network(format!("OAuth error: {} - {}", err, desc)));
    }

    let now = chrono::Utc::now().timestamp();
    let tokens = OutlookTokens {
        access_token: token_data.access_token,
        refresh_token: token_data.refresh_token,
        expires_at: now + token_data.expires_in as i64,
        scope: token_data.scope,
    };

    save_tokens(&tokens)?;

    // Get user profile to confirm
    let user_email = get_user_email(&tokens.access_token).await.ok();

    Ok(OutlookAuthStatus {
        is_authenticated: true,
        user_email,
        expires_at: Some(tokens.expires_at),
    })
}

/// Check current auth status
#[tauri::command]
pub async fn outlook_auth_check() -> CmdResult<OutlookAuthStatus> {
    eprintln!("[outlook:auth] auth_check called");
    let tokens = match load_tokens() {
        Some(t) => t,
        None => {
            return Ok(OutlookAuthStatus {
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
                    return Ok(OutlookAuthStatus {
                        is_authenticated: true,
                        user_email,
                        expires_at: Some(new_tokens.expires_at),
                    });
                }
                Err(_) => {
                    return Ok(OutlookAuthStatus {
                        is_authenticated: false,
                        user_email: None,
                        expires_at: None,
                    });
                }
            }
        } else {
            return Ok(OutlookAuthStatus {
                is_authenticated: false,
                user_email: None,
                expires_at: None,
            });
        }
    }

    let user_email = get_user_email(&tokens.access_token).await.ok();
    Ok(OutlookAuthStatus {
        is_authenticated: true,
        user_email,
        expires_at: Some(tokens.expires_at),
    })
}

/// Logout - delete stored tokens
#[tauri::command]
pub fn outlook_auth_logout() -> CmdResult<()> {
    delete_tokens()
}

/// Import tokens from msteams-sync token file (avoids re-authentication)
#[tauri::command]
pub async fn outlook_auth_import(token_file_path: String) -> CmdResult<OutlookAuthStatus> {
    let content = std::fs::read_to_string(&token_file_path)?;

    // msteams-sync format: { "email@example.com": { accessToken, refreshToken, expiresAt (ms), ... } }
    let data: serde_json::Value = serde_json::from_str(&content)?;

    let obj = data.as_object()
        .ok_or_else(|| CommandError::Parse("Token file is not a JSON object".to_string()))?;

    // Take the first user's tokens
    let (user_email, user_tokens) = obj.iter().next()
        .ok_or_else(|| CommandError::Parse("No users found in token file".to_string()))?;

    let access_token = user_tokens.get("accessToken")
        .and_then(|v| v.as_str())
        .ok_or_else(|| CommandError::Parse("No accessToken found".to_string()))?;
    let refresh_token = user_tokens.get("refreshToken")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let expires_at_ms = user_tokens.get("expiresAt")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);

    // Convert from JS milliseconds to Unix seconds
    let expires_at = expires_at_ms / 1000;

    let tokens = OutlookTokens {
        access_token: access_token.to_string(),
        refresh_token,
        expires_at,
        scope: Some("offline_access Mail.Read Mail.ReadWrite Mail.Send User.Read".to_string()),
    };

    save_tokens(&tokens)?;

    // Try to refresh if expired (the access token from msteams-sync may be stale)
    let now = chrono::Utc::now().timestamp();
    if now >= expires_at - 300 {
        if let Some(ref rt) = tokens.refresh_token {
            match refresh_access_token(rt).await {
                Ok(new_tokens) => {
                    save_tokens(&new_tokens)?;
                    return Ok(OutlookAuthStatus {
                        is_authenticated: true,
                        user_email: Some(user_email.clone()),
                        expires_at: Some(new_tokens.expires_at),
                    });
                }
                Err(e) => {
                    log::warn!("Token refresh failed during import: {}", e);
                    // Still return success - tokens are saved, user can re-auth if needed
                }
            }
        }
    }

    Ok(OutlookAuthStatus {
        is_authenticated: true,
        user_email: Some(user_email.clone()),
        expires_at: Some(expires_at),
    })
}

// ============================================================================
// Helpers
// ============================================================================

async fn get_user_email(access_token: &str) -> CmdResult<String> {
    let client = crate::HTTP_CLIENT.clone();
    let response = client
        .get("https://graph.microsoft.com/v1.0/me")
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(CommandError::Http { status: status.as_u16(), body });
    }

    let profile: GraphUserProfile = response
        .json()
        .await
        .map_err(|e| CommandError::Parse(format!("Failed to parse profile: {}", e)))?;

    profile
        .mail
        .or(profile.user_principal_name)
        .ok_or_else(|| CommandError::NotFound("No email found in profile".to_string()))
}

fn extract_code_from_request(request: &str) -> Option<String> {
    let first_line = request.lines().next()?;
    let path = first_line.split_whitespace().nth(1)?;

    if let Some(query_start) = path.find('?') {
        let query = &path[query_start + 1..];
        for param in query.split('&') {
            if let Some((key, value)) = param.split_once('=') {
                if key == "code" {
                    return Some(value.to_string());
                }
            }
        }
    }
    None
}
