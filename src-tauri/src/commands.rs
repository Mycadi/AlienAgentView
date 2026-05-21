use crate::claude;

#[cfg(target_os = "windows")]
use std::sync::atomic::{AtomicIsize, AtomicU32, Ordering};
#[cfg(target_os = "windows")]
use std::sync::Mutex;
#[cfg(target_os = "windows")]
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
#[cfg(target_os = "windows")]
use windows::core::BOOL;
#[cfg(target_os = "windows")]
use windows::Win32::System::Console::{AttachConsole, FreeConsole, GetConsoleWindow};
#[cfg(target_os = "windows")]
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
    TH32CS_SNAPPROCESS,
};
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindowThreadProcessId, IsWindowVisible, SetForegroundWindow, ShowWindow,
    SW_RESTORE,
};

#[tauri::command]
pub async fn get_sessions() -> Result<Vec<claude::session::SessionInfo>, String> {
    tauri::async_runtime::spawn_blocking(claude::session::get_all_sessions)
        .await
        .map_err(|e| format!("Failed to get sessions: {e}"))
}

#[tauri::command]
pub fn get_session_tasks(session_id: String) -> Vec<claude::tasks::TaskInfo> {
    claude::tasks::get_session_tasks(&session_id)
}

#[tauri::command]
pub fn get_session_inputs(cwd: String, session_id: String) -> Vec<claude::conversation::SessionInput> {
    let project_dir_name = claude::session::encode_path_to_dir_name(&cwd);
    let settings = crate::app_settings::get_app_settings();
    claude::conversation::get_session_inputs(
        &project_dir_name,
        &session_id,
        &settings.input_filter_words,
    )
}

#[tauri::command]
pub fn get_stats() -> claude::stats::StatsOverview {
    claude::stats::get_stats()
}

#[tauri::command]
pub async fn refresh_stats_cache() -> Result<claude::stats::StatsOverview, String> {
    tauri::async_runtime::spawn_blocking(claude::stats::refresh_stats_cache)
        .await
        .map_err(|e| format!("Failed to refresh stats cache: {e}"))?
}

#[tauri::command]
pub async fn refresh_stats_cache_incremental() -> Result<claude::stats::StatsOverview, String> {
    tauri::async_runtime::spawn_blocking(claude::stats::refresh_stats_cache_incremental)
        .await
        .map_err(|e| format!("Failed to refresh stats cache incrementally: {e}"))?
}

#[tauri::command]
pub fn get_today_usage() -> claude::today_usage::TodayUsage {
    claude::today_usage::get_today_usage()
}

#[tauri::command]
pub fn focus_session_window(pid: u32) -> Result<(), String> {
    focus_process_window(pid)
}

#[tauri::command]
pub fn focus_window_by_session_id(session_id: String) -> Result<(), String> {
    focus_by_session_id_impl(&session_id)
}

#[cfg(target_os = "windows")]
fn focus_by_session_id_impl(session_id: &str) -> Result<(), String> {
    let windows = collect_aav_windows();
    let found = windows.iter().find(|w| w.session_id == session_id);
    match found {
        Some(w) => focus_window(w.hwnd),
        None => Err(format!("No window found for session {session_id}")),
    }
}

#[cfg(not(target_os = "windows"))]
fn focus_by_session_id_impl(_session_id: &str) -> Result<(), String> {
    Err("Only supported on Windows".to_string())
}

#[tauri::command]
pub fn focus_window_by_hwnd(hwnd: isize) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        focus_window(HWND(hwnd as _))
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = hwnd;
        Err("Not supported on this platform".to_string())
    }
}

#[cfg(target_os = "windows")]
fn focus_process_window(pid: u32) -> Result<(), String> {
    if pid == 0 {
        return Err("Session has no active process".to_string());
    }

    static TARGET_PID: AtomicU32 = AtomicU32::new(0);
    static FOUND_HWND: AtomicIsize = AtomicIsize::new(0);

    unsafe extern "system" fn enum_windows_proc(hwnd: HWND, _lparam: LPARAM) -> BOOL {
        if !unsafe { IsWindowVisible(hwnd) }.as_bool() {
            return true.into();
        }

        let mut window_pid = 0;
        unsafe { GetWindowThreadProcessId(hwnd, Some(&mut window_pid)) };
        if window_pid == TARGET_PID.load(Ordering::Relaxed) {
            FOUND_HWND.store(hwnd.0 as isize, Ordering::Relaxed);
            return false.into();
        }

        true.into()
    }

    for candidate_pid in get_process_chain(pid) {
        TARGET_PID.store(candidate_pid, Ordering::Relaxed);
        FOUND_HWND.store(0, Ordering::Relaxed);

        unsafe { EnumWindows(Some(enum_windows_proc), LPARAM(0)) }
            .map_err(|e| format!("Failed to enumerate windows: {e}"))?;

        let hwnd = FOUND_HWND.load(Ordering::Relaxed);
        if hwnd != 0 {
            return focus_window(HWND(hwnd as _));
        }

        if let Some(hwnd) = get_console_window_for_process(candidate_pid) {
            return focus_window(hwnd);
        }
    }

    Err("No visible window found for session process".to_string())
}

