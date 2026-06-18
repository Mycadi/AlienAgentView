use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
    Mutex,
};
use std::time::Instant;
use tauri::{image::Image, AppHandle, Manager};
use tokio::time::{interval, Duration};

/// 托盘图标闪烁管理器
pub struct TrayFlashState {
    flashing: Arc<AtomicBool>,
    /// 缓存托盘图标物理矩形 (x, y, width, height)，用于闪烁时判断虚假 Leave 事件
    tray_rect: Arc<Mutex<Option<(i32, i32, i32, i32)>>>,
    /// 弹窗应显示标志 + 上次 Enter 的时间戳，用于过滤虚假 Leave
    popup_intent: Arc<Mutex<Option<Instant>>>,
    /// Leave 延迟线程限流标志，同一时刻最多一个 Leave 线程
    leave_pending: Arc<AtomicBool>,
}

impl TrayFlashState {
    pub fn new() -> Self {
        Self {
            flashing: Arc::new(AtomicBool::new(false)),
            tray_rect: Arc::new(Mutex::new(None)),
            popup_intent: Arc::new(Mutex::new(None)),
            leave_pending: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn is_flashing(&self) -> bool {
        self.flashing.load(Ordering::SeqCst)
    }

    pub fn set_tray_rect(&self, rect: Option<(i32, i32, i32, i32)>) {
        *self.tray_rect.lock().unwrap_or_else(|e| e.into_inner()) = rect;
    }

    pub fn get_tray_rect(&self) -> Option<(i32, i32, i32, i32)> {
        self.tray_rect.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    /// 标记弹窗意图（Enter 时调用），记录时间戳
    pub fn mark_popup_enter(&self) {
        *self.popup_intent.lock().unwrap_or_else(|e| e.into_inner()) = Some(Instant::now());
    }

    /// 清除弹窗意图（真实 Leave 确认后调用）
    pub fn clear_popup_intent(&self) {
        *self.popup_intent.lock().unwrap_or_else(|e| e.into_inner()) = None;
    }

    /// 获取上次 Enter 的时间戳
    pub fn popup_enter_time(&self) -> Option<Instant> {
        *self.popup_intent.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// 尝试获取 Leave 线程许可（CAS），成功返回 true
    pub fn try_acquire_leave(&self) -> bool {
        self.leave_pending
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
    }

    /// 释放 Leave 线程许可
    pub fn release_leave(&self) {
        self.leave_pending.store(false, Ordering::SeqCst);
    }
}

/// 从文件加载空状态图标（k32x32.png 为透明/占位图标，避免程序生成黑块）
fn transparent_icon() -> Image<'static> {
    let img = image::load_from_memory(include_bytes!("../icons/k32x32.png"))
        .expect("failed to load k32x32.png")
        .to_rgba8();
    let (w, h) = img.dimensions();
    Image::new_owned(img.into_raw(), w, h)
}

#[tauri::command]
pub async fn start_tray_flash(app: AppHandle, tooltip: String) -> Result<(), String> {
    let state = app.state::<TrayFlashState>();

    // 闪烁时清空 tooltip，由弹出窗口展示详情
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(None::<&str>);
    }

    // 已经在闪烁，不重复启动定时器
    if state.flashing.swap(true, Ordering::SeqCst) {
        return Ok(());
    }

    let empty_icon = transparent_icon();
    let app_clone = app.clone();
    let flashing = state.flashing.clone();
    let tray_rect = state.tray_rect.clone();
    let popup_intent = state.popup_intent.clone();

    tokio::spawn(async move {
        let mut tick = interval(Duration::from_millis(500));
        let mut show_original = false;

        while flashing.load(Ordering::SeqCst) {
            tick.tick().await;
            if !flashing.load(Ordering::SeqCst) {
                break;
            }

            if let Some(tray) = app_clone.tray_by_id("main") {
                if show_original {
                    if let Some(icon) = app_clone.default_window_icon().cloned() {
                        let _ = tray.set_icon(Some(icon));
                    }
                } else {
                    let _ = tray.set_icon(Some(empty_icon.clone()));
                }
            }
            show_original = !show_original;

            // set_icon 可能触发虚假 Leave 事件，如果光标仍在托盘区域且弹窗已显示，
            // 刷新 Enter 时间戳以防止 Leave 延迟线程误隐藏弹窗
            let has_popup = popup_intent.lock().unwrap_or_else(|e| e.into_inner()).is_some();
            if has_popup {
                let rect = tray_rect.lock().unwrap_or_else(|e| e.into_inner()).clone();
                if let Some((rx, ry, rw, rh)) = rect {
                    let mut point = windows::Win32::Foundation::POINT { x: 0, y: 0 };
                    let _ = unsafe { windows::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut point) };
                    if point.x >= rx && point.x <= rx + rw && point.y >= ry && point.y <= ry + rh {
                        *popup_intent.lock().unwrap_or_else(|e| e.into_inner()) = Some(Instant::now());
                    }
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_tray_flash(app: AppHandle) -> Result<(), String> {
    let state = app.state::<TrayFlashState>();
    state.flashing.store(false, Ordering::SeqCst);

    // 恢复原始图标和默认 tooltip
    if let Some(tray) = app.tray_by_id("main") {
        if let Some(icon) = app.default_window_icon().cloned() {
            let _ = tray.set_icon(Some(icon));
        }
        let _ = tray.set_tooltip(Some("AlienAgentView"));
    }

    Ok(())
}

/// 如果正在闪烁则停止（供 lib.rs 内部调用）
pub fn stop_flash_if_active(app: &AppHandle) {
    let state = app.state::<TrayFlashState>();
    if state.is_flashing() {
        state.flashing.store(false, Ordering::SeqCst);
        if let Some(tray) = app.tray_by_id("main") {
            if let Some(icon) = app.default_window_icon().cloned() {
                let _ = tray.set_icon(Some(icon));
            }
            let _ = tray.set_tooltip(Some("AlienAgentView"));
        }
    }
}
