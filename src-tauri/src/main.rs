#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod models;
mod mcp;

use tauri::Manager;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

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
            // Knowledge path: env var > settings.json > empty (user must configure in Settings)
            let knowledge_path = std::env::var("TV_KNOWLEDGE_PATH")
                .ok()
                .or_else(|| {
                    commands::settings::load_settings()
                        .ok()
                        .and_then(|s| s.keys.get(commands::settings::KEY_KNOWLEDGE_PATH).cloned())
                        .filter(|p| !p.is_empty())
                })
                .unwrap_or_default();

            // Eagerly initialize the shared HTTP client
            let _ = &*crate::HTTP_CLIENT;

            let state = AppState { knowledge_path };
            app.manage(state);

            // Terminal sessions state
            app.manage(commands::terminal::TerminalSessions::default());

            // Reset any jobs stuck in "running" from a previous crash (async)
            tauri::async_runtime::spawn(async move {
                commands::scheduler::storage::reset_running_jobs_async().await;
            });

            // Start Outlook background sync
            commands::outlook::background::start_background_sync(app.handle().clone());

            // Start Notion background sync
            commands::notion::background::start_background_sync(app.handle().clone());

            // Start GA4 Analytics background sync (daily)
            commands::analytics::background::start_background_sync(app.handle().clone());

            // Start Scheduler background loop
            commands::scheduler::background::start_scheduler(
                app.handle().clone(),
                "0_Platform/sod-reports".to_string(),
            );

            // Start MCP HTTP server (for external tool access)
            tauri::async_runtime::spawn(async {
                eprintln!("[tv-desktop] Starting MCP HTTP server on port {}...", mcp::server::DEFAULT_PORT);
                if let Err(e) = mcp::server::run_http(mcp::server::DEFAULT_PORT).await {
                    eprintln!("[tv-desktop] MCP server error: {}", e);
                }
            });

            // Build native macOS menu bar
            let handle = app.handle();

            // App menu (macOS: first menu uses app name)
            let preferences = MenuItem::with_id(handle, "preferences", "Settings...", true, Some("CmdOrCtrl+,"))?;
            let app_menu = Submenu::with_items(handle, "TV Client", true, &[
                &PredefinedMenuItem::about(handle, Some("About TV Client"), None)?,
                &PredefinedMenuItem::separator(handle)?,
                &preferences,
                &PredefinedMenuItem::separator(handle)?,
                &PredefinedMenuItem::services(handle, None)?,
                &PredefinedMenuItem::separator(handle)?,
                &PredefinedMenuItem::hide(handle, None)?,
                &PredefinedMenuItem::hide_others(handle, None)?,
                &PredefinedMenuItem::show_all(handle, None)?,
                &PredefinedMenuItem::separator(handle)?,
                &PredefinedMenuItem::quit(handle, None)?,
            ])?;

            // File menu
            let new_window = MenuItem::with_id(handle, "new-window", "New Window", true, Some("CmdOrCtrl+N"))?;
            let close_window = PredefinedMenuItem::close_window(handle, None)?;
            let file_menu = Submenu::with_items(handle, "File", true, &[
                &new_window,
                &PredefinedMenuItem::separator(handle)?,
                &close_window,
            ])?;

            // Edit menu
            let edit_menu = Submenu::with_items(handle, "Edit", true, &[
                &PredefinedMenuItem::undo(handle, None)?,
                &PredefinedMenuItem::redo(handle, None)?,
                &PredefinedMenuItem::separator(handle)?,
                &PredefinedMenuItem::cut(handle, None)?,
                &PredefinedMenuItem::copy(handle, None)?,
                &PredefinedMenuItem::paste(handle, None)?,
                &PredefinedMenuItem::select_all(handle, None)?,
            ])?;

            // View menu
            let reload = MenuItem::with_id(handle, "reload", "Reload", true, Some("CmdOrCtrl+R"))?;
            let zoom_in = MenuItem::with_id(handle, "zoom-in", "Zoom In", true, Some("CmdOrCtrl+="))?;
            let zoom_out = MenuItem::with_id(handle, "zoom-out", "Zoom Out", true, Some("CmdOrCtrl+-"))?;
            let zoom_reset = MenuItem::with_id(handle, "zoom-reset", "Actual Size", true, Some("CmdOrCtrl+0"))?;
            let fullscreen = MenuItem::with_id(handle, "fullscreen", "Toggle Full Screen", true, Some("Ctrl+CmdOrCtrl+F"))?;
            let view_menu = Submenu::with_items(handle, "View", true, &[
                &reload,
                &PredefinedMenuItem::separator(handle)?,
                &zoom_in,
                &zoom_out,
                &zoom_reset,
                &PredefinedMenuItem::separator(handle)?,
                &fullscreen,
            ])?;

            // Window menu
            let window_menu = Submenu::with_items(handle, "Window", true, &[
                &PredefinedMenuItem::minimize(handle, None)?,
                &PredefinedMenuItem::maximize(handle, None)?,
            ])?;

            let menu = Menu::with_items(handle, &[
                &app_menu,
                &file_menu,
                &edit_menu,
                &view_menu,
                &window_menu,
            ])?;

            app.set_menu(menu)?;

            app.on_menu_event(|app_handle, event| {
                match event.id().as_ref() {
                    "new-window" => {
                        create_new_window(app_handle);
                    }
                    "preferences" => {
                        // Emit event to frontend to toggle settings modal
                        if let Some(webview) = app_handle.webview_windows().values().next() {
                            let _ = webview.eval("window.dispatchEvent(new CustomEvent('menu-preferences'))");
                        }
                    }
                    "reload" => {
                        if let Some(webview) = app_handle.webview_windows().values().next() {
                            let _ = webview.eval("window.location.reload()");
                        }
                    }
                    "zoom-in" => {
                        if let Some(webview) = app_handle.webview_windows().values().next() {
                            let _ = webview.eval("window.dispatchEvent(new CustomEvent('menu-zoom', { detail: 'in' }))");
                        }
                    }
                    "zoom-out" => {
                        if let Some(webview) = app_handle.webview_windows().values().next() {
                            let _ = webview.eval("window.dispatchEvent(new CustomEvent('menu-zoom', { detail: 'out' }))");
                        }
                    }
                    "zoom-reset" => {
                        if let Some(webview) = app_handle.webview_windows().values().next() {
                            let _ = webview.eval("window.dispatchEvent(new CustomEvent('menu-zoom', { detail: 'reset' }))");
                        }
                    }
                    "fullscreen" => {
                        if let Some(window) = app_handle.webview_windows().values().next() {
                            let is_fullscreen = window.is_fullscreen().unwrap_or(false);
                            let _ = window.set_fullscreen(!is_fullscreen);
                        }
                    }
                    _ => {}
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Claude Code MCP setup
            commands::claude_setup::check_claude_cli,
            commands::claude_setup::claude_mcp_status,
            commands::claude_setup::claude_mcp_install,
            commands::claude_setup::claude_mcp_uninstall,
            // MCP commands (for UI capability explorer)
            commands::mcp::mcp_list_tools,
            commands::mcp::mcp_call_tool,
            commands::mcp::mcp_get_status,
            // File operations (Rust native)
            commands::files::read_file,
            commands::files::write_file,
            commands::files::write_file_base64,
            commands::files::delete_file,
            commands::files::list_directory,
            commands::files::get_file_tree,
            commands::files::create_directory,
            commands::files::rename_path,
            commands::files::get_file_info,
            commands::files::watch_directory,
            commands::files::unwatch_directory,
            commands::files::open_in_finder,
            commands::files::open_with_default_app,
            commands::files::read_file_binary,
            commands::files::get_folder_files,
            // Folder Chat (AI-powered folder Q&A)
            commands::folder_chat::folder_chat_ask,
            // Help Chat (in-app help bot)
            commands::help_chat::help_chat_ask,
            // Search operations (Rust native)
            commands::search::search_files,
            commands::search::search_content,
            // Auth operations (GitHub OAuth + Microsoft 365)
            commands::auth::github_oauth_start,
            commands::auth::github_get_user,
            commands::auth::microsoft_oauth_start,
            commands::auth::microsoft_get_user,
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
            commands::settings::settings_export_to_file,
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
            commands::tools::docgen::html_to_pdf_cmd,
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
            commands::work::work_add_task_assignees,
            commands::work::work_remove_task_assignees,
            commands::work::work_task_triage,
            commands::work::work_apply_triage,
            commands::work::work_triage_summary,
            commands::work::work_list_triage_contexts,
            commands::work::work_upsert_triage_context,
            commands::work::work_delete_triage_context,
            commands::work::work_get_context_weights,
            commands::work::work_set_context_weights,
            commands::work::work_get_priorities,
            commands::work::work_reprioritise,
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
            // Public Data Module
            commands::public_data::classify_job_postings,
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
            // CRM Module - Activities
            commands::crm::crm_list_activities,
            commands::crm::crm_log_activity,
            commands::crm::crm_delete_activity,
            // Apollo Module - Prospect Search & Import
            commands::apollo::apollo_search_people,
            commands::apollo::apollo_enrich_person,
            commands::apollo::apollo_reveal_phone,
            commands::apollo::apollo_check_existing,
            commands::apollo::apollo_import_prospects,
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
            commands::val_sync::config::val_sync_update_domain_type,
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
            commands::val_sync::monitoring::val_fetch_notifications,
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
            // VAL Sync - Dependencies & Recency
            commands::val_sync::dependencies::val_compute_dependencies,
            commands::val_sync::recency::val_collect_recency,
            // VAL Sync - Claude Runner
            commands::val_sync::claude_runner::claude_run,
            commands::val_sync::claude_runner::claude_run_cancel,
            // VAL Sync - Metadata
            commands::val_sync::metadata::val_sync_get_status,
            commands::val_sync::metadata::val_get_output_status,
            // VAL Sync - Domain Model (entity scan across domains)
            commands::val_sync::domain_model::val_list_domain_model_entities,
            commands::val_sync::domain_model::val_scan_domain_model_table,
            commands::val_sync::domain_model::val_read_domain_model_file,
            commands::val_sync::domain_model::val_generate_schema_md,
            commands::val_sync::domain_model::val_create_domain_model_schema,
            commands::val_sync::domain_model::val_enrich_schema_descriptions,
            commands::val_sync::domain_model::val_build_field_master,
            commands::val_sync::domain_model::val_save_field_master,
            // VAL Sync - AI Package (generate domain AI skill packages)
            commands::val_sync::ai_package::val_generate_ai_package,
            commands::val_sync::ai_package::val_list_domain_ai_status,
            commands::val_sync::ai_package::val_save_domain_ai_config,
            commands::val_sync::ai_package::val_skill_deployment_status,
            commands::val_sync::ai_package::val_ai_table_coverage,
            // VAL Sync - S3 sync (push AI folders to S3)
            commands::val_sync::s3_sync::val_sync_ai_to_s3,
            commands::val_sync::s3_sync::val_s3_ai_status,
            commands::val_sync::s3_sync::gallery_upload_demo_report,
            // VAL Sync - Drive (file browser)
            commands::val_sync::drive::val_drive_list_folders,
            commands::val_sync::drive::val_drive_list_files,
            commands::val_sync::drive::val_drive_workflow_folders,
            commands::val_sync::drive::val_drive_scan_config_load,
            commands::val_sync::drive::val_drive_scan_config_save,
            commands::val_sync::drive::val_drive_scan_config_seed,
            commands::val_sync::drive::val_drive_scan_results_load,
            commands::val_sync::drive::val_drive_scan_results_save,
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
            // GA4 Analytics - Auth
            commands::analytics::auth::ga4_auth_start,
            commands::analytics::auth::ga4_auth_check,
            commands::analytics::auth::ga4_auth_logout,
            // GA4 Analytics - Data
            commands::analytics::ga4::ga4_check_config,
            commands::analytics::ga4::ga4_fetch_analytics,
            commands::analytics::ga4::ga4_fetch_website_analytics,
            commands::analytics::ga4::ga4_list_dimensions,
            // Settings - MS Graph credentials
            commands::settings::settings_get_ms_graph_credentials,
            commands::settings::settings_get_anthropic_key,
            commands::settings::settings_get_aws_credentials,
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
            // Outlook - User lookup
            commands::outlook::commands::outlook_lookup_user,
            // GitHub Sync
            commands::github_sync::config::github_sync_load_config,
            commands::github_sync::config::github_sync_save_config,
            commands::github_sync::config::github_sync_import_config,
            commands::github_sync::config::github_sync_init_default_config,
            commands::github_sync::sync::github_sync_preview,
            commands::github_sync::sync::github_sync_run,
            // Scheduler
            commands::scheduler::commands::scheduler_list_jobs,
            commands::scheduler::commands::scheduler_get_job,
            commands::scheduler::commands::scheduler_create_job,
            commands::scheduler::commands::scheduler_update_job,
            commands::scheduler::commands::scheduler_delete_job,
            commands::scheduler::commands::scheduler_toggle_job,
            commands::scheduler::commands::scheduler_run_job,
            commands::scheduler::commands::scheduler_list_runs,
            commands::scheduler::commands::scheduler_get_run,
            commands::scheduler::commands::scheduler_get_run_steps,
            commands::scheduler::commands::scheduler_get_status,
            commands::scheduler::commands::scheduler_stop_job,
            commands::scheduler::commands::scheduler_export_jobs,
            commands::scheduler::commands::scheduler_import_jobs,
            // Skill Registry
            commands::skill_registry::skill_init,
            commands::skill_registry::skill_distribute,
            commands::skill_registry::skill_check,
            commands::skill_registry::skill_pull,
            commands::skill_registry::skill_diff,
            commands::skill_registry::skill_check_all,
            commands::skill_registry::skill_list_bots,
            commands::skill_registry::skill_distribute_to,
            commands::skill_registry::skill_summary,
            commands::skill_registry::skill_inspect,
            commands::skill_registry::skill_list_examples,
            commands::skill_registry::ai_summarize_diff,
            // Gallery
            commands::gallery::gallery_scan,
            // Repos (GitHub)
            commands::repos::commands::repos_get_commits,
            commands::repos::commands::repos_get_releases,
            commands::repos::commands::repos_get_workflow_runs,
            // Outlook - Sync
            commands::outlook::commands::outlook_initial_setup,
            commands::outlook::commands::outlook_sync_start,
            commands::outlook::commands::outlook_sync_status,
            commands::outlook::commands::outlook_get_folders,
            commands::outlook::commands::outlook_bootstrap_contacts,
            commands::outlook::commands::outlook_scan_emails,
            // Outlook - Calendar
            commands::outlook::commands::outlook_get_event,
            commands::outlook::commands::outlook_list_calendars,
            commands::outlook::commands::outlook_list_events,
            commands::outlook::commands::outlook_scan_events,
            commands::outlook::commands::outlook_calendar_sync_start,
            commands::outlook::commands::outlook_calendar_sync_status,
            // Email (SES campaign sending)
            commands::email::email_send_campaign,
            commands::email::email_send_test,
            commands::email::email_send_draft,
            commands::email::email_upload_report,
            commands::email::email_clear_report,
            commands::email::email_test_ses_connection,
            // Discussions
            commands::discussions::discussions_list,
            commands::discussions::discussions_create,
            commands::discussions::discussions_update,
            commands::discussions::discussions_delete,
            commands::discussions::discussions_count,
            // Notifications
            commands::notifications::notifications_list,
            commands::notifications::notifications_unread_count,
            commands::notifications::notifications_mark_read,
            commands::notifications::notifications_mark_all_read,
            // Notion Sync
            commands::notion::commands::notion_list_databases,
            commands::notion::commands::notion_get_database_schema,
            commands::notion::commands::notion_preview_cards,
            commands::notion::commands::notion_list_users,
            commands::notion::commands::notion_list_database_pages,
            commands::notion::commands::notion_get_page_content,
            commands::notion::commands::notion_list_sync_configs,
            commands::notion::commands::notion_save_sync_config,
            commands::notion::commands::notion_update_sync_config,
            commands::notion::commands::notion_delete_sync_config,
            commands::notion::commands::notion_sync_start,
            commands::notion::commands::notion_sync_initial,
            commands::notion::commands::notion_sync_status,
            commands::notion::commands::notion_push_task,
            commands::notion::commands::notion_pull_task,
            commands::notion::commands::notion_get_block_children,
            commands::notion::commands::notion_page_to_markdown,
            // S3 Browser
            commands::s3_browser::s3_browse_buckets,
            commands::s3_browser::s3_browse_list,
            commands::s3_browser::s3_browse_delete,
            commands::s3_browser::s3_browse_list_all_keys,
            commands::s3_browser::s3_browse_presign,
            commands::s3_browser::s3_browse_get_text,
            // LinkedIn - Auth
            commands::linkedin::auth::linkedin_auth_start,
            commands::linkedin::auth::linkedin_auth_check,
            commands::linkedin::auth::linkedin_auth_logout,
            // LinkedIn - Posts API
            commands::linkedin::api::linkedin_create_post,
            commands::linkedin::api::linkedin_get_posts,
            commands::linkedin::api::linkedin_delete_post,
            commands::linkedin::api::linkedin_get_profile,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
