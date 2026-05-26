use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};

static SYSTEM_CACHE: std::sync::LazyLock<Mutex<System>> =
    std::sync::LazyLock::new(|| Mutex::new(System::new_all()));

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionFile {
    pub pid: u32,
    pub session_id: String,
    pub cwd: String,
    pub started_at: u64,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub entrypoint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub pid: u32,
    pub session_id: String,
    pub cwd: String,
    pub project_name: String,
    pub started_at: u64,
    pub is_alive: bool,
    pub status: SessionStatus,
    pub last_activity: Option<String>,
    pub completed_at: Option<u64>,
    pub modified_files: Vec<String>,
    pub current_file: Option<String>,
    pub current_task: Option<String>,
    pub total_tokens: u64,
    pub context_percentage: u8,
    pub elapsed_seconds: u64,
    pub is_interacting: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SessionStatus {
    Working,
    NeedsInput,
    Error,
    Done,
}

fn get_claude_dir() -> PathBuf {
    crate::app_settings::resolve_claude_dir()
}

fn get_sessions_dir() -> PathBuf {
    get_claude_dir().join("sessions")
}

pub(crate) fn encode_path_to_dir_name(cwd: &str) -> String {
    cwd.replace(':', "-").replace(['/', '\\'], "-")
}

fn extract_project_name(cwd: &str) -> String {
    cwd.rsplit(['/', '\\'])
        .next()
        .unwrap_or(cwd)
        .to_string()
}

pub fn get_all_sessions() -> Vec<SessionInfo> {
    let sessions_dir = get_sessions_dir();
    let mut sessions = Vec::new();
    let mut sys = SYSTEM_CACHE.lock().unwrap();
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing());

    // Collect all session files, deduplicate by session_id (not by cwd)
    // so that multiple acode instances on the same project are all visible.
    let mut by_session_id: std::collections::HashMap<String, (SessionFile, PathBuf)> =
        std::collections::HashMap::new();

    if let Ok(entries) = fs::read_dir(&sessions_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |e| e == "json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(sf) = serde_json::from_str::<SessionFile>(&content) {
                        by_session_id.entry(sf.session_id.clone()).or_insert((sf, path));
                    }
                }
            }
        }
    }

    // Track all known session IDs (both original and resolved) for dedup
    let mut all_known_session_ids: std::collections::HashSet<String> =
        std::collections::HashSet::new();

    // Collect AAV window title statuses once (acode puts status in window title)
    let window_statuses = crate::commands::get_aav_session_statuses();

    // Build session info from deduplicated entries
    for (sf, path) in by_session_id.into_values() {
        let is_alive = sys.process(sysinfo::Pid::from_u32(sf.pid)).is_some();
        let project_name = extract_project_name(&sf.cwd);
        let dir_name = encode_path_to_dir_name(&sf.cwd);

        let session_id = sf.session_id.clone();
        all_known_session_ids.insert(session_id.clone());

        // Get conversation status
        let (
            mut status,
            last_activity,
            current_file,
            total_tokens,
            context_percentage,
            modified_files,
            mut is_interacting,
        ) = super::conversation::get_session_status(&dir_name, &session_id);

        // Override status from AAV window title if available (acode sets it)
        if let Some(title_status) = window_statuses.get(&session_id) {
            match title_status.as_str() {
                "working" => {
                    status = SessionStatus::Working;
                    is_interacting = true;
                }
                "done" => {
                    // Alive process with "done" title → show in Working with gray dot
                    status = SessionStatus::Working;
                    is_interacting = false;
                }
                "error" => {
                    status = SessionStatus::Error;
                    is_interacting = false;
                }
                "input" => {
                    status = SessionStatus::NeedsInput;
                    is_interacting = false;
                }
                _ => {}
            }
        }

        // Only allow NeedsInput if the AAV title explicitly says "input"
        if status == SessionStatus::NeedsInput
            && !window_statuses
                .get(&session_id)
                .map_or(false, |s| s == "input")
        {
            status = SessionStatus::Working;
            is_interacting = false;
        }

        let status = if !is_alive {
            SessionStatus::Done
        } else {
            status
        };
        let is_interacting = is_alive && is_interacting;

        // Get current task
        let current_task = super::tasks::get_current_task(&session_id);

        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        let elapsed_seconds = (now_ms.saturating_sub(sf.started_at)) / 1000;

        let completed_at = if status == SessionStatus::Done {
            get_modified_ms(&path)
        } else {
            None
        };

        sessions.push(SessionInfo {
            pid: sf.pid,
            session_id,
            cwd: sf.cwd,
            project_name,
            started_at: sf.started_at,
            is_alive,
            status,
            last_activity,
            completed_at,
            modified_files,
            current_file,
            current_task,
            total_tokens,
            context_percentage,
            elapsed_seconds,
            is_interacting,
        });
    }

    // Also scan for recently completed sessions from projects/ directory
    // that are no longer in sessions/ (process ended)
    scan_recent_done_sessions(&mut sessions, &all_known_session_ids);

    sessions
}