#[cfg(target_os = "windows")]
fn get_process_chain(pid: u32) -> Vec<u32> {
    let mut chain = vec![pid];
    let mut current_pid = pid;

    for _ in 0..8 {
        let Some(parent_pid) = get_parent_process_id(current_pid) else {
            break;
        };
        if parent_pid == 0 || chain.contains(&parent_pid) {
            break;
        }
        chain.push(parent_pid);
        current_pid = parent_pid;
    }

    chain
}

#[cfg(target_os = "windows")]
fn get_parent_process_id(pid: u32) -> Option<u32> {
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).ok()?;
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };

        let mut found = None;
        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                if entry.th32ProcessID == pid {
                    found = Some(entry.th32ParentProcessID);
                    break;
                }

                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }

        let _ = CloseHandle(snapshot);
        found
    }
}

#[cfg(target_os = "windows")]
fn get_console_window_for_process(pid: u32) -> Option<HWND> {
    unsafe {
        let _ = FreeConsole();

        if AttachConsole(pid).is_err() {
            return None;
        }

        let hwnd = GetConsoleWindow();
        let _ = FreeConsole();

        if hwnd.0 == std::ptr::null_mut() {
            None
        } else {
            Some(hwnd)
        }
    }
}

#[cfg(target_os = "windows")]
fn focus_window(hwnd: HWND) -> Result<(), String> {
    unsafe {
        let _ = ShowWindow(hwnd, SW_RESTORE);
        SetForegroundWindow(hwnd)
            .ok()
            .map_err(|e| format!("Failed to focus window: {e}"))
    }
}

#[cfg(not(target_os = "windows"))]
fn focus_process_window(_pid: u32) -> Result<(), String> {
    Err("Focusing session windows is only supported on Windows".to_string())
}

#[tauri::command]
pub fn open_folder(path: String) -> Result<(), String> {
    open_path_native(&path)
}

