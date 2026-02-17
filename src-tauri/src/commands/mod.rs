// Tauri IPC command handlers

pub mod auth;
pub mod claude_setup;
pub mod crm;
pub mod files;
pub mod folder_chat;
pub mod help_chat;
pub mod mcp;
pub mod outlook;
pub mod search;
pub mod settings;
pub mod supabase;
pub mod terminal;
pub mod tools;
pub mod val_sync;
pub mod work;

use tauri::command;

/// Simple greet command to test IPC
#[command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to TV Desktop.", name)
}
