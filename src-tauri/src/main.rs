#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod models;

use tauri::Manager;

pub struct AppState {
    pub knowledge_path: String,
}

fn main() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // Default knowledge path (can be configured in settings)
            let knowledge_path = std::env::var("TV_KNOWLEDGE_PATH")
                .unwrap_or_else(|_| {
                    dirs::home_dir()
                        .map(|h| h.join("Code/SkyNet/tv-knowledge").to_string_lossy().to_string())
                        .unwrap_or_default()
                });

            let state = AppState { knowledge_path };
            app.manage(state);

            // Terminal sessions state
            app.manage(commands::terminal::TerminalSessions::default());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Test command
            commands::greet,
            // File operations (Rust native)
            commands::files::read_file,
            commands::files::write_file,
            commands::files::delete_file,
            commands::files::list_directory,
            commands::files::get_file_tree,
            commands::files::create_directory,
            commands::files::rename_path,
            commands::files::get_file_info,
            commands::files::watch_directory,
            commands::files::open_in_finder,
            commands::files::open_with_default_app,
            commands::files::read_file_binary,
            commands::files::get_folder_files,
            // Search operations (Rust native)
            commands::search::search_files,
            commands::search::search_content,
            commands::search::index_directory,
            // Auth operations (GitHub OAuth)
            commands::auth::github_oauth_start,
            commands::auth::github_get_user,
            // Terminal operations (PTY)
            commands::terminal::terminal_create,
            commands::terminal::terminal_write,
            commands::terminal::terminal_read,
            commands::terminal::terminal_resize,
            commands::terminal::terminal_close,
            commands::terminal::terminal_list,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
