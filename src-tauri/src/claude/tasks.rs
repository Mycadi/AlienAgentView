use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

fn get_claude_dir() -> PathBuf {
    crate::app_settings::resolve_claude_dir()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskInfo {
    pub id: String,
    pub subject: String,
    #[serde(default)]
    pub description: String,
    pub status: String,
    #[serde(default)]
    pub blocks: Vec<String>,
    #[serde(default)]
    pub blocked_by: Vec<String>,
}

pub fn get_session_tasks(session_id: &str) -> Vec<TaskInfo> {
    let tasks_dir = get_claude_dir().join("tasks").join(session_id);
    let mut tasks = Vec::new();

    if !tasks_dir.exists() {
        return tasks;
    }

    if let Ok(entries) = fs::read_dir(&tasks_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |e| e == "json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(task) = serde_json::from_str::<TaskInfo>(&content) {
                        tasks.push(task);
                    }
                }
            }
        }
    }

    tasks.sort_by(|a, b| a.id.cmp(&b.id));
    tasks
}

pub fn get_current_task(session_id: &str) -> Option<String> {
    let tasks = get_session_tasks(session_id);
    // Return the first in_progress task, or the first pending task
    tasks
        .iter()
        .find(|t| t.status == "in_progress")
        .or_else(|| tasks.iter().find(|t| t.status == "pending"))
        .map(|t| t.subject.clone())
}
