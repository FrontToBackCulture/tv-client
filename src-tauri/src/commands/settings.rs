// Settings module - Simple JSON file storage for API keys and app settings
// Stores settings in ~/.tv-desktop/settings.json

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::command;

// Known API key names
pub const KEY_GAMMA_API: &str = "gamma_api_key";
pub const KEY_GEMINI_API: &str = "gemini_api_key";
pub const KEY_GITHUB_CLIENT_ID: &str = "github_client_id";
pub const KEY_GITHUB_CLIENT_SECRET: &str = "github_client_secret";
pub const KEY_SUPABASE_URL: &str = "supabase_url";
pub const KEY_SUPABASE_ANON_KEY: &str = "supabase_anon_key";
pub const KEY_OPENAI_API: &str = "openai_api_key";
pub const KEY_INTERCOM_API: &str = "intercom_api_key";

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Settings {
    #[serde(default)]
    pub keys: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKeyInfo {
    pub name: String,
    pub description: String,
    pub is_set: bool,
    pub masked_value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsStatus {
    pub gamma_api_key: bool,
    pub gemini_api_key: bool,
    pub github_client_id: bool,
    pub github_client_secret: bool,
    pub supabase_url: bool,
    pub supabase_anon_key: bool,
}

// ============================================================================
// Internal helpers
// ============================================================================

fn get_settings_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".tv-desktop")
}

fn get_settings_path() -> PathBuf {
    get_settings_dir().join("settings.json")
}

fn load_settings() -> Result<Settings, String> {
    let path = get_settings_path();
    if !path.exists() {
        return Ok(Settings::default());
    }
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read settings: {}", e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse settings: {}", e))
}

fn save_settings(settings: &Settings) -> Result<(), String> {
    let dir = get_settings_dir();
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create settings directory: {}", e))?;
    }
    let path = get_settings_path();
    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    fs::write(&path, content)
        .map_err(|e| format!("Failed to write settings: {}", e))
}

fn mask_key(key: &str) -> String {
    if key.len() <= 8 {
        "*".repeat(key.len())
    } else {
        format!("{}...{}", &key[..4], &key[key.len() - 4..])
    }
}

// ============================================================================
// Commands - Generic key operations
// ============================================================================

/// Set an API key
#[command]
pub fn settings_set_key(key_name: String, value: String) -> Result<(), String> {
    let mut settings = load_settings()?;
    settings.keys.insert(key_name, value);
    save_settings(&settings)
}

/// Get an API key
#[command]
pub fn settings_get_key(key_name: String) -> Result<Option<String>, String> {
    let settings = load_settings()?;
    Ok(settings.keys.get(&key_name).cloned())
}

/// Delete an API key
#[command]
pub fn settings_delete_key(key_name: String) -> Result<(), String> {
    let mut settings = load_settings()?;
    settings.keys.remove(&key_name);
    save_settings(&settings)
}

/// Check if an API key exists
#[command]
pub fn settings_has_key(key_name: String) -> Result<bool, String> {
    let settings = load_settings()?;
    Ok(settings.keys.contains_key(&key_name))
}

/// Get masked value of an API key (for display)
#[command]
pub fn settings_get_masked_key(key_name: String) -> Result<Option<String>, String> {
    let settings = load_settings()?;
    Ok(settings.keys.get(&key_name).map(|v| mask_key(v)))
}

// ============================================================================
// Commands - Convenience methods for specific keys
// ============================================================================

/// Get status of all known API keys
#[command]
pub fn settings_get_status() -> Result<SettingsStatus, String> {
    let settings = load_settings()?;
    Ok(SettingsStatus {
        gamma_api_key: settings.keys.contains_key(KEY_GAMMA_API),
        gemini_api_key: settings.keys.contains_key(KEY_GEMINI_API),
        github_client_id: settings.keys.contains_key(KEY_GITHUB_CLIENT_ID),
        github_client_secret: settings.keys.contains_key(KEY_GITHUB_CLIENT_SECRET),
        supabase_url: settings.keys.contains_key(KEY_SUPABASE_URL),
        supabase_anon_key: settings.keys.contains_key(KEY_SUPABASE_ANON_KEY),
    })
}

