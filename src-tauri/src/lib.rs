mod app_settings;
mod claude;
mod commands;
mod projects;
mod pty_manager;
mod tray_flash;
mod watcher;

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_global_shortcut::ShortcutState;

fn show_and_focus_main(app: &tauri::AppHandle) {
    tray_flash::stop_flash_if_active(app);
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
        .plugin(tauri_plugin_notification::init())
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
                                tray_flash::stop_flash_if_active(app);
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
            projects::set_project_url,
            pty_manager::pty_spawn,
            pty_manager::pty_write,
            pty_manager::pty_resize,
            pty_manager::pty_kill,
            pty_manager::pty_close,
            tray_flash::start_tray_flash,
            tray_flash::stop_tray_flash,
        ])
        .setup(|app| {
            app.manage(pty_manager::PtyManager::new());
            app.manage(tray_flash::TrayFlashState::new());
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
                .tooltip("AlienAgentView")
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
                    match event {
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            ..
                        } => {
                            let app = tray.app_handle();
                            let state = app.state::<tray_flash::TrayFlashState>();
                            if state.is_flashing() {
                                // 闪烁时单击：隐藏弹窗，停止闪烁，打开主窗口跳转终端
                                if let Some(popup) = app.get_webview_window("tray-popup") {
                                    let _ = popup.hide();
                                }
                                tray_flash::stop_flash_if_active(app);
                                show_and_focus_main(app);
                                let _ = app.emit("tray-click-while-flashing", ());
                            }
                        }
                        TrayIconEvent::DoubleClick {
                            button: MouseButton::Left,
                            ..
                        } => {
                            show_and_focus_main(tray.app_handle());
                        }
                        TrayIconEvent::Enter {
                            rect,
                            ..
                        } => {
                            let app = tray.app_handle();
                            let state = app.state::<tray_flash::TrayFlashState>();
                            if state.is_flashing() {
                                if let Some(popup) = app.get_webview_window("tray-popup") {
                                    // 定位弹窗到托盘图标上方
                                    let pos: tauri::PhysicalPosition<f64> = rect.position.to_physical(1.0);
                                    let size: tauri::PhysicalSize<f64> = rect.size.to_physical(1.0);
                                    if let Ok(popup_size) = popup.outer_size() {
                                        let x: f64 = pos.x + size.width / 2.0 - popup_size.width as f64 / 2.0;
                                        let y: f64 = pos.y - popup_size.height as f64 - 8.0;
                                        let _ = popup.set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
                                    }
                                    let _ = popup.show();
                                }
                            }
                        }
                        TrayIconEvent::Leave { .. } => {
                            let app = tray.app_handle().clone();
                            std::thread::spawn(move || {
                                std::thread::sleep(std::time::Duration::from_millis(300));
                                if let Some(popup) = app.get_webview_window("tray-popup") {
                                    if let (Ok(visible), Ok(pos), Ok(size)) =
                                        (popup.is_visible(), popup.outer_position(), popup.outer_size())
                                    {
                                        if visible {
                                            // 获取实时鼠标位置
                                            let mut point = windows::Win32::Foundation::POINT { x: 0, y: 0 };
                                            let _ = unsafe { windows::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut point) };
                                            let in_popup = point.x >= pos.x
                                                && point.x <= pos.x + size.width as i32
                                                && point.y >= pos.y
                                                && point.y <= pos.y + size.height as i32;
                                            if !in_popup {
                                                let _ = popup.hide();
                                            }
                                        }
                                    }
                                }
                            });
                        }
                        _ => {}
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
