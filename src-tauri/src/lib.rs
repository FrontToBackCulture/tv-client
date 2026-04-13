// Library exports for tv-desktop
// Rust handles: file operations, search, terminal
// React handles: Work, CRM, Inbox via Supabase

pub mod commands;
pub mod models;

/// Application state shared across commands
pub struct AppState {
    pub knowledge_path: String,
}

/// Shared HTTP client — reuses connections, TLS sessions, and DNS cache.
/// 120s default timeout; individual requests can override with `.timeout()`.
pub static HTTP_CLIENT: once_cell::sync::Lazy<reqwest::Client> =
    once_cell::sync::Lazy::new(|| {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .expect("Failed to create HTTP client")
    });
