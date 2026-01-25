// GitHub OAuth authentication commands
// Standard OAuth flow with local callback server

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::oneshot;

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

/// Start OAuth flow - opens browser and waits for callback
#[tauri::command]
pub async fn github_oauth_start(client_id: String, client_secret: String) -> Result<OAuthResult, String> {
    use std::io::{Read, Write};
    use std::net::TcpListener;

    // Use fixed port 4002 for OAuth callback (must match GitHub OAuth app settings)
    let port = 4002;
    let listener = TcpListener::bind(format!("127.0.0.1:{}", port))
        .map_err(|e| format!("Failed to bind local server on port {}: {}", port, e))?;

    let redirect_uri = format!("http://127.0.0.1:{}/callback", port);
    let auth_url = format!(
        "https://github.com/login/oauth/authorize?client_id={}&redirect_uri={}&scope=repo%20user%20read:org",
        client_id,
        urlencoding::encode(&redirect_uri)
    );

    // Open browser
    log::info!("Opening browser for OAuth: {}", auth_url);
    open::that(&auth_url).map_err(|e| format!("Failed to open browser: {}", e))?;

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
        Ok(Ok(Err(e))) => return Err(e),
        Ok(Err(_)) => return Err("Callback cancelled".to_string()),
        Err(_) => return Err("Authentication timed out".to_string()),
    };

    // Exchange code for access token
    let client = reqwest::Client::new();
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
        .await
        .map_err(|e| format!("Failed to exchange code: {}", e))?;

    let token_data: AccessTokenResponse = token_response
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    let access_token = token_data.access_token
        .ok_or_else(|| token_data.error_description.unwrap_or_else(|| "Failed to get access token".to_string()))?;

    // Get user info
    let user = github_get_user_internal(&client, &access_token).await?;

    Ok(OAuthResult { access_token, user })
}

/// Get GitHub user info (internal)
async fn github_get_user_internal(client: &reqwest::Client, access_token: &str) -> Result<GitHubUser, String> {
    let response = client
        .get("https://api.github.com/user")
        .header("Accept", "application/vnd.github.v3+json")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("User-Agent", "tv-desktop")
        .send()
        .await
        .map_err(|e| format!("Failed to get user info: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("GitHub returned {}: {}", status, body));
    }

    response
        .json::<GitHubUser>()
        .await
        .map_err(|e| format!("Failed to parse user response: {}", e))
}

/// Get GitHub user info (public command)
#[tauri::command]
pub async fn github_get_user(access_token: String) -> Result<GitHubUser, String> {
    let client = reqwest::Client::new();
    github_get_user_internal(&client, &access_token).await
}

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
