mod app_settings;
mod claude;
mod commands;
mod projects;
mod watcher;

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_global_shortcut::ShortcutState;

fn show_and_focus_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let open_shortcut = if cfg!(target_os = "macos") {
        "Command+J"
    } else {
        "Ctrl+J"
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts([open_shortcut])
                .expect("Failed to register global shortcut")
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        if let Some(window) = app.get_webview_window("main") {
                            let visible = window.is_visible().unwrap_or(false);
                            if visible {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::get_sessions,
            commands::get_session_tasks,
            commands::get_session_inputs,
            commands::get_stats,
            commands::refresh_stats_cache,
            commands::refresh_stats_cache_incremental,
            commands::get_today_usage,
            commands::focus_session_window,
            commands::focus_window_by_session_id,
            commands::focus_window_by_hwnd,
            commands::open_folder,
            commands::open_terminal,
            commands::run_project,
            commands::stop_project,
            commands::capture_windows_by_session_ids,
            commands::release_window,
            commands::release_all_windows,
            commands::get_captured_windows,
            commands::resize_captured_window,
            app_settings::get_app_settings,
            app_settings::set_input_filter_words,
            app_settings::update_app_settings,
            projects::list_user_projects,
            projects::add_user_project,
            projects::remove_user_project,
            projects::set_project_script,
        ])
        .setup(|app| {
            app_settings::ensure_config_file();

            let handle = app.handle().clone();
            let _watcher = watcher::FileWatcher::new(handle)
                .expect("Failed to start file watcher");
            app.manage(_watcher);

            let is_quitting = Arc::new(AtomicBool::new(false));
            if let Some(window) = app.get_webview_window("main") {
                let app_handle = app.handle().clone();
                let is_quitting_on_close = is_quitting.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        if !is_quitting_on_close.load(Ordering::SeqCst) {
                            api.prevent_close();
                            if let Some(window) = app_handle.get_webview_window("main") {
                                let _ = window.hide();
                            }
                        }
                    }
                });
            }

            let show_item = MenuItem::with_id(app, "show", "打开面板", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;
            let is_quitting_on_menu = is_quitting.clone();

            let tray_icon = app.default_window_icon().cloned();
            let mut tray_builder = TrayIconBuilder::with_id("main")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "show" => show_and_focus_main(app),
                    "quit" => {
                        is_quitting_on_menu.store(true, Ordering::SeqCst);
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::DoubleClick {
                        button: MouseButton::Left,
                        ..
                    } = event
                    {
                        show_and_focus_main(tray.app_handle());
                    }
                });
            if let Some(icon) = tray_icon {
                tray_builder = tray_builder.icon(icon);
            }
            tray_builder.build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
