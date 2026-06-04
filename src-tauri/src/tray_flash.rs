use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{image::Image, AppHandle, Manager};
use tokio::time::{interval, Duration};

/// 托盘图标闪烁管理器
pub struct TrayFlashState {
    flashing: Arc<AtomicBool>,
}

impl TrayFlashState {
    pub fn new() -> Self {
        Self {
            flashing: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn is_flashing(&self) -> bool {
        self.flashing.load(Ordering::SeqCst)
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