#[cfg(target_os = "windows")]
fn open_path_native(path: &str) -> Result<(), String> {
    use std::process::Stdio;

    std::process::Command::new("explorer")
        .arg(path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to open folder: {e}"))
}

#[cfg(target_os = "macos")]
fn open_path_native(path: &str) -> Result<(), String> {
    std::process::Command::new("open")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to open folder: {e}"))
}

#[cfg(all(unix, not(target_os = "macos")))]
fn open_path_native(path: &str) -> Result<(), String> {
    std::process::Command::new("xdg-open")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to open folder: {e}"))
}

#[tauri::command]
pub fn open_terminal(path: String, command: String) -> Result<(), String> {
    open_terminal_native(&path, &command)
}

#[tauri::command]
pub async fn run_project(path: String, scripts: String, delay_seconds: u64) -> Result<Vec<u32>, String> {
    run_project_native(&path, &scripts, delay_seconds).await
}

#[tauri::command]
pub fn stop_project(pid: u32) -> Result<(), String> {
    stop_project_native(pid)
}

#[cfg(target_os = "windows")]
fn open_terminal_native(path: &str, command: &str) -> Result<(), String> {
    std::process::Command::new("cmd")
        .args(["/c", "start", "", "cmd", "/k", command])
        .current_dir(path)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to open terminal: {e}"))
}

#[cfg(target_os = "macos")]
fn open_terminal_native(path: &str, command: &str) -> Result<(), String> {
    let script = format!(
        r#"tell application "Terminal"
            activate
            do script "cd '{}' && {}"
        end tell"#,
        path, command
    );
    std::process::Command::new("osascript")
        .args(["-e", &script])
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to open terminal: {e}"))
}

#[cfg(all(unix, not(target_os = "macos")))]
fn open_terminal_native(path: &str, command: &str) -> Result<(), String> {
    std::process::Command::new("x-terminal-emulator")
        .args(["-e", &format!("cd '{}' && {}", path, command)])
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to open terminal: {e}"))
}

async fn run_project_native(path: &str, scripts: &str, delay_seconds: u64) -> Result<Vec<u32>, String> {
    let commands: Vec<&str> = scripts
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();
    if commands.is_empty() {
        return Err("Project script is empty".to_string());
    }

    let mut pids = Vec::new();
    for (index, command) in commands.iter().enumerate() {
        if index > 0 && delay_seconds > 0 {
            tokio::time::sleep(std::time::Duration::from_secs(delay_seconds)).await;
        }
        pids.push(run_project_command(path, command)?);
    }

    Ok(pids)
}

#[cfg(target_os = "windows")]
fn run_project_command(path: &str, command: &str) -> Result<u32, String> {
    // Use "cmd /c start" to open a new visible console window, same pattern
    // as open_terminal_native. This avoids "invalid handle" errors in GUI
    // mode (exe) that occur with CREATE_NEW_CONSOLE when the parent process
    // has no console and standard handles are null.
    let child = std::process::Command::new("cmd")
        .args(["/c", "start", "", "cmd", "/k", command])
        .current_dir(path)
        .spawn()
        .map_err(|e| format!("Failed to run project: {e}"))?;

    Ok(child.id())
}

#[cfg(not(target_os = "windows"))]
fn run_project_command(path: &str, command: &str) -> Result<u32, String> {
    let child = std::process::Command::new("sh")
        .args(["-lc", command])
        .current_dir(path)
        .spawn()
        .map_err(|e| format!("Failed to run project: {e}"))?;

    Ok(child.id())
}

#[cfg(target_os = "windows")]
fn stop_project_native(pid: u32) -> Result<(), String> {
    std::process::Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to stop project: {e}"))
}

#[cfg(not(target_os = "windows"))]
fn stop_project_native(pid: u32) -> Result<(), String> {
    std::process::Command::new("kill")
        .arg(pid.to_string())
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to stop project: {e}"))
}

// ── Terminal aggregation (DWM Thumbnail) ──────────────────────────────

#[derive(serde::Serialize, Clone)]
pub struct CapturedWindow {
    pub hwnd: isize,
    pub pid: u32,
    pub title: String,
    pub thumbnail_id: isize,
    pub project_name: Option<String>,
    pub session_id: Option<String>,
}

#[cfg(target_os = "windows")]
struct ThumbnailEntry {
    source_hwnd: isize,
    thumbnail_id: isize,
    pid: u32,
    title: String,
    project_name: Option<String>,
}

#[cfg(target_os = "windows")]
static THUMBNAIL_ENTRIES: std::sync::LazyLock<Mutex<Vec<ThumbnailEntry>>> =
    std::sync::LazyLock::new(|| Mutex::new(Vec::new()));

/// Release (unregister) a DWM thumbnail.
#[tauri::command]
pub fn release_window(thumbnail_id: isize) -> Result<(), String> {
    release_window_impl(thumbnail_id)
}

#[cfg(target_os = "windows")]
fn release_window_impl(thumbnail_id: isize) -> Result<(), String> {
    use windows::Win32::Graphics::Dwm::DwmUnregisterThumbnail;

    let unregister_result = unsafe { DwmUnregisterThumbnail(thumbnail_id) }
        .map_err(|e| format!("DwmUnregisterThumbnail failed: {e}"));

    let mut entries = THUMBNAIL_ENTRIES.lock().unwrap();
    entries.retain(|e| e.thumbnail_id != thumbnail_id);

    unregister_result
}

#[cfg(not(target_os = "windows"))]
fn release_window_impl(_thumbnail_id: isize) -> Result<(), String> {
    Err("Only supported on Windows".to_string())
}

/// Release all DWM thumbnails.
#[tauri::command]
pub fn release_all_windows() -> Result<(), String> {
    release_all_impl()
}

#[cfg(target_os = "windows")]
fn release_all_impl() -> Result<(), String> {
    let entries = THUMBNAIL_ENTRIES.lock().unwrap();
    let ids: Vec<isize> = entries.iter().map(|e| e.thumbnail_id).collect();
    drop(entries);

    for id in ids {
        let _ = release_window_impl(id);
    }

    THUMBNAIL_ENTRIES.lock().unwrap().clear();
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn release_all_impl() -> Result<(), String> {
    Err("Only supported on Windows".to_string())
}

/// Get list of currently registered thumbnails.
#[tauri::command]
pub fn get_captured_windows() -> Vec<CapturedWindow> {
    get_captured_impl()
}

#[cfg(target_os = "windows")]
fn get_captured_impl() -> Vec<CapturedWindow> {
    let entries = THUMBNAIL_ENTRIES.lock().unwrap();
    entries
        .iter()
        .map(|e| CapturedWindow {
            hwnd: e.source_hwnd,
            pid: e.pid,
            title: e.title.clone(),
            thumbnail_id: e.thumbnail_id,
            project_name: e.project_name.clone(),
            session_id: None,
        })
        .collect()
}

#[cfg(not(target_os = "windows"))]
fn get_captured_impl() -> Vec<CapturedWindow> {
    vec![]
}

/// Update the destination rectangle for a DWM thumbnail (positions it within the main window).
#[tauri::command]
pub fn resize_captured_window(thumbnail_id: isize, x: i32, y: i32, w: i32, h: i32) -> Result<(), String> {
    resize_captured_impl(thumbnail_id, x, y, w, h)
}

#[cfg(target_os = "windows")]
fn resize_captured_impl(thumbnail_id: isize, x: i32, y: i32, w: i32, h: i32) -> Result<(), String> {
    use windows::Win32::Foundation::RECT;
    use windows::Win32::Graphics::Dwm::{
        DwmQueryThumbnailSourceSize, DwmUpdateThumbnailProperties, DWM_THUMBNAIL_PROPERTIES,
        DWM_TNP_OPACITY, DWM_TNP_RECTDESTINATION, DWM_TNP_RECTSOURCE,
        DWM_TNP_SOURCECLIENTAREAONLY, DWM_TNP_VISIBLE,
    };

    let source_size = unsafe { DwmQueryThumbnailSourceSize(thumbnail_id) }
        .map_err(|e| format!("DwmQueryThumbnailSourceSize failed: {e}"))?;
    let source_header_crop = if source_size.cy > 120 { 80 } else { 0 };

    let props = DWM_THUMBNAIL_PROPERTIES {
        dwFlags: DWM_TNP_RECTDESTINATION
            | DWM_TNP_RECTSOURCE
            | DWM_TNP_VISIBLE
            | DWM_TNP_OPACITY
            | DWM_TNP_SOURCECLIENTAREAONLY,
        rcDestination: RECT {
            left: x,
            top: y,
            right: x + w,
            bottom: y + h,
        },
        rcSource: RECT {
            left: 0,
            top: source_header_crop,
            right: source_size.cx,
            bottom: source_size.cy,
        },
        opacity: 255,
        fVisible: true.into(),
        fSourceClientAreaOnly: false.into(),
    };

    unsafe {
        DwmUpdateThumbnailProperties(thumbnail_id, &props)
            .map_err(|e| format!("DwmUpdateThumbnailProperties failed: {e}"))
    }
}

#[cfg(not(target_os = "windows"))]
fn resize_captured_impl(_thumbnail_id: isize, _x: i32, _y: i32, _w: i32, _h: i32) -> Result<(), String> {
    Err("Only supported on Windows".to_string())
}

/// Capture terminal windows by session IDs — matches window title containing "AAV:{session_id}:".
/// Also accepts a special mode: if session_ids is empty, captures ALL windows with "AAV:" in title.
#[tauri::command]
pub fn capture_windows_by_session_ids(app: tauri::AppHandle, session_ids: Vec<String>) -> Result<Vec<CapturedWindow>, String> {
    capture_by_session_ids_impl(app, session_ids)
}

#[cfg(target_os = "windows")]
struct AavWindow {
    hwnd: HWND,
    title: String,
    session_id: String,
    project: String,
    pid: u32,
}

#[cfg(target_os = "windows")]
fn parse_aav_window_title(title: &str) -> Option<(String, String)> {
    let aav_pos = title.find("AAV:")?;
    let before_aav = title[..aav_pos].trim();
    let after_aav = &title[aav_pos + 4..];

    // New format: "{project} · AAV:{session_id}"
    if before_aav.ends_with('·') {
        let project = before_aav
            .trim_end_matches('·')
            .trim()
            .trim_start_matches(['*', '?', ' '])
            .trim()
            .to_string();
        let session_id = after_aav.trim().to_string();
        if !session_id.is_empty() {
            return Some((session_id, project));
        }
    }

    // Old format: "AAV:{session_id}:{project}"
    let colon_pos = after_aav.find(':')?;
    let session_id = after_aav[..colon_pos].to_string();
    let project = after_aav[colon_pos + 1..].to_string();
    if session_id.is_empty() {
        None
    } else {
        Some((session_id, project))
    }
}

/// Enumerate all visible top-level windows whose title contains "AAV:" pattern.
/// Returns parsed (hwnd, title, session_id, project, window_pid).
#[cfg(target_os = "windows")]
fn collect_aav_windows() -> Vec<AavWindow> {
    use std::sync::Mutex as StdMutex;
    use windows::Win32::UI::WindowsAndMessaging::{GetWindowTextLengthW, GetWindowTextW};

    static RESULTS: std::sync::LazyLock<StdMutex<Vec<(isize, String, u32)>>> =
        std::sync::LazyLock::new(|| StdMutex::new(Vec::new()));

    RESULTS.lock().unwrap().clear();

    unsafe extern "system" fn enum_cb(hwnd: HWND, _lparam: LPARAM) -> BOOL {
        if !unsafe { IsWindowVisible(hwnd) }.as_bool() {
            return true.into();
        }

        let title_len = unsafe { GetWindowTextLengthW(hwnd) };
        if title_len == 0 {
            return true.into();
        }

        let mut buf = vec![0u16; (title_len + 1) as usize];
        let copied = unsafe { GetWindowTextW(hwnd, &mut buf) };
        let title = String::from_utf16_lossy(&buf[..copied as usize]);

        if title.contains("AAV:") {
            let mut pid = 0u32;
            unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
            RESULTS.lock().unwrap().push((hwnd.0 as isize, title, pid));
        }

        true.into()
    }

    unsafe { EnumWindows(Some(enum_cb), LPARAM(0)) }.ok();

    let raw = RESULTS.lock().unwrap().clone();
    raw.into_iter()
        .filter_map(|(hwnd_val, title, pid)| {
            let (session_id, project) = parse_aav_window_title(&title)?;
            Some(AavWindow {
                hwnd: HWND(hwnd_val as _),
                title,
                session_id,
                project,
                pid,
            })
        })
        .collect()
}

#[cfg(target_os = "windows")]
fn capture_by_session_ids_impl(app: tauri::AppHandle, session_ids: Vec<String>) -> Result<Vec<CapturedWindow>, String> {
    use tauri::Manager;
    use windows::Win32::Graphics::Dwm::DwmRegisterThumbnail;

    let _ = release_all_impl();

    let main_window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;
    let dest_hwnd = get_tauri_hwnd(&main_window)?;

    // Collect all AAV windows
    let aav_windows = collect_aav_windows();

    // Filter by session_ids if provided, otherwise capture all
    let targets: Vec<&AavWindow> = if session_ids.is_empty() {
        aav_windows.iter().collect()
    } else {
        aav_windows
            .iter()
            .filter(|w| session_ids.contains(&w.session_id))
            .collect()
    };

    let mut captured = Vec::new();

    for aav in targets {
        let source_hwnd = aav.hwnd.0 as isize;

        let thumbnail_id = match unsafe { DwmRegisterThumbnail(dest_hwnd, aav.hwnd) } {
            Ok(id) => id,
            Err(_) => continue,
        };

        let project_name = if aav.project.is_empty() {
            None
        } else {
            Some(aav.project.clone())
        };

        let entry = ThumbnailEntry {
            source_hwnd,
            thumbnail_id,
            pid: aav.pid,
            title: aav.title.clone(),
            project_name: project_name.clone(),
        };
        THUMBNAIL_ENTRIES.lock().unwrap().push(entry);

        captured.push(CapturedWindow {
            hwnd: source_hwnd,
            pid: aav.pid,
            title: aav.title.clone(),
            thumbnail_id,
            project_name,
            session_id: Some(aav.session_id.clone()),
        });
    }

    Ok(captured)
}

#[cfg(not(target_os = "windows"))]
fn capture_by_session_ids_impl(_app: tauri::AppHandle, _session_ids: Vec<String>) -> Result<Vec<CapturedWindow>, String> {
    Err("Only supported on Windows".to_string())
}

#[cfg(target_os = "windows")]
fn get_tauri_hwnd(
    window: &tauri::WebviewWindow,
) -> Result<HWND, String> {
    use raw_window_handle::HasWindowHandle;
    let handle = window
        .window_handle()
        .map_err(|e| format!("Failed to get window handle: {e}"))?;
    match handle.as_raw() {
        raw_window_handle::RawWindowHandle::Win32(h) => {
            Ok(HWND(h.hwnd.get() as _))
        }
        _ => Err("Not a Win32 window handle".to_string()),
    }
}