fn get_latest_project_session_id(project_dir_name: &str) -> Option<String> {
    let project_dir = get_claude_dir().join("projects").join(project_dir_name);
    let mut latest: Option<(String, std::time::SystemTime)> = None;

    let entries = fs::read_dir(project_dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() || !path.extension().map_or(false, |ext| ext == "jsonl") {
            continue;
        }

        let Some(session_id) = path.file_stem().and_then(|stem| stem.to_str()) else {
            continue;
        };
        let Ok(modified) = entry.metadata().and_then(|metadata| metadata.modified()) else {
            continue;
        };

        if latest.as_ref().map_or(true, |(_, latest_modified)| modified > *latest_modified) {
            latest = Some((session_id.to_string(), modified));
        }
    }

    latest.map(|(session_id, _)| session_id)
}

fn get_modified_ms(path: &std::path::Path) -> Option<u64> {
    path.metadata()
        .ok()?
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as u64)
}

fn scan_recent_done_sessions(
    sessions: &mut Vec<SessionInfo>,
    known_session_ids: &std::collections::HashSet<String>,
) {
    let projects_dir = get_claude_dir().join("projects");

    if let Ok(entries) = fs::read_dir(&projects_dir) {
        for entry in entries.flatten() {
            let project_path = entry.path();
            if !project_path.is_dir() {
                continue;
            }

            let dir_name = project_path
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();

            // Collect all jsonl sessions within 7 days that are NOT already known
            let mut recent: Vec<(String, PathBuf)> = Vec::new();

            if let Ok(files) = fs::read_dir(&project_path) {
                for file in files.flatten() {
                    let fp = file.path();
                    if !fp.extension().map_or(false, |e| e == "jsonl") {
                        continue;
                    }
                    let Some(session_id) = fp.file_stem().and_then(|s| s.to_str()) else {
                        continue;
                    };
                    if known_session_ids.contains(session_id) {
                        continue;
                    }
                    let Ok(metadata) = fp.metadata() else { continue };
                    let Ok(modified) = metadata.modified() else { continue };
                    let age = std::time::SystemTime::now()
                        .duration_since(modified)
                        .unwrap_or_default();
                    if age.as_secs() > 604800 {
                        continue;
                    }
                    recent.push((session_id.to_string(), fp));
                }
            }

            for (session_id, fp) in recent {
                let cwd = dir_name.replacen('-', ":", 1).replace('-', "\\");

                let (
                    _,
                    last_activity,
                    current_file,
                    total_tokens,
                    context_percentage,
                    modified_files,
                    _,
                ) = super::conversation::get_session_status(&dir_name, &session_id);

                let current_task = super::tasks::get_current_task(&session_id);
                let project_name = extract_project_name(&cwd);

                sessions.push(SessionInfo {
                    pid: 0,
                    session_id,
                    cwd,
                    project_name,
                    started_at: 0,
                    is_alive: false,
                    status: SessionStatus::Done,
                    last_activity,
                    completed_at: get_modified_ms(&fp),
                    modified_files,
                    current_file,
                    current_task,
                    total_tokens,
                    context_percentage,
                    elapsed_seconds: 0,
                    is_interacting: false,
                });
            }
        }
    }
}
