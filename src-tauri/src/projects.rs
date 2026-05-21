use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct UserProjects {
    #[serde(default)]
    pub added: Vec<String>,
    #[serde(default)]
    pub hidden: Vec<String>,
    #[serde(default)]
    pub scripts: HashMap<String, String>,
    #[serde(default)]
    pub script_delays: HashMap<String, u64>,
}

fn config_file() -> Result<PathBuf, String> {
    let base = dirs::config_dir().ok_or_else(|| "Failed to locate config dir".to_string())?;
    let dir = base.join("AlienAgentView");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create config dir: {e}"))?;
    Ok(dir.join("projects.json"))
}

fn load() -> UserProjects {
    let Ok(path) = config_file() else { return UserProjects::default() };
    let Ok(text) = fs::read_to_string(&path) else { return UserProjects::default() };
    serde_json::from_str(&text).unwrap_or_default()
}

fn save(data: &UserProjects) -> Result<(), String> {
    let path = config_file()?;
    let text = serde_json::to_string_pretty(data)
        .map_err(|e| format!("Failed to serialize projects: {e}"))?;
    fs::write(&path, text).map_err(|e| format!("Failed to write projects.json: {e}"))
}

fn normalize(path: &str) -> String {
    path.trim().replace('/', "\\").trim_end_matches('\\').to_string()
}

#[tauri::command]
pub fn list_user_projects() -> UserProjects {
    load()
}

#[tauri::command]
pub fn add_user_project(path: String) -> Result<UserProjects, String> {
    let p = normalize(&path);
    if p.is_empty() {
        return Err("Path is empty".to_string());
    }
    if !PathBuf::from(&p).is_dir() {
        return Err(format!("Not a directory: {p}"));
    }
    let mut data = load();
    data.hidden.retain(|x| normalize(x) != p);
    if !data.added.iter().any(|x| normalize(x) == p) {
        data.added.push(p);
    }
    save(&data)?;
    Ok(data)
}

#[tauri::command]
pub fn remove_user_project(path: String) -> Result<UserProjects, String> {
    let p = normalize(&path);
    let mut data = load();
    data.added.retain(|x| normalize(x) != p);
    if !data.hidden.iter().any(|x| normalize(x) == p) {
        data.hidden.push(p);
    }
    save(&data)?;
    Ok(data)
}

#[tauri::command]
pub fn set_project_script(
    path: String,
    script: String,
    delay_seconds: u64,
) -> Result<UserProjects, String> {
    let p = normalize(&path);
    let mut data = load();
    let script = script.trim().to_string();
    if script.is_empty() {
        data.scripts.remove(&p);
        data.script_delays.remove(&p);
    } else {
        data.scripts.insert(p.clone(), script);
        data.script_delays.insert(p, delay_seconds);
    }
    save(&data)?;
    Ok(data)
}