/// Get all API key info (for settings UI)
#[command]
pub fn settings_list_keys() -> Result<Vec<ApiKeyInfo>, String> {
    let settings = load_settings()?;

    let keys = vec![
        (KEY_GAMMA_API, "Gamma API Key", "For generating presentations"),
        (KEY_GEMINI_API, "Gemini API Key", "For image generation (Nanobanana)"),
        (KEY_GITHUB_CLIENT_ID, "GitHub Client ID", "For OAuth login"),
        (KEY_GITHUB_CLIENT_SECRET, "GitHub Client Secret", "For OAuth login"),
        (KEY_SUPABASE_URL, "Supabase URL", "Database connection"),
        (KEY_SUPABASE_ANON_KEY, "Supabase Anon Key", "Database authentication"),
        (KEY_OPENAI_API, "OpenAI API Key", "For AI features"),
        (KEY_INTERCOM_API, "Intercom API Key", "For Help Center publishing"),
    ];

    let mut result = Vec::new();
    for (name, display_name, description) in keys {
        let value = settings.keys.get(name);
        let is_set = value.is_some();
        let masked_value = value.map(|v| mask_key(v));

        result.push(ApiKeyInfo {
            name: name.to_string(),
            description: format!("{} - {}", display_name, description),
            is_set,
            masked_value,
        });
    }

    Ok(result)
}

// ============================================================================
// Commands - Tool-specific getters (for internal use)
// ============================================================================

/// Get Gamma API key (for gamma commands)
#[command]
pub fn settings_get_gamma_key() -> Result<Option<String>, String> {
    settings_get_key(KEY_GAMMA_API.to_string())
}

/// Get Gemini API key (for nanobanana commands)
#[command]
pub fn settings_get_gemini_key() -> Result<Option<String>, String> {
    settings_get_key(KEY_GEMINI_API.to_string())
}

/// Get GitHub credentials (for auth)
#[command]
pub fn settings_get_github_credentials() -> Result<(Option<String>, Option<String>), String> {
    let settings = load_settings()?;
    let client_id = settings.keys.get(KEY_GITHUB_CLIENT_ID).cloned();
    let client_secret = settings.keys.get(KEY_GITHUB_CLIENT_SECRET).cloned();
    Ok((client_id, client_secret))
}

/// Get Supabase credentials
#[command]
pub fn settings_get_supabase_credentials() -> Result<(Option<String>, Option<String>), String> {
    let settings = load_settings()?;
    let url = settings.keys.get(KEY_SUPABASE_URL).cloned();
    let anon_key = settings.keys.get(KEY_SUPABASE_ANON_KEY).cloned();
    Ok((url, anon_key))
}

/// Get the settings file path (for importing)
#[command]
pub fn settings_get_path() -> String {
    get_settings_path().to_string_lossy().to_string()
}

/// Import settings from a JSON file or env-style file
#[command]
pub fn settings_import_from_file(file_path: String) -> Result<Vec<String>, String> {
    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let mut imported = Vec::new();
    let mut settings = load_settings()?;

    // Try JSON first
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
        // Handle nested structure like { "keys": { ... } }
        if let Some(keys) = json.get("keys").and_then(|k| k.as_object()) {
            for (k, v) in keys {
                if let Some(val) = v.as_str() {
                    settings.keys.insert(k.clone(), val.to_string());
                    imported.push(k.clone());
                }
            }
        }
        // Handle flat structure
        else if let Some(obj) = json.as_object() {
            for (k, v) in obj {
                if let Some(val) = v.as_str() {
                    settings.keys.insert(k.clone(), val.to_string());
                    imported.push(k.clone());
                }
            }
        }
    } else {
        // Parse as .env file
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some(eq_pos) = line.find('=') {
                let key = line[..eq_pos].trim();
                let value = line[eq_pos + 1..].trim().trim_matches('"').trim_matches('\'');

                // Map env var names to our key names
                let mapped_key = match key {
                    "GAMMA_API_KEY" => Some(KEY_GAMMA_API),
                    "GEMINI_API_KEY" => Some(KEY_GEMINI_API),
                    "GITHUB_CLIENT_ID" => Some(KEY_GITHUB_CLIENT_ID),
                    "GITHUB_CLIENT_SECRET" => Some(KEY_GITHUB_CLIENT_SECRET),
                    "SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_URL" => Some(KEY_SUPABASE_URL),
                    "SUPABASE_ANON_KEY" | "NEXT_PUBLIC_SUPABASE_ANON_KEY" => Some(KEY_SUPABASE_ANON_KEY),
                    "OPENAI_API_KEY" => Some(KEY_OPENAI_API),
                    "INTERCOM_ACCESS_TOKEN" | "INTERCOM_API_KEY" => Some(KEY_INTERCOM_API),
                    _ => None,
                };

                if let Some(mapped) = mapped_key {
                    if !value.is_empty() {
                        settings.keys.insert(mapped.to_string(), value.to_string());
                        imported.push(format!("{} -> {}", key, mapped));
                    }
                }
            }
        }
    }

    save_settings(&settings)?;
    Ok(imported)
}
