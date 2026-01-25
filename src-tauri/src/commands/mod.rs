// Tauri IPC command handlers

pub mod auth;
pub mod files;
pub mod search;

use tauri::command;

/// Simple greet command to test IPC
#[command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to TV Desktop.", name)
}
