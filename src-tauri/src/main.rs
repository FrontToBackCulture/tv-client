#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod models;
mod mcp;

use tauri::Manager;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

pub struct AppState {
    pub knowledge_path: String,
}

fn create_new_window(app: &tauri::AppHandle) {
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let label = format!("module-main-{}", millis);

    let builder = tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::App("/".into()))
        .title("TV Client")
        .inner_size(1400.0, 900.0)
        .min_inner_size(1000.0, 600.0)
        .resizable(true)
        .fullscreen(false)
        .decorations(true);

    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true);

    match builder.build()
    {
        Ok(_) => eprintln!("[tv-desktop] New window created: {}", label),
        Err(e) => eprintln!("[tv-desktop] Failed to create window: {}", e),
    }
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            eprintln!("[tv-desktop] Setup starting...");
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

            // Start Outlook background sync
            commands::outlook::background::start_background_sync(app.handle().clone());

            // Start MCP HTTP server (for external tool access)
            tauri::async_runtime::spawn(async {
                eprintln!("[tv-desktop] Starting MCP HTTP server on port {}...", mcp::server::DEFAULT_PORT);
                if let Err(e) = mcp::server::run_http(mcp::server::DEFAULT_PORT).await {
                    eprintln!("[tv-desktop] MCP server error: {}", e);
                }
            });

            // Build native macOS menu bar
            let handle = app.handle();

            let new_window = MenuItem::with_id(handle, "new-window", "New Window", true, Some("CmdOrCtrl+N"))?;
            let close_window = PredefinedMenuItem::close_window(handle, None)?;

            let file_menu = Submenu::with_items(handle, "File", true, &[
                &new_window,
                &PredefinedMenuItem::separator(handle)?,
                &close_window,
            ])?;

            let edit_menu = Submenu::with_items(handle, "Edit", true, &[
                &PredefinedMenuItem::undo(handle, None)?,
                &PredefinedMenuItem::redo(handle, None)?,
                &PredefinedMenuItem::separator(handle)?,
                &PredefinedMenuItem::cut(handle, None)?,
                &PredefinedMenuItem::copy(handle, None)?,
                &PredefinedMenuItem::paste(handle, None)?,
                &PredefinedMenuItem::select_all(handle, None)?,
            ])?;

            let window_menu = Submenu::with_items(handle, "Window", true, &[
                &PredefinedMenuItem::minimize(handle, None)?,
                &PredefinedMenuItem::maximize(handle, None)?,
                &PredefinedMenuItem::separator(handle)?,
            ])?;

            let menu = Menu::with_items(handle, &[
                &file_menu,
                &edit_menu,
                &window_menu,
            ])?;

            app.set_menu(menu)?;

            app.on_menu_event(|app_handle, event| {
                if event.id().as_ref() == "new-window" {
                    create_new_window(app_handle);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Test command
            commands::greet,
            // MCP commands (for UI capability explorer)
            commands::mcp::mcp_list_tools,
            commands::mcp::mcp_call_tool,
            commands::mcp::mcp_get_status,
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
            commands::settings::settings_get_intercom_key,
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
            // Intercom API (help center publishing)
            commands::tools::intercom::intercom_list_collections,
            commands::tools::intercom::intercom_publish_article,
            commands::tools::intercom::intercom_update_article,
            commands::tools::intercom::intercom_delete_article,
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
            // VAL Sync - Config
            commands::val_sync::config::val_sync_load_config,
            commands::val_sync::config::val_sync_save_config,
            commands::val_sync::config::val_sync_list_domains,
            commands::val_sync::config::val_sync_import_config,
            commands::val_sync::config::val_sync_discover_domains,
            // VAL Sync - Auth
            commands::val_sync::auth::val_sync_login,
            commands::val_sync::auth::val_sync_login_with_credentials,
            commands::val_sync::auth::val_sync_check_auth,
            commands::val_sync::auth::val_sync_clear_token,
            // VAL Sync - Sync operations
            commands::val_sync::sync::val_sync_fields,
            commands::val_sync::sync::val_sync_queries,
            commands::val_sync::sync::val_sync_workflows,
            commands::val_sync::sync::val_sync_dashboards,
            commands::val_sync::sync::val_sync_tables,
            commands::val_sync::sync::val_sync_calc_fields,
            commands::val_sync::sync::val_sync_all,
            // VAL Sync - Monitoring operations
            commands::val_sync::monitoring::val_sync_workflow_executions,
            commands::val_sync::monitoring::val_sync_sod_tables_status,
            // VAL Sync - Error sync operations
            commands::val_sync::errors::val_sync_importer_errors,
            commands::val_sync::errors::val_sync_integration_errors,
            // VAL Sync - Extract operations
            commands::val_sync::extract::val_extract_queries,
            commands::val_sync::extract::val_extract_workflows,
            commands::val_sync::extract::val_extract_dashboards,
            commands::val_sync::extract::val_extract_tables,
            commands::val_sync::extract::val_extract_sql,
            commands::val_sync::extract::val_extract_calc_fields,
            // VAL Sync - Metadata
            commands::val_sync::metadata::val_sync_get_status,
            commands::val_sync::metadata::val_get_output_status,
            // VAL Sync - Health checks
            commands::val_sync::health::val_generate_health_config,
            commands::val_sync::health::val_run_data_model_health,
            commands::val_sync::health::val_run_workflow_health,
            // VAL Sync - Additional health and audit
            commands::val_sync::audit::val_run_artifact_audit,
            commands::val_sync::query_health::val_run_query_health,
            commands::val_sync::dashboard_health::val_run_dashboard_health,
            commands::val_sync::overview::val_generate_overview,
            // VAL Sync - SQL execution
            commands::val_sync::sql::val_execute_sql,
            // VAL Sync - SQL generation (AI)
            commands::val_sync::sql_gen::val_generate_sql,
            // VAL Sync - Table Pipeline (generate overview.md)
            commands::val_sync::table_pipeline::val_prepare_table_overview,
            commands::val_sync::table_pipeline::val_sample_table_data,
            commands::val_sync::table_pipeline::val_fetch_categorical_values,
            commands::val_sync::table_pipeline::val_describe_table_data,
            commands::val_sync::table_pipeline::val_classify_table_data,
            commands::val_sync::table_pipeline::val_analyze_table_data,
            commands::val_sync::table_pipeline::val_extract_table_calc_fields,
            commands::val_sync::table_pipeline::val_generate_table_overview_md,
            commands::val_sync::table_pipeline::val_run_table_pipeline,
            commands::val_sync::table_pipeline::val_list_domain_tables,
            commands::val_sync::table_pipeline::val_scan_category_library,
            // Settings - MS Graph credentials
            commands::settings::settings_get_ms_graph_credentials,
            commands::settings::settings_get_anthropic_key,
            // Settings - VAL credentials
            commands::settings::settings_get_val_credentials,
            commands::settings::settings_import_val_credentials,
            // Outlook - Auth
            commands::outlook::auth::outlook_auth_start,
            commands::outlook::auth::outlook_auth_check,
            commands::outlook::auth::outlook_auth_logout,
            commands::outlook::auth::outlook_auth_import,
            // Outlook - Email queries
            commands::outlook::commands::outlook_list_emails,
            commands::outlook::commands::outlook_get_email,
            commands::outlook::commands::outlook_get_email_body,
            commands::outlook::commands::outlook_get_stats,
            // Outlook - Email actions
            commands::outlook::commands::outlook_mark_read,
            commands::outlook::commands::outlook_archive_email,
            commands::outlook::commands::outlook_send_email,
            // Outlook - Sync
            commands::outlook::commands::outlook_sync_start,
            commands::outlook::commands::outlook_sync_status,
            commands::outlook::commands::outlook_get_folders,
            commands::outlook::commands::outlook_bootstrap_contacts,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
