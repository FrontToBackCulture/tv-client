// Library exports for tv-desktop
// Rust handles: file operations, search, terminal
// React handles: Work, CRM, Inbox via Supabase

pub mod commands;
pub mod models;

/// Application state shared across commands
pub struct AppState {
    pub knowledge_path: String,
}
