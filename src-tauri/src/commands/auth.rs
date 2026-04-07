// OAuth authentication commands
// GitHub OAuth + Microsoft 365 OAuth (Azure AD / Entra ID)

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::oneshot;

use crate::commands::error::{CmdResult, CommandError};

// ============================================================================
// GitHub OAuth
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct AccessTokenResponse {
    pub access_token: Option<String>,
    pub token_type: Option<String>,
    pub scope: Option<String>,
    pub error: Option<String>,
    pub error_description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GitHubUser {
    pub id: u64,
    pub login: String,
    pub name: Option<String>,
    pub email: Option<String>,
    pub avatar_url: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OAuthResult {
    pub access_token: String,
    pub user: GitHubUser,
}

/// Start GitHub OAuth flow - opens browser and waits for callback
#[tauri::command]
pub async fn github_oauth_start(client_id: String, client_secret: String) -> CmdResult<OAuthResult> {
    use std::io::{Read, Write};
    use std::net::TcpListener;

    // Use fixed port 4002 for OAuth callback (must match GitHub OAuth app settings)
    let port = 4002;
    let listener = TcpListener::bind(format!("127.0.0.1:{}", port))
        .map_err(|e| CommandError::Io(format!("Failed to bind local server on port {}: {}", port, e)))?;

    let redirect_uri = format!("http://127.0.0.1:{}/callback", port);
    let auth_url = format!(
        "https://github.com/login/oauth/authorize?client_id={}&redirect_uri={}&scope=repo%20user%20read:org",
        client_id,
        urlencoding::encode(&redirect_uri)
    );

    // Open browser
    log::info!("Opening browser for OAuth: {}", auth_url);
    open::that(&auth_url).map_err(|e| CommandError::Io(format!("Failed to open browser: {}", e)))?;

    // Wait for callback (with timeout)
    listener.set_nonblocking(false).ok();

    // Set a timeout by using a separate thread
    let (tx, rx) = oneshot::channel::<Result<String, String>>();
    let listener = Arc::new(listener);
    let listener_clone = listener.clone();

    std::thread::spawn(move || {
        match listener_clone.accept() {
            Ok((mut stream, _)) => {
                let mut buffer = [0; 2048];
                if let Ok(size) = stream.read(&mut buffer) {
                    let request = String::from_utf8_lossy(&buffer[..size]);

                    // Extract code from callback URL
                    if let Some(code) = extract_code_from_request(&request) {
                        // Send success response to browser
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

    // Wait for the code with timeout (5 minutes)
    let code = match tokio::time::timeout(
        std::time::Duration::from_secs(300),
        rx
    ).await {
        Ok(Ok(Ok(code))) => code,
        Ok(Ok(Err(e))) => return Err(CommandError::Internal(e)),
        Ok(Err(_)) => return Err(CommandError::Internal("Callback cancelled".into())),
        Err(_) => return Err(CommandError::Internal("Authentication timed out".into())),
    };

    // Exchange code for access token
    let client = crate::HTTP_CLIENT.clone();
    let token_response = client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .form(&[
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("code", code.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
        ])
        .send()
        .await?;

    let token_data: AccessTokenResponse = token_response
        .json()
        .await?;

    let access_token = token_data.access_token
        .ok_or_else(|| CommandError::NotFound(token_data.error_description.unwrap_or_else(|| "Failed to get access token".to_string())))?;

    // Get user info
    let user = github_get_user_internal(&client, &access_token).await?;

    Ok(OAuthResult { access_token, user })
}

/// Get GitHub user info (internal)
async fn github_get_user_internal(client: &reqwest::Client, access_token: &str) -> CmdResult<GitHubUser> {
    let response = client
        .get("https://api.github.com/user")
        .header("Accept", "application/vnd.github.v3+json")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("User-Agent", "tv-desktop")
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(CommandError::Http { status: status.as_u16(), body });
    }

    Ok(response
        .json::<GitHubUser>()
        .await?)
}

/// Get GitHub user info (public command)
#[tauri::command]
pub async fn github_get_user(access_token: String) -> CmdResult<GitHubUser> {
    let client = crate::HTTP_CLIENT.clone();
    github_get_user_internal(&client, &access_token).await
}

// ============================================================================
// Microsoft 365 OAuth (Azure AD / Entra ID)
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct MicrosoftUser {
    pub id: String,
    pub email: String,
    pub name: String,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MicrosoftOAuthResult {
    pub access_token: String,
    pub user: MicrosoftUser,
}

#[derive(Debug, Deserialize)]
struct MsGraphTokenResponse {
    access_token: String,
    #[allow(dead_code)]
    token_type: Option<String>,
    #[allow(dead_code)]
    scope: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MsGraphUserProfile {
    id: Option<String>,
    display_name: Option<String>,
    mail: Option<String>,
    user_principal_name: Option<String>,
}

/// Start Microsoft 365 OAuth flow for login
/// Uses the same Azure AD app as Outlook but with minimal scopes (User.Read only)
/// Callback on port 4003 (must be registered in Azure AD app redirect URIs)
#[tauri::command]
pub async fn microsoft_oauth_start(
    client_id: String,
    tenant_id: String,
    client_secret: String,
) -> CmdResult<MicrosoftOAuthResult> {
    use std::io::{Read, Write};
    use std::net::TcpListener;

    let port = 4003;
    let listener = TcpListener::bind(format!("127.0.0.1:{}", port))
        .map_err(|e| CommandError::Io(format!("Failed to bind local server on port {}: {}", port, e)))?;

    let redirect_uri = format!("http://localhost:{}/callback", port);
    let scopes = "openid profile email User.Read";
    let auth_url = format!(
        "https://login.microsoftonline.com/{}/oauth2/v2.0/authorize?client_id={}&response_type=code&redirect_uri={}&scope={}&response_mode=query",
        tenant_id,
        client_id,
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(scopes),
    );

    log::info!("Opening browser for Microsoft login: {}", auth_url);
    open::that(&auth_url).map_err(|e| CommandError::Io(format!("Failed to open browser: {}", e)))?;

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

    let code = match tokio::time::timeout(
        std::time::Duration::from_secs(300),
        rx,
    ).await {
        Ok(Ok(Ok(code))) => code,
        Ok(Ok(Err(e))) => return Err(CommandError::Internal(e)),
        Ok(Err(_)) => return Err(CommandError::Internal("Callback cancelled".to_string())),
        Err(_) => return Err(CommandError::Internal("Authentication timed out".to_string())),
    };

    // Exchange code for token
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

    let token_data: MsGraphTokenResponse = response
        .json()
        .await
        .map_err(|e| CommandError::Parse(format!("Failed to parse token response: {}", e)))?;

    if let Some(err) = token_data.error {
        let desc = token_data.error_description.unwrap_or_default();
        return Err(CommandError::Network(format!("OAuth error: {} - {}", err, desc)));
    }

    // Get user profile from MS Graph
    let user = microsoft_get_user_internal(&client, &token_data.access_token).await?;

    Ok(MicrosoftOAuthResult {
        access_token: token_data.access_token,
        user,
    })
}

/// Get Microsoft user profile (internal)
async fn microsoft_get_user_internal(client: &reqwest::Client, access_token: &str) -> CmdResult<MicrosoftUser> {
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

    let profile: MsGraphUserProfile = response
        .json()
        .await
        .map_err(|e| CommandError::Parse(format!("Failed to parse user profile: {}", e)))?;

    let email = profile.mail
        .or(profile.user_principal_name)
        .ok_or_else(|| CommandError::NotFound("No email found in Microsoft profile".to_string()))?;

    Ok(MicrosoftUser {
        id: profile.id.unwrap_or_default(),
        email,
        name: profile.display_name.unwrap_or_else(|| "Unknown".to_string()),
        avatar_url: None, // MS Graph photo endpoint requires separate call, skip for now
    })
}

/// Validate a Microsoft token by fetching user profile (public command)
#[tauri::command]
pub async fn microsoft_get_user(access_token: String) -> CmdResult<MicrosoftUser> {
    let client = crate::HTTP_CLIENT.clone();
    microsoft_get_user_internal(&client, &access_token).await
}

// ============================================================================
// Generic OAuth browser flow (for Supabase Auth)
// ============================================================================

/// Open a URL in the system browser and listen for the OAuth callback.
/// Returns the authorization code from the callback URL.
/// This is provider-agnostic — works with any Supabase Auth OAuth flow.
#[tauri::command]
pub async fn oauth_browser_flow(url: String, port: u16) -> CmdResult<String> {
    use std::io::{Read, Write};
    use std::net::TcpListener;

    let listener = TcpListener::bind(format!("127.0.0.1:{}", port))
        .map_err(|e| CommandError::Io(format!("Failed to bind on port {}: {}", port, e)))?;

    // Open browser
    log::info!("Opening browser for OAuth: {}", url);
    open::that(&url).map_err(|e| CommandError::Io(format!("Failed to open browser: {}", e)))?;

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

    match tokio::time::timeout(std::time::Duration::from_secs(300), rx).await {
        Ok(Ok(Ok(code))) => Ok(code),
        Ok(Ok(Err(e))) => Err(CommandError::Internal(e)),
        Ok(Err(_)) => Err(CommandError::Internal("Callback cancelled".into())),
        Err(_) => Err(CommandError::Internal("Authentication timed out".into())),
    }
}

// ============================================================================
// Shared helpers
// ============================================================================

/// Extract authorization code from HTTP request
fn extract_code_from_request(request: &str) -> Option<String> {
    // Parse GET /callback?code=xxx HTTP/1.1
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
