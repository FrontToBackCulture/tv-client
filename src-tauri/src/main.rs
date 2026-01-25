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
            // Settings (secure key storage)
            commands::settings::settings_set_key,
            commands::settings::settings_get_key,
            commands::settings::settings_delete_key,
            commands::settings::settings_has_key,
            commands::settings::settings_get_masked_key,
            commands::settings::settings_get_status,
            commands::settings::settings_list_keys,
            commands::settings::settings_get_gamma_key,
            commands::settings::settings_get_gemini_key,
            commands::settings::settings_get_github_credentials,
            commands::settings::settings_get_supabase_credentials,
            commands::settings::settings_get_path,
            commands::settings::settings_import_from_file,
            // Terminal operations (PTY)
            commands::terminal::terminal_create,
            commands::terminal::terminal_write,
            commands::terminal::terminal_read,
            commands::terminal::terminal_resize,
            commands::terminal::terminal_close,
            commands::terminal::terminal_list,
            // Gamma API (presentations)
            commands::tools::gamma::gamma_create_generation,
            commands::tools::gamma::gamma_get_status,
            commands::tools::gamma::gamma_generate,
            commands::tools::gamma::gamma_list_themes,
            commands::tools::gamma::gamma_list_all_themes,
            commands::tools::gamma::gamma_list_folders,
            // Nanobanana API (image generation)
            commands::tools::nanobanana::nanobanana_generate,
            commands::tools::nanobanana::nanobanana_generate_to_file,
            commands::tools::nanobanana::nanobanana_parse_config,
            commands::tools::nanobanana::nanobanana_generate_from_file,
            commands::tools::nanobanana::nanobanana_list_models,
            // Document generation (PDF)
            commands::tools::docgen::generate_order_form_pdf_cmd,
            commands::tools::docgen::generate_proposal_pdf_cmd,
            // Work Module - Projects
            commands::work::work_list_projects,
            commands::work::work_get_project,
            commands::work::work_create_project,
            commands::work::work_update_project,
            commands::work::work_delete_project,
            commands::work::work_list_project_statuses,
            commands::work::work_list_project_updates,
            commands::work::work_create_project_update,
            commands::work::work_delete_project_update,
            // Work Module - Tasks
            commands::work::work_list_tasks,
            commands::work::work_get_task,
            commands::work::work_create_task,
            commands::work::work_update_task,
            commands::work::work_delete_task,
            commands::work::work_add_task_labels,
            commands::work::work_remove_task_labels,
            // Work Module - Milestones
            commands::work::work_list_milestones,
            commands::work::work_get_milestone,
            commands::work::work_create_milestone,
            commands::work::work_update_milestone,
            commands::work::work_delete_milestone,
            // Work Module - Initiatives
            commands::work::work_list_initiatives,
            commands::work::work_get_initiative,
            commands::work::work_create_initiative,
            commands::work::work_update_initiative,
            commands::work::work_delete_initiative,
            commands::work::work_add_project_to_initiative,
            commands::work::work_remove_project_from_initiative,
            commands::work::work_list_initiative_projects,
            // Work Module - Labels
            commands::work::work_list_labels,
            commands::work::work_get_label,
            commands::work::work_create_label,
            commands::work::work_update_label,
            commands::work::work_delete_label,
            // Work Module - Users
            commands::work::work_list_users,
            commands::work::work_list_humans,
            commands::work::work_list_bots,
            commands::work::work_get_user,
            commands::work::work_find_user_by_email,
            commands::work::work_find_user_by_github,
            commands::work::work_find_bot_by_folder,
            // CRM Module - Companies
            commands::crm::crm_list_companies,
            commands::crm::crm_find_company,
            commands::crm::crm_get_company,
            commands::crm::crm_create_company,
            commands::crm::crm_update_company,
            commands::crm::crm_delete_company,
            // CRM Module - Contacts
            commands::crm::crm_list_contacts,
            commands::crm::crm_find_contact,
            commands::crm::crm_get_contact,
            commands::crm::crm_create_contact,
            commands::crm::crm_update_contact,
            commands::crm::crm_delete_contact,
            // CRM Module - Deals
            commands::crm::crm_list_deals,
            commands::crm::crm_get_deal,
            commands::crm::crm_create_deal,
            commands::crm::crm_update_deal,
            commands::crm::crm_delete_deal,
            commands::crm::crm_get_pipeline,
            // CRM Module - Activities
            commands::crm::crm_list_activities,
            commands::crm::crm_log_activity,
            commands::crm::crm_delete_activity,
            // CRM Module - Email Links
            commands::crm::crm_get_email_link,
            commands::crm::crm_link_email,
            commands::crm::crm_unlink_email,
            commands::crm::crm_auto_link_email,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
