use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub struct FileWatcher {
    _watcher: RecommendedWatcher,
}

impl FileWatcher {
    pub fn new(app_handle: AppHandle) -> Result<Self, notify::Error> {
        let claude_dir = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".claude");

        let (tx, rx) = mpsc::channel();

        let mut watcher = RecommendedWatcher::new(
            move |res: Result<notify::Event, notify::Error>| {
                if let Ok(event) = res {
                    let _ = tx.send(event);
                }
            },
            Config::default().with_poll_interval(Duration::from_secs(2)),
        )?;

        // Watch sessions directory for new/removed sessions
        let sessions_dir = claude_dir.join("sessions");
        if sessions_dir.exists() {
            let _ = watcher.watch(&sessions_dir, RecursiveMode::NonRecursive);
        }

        // Watch projects directory for conversation updates
        let projects_dir = claude_dir.join("projects");
        if projects_dir.exists() {
            let _ = watcher.watch(&projects_dir, RecursiveMode::Recursive);
        }

        // Watch tasks directory
        let tasks_dir = claude_dir.join("tasks");
        if tasks_dir.exists() {
            let _ = watcher.watch(&tasks_dir, RecursiveMode::Recursive);
        }

        // Debounce: emit event at most once per second
        let last_emit = Arc::new(Mutex::new(std::time::Instant::now()));
        thread::spawn(move || {
            for event in rx {
                let should_emit = match event.kind {
                    EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_) => true,
                    _ => false,
                };

                if should_emit {
                    let mut last = last_emit.lock().unwrap();
                    if last.elapsed() > Duration::from_millis(500) {
                        *last = std::time::Instant::now();
                        let _ = app_handle.emit("claude-sessions-changed", ());
                    }
                }
            }
        });

        Ok(FileWatcher {
            _watcher: watcher,
        })
    }
}
