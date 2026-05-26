use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

struct PtyInstance {
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send>,
    stop_flag: Arc<AtomicBool>,
    #[allow(dead_code)]
    master: Box<dyn MasterPty + Send>,
}

pub struct PtyManager {
    instances: Mutex<HashMap<String, PtyInstance>>,
    next_id: AtomicU32,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            instances: Mutex::new(HashMap::new()),
            next_id: AtomicU32::new(1),
        }
    }
}

#[derive(Clone, serde::Serialize)]
struct PtyOutputPayload {
    id: String,
    data: Vec<u8>,
}

#[derive(Clone, serde::Serialize)]
struct PtyExitPayload {
    id: String,
}

#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    state: tauri::State<'_, PtyManager>,
    path: String,
    command: String,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open pty: {e}"))?;

    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = CommandBuilder::new("cmd");
        c.arg("/k");
        c.arg(format!("chcp 65001 >nul && {}", command));
        c
    } else {
        let mut c = CommandBuilder::new("sh");
        c.args(["-lc", &command]);
        c
    };
    cmd.cwd(&path);

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn command: {e}"))?;

    drop(pair.slave);

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to get writer: {e}"))?;

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to get reader: {e}"))?;

    let id = state
        .next_id
        .fetch_add(1, Ordering::Relaxed)
        .to_string();

    let stop_flag = Arc::new(AtomicBool::new(false));
    let stop_flag_clone = stop_flag.clone();
    let id_clone = id.clone();

    // Read PTY output in a background thread, emit events to frontend
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            if stop_flag_clone.load(Ordering::Relaxed) {
                break;
            }
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let _ = app.emit(
                        "pty-output",
                        PtyOutputPayload {
                            id: id_clone.clone(),
                            data: buf[..n].to_vec(),
                        },
                    );
                }
                Err(_) => break,
            }
        }
        let _ = app.emit("pty-exit", PtyExitPayload { id: id_clone });
    });

    let instance = PtyInstance {
        writer,
        child,
        stop_flag,
        master: pair.master,
    };

    state
        .instances
        .lock()
        .map_err(|e| format!("Lock error: {e}"))?
        .insert(id.clone(), instance);

    Ok(id)
}

#[tauri::command]
pub fn pty_write(state: tauri::State<'_, PtyManager>, id: String, data: Vec<u8>) -> Result<(), String> {
    let mut map = state.instances.lock().map_err(|e| format!("Lock error: {e}"))?;
    let instance = map.get_mut(&id).ok_or("PTY not found")?;
    instance.writer.write_all(&data).map_err(|e| format!("Write error: {e}"))?;
    instance.writer.flush().map_err(|e| format!("Flush error: {e}"))
}

#[tauri::command]
pub fn pty_resize(state: tauri::State<'_, PtyManager>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    let map = state.instances.lock().map_err(|e| format!("Lock error: {e}"))?;
    let instance = map.get(&id).ok_or("PTY not found")?;
    instance
        .master
        .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| format!("Resize error: {e}"))
}

#[tauri::command]
pub fn pty_kill(state: tauri::State<'_, PtyManager>, id: String) -> Result<(), String> {
    let mut map = state.instances.lock().map_err(|e| format!("Lock error: {e}"))?;
    if let Some(instance) = map.get_mut(&id) {
        instance.stop_flag.store(true, Ordering::Relaxed);
        let _ = instance.child.kill();
    }
    Ok(())
}

#[tauri::command]
pub fn pty_close(state: tauri::State<'_, PtyManager>, id: String) -> Result<(), String> {
    let mut map = state.instances.lock().map_err(|e| format!("Lock error: {e}"))?;
    if let Some(mut instance) = map.remove(&id) {
        instance.stop_flag.store(true, Ordering::Relaxed);
        let _ = instance.child.kill();
    }
    Ok(())
}
